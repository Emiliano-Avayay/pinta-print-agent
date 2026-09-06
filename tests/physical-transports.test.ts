import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { ConfigError, loadConfig } from '../src/config.js';
import { EscPosPrinter } from '../src/escpos-printer.js';
import { EscPosEncoder } from '../src/escpos/encoder.js';
import { DEVELOPMENT_PROFILE_80MM } from '../src/escpos/profile.js';
import { createPrinterRuntime } from '../src/printer-factory.js';
import { BluetoothSerialTransport, type SerialPortLike } from '../src/transport/bluetooth-serial-transport.js';
import { WindowsRawPrinterTransport, type RawPrinterSpooler } from '../src/transport/windows-raw-printer-transport.js';
import type { AgentConfig } from '../src/types.js';

const directory = () => mkdtempSync(join(tmpdir(), 'pinta-physical-'));
const base = { server_url: 'https://example.test', agent_token: 'token' };
const readPrinter = (printer: object) => { const path = join(directory(), 'config.json'); writeFileSync(path, JSON.stringify({ ...base, printer })); return loadConfig(path).printer; };
const common: Omit<AgentConfig, 'printer'> = { serverUrl: 'https://example.test', agentToken: 'token', locationId: 'pinta-main', dataDir: directory(), longPollWaitSeconds: 25, requestTimeoutMs: 40_000 };

test('configuration parses mock, USB, and Bluetooth while retaining inactive blocks', () => {
  assert.deepEqual(readPrinter({ mode: 'mock' }), { mode: 'mock' });
  assert.deepEqual(readPrinter({ mode: 'usb', profile: '80mm', supports_cut: true, usb: { printer_name: 'Pinta POS' }, bluetooth: { port: 'COM7', baud_rate: 19200 } }), { mode: 'usb', profile: '80mm', supportsCut: true, usb: { printerName: 'Pinta POS' }, bluetooth: { port: 'COM7', baudRate: 19200 } });
  assert.deepEqual(readPrinter({ mode: 'bluetooth', profile: '58mm', bluetooth: { port: 'COM12', baud_rate: 9600 } }), { mode: 'bluetooth', profile: '58mm', supportsCut: false, bluetooth: { port: 'COM12', baudRate: 9600 } });
});

test('configuration rejects incomplete physical settings and ambiguous mode/driver', () => {
  assert.throws(() => readPrinter({ mode: 'usb', profile: '80mm' }), ConfigError);
  assert.throws(() => readPrinter({ mode: 'usb', profile: '80mm', usb: { printer_name: '' } }), ConfigError);
  assert.throws(() => readPrinter({ mode: 'bluetooth', profile: '80mm', bluetooth: { port: 'COM5', baud_rate: 0 } }), ConfigError);
  assert.throws(() => readPrinter({ mode: 'mock', driver: 'mock' }), ConfigError);
});

test('factory selects physical transport solely from mode', () => {
  const usb = createPrinterRuntime({ ...common, printer: { mode: 'usb', profile: '80mm', supportsCut: true, usb: { printerName: 'Named Printer' } } });
  const bluetooth = createPrinterRuntime({ ...common, printer: { mode: 'bluetooth', profile: '80mm', supportsCut: false, bluetooth: { port: 'COM8', baudRate: 115200 } } });
  assert.ok(usb.transport instanceof WindowsRawPrinterTransport);
  assert.ok(bluetooth.transport instanceof BluetoothSerialTransport);
});

test('Windows RAW transport sends exactly the supplied bytes to the configured printer', async () => {
  const calls: Array<{ name: string; bytes: Uint8Array }> = [];
  const spooler: RawPrinterSpooler = { writeRaw: async (name, bytes) => { calls.push({ name, bytes }); } };
  const transport = new WindowsRawPrinterTransport({ printerName: 'Pinta POS', spooler, platform: 'win32' });
  const bytes = Uint8Array.of(0x1b, 0x40, 0x00, 0xff);
  await transport.open(); await transport.write(bytes); await transport.close();
  assert.equal(calls[0]?.name, 'Pinta POS'); assert.deepEqual(calls[0]?.bytes, bytes);
});

class TestSerialPort implements SerialPortLike {
  isOpen = false; writes: Uint8Array[] = []; closed = 0;
  constructor(private readonly failures: Partial<Record<'open' | 'write' | 'drain' | 'close', Error>> = {}) {}
  open(callback: (error?: Error | null) => void): void { const error = this.failures.open; if (!error) this.isOpen = true; callback(error); }
  write(data: Uint8Array, callback: (error?: Error | null) => void): void { this.writes.push(data); callback(this.failures.write); }
  drain(callback: (error?: Error | null) => void): void { callback(this.failures.drain); }
  close(callback: (error?: Error | null) => void): void { this.closed += 1; const error = this.failures.close; if (!error) this.isOpen = false; callback(error); }
}

test('Bluetooth SPP transport uses configured COM port and baud rate, drains, and closes', async () => {
  let settings: unknown; const port = new TestSerialPort();
  const transport = new BluetoothSerialTransport({ port: 'COM19', baudRate: 57600, factory: (value) => { settings = value; return port; } });
  await transport.open(); await transport.write(Uint8Array.of(1, 2, 3)); await transport.close();
  assert.deepEqual(settings, { port: 'COM19', baudRate: 57600 });
  assert.deepEqual(port.writes, [Uint8Array.of(1, 2, 3)]); assert.equal(port.closed, 1);
});

test('physical transport failures propagate and EscPosPrinter-compatible cleanup can close serial ports', async () => {
  const opening = new BluetoothSerialTransport({ port: 'COM2', baudRate: 9600, factory: () => new TestSerialPort({ open: new Error('not paired') }) });
  await assert.rejects(() => opening.open(), /not paired/);
  const port = new TestSerialPort({ write: new Error('link lost') });
  const writing = new BluetoothSerialTransport({ port: 'COM3', baudRate: 9600, factory: () => port });
  await writing.open(); await assert.rejects(() => writing.write(Uint8Array.of(9)), /link lost/); await writing.close();
  assert.equal(port.closed, 1);
  const raw = new WindowsRawPrinterTransport({ printerName: 'Pinta POS', platform: 'win32', spooler: { writeRaw: async () => { throw new Error('spooler offline'); } } });
  await raw.open(); await assert.rejects(() => raw.write(Uint8Array.of(1)), /spooler offline/); await raw.close();
});

test('EscPosPrinter closes Bluetooth serial transport when its write fails', async () => {
  const port = new TestSerialPort({ write: new Error('write failed') });
  const transport = new BluetoothSerialTransport({ port: 'COM4', baudRate: 9600, factory: () => port });
  const printer = new EscPosPrinter(new EscPosEncoder(DEVELOPMENT_PROFILE_80MM), transport);
  await assert.rejects(() => printer.print({ orderNumber: 1, text: 'x', lines: [{ text: 'x', align: 'left', bold: false, size: 'normal' }] }, 'job'), /write failed/);
  assert.equal(port.closed, 1);
  assert.equal(port.isOpen, false);
});
