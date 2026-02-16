export class BinReader {
  private off = 0;
  constructor(private buf: Uint8Array) {}

  private ensure(n: number) {
    if (this.off + n > this.buf.length) throw new Error("BinReader: out of range");
  }

  u32le(): number {
    this.ensure(4);
    const b0 = this.buf[this.off++];
    const b1 = this.buf[this.off++];
    const b2 = this.buf[this.off++];
    const b3 = this.buf[this.off++];
    return (b0 | (b1<<8) | (b2<<16) | (b3<<24)) >>> 0;
  }

  bytes(n: number): Uint8Array {
    this.ensure(n);
    const out = this.buf.slice(this.off, this.off + n);
    this.off += n;
    return out;
  }

  str(): string {
    const n = this.u32le();
    const b = this.bytes(n);
    return new TextDecoder().decode(b);
  }

  remaining(): number {
    return this.buf.length - this.off;
  }
}
