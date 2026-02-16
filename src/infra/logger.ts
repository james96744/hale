// Zero-disk logging: in-memory ring buffer + console (optional)
export class RingLogger {
  private buf: string[] = [];
  constructor(private max = 2000) {}

  log(line: string) {
    const msg = `${new Date().toISOString()} ${line}`;
    this.buf.push(msg);
    if (this.buf.length > this.max) this.buf.shift();
    // eslint-disable-next-line no-console
    console.log(msg);
  }

  snapshot() {
    return [...this.buf];
  }
}
