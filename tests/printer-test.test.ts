import assert from 'node:assert/strict';
import test from 'node:test';
import { EscPosEncoder, ESC_POS_COMMANDS } from '../src/escpos/encoder.js';
import { PROVISIONAL_PROFILE_80MM } from '../src/escpos/profile.js';
import { assertUsbPrinterTestConfig, createPrinterDiagnosticJob, renderPrinterDiagnosticTicket, runPrinterTest } from '../src/printer-test.js';
import { renderKitchenTicket } from '../src/renderer.js';
import type { AgentConfig, RenderedTicket } from '../src/types.js';

const usbConfig: AgentConfig = {
  serverUrl: 'https://example.test', agentToken: 'test-token', locationId: 'pinta-main', dataDir: '/tmp/pinta-printer-test', longPollWaitSeconds: 25, requestTimeoutMs: 40_000,
  printer: { mode: 'usb', profile: '80mm', supportsCut: true, usb: { printerName: 'Windows thermal printer' } },
};

test('local printer diagnostic uses a USB-only 80 mm ticket with cut enabled', () => {
  assert.doesNotThrow(() => assertUsbPrinterTestConfig(usbConfig));
  const { ticket, job } = renderPrinterDiagnosticTicket(usbConfig);
  assert.equal(job.order.number, 999);
  assert.match(ticket.text, /GOLDEN/);
  assert.match(ticket.text, /MEDALLONES: 3/);
  assert.match(ticket.text, /PRUEBA PINTA TP85K/);
  assert.equal(ticket.lines[1]?.size, 'double');
  assert.equal(ticket.lines.at(-1)?.align, 'center');
  const bytes = new EscPosEncoder({ ...PROVISIONAL_PROFILE_80MM, supportsCut: true }).encode(ticket);
  assert.deepEqual(bytes.slice(-ESC_POS_COMMANDS.cut.length), Uint8Array.from(ESC_POS_COMMANDS.cut));
});

test('local printer diagnostic refuses non-USB configurations before any print', () => {
  assert.throws(() => assertUsbPrinterTestConfig({ ...usbConfig, printer: { mode: 'mock' } }), /printer\.mode = "usb"/);
  assert.equal(createPrinterDiagnosticJob().job_id, 'local-printer-test');
});

test('local printer diagnostic only renders and prints; it has no backend or ledger step', async () => {
  const printed: Array<{ ticket: RenderedTicket; jobId: string }> = [];
  await runPrinterTest(undefined, {
    loadConfig: () => usbConfig,
    createRuntime: () => ({
      renderTicket: (job) => renderKitchenTicket(job, { columns: 48 }),
      printer: { print: async (ticket, jobId) => { printed.push({ ticket, jobId }); } },
    }),
  });
  assert.equal(printed.length, 1);
  assert.equal(printed[0]?.jobId, 'local-printer-test');
  assert.match(printed[0]?.ticket.text ?? '', /PRUEBA PINTA TP85K/);
});
