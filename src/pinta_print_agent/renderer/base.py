from abc import ABC, abstractmethod
from ..models import OrderReceipt
class BaseReceiptRenderer(ABC):
    @abstractmethod
    def render(self, order: OrderReceipt): raise NotImplementedError

