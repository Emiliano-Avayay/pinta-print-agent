from pathlib import Path
import json, threading
from .config import load_config, config_from_dict, ConfigError
from .runtime_paths import RuntimePaths
from .logging_setup import configure_logging
from .models import PrintJob
from .renderer import TextReceiptRenderer
from .printer import MockPrinter, EscPosPrinter
from .storage import PrintLedger
from .api import HttpApiClient, MockApiClient, RetryableApiError
from .agent import AgentWorker
from .version import __version__

def sample_job(claim_token="claim-one"):
    return PrintJob.from_dict({"job_id":"11111111-1111-1111-1111-111111111111","claim_token":claim_token,"lease_expires_at":"2030-01-01T00:00:00Z","schema_version":1,"order":{"number":146,"time":"22:11","items":[{"quantity":1,"name":"BURGER OKLAHOMA","variant":"SIMPLE","removed_ingredients":[],"added_extras":[],"sauces":[]},{"quantity":1,"name":"BURGER PINTA","variant":"SIMPLE","removed_ingredients":["CEBOLLA"],"added_extras":["MEDALLÓN EXTRA"],"sauces":["MAYONESA","KETCHUP"]},{"quantity":1,"name":"BURGER FRANCESA","variant":"SIMPLE","removed_ingredients":[],"added_extras":[],"sauces":[]},{"quantity":1,"name":"BURGER COMPLETA","variant":"SIMPLE","removed_ingredients":[],"added_extras":[],"sauces":[]},{"quantity":1,"name":"SUPER PAPAS","variant":"CHEDDAR","removed_ingredients":[],"added_extras":[],"sauces":[]}],"summary":{"total_medallions":5,"tybo_count":1,"cheddar_count":3,"roquefort_count":1}}})

def bundled_config():
    return config_from_dict(json.loads((Path(__file__).parents[2] / "config" / "config.example.json").read_text(encoding="utf-8")))
def get_config(paths): return load_config(paths.config) if paths.config.exists() else bundled_config()
def build_printer(config,paths,logger): return MockPrinter(paths.mock_output,logger=logger) if config.printer.mode=="mock" else EscPosPrinter()

def test_print(paths,config,logger):
    printer=MockPrinter(paths.mock_output,logger=logger); content=TextReceiptRenderer(config.printer.paper_width_chars).render(sample_job().order); printer.print_receipt(content,146,sample_job().job_id); return printer.print_count
def demo_flow(paths,config,logger):
    # Demos deliberately use a fresh SQLite database so repeated runs remain demonstrative.
    job=sample_job(); api=MockApiClient([job]); printer=MockPrinter(paths.mock_output,logger=logger); ledger=PrintLedger(Path(":memory:")); worker=AgentWorker(config,api,printer,TextReceiptRenderer(42),ledger,logger=logger); worker.process_one(job); ledger.close(); return printer.print_count,api.acks
def demo_ack_loss(paths,config,logger):
    first,second=sample_job("claim-one"),sample_job("claim-two")
    api=MockApiClient([first,second],ack_outcomes=[RetryableApiError("simulated ACK network loss"),None]); printer=MockPrinter(paths.mock_output,logger=logger); ledger=PrintLedger(Path(":memory:")); worker=AgentWorker(config,api,printer,TextReceiptRenderer(42),ledger,logger=logger)
    worker.process_one(first); worker.process_one(second); ledger.close(); return printer.print_count,api.acks

def run(config,paths,no_tray=False):
    logger=configure_logging(paths,config.agent.log_level); api=HttpApiClient(config); printer=build_printer(config,paths,logger); ledger=PrintLedger(paths.database); worker=AgentWorker(config,api,printer,TextReceiptRenderer(config.printer.paper_width_chars),ledger,logger=logger); logger.info("Pinta Print Agent %s startup; token=%s runtime=%s",__version__,config.token_status,paths.root); worker.start()
    if no_tray:
        try:
            while worker.is_alive(): worker.join(0.5)
        except KeyboardInterrupt: worker.stop(); worker.join(10)
    else:
        from .ui import AgentTray
        tray=AgentTray(worker,printer,TextReceiptRenderer(config.printer.paper_width_chars),paths); tray.run(); worker.join(10)
