import type { Logger } from './logger.js';
import type { PrintApi } from './http-client.js';
import { HttpError } from './http-client.js';
import { JobLedger } from './ledger.js';
import { renderKitchenTicket } from './renderer.js';
import type { AgentConfig, PrintJob, Printer } from './types.js';
import { PrinterError } from './printer.js';
export type WorkerResult = 'PRINTED' | 'DEDUPED' | 'FAILED' | 'AMBIGUOUS' | 'REJECTED';
export class PrintWorker {
  private running = false; private delay = 1000;
  constructor(private readonly config: AgentConfig, private readonly api: PrintApi, private readonly printer: Printer, private readonly ledger: JobLedger, private readonly logger: Logger, private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)), private readonly random: () => number = Math.random) {}
  async processJob(job: PrintJob): Promise<WorkerResult> {
    let entry;
    try { entry = this.ledger.assertHash(job); } catch { this.logger.error('PAYLOAD_MISMATCH', { job_id: job.job_id }); return 'REJECTED'; }
    if (entry?.status === 'PRINTED' || entry?.status === 'ACKED') { this.ledger.updateClaim(job); this.logger.info('dedupe_reclaim', { job_id: job.job_id, status: entry.status }); await this.ackPrinted(job); return 'DEDUPED'; }
    if (entry?.status === 'AMBIGUOUS') { this.ledger.updateClaim(job); this.logger.error('PRINT_STATE_AMBIGUOUS', { job_id: job.job_id }); return 'AMBIGUOUS'; }
    this.ledger.receive(job); this.ledger.setPrinting(job); this.logger.info('print_start', { job_id: job.job_id, order_number: job.order.number });
    try { await this.printer.print(renderKitchenTicket(job), job.job_id); } catch (cause) { const printerError = cause instanceof PrinterError ? cause : new PrinterError(cause instanceof Error ? cause.message : 'unknown print failure'); this.ledger.setFailed(job, printerError.code); this.logger.error('print_failed', { job_id: job.job_id, error_code: printerError.code }); try { await this.api.ackFailed(job, printerError.code, printerError.message); } catch (ackError) { this.logger.warn('failed_ack_failed', { job_id: job.job_id, reason: (ackError as Error).message }); } return 'FAILED'; }
    // This durable commit is deliberately completed before the remote ACK.
    this.ledger.setPrinted(job); this.logger.info('print_persisted', { job_id: job.job_id }); await this.ackPrinted(job); return 'PRINTED';
  }
  private async ackPrinted(job: PrintJob) { try { await this.api.ackPrinted(job); this.ledger.setAcked(job); this.logger.info('ack_printed', { job_id: job.job_id }); } catch (error) { if (error instanceof HttpError && error.kind === 'CONFLICT') { this.ledger.setError(job.job_id, 'STALE_CLAIM'); this.logger.warn('ack_stale_claim', { job_id: job.job_id }); return; } this.ledger.setError(job.job_id, `ACK_ERROR: ${(error as Error).message}`); this.logger.warn('ack_pending', { job_id: job.job_id }); } }
  async run(): Promise<void> { this.running = true; const ambiguities = this.ledger.markAbandonedPrintingAmbiguous(); if (ambiguities) this.logger.error('PRINT_STATE_AMBIGUOUS', { jobs: ambiguities }); this.logger.info('startup', { server_host: new URL(this.config.serverUrl).host });
    try { await this.api.health(); this.logger.info('health_ok'); this.delay = 1000; } catch (error) { this.handleStartupError(error); return; }
    while (this.running) { try { const job = await this.api.nextJob(); this.delay = 1000; if (job) await this.processJob(job); } catch (error) { if (!this.running) break; if (error instanceof HttpError && (error.kind === 'AUTH' || error.kind === 'DISABLED' || error.kind === 'PROTOCOL')) { this.logger.error('loop_stopped', { reason: error.kind, message: error.message }); break; } const jitter = Math.floor(this.delay * 0.15 * this.random()); this.logger.warn('backoff', { delay_ms: this.delay + jitter }); await this.sleep(this.delay + jitter); this.delay = Math.min(Math.round(this.delay * 2), 30000); } }
    this.api.close(); this.ledger.close(); this.logger.info('shutdown');
  }
  private handleStartupError(error: unknown) { const e = error as HttpError; this.logger.error(e.kind === 'AUTH' ? 'health_unauthorized' : e.kind === 'DISABLED' ? 'health_disabled' : 'health_failed', { reason: e.message }); this.running = false; this.api.close(); this.ledger.close(); }
  stop() { this.running = false; this.api.abort(); }
}
