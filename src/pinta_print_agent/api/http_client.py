import httpx
from .base import ApiClient, HealthResponse, RetryableApiError, AuthApiError, ProtocolApiError, AckConflictError
from ..models import PrintJob, JobValidationError
from ..version import __version__
class HttpApiClient(ApiClient):
    def __init__(self, config, client: httpx.Client|None=None):
        self.config=config; self.base_url=config.server.base_url
        self.client=client or httpx.Client(timeout=httpx.Timeout(connect=config.server.connect_timeout_seconds, read=config.server.read_timeout_seconds, write=config.server.read_timeout_seconds, pool=config.server.connect_timeout_seconds), verify=config.server.verify_tls, headers={"Authorization": f"Bearer {config.server.agent_token}", "User-Agent":f"PintaPrintAgent/{__version__}", "Accept":"application/json"})
    def close(self): self.client.close()
    def _request(self, method, path, **kwargs):
        try: response=self.client.request(method, self.base_url+path, **kwargs)
        except (httpx.TimeoutException, httpx.NetworkError) as e: raise RetryableApiError("Network or timeout error") from e
        if response.status_code in (401,403): raise AuthApiError(f"HTTP {response.status_code}")
        if response.status_code in (429,) or response.status_code >= 500: raise RetryableApiError(f"HTTP {response.status_code}")
        if response.status_code == 404: raise ProtocolApiError("HTTP 404")
        return response
    def _json(self, response):
        try: return response.json()
        except ValueError as e: raise ProtocolApiError("Invalid JSON response") from e
    def health(self):
        response=self._request("GET", "/api/print-agent/health")
        if response.status_code != 200: raise ProtocolApiError(f"Unexpected health HTTP {response.status_code}")
        body=self._json(response)
        if not isinstance(body,dict) or body.get("status")!="ok" or body.get("schema_version")!=1: raise ProtocolApiError("Invalid health response")
        if body.get("location_id") != self.config.agent.location_id: raise ProtocolApiError("Health location_id differs from local configuration")
        return HealthResponse("ok",1,body["location_id"])
    def wait_for_print_job(self):
        response=self._request("GET", "/api/print-agent/jobs/next")
        if response.status_code==204:return None
        if response.status_code!=200: raise ProtocolApiError(f"Unexpected jobs HTTP {response.status_code}")
        try:return PrintJob.from_dict(self._json(response))
        except JobValidationError as e: raise ProtocolApiError(str(e)) from e
    def _ack(self, job, body):
        response=self._request("POST", f"/api/print-agent/jobs/{job.job_id}/ack", json=body)
        if response.status_code==409: raise AckConflictError("Stale claim conflict (409)")
        if not 200<=response.status_code<300: raise ProtocolApiError(f"Unexpected ACK HTTP {response.status_code}")
    def ack_printed(self,job): self._ack(job,{"claim_token":job.claim_token,"result":"printed"})
    def ack_failed(self,job,error_code,message): self._ack(job,{"claim_token":job.claim_token,"result":"failed","error_code":error_code,"message":message[:500]})

