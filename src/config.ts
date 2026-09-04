import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import type { AgentConfig, PrinterConfig } from './types.js';

export class ConfigError extends Error {}
const asText = (v: unknown, name: string): string => { if (typeof v !== 'string' || !v.trim()) throw new ConfigError(`${name} is required`); return v.trim(); };
const positive = (v: unknown, name: string, fallback: number): number => { if (v === undefined) return fallback; if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) throw new ConfigError(`${name} must be positive`); return v; };
const boolean = (v: unknown, name: string, fallback: boolean): boolean => { if (v === undefined) return fallback; if (typeof v !== 'boolean') throw new ConfigError(`${name} must be boolean`); return v; };

function parsePrinterConfig(value: unknown): PrinterConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ConfigError('printer is required');
  const printer = value as Record<string, unknown>;
  if (printer.driver === 'mock') return { driver: 'mock' };
  if (printer.driver !== 'escpos-fake') throw new ConfigError('printer.driver must be "mock" or "escpos-fake"');
  if (printer.profile !== '58mm' && printer.profile !== '80mm') throw new ConfigError('printer.profile must be "58mm" or "80mm"');
  return { driver: 'escpos-fake', profile: printer.profile, supportsCut: boolean(printer.supports_cut, 'printer.supports_cut', false) };
}

export function defaultDataDir(env: NodeJS.ProcessEnv = process.env): string {
  return join(env.LOCALAPPDATA || join(homedir(), '.local'), 'PintaPrintAgent');
}
export function loadConfig(path = process.env.PINTA_PRINT_AGENT_CONFIG || join(defaultDataDir(), 'config.json'), env: NodeJS.ProcessEnv = process.env): AgentConfig {
  let raw: unknown;
  try { raw = JSON.parse(readFileSync(resolve(path), 'utf8')); } catch (error) { throw new ConfigError(`Cannot load config: ${(error as Error).message}`); }
  if (!raw || typeof raw !== 'object') throw new ConfigError('config must be an object');
  const x = raw as Record<string, unknown>;
  const serverUrl = asText(x.server_url, 'server_url').replace(/\/$/, '');
  try { new URL(serverUrl); } catch { throw new ConfigError('server_url must be an absolute URL'); }
  const printerConfig = parsePrinterConfig(x.printer);
  return { serverUrl, agentToken: asText(x.agent_token, 'agent_token'), locationId: typeof x.location_id === 'string' && x.location_id ? x.location_id : 'pinta-main', dataDir: typeof x.data_dir === 'string' && x.data_dir ? resolve(x.data_dir) : defaultDataDir(env), longPollWaitSeconds: positive(x.long_poll_wait_seconds, 'long_poll_wait_seconds', 25), requestTimeoutMs: positive(x.request_timeout_seconds, 'request_timeout_seconds', 40) * 1000, printer: printerConfig };
}
