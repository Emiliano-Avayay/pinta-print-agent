import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { ConfigError, loadConfig } from '../src/config.js';
import { EscPosPrinter } from '../src/escpos-printer.js';
import { EscPosEncoder } from '../src/escpos/encoder.js';
import { NEXUSPOS_NX80_PROFILE_80MM } from '../src/escpos/profile.js';
import { createPrinterRuntime } from '../src/printer-factory.js';
import { WindowsRawPrinterTransport, type RawPrinterSpooler } from '../src/transport/windows-raw-printer-transport.js';
import type { AgentConfig } from '../src/types.js';

const directory = () => mkdtempSync(join(tmpdir(), 'pinta-physical-'));
const base = { server_url: 'https://example.test', agent_token: 'token' };
const readPrinter = (printer: object) => { const path = join(directory(), 'config.json'); writeFileSync(path, JSON.stringify({ ...base, printer })); return loadConfig(path).printer; };
const common: Omit<AgentConfig, 'printer'> = { serverUrl: 'https://example.test', agentToken: 'token', locationId: 'pinta-main', dataDir: directory(), longPollWaitSeconds: 25, requestTimeoutMs: 40_000 };

test('configuration parses mock and USB', () => {
  assert.deepEqual(readPrinter({ mode: 'mock' }), { mode: 'mock' });
  assert.deepEqual(readPrinter({ mode: 'usb', profile: '80mm', supports_cut: true, usb: { printer_name: 'Pinta POS' } }), { mode: 'usb', profile: '80mm', supportsCut: true, usb: { printerName: 'Pinta POS' } });
});

test('configuration rejects incomplete physical settings and ambiguous mode/driver', () => {
  assert.throws(() => readPrinter({ mode: 'usb', profile: '80mm' }), /printer\.usb is required when printer\.mode is "usb"/);
  assert.throws(() => readPrinter({ mode: 'usb', profile: '80mm', usb: { printer_name: '' } }), /printer\.usb\.printer_name is required/);
  assert.throws(
    () => readPrinter({ mode: 'bluetooth', profile: '80mm', bluetooth: { port: 'COM5', baud_rate: 9600 } }),
    /printer\.mode "bluetooth" is not supported/,
  );
  assert.throws(
    () => readPrinter({ mode: 'usb', profile: '80mm', supports_cut: true, bluetooth: { port: 'COM5' }, usb: { printer_name: 'Pinta POS' } }),
    /Bluetooth and serial printer settings are not supported/,
  );
  assert.throws(() => readPrinter({ mode: 'mock', driver: 'mock' }), ConfigError);
});

test('factory selects Windows RAW transport for USB', () => {
  const usb = createPrinterRuntime({ ...common, printer: { mode: 'usb', profile: '80mm', supportsCut: true, usb: { printerName: 'Named Printer' } } });
  assert.ok(usb.transport instanceof WindowsRawPrinterTransport);
});

test('Windows RAW transport sends exactly the supplied bytes to the configured printer', async () => {
  const calls: Array<{ name: string; bytes: Uint8Array }> = [];
  const spooler: RawPrinterSpooler = { writeRaw: async (name, bytes) => { calls.push({ name, bytes }); } };
  const transport = new WindowsRawPrinterTransport({ printerName: 'Pinta POS', spooler, platform: 'win32' });
  const bytes = Uint8Array.of(0x1b, 0x40, 0x00, 0xff);
  await transport.open(); await transport.write(bytes); await transport.close();
  assert.equal(calls[0]?.name, 'Pinta POS'); assert.deepEqual(calls[0]?.bytes, bytes);
});

test('Windows RAW transport failures propagate', async () => {
  const raw = new WindowsRawPrinterTransport({ printerName: 'Pinta POS', platform: 'win32', spooler: { writeRaw: async () => { throw new Error('spooler offline'); } } });
  await raw.open(); await assert.rejects(() => raw.write(Uint8Array.of(1)), /spooler offline/); await raw.close();
});

test('EscPosPrinter closes Windows RAW transport when its write fails', async () => {
  const transport = new WindowsRawPrinterTransport({ printerName: 'Pinta POS', platform: 'win32', spooler: { writeRaw: async () => { throw new Error('write failed'); } } });
  const printer = new EscPosPrinter(new EscPosEncoder(NEXUSPOS_NX80_PROFILE_80MM), transport);
  await assert.rejects(() => printer.print({ orderNumber: 1, text: 'x', lines: [{ text: 'x', align: 'left', bold: false, size: 'normal' }] }, 'job'), /write failed/);
  await assert.rejects(() => transport.close(), /not open/);
});
