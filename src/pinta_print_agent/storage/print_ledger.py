from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
import hashlib, json, sqlite3
class PayloadMismatchError(RuntimeError): pass
@dataclass(frozen=True)
class LedgerEntry: job_id:str; payload_sha256:str; printed_at:str; acked_at:str|None; last_claim_token:str|None; last_ack_error:str|None
def payload_sha256(job) -> str:
    encoded = json.dumps(job.hash_payload(), ensure_ascii=True, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()
class PrintLedger:
    def __init__(self, db_path: Path):
        Path(db_path).parent.mkdir(parents=True, exist_ok=True); self.connection=sqlite3.connect(str(db_path)); self.connection.execute("PRAGMA journal_mode=WAL")
        self.connection.execute("CREATE TABLE IF NOT EXISTS printed_jobs (job_id TEXT PRIMARY KEY, payload_sha256 TEXT NOT NULL, printed_at TEXT NOT NULL, acked_at TEXT NULL, last_claim_token TEXT NULL, last_ack_error TEXT NULL)"); self.connection.commit()
    def close(self): self.connection.close()
    def lookup(self, job_id: str) -> LedgerEntry|None:
        row=self.connection.execute("SELECT job_id,payload_sha256,printed_at,acked_at,last_claim_token,last_ack_error FROM printed_jobs WHERE job_id=?", (job_id,)).fetchone()
        return LedgerEntry(*row) if row else None
    def already_printed(self, job) -> bool:
        entry=self.lookup(job.job_id)
        if not entry: return False
        if entry.payload_sha256 != payload_sha256(job): raise PayloadMismatchError(f"Payload hash mismatch for job_id={job.job_id}")
        return True
    def record_printed(self, job):
        now=datetime.now(timezone.utc).isoformat(); digest=payload_sha256(job)
        with self.connection: self.connection.execute("INSERT INTO printed_jobs(job_id,payload_sha256,printed_at,last_claim_token) VALUES (?,?,?,?)", (job.job_id,digest,now,job.claim_token))
    def record_acked(self, job_id: str, claim_token: str):
        with self.connection: self.connection.execute("UPDATE printed_jobs SET acked_at=?,last_claim_token=?,last_ack_error=NULL WHERE job_id=?", (datetime.now(timezone.utc).isoformat(), claim_token, job_id))
    def record_ack_error(self, job_id: str, message: str):
        with self.connection: self.connection.execute("UPDATE printed_jobs SET last_ack_error=? WHERE job_id=?", (message[:500], job_id))
