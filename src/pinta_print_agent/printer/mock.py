from pathlib import Path
import logging
from .base import BasePrinter, PrinterStatus, PrinterError
class MockPrinter(BasePrinter):
    def __init__(self, output_dir: Path, fail: bool=False, logger=None): self.output_dir=Path(output_dir); self.fail=fail; self.print_count=0; self.logger=logger or logging.getLogger("pinta_print_agent")
    def check_status(self): return PrinterStatus.ERROR if self.fail else PrinterStatus.READY
    def print_receipt(self, content, order_number, job_id):
        if self.fail: raise PrinterError("Mock printer is offline")
        self.output_dir.mkdir(parents=True, exist_ok=True); self.print_count += 1
        path = self.output_dir / f"order_{order_number}_{job_id[:8]}.txt"
        path.write_text(content.decode("ascii", "replace") if isinstance(content, bytes) else content, encoding="ascii", errors="replace")
        self.logger.info("MOCK PRINT SUCCESS order_number=%s job_id=%s", order_number, job_id)

