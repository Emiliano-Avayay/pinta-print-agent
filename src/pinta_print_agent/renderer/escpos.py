"""ESC/POS presentation renderer for a readable 80 mm kitchen receipt."""

from .base import BaseReceiptRenderer
from .layout import wrap
from .text import _ascii
from ..models import OrderReceipt


class EscPosReceiptRenderer(BaseReceiptRenderer):
    """Render a receipt using only hardware-neutral ESC/POS presentation commands."""

    INIT = b"\x1b@"
    ALIGN_LEFT = b"\x1ba\x00"
    ALIGN_CENTER = b"\x1ba\x01"
    ALIGN_RIGHT = b"\x1ba\x02"
    BOLD_ON = b"\x1bE\x01"
    BOLD_OFF = b"\x1bE\x00"
    SIZE = b"\x1d!"
    NORMAL = SIZE + b"\x00"
    CUT = b"\x1dV\x00"

    def __init__(self, paper_width_chars: int = 42):
        self.width = paper_width_chars

    @staticmethod
    def set_bold(enabled: bool) -> bytes:
        return EscPosReceiptRenderer.BOLD_ON if enabled else EscPosReceiptRenderer.BOLD_OFF

    @staticmethod
    def set_alignment(alignment: str) -> bytes:
        return {
            "left": EscPosReceiptRenderer.ALIGN_LEFT,
            "center": EscPosReceiptRenderer.ALIGN_CENTER,
            "right": EscPosReceiptRenderer.ALIGN_RIGHT,
        }[alignment]

    @staticmethod
    def set_text_size(width_multiplier: int = 1, height_multiplier: int = 1) -> bytes:
        if not 1 <= width_multiplier <= 8 or not 1 <= height_multiplier <= 8:
            raise ValueError("ESC/POS text multipliers must be between 1 and 8")
        size = ((width_multiplier - 1) << 4) | (height_multiplier - 1)
        return EscPosReceiptRenderer.SIZE + bytes([size])

    def reset_text_style(self) -> bytes:
        """Explicitly leave alignment, emphasis, and character size in their normal state."""
        return self.set_alignment("left") + self.set_bold(False) + self.set_text_size()

    @staticmethod
    def _lines(lines: list[str]) -> bytes:
        return ("\n".join(lines) + "\n").encode("ascii", "replace")

    def _write_wrapped(self, value: str, width: int | None = None, indent: str = "") -> bytes:
        return self._lines(wrap(value, width or self.width, indent))

    def _cheese_lines(self, order: OrderReceipt) -> list[str]:
        summary = order.summary
        cheeses = [
            f"TYBO: {summary.tybo_count}",
            f"CHEDDAR: {summary.cheddar_count}",
            f"ROQUEFORT: {summary.roquefort_count}",
        ]
        compact = "   ".join(cheeses)
        if len(compact) <= self.width:
            return [compact]
        return [line for cheese in cheeses for line in wrap(cheese, self.width)]

    def render(self, order: OrderReceipt) -> bytes:
        separator = "-" * self.width
        output = bytearray(self.INIT)
        output.extend(self.reset_text_style())

        # Double width leaves half as many usable character cells.
        output.extend(self.set_bold(True))
        output.extend(self.set_text_size(2, 2))
        output.extend(self._write_wrapped(f"#{order.number}", max(1, self.width // 2)))
        output.extend(self.reset_text_style())

        output.extend(self.set_alignment("right"))
        output.extend(self.set_bold(True))
        output.extend(self._lines([_ascii(order.time)]))
        output.extend(self.reset_text_style())
        output.extend(self._lines([separator, ""]))

        for item in order.items:
            title = f"{item.quantity}x {_ascii(item.name)}"
            if item.variant:
                title += f" {_ascii(item.variant)}"
            output.extend(self.set_bold(True))
            output.extend(self.set_text_size(1, 2))
            output.extend(self._write_wrapped(title))
            output.extend(self.reset_text_style())

            modifications = [
                *(f"- SIN {_ascii(removed)}" for removed in item.removed_ingredients),
                *(f"+ {_ascii(extra)}" for extra in item.added_extras),
            ]
            if item.sauces:
                modifications.append("ADEREZOS: " + ", ".join(_ascii(sauce) for sauce in item.sauces))
            if modifications:
                output.extend(self.set_bold(True))
                for modification in modifications:
                    output.extend(self._write_wrapped(modification))
                output.extend(self.reset_text_style())
            output.extend(self._lines(["", separator, ""]))

        output.extend(self.set_bold(True))
        output.extend(self.set_text_size(1, 2))
        output.extend(self._write_wrapped(f"MEDALLONES: {order.summary.total_medallions}"))
        output.extend(self.reset_text_style())
        output.extend(self._lines([""]))
        output.extend(self.set_bold(True))
        output.extend(self._lines(self._cheese_lines(order)))
        output.extend(self.reset_text_style())
        output.extend(b"\n\n\n")
        output.extend(self.CUT)
        return bytes(output)
