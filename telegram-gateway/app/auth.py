"""QR login flow using Telegram's auth.exportLoginToken + auth.acceptLoginToken.

Reference: https://core.telegram.org/api/qr-login

Flow summary:
  1. Create an unauthorized TelegramClient (StringSession empty).
  2. Call auth.exportLoginToken → receive a binary token (TTL ~30s).
  3. Encode the token as `tg://login?token=...` and render as a QR code.
  4. Poll auth.checkLoginToken in the background. Once the user scans and
     accepts on another device, Telegram returns auth.authorization.
  5. Persist the resulting session string + me info via storage.
"""
from __future__ import annotations

import asyncio
import base64
import io
import logging
import secrets
import time
from dataclasses import dataclass, field
from typing import Optional

import qrcode
from telethon import TelegramClient
from telethon.errors import (
    rpcerrorlist,
)
from telethon.sessions import StringSession
from telethon.tl.functions.auth import (
    AcceptLoginTokenRequest,
    CheckLoginTokenRequest,
    ExportLoginTokenRequest,
)
from telethon.tl.types.auth import (
    LoginToken,
    LoginTokenMigrateTo,
    LoginTokenSuccess,
)

from .storage import storage

logger = logging.getLogger(__name__)


@dataclass
class QrLoginSession:
    session_id: str
    client: TelegramClient
    token_b64: str
    expires_at: float
    user_id: Optional[int] = None
    me: Optional[dict] = None
    account_id: Optional[int] = None
    status: str = "awaiting_scan"  # awaiting_scan | migrating | success | expired | error
    error: Optional[str] = None
    poll_task: Optional[asyncio.Task] = field(default=None, repr=False)


class QrLoginFlow:
    """Coordinates QR login attempts across concurrent users."""

    POLL_INTERVAL_SECONDS = 3.0
    TOKEN_TTL_SECONDS = 30.0

    def __init__(self) -> None:
        self._flows: dict[str, QrLoginSession] = {}
        self._lock = asyncio.Lock()

    # ── Public API ────────────────────────────────────────────────────────

    async def start(self, api_id: int, api_hash: str) -> dict:
        """Start a new QR login flow. Returns the QR + session_id for polling."""
        client = TelegramClient(StringSession(), api_id, api_hash)
        await client.connect()

        try:
            result = await client(ExportLoginTokenRequest(
                api_id=api_id,
                api_hash=api_hash,
                except_ids=[],
            ))
        except Exception as exc:
            await client.disconnect()
            logger.exception("[QR] Failed to export login token")
            raise RuntimeError(f"Failed to start QR login: {exc}") from exc

        if not isinstance(result, LoginToken):
            await client.disconnect()
            raise RuntimeError(f"Unexpected ExportLoginToken response: {type(result).__name__}")

        token_b64 = base64.urlsafe_b64encode(result.token).decode()
        qr_url = f"tg://login?token={token_b64}"
        qr_image = self._render_qr(qr_url)
        expires_at = time.time() + self.TOKEN_TTL_SECONDS

        flow = QrLoginSession(
            session_id=secrets.token_urlsafe(16),
            client=client,
            token_b64=token_b64,
            expires_at=expires_at,
        )
        async with self._lock:
            self._flows[flow.session_id] = flow

        # Start background polling
        flow.poll_task = asyncio.create_task(self._poll_until_done(flow))

        return {
            "session_id": flow.session_id,
            "qr_url": qr_url,
            "qr_image_base64": qr_image,
            "expires_at": int(expires_at),
        }

    async def get_status(self, session_id: str) -> dict:
        flow = self._flows.get(session_id)
        if not flow:
            return {"status": "not_found"}
        payload: dict = {"status": flow.status}
        if flow.status == "success":
            payload["account_id"] = flow.account_id
            payload["user"] = flow.me
        if flow.status == "expired":
            payload["error"] = flow.error or "QR token expired"
        return payload

    async def cancel(self, session_id: str) -> bool:
        flow = self._flows.pop(session_id, None)
        if not flow:
            return False
        if flow.poll_task and not flow.poll_task.done():
            flow.poll_task.cancel()
        try:
            await flow.client.disconnect()
        except Exception:  # noqa: BLE001 - disconnect best-effort
            pass
        return True

    # ── Internals ─────────────────────────────────────────────────────────

    async def _poll_until_done(self, flow: QrLoginSession) -> None:
        """Poll Telegram until the user scans or the token expires."""
        try:
            while True:
                if time.time() >= flow.expires_at:
                    flow.status = "expired"
                    flow.error = "QR token expired before scan"
                    break

                try:
                    result = await flow.client(CheckLoginTokenRequest(token=flow.token_b64_padded))
                except rpcerrorlist.AuthBytesInvalidError:
                    # Token got invalidated (e.g. user logged in elsewhere).
                    flow.status = "expired"
                    flow.error = "Token invalid"
                    break
                except Exception as exc:  # noqa: BLE001
                    logger.warning("[QR] CheckLoginToken error: %s", exc)
                    await asyncio.sleep(self.POLL_INTERVAL_SECONDS)
                    continue

                if isinstance(result, LoginTokenSuccess):
                    await self._on_login_success(flow, result)
                    break
                if isinstance(result, LoginTokenMigrateTo):
                    await self._on_login_migrate(flow, result)
                    break

                # Still waiting. Telegram returns LoginToken (unchanged) until
                # the user accepts.
                await asyncio.sleep(self.POLL_INTERVAL_SECONDS)
        except asyncio.CancelledError:
            logger.info("[QR] Polling cancelled for session %s", flow.session_id)
            raise
        except Exception as exc:  # noqa: BLE001
            logger.exception("[QR] Unexpected error during polling")
            flow.status = "error"
            flow.error = str(exc)
        finally:
            try:
                await flow.client.disconnect()
            except Exception:  # noqa: BLE001
                pass

    async def _on_login_success(self, flow: QrLoginSession, result: LoginTokenSuccess) -> None:
        me = result.authorization.user
        flow.user_id = int(me.id)
        flow.me = {
            "telegram_user_id": int(me.id),
            "first_name": getattr(me, "first_name", None),
            "last_name": getattr(me, "last_name", None),
            "username": getattr(me, "username", None),
            "phone": getattr(me, "phone", None),
        }
        session_string = flow.client.session.save()
        storage.upsert(
            telegram_user_id=flow.user_id,
            session_string=session_string,
            phone=flow.me["phone"],
            first_name=flow.me["first_name"],
            last_name=flow.me["last_name"],
            username=flow.me["username"],
        )
        flow.status = "success"
        logger.info("[QR] Login success for telegram_user_id=%s", flow.user_id)

    async def _on_login_migrate(self, flow: QrLoginSession, result: LoginTokenMigrateTo) -> None:
        """Re-issue the token to the correct DC."""
        try:
            new_token = result.token
            flow.status = "migrating"
            accept_result = await flow.client(
                AcceptLoginTokenRequest(token=new_token)
            )
            if isinstance(accept_result, LoginTokenSuccess):
                await self._on_login_success(flow, accept_result)
            else:
                flow.status = "expired"
                flow.error = "Migration returned unexpected payload"
        except Exception as exc:  # noqa: BLE001
            logger.exception("[QR] Migration failed")
            flow.status = "error"
            flow.error = f"Migration failed: {exc}"

    @staticmethod
    def _render_qr(data: str) -> str:
        qr = qrcode.QRCode(version=1, box_size=8, border=2)
        qr.add_data(data)
        qr.make(fit=True)
        img = qr.make_image(fill_color="black", back_color="white")
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        return base64.b64encode(buf.getvalue()).decode()


qr_login = QrLoginFlow()
