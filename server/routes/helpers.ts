import { pbkdf2, randomBytes, timingSafeEqual } from 'crypto';
import { Request, Response } from 'express';
import { open, rename, rm } from 'fs/promises';
import { resolve } from 'path';
import { promisify } from 'util';
import { serverConfig, SERVER_DATA_LOCATION } from '../consts';
import { KeyedShareableLock } from '../utils/KeyedShareableLock';
import { WrappedFile } from '../utils/WrappedFile';

export const pbkdf2Promise = promisify(pbkdf2);

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
}

export function sanitizeHex(str: string) {
  if (typeof str !== 'string') return false;
  if (str.length & 1) return false;
  for (let i = 0; i < str.length; ++i) {
    const ch = str.charAt(i);
    if (!/[0-9A-Fa-f]/.test(ch)) {
      return false;
    }
  }
  return true;
}

export const sanitizePassword = sanitizeHex;

export function doServerAuth(req: Request, res: Response): boolean {
  const server = Buffer.from(serverConfig.ServerAccessPassword, 'utf8');
  const client = Buffer.from(<string>req.query.server_pass, 'utf8');
  if (server.length !== client.length || !timingSafeEqual(server, client)) {
    res.status(400).json({
      type: 'E_AUTH',
      query_param: 'server_pass',
      message: 'bad server access password',
    });
    return false;
  }
  return true;
}

export function getUsernameStr(req: Request, res: Response): string | null {
  const username = <string>req.query.username;
  if (!sanitizeUsername(username)) {
    res.status(400).json({
      type: 'E_AUTH',
      query_param: 'username',
      message: 'bad username characters',
    });
    return null;
  }
  return username;
}

export function getPassword(req: Request, res: Response): Buffer | null {
  const passwordHex = <string>req.query.password;
  if (!sanitizePassword(passwordHex)) {
    res.status(400).json({
      type: 'E_AUTH',
      query_param: 'password',
      message: 'bad password characters',
    });
    return null;
  }
  return Buffer.from(passwordHex, 'hex');
}

export function getNewPass(req: Request, res: Response): Buffer | null {
  const newPassHex = <string>req.query.new_pass;
  if (!sanitizePassword(newPassHex)) {
    res.status(400).json({
      type: 'E_AUTH',
      query_param: 'new_pass',
      message: 'bad password characters',
    });
    return null;
  }
  return Buffer.from(newPassHex, 'hex');
}

export function getBinaryBodyData(req: Request, res: Response): Buffer | null {
  const [contentType] = (
    req.header('content-type') || 'application/json'
  ).split(';');
  if (contentType.toLowerCase() === 'application/octet-stream') {
    return Buffer.from(req.body);
  }
  if (contentType.toLowerCase() !== 'application/json') {
    res.status(400).json({
      type: 'E_INVAL',
      message: 'invalid content-type header',
      contentTypeOptions: ['application/json', 'application/octet-stream'],
    });
    return null;
  }
  const data = req.body;
  if (data == null) {
    res.status(400).json({
      type: 'E_INVAL',
      message: 'POST request body must be json with one key: "data"',
    });
    return null;
  }
  if (typeof data !== 'object' || data instanceof Array) {
    res.status(400).json({
      type: 'E_INVAL',
      message: 'POST request body must be json with one key: "data"',
    });
    return null;
  }
  const badKeys = Object.keys(data).filter((x) => x !== 'data');
  if (badKeys.length) {
    res.status(400).json({
      type: 'E_INVAL',
      keys: badKeys,
      message: 'unexpected keys in json object request body',
    });
    return null;
  }
  if (!sanitizeHex(data.data)) {
    res.status(400).json({
      type: 'E_INVAL',
      message:
        'POST request body must be json with one key: "data" which must be a hexadecimal string',
    });
    return null;
  }
  return Buffer.from(data.data, 'hex');
}

export function parseDateHeader(header: string): Date | null {
  const parsed =
    /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), ([012][0-9]|3[01]) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{4}) ([01][0-9]|2[0-3]):([0-5][0-9]):([0-5][0-9]) GMT$/.exec(
      header
    );
  if (parsed == null) {
    return null;
  }
  const [whole, day, date, month, year, hours, minutes, seconds] = parsed;
  const monthIndices = {
    Jan: 0,
    Feb: 1,
    Mar: 2,
    Apr: 3,
    May: 4,
    Jun: 5,
    Jul: 6,
    Aug: 7,
    Sep: 8,
    Oct: 9,
    Nov: 10,
    Dec: 11,
  };
  try {
    return new Date(
      +year,
      monthIndices[month],
      +date,
      +hours,
      +minutes,
      +seconds
    );
  } catch (exc) {
    return null;
  }
}

export function getConditions(
  req: Request,
  res: Response
): { ifUnmodifiedSince?: Date; ifModifiedSince?: Date } | null {
  const unsupportedConditionsAttempted = [
    'if-range',
    'if-match',
    'if-none-match',
  ].filter((header) => req.header(header) != null);
  if (unsupportedConditionsAttempted.length) {
    res.status(400).json({
      type: 'E_UNSUPPORTED_CONDITIONAL_HEADER',
      message: 'unsupported conditional header was specified',
      unsupportedConditionsAttempted,
    });
    return null;
  }
  const ifUnmodifiedSinceHeader = req.header('if-unmodified-since');
  const ifModifiedSinceHeader = req.header('if-modified-since');
  const result: ReturnType<typeof getConditions> = {};
  const failures: string[] = [];
  if (ifModifiedSinceHeader != null) {
    const parsed = parseDateHeader(ifModifiedSinceHeader);
    if (parsed != null) {
      result.ifModifiedSince = parsed;
    } else {
      failures.push('if-modified-since');
    }
  }
  if (ifUnmodifiedSinceHeader != null) {
    const parsed = parseDateHeader(ifUnmodifiedSinceHeader);
    if (parsed != null) {
      result.ifUnmodifiedSince = parsed;
    } else {
      failures.push('if-unmodified-since');
    }
  }
  if (failures.length) {
    res.status(400).json({
      type: 'E_INVAL_CONDITIONAL_HEADER',
      invalidConditionalHeaders: failures,
    });
    return null;
  }
  return result;
}

export function getUserInfo(username: string) {
  const path = resolve(SERVER_DATA_LOCATION, username);
  return {
    path,
  };
}

const userLock = new KeyedShareableLock();

export abstract class User {
  static versionRegistry: (new () => User)[] = [];
  static async getUser(f: WrappedFile): Promise<User> {
    const version = await f.readUint32();
    const Cls = this.versionRegistry[version];
    const instance = new Cls();
    await instance.loadHeader(f);
    return instance;
  }
  static async getNewUser(): Promise<User> {
    const LatestUser = this.versionRegistry[this.versionRegistry.length - 1];
    return new LatestUser();
  }
  protected abstract loadHeader(f: WrappedFile): Promise<void>;
  abstract loadBody(f: WrappedFile): Promise<void>;
  abstract getVersion(): number;
  abstract verifyPassword(testPassword: Buffer): Promise<boolean>;
  abstract setPassword(newPassword: Buffer): Promise<void>;
  abstract getDataBuffer(): Promise<Buffer>;
  abstract putDataBuffer(buf: Buffer): Promise<void>;
  async save(f: WrappedFile): Promise<void> {
    await f.seek(0);
    await f.writeUint32(this.getVersion());
  }
}

class Version0User extends User {
  pbkdf2Settings = {
    iterations: 100000,
    keylen: 32,
    saltlen: 32,
    hash: 'sha256',
  };
  saltBuf: Buffer;
  hashBuf: Buffer;
  loadedState: 'none' | 'header' | 'full';
  dataBuf: Buffer;

  constructor() {
    super();
    this.loadedState = 'none';
  }
  async loadHeader(f: WrappedFile): Promise<void> {
    if (this.loadedState !== 'none') {
      throw new Error('Cannot load header again');
    }
    const saltLen = await f.readUint16();
    const hashLen = await f.readUint16();
    this.saltBuf = await f.readBuf(saltLen);
    this.hashBuf = await f.readBuf(hashLen);
    this.loadedState = 'header';
  }
  async loadBody(f: WrappedFile): Promise<void> {
    if (this.loadedState === 'none') {
      throw new Error('Cannot load body since not header loaded');
    }
    const bodySize = await f.readUint32();
    this.dataBuf = await f.readBuf(bodySize);
    this.loadedState = 'full';
  }
  getVersion(): number {
    return 0;
  }
  async verifyPassword(testPassword: Buffer): Promise<boolean> {
    if (this.loadedState === 'none') {
      throw new Error('Cannot verify since not header loaded');
    }
    const testHashBuf = await pbkdf2Promise(
      testPassword,
      this.saltBuf,
      this.pbkdf2Settings.iterations,
      this.pbkdf2Settings.keylen,
      this.pbkdf2Settings.hash
    );
    return timingSafeEqual(this.hashBuf, testHashBuf);
  }
  async setPassword(newPassword: Buffer): Promise<void> {
    const { iterations, keylen, saltlen, hash } = this.pbkdf2Settings;
    this.saltBuf = randomBytes(saltlen);
    this.hashBuf = await pbkdf2Promise(
      newPassword,
      this.saltBuf,
      iterations,
      keylen,
      hash
    );
    if (this.loadedState === 'none') {
      this.loadedState = 'header';
    }
  }
  async getDataBuffer(): Promise<Buffer> {
    if (this.loadedState !== 'full') {
      throw new Error('Data Buffer unavailable since not fully loaded');
    }
    return this.dataBuf;
  }
  async putDataBuffer(buf: Buffer): Promise<void> {
    if (this.loadedState === 'none') {
      throw new Error('Cannot set body since not header loaded');
    }
    this.loadedState = 'full';
    this.dataBuf = buf;
  }
  async save(f: WrappedFile): Promise<void> {
    if (this.loadedState !== 'full') {
      throw new Error('cannot save if not fully loaded');
    }
    await super.save(f);
    await f.writeUint16(this.saltBuf.length);
    await f.writeUint16(this.hashBuf.length);
    await f.writeBuf(this.saltBuf);
    await f.writeBuf(this.hashBuf);
    await f.writeUint32(this.dataBuf.length);
    await f.writeBuf(this.dataBuf);
  }
}
User.versionRegistry[0] = Version0User;

type State = { responded: boolean; completed: boolean };

type OperateRead = (
  user: User,
  state: State,
  readable: WrappedFile
) => Promise<void>;

type OperateReadWrite = (
  user: User,
  state: State,
  readable: WrappedFile,
  writeable: WrappedFile
) => Promise<void>;

type OperateWrite = (
  user: User,
  state: State,
  writeable: WrappedFile
) => Promise<void>;

export async function getUserDataBufferV2({
  path,
  password,
  authErr,
  ...options
}: {
  path: string;
  password: Buffer;
  authErr: (state: State, err?: any) => Promise<void>;
} & (
  | {
      type: 'read';
      operate: OperateRead;
    }
  | {
      type: 'write';
      operate: OperateReadWrite;
      conditions: NonNullable<ReturnType<typeof getConditions>>;
      preconditionErr: (
        state: Parameters<OperateReadWrite>[1],
        preconditionChecksFailed: string[]
      ) => Promise<void>;
    }
  | { type: 'new'; operate: OperateWrite }
)): Promise<void> {
  const state = { responded: false, completed: false };
  let lockAcquired = false;
  let authenticated = false;
  let authenticationThrewError = false;
  try {
    if (options.type === 'new') {
      await userLock.acquire(path, 'exclusive');
      const writeable = new WrappedFile(await open(path, 'w'));
      try {
        const user = await User.getNewUser();
        options.operate(user, state, writeable);
      } finally {
        await writeable.fh.close();
      }
    } else {
      const readable = new WrappedFile(await open(path, 'r'));
      try {
        const readAndWriteCommon = async () => {
          lockAcquired = true;
          const user = await User.getUser(readable);
          authenticationThrewError = true;
          const verified = await user.verifyPassword(password);
          authenticationThrewError = false;
          if (!verified) {
            throw new Error('invalid username or password');
          }
          authenticated = true;
          return user;
        };
        if (options.type === 'write') {
          await userLock.acquire(path, 'exclusive');
          const writeable = new WrappedFile(await open(`${path} new`, 'w'));
          try {
            const user = await readAndWriteCommon();
            const { ifModifiedSince, ifUnmodifiedSince } = options.conditions;
            if (ifModifiedSince != null || ifUnmodifiedSince != null) {
              const failures: string[] = [];
              const { mtime } = await readable.fh.stat();
              if (
                ifModifiedSince != null &&
                mtime.getTime() <= ifModifiedSince.getTime()
              ) {
                failures.push('if-modified-since');
              }
              if (
                ifUnmodifiedSince != null &&
                mtime.getTime() > ifUnmodifiedSince.getTime()
              ) {
                failures.push('if-unmodified-since');
              }
              if (failures.length) {
                await options.preconditionErr(state, failures);
                return;
              }
            }
            await options.operate(user, state, readable, writeable);
          } finally {
            await writeable.fh.close();
          }
        } else {
          await userLock.acquire(path, 'shared');
          const user = await readAndWriteCommon();
          await options.operate(user, state, readable);
        }
      } finally {
        await readable.fh.close();
      }
    }
  } catch (exc) {
    if (options.type === 'write' && !state.completed) {
      await rm(path);
      await rename(`${path} new`, path);
      state.completed = true;
    }
    if (!authenticated && !authenticationThrewError) {
      await authErr(state);
    } else {
      await authErr(state, exc);
    }
  } finally {
    if (!state.completed) {
      if (options.type !== 'read') {
        await rm(path);
      }
      if (options.type === 'write') {
        await rename(`${path} new`, path);
      }
      state.completed = true;
    }
    if (lockAcquired) {
      userLock.release(path, options.type !== 'read' ? 'exclusive' : 'shared');
    }
    if (!state.responded) {
      console.warn('WARN: operate function did not respond');
    }
  }
}
