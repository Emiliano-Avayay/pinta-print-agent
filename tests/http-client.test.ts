import assert from 'node:assert/strict';
import test from 'node:test';
import { HttpError, HttpPrintApi } from '../src/http-client.js';
import type { AgentConfig } from '../src/types.js';
import { FakeHttpBackend } from './fake-backend.js';
const config = (serverUrl: string): AgentConfig => ({ serverUrl, agentToken: 'not-logged', locationId: 'pinta-main', dataDir: '.', longPollWaitSeconds: 25, requestTimeoutMs: 1000, printer: { driver: 'mock' } });
const job = { schema_version: 1, job_id: 'http-job', claim_token: 'A', lease_expires_at: '2026-09-03T12:00:00Z', order: { number: 1, time: '12:00', items: [{ quantity: 1, name: 'x', removed_ingredients: [], added_extras: [], sauces: [] }], summary: { total_medallions: 1, cheese_counts: { cheddar: 1 }, no_cheese_count: 0 } } };
test('HTTP fake backend covers health, 204, job, ACK, and stale claim', async () => { const backend = new FakeHttpBackend(); const url = await backend.start(); const api = new HttpPrintApi(config(url)); try { await api.health(); assert.equal(await api.nextJob(), undefined); backend.next.push({ status: 200, body: job }); const received = await api.nextJob(); assert.equal(received?.job_id, 'http-job'); await api.ackPrinted(received!); assert.deepEqual(backend.receivedAcks, [{ claim_token: 'A', result: 'printed' }]); backend.ack.push({ status: 409 }); await assert.rejects(() => api.ackPrinted(received!), (error: unknown) => error instanceof HttpError && error.kind === 'CONFLICT'); } finally { api.close(); await backend.close(); } });
