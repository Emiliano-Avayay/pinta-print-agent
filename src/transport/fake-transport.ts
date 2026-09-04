import type { PrinterTransport } from './printer-transport.js';

export interface FakeTransportOptions {
  delayMs?: number;
  failure?: Error;
  sleep?: (milliseconds: number) => Promise<void>;
}

export class TransportStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TransportStateError';
  }
}

export class FakeTransport implements PrinterTransport {
  private readonly delayMs: number;
  private readonly failure: Error | undefined;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly capturedWrites: Uint8Array[] = [];
  private opened = false;
  private opens = 0;
  private closes = 0;
  private writeAttempts = 0;

  constructor(options: FakeTransportOptions = {}) {
    const delayMs = options.delayMs ?? 0;
    if (!Number.isFinite(delayMs) || delayMs < 0) {
      throw new RangeError('delayMs must be a non-negative finite number');
    }
    this.delayMs = delayMs;
    this.failure = options.failure;
    this.sleep = options.sleep ?? ((milliseconds) =>
      new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  }

  get isOpen(): boolean {
    return this.opened;
  }

  get openCount(): number {
    return this.opens;
  }

  get closeCount(): number {
    return this.closes;
  }

  get writeCount(): number {
    return this.writeAttempts;
  }

  get writes(): readonly Uint8Array[] {
    return this.capturedWrites.map((write) => write.slice());
  }

  async open(): Promise<void> {
    if (this.opened) throw new TransportStateError('transport is already open');
    this.opened = true;
    this.opens += 1;
  }

  async write(data: Uint8Array): Promise<void> {
    if (!this.opened) throw new TransportStateError('transport must be open before write');

    this.writeAttempts += 1;
    this.capturedWrites.push(data.slice());
    if (this.delayMs > 0) await this.sleep(this.delayMs);
    if (this.failure) throw this.failure;
  }

  async close(): Promise<void> {
    if (!this.opened) throw new TransportStateError('transport is not open');
    this.opened = false;
    this.closes += 1;
  }
}
