"""Shared FastAPI dependencies: shared-secret auth, config validation."""
from __future__ import annotations

import logging

from fastapi import Header, HTTPException, status

from ..config import settings

logger = logging.getLogger(__name__)


async def require_gateway_secret(x_gateway_secret: str | None = Header(default=None)) -> None:
    """Reject any request that doesn't carry the shared secret header."""
    if not settings.gateway_secret:
        # Secret unset → service is mis-configured; reject all calls.
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Gateway secret is not configured",
        )
    if not x_gateway_secret or x_gateway_secret != settings.gateway_secret:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing X-Gateway-Secret header",
        )


def validate_telegram_config() -> None:
    """Bail out early if TG_API_ID / TG_API_HASH aren't set."""
    if not settings.tg_api_id or not settings.tg_api_hash:
        raise RuntimeError(
            "TG_API_ID and TG_API_HASH must be set before serving requests"
        )
