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

def test_escpos_uses_a_legible_hierarchy_and_resets_every_style():
    renderer = EscPosReceiptRenderer(42)
    rendered = renderer.render(sample_job().order)
    order_number = b"#146\n"
    product = b"1x BURGER OKLAHOMA SIMPLE\n"
    modification = b"- SIN CEBOLLA\n"
    medallions = b"MEDALLONES: 5\n"

    assert rendered.startswith(renderer.INIT + renderer.reset_text_style())
    assert renderer.set_bold(True) + renderer.set_text_size(2, 2) + order_number in rendered
    order_end = rendered.index(order_number) + len(order_number)
    assert rendered[order_end:order_end + len(renderer.reset_text_style())] == renderer.reset_text_style()
    assert renderer.set_alignment("right") + renderer.set_bold(True) + b"22:11\n" in rendered
    assert renderer.set_bold(True) + renderer.set_text_size(1, 2) + product in rendered
    product_end = rendered.index(product) + len(product)
    assert rendered[product_end:product_end + len(renderer.reset_text_style())] == renderer.reset_text_style()
    assert renderer.set_bold(True) + modification in rendered
    last_modification = b"ADEREZOS: MAYONESA, KETCHUP\n"
    modification_end = rendered.index(last_modification) + len(last_modification)
    assert rendered[modification_end:modification_end + len(renderer.reset_text_style())] == renderer.reset_text_style()
    assert renderer.set_bold(True) + renderer.set_text_size(1, 2) + medallions in rendered
    assert b"TYBO: 1   CHEDDAR: 3   ROQUEFORT: 1\n" in rendered
    assert rendered.endswith(renderer.reset_text_style() + b"\n\n\n" + renderer.CUT)

def test_escpos_wraps_using_the_effective_double_width_and_never_truncates():
    renderer = EscPosReceiptRenderer(12)
    rendered = renderer.render(sample_job().order)
    assert b"#146\n" in rendered
    assert b"ROQUEFORT: 1\n" in rendered
    assert b"TYBO: 1\nCHEDDAR: 3\nROQUEFORT: 1\n" in rendered
    assert b"ADEREZOS:\nMAYONESA,\nKETCHUP\n" in rendered
