"""Session management endpoints: create QR login, poll status, list/delete."""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from ..auth import qr_login
from ..config import settings
from ..session_manager import session_manager
from ..storage import storage
from .deps import require_gateway_secret, validate_telegram_config

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/sessions", tags=["sessions"])


class CreateSessionResponse(BaseModel):
    session_id: str
    qr_url: str
    qr_image_base64: str
    expires_at: int


class SessionStatus(BaseModel):
    status: str
    account_id: Optional[int] = None
    user: Optional[dict] = None
    error: Optional[str] = None


class BindAccountRequest(BaseModel):
    account_id: int


class AccountSummary(BaseModel):
    telegram_user_id: int
    account_id: Optional[int]
    phone: Optional[str]
    first_name: Optional[str]
    last_name: Optional[str]
    username: Optional[str]
    is_loaded: bool


class SendMessageRequest(BaseModel):
    chat_id: int
    text: str


@router.post(
    "/create",
    response_model=CreateSessionResponse,
    dependencies=[Depends(require_gateway_secret)],
)
async def create_session() -> CreateSessionResponse:
    """Start a new QR login flow."""
    try:
        validate_telegram_config()
        result = await qr_login.start(settings.tg_api_id, settings.tg_api_hash)
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return CreateSessionResponse(**result)


@router.get(
    "/{session_id}/status",
    response_model=SessionStatus,
    dependencies=[Depends(require_gateway_secret)],
)
async def get_status(session_id: str) -> SessionStatus:
    result = await qr_login.get_status(session_id)
    return SessionStatus(**result)


@router.delete(
    "/{session_id}",
    dependencies=[Depends(require_gateway_secret)],
)
async def cancel_session(session_id: str) -> dict:
    cancelled = await qr_login.cancel(session_id)
    return {"cancelled": cancelled}


@router.post(
    "/by-telegram/{telegram_user_id}/bind",
    dependencies=[Depends(require_gateway_secret)],
)
async def bind_account(telegram_user_id: int, payload: BindAccountRequest) -> dict:
    """Persist the mapping telegram_user_id → account_id (from Node.js)."""
    storage.update_account_id(telegram_user_id, payload.account_id)
    return {"ok": True}


@router.get(
    "",
    response_model=list[AccountSummary],
    dependencies=[Depends(require_gateway_secret)],
)
async def list_accounts() -> list[AccountSummary]:
    items: list[AccountSummary] = []
    for data in storage.list_all():
        telegram_user_id = int(data["telegram_user_id"])
        items.append(
            AccountSummary(
                telegram_user_id=telegram_user_id,
                account_id=data.get("account_id"),
                phone=data.get("phone"),
                first_name=data.get("first_name"),
                last_name=data.get("last_name"),
                username=data.get("username"),
                is_loaded=session_manager.is_loaded(telegram_user_id),
            )
        )
    return items


@router.delete(
    "/by-telegram/{telegram_user_id}",
    dependencies=[Depends(require_gateway_secret)],
)
async def delete_account(telegram_user_id: int) -> dict:
    await session_manager.disconnect(telegram_user_id)
    storage.delete(telegram_user_id)
    return {"deleted": True}


@router.post(
    "/by-telegram/{telegram_user_id}/send",
    dependencies=[Depends(require_gateway_secret)],
)
async def send_message(telegram_user_id: int, payload: SendMessageRequest) -> dict:
    try:
        result = await session_manager.send_message(
            telegram_user_id, payload.chat_id, payload.text
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return result


@router.post(
    "/by-telegram/{telegram_user_id}/ensure-handler",
    dependencies=[Depends(require_gateway_secret)],
)
async def ensure_message_handler(telegram_user_id: int) -> dict:
    """Force the gateway to load the client + register the NewMessage handler."""
    from ..handlers import inbox_forwarder

    loaded = await session_manager.get_client(telegram_user_id)
    if not loaded:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found or not authorized",
        )
    await inbox_forwarder.ensure_handler(telegram_user_id)
    return {"ok": True}
