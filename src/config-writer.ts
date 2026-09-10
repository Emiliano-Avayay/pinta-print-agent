import { chmodSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseConfig } from './config.js';
import type { AgentConfig } from './types.js';

export interface EditableConfig {
  serverUrl: string;
  locationId: string;
  agentToken: string;
  printerName: string;
}

export function toConfigDocument(input: EditableConfig): Record<string, unknown> {
  return {
    server_url: input.serverUrl.trim().replace(/\/$/, ''),
    agent_token: input.agentToken.trim(),
    printer: { mode: 'usb', profile: '80mm', supports_cut: true, usb: { printer_name: input.printerName.trim() } },
    location_id: input.locationId.trim() || 'pinta-main',
    data_dir: '',
    long_poll_wait_seconds: 25,
    request_timeout_seconds: 40,
  };
}

/** Validates against the production schema and atomically replaces the persistent config. */
export function writeConfigAtomically(path: string, input: EditableConfig, env: NodeJS.ProcessEnv = process.env): AgentConfig {
  const document = toConfigDocument(input);
  const config = parseConfig(document, env);
  const target = resolve(path);
  mkdirSync(dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
  try {
    writeFileSync(temporary, `${JSON.stringify(document, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    try { chmodSync(temporary, 0o600); } catch { /* Windows ACLs are set by the installer script. */ }
    renameSync(temporary, target);
  } finally { try { rmSync(temporary, { force: true }); } catch { /* A stale temp file cannot replace config.json. */ } }
  return config;
}
