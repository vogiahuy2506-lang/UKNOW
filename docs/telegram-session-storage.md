# Telegram session storage

Tài liệu này giải thích cách session của Telegram (mtcute SDK) được
lưu trữ và khôi phục trong hệ thống UKNOW — đặc biệt sau khi
migration 217 + 218 đưa Postgres trở thành source of truth.

## Tóm tắt

| Thành phần                | Trước migration 217             | Sau migration 217                |
| -------------------------- | ------------------------------- | -------------------------------- |
| Source of truth            | File SQLite trên disk           | Postgres `telegram_session_state` |
| Persistence layer          | `mtcute`'s `SqliteStorage`      | Custom `PostgresBackedTelegramStorage` |
| File on disk               | `.telegram-sessions/<key>/client.session` | (giữ làm fallback) |
| Volume mount               | `/root/uknow/backend/telegram-sessions:/app/.telegram-sessions` | (giữ nguyên) |
| Encryption                 | (không có)                      | AES-256-GCM, key = `SMTP_SECRET_KEY`, wire format `enc:v1:...` |
| Share key với WhatsApp?    | (không)                         | Có — `baileysAuthCrypto.util.js` đã được đổi tên thành `*ChannelSessionBlob` và dùng chung |

## Kiến trúc

```
┌─────────────────────────────────────────────────────────────┐
│                       Container                              │
│                                                              │
│   ┌───────────────────────────┐                              │
│   │  MtProtoTelegramClient    │                              │
│   │  (mtcute SDK)             │                              │
│   └────────────┬──────────────┘                              │
│                │ storage                                     │
│                ▼                                             │
│   ┌───────────────────────────┐                              │
│   │ PostgresBackedTelegramStorage                            │
│   │  • driver (load/save)     │  ◄── writes to Postgres      │
│   │  • kv                     │                              │
│   │  • authKeys               │                              │
│   │  • peers                  │                              │
│   │  • refMessages            │                              │
│   └────────────┬──────────────┘                              │
│                │                                             │
└────────────────┼─────────────────────────────────────────────┘
                 ▼
        ┌─────────────────┐
        │ Postgres        │
        │ telegram_       │
        │ session_state   │  ← encrypted JSONB blob
        │                 │
        │ (.state)        │
        └─────────────────┘
```

Tất cả 5 in-memory repos (`kv`, `authKeys`, `peers`, `refMessages`,
và driver-state) được mtcute populate khi user scan QR hoặc nhận
message. Mỗi khi state thay đổi, `StorageManager.save()` được gọi
bởi mtcute's event hooks (`MtClient.disconnect`,
`PeersService.updatePeersFrom`, `CurrentUserService.store`), và
driver sẽ marshal toàn bộ state → encrypt → UPSERT xuống
`telegram_session_state`.

Không có polling. Mọi thứ là event-driven.

## Schema

`telegram_session_state` (migration 217):

```sql
CREATE TABLE telegram_session_state (
  telegram_user_id BIGINT PRIMARY KEY
    REFERENCES telegram_accounts(telegram_user_id)
    ON DELETE CASCADE,
  state              JSONB        NOT NULL,  -- AES-256-GCM wrapper
  schema_version     INTEGER      NOT NULL DEFAULT 1,
  updated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
```

`telegram_accounts.session_string` đã bị DROP bởi migration 218 (là
placeholder column chưa bao giờ được populate).

## Wire format

Blob được lưu trong `state` column:

```js
{
  // AES-256-GCM wrapper từ utils/baileysAuthCrypto.util.js
  enc: 'enc:v1:<ivHex>:<authTagHex>:<cipherTextHex>',
}
```

Sau khi decrypt, blob là plain object chứa 5 sub-objects
(mirror những gì `PostgresBackedDriver._save()` sinh ra):

```js
{
  kv: { 'foo': <Buffer> },           // Future salts, default DC list, etc.
  authKeys: {
    permanent: { '2': <Buffer> },     // dc -> auth key
    temp: { '2:0': <Buffer> },       // "dc:idx" -> temp key
    tempExpiry: { '2:0': 1234567890 }
  },
  peers: {
    entities: { '<userId>': <PeerInfo> },
    usernameIndex: { 'alice': <userId> },
    phoneIndex: { '+84...': <userId> }
  },
  refMessages: {
    refs: { '<peerId>': ['<chatId>:<msgId>', ...] }
  }
}
```

## Encryption

- Algorithm: AES-256-GCM (AEAD)
- Key: SHA-256 của `SMTP_SECRET_KEY` env var (32 bytes)
- IV: 12 bytes random mỗi lần encrypt
- Auth tag: 16 bytes (GCM native)
- Wire format: `enc:v1:<ivHex>:<authTagHex>:<cipherTextHex>`
- Wrap trong object: `{ enc: 'enc:v1:...' }` để JSONB serialize
  không nhầm với legacy plaintext rows

Helper functions (mới rename, giữ alias cũ):

```js
import {
  encryptChannelSessionBlob,
  decryptChannelSessionBlob,
} from 'src/utils/baileysAuthCrypto.util.js';

// Old names still work as deprecated aliases:
//   encryptBaileysBlob → encryptChannelSessionBlob
//   decryptBaileysBlob → decryptChannelSessionBlob
```

**Quan trọng**: `SMTP_SECRET_KEY` hiện đang share giữa 3 module —
SMTP passwords, WhatsApp Baileys session, và bây giờ là Telegram
session. Khi rotate key, **TẤT CẢ** 3 loại session phải được
re-login. Lên kế hoạch rotation cẩn thận trước khi rotate.

## Migration từ SQLite sang Postgres

### Bước 1: Deploy code mới

Migrations 217 + 218 chạy tự động qua `migrationRunner`. Sau deploy:

- Bảng `telegram_session_state` tồn tại
- Column `telegram_accounts.session_string` đã bị DROP

### Bước 2: Backfill session cũ (chạy thủ công)

Script `scripts/backfillTelegramSessionState.js` đọc mỗi
`<sessionRoot>/<storageKey>/client.session`, extract các bảng
mtcute (`auth_keys`, `temp_auth_keys`, `key_value`, `peers`,
`message_refs`), rồi INSERT vào `telegram_session_state`.

```bash
# Dry-run trước:
node scripts/backfillTelegramSessionState.js --dry-run

# Apply:
node scripts/backfillTelegramSessionState.js
```

Script xử lý 2 trường hợp:

- **storageKey = `tg-<id>`** (post-217 client): lấy trực tiếp
  `telegram_user_id` từ storage key.
- **storageKey = `default` hoặc khác** (legacy client): đọc
  `current_user_id` từ `key_value` table.

Nếu script không tìm được `telegram_user_id`, nó sẽ skip với
warning — operator cần manual re-scan QR cho account đó.

### Bước 3: Restart container + verify

Sau backfill, restart container. Các session cũ giờ đã có trong
Postgres. Container vẫn mount volume `.telegram-sessions/` làm
fallback — **KHÔNG XÓA** volume ngay. Sau khi confirm mọi account
hoạt động đúng (~24h monitoring), có thể xóa volume mount khỏi
deploy workflow.

## Ops

### "1 row Postgres corrupt"

Nếu 1 row trong `telegram_session_state` bị corrupt
(wrong key, missing columns, etc.), flow xử lý:

1. `getSessionString()` returns `null` (decryption failed)
2. `TelegramSessionManager.getClient()` returns `null`
3. Controller renders "session expired, please re-scan"
4. User scan QR lại → session được persist lại

Không cần manual intervention.

### Multi-instance considerations

Hiện production chạy 1 container duy nhất. Nếu scale horizontal:

- Postgres là source of truth → tự nhiên share giữa instances
- **Race risk**: 2 instances ghi `saveSessionState` đồng thời
  có thể clobber nhau. Hiện chưa có Postgres advisory lock — nếu
  scale horizontal, cần thêm `pg_try_advisory_xact_lock(hash(telegram_user_id))`
  trong `PostgresBackedDriver.save()`.

### Rollback

Nếu deploy mới gặp lỗi nghiêm trọng:

1. `git revert` commit → redeploy code cũ
2. **Không** drop migrations 217/218 thủ công — code cũ vẫn
   chạy được (Postgres có thêm 1 table + 1 column drop là no-op).
3. Migrations 218 đã DROP `session_string` column. Restore bằng
   cách chạy:
   ```sql
   ALTER TABLE telegram_accounts ADD COLUMN session_string TEXT;
   ```
   (không cần thiết vì column này đã không được dùng từ trước).
4. Sau rollback, **không** xóa `telegram_session_state` table —
   chạy backfill ngược lại nếu cần:
   ```bash
   node scripts/backfillTelegramSessionState.js
   ```

## Files liên quan

| File | Vai trò |
| --- | --- |
| `migrations/217_telegram_session_state.sql` | Tạo table `telegram_session_state` |
| `migrations/218_telegram_drop_session_string.sql` | DROP column placeholder |
| `src/repositories/chatbot/chatbotTelegram.repository.js` | Methods `saveSessionState`, `loadSessionState`, `deleteSessionState`, `listAllSessionStateKeys` |
| `src/services/chatbot/inProcChannelGateway/telegramMtProtoStorage.js` | Custom Postgres-backed mtcute `StorageProvider` |
| `src/services/chatbot/inProcChannelGateway/mtProtoTelegramClient.js` | Constructor accepts `storageProvider` param |
| `src/services/chatbot/inProcChannelGateway/telegramSessionManager.js` | Lazy-imports storage module; passes `storageProvider` to `buildDefaultClient` |
| `src/services/chatbot/inProcChannelGateway/telegramAuth.js` | Calls `flush()` before persisting; uses `saveSession()` marker |
| `src/utils/baileysAuthCrypto.util.js` | Renamed: `*ChannelSessionBlob` (Baileys aliases kept for back-compat) |
| `scripts/backfillTelegramSessionState.js` | One-shot migration script |
