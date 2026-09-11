# Telegram Gateway (UKNOW)

Lightweight Python microservice that brokers MTProto connections for many
Telegram personal accounts on behalf of the UKNOW Node.js backend.

The Node.js backend never speaks MTProto directly. It just calls REST
endpoints here to:

- start a QR login flow
- poll login status
- list / bind / delete accounts
- send outgoing messages via a Telegram account
- receive a webhook when an incoming message arrives

## Quick start

```bash
cd telegram-gateway
python -m venv .venv
source .venv/bin/activate  # or .venv\Scripts\activate on Windows
pip install -e .
cp .env.example .env  # then fill TG_API_ID, TG_API_HASH, secrets
uvicorn app.main:app --host 0.0.0.0 --port 8765
```

Health check:

```bash
curl http://localhost:8765/health/ping
```

## API

All `/sessions/*` endpoints require the shared secret:

```bash
curl -H "X-Gateway-Secret: $GATEWAY_SECRET" ...
```

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/sessions/create` | Start a QR login flow → `{ session_id, qr_image_base64, qr_url, expires_at }` |
| `GET`  | `/sessions/{session_id}/status` | Poll status (`awaiting_scan`, `success`, `expired`) |
| `DELETE` | `/sessions/{session_id}` | Cancel a pending QR login |
| `GET`  | `/sessions` | List stored accounts |
| `POST` | `/sessions/by-telegram/{tg_user_id}/bind` | Bind Telegram user → Node.js account_id |
| `DELETE` | `/sessions/by-telegram/{tg_user_id}` | Disconnect + drop session |
| `POST` | `/sessions/by-telegram/{tg_user_id}/send` | Send a chat message |
| `POST` | `/sessions/by-telegram/{tg_user_id}/ensure-handler` | Hot-load + register NewMessage handler |
| `GET`  | `/health` | Authenticated health snapshot |
| `GET`  | `/health/ping` | Open liveness probe |

## Required env vars

| Variable | Description |
|----------|-------------|
| `TG_API_ID`, `TG_API_HASH` | From <https://my.telegram.org/apps> |
| `GATEWAY_SECRET` | Shared secret with Node.js |
| `NODEJS_CALLBACK_URL` | Where to POST incoming messages |
| `NODEJS_CALLBACK_SECRET` | Sent as `X-Gateway-Secret` header |

## Operational notes

- Telethon stores sessions as **StringSession** blobs inside SQLite
  (`sessions/sessions.db`). Back this directory up — losing it logs every
  user out.
- Idle clients (no traffic for `IDLE_DISCONNECT_MINUTES`) are evicted to
  keep RAM bounded. The next request re-hydrates the client from disk.
- For multi-tenant scale, put the gateway behind a load balancer and point
  multiple Node.js instances at it. Keep only one Telegram gateway per IP
  unless you front each pod with its own SOCKS5/MTProxy.
