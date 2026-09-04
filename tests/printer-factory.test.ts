import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { loadConfig, ConfigError } from '../src/config.js';
import { ESC_POS_COMMANDS } from '../src/escpos/encoder.js';
import { parsePrintJob } from '../src/model.js';
import { MockPrinter } from '../src/printer.js';
import { createPrinterRuntime } from '../src/printer-factory.js';
import type { AgentConfig } from '../src/types.js';

const tempDirectory = (): string => mkdtempSync(join(tmpdir(), 'pinta-printer-factory-'));

const job = () => parsePrintJob({
  schema_version: 1,
  job_id: 'factory-job',
  claim_token: 'factory-claim',
  lease_expires_at: '2030-01-01T00:00:00Z',
  order: {
    number: 9,
    time: '20:30',
    items: [{ quantity: 1, name: 'Hamburguesa', removed_ingredients: [], added_extras: [], sauces: [] }],
    summary: { total_medallions: 1, cheese_counts: { cheddar: 1 }, no_cheese_count: 0 },
  },
});

test('config accepts explicit escpos-fake development settings and rejects ambiguous ones', () => {
  const directory = tempDirectory();
  const path = join(directory, 'config.json');
  const base = { server_url: 'https://example.test', agent_token: 'test-token' };
  writeFileSync(path, JSON.stringify({ ...base, printer: { driver: 'escpos-fake', profile: '58mm', supports_cut: true } }));
  assert.deepEqual(loadConfig(path).printer, { driver: 'escpos-fake', profile: '58mm', supportsCut: true });

  writeFileSync(path, JSON.stringify({ ...base, printer: { driver: 'escpos-fake' } }));
  assert.throws(() => loadConfig(path), ConfigError);
  writeFileSync(path, JSON.stringify({ ...base, printer: { driver: 'escpos-fake', profile: '80mm', supports_cut: 'yes' } }));
  assert.throws(() => loadConfig(path), ConfigError);
  writeFileSync(path, JSON.stringify({ ...base, printer: { driver: 'escpos-windows' } }));
  assert.throws(() => loadConfig(path), ConfigError);
});

test('printer runtime preserves MockPrinter and composes the escpos-fake pipeline', async () => {
  const common = { serverUrl: 'https://example.test', agentToken: 'test-token', locationId: 'pinta-main', dataDir: tempDirectory(), longPollWaitSeconds: 25, requestTimeoutMs: 40_000 };
  const mockConfig: AgentConfig = { ...common, printer: { driver: 'mock' } };
  assert.ok(createPrinterRuntime(mockConfig).printer instanceof MockPrinter);

  const escposConfig: AgentConfig = { ...common, printer: { driver: 'escpos-fake', profile: '58mm', supportsCut: true } };
  const runtime = createPrinterRuntime(escposConfig);
  const ticket = runtime.renderTicket(job());
  await runtime.printer.print(ticket, 'factory-job');

  assert.equal(runtime.profile?.columns, 32);
  assert.equal(runtime.fakeTransport?.writeCount, 1);
  assert.ok(ticket.lines.every((line) => Array.from(line.text).length <= 32));
  const bytes = runtime.fakeTransport?.writes[0];
  assert.ok(bytes);
  assert.deepEqual(bytes.slice(-ESC_POS_COMMANDS.cut.length), Uint8Array.from(ESC_POS_COMMANDS.cut));
});
