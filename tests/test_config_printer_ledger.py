import json, logging
import pytest
from pinta_print_agent.config import load_config, ConfigError
from pinta_print_agent.runtime_paths import RuntimePaths
from pinta_print_agent.main import sample_job
from pinta_print_agent.printer import MockPrinter, PrinterError
from pinta_print_agent.storage import PrintLedger, PayloadMismatchError
from pinta_print_agent.renderer import TextReceiptRenderer
from pinta_print_agent.models import PrintJob
def test_config_and_runtime(tmp_path,config):
    paths=RuntimePaths.from_root(tmp_path); paths.ensure(); assert paths.database.parent.exists() and config.token_status=="configured"
    with pytest.raises(ConfigError): load_config(paths.config)
    paths.config.write_text("{");
    with pytest.raises(ConfigError): load_config(paths.config)
def test_mock_and_ledger_persistence(tmp_path):
    job=sample_job(); content=TextReceiptRenderer().render(job.order); printer=MockPrinter(tmp_path)
    printer.print_receipt(content,146,job.job_id); assert printer.print_count==1 and (tmp_path/"order_146_11111111.txt").read_text()==content
    ledger=PrintLedger(tmp_path/"agent.db"); assert not ledger.already_printed(job); ledger.record_printed(job); assert ledger.already_printed(sample_job("different")); ledger.record_acked(job.job_id,"different"); ledger.close()
    assert PrintLedger(tmp_path/"agent.db").lookup(job.job_id).acked_at is not None
def test_payload_mismatch(tmp_path):
    ledger=PrintLedger(tmp_path/"agent.db"); job=sample_job(); ledger.record_printed(job)
    altered=PrintJob.from_dict({**job.__dict__,"order":{**job.order.canonical_payload(),"number":147}})
    with pytest.raises(PayloadMismatchError): ledger.already_printed(altered)
