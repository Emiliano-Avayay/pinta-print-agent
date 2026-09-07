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
import type { PrinterTransport } from './transport/printer-transport.js';
import { WindowsRawPrinterTransport } from './transport/windows-raw-printer-transport.js';
import type { AgentConfig, PrintJob, Printer, RenderedTicket } from './types.js';

export interface PrinterRuntime {
  printer: Printer;
  renderTicket: (job: PrintJob) => RenderedTicket;
  profile?: PrinterProfile;
  fakeTransport?: FakeTransport;
  transport?: PrinterTransport;
}

export function createPrinterRuntime(config: AgentConfig): PrinterRuntime {
  const printerConfig = config.printer;
  const mode = 'mode' in printerConfig ? printerConfig.mode : printerConfig.driver;
  if (mode === 'mock') {
    return { printer: new MockPrinter({ dataDir: config.dataDir }), renderTicket: renderKitchenTicket };
  }
  const escposConfig = printerConfig as Exclude<typeof printerConfig, { mode: 'mock' } | { driver: 'mock' }>;

  const baseProfile = escposConfig.profile === '58mm' ? DEVELOPMENT_PROFILE_58MM : DEVELOPMENT_PROFILE_80MM;
  const profile = createPrinterProfile(baseProfile, { supportsCut: escposConfig.supportsCut });
  let transport: FakeTransport | WindowsRawPrinterTransport;
  if (!('mode' in escposConfig) || escposConfig.mode === 'escpos-fake') transport = new FakeTransport();
  else transport = new WindowsRawPrinterTransport({ printerName: escposConfig.usb.printerName });
  const printer = new EscPosPrinter(new EscPosEncoder(profile), transport);
  return {
    printer,
    profile,
    fakeTransport: transport instanceof FakeTransport ? transport : undefined,
    transport,
    renderTicket: (job) => renderKitchenTicket(job, { columns: profile.columns }),
  };
}
