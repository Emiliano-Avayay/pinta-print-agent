import textwrap
def wrap(text: str, width: int, indent: str = "") -> list[str]:
    if width < 1: raise ValueError("width must be positive")
    effective_indent = indent[:max(0, width - 1)]
    available = width - len(effective_indent)
    return [effective_indent + line for line in textwrap.wrap(text, width=available, break_long_words=True, break_on_hyphens=False)] or [effective_indent]
def boxed(lines: list[str], width: int) -> list[str]:
    inner = width - 2
    output = ["+" + "-" * inner + "+"]
    for raw in lines:
        for line in wrap(raw, inner): output.append("|" + line.ljust(inner)[:inner] + "|")
    output.append("+" + "-" * inner + "+")
    return output

