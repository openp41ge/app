/**
 * OutputBuffer — fixed-capacity ring buffer for streaming output.
 *
 * O(1) append via write(). When at capacity, the oldest line is silently
 * overwritten. The read() method returns a slice of lines starting from
 * `start`, up to `count` lines.
 *
 * Use case: terminal output, log streams, AI streaming responses — where
 * total output can far exceed what the DOM should render (1000s of lines).
 * Combined with VirtualScroll, DOM nodes stay at viewport-size regardless
 * of buffer.totalLines.
 *
 * @example
 * const buf = new OutputBuffer(100);
 * buf.write("line 1");
 * buf.write("line 2");
 * buf.read(0, 10) // ["line 1", "line 2"]
 * buf.totalLines // 2
 * buf.clear();
 * buf.totalLines // 0
 */

export class OutputBuffer {
  private buffer: string[];
  private head: number = 0;
  private count: number = 0;
  readonly capacity: number;

  constructor(capacity: number = 1000) {
    if (capacity <= 0) {
      throw new Error("OutputBuffer capacity must be positive");
    }
    this.capacity = capacity;
    this.buffer = new Array(capacity);
  }

  /**
   * Append a line. O(1). Overwrites the oldest line if at capacity.
   */
  write(line: string): void {
    this.buffer[this.head] = line;
    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) {
      this.count++;
    }
  }

  /**
   * Read up to `count` lines starting from `start`.
   * Lines are returned in chronological order (oldest first).
   * Returns fewer lines if fewer are available.
   */
  read(start: number, count: number): string[] {
    const result: string[] = [];
    for (let i = 0; i < count && start + i < this.count; i++) {
      // Map logical index to physical index in the ring buffer.
      // The oldest logical line (index 0) is at physical index
      // (head - count + capacity) % capacity.
      const idx = (this.head - this.count + start + i + this.capacity) % this.capacity;
      result.push(this.buffer[idx]);
    }
    return result;
  }

  /**
   * Total number of lines written (capped at capacity).
   */
  get totalLines(): number {
    return this.count;
  }

  /**
   * Read a single line at the given index, or undefined if out of range.
   */
  getLine(index: number): string | undefined {
    if (index < 0 || index >= this.count) {
      return undefined;
    }
    const idx = (this.head - this.count + index + this.capacity) % this.capacity;
    return this.buffer[idx];
  }

  /**
   * Reset the buffer. All data is discarded.
   */
  clear(): void {
    this.head = 0;
    this.count = 0;
  }
}
