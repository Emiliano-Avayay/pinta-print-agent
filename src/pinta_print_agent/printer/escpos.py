from .base import BasePrinter, PrinterStatus, PrinterNotConfiguredError
class EscPosPrinter(BasePrinter):
    """Hardware-neutral placeholder; USB/device profiles are intentionally future work."""
    def __init__(self, configured: bool=False): self.configured = configured
    def check_status(self): return PrinterStatus.UNKNOWN if self.configured else PrinterStatus.NOT_CONFIGURED
    def print_receipt(self, content, order_number, job_id): raise PrinterNotConfiguredError("ESC/POS hardware is not configured")

