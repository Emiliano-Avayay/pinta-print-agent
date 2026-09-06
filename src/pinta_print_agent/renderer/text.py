from .base import BaseReceiptRenderer
from .layout import wrap, boxed
from ..models import OrderReceipt
import unicodedata

def _ascii(value: str) -> str:
    """Keep receipts portable across conservative ESC/POS code pages."""
    return unicodedata.normalize("NFKD", value.upper()).encode("ascii", "ignore").decode("ascii")

class TextReceiptRenderer(BaseReceiptRenderer):
    def __init__(self, paper_width_chars: int = 42): self.width = paper_width_chars
    def render(self, order: OrderReceipt) -> str:
        w, sep = self.width, "-" * self.width
        first = f"#{order.number}"; time = _ascii(order.time)
        lines = [first + " " * max(1, w - len(first) - len(time)) + time, sep, ""]
        for index, item in enumerate(order.items):
            title = f"{item.quantity}x {_ascii(item.name)}" + (f" {_ascii(item.variant)}" if item.variant else "")
            lines.extend(wrap(title, w))
            for removed in item.removed_ingredients: lines.extend(wrap("- SIN " + _ascii(removed), w, "  "))
            for extra in item.added_extras: lines.extend(wrap("+ " + _ascii(extra), w, "  "))
            if item.sauces: lines.extend(wrap("ADEREZOS: " + ", ".join(_ascii(s) for s in item.sauces), w, "  "))
            lines.extend(["", sep, ""])
        s = order.summary
        summary = [f"MEDALLONES: {s.total_medallions}", "", f"TYBO: {s.tybo_count}   CHEDDAR: {s.cheddar_count}   ROQUEFORT: {s.roquefort_count}"]
        lines.extend(boxed(summary, w))
        return "\n".join(lines) + "\n"
