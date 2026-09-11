"""FastAPI entrypoint for the Telegram gateway."""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from .api import health, sessions
from .config import settings
from .handlers import inbox_forwarder
from .session_manager import session_manager
from .storage import storage

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI):
    settings.configure_logging()
    settings.ensure_session_dir()

    if not settings.tg_api_id or not settings.tg_api_hash:
        logger.warning(
            "TG_API_ID / TG_API_HASH not set. QR login will be rejected until they are."
        )

    if not settings.gateway_secret:
        logger.warning("GATEWAY_SECRET is empty — all requests will be rejected.")

    await session_manager.start()
    await inbox_forwarder.start()

    # Restore handlers for any sessions we already have on disk.
    for data in storage.list_all():
        try:
            telegram_user_id = int(data["telegram_user_id"])
            client = await session_manager.get_client(telegram_user_id)
            if client:
                await inbox_forwarder.ensure_handler(telegram_user_id)
        except Exception:  # noqa: BLE001
            logger.exception("Failed to restore session %s", data.get("telegram_user_id"))

    logger.info("Telegram gateway started on %s:%s", settings.gateway_host, settings.gateway_port)
    try:
        yield
    finally:
        await session_manager.stop()
        await inbox_forwarder.stop()


app = FastAPI(
    title="UKNOW Telegram Gateway",
    description="Multi-account MTProto gateway backing the UKNOW chatbot platform.",
    version="0.1.0",
    lifespan=lifespan,
)

app.include_router(health.router)
app.include_router(sessions.router)
