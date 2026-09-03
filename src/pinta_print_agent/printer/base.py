from abc import ABC, abstractmethod
from enum import Enum
class PrinterStatus(str, Enum): UNKNOWN="UNKNOWN"; READY="READY"; NOT_CONFIGURED="NOT_CONFIGURED"; OFFLINE="OFFLINE"; ERROR="ERROR"
class PrinterError(RuntimeError): pass
class PrinterNotConfiguredError(PrinterError): pass
class BasePrinter(ABC):
    @abstractmethod
    def check_status(self) -> PrinterStatus: raise NotImplementedError
    @abstractmethod
    def print_receipt(self, content: str | bytes, order_number: int, job_id: str) -> None: raise NotImplementedError

