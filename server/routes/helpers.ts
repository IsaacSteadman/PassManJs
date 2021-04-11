import { readFileSync, existsSync, readFile, writeFile, promises as fsPromises } from 'fs';
import { promisify } from 'util';
import { resolve, join } from 'path';
import { Request, Response } from "express";
import { createHash, pbkdf2, randomBytes, pbkdf2Sync, timingSafeEqual } from 'crypto';
import { SERVER_DATA_LOCATION, serverConfig, DEBUG } from '../consts';

export const {
  readFile: readFilePromise,
  writeFile: writeFilePromise,
  stat: statPromise,
} = fsPromises;
export const pbkdf2Promise = promisify(pbkdf2);

export const versionSettings = [
  {
    getAdditionalParams: function (buf: Buffer, off: number) {
      return { params: [], off: off }
    },
    putAdditionalParams: function (buf: Buffer, off: number, params: any[]): number {
      return off;
    },
    sizeAdditionalParams: function (params: any[]): number {
      return 0;
    },
    pbkdf2Settings: function (params: any[]) {
      return {
        iterations: 100000,
        keylen: 32,
        hash: 'sha256'
      }
    }
  }
];

export function sanitizeUsername(name: string) {
  if (typeof name !== 'string') return false;
  if (name === '.') return false;
  if (name === '..') return false;
  for (let i = 0; i < name.length; ++i) {
    const ch = name.charAt(i);
    if (!/[A-Za-z0-9_\.$\-]/.test(ch)) {
      return false;
    }
  }
  return true;
};

export function sanitizeHex(str: string) {
  if (typeof str !== 'string') return false;
  if (str.length & 1) return false;
  for (let i = 0; i < str.length; ++i) {
    const ch = str.charAt(i);
    if (!/[0-9A-Fa-f]/.test(ch)) {
      return false;
    }
  }
  return true
};

export const sanitizePassword = sanitizeHex;

export function doServerAuth(req: Request, res: Response) {
  const server = Buffer.from(serverConfig.ServerAccessPassword, 'utf8');
  const client = Buffer.from(<string>req.query.server_pass, 'utf8');
  if (server.length !== client.length || !timingSafeEqual(server, client)) {
    res.status(400).json({ type: 'E_AUTH', query_param: 'server_pass', message: 'bad server access password' });
    return false;
  }
  return true;
}

export function getUsernameStr(req: Request, res: Response): string {
  const username = <string>req.query.username;
  if (!sanitizeUsername(username)) {
    res.status(400).json({ type: 'E_AUTH', query_param: 'username', message: 'bad username characters' });
    return null;
  }
  return username;
}

export function getPassword(req: Request, res: Response): Buffer {
  const passwordHex = <string>req.query.password;
  if (!sanitizePassword(passwordHex)) {
    res.status(400).json({ type: 'E_AUTH', query_param: 'password', message: 'bad password characters' });
    return null;
  }
  return Buffer.from(passwordHex, 'hex');
}

export function getNewPass(req: Request, res: Response): Buffer {
  const newPassHex = <string>req.query.new_pass;
  if (!sanitizePassword(newPassHex)) {
    res.status(400).json({ type: 'E_AUTH', query_param: 'new_pass', message: 'bad password characters' });
    return null;
  }
  return Buffer.from(newPassHex, 'hex');
}

export function getBinaryBodyData(req: Request, res: Response): Buffer {
  const data = req.body;
  if (data == null) {
    res.status(400).json({ type: 'E_INVAL', message: 'POST request body must be json with one key: "data"' });
    return null;
  } else if (typeof data !== 'object' || data instanceof Array) {
    res.status(400).json({ type: 'E_INVAL', message: 'POST request body must be json with one key: "data"' });
    return null;
  }
  const badKeys = Object.keys(data).filter(x => x !== 'data');
  if (badKeys.length) {
    res.status(400).json({ type: 'E_INVAL', keys: badKeys, message: 'unexpected keys in json object request body' });
    return null;
  } else if (!sanitizeHex(data.data)) {
    res.status(400).json({ type: 'E_INVAL', message: 'POST request body must be json with one key: "data" which must be a hexadecimal string' });
    return null;
  }
  return Buffer.from(data.data, 'hex');
}

export function getUserInfo(username: string) {
  const path = resolve(SERVER_DATA_LOCATION, username)
  return {
    path: path
  };
}

export interface UserDataBuffer {
  version: number;
  salt: Buffer;
  hash: Buffer;
  data: Buffer;
  remainder: Buffer;
  totalLen: number;
  header: Buffer;
  params: any[];
  timestamp: string;
}

export class Lock {
  resolves: ((value?: any) => void)[];
  acquired: boolean;
  constructor() {
    this.acquired = false;
    this.resolves = [];
  }
  async acquire() {
    if (!this.acquired) {
      this.acquired = true;
      return;
    }
    await new Promise(resolve => {
      this.resolves.push(resolve);
    });
  }
  release() {
    if (this.resolves.length) {
      this.resolves.shift()();
    } else {
      this.acquired = false;
    }
  }
}

const pathLocks: { [path: string]: Lock } = {};

export function getPathLock(path: string): Lock {
  let lock = pathLocks[path];
  if (lock == null) {
    lock = pathLocks[path] = new Lock();
  }
  return lock;
}

export async function getUserDataBuffer(path: string, password: Buffer, acquireLock: boolean = false): Promise<UserDataBuffer> {
  let lock = acquireLock ? getPathLock(path) : null;
  try {
    if (lock) await lock.acquire();
    const buf = await readFilePromise(path);
    const st = await statPromise(path);
    const timestamp = st.mtime.toUTCString();
    if (DEBUG) console.log('buf.buffer =', buf.buffer);
    const dv = new DataView(buf.buffer);
    const version = dv.getUint32(0, true);
    if (version !== 0) {
      if (lock) {
        lock.release();
        lock = null;
      }
      return Promise.reject({ type: 'E_BAD_VER', version: version });
    }
    const { getAdditionalParams, pbkdf2Settings } = versionSettings[version];
    let off = 4;
    const { params, off: off1 } = getAdditionalParams(buf, off);
    off = off1;
    const { iterations, keylen, hash: hashFn } = pbkdf2Settings(params);
    const saltLen = dv.getUint16(off, true);
    off += 2;
    const hashLen = dv.getUint16(off, true);
    off += 2;
    const end = off + saltLen + hashLen;
    if (DEBUG) {
      console.log('saltLen =', saltLen);
      console.log('hashLen =', hashLen);
    }
    const salt = buf.slice(off, off + saltLen);
    const hash = buf.slice(off + saltLen, end);
    const testHash = await pbkdf2Promise(password, salt, iterations, keylen, hashFn);
    if (timingSafeEqual(hash, testHash)) {
      const dataLen = dv.getUint32(end, true);
      return {
        params,
        version,
        salt,
        hash,
        header: buf.slice(0, end),
        data: buf.slice(end + 4, end + 4 + dataLen),
        remainder: buf.slice(end + 4 + dataLen),
        totalLen: buf.length,
        timestamp,
      };
    }
    else {
      if (lock) {
        lock.release();
        lock = null;
      }
      return Promise.reject({ type: 'E_AUTH' });
    }
  } catch (exc) {
    lock.release();
    lock = null;
    throw exc;
  }
};
