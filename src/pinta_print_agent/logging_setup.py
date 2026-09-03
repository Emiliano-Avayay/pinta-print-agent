import logging
from logging.handlers import RotatingFileHandler
from .runtime_paths import RuntimePaths

def configure_logging(paths: RuntimePaths, level: str = "INFO", console: bool = True) -> logging.Logger:
    paths.ensure(); logger = logging.getLogger("pinta_print_agent")
    logger.handlers.clear(); logger.setLevel(level); logger.propagate = False
    fmt = logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s")
    file_handler = RotatingFileHandler(paths.logs / "pinta-print-agent.log", maxBytes=2*1024*1024, backupCount=5, encoding="utf-8")
    file_handler.setFormatter(fmt); logger.addHandler(file_handler)
    if console:
        handler = logging.StreamHandler(); handler.setFormatter(fmt); logger.addHandler(handler)
    return logger
