import assert from 'node:assert/strict';
import test from 'node:test';
import { HEALTH_SCHEMA_VERSION, HttpError, HttpPrintApi } from '../src/http-client.js';
import type { AgentConfig } from '../src/types.js';
import { FakeHttpBackend } from './fake-backend.js';
const config = (serverUrl: string): AgentConfig => ({ serverUrl, agentToken: 'not-logged', locationId: 'pinta-main', dataDir: '.', longPollWaitSeconds: 25, requestTimeoutMs: 1000, printer: { driver: 'mock' } });
const job = { schema_version: 1, job_id: 'http-job', claim_token: 'A', lease_expires_at: '2026-09-03T12:00:00Z', order: { number: 1, time: '12:00', items: [{ quantity: 1, name: 'x', removed_ingredients: [], added_extras: [], sauces: [] }], summary: { total_medallions: 1, cheese_counts: { cheddar: 1 }, no_cheese_count: 0 } } };
const assertProtocol = async (action: () => Promise<unknown>) => assert.rejects(action, (error: unknown) => error instanceof HttpError && error.kind === 'PROTOCOL' && error.message === 'invalid health response');

test('HTTP fake backend accepts health schema 2, then covers 204, job, ACK, and stale claim', async () => { const backend = new FakeHttpBackend(); const url = await backend.start(); const api = new HttpPrintApi(config(url)); try { await api.health(); assert.equal(HEALTH_SCHEMA_VERSION, 2); assert.equal(await api.nextJob(), undefined); backend.next.push({ status: 200, body: job }); const received = await api.nextJob(); assert.equal(received?.job_id, 'http-job'); await api.ackPrinted(received!); assert.deepEqual(backend.receivedAcks, [{ claim_token: 'A', result: 'printed' }]); backend.ack.push({ status: 409 }); await assert.rejects(() => api.ackPrinted(received!), (error: unknown) => error instanceof HttpError && error.kind === 'CONFLICT'); } finally { api.close(); await backend.close(); } });

test('health rejects old, future, wrong-location, and wrong-status contracts', async () => { const backend = new FakeHttpBackend(); const url = await backend.start(); const api = new HttpPrintApi(config(url)); try {
  for (const body of [
    { status: 'ok', schema_version: 1, location_id: 'pinta-main' },
    { status: 'ok', schema_version: 3, location_id: 'pinta-main' },
    { status: 'ok', schema_version: 2, location_id: 'another-location' },
    { status: 'degraded', schema_version: 2, location_id: 'pinta-main' },
  ]) { backend.health = { status: 200, body }; await assertProtocol(() => api.health()); }
} finally { api.close(); await backend.close(); } });

test('HTTP status classes and invalid JSON retain their error kinds', async () => {
  for (const [status, kind] of [[401, 'AUTH'], [403, 'DISABLED'], [409, 'CONFLICT'], [429, 'TEMPORARY'], [500, 'TEMPORARY']] as const) {
    const api = new HttpPrintApi(config('http://unused.invalid'), async () => new Response('', { status }));
    await assert.rejects(() => api.health(), (error: unknown) => error instanceof HttpError && error.kind === kind);
  }
  const api = new HttpPrintApi(config('http://unused.invalid'), async () => new Response('not JSON', { status: 200 }));
  await assert.rejects(() => api.health(), (error: unknown) => error instanceof HttpError && error.kind === 'PROTOCOL' && error.message === 'invalid JSON response');
});
