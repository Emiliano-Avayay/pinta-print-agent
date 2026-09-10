import { createServer, type Server } from 'node:http';
export interface PlannedResponse { status: number; body?: unknown }
export class FakeHttpBackend {
  health: PlannedResponse = { status: 200, body: { status: 'ok', schema_version: 2, location_id: 'pinta-main' } };
  readonly next: PlannedResponse[] = [];
  readonly ack: PlannedResponse[] = [];
  readonly receivedAcks: unknown[] = [];
  private server: Server | undefined;
  async start(): Promise<string> { this.server = createServer((request, response) => { const respond = (x: PlannedResponse) => { response.writeHead(x.status, x.body === undefined ? {} : { 'content-type': 'application/json' }); response.end(x.body === undefined ? undefined : JSON.stringify(x.body)); }; if (request.url === '/api/print-agent/health') return respond(this.health); if (request.url?.startsWith('/api/print-agent/jobs/next')) return respond(this.next.shift() ?? { status: 204 }); if (request.url?.endsWith('/ack')) { let body = ''; request.on('data', (chunk) => { body += chunk; }); request.on('end', () => { this.receivedAcks.push(JSON.parse(body)); respond(this.ack.shift() ?? { status: 200, body: {} }); }); return; } respond({ status: 404 }); }); await new Promise<void>((resolve) => this.server?.listen(0, '127.0.0.1', resolve)); const address = this.server.address(); if (!address || typeof address === 'string') throw new Error('fake backend did not start'); return `http://127.0.0.1:${address.port}`; }
  async close() { await new Promise<void>((resolve, reject) => this.server?.close((error) => error ? reject(error) : resolve())); }
}
