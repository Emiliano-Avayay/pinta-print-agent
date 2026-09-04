import type { EscPosEncoder } from './escpos/encoder.js';
import { PrinterError } from './printer.js';
import type { PrinterTransport } from './transport/printer-transport.js';
import type { Printer, RenderedTicket } from './types.js';

const toPrinterError = (error: unknown): PrinterError => {
  if (error instanceof PrinterError) return error;
  const message = error instanceof Error ? error.message : String(error);
  return new PrinterError(message, 'PRINTER_TRANSPORT_ERROR');
};

export class EscPosPrinter implements Printer {
  constructor(
    private readonly encoder: EscPosEncoder,
    private readonly transport: PrinterTransport,
  ) {}

  async print(ticket: RenderedTicket, jobId: string): Promise<void> {
    void jobId;
    let data: Uint8Array;
    try {
      data = this.encoder.encode(ticket);
    } catch (error) {
      throw toPrinterError(error);
    }

    let opened = false;
    let failed = false;
    let primaryError: unknown;

    try {
      await this.transport.open();
      opened = true;
      await this.transport.write(data);
    } catch (error) {
      failed = true;
      primaryError = error;
    } finally {
      if (opened) {
        try {
          await this.transport.close();
        } catch (error) {
          if (!failed) {
            failed = true;
            primaryError = error;
          }
        }
      }
    }

    if (failed) throw toPrinterError(primaryError);
  }
}
