import { existsSync } from 'fs';
import { FileHandle, open, rename, rm, stat } from 'fs/promises';

type Whence = 'begin' | 'current' | 'end';

export abstract class WrappedFile {
  // exact defaults to true if unspecified
  abstract readBuf(nbytes: number, exact?: boolean): Promise<Buffer>;
  // exact defaults to true if unspecified
  abstract writeBuf(buf: Buffer, exact?: boolean): Promise<void>;
  // whence defaults to 'begin' if unspecified
  abstract seek(off: number, whence?: Whence): Promise<number>;
  abstract close(): Promise<void>;
  abstract getMTime(): Promise<Date>;

  async readUint16(): Promise<number> {
    const buf = await this.readBuf(2);
    const dv = new DataView(buf.buffer);
    return dv.getUint16(0, true);
  }
  async writeUint16(n: number): Promise<void> {
    const buf = Buffer.alloc(2);
    const dv = new DataView(buf.buffer);
    dv.setUint16(0, n, true);
    await this.writeBuf(buf);
  }
  async readUint32(): Promise<number> {
    const buf = await this.readBuf(4);
    const dv = new DataView(buf.buffer);
    return dv.getUint32(0, true);
  }
  async writeUint32(n: number): Promise<void> {
    const buf = Buffer.alloc(4);
    const dv = new DataView(buf.buffer);
    dv.setUint32(0, n, true);
    await this.writeBuf(buf);
  }
}

class NativeWrappedFile extends WrappedFile {
  private pos: number;
  constructor(private fh: FileHandle) {
    super();
    this.pos = 0;
  }
  async readBuf(nbytes: number, exact: boolean = true): Promise<Buffer> {
    const buf = Buffer.alloc(nbytes);
    const { bytesRead } = await this.fh.read({
      position: this.pos,
      buffer: buf,
    });
    const inexact = bytesRead !== nbytes;
    if (exact && inexact) {
      throw new Error(
        `expected exactly ${nbytes} to be read, but only ${bytesRead} were read`
      );
    }
    this.pos += bytesRead;
    return inexact ? buf.slice(0, bytesRead) : buf;
  }
  async writeBuf(buf: Buffer, exact: boolean = true) {
    const { bytesWritten } = await this.fh.write(buf);
    if (exact && bytesWritten !== buf.length) {
      throw new Error(
        `expected exactly ${buf.length} to be written, but only ${bytesWritten} were written`
      );
    }
    this.pos += bytesWritten;
  }
  async seek(off: number, whence: Whence = 'begin'): Promise<number> {
    switch (whence) {
      case 'begin':
        this.pos = off;
        break;
      case 'current':
        this.pos += off;
        break;
      case 'end':
        this.pos = (await this.fh.stat()).size + off;
        break;
    }
    return this.pos;
  }
  async close(): Promise<void> {
    await this.fh.close();
  }
  async getMTime(): Promise<Date> {
    return (await this.fh.stat()).mtime;
  }
}

type OpenMode = 'r' | 'w' | 'a' | 'r+' | 'w+' | 'a+';

export interface FsSource {
  openFile(path: string, openMode: OpenMode): Promise<WrappedFile>;
  getMTime(path: string): Promise<Date>;
  exists(path: string): Promise<boolean>;
  renameToReplace(src: string, tgt: string): Promise<void>;
  remove(path: string): Promise<void>;
}

export class NativeFsSource implements FsSource {
  constructor() {}
  async openFile(path: string, openMode: OpenMode): Promise<WrappedFile> {
    return new NativeWrappedFile(await open(path, openMode));
  }
  async getMTime(path: string): Promise<Date> {
    return (await stat(path)).mtime;
  }
  async exists(path: string): Promise<boolean> {
    return existsSync(path);
  }
  async renameToReplace(src: string, tgt: string): Promise<void> {
    await rename(src, tgt);
  }
  async remove(path: string): Promise<void> {
    await rm(path);
  }
}

type MockFileEntry = {
  length: number;
  buf: Buffer;
  mtime: Date;
};

const BLK_SIZE = 4096;

class MockWrappedFile extends WrappedFile {
  private pos: number;
  private ent?: MockFileEntry;
  constructor(ent: MockFileEntry, private openMode: OpenMode) {
    super();
    this.ent = ent;
    this.pos = 0;
  }
  async readBuf(nbytes: number, exact: boolean = true): Promise<Buffer> {
    if (this.openMode === 'a' || this.openMode === 'w') {
      throw new Error('cannot read a write-only file');
    }
    const { ent } = this;
    if (ent == null) {
      throw new Error('file is closed');
    }
    const copyBuf = ent.buf.slice(
      this.pos,
      Math.min(this.pos + nbytes, ent.length)
    );
    const bytesRead = copyBuf.length;
    const inexact = bytesRead !== nbytes;
    if (exact && inexact) {
      throw new Error(
        `expected exactly ${nbytes} to be read, but only ${bytesRead} were read at ${this.pos} with ent.length = ${ent.length} and bufLength = ${ent.buf.length}`
      );
    }
    const buf = Buffer.alloc(nbytes);
    copyBuf.copy(buf);
    this.pos += bytesRead;
    return buf;
  }
  async writeBuf(buf: Buffer, exact: boolean = true): Promise<void> {
    if (this.openMode === 'r') {
      throw new Error('cannot write a read-only file');
    }
    const { ent } = this;
    if (ent == null) {
      throw new Error('file is closed');
    }
    const appending = this.openMode === 'a' || this.openMode === 'a+';
    let { pos } = this;
    if (appending) {
      pos = ent.length;
    }
    if (pos + buf.length > ent.buf.length) {
      const newNeededLen = pos + buf.length;
      const rem = newNeededLen % BLK_SIZE;
      const newLen = newNeededLen - rem + +(rem > 0) * BLK_SIZE;
      const newBuf = Buffer.alloc(newLen);
      ent.buf.copy(newBuf);
      ent.buf = newBuf;
    }
    buf.copy(ent.buf, pos);
    pos += buf.length;
    ent.length = Math.max(ent.length, pos);
    this.pos = pos;
    ent.mtime = new Date();
  }
  async seek(off: number, whence: Whence = 'begin'): Promise<number> {
    const { ent } = this;
    if (ent == null) {
      throw new Error('file is closed');
    }
    let newPos = off;
    if (whence === 'current') {
      newPos += this.pos;
    } else if (whence === 'end') {
      newPos += ent.length;
    }
    if (this.openMode === 'a' && newPos !== ent.length) {
      throw new Error("doesn't do anything for append only mode");
    }
    this.pos = newPos;
    return newPos;
  }
  async close(): Promise<void> {
    const { ent } = this;
    if (ent == null) {
      throw new Error('file is closed');
    }
    // if (this.openMode !== 'r') ent.mtime = new Date();
    this.ent = undefined;
  }
  async getMTime(): Promise<Date> {
    const { ent } = this;
    if (ent == null) {
      throw new Error('file is closed');
    }
    return ent.mtime;
  }
}

export class MockFsSource implements FsSource {
  private files: Record<string, MockFileEntry>;
  constructor() {
    this.files = {};
  }
  async openFile(path: string, openMode: OpenMode): Promise<WrappedFile> {
    let ent = this.files[path];
    if (openMode === 'r') {
      if (ent == null) {
        throw { code: 'ENOENT' };
      }
    }
    if (ent == null) {
      this.files[path] = ent = {
        buf: Buffer.alloc(BLK_SIZE),
        length: 0,
        mtime: new Date(),
      };
    } else if (openMode === 'w' || openMode === 'w+') {
      ent.length = 0;
      ent.mtime = new Date();
    }
    return new MockWrappedFile(ent, openMode);
  }
  async getMTime(path: string): Promise<Date> {
    if (this.files[path] == null) {
      throw {
        code: 'ENOENT',
      };
    }
    return this.files[path].mtime;
  }
  async exists(path: string): Promise<boolean> {
    return this.files[path] != null;
  }
  dump() {
    this.files = {};
  }
  async renameToReplace(src: string, tgt: string): Promise<void> {
    this.files[tgt] = this.files[src];
    delete this.files[src];
  }
  async remove(path: string): Promise<void> {
    delete this.files[path];
  }
}
