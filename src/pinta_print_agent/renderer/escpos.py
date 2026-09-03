from .text import TextReceiptRenderer
from .base import BaseReceiptRenderer
from ..models import OrderReceipt
class EscPosReceiptRenderer(BaseReceiptRenderer):
    INIT=b"\x1b@"; ALIGN_LEFT=b"\x1ba\x00"; ALIGN_CENTER=b"\x1ba\x01"; ALIGN_RIGHT=b"\x1ba\x02"; BOLD_ON=b"\x1bE\x01"; BOLD_OFF=b"\x1bE\x00"; DOUBLE=b"\x1d!\x11"; NORMAL=b"\x1d!\x00"; CUT=b"\x1dV\x00"
    def __init__(self, paper_width_chars=42): self.text = TextReceiptRenderer(paper_width_chars)
    def render(self, order: OrderReceipt) -> bytes:
        return self.INIT + self.ALIGN_LEFT + self.text.render(order).encode("ascii", "replace") + b"\n\n\n" + self.CUT
