import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defaultConfigPath, defaultDataDir } from './runtime-paths.js';
import type { AgentConfig, PrinterConfig, UsbPrinterSettings } from './types.js';

export class ConfigError extends Error {}
const asText = (v: unknown, name: string): string => { if (typeof v !== 'string' || !v.trim()) throw new ConfigError(`${name} is required`); return v.trim(); };
const positive = (v: unknown, name: string, fallback: number): number => { if (v === undefined) return fallback; if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) throw new ConfigError(`${name} must be positive`); return v; };
const boolean = (v: unknown, name: string, fallback: boolean): boolean => { if (v === undefined) return fallback; if (typeof v !== 'boolean') throw new ConfigError(`${name} must be boolean`); return v; };

const object = (v: unknown, name: string): Record<string, unknown> => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new ConfigError(`${name} is required`);
  return v as Record<string, unknown>;
};
const profile = (v: unknown): '58mm' | '80mm' => {
  if (v !== '58mm' && v !== '80mm') throw new ConfigError('printer.profile must be "58mm" or "80mm"');
  return v;
};
const parseUsb = (v: unknown): UsbPrinterSettings => ({ printerName: asText(object(v, 'printer.usb').printer_name, 'printer.usb.printer_name') });

const rejectLegacySerialSettings = (printer: Record<string, unknown>): void => {
  if (printer.bluetooth !== undefined || printer.port !== undefined || printer.baud_rate !== undefined) {
    throw new ConfigError('Bluetooth and serial printer settings are not supported; configure printer.mode "usb" and printer.usb.printer_name');
  }
};

function parsePrinterConfig(value: unknown): PrinterConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ConfigError('printer is required');
  const printer = value as Record<string, unknown>;
  // `driver` is the explicit backwards-compatible spelling from the ESC/POS foundation.
  if (printer.mode !== undefined && printer.driver !== undefined) throw new ConfigError('printer.mode and printer.driver cannot both be set');
  if (printer.mode === 'bluetooth') throw new ConfigError('printer.mode "bluetooth" is not supported; use "usb" with printer.usb.printer_name');
  rejectLegacySerialSettings(printer);
  if (printer.mode === undefined && printer.driver === 'mock') return { driver: 'mock' };
  if (printer.mode === undefined && printer.driver === 'escpos-fake') return { driver: 'escpos-fake', profile: profile(printer.profile), supportsCut: boolean(printer.supports_cut, 'printer.supports_cut', false) };
  const mode = printer.mode;
  if (mode === 'mock') return { mode: 'mock' };
  if (mode === 'escpos-fake') return { mode, profile: profile(printer.profile), supportsCut: boolean(printer.supports_cut, 'printer.supports_cut', false) };
  if (mode !== 'usb') throw new ConfigError('printer.mode must be "mock", "usb", or "escpos-fake"');
  if (printer.usb === undefined) throw new ConfigError('printer.usb is required when printer.mode is "usb"');
  return { mode, profile: profile(printer.profile), supportsCut: boolean(printer.supports_cut, 'printer.supports_cut', false), usb: parseUsb(printer.usb) };
}

export { defaultDataDir } from './runtime-paths.js';
export function parseConfig(raw: unknown, env: NodeJS.ProcessEnv = process.env): AgentConfig {
  if (!raw || typeof raw !== 'object') throw new ConfigError('config must be an object');
  const x = raw as Record<string, unknown>;
  const serverUrl = asText(x.server_url, 'server_url').replace(/\/$/, '');
  let parsedServerUrl: URL;
  try { parsedServerUrl = new URL(serverUrl); } catch { throw new ConfigError('server_url must be an absolute URL'); }
  if (parsedServerUrl.protocol !== 'http:' && parsedServerUrl.protocol !== 'https:') throw new ConfigError('server_url must use http:// or https://');
  const printerConfig = parsePrinterConfig(x.printer);
  return { serverUrl, agentToken: asText(x.agent_token, 'agent_token'), locationId: typeof x.location_id === 'string' && x.location_id ? x.location_id : 'pinta-main', dataDir: typeof x.data_dir === 'string' && x.data_dir ? resolve(x.data_dir) : defaultDataDir(env), longPollWaitSeconds: positive(x.long_poll_wait_seconds, 'long_poll_wait_seconds', 25), requestTimeoutMs: positive(x.request_timeout_seconds, 'request_timeout_seconds', 40) * 1000, printer: printerConfig };
}

export function loadConfig(path = process.env.PINTA_PRINT_AGENT_CONFIG || defaultConfigPath(), env: NodeJS.ProcessEnv = process.env): AgentConfig {
  let raw: unknown;
  try { raw = JSON.parse(readFileSync(resolve(path), 'utf8')); } catch (error) { throw new ConfigError(`Cannot load config: ${(error as Error).message}`); }
  return parseConfig(raw, env);
}
