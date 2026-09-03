"""Locations for mutable agent state, kept outside the source checkout."""
from dataclasses import dataclass
from pathlib import Path
import os

@dataclass(frozen=True)
class RuntimePaths:
    root: Path
    config: Path
    data: Path
    logs: Path
    mock_output: Path
    database: Path

    @classmethod
    def from_root(cls, root: Path) -> "RuntimePaths":
        root = Path(root)
        return cls(root, root / "config.json", root / "data", root / "logs", root / "mock_output", root / "data" / "agent.db")

    @classmethod
    def default(cls) -> "RuntimePaths":
        base = Path(os.environ.get("LOCALAPPDATA", Path.home() / ".local"))
        return cls.from_root(base / "PintaPrintAgent")

    def ensure(self) -> None:
        for path in (self.root, self.data, self.logs, self.mock_output):
            path.mkdir(parents=True, exist_ok=True)

