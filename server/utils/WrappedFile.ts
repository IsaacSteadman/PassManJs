import type { FileHandle } from 'fs/promises';

export class WrappedFile {
  private pos: number;
  constructor(public fh: FileHandle) {
    this.pos = 0;
  }
  async readBuf(nbytes: number, exact: boolean = true) {
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
  async seek(
    off: number,
    whence: 'begin' | 'currrent' | 'end' = 'begin'
  ): Promise<number> {
    switch (whence) {
      case 'begin':
        this.pos = off;
        break;
      case 'currrent':
        this.pos += off;
        break;
      case 'end':
        this.pos = (await this.fh.stat()).size + off;
        break;
    }
    return this.pos;
  }
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
