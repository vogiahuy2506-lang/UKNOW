"""Persistent storage for Telegram session strings.

Uses an on-disk SQLite database keyed by ``telegram_user_id`` so that the
gateway can rehydrate sessions across restarts. The schema intentionally
mirrors the ``telegram_accounts`` table that lives in Node.js — only the
fields the gateway needs to operate are persisted locally.
"""
from __future__ import annotations

import json
import logging
import sqlite3
import threading
from pathlib import Path
from typing import Optional

from .config import settings

logger = logging.getLogger(__name__)


class SessionStorage:
    """Thin wrapper around a local SQLite DB for session strings."""

    def __init__(self, db_path: Optional[Path] = None) -> None:
        self._db_path = db_path or (settings.session_dir / "sessions.db")
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._init_schema()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self._db_path), check_same_thread=False)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_schema(self) -> None:
        with self._lock, self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS sessions (
                    telegram_user_id INTEGER PRIMARY KEY,
                    account_id INTEGER,                -- mirrors telegram_accounts.id from Node.js
                    session_string TEXT NOT NULL,
                    phone TEXT,
                    first_name TEXT,
                    last_name TEXT,
                    username TEXT,
                    metadata TEXT,
                    updated_at REAL DEFAULT (strftime('%s','now'))
                )
                """
            )
            conn.commit()

    # ── CRUD ────────────────────────────────────────────────────────────────

    def upsert(
        self,
        telegram_user_id: int,
        session_string: str,
        *,
        account_id: Optional[int] = None,
        phone: Optional[str] = None,
        first_name: Optional[str] = None,
        last_name: Optional[str] = None,
        username: Optional[str] = None,
        metadata: Optional[dict] = None,
    ) -> None:
        with self._lock, self._connect() as conn:
            conn.execute(
                """
                INSERT INTO sessions (
                    telegram_user_id, account_id, session_string,
                    phone, first_name, last_name, username, metadata, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, strftime('%s','now'))
                ON CONFLICT(telegram_user_id) DO UPDATE SET
                    account_id   = excluded.account_id,
                    session_string = excluded.session_string,
                    phone        = excluded.phone,
                    first_name   = excluded.first_name,
                    last_name    = excluded.last_name,
                    username     = excluded.username,
                    metadata     = excluded.metadata,
                    updated_at   = strftime('%s','now')
                """,
                (
                    telegram_user_id,
                    account_id,
                    session_string,
                    phone,
                    first_name,
                    last_name,
                    username,
                    json.dumps(metadata or {}),
                ),
            )
            conn.commit()

    def get(self, telegram_user_id: int) -> Optional[dict]:
        with self._lock, self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM sessions WHERE telegram_user_id = ?", (telegram_user_id,)
            ).fetchone()
            if not row:
                return None
            data = dict(row)
            try:
                data["metadata"] = json.loads(data.get("metadata") or "{}")
            except json.JSONDecodeError:
                data["metadata"] = {}
            return data

    def get_by_account_id(self, account_id: int) -> Optional[dict]:
        with self._lock, self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM sessions WHERE account_id = ?", (account_id,)
            ).fetchone()
            if not row:
                return None
            data = dict(row)
            try:
                data["metadata"] = json.loads(data.get("metadata") or "{}")
            except json.JSONDecodeError:
                data["metadata"] = {}
            return data

    def delete(self, telegram_user_id: int) -> None:
        with self._lock, self._connect() as conn:
            conn.execute(
                "DELETE FROM sessions WHERE telegram_user_id = ?", (telegram_user_id,)
            )
            conn.commit()

    def list_all(self) -> list[dict]:
        with self._lock, self._connect() as conn:
            rows = conn.execute("SELECT * FROM sessions ORDER BY updated_at DESC").fetchall()
            result: list[dict] = []
            for row in rows:
                data = dict(row)
                try:
                    data["metadata"] = json.loads(data.get("metadata") or "{}")
                except json.JSONDecodeError:
                    data["metadata"] = {}
                result.append(data)
            return result

    def update_account_id(self, telegram_user_id: int, account_id: int) -> None:
        """Bind the local session to a Node.js ``telegram_accounts.id``."""
        with self._lock, self._connect() as conn:
            conn.execute(
                """
                UPDATE sessions SET account_id = ?, updated_at = strftime('%s','now')
                WHERE telegram_user_id = ?
                """,
                (account_id, telegram_user_id),
            )
            conn.commit()


storage = SessionStorage()
