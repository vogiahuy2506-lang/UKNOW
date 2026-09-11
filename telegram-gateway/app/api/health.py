"""Read-only endpoints that surface health & metrics for ops dashboards."""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends

from ..config import settings
from ..session_manager import session_manager
from .deps import require_gateway_secret

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/health", tags=["health"])


@router.get("", dependencies=[Depends(require_gateway_secret)])
async def health() -> dict:
    return {
        "status": "ok",
        "active_clients": len(session_manager.list_active_clients()),
        "max_concurrent": settings.max_concurrent_clients,
        "idle_minutes": settings.idle_disconnect_minutes,
    }


@router.get("/ping")
async def ping() -> dict:
    """Unauthenticated liveness probe."""
    return {"status": "pong"}
