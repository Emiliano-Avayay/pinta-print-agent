"""Typed local configuration and deliberately non-secret validation errors."""
from dataclasses import dataclass
from pathlib import Path
import json
from urllib.parse import urlparse

class ConfigError(ValueError): pass

@dataclass(frozen=True)
class ServerConfig:
    base_url: str; agent_token: str; connect_timeout_seconds: float; read_timeout_seconds: float
    idle_delay_seconds: float; error_backoff_initial_seconds: float; error_backoff_max_seconds: float; verify_tls: bool

@dataclass(frozen=True)
class PrinterConfig:
    mode: str; name: str; paper_width_chars: int

@dataclass(frozen=True)
class AgentConfig:
    agent_name: str; location_id: str; health_interval_seconds: float; log_level: str

@dataclass(frozen=True)
class AppConfig:
    server: ServerConfig; printer: PrinterConfig; agent: AgentConfig
    @property
    def token_status(self) -> str: return "configured" if self.server.agent_token else "not configured"

def _required(data, key):
    if key not in data: raise ConfigError(f"Missing configuration key: {key}")
    return data[key]

def _positive(value, name):
    if not isinstance(value, (int, float)) or isinstance(value, bool) or value <= 0: raise ConfigError(f"{name} must be > 0")
    return value

def config_from_dict(data: dict) -> AppConfig:
    try:
        s, p, a = _required(data, "server"), _required(data, "printer"), _required(data, "agent")
        base_url = _required(s, "base_url")
        parsed = urlparse(base_url)
        if not isinstance(base_url, str) or parsed.scheme not in ("http", "https") or not parsed.netloc: raise ConfigError("server.base_url must be an HTTP(S) URL")
        mode, width = _required(p, "mode"), _required(p, "paper_width_chars")
        if mode not in ("mock", "escpos"): raise ConfigError("printer.mode must be mock or escpos")
        if not isinstance(width, int) or width < 20: raise ConfigError("printer.paper_width_chars must be an integer >= 20")
        level = _required(a, "log_level").upper()
        if level not in ("DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"): raise ConfigError("agent.log_level is invalid")
        agent_name, location_id = _required(a, "agent_name"), _required(a, "location_id")
        if not isinstance(agent_name, str) or not agent_name.strip(): raise ConfigError("agent.agent_name is required")
        if not isinstance(location_id, str) or not location_id.strip(): raise ConfigError("agent.location_id is required")
        return AppConfig(
            ServerConfig(base_url.rstrip("/"), str(_required(s,"agent_token")), _positive(_required(s,"connect_timeout_seconds"), "connect_timeout_seconds"), _positive(_required(s,"read_timeout_seconds"), "read_timeout_seconds"), _positive(_required(s,"idle_delay_seconds"), "idle_delay_seconds"), _positive(_required(s,"error_backoff_initial_seconds"), "error_backoff_initial_seconds"), _positive(_required(s,"error_backoff_max_seconds"), "error_backoff_max_seconds"), bool(_required(s,"verify_tls"))),
            PrinterConfig(mode, str(_required(p,"name")), width),
            AgentConfig(agent_name, location_id, _positive(_required(a,"health_interval_seconds"), "health_interval_seconds"), level))
    except (TypeError, AttributeError) as e: raise ConfigError("Configuration structure is invalid") from e

def load_config(path: Path) -> AppConfig:
    try:
        with Path(path).open(encoding="utf-8") as f: return config_from_dict(json.load(f))
    except FileNotFoundError: raise ConfigError(f"Configuration file does not exist: {path}")
    except json.JSONDecodeError as e: raise ConfigError("Configuration JSON is invalid") from e

