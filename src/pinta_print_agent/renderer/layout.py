import textwrap
def wrap(text: str, width: int, indent: str = "") -> list[str]:
    available = max(1, width - len(indent))
    return [indent + line for line in textwrap.wrap(text, width=available, break_long_words=True, break_on_hyphens=False)] or [indent]
def boxed(lines: list[str], width: int) -> list[str]:
    inner = width - 2
    output = ["+" + "-" * inner + "+"]
    for raw in lines:
        for line in wrap(raw, inner): output.append("|" + line.ljust(inner)[:inner] + "|")
    output.append("+" + "-" * inner + "+")
    return output

