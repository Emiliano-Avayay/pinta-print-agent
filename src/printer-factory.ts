import { EscPosEncoder } from './escpos/encoder.js';
import {
  createPrinterProfile,
  DEVELOPMENT_PROFILE_58MM,
  DEVELOPMENT_PROFILE_80MM,
  type PrinterProfile,
} from './escpos/profile.js';
import { EscPosPrinter } from './escpos-printer.js';
import { MockPrinter } from './printer.js';
import { renderKitchenTicket } from './renderer.js';
import { FakeTransport } from './transport/fake-transport.js';
import type { AgentConfig, PrintJob, Printer, RenderedTicket } from './types.js';

export interface PrinterRuntime {
  printer: Printer;
  renderTicket: (job: PrintJob) => RenderedTicket;
  profile?: PrinterProfile;
  fakeTransport?: FakeTransport;
}

export function createPrinterRuntime(config: AgentConfig): PrinterRuntime {
  if (config.printer.driver === 'mock') {
    return { printer: new MockPrinter({ dataDir: config.dataDir }), renderTicket: renderKitchenTicket };
  }

  const baseProfile = config.printer.profile === '58mm' ? DEVELOPMENT_PROFILE_58MM : DEVELOPMENT_PROFILE_80MM;
  const profile = createPrinterProfile(baseProfile, { supportsCut: config.printer.supportsCut });
  const fakeTransport = new FakeTransport();
  const printer = new EscPosPrinter(new EscPosEncoder(profile), fakeTransport);
  return {
    printer,
    profile,
    fakeTransport,
    renderTicket: (job) => renderKitchenTicket(job, { columns: profile.columns }),
  };
}
