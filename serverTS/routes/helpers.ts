import { readFileSync, existsSync, readFile, writeFile } from 'fs';
import { promisify } from 'util';
import { resolve, join } from 'path';
import { Request, Response } from "express";
import { createHash, pbkdf2, randomBytes, pbkdf2Sync } from 'crypto';

export const readFilePromise = promisify(readFile);
export const writeFilePromise = promisify(writeFile);
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
        iterations: 10000,
        keylen: 256,
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

const serverConfig = JSON.parse(readFileSync(resolve(__dirname, '../../config.json'), 'utf8'));

export function doServerAuth(req: Request, res: Response) {
  if (serverConfig.ServerAccessPassword !== req.query.server_pass) {
    res.status(400).json({ type: 'E_AUTH', query_param: 'server_pass', message: 'bad server access password' });
    return false;
  }
  return true;
}

export function getUsernameStr(req: Request, res: Response): string {
  const username = req.query.username;
  if (!sanitizeUsername(username)) {
    res.status(400).json({ type: 'E_AUTH', query_param: 'username', message: 'bad username characters' });
    return null;
  }
  return username;
}

export function getPassword(req: Request, res: Response): Buffer {
  const passwordHex = req.query.password;
  if (!sanitizePassword(passwordHex)) {
    res.status(400).json({ type: 'E_AUTH', query_param: 'password', message: 'bad password characters' });
    return null;
  }
  return Buffer.from(passwordHex, 'hex');
}

export function getNewPass(req: Request, res: Response): Buffer {
  const newPassHex = req.query.new_pass;
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
    res.status(400).json({type: 'E_INVAL', keys: badKeys, message: 'unexpected keys in json object request body'});
    return null;
  } else if (!sanitizeHex(data.data)) {
    res.status(400).json({ type: 'E_INVAL', message: 'POST request body must be json with one key: "data" which must be a hexadecimal string' });
    return null;
  }
  return Buffer.from(data.data, 'hex');
}

export function getUserInfo (username: string) {
  const path = resolve(__dirname, '../../serverData', username)
  return {
    path: path
  };
}

export async function getUserDataBuffer(path: string, password: Buffer): Promise<{ version: number, salt: Buffer, hash: Buffer, data: Buffer, remainder: Buffer, totalLen: number, header: Buffer, params: any[] }> {
  const buf = await readFilePromise(path);
  const dv = new DataView(buf);
  const version = dv.getUint32(0, true);
  if (version !== 0) {
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
  const salt = buf.slice(off, off + saltLen);
  const hash = buf.slice(off + saltLen, end);
  const testHash = await pbkdf2Promise(password, salt, iterations, keylen, hashFn);
  if (hash.equals(testHash)) {
    const dataLen = dv.getUint32(end, true);
    return {
      params: params,
      version: version,
      salt: salt, hash: hash,
      header: buf.slice(0, end),
      data: buf.slice(end + 4, end + 4 + dataLen),
      remainder: buf.slice(end + 4 + dataLen),
      totalLen: buf.length
    };
  }
  else {
    return Promise.reject({ type: 'E_AUTH' });
  }
};
