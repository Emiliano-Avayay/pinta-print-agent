from pinta_print_agent.main import sample_job
from pinta_print_agent.api import MockApiClient, RetryableApiError
from pinta_print_agent.printer import MockPrinter
from pinta_print_agent.renderer import TextReceiptRenderer
from pinta_print_agent.storage import PrintLedger
from pinta_print_agent.agent import AgentWorker
def make_worker(tmp_path,config,api,fail=False):
    printer=MockPrinter(tmp_path/"output",fail=fail); ledger=PrintLedger(tmp_path/"agent.db"); return AgentWorker(config,api,printer,TextReceiptRenderer(),ledger,sleeper=lambda _:None),printer,ledger
def test_ack_loss_is_deduplicated(tmp_path,config):
    one,two=sample_job("x"),sample_job("y"); api=MockApiClient([one,two],ack_outcomes=[RetryableApiError("lost"),None]); worker,printer,ledger=make_worker(tmp_path,config,api)
    worker.process_one(one); worker.process_one(two); assert printer.print_count==1 and len(api.acks)==1 and api.acks[0]["claim_token"]=="y"; ledger.close()
def test_printer_failure_acks_failed_without_ledger(tmp_path,config):
    job=sample_job(); api=MockApiClient(); worker,printer,ledger=make_worker(tmp_path,config,api,True); worker.process_one(job)
    assert ledger.lookup(job.job_id) is None and api.acks[0]["result"]=="failed"; ledger.close()
