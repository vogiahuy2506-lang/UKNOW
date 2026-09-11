"""Pool of Telethon clients, lazily created on demand.

Each connected account is wrapped in a record that carries a per-account
asyncio.Lock so concurrent commands for the same account are serialised.
Idle clients are evicted by a background task so we don't accumulate RAM
when accounts sit unused.
"""
from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, field
from typing import Optional

from telethon import TelegramClient
from telethon.errors import (
    AuthKeyUnregisteredError,
    FloodWaitError,
    SessionPasswordNeededError,
    UserDeactivatedError,
)
from telethon.sessions import StringSession

from .config import settings
from .storage import storage

logger = logging.getLogger(__name__)


@dataclass
class ClientRecord:
    account_key: str          # telegram_user_id as string
    client: TelegramClient
    last_used: float
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)


class TelegramSessionManager:
    """Manages MTProto clients for the gateway."""

    def __init__(self) -> None:
        self._clients: dict[str, ClientRecord] = {}
        self._global_lock = asyncio.Lock()
        self._semaphore = asyncio.Semaphore(settings.max_concurrent_clients)
        self._idle_task: Optional[asyncio.Task] = None

    # ── Lifecycle ─────────────────────────────────────────────────────────

    async def start(self) -> None:
        """Begin the idle eviction task. Call once during app startup."""
        if self._idle_task is None or self._idle_task.done():
            self._idle_task = asyncio.create_task(self._evict_idle())

    async def stop(self) -> None:
        if self._idle_task and not self._idle_task.done():
            self._idle_task.cancel()
        for record in list(self._clients.values()):
            try:
                await record.client.disconnect()
            except Exception:  # noqa: BLE001
                pass
        self._clients.clear()

    # ── Public API ────────────────────────────────────────────────────────

    async def get_client(self, telegram_user_id: int) -> Optional[TelegramClient]:
        """Return the connected client for ``telegram_user_id`` or None."""
        key = str(telegram_user_id)
        async with self._global_lock:
            record = self._clients.get(key)
        if record:
            record.last_used = time.time()
            return record.client

        data = storage.get(telegram_user_id)
        if not data or not data.get("session_string"):
            return None

        async with self._semaphore:
            client = TelegramClient(
                StringSession(data["session_string"]),
                settings.tg_api_id,
                settings.tg_api_hash,
                connection_retries=3,
                flood_sleep_threshold=60,
            )
            try:
                await client.connect()
            except Exception as exc:  # noqa: BLE001
                logger.warning("[Sessions] connect failed for %s: %s", telegram_user_id, exc)
                return None

            if not await client.is_user_authorized():
                logger.warning("[Sessions] stored session for %s is no longer authorized", telegram_user_id)
                await client.disconnect()
                storage.delete(telegram_user_id)
                return None

            record = ClientRecord(
                account_key=key,
                client=client,
                last_used=time.time(),
            )
            async with self._global_lock:
                self._clients[key] = record
            logger.info("[Sessions] Restored client for %s", telegram_user_id)
            return client

    async def get_client_by_account_id(self, account_id: int) -> Optional[TelegramClient]:
        data = storage.get_by_account_id(account_id)
        if not data:
            return None
        return await self.get_client(int(data["telegram_user_id"]))

    async def send_message(self, telegram_user_id: int, chat_id: int, text: str) -> dict:
        client = await self.get_client(telegram_user_id)
        if not client:
            raise RuntimeError(f"No active session for telegram_user_id={telegram_user_id}")
        record = self._clients[str(telegram_user_id)]
        async with record.lock:
            try:
                msg = await client.send_message(chat_id, text)
            except FloodWaitError as exc:
                logger.warning("[Sessions] Flood wait %ss for %s", exc.seconds, telegram_user_id)
                raise
            return {"message_id": getattr(msg, "id", None), "date": getattr(msg, "date", None)}

    async def disconnect(self, telegram_user_id: int) -> bool:
        key = str(telegram_user_id)
        async with self._global_lock:
            record = self._clients.pop(key, None)
        if not record:
            return False
        try:
            await record.client.disconnect()
        except Exception:  # noqa: BLE001
            pass
        return True

    def is_loaded(self, telegram_user_id: int) -> bool:
        return str(telegram_user_id) in self._clients

    def list_active_clients(self) -> list[str]:
        return list(self._clients.keys())

    # ── Internals ─────────────────────────────────────────────────────────

    async def _evict_idle(self) -> None:
        idle_seconds = settings.idle_disconnect_minutes * 60
        while True:
            try:
                await asyncio.sleep(60)
                cutoff = time.time() - idle_seconds
                stale: list[str] = []
                async with self._global_lock:
                    for key, record in self._clients.items():
                        if record.last_used < cutoff:
                            stale.append(key)
                for key in stale:
                    async with self._global_lock:
                        record = self._clients.pop(key, None)
                    if record:
                        try:
                            await record.client.disconnect()
                        except Exception:  # noqa: BLE001
                            pass
                        logger.info("[Sessions] Disconnected idle client %s", key)
            except asyncio.CancelledError:
                raise
            except Exception:  # noqa: BLE001
                logger.exception("[Sessions] Idle eviction loop crashed")


session_manager = TelegramSessionManager()
