from collections import deque
from .base import ApiClient, HealthResponse, RetryableApiError
class MockApiClient(ApiClient):
    """Deterministic offline API double; queue entries may be jobs, None, or Exceptions."""
    def __init__(self, jobs=(), health_ok=True, ack_outcomes=()): self.jobs=deque(jobs); self.health_ok=health_ok; self.ack_outcomes=deque(ack_outcomes); self.acks=[]; self.health_calls=0
    def health(self):
        self.health_calls += 1
        if isinstance(self.health_ok,Exception): raise self.health_ok
        return HealthResponse("ok",1,"pinta-main")
    def wait_for_print_job(self):
        if not self.jobs:return None
        item=self.jobs.popleft()
        if isinstance(item,Exception):raise item
        return item
    def _ack(self, job, result, **extra):
        outcome=self.ack_outcomes.popleft() if self.ack_outcomes else None
        if isinstance(outcome,Exception):raise outcome
        self.acks.append({"job_id":job.job_id,"claim_token":job.claim_token,"result":result,**extra})
    def ack_printed(self,job):self._ack(job,"printed")
    def ack_failed(self,job,error_code,message):self._ack(job,"failed",error_code=error_code,message=message[:500])
