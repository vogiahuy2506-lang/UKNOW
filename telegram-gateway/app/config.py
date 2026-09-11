"""Application configuration loaded from environment variables."""
from __future__ import annotations

import logging
import os
from pathlib import Path

from dotenv import load_dotenv

# Load .env file if present
load_dotenv()


def _get_int(key: str, default: int) -> int:
    raw = os.getenv(key)
    if raw is None or raw == "":
        return default
    try:
        return int(raw)
    except ValueError as exc:
        raise RuntimeError(f"Invalid integer for env {key}: {raw}") from exc


class Settings:
    """Container for runtime configuration."""

    def __init__(self) -> None:
        self.tg_api_id: int = _get_int("TG_API_ID", 0)
        self.tg_api_hash: str = os.getenv("TG_API_HASH", "")
        self.gateway_host: str = os.getenv("GATEWAY_HOST", "0.0.0.0")
        self.gateway_port: int = _get_int("GATEWAY_PORT", 8765)
        self.gateway_secret: str = os.getenv("GATEWAY_SECRET", "")
        self.session_dir: Path = Path(os.getenv("SESSION_DIR", "./sessions")).resolve()
        self.nodejs_callback_url: str = os.getenv("NODEJS_CALLBACK_URL", "")
        self.nodejs_callback_secret: str = os.getenv("NODEJS_CALLBACK_SECRET", "")
        self.max_concurrent_clients: int = _get_int("MAX_CONCURRENT_CLIENTS", 500)
        self.idle_disconnect_minutes: int = _get_int("IDLE_DISCONNECT_MINUTES", 5)
        self.log_level: str = os.getenv("LOG_LEVEL", "INFO").upper()

    def ensure_session_dir(self) -> None:
        """Make sure the session directory exists before any client starts."""
        self.session_dir.mkdir(parents=True, exist_ok=True)

    def configure_logging(self) -> None:
        logging.basicConfig(
            level=getattr(logging, self.log_level, logging.INFO),
            format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        )


settings = Settings()
