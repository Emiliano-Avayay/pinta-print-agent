import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { JobStatus, PrintJob } from './types.js';
import { payloadHash } from './model.js';
export interface LedgerEntry { jobId: string; payloadHash: string; status: JobStatus; firstSeenAt: string; printStartedAt: string | null; printedAt: string | null; ackedAt: string | null; lastClaimToken: string | null; lastError: string | null; updatedAt: string }
export class PayloadMismatchError extends Error {}
const now = () => new Date().toISOString();
export class JobLedger {
  private readonly db: DatabaseSync;
  constructor(path: string) { mkdirSync(dirname(path), { recursive: true }); this.db = new DatabaseSync(path); this.db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS jobs (job_id TEXT PRIMARY KEY, payload_hash TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN (\'RECEIVED\',\'PRINTING\',\'PRINTED\',\'ACKED\',\'FAILED\',\'AMBIGUOUS\')), first_seen_at TEXT NOT NULL, print_started_at TEXT, printed_at TEXT, acked_at TEXT, last_claim_token TEXT, last_error TEXT, updated_at TEXT NOT NULL);'); }
  close() { this.db.close(); }
  get(jobId: string): LedgerEntry | undefined { const row = this.db.prepare('SELECT job_id,payload_hash,status,first_seen_at,print_started_at,printed_at,acked_at,last_claim_token,last_error,updated_at FROM jobs WHERE job_id=?').get(jobId) as Record<string, unknown> | undefined; return row && { jobId: row.job_id as string, payloadHash: row.payload_hash as string, status: row.status as JobStatus, firstSeenAt: row.first_seen_at as string, printStartedAt: row.print_started_at as string | null, printedAt: row.printed_at as string | null, ackedAt: row.acked_at as string | null, lastClaimToken: row.last_claim_token as string | null, lastError: row.last_error as string | null, updatedAt: row.updated_at as string }; }
  assertHash(job: PrintJob): LedgerEntry | undefined { const entry = this.get(job.job_id); if (entry && entry.payloadHash !== payloadHash(job)) { this.setError(job.job_id, 'PAYLOAD_MISMATCH'); throw new PayloadMismatchError(`PAYLOAD_MISMATCH for ${job.job_id}`); } return entry; }
  receive(job: PrintJob) { const time = now(); this.db.prepare('INSERT INTO jobs(job_id,payload_hash,status,first_seen_at,last_claim_token,updated_at) VALUES(?,?,\'RECEIVED\',?,?,?) ON CONFLICT(job_id) DO UPDATE SET last_claim_token=excluded.last_claim_token, updated_at=excluded.updated_at').run(job.job_id, payloadHash(job), time, job.claim_token, time); }
  setPrinting(job: PrintJob) { const time = now(); this.db.prepare('UPDATE jobs SET status=\'PRINTING\',print_started_at=?,last_claim_token=?,last_error=NULL,updated_at=? WHERE job_id=?').run(time, job.claim_token, time, job.job_id); }
  setPrinted(job: PrintJob) { const time = now(); this.db.prepare('UPDATE jobs SET status=\'PRINTED\',printed_at=?,last_claim_token=?,last_error=NULL,updated_at=? WHERE job_id=?').run(time, job.claim_token, time, job.job_id); }
  setAcked(job: PrintJob) { const time = now(); this.db.prepare('UPDATE jobs SET status=\'ACKED\',acked_at=?,last_claim_token=?,last_error=NULL,updated_at=? WHERE job_id=?').run(time, job.claim_token, time, job.job_id); }
  setFailed(job: PrintJob, error: string) { const time = now(); this.db.prepare('UPDATE jobs SET status=\'FAILED\',last_claim_token=?,last_error=?,updated_at=? WHERE job_id=?').run(job.claim_token, error.slice(0, 500), time, job.job_id); }
  setError(jobId: string, error: string) { this.db.prepare('UPDATE jobs SET last_error=?,updated_at=? WHERE job_id=?').run(error.slice(0, 500), now(), jobId); }
  updateClaim(job: PrintJob) { this.db.prepare('UPDATE jobs SET last_claim_token=?,updated_at=? WHERE job_id=?').run(job.claim_token, now(), job.job_id); }
  markAbandonedPrintingAmbiguous() { const time = now(); return this.db.prepare("UPDATE jobs SET status='AMBIGUOUS',last_error='PRINT_STATE_AMBIGUOUS',updated_at=? WHERE status='PRINTING'").run(time).changes; }
}
