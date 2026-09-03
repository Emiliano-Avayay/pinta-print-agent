import httpx, pytest
from pinta_print_agent.api import HttpApiClient, AuthApiError, RetryableApiError, AckConflictError, ProtocolApiError
from pinta_print_agent.main import sample_job
def client(config, handler): return HttpApiClient(config,httpx.Client(transport=httpx.MockTransport(handler)))
def test_health_and_next(config):
    def handler(req):
        if req.url.path.endswith("health"):return httpx.Response(200,json={"status":"ok","schema_version":1,"location_id":"pinta-main"})
        return httpx.Response(204)
    c=client(config,handler); assert c.health().status=="ok" and c.wait_for_print_job() is None
def test_job_and_health_contract_validation(config):
    job=sample_job()
    c=client(config,lambda req:httpx.Response(200,json=job.__dict__ | {"order":job.order.canonical_payload()}) if req.url.path.endswith("next") else httpx.Response(200,json={"status":"ok","schema_version":1,"location_id":"other"}))
    with pytest.raises(ProtocolApiError): c.health()
    assert c.wait_for_print_job().job_id==job.job_id
@pytest.mark.parametrize("status,error",[(401,AuthApiError),(403,AuthApiError),(429,RetryableApiError),(500,RetryableApiError),(404,ProtocolApiError)])
def test_http_errors(config,status,error):
    c=client(config,lambda req:httpx.Response(status))
    with pytest.raises(error): c.wait_for_print_job()
def test_ack_conflict_and_success(config):
    job=sample_job(); c=client(config,lambda req:httpx.Response(409))
    with pytest.raises(AckConflictError):c.ack_printed(job)
    seen=[]
    c=client(config,lambda req:(seen.append(req),httpx.Response(204))[1]);c.ack_printed(job);assert seen
def test_network_error_is_retryable(config):
    c=client(config,lambda req:(_ for _ in ()).throw(httpx.ConnectError("offline",request=req)))
    with pytest.raises(RetryableApiError): c.wait_for_print_job()
