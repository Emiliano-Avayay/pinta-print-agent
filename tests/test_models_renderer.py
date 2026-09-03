import pytest
from pinta_print_agent.main import sample_job
from pinta_print_agent.models import PrintJob, JobValidationError
from pinta_print_agent.renderer import TextReceiptRenderer, EscPosReceiptRenderer
def test_valid_job_and_hash_shape():
    job=sample_job(); assert job.order.number==146 and job.hash_payload()["schema_version"]==1
def test_schema_and_quantity_rejected():
    raw={"job_id":"a","claim_token":"c","lease_expires_at":"2030-01-01T00:00:00Z","schema_version":2,"order":{}}
    with pytest.raises(JobValidationError): PrintJob.from_dict(raw)
def test_renderer_receipt_is_ascii_and_bounded():
    rendered=TextReceiptRenderer(42).render(sample_job().order)
    assert "#146" in rendered and "22:11" in rendered and "- SIN CEBOLLA" in rendered and "+ MEDALLON EXTRA" in rendered and "ADEREZOS: MAYONESA, KETCHUP" in rendered and "MEDALLONES: 5" in rendered
    assert all(len(line)<=42 for line in rendered.splitlines())
    assert EscPosReceiptRenderer().render(sample_job().order).startswith(b"\x1b@")
