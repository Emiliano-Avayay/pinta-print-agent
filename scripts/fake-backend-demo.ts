import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HttpPrintApi } from '../src/http-client.js';
import { JobLedger } from '../src/ledger.js';
import { ConsoleLogger } from '../src/logger.js';
import { MockPrinter } from '../src/printer.js';
import { PrintWorker } from '../src/worker.js';

const rawJob = { schema_version: 1, job_id: 'demo-job', claim_token: 'demo-claim', lease_expires_at: '2026-09-03T12:00:00Z', order: { number: 146, time: '22:11', items: [{ quantity: 1, name: 'Burger Pinta', variant: 'Simple', removed_ingredients: [], added_extras: [], sauces: [] }], summary: { total_medallions: 1, cheese_counts: { cheddar: 1 }, no_cheese_count: 0 } } };
let sent = false; const acks: unknown[] = [];
const server = createServer((request, response) => { const json = (code: number, body?: unknown) => { response.writeHead(code, body ? { 'content-type': 'application/json' } : {}); response.end(body ? JSON.stringify(body) : undefined); }; if (request.url === '/api/print-agent/health') return json(200, { status: 'ok', schema_version: 1, location_id: 'pinta-main' }); if (request.url?.startsWith('/api/print-agent/jobs/next')) { if (sent) return json(204); sent = true; return json(200, rawJob); } if (request.url?.endsWith('/ack')) { let body = ''; request.on('data', (chunk) => { body += chunk; }); request.on('end', () => { acks.push(JSON.parse(body)); json(200, {}); }); return; } json(404); });
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address(); if (!address || typeof address === 'string') throw new Error('fake backend failed to bind');
const dataDir = mkdtempSync(join(tmpdir(), 'pinta-demo-')); const config = { serverUrl: `http://127.0.0.1:${address.port}`, agentToken: 'demo-token', locationId: 'pinta-main', dataDir, longPollWaitSeconds: 25, requestTimeoutMs: 40000, printer: { driver: 'mock' as const } }; const api = new HttpPrintApi(config); const ledger = new JobLedger(join(dataDir, 'agent.sqlite')); const printer = new MockPrinter({ dataDir }); const worker = new PrintWorker(config, api, printer, ledger, new ConsoleLogger());
try { await api.health(); const job = await api.nextJob(); assert(job); await worker.processJob(job); assert.equal(printer.calls, 1); assert.deepEqual(acks, [{ claim_token: 'demo-claim', result: 'printed' }]); console.log('FakeBackend flow verified: health -> long poll -> print -> SQLite -> ACK'); } finally { api.close(); ledger.close(); await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
