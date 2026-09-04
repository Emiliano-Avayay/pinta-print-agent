import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Printer, RenderedTicket } from './types.js';
export class PrinterError extends Error { constructor(message: string, public readonly code = 'PRINTER_ERROR') { super(message); } }
export interface MockPrinterOptions { dataDir?: string; delayMs?: number; failure?: Error; }
export class MockPrinter implements Printer {
  calls = 0; lastTicket: RenderedTicket | undefined;
  constructor(private readonly options: MockPrinterOptions = {}) {}
  async print(ticket: RenderedTicket, jobId: string): Promise<void> { this.calls++; this.lastTicket = ticket; if (this.options.delayMs) await new Promise<void>((resolve) => setTimeout(resolve, this.options.delayMs)); if (this.options.failure) throw this.options.failure; if (this.options.dataDir) { const output = join(this.options.dataDir, 'mock-output'); mkdirSync(output, { recursive: true }); const base = `${ticket.orderNumber}_${jobId}.txt`; let target = join(output, base); let n = 1; while (existsSync(target)) target = join(output, `${ticket.orderNumber}_${jobId}_${n++}.txt`); writeFileSync(target, ticket.text, 'utf8'); } }
}
