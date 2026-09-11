"""Message event handling: forward incoming messages to the Node.js backend."""
from __future__ import annotations

import asyncio
import logging
from typing import Optional

import httpx
from telethon import TelegramClient, events
from telethon.tl.types import Message

from .config import settings
from .session_manager import session_manager

logger = logging.getLogger(__name__)


class InboxForwarder:
    """Forwards every NewMessage event to Node.js for AI processing."""

    def __init__(self) -> None:
        self._registered: set[int] = set()  # telegram_user_ids with handler
        self._http: Optional[httpx.AsyncClient] = None

    async def start(self) -> None:
        if self._http is None:
            self._http = httpx.AsyncClient(timeout=15.0)

    async def stop(self) -> None:
        if self._http is not None:
            await self._http.aclose()
            self._http = None

    async def ensure_handler(self, telegram_user_id: int) -> bool:
        """Make sure the running client for ``telegram_user_id`` has a handler.

        Returns True when the handler is wired (or already was). Returns False
        if no client is currently loaded — the caller should call again later
        after `session_manager.get_client` brings it online.
        """
        client = await session_manager.get_client(telegram_user_id)
        if not client:
            return False
        if telegram_user_id in self._registered:
            return True

        @client.on(events.NewMessage(incoming=True))
        async def _on_message(event: events.NewMessage.Event) -> None:  # noqa: WPS430
            await self._dispatch(event, telegram_user_id)

        self._registered.add(telegram_user_id)
        logger.info("[Inbox] Handler registered for %s", telegram_user_id)
        return True

    async def forward_all_loaded(self) -> None:
        """Register handlers for every client currently in the pool."""
        for key in list(session_manager.list_active_clients()):
            try:
                await self.ensure_handler(int(key))
            except Exception:  # noqa: BLE001
                logger.exception("[Inbox] Failed to wire handler for %s", key)

    async def _dispatch(self, event: events.NewMessage.Event, telegram_user_id: int) -> None:
        message: Message = event.message
        if not message or not message.text:
            # Skip media-only for now — chatbot deals with text only.
            return

        sender_name = await self._resolve_sender_name(event)
        payload = {
            "account_id": None,  # resolved by Node.js from telegram_user_id
            "telegram_user_id": telegram_user_id,
            "chat_id": event.chat_id,
            "message_id": message.id,
            "text": message.text,
            "sender_id": event.sender_id,
            "sender_name": sender_name,
            "is_group": bool(getattr(event, "is_group", False)),
            "is_private": bool(getattr(event, "is_private", False)),
        }

        if not settings.nodejs_callback_url:
            logger.debug("[Inbox] No callback URL configured; dropping message")
            return

        if self._http is None:
            await self.start()

        try:
            resp = await self._http.post(  # type: ignore[union-attr]
                settings.nodejs_callback_url,
                json=payload,
                headers={"X-Gateway-Secret": settings.nodejs_callback_secret},
            )
            if resp.status_code >= 400:
                logger.warning(
                    "[Inbox] Node.js responded %s: %s",
                    resp.status_code,
                    resp.text[:200],
                )
        except Exception as exc:  # noqa: BLE001
            logger.exception("[Inbox] Forward to Node.js failed: %s", exc)

    @staticmethod
    async def _resolve_sender_name(event: events.NewMessage.Event) -> Optional[str]:
        try:
            sender = await event.get_sender()
        except Exception:  # noqa: BLE001
            return None
        if not sender:
            return None
        first = getattr(sender, "first_name", "") or ""
        last = getattr(sender, "last_name", "") or ""
        username = getattr(sender, "username", "") or ""
        full = " ".join(part for part in (first, last) if part).strip()
        if not full and username:
            return f"@{username}"
        if full and username:
            return f"{full} (@{username})"
        return full or None


inbox_forwarder = InboxForwarder()
