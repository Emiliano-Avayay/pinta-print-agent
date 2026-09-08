import { loadConfig } from './config.js';
import { parsePrintJob } from './model.js';
import { createPrinterRuntime, type PrinterRuntime } from './printer-factory.js';
import type { AgentConfig, PrintJob, PrinterConfig, RenderedTicket } from './types.js';

export interface PrinterTestDependencies {
  loadConfig: (path?: string) => AgentConfig;
  createRuntime: (config: AgentConfig) => Pick<PrinterRuntime, 'printer' | 'renderTicket'>;
}

const defaultDependencies: PrinterTestDependencies = { loadConfig, createRuntime: createPrinterRuntime };

export function createPrinterDiagnosticJob(): PrintJob {
  return parsePrintJob({
    schema_version: 1,
    job_id: 'local-printer-test',
    claim_token: 'local-printer-test-only',
    lease_expires_at: '2099-01-01T00:00:00Z',
    order: {
      number: 999,
      time: '20:30',
      items: [
        { quantity: 1, name: 'Golden', variant: 'Doble', removed_ingredients: ['cebolla'], added_extras: ['medallon extra'], sauces: [] },
        { quantity: 2, name: 'Lomito', variant: 'Completo', removed_ingredients: [], added_extras: [], sauces: [] },
      ],
      summary: { total_medallions: 3, cheese_counts: { cheddar: 3 }, no_cheese_count: 0 },
    },
  });
}

export function assertUsbPrinterTestConfig(config: AgentConfig): asserts config is AgentConfig & { printer: Extract<PrinterConfig, { mode: 'usb' }> } {
  if (!('mode' in config.printer) || config.printer.mode !== 'usb') {
    throw new Error('printer:test requires printer.mode = "usb". It never uses the backend or local ledger.');
  }
}

export function renderPrinterDiagnosticTicket(config: AgentConfig, job = createPrinterDiagnosticJob()): { ticket: RenderedTicket; job: PrintJob } {
  const runtime = createPrinterRuntime(config);
  const rendered = runtime.renderTicket(job);
  const footer = { text: 'PRUEBA PINTA NEXUSPOS NX80', align: 'center' as const, bold: false, size: 'normal' as const };
  return { job, ticket: { ...rendered, lines: [...rendered.lines, footer], text: `${rendered.text}\n${footer.text}` } };
}

/** Performs only one local RAW print; it does not create a worker, ledger, or HTTP client. */
export async function runPrinterTest(configPath?: string, dependencies: PrinterTestDependencies = defaultDependencies): Promise<void> {
  const config = dependencies.loadConfig(configPath);
  assertUsbPrinterTestConfig(config);
  const runtime = dependencies.createRuntime(config);
  const job = createPrinterDiagnosticJob();
  const rendered = runtime.renderTicket(job);
  const footer = { text: 'PRUEBA PINTA NEXUSPOS NX80', align: 'center' as const, bold: false, size: 'normal' as const };
  const ticket = { ...rendered, lines: [...rendered.lines, footer], text: `${rendered.text}\n${footer.text}` };
  await runtime.printer.print(ticket, job.job_id);
  console.log(`Local printer test sent to Windows printer: ${config.printer.usb.printerName}`);
}
