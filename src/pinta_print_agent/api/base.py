from abc import ABC, abstractmethod
from dataclasses import dataclass
from ..models import PrintJob
class ApiError(RuntimeError): pass
class RetryableApiError(ApiError): pass
class AuthApiError(ApiError): pass
class ProtocolApiError(ApiError): pass
class AckConflictError(ApiError): pass
@dataclass(frozen=True)
class HealthResponse: status:str; schema_version:int; location_id:str
class ApiClient(ABC):
    @abstractmethod
    def health(self) -> HealthResponse: raise NotImplementedError
    @abstractmethod
    def wait_for_print_job(self) -> PrintJob|None: raise NotImplementedError
    @abstractmethod
    def ack_printed(self, job: PrintJob) -> None: raise NotImplementedError
    @abstractmethod
    def ack_failed(self, job: PrintJob, error_code: str, message: str) -> None: raise NotImplementedError
    def close(self): pass

