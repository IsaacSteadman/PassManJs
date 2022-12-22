import { pbkdf2, randomBytes, timingSafeEqual } from 'crypto';
import { resolve } from 'path';
import { promisify } from 'util';
import { SERVER_DATA_LOCATION } from '../consts';
import type { WrappedFile } from './WrappedFile';

export function getUserInfo(username: string) {
  const path = resolve(SERVER_DATA_LOCATION, username);
  return {
    path,
  };
}

export const pbkdf2Promise = promisify(pbkdf2);

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
