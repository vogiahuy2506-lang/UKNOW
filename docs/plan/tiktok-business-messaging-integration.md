# Plan triển khai: Tích hợp TikTok Business Messaging cho UKNOW

> Ngày: 11/10/2026 · Repo: UKNOW · Phiên bản docs TikTok: v1.3 (open beta)
> Bối cảnh: Nghiên cứu ở `docs/research/tiktok-business-messaging-integration.md` đã chốt điểm mấu chốt
> (rate limit 10/48h, OAuth 24h+365d, webhook envelope có `content` dạng string). Plan này là bản triển khai.
> **Bản sửa 11/10 10:04** — loại bỏ 6 "GIẢ ĐỊNH" vì đã verify trực tiếp file thật trong repo. Mỗi quyết định
> dùng lại hàm / pattern đều kèm `file:dòng` đã đọc.
> **Bản sửa 11/10 10:09** — bổ sung theo `docs/research/tiktok-connection-options-2026.md`:
> 1) nghiên cứu kỹ 4 lựa chọn liên kết TikTok — **Business Messaging API là con đường duy nhất chính thức**;
> 2) thêm ràng buộc region (EEA/Thụy Sĩ/UK blocked);
> 3) thêm 3 tier entitlement (General / Advanced Access / Verified Business);
> 4) thêm bẫy DM privacy = "Friends" → message requests không tới được API.
> User UKNOW là SME/Shop owner VN (xác minh từ `uknow.edu.vn`) → đã có hoặc nên có Business Account.
> Personal account automation vi phạm TOS TikTok → không xét.

---

## Bối cảnh

UKNOW hiện đã có mạch kết nối + chatbot AI reply cho **Zalo OA** (`backend/src/services/chatbot/channelAdapters/zaloOA.adapter.js:19`),
**Facebook Messenger** (`backend/src/services/chatbot/channelAdapters/facebook.adapter.js:15`),
**Telegram** (`backend/src/services/chatbot/channelAdapters/telegram.adapter.js:33`),
**WhatsApp Cloud / Baileys** (`backend/src/services/chatbot/channelAdapters/whatsapp.adapter.js`).
Mỗi kênh đều có 3 tầng: **settings controller** (OAuth, list, refresh) → **adapter** (gọi API nhà cung cấp) → **webhook** (nhận tin nhắn vào).
ChannelSettings FE (`frontend/src/pages/settings/ChannelSettings.jsx:12-18`) hiện có 5 tab: email / facebook / zalo / whatsapp / telegram.
Chưa có tab TikTok, chưa có adapter, chưa có webhook nhận.

TikTok Business Messaging v1.3 cung cấp OAuth + DM API + 8 webhook event. Rate limit cứng **10 tin/48h/conversation** —
cần `tiktokRateLimit.service.js` riêng (khác biệt so với các kênh khác).

UKNOW đã có sẵn các "viên gạch" cần dùng:
- **Crypto helper**: `backend/src/utils/smtpSecretCrypto.js:7` (`encryptSmtpSecret`/`decryptSmtpSecret`, AES-256-GCM, key `SMTP_SECRET_KEY`)
- **JSONB-friendly wrapper**: `backend/src/utils/baileysAuthCrypto.util.js:114-125` (`encryptChannelSessionBlob`/`decryptChannelSessionBlob`)
- **Token crypto cho Zalo cookie**: `backend/src/utils/zaloCookieCrypto.util.js:23-27` (pattern để copy cho tiktok)
- **Redis (ioredis) đã dùng ở 4 nơi**: `backend/src/services/chatbot/chatbotRateLimit.service.js:2` — `chatbotRateLimit`, `outboundMessageQueue`, `kbDocumentQueue`, `widgetUploadCap`. Env: `BULLMQ_REDIS_URL` hoặc `REDIS_*` (`chatbotRateLimit.service.js:33-42`)
- **Cron pattern**: tất cả cron nằm trong `backend/src/utils/scheduler.js:653-1700` (hàm `initScheduler`), mỗi cron wrap `cronJobRunRepository.recordRun(<code>, async () => {...})`. TikTok token refresh sẽ thêm cron ở ĐÂY, không tạo file mới.
- **Token refresh cho Facebook có sẵn**: `backend/src/services/chatbot/facebookTokenRefresh.service.js:1-7` + cron ở `scheduler.js:1668-1700` (chạy `0 3 * * *`). Pattern này copy y cho TikTok.

---

## Việc 1 — Migration 296: mở rộng schema (PR-1)

### 1.1. Mở rộng `chatbot_channel_connections.channel_type`

Bảng `chatbot_channel_connections` hiện có CHECK ở `backend/migrations/043_chatbot_channel_connections.sql:8`
`CHECK (channel_type IN ('zalo_oa', 'facebook'))`, đã được mở rộng 2 lần ở `backend/migrations/194_chatbot_whatsapp_channel_and_settings.sql`
và `backend/migrations/200_chatbot_channel_connections_baileys_check_v2.sql:5-6` thành `('zalo_oa', 'facebook', 'whatsapp', 'whatsapp_baileys')`.

**Làm**: Tạo `backend/migrations/296_chatbot_channel_connections_tiktok_business.sql` (số tiếp theo; 295 là mới nhất ở `ls backend/migrations/29*.sql | tail -3`).

```sql
-- Migration 296: thêm 'tiktok_business' vào chatbot_channel_connections.channel_type
-- Pattern: copy từ migration 200 (SUPERSET, DROP+ADD trong cùng transaction, không data rewrite).
-- Cho phép mỗi chatbot có NHIỀU tài khoản TikTok Business (giống pattern 'whatsapp_baileys' ở 200), nên KHÔNG dùng
-- UNIQUE(id_chatbot, channel_type) — dùng partial UNIQUE mới: 1 dòng 'tiktok_business' cho legacy fallback (khi
-- chưa có bảng tài khoản riêng), nhưng thực tế sẽ có UNIQUE ở bảng tiktok_business_accounts.

ALTER TABLE chatbot_channel_connections
  DROP CONSTRAINT IF EXISTS chatbot_channel_connections_channel_type_check,
  ADD CONSTRAINT chatbot_channel_connections_channel_type_check
    CHECK (channel_type IN ('zalo_oa', 'facebook', 'whatsapp', 'whatsapp_baileys', 'tiktok_business'));
```

**Vì sao mở rộng CHECK thay vì tạo bảng mới**: đã có sẵn 2 migration minh hoạ pattern này (194, 200); schema phải khớp để
code `chatbotChannelRepository.upsertChannel` (`backend/src/repositories/ai/chatbotChannel.repository.js:50-74`) chạy được.

### 1.2. Tạo bảng `tiktok_business_accounts`

Lưu: `id`, `id_user` (FK `users(id)`), `business_id` (open_id từ OAuth), `display_name`, `access_token` (encrypted bằng `encryptSmtpSecret`),
`refresh_token` (encrypted), `scope` (TEXT), `access_token_expires_at`, `refresh_token_expires_at`, `is_active`,
`last_webhook_at`, `created_at`, `updated_at`. UNIQUE(`id_user`, `business_id`).

**Vì sao KHÔNG dùng `channel_connections`**: bảng `channel_connections` (`backend/migrations/031_chatbot_knowledge_base.sql`)
là multi-channel, có cột `fb_user_id`, `fb_page_id`, `fb_page_name` chỉ dành cho Facebook — TikTok cần `business_id`/`access_token`/...
Pattern phù hợp nhất là **bảng riêng** như `telegram_accounts` / `zalo_settings` đã làm (xem `backend/migrations/292_member_channel_accounts_telegram_whatsapp.sql:7` — bảng 283 cũng tham chiếu `telegram_accounts` riêng).

**Vì sao KHÔNG thêm cột mới vào `chatbot_channel_connections`**: bảng đó là 1-dòng-per-(chatbot, channel) cũ; thêm cột sẽ
làm cồng kềnh vì mỗi user có thể liên kết nhiều tài khoản TikTok Business (multi-business).

### 1.3. Mapping `tiktok_business_accounts` ↔ `chatbot_channel_connections`

Mỗi chatbot khi bật TikTok sẽ tạo 1 dòng `chatbot_channel_connections` với:
- `channel_type = 'tiktok_business'`
- `external_channel_id = tiktok_business_accounts.business_id` (lookup ngược)
- `credentials` lưu `{ tiktok_business_account_id: <id> }` tham chiếu bảng trên
- `webhook_url` lưu URL callback do UKNOW cấp cho TikTok gọi

**Lưu ý** (sửa từ giả định cũ): TikTok chỉ gọi 1 URL duy nhất đã đăng ký qua `/business/webhook/update/` ở cấp app. UKNOW sẽ phân luồng URL tới `channel_connection` nào qua (`user_openid` + `client_key`) trong `chatbotChannelWebhook.controller.js` — không dùng `webhook_token` per-channel như Zalo OA. Cần thêm 1 method mới `findActiveChannelByBusinessId(businessId)` vào `chatbotChannelRepository` (tương tự `findActiveChannel` ở `backend/src/repositories/ai/chatbotChannel.repository.js:34-43` nhưng lookup theo `external_channel_id`).

### 1.4. Mirror sang `bootstrap.sql`

> **BẮT BUỘC** — `backend/tests/integration/sql/bootstrap.sql` chạy trong CI integration test. Có job `schema-sync-check` chặn việc thiếu mirror (skill `viet-plan:42-45`).

**Vì sao mục này có**: skill `viet-plan` quy định migration thêm bảng/cột phải mirror. Test thực tế (`grep -c "29[2-5]" backend/tests/integration/sql/bootstrap.sql` = 0) cho thấy các migration 292-295 chưa có trong bootstrap → team phải bổ sung trước khi bắt đầu PR này (không thuộc phạm vi PR TikTok nhưng là blocker).

### 1.5. Nghiệm thu PR-1

| Tình huống | Kỳ vọng |
|---|---|
| Chạy migration trên DB trống | 1 bảng mới + 1 CHECK mới; không lỗi |
| Chạy lại migration | `IF NOT EXISTS` + `DROP IF EXISTS` → idempotent, không lỗi |
| `SELECT DISTINCT channel_type FROM chatbot_channel_connections` | Trả về 4 giá trị cũ + `'tiktok_business'` |
| Insert 1 dòng `tiktok_business_accounts` với `access_token` mã hoá bằng `encryptSmtpSecret` | Thành công; select ra nhận ciphertext bắt đầu bằng `enc:v1:` (prefix ở `smtpSecretCrypto.js:5`) |
| Insert trùng `(id_user, business_id)` | Lỗi UNIQUE |

---

## Việc 2 — Service & repository mới (PR-1, tiếp)

### 2.1. Repository

`backend/src/repositories/ai/tiktokBusinessAccount.repository.js`:
- `listByUser(userId)` — `SELECT * FROM tiktok_business_accounts WHERE id_user = $1 ORDER BY created_at DESC`
- `findByBusinessId(userId, businessId)`
- `findById(id, userId)` — có check ownership để chống IDOR (giống pattern `getFacebookConnectionById` ở `backend/src/repositories/ai/channelConnections.repository.js:96-100`)
- `upsert({ userId, businessId, displayName, accessToken, refreshToken, scope, accessExpiresAt, refreshExpiresAt })` — `accessToken`/`refreshToken` đã được caller mã hoá bằng `encryptSmtpSecret` (giống `telegram_accounts` ở `backend/src/repositories/chatbot/chatbotTelegram.repository.js` dùng `encryptSmtpSecret`)
- `updateTokens(id, { accessToken, refreshToken, accessExpiresAt })`
- `deactivate(id, userId)`
- `touchWebhook(id)` — UPDATE `last_webhook_at = NOW()`
- `findExpiringForRefresh(bufferHours = 2)` — trả về danh sách `access_token_expires_at < NOW() + INTERVAL '<bufferHours> hours' AND is_active = true` (cho cron)

### 2.2. Service OAuth

`backend/src/services/tiktok/tiktokOAuth.service.js` (theo pattern folder `backend/src/services/zalo/`):
- `getAuthorizeUrl({ userId, redirectUri, state })` — trả URL `https://www.tiktok.com/v2/auth/authorize/?client_key=...&scope=...&response_type=code&redirect_uri=...&state=...`
- `exchangeCodeForToken({ code, redirectUri })` — `POST https://open.tiktokapis.com/v2/oauth/token/` form-urlencoded, lấy `access_token` (24h), `refresh_token` (365d), `open_id`, `scope`, `expires_in`, `refresh_expires_in`
- `refreshToken({ refreshToken })` — `POST .../oauth/token/` `grant_type=refresh_token`
- `revoke({ accessToken })` — `POST .../oauth/revoke/`
- `signState(userId, nonce)` / `verifyState(state)` — HMAC-SHA256(userId + nonce, `TIKTOK_STATE_SECRET` env)

Env: `TIKTOK_APP_CLIENT_KEY`, `TIKTOK_APP_CLIENT_SECRET`, `TIKTOK_OAUTH_TOKEN_BASE`, `TIKTOK_STATE_SECRET`.

### 2.3. Service cron refresh — thêm vào `scheduler.js`, KHÔNG tạo file mới

UKNOW **không có folder `jobs/` hay `cron/`** (xác minh `ls backend/src/jobs` và `ls backend/src/cron` đều không tồn tại). Tất cả cron đăng ký ở `backend/src/utils/scheduler.js:653-1700` trong hàm `initScheduler()`, mỗi cron wrap bằng `cronJobRunRepository.recordRun(<code>, async () => {...})`.

**Làm**: Tạo `backend/src/services/tiktok/tiktokTokenRefresh.service.js` (chứa logic), rồi mount cron vào `backend/src/utils/scheduler.js` ngay sau Facebook token refresh ở dòng 1698. Pattern copy y hệt từ `facebookTokenRefresh` ở `scheduler.js:1668-1700`:

```js
// Trong scheduler.js, sau Facebook token refresh:
const tiktokTokenRefreshEnabled = String(process.env.TIKTOK_TOKEN_REFRESH_ENABLED ?? 'true').toLowerCase() !== 'false';
if (tiktokTokenRefreshEnabled) {
  const refreshTikTokTokens = async () => {
    const cronJobRunRepository = await import('../repositories/admin/cronJobRun.repository.js');
    try {
      await cronJobRunRepository.recordRun('tiktok_token_refresh', async () => {
        const { refreshExpiringTikTokTokens } = await import('../services/tiktok/tiktokTokenRefresh.service.js');
        const result = await refreshExpiringTikTokTokens({ bufferHours: 2 });
        if (result.refreshed > 0 || result.failed > 0) {
          console.log(`[Scheduler][TikTok] Token refresh: total=${result.total} refreshed=${result.refreshed} failed=${result.failed} deactivated=${result.deactivated}`);
        }
        return { total: result.total, refreshed: result.refreshed, failed: result.failed, deactivated: result.deactivated, synced: result.refreshed };
      });
    } catch (error) {
      console.error('[Scheduler] Lỗi refresh TikTok tokens:', error.message);
    }
  };

  // Chạy 02:00 mỗi ngày (lệch giờ với Facebook 03:00 để tránh trùng phút 0)
  cron.schedule('0 2 * * *', async () => {
    await refreshTikTokTokens();
  }, { timezone: HANOI_TIME_ZONE });

  console.log('[Scheduler] Đã khởi tạo TikTok token refresh: 02:00 hàng ngày');
}
```

`refreshExpiringTikTokTokens({ bufferHours })` ở `tiktokTokenRefresh.service.js`:
- Gọi `tiktokBusinessAccountRepository.findExpiringForRefresh(bufferHours)`
- Với mỗi account: gọi `tiktokOAuthService.refreshToken({ refreshToken: decryptSmtpSecret(account.refresh_token) })`
- Update token mới (đã mã hoá) + `access_token_expires_at`
- Nếu refresh throw (refresh_token hết hạn 365d) → `deactivate(id, userId)` + log

### 2.4. Nghiệm thu PR-1 (service)

| Tình huống | Kỳ vọng |
|---|---|
| Mock fetch 200 từ `open.tiktokapis.com/v2/oauth/token/` | `exchangeCodeForToken` trả object đầy đủ, lưu DB thành công với `access_token` có prefix `enc:v1:` |
| Mock fetch 401 (invalid code) | Throw error có `code` + `message` + `request_id` để debug |
| Refresh token đã huỷ | Mark `is_active = false`, không throw |
| Cron chạy với 0 dòng sắp hết hạn | `recordRun('tiktok_token_refresh', ...)` trả về `synced=0`, log "no-op" |
| Cron chạy với 3 dòng sắp hết hạn | 3 lần refresh song song (Promise.all), log kết quả |
| `verifyState(state)` với state sai | Throw; controller trả 401 |
| `verifyState(state)` đúng user + nonce | Return `{ userId, nonce }` |

---

## Việc 3 — Settings controller + routes (PR-2)

### 3.1. Controller

`backend/src/controllers/tiktokSettings.controller.js` — pattern giống `backend/src/controllers/facebookSettings.controller.js:1-14`:

| Endpoint | Method | Mục đích | Permission |
|---|---|---|---|
| `GET /api/settings/tiktok-business/connect` | GET | Sinh state + redirect tới TikTok authorize URL | `chatbot_channels_manage` |
| `GET /api/settings/tiktok-business/callback` | GET | Đổi code → token, upsert account, redirect FE về `/app/settings/channels#tiktok` | (không auth — dùng `state` HMAC) |
| `GET /api/settings/tiktok-business/accounts` | GET | List tài khoản của user | `chatbot_channels_manage` |
| `POST /api/settings/tiktok-business/accounts/:id/refresh` | POST | Force refresh 1 account | `chatbot_channels_manage` |
| `DELETE /api/settings/tiktok-business/accounts/:id` | DELETE | Deactivate | `chatbot_channels_manage` |
| `POST /api/settings/tiktok-business/accounts/:id/test-send` | POST | Gửi 1 tin test (cần có conversation sẵn) | `chatbot_channels_manage` |

`sanitize(account)` giống `facebookSettings.controller.js:13-22` (bỏ `access_token`, `refresh_token`; trả `has_credentials: true`).

### 3.2. Routes

`backend/src/routes/tiktokSettings.routes.js` (pattern giống `backend/src/routes/facebookSettings.routes.js:1-9`):
- **KHÔNG** dùng `router.use(authMiddleware)` global — copy pattern Facebook (chỉ middleware ở từng route, `facebookSettings.routes.js:18-31`).
- Mount tại `/api/settings` (giống Facebook ở `backend/src/app.js:207`: `app.use('/api/settings', facebookSettingsRoutes);`).

Callback endpoint mount NGOÀI `authMiddleware` vì TikTok redirect trực tiếp (không có session). Dùng `state` HMAC để xác minh (xem 2.2).

### 3.3. Nghiệm thu PR-2

| Tình huống | Kỳ vọng |
|---|---|
| `GET /connect` (user login) | 302 redirect tới `https://www.tiktok.com/v2/auth/authorize/?...&state=<hmac>...` |
| Callback với `state` sai | 401 |
| Callback với `code` hợp lệ, mock OAuth thành công | Account mới trong DB với token mã hoá, redirect 302 về FE |
| Callback với `code` đã dùng (mock 401) | Trang lỗi có `request_id` |
| `GET /accounts` (user A login) | Chỉ thấy account của A; `access_token` không lộ |

---

## Việc 4 — TikTok adapter (PR-3)

`backend/src/services/chatbot/channelAdapters/tiktokBusiness.adapter.js` — pattern theo `facebook.adapter.js:15-89`:

```js
async sendReply({ externalId, message, userId, channelId, attachments }) {
  // externalId = conversation_id, channelId = chatbot_channel_connections.id
  // 1. Lấy channel: chatbotChannelRepository.findActiveChannelById(channelId) -> lấy credentials.tiktok_business_account_id
  // 2. Lấy account: tiktokBusinessAccountRepository.findById(accountId, userId)
  // 3. Decrypt access_token: decryptSmtpSecret(account.access_token)
  // 4. text: slice(0, 6000)
  // 5. attachments: upload trước qua /business/message/image/upload/ (JPG/PNG ≤3MB), lấy media_id
  // 6. POST /business/message/send/ với body đúng schema
  // 7. Tự refresh 1 lần nếu TikTok trả 401 (giống facebook refresh khi token fail)
}
```

**Vì sao KHÔNG dùng `channelId` = `chatbot_channel_connections.id` thẳng vào DB token**: pattern Facebook ở `facebook.adapter.js:23-32` tra `chatbotChannelRepository.getChannelPageAccessToken(channelId)`, tức dùng trực tiếp `channelId` để lấy token. Bảng `tiktok_business_accounts` TÁCH RIÊNG khỏi `chatbot_channel_connections`, nên cần 1 lệnh JOIN: `chatbot_channel_connections.credentials->>'tiktok_business_account_id'` → `tiktok_business_accounts.id`.

### 4.1. Nghiệm thu PR-3 (adapter)

| Tình huống | Kỳ vọng |
|---|---|
| Gửi 1 tin text 100 chars | POST tới TikTok với body đúng schema; return `{ success: true }` |
| Token hết hạn (mock 401) | Tự động refresh 1 lần; nếu refresh thất bại → return `{ success: false, error }` |
| Text > 6000 chars | Tự `slice(0, 6000)`; không throw |
| attachments rỗng | Chỉ gửi text, không upload |
| 1 attachment JPG 1MB | Upload trước, lấy `media_id`, gửi message `image` với `image.image_id` |
| 1 attachment 5MB (>3MB) | Reject trước khi gửi, throw "ảnh > 3MB" |

---

## Việc 5 — Webhook nhận + verify (PR-3, tiếp)

### 5.1. Mount route mới

`backend/src/routes/webhook.routes.js` hiện tại mount tại `/api/webhooks` (`backend/src/app.js:202`):

```js
router.post('/tiktok-business', webhookLimiter, chatbotChannelWebhookController.handleTikTokBusiness.bind(chatbotChannelWebhookController));
```

### 5.2. Verify

TikTok **không ký HMAC** (xác minh trong research mục 1.4 và 4.5). Verify bằng:
- Body parse JSON 2 lần: `JSON.parse(req.body)` cho envelope, `JSON.parse(req.body.content)` cho content (nếu content là chuỗi).
- `client_key` phải nằm trong whitelist env `TIKTOK_APP_CLIENT_KEYS` (nhiều key cách dấu phẩy). Nếu trống env → log warn một lần + vẫn xử lý (giống `zaloOaWebhookSecrets` ở `chatbotChannelWebhook.controller.js:107-112`).
- Reject nếu `event` không thuộc 8 giá trị biết.
- Response 200 trong **< 3s** (TikTok timeout nghiêm ngặt hơn Meta). Pattern "respond quickly" đã có ở `handleZaloOA` (`chatbotChannelWebhook.controller.js:131-139`: `res.send('ok')` ngay trước khi xử lý).

### 5.3. Handler `_processTikTokBatch`

Pattern theo `_processZaloOaBatch` ở `backend/src/controllers/chatbotChannelWebhook.controller.js:215-326`:

1. Parse `req.body` (envelope) + `JSON.parse(req.body.content)` (content).
2. Tra `tiktok_business_accounts` theo `business_id = user_openid` → lấy `accountId` + `userId`.
3. Tra `chatbot_channel_connections` theo `channel_type = 'tiktok_business' AND external_channel_id = business_id AND is_active = true` (cần thêm method `findActiveByExternalChannelId`).
4. Lấy `chatbot_id`, lưu vào `chatbot_messages` (`backend/migrations/044_chatbot_conversations_messages.sql`, có cột `id_conversation`, `role`, `content`, `message_type`, `external_id`, `external_ts`).
5. `inboundReplyDebounceService.enqueue({ key: 'tiktok_business:<accountId>:<convId>', ... })` — service này đã có ở `backend/src/services/chatbot/inboundReplyDebounce.service.js:7-8`.
6. Sau debounce 5–10s: gọi `chatRouter.routeMessageWithSettings` (xem `backend/src/services/chatbot/chatRouter.service.js:62-70`) — cần thêm `'tiktok_business'` vào `ADAPTERS` map (việc 9).
7. Trước khi gọi adapter: check `tiktokRateLimit.canSend(accountId, conversationId)` (xem việc 6).
8. Sau khi gửi thành công: ghi vào `tiktok_outbound_log` (xem việc 6).

**Sửa từ giả định cũ**: `routeMessageWithSettings` (`chatRouter.service.js:62-70`) hiện throw nếu channel không có trong `ADAPTERS`. Sau khi thêm `tiktok_business` (việc 9), sẽ chạy được. Trước đó phải đăng ký adapter vào map.

### 5.4. Nghiệm thu PR-3 (webhook)

| Tình huống | Kỳ vọng |
|---|---|
| POST webhook với `client_key` không trong whitelist | 200 (ack) + log warn; KHÔNG xử lý |
| POST webhook với `event = im_send_msg` | 200; bỏ qua (BE đã gửi thành công) |
| POST `im_receive_msg` text | 200; tạo/lấy conversation, lưu message, enqueue AI reply |
| POST `im_receive_msg_eu` | 200; gọi `GET /business/message/{conversationId}/` để lấy nội dung, lưu message |
| POST `im_referral_msg` ad | 200; lưu metadata `ad_id` vào conversation/contact |
| POST `im_mark_read_msg` | 200; update `last_read_at` |
| POST với body không phải JSON | 400 |
| Response time | < 3s (test với 100 message liên tiếp) |

---

## Việc 6 — Rate limit service (PR-3, song song)

`backend/src/services/tiktok/tiktokRateLimit.service.js`:

Đếm số reply gửi đi mỗi `(accountId, conversationId)` trong **cửa sổ 48h trượt** kể từ tin nhắn inbound gần nhất.
Khi vượt 10 → return `{ allowed: false, staticReply: '...' }`.

Có 3 lựa chọn storage:

| Lựa chọn | Ưu | Nhược |
|---|---|---|
| (a) Bảng SQL `tiktok_outbound_log` | Bền, query được, audit tốt | Thêm migration + query cost |
| (b) Redis (ioredis đã dùng) | Nhanh, TTL tự xoá | Cần thêm 1 module Redis riêng |
| (c) In-memory Map | Đơn giản, không migration | Mất khi restart, không scale multi-instance |

**Quyết định đề xuất**: (a) SQL bảng cho audit + multi-instance, **kết hợp** (b) Redis cache cho hot path (counter hiện tại, TTL 48h) — copy pattern `chatbotRateLimit.service.js` (đã có hybrid Redis + in-memory fallback, `chatbotRateLimit.service.js:2,60-83`).

**Sửa từ giả định cũ**: UKNOW **ĐÃ CÓ Redis (ioredis)** ở 4 nơi (`chatbotRateLimit.service.js:2`, `outboundMessageQueue.service.js`, `kbDocumentQueue.service.js`, `widgetUploadCap.service.js`). Env `BULLMQ_REDIS_URL` hoặc `REDIS_HOST/REDIS_PORT/REDIS_PASSWORD/REDIS_DB` (xem `chatbotRateLimit.service.js:33-42`). Có thể dùng chung ioredis client (`buildRedisConfig()` ở dòng 32-42), KHÔNG cần tạo connection mới.

### 6.1. Schema (chọn phương án a)

```sql
CREATE TABLE tiktok_outbound_log (
  id BIGSERIAL PRIMARY KEY,
  id_account BIGINT NOT NULL REFERENCES tiktok_business_accounts(id) ON DELETE CASCADE,
  business_id TEXT NOT NULL,             -- open_id
  conversation_id TEXT NOT NULL,
  message_id TEXT,                       -- từ TikTok response
  status VARCHAR(20) NOT NULL,           -- 'sent' | 'failed' | 'rate_limited'
  error_code TEXT,
  error_message TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_tiktok_outbound_window ON tiktok_outbound_log (business_id, conversation_id, sent_at DESC);
```

### 6.2. Logic (kết hợp Redis cache + SQL log)

```js
// Cửa sổ 48h trượt: từ `last_inbound_at` của conversation đến `last_inbound_at + 48h`
//   inbound có thể đến từ webhook -> upsert last_inbound_at vào Redis
//   nếu last_inbound_at + 48h < now() -> reset cửa sổ
//   đếm SELECT count(*) FROM tiktok_outbound_log WHERE business_id=$1 AND conversation_id=$2
//          AND sent_at > $3 AND status='sent'
//   nếu >= 10 -> block
// Hot path: cache count ở Redis key 'tiktok:rate:<accountId>:<conversationId>' TTL 48h
//   miss -> fallback SQL, set cache
```

### 6.3. Nghiệm thu

| Tình huống | Kỳ vọng |
|---|---|
| Conversation mới, chưa nhận inbound nào | `allowed = false` (không thể gửi trước) |
| Vừa nhận inbound, count(sent) = 0 | `allowed = true` |
| Đã gửi 9 tin trong 48h | `allowed = true` (tin thứ 10) |
| Đã gửi 10 tin, gọi lần 11 | `allowed = false`, trả `staticReply` |
| Inbound mới sau khi đã gửi 10 | Reset cửa sổ (đếm lại từ 0) |
| Test concurrency 100 request song song tới cùng 1 conversation | Chỉ ≤ 10 được ghi `status='sent'` (dùng INSERT với subquery count) |
| Redis down | Fallback in-memory Map (giống `chatbotRateLimit.service.js:60-83`) |

---

## Việc 7 — FE service + tab TikTok (PR-4)

### 7.1. Service

`frontend/src/features/settings/services/tiktokBusinessApi.service.js` — pattern giống `facebookSettingsApi.service.js` (đã có ở `frontend/src/features/settings/services/facebookSettingsApi.service.js`):
- `getAuthorizeUrl()` → trả `{ url, state }`
- `getAccounts()` → list
- `refreshAccount(id)` → POST
- `deleteAccount(id)` → DELETE
- `testSend(id, conversationId, message)` → POST

### 7.2. Component

`frontend/src/pages/settings/TiktokBusinessSettings.jsx` — pattern giống `frontend/src/pages/settings/TelegramSettings.jsx` (đã có):
- Hiển thị danh sách tài khoản đã liên kết (display_name, business_id masked, last_webhook_at, status)
- Nút "Kết nối TikTok Business" → redirect `window.location.href = url`
- Mỗi account có 3 nút: Refresh / Disconnect / Test send (mở modal nhập conversationId + text)
- **Quan trọng**: hiển thị notice "TikTok giới hạn 10 tin nhắn / 48 giờ / conversation, reset khi nhận tin nhắn mới" — lấy từ i18n

### 7.3. Đăng ký tab

`frontend/src/pages/settings/ChannelSettings.jsx:12-18` hiện có 5 tab; thêm tab `tiktok`:
- Thêm vào mảng `TABS` (line 12-18)
- Thêm import `TiktokBusinessSettings` (line 9)
- Thêm nhánh `{active === 'tiktok' && <TiktokBusinessSettings />}`
- Icon: thư viện `react-icons/fa` không có TikTok → dùng SVG inline hoặc `react-icons/fa6`

### 7.4. i18n vi/en

Thêm vào `frontend/src/i18n/vi.js` (xem grep key zalo ở phần khảo sát):
- `settings.channels.tiktok.tab`
- `settings.channels.tiktok.connect`
- `settings.channels.tiktok.connected`
- `settings.channels.tiktok.rateLimitNotice`
- `settings.channels.tiktok.testSend`
- ...

### 7.5. ChannelNotInPlanNotice (mở rộng)

`frontend/src/features/settings/components/ChannelNotInPlanNotice.jsx:10-12` hiện chỉ hỗ trợ `telegram|whatsapp|zalo`. Mở rộng:

```js
const name = { telegram: 'Telegram', whatsapp: 'WhatsApp', zalo: 'Zalo', tiktok: 'TikTok Business' }[channel] || 'kênh';
```

Đồng thời mở rộng `useChannelEntitlements` (`frontend/src/hooks/queries/useChannelEntitlements.js:30-37`) thêm `tiktok: data ? data.tiktok !== false : true`.

**Region check** (bổ sung theo `docs/research/tiktok-connection-options-2026.md` §3.1): UKNOW user ở EEA/Thụy Sĩ/UK sẽ bị TikTok trả 403. Cần detect sớm (sau OAuth) và hiển thị hướng dẫn "đăng ký tài khoản ở region APAC/LATAM/METAP/Bắc Mỹ". Thêm key i18n `settings.channels.tiktok.regionBlocked` với nội dung "TikTok Business Messaging hiện không hỗ trợ tài khoản đăng ký ở EEA/Thụy Sĩ/UK".

**Tier check** (bổ sung theo `docs/research/tiktok-connection-options-2026.md` §3.2): nếu user có General Account hoặc Advanced Access mà chưa Verified, các tính năng auto-message/keyword reply sẽ bị TikTok từ chối. Trong Phase 1 chỉ cần chatbot reply (không cần auto-message) nên Advanced Access là đủ. Thêm i18n `settings.channels.tiktok.tierNotice` với hướng dẫn verify business.

### 7.6. Nghiệm thu PR-4

| Tình huống | Kỳ vọng |
|---|---|
| Vào `/app/settings/channels` | Thấy 6 tab, tab TikTok có icon và label |
| Click tab TikTok | Hiển thị component với nút "Kết nối" |
| Click "Kết nối" | Redirect tới `tiktok.com/v2/auth/authorize/...` |
| OAuth callback thành công | Quay lại tab TikTok, thấy 1 account mới |
| Click "Test send" với conversation_id hợp lệ | Modal nhập message → gửi → thấy response |
| Click "Test send" không có conversation | Disable nút, hiển thị tooltip |

---

## Việc 8 — FE inbox cho TikTok (PR-5)

### 8.1. Component

`frontend/src/features/inbox/components/TiktokChannelCard.jsx` — render 1 cuộc trò chuyện:
- Avatar TikTok (placeholder icon nếu user chưa có avatar)
- Tên = `@tiktok_username` (từ `unique_identifier` field trong webhook)
- Badge số tin chưa đọc
- Có indicator "AI đang trả lời" / "Tạm dừng AI" / "Đã đạt giới hạn 10/48h"

`frontend/src/features/inbox/components/TiktokConversationList.jsx` — group theo `tiktok_business_account`.

### 8.2. Toggle AI reply

**Đã xác minh**: endpoint `setAiPaused` đã có ở `backend/src/controllers/unifiedInbox.controller.js:554-571`. Mount route qua `unifiedInbox.routes` (cần verify endpoint exact). Nút "Bật/Tắt AI" cho từng `(chatbot, tiktok_account)` gọi endpoint này với `conversationId` + `paused: bool` — KHÔNG cần tạo endpoint mới.

### 8.3. Nghiệm thu PR-5

| Tình huống | Kỳ vọng |
|---|---|
| Có 3 account TikTok, mỗi account 2 conversation | Hiển thị 3 group, mỗi group 2 card |
| Click 1 card | Mở conversation detail (component đã có cho FB/Zalo, kiểm tra có render được `type = 'tiktok_business'` không) |
| Click nút "Tắt AI" | Gọi `setAiPaused` endpoint, badge đổi sang "Tạm dừng" |
| Conversation đã đạt 10/48h | Card có badge "Giới hạn TikTok — chờ 48h" |
| Click "Bật lại AI" | Reset counter nếu đã quá 48h |

---

## Việc 9 — Đăng ký `tiktok_business` vào ADAPTERS map (PR-3, bắt buộc)

`backend/src/services/chatbot/chatRouter.service.js:32-38`:

```js
const ADAPTERS = {
  web: webChatAdapter,
  zalo_oa: zaloOAAdapter,
  facebook: facebookAdapter,
  zalo_personal: zaloPersonalAdapter,
  whatsapp: whatsappAdapter,
  telegram_personal: telegramAdapter,
};
```

Thêm `tiktok_business: tiktokBusinessAdapter` + import. Không có bước này thì `routeMessageWithSettings` throw `Unknown channel: tiktok_business`.

**Lưu ý** (sửa từ giả định cũ): `chatRouter.service.js:43-50` có `CHANNEL_CONVERSATION_LOG_CHANNELS = new Set(['zalo_oa', 'facebook'])`. Comment dòng 43-49 nói rõ "Hiện không có đường sống nào đi qua nhánh này" → KHÔNG thêm `tiktok_business` vào set này (tránh ghi trùng).

---

## Việc 10 — Env (PR-1 và PR-2)

`backend/.env` (xem hiện có `FACEBOOK_APP_ID`, `ZALO_*` ở `backend/.env:92`):

```bash
# TikTok Business Messaging (v1.3, open beta APAC/LATAM/METAP/NA)
TIKTOK_APP_CLIENT_KEY=
TIKTOK_APP_CLIENT_SECRET=
TIKTOK_OAUTH_TOKEN_BASE=https://open.tiktokapis.com/v2/oauth
TIKTOK_MESSAGE_API_BASE=https://business-api.tiktok.com/open_api/v1.3
TIKTOK_OAUTH_REDIRECT_URI=https://uknow.example.com/api/settings/tiktok-business/callback
TIKTOK_WEBHOOK_CALLBACK_URL=https://uknow.example.com/api/webhooks/tiktok-business/<TIKTOK_WEBHOOK_PATH_SECRET>   # bí mật nằm TRONG đường dẫn (19/10/2026)
TIKTOK_WEBHOOK_PATH_SECRET=                            # bắt buộc: thiếu/sai → webhook vẫn trả 200 nhưng KHÔNG xử lý gì (mẫu webhook Mắt Bão)
TIKTOK_APP_CLIENT_KEYS=                                # lớp phụ: whitelist client_key của webhook (nhiều key, dấu phẩy) — client_key KHÔNG phải bí mật
TIKTOK_STATE_SECRET=                                   # HMAC key cho OAuth state (KHÁC JWT_SECRET)
TIKTOK_TOKEN_REFRESH_ENABLED=true                      # cron refresh (default true)
```

`TIKTOK_STATE_SECRET` nên tách riêng (không dùng chung `JWT_SECRET` hay `SMTP_SECRET_KEY`) để có thể rotate độc lập.

---

## Việc 11 — Đăng ký webhook tới TikTok (PR-3, 1 lần)

> Webhook đăng ký ở cấp developer app, áp dụng cho mọi business đã authorize. Không gọi per-user.

Làm thủ công 1 lần bằng `curl`:

```bash
curl -X POST https://business-api.tiktok.com/open_api/v1.3/business/webhook/update/ \
  -H 'Content-Type: application/json' \
  -d '{
    "app_id": "'"$TIKTOK_APP_CLIENT_KEY"'",
    "secret": "'"$TIKTOK_APP_CLIENT_SECRET"'",
    "event_type": "DIRECT_MESSAGE",
    "callback_url": "'"$TIKTOK_WEBHOOK_CALLBACK_URL"'"
  }'
```

**Vì sao không tự động hoá**: cần quyền app ở TikTok, secret không nên lưu ở code, và chỉ cần làm 1 lần khi onboard app đầu tiên. Có thể thêm script `scripts/tiktok/register-webhook.sh` để chạy tay.

---

## Nghiệm thu tổng hợp

| Tình huống | Kỳ vọng | PR |
|---|---|---|
| Owner mở `/app/settings/channels`, click tab TikTok | Thấy nút "Kết nối TikTok Business" | 4 |
| Click nút, OAuth thành công, callback redirect về | Account mới hiện trong list, có `business_id` masked, `last_webhook_at = null`, `access_token` mã hoá `enc:v1:...` | 2, 4 |
| User bất kỳ nhắn cho business (TikTok app) | Webhook nhận, conversation mới trong unified inbox | 3 |
| Trong vòng 1 phút user nhắn tiếp 2 tin | Bot reply 1 lần gộp (debounce 5–10s) | 3 |
| Bot reply | Tin hiển thị trong inbox phía owner, có ghi `tiktok_outbound_log.status='sent'` | 3, 6 |
| User nhắn lần thứ 11 trong 48h, bot đã gửi 10 | Bot KHÔNG reply tự động; có badge "Đã đạt giới hạn 10/48h" trong FE | 6, 5 |
| Owner tắt AI cho 1 conversation TikTok | Gọi `setAiPaused` endpoint; webhook vẫn lưu message nhưng không enqueue AI | 5 |
| Owner click "Refresh token" | OAuth refresh, `access_token_expires_at` cập nhật | 2 |
| 02:00 hôm sau, cron tiktok_token_refresh chạy | Tài khoản sắp hết hạn được refresh tự động, kết quả ghi `cron_job_runs.job_code='tiktok_token_refresh'` | 1 |
| TikTok gửi `im_receive_msg_eu` (user EU) | BE gọi `GET /business/message/{conversationId}/` lấy nội dung, lưu vào inbox | 3 |
| TikTok gửi `im_referral_msg` từ ad | Conversation có metadata `referral.ad_id` | 3 |
| Integration test (CI) chạy `bootstrap.sql` | Thành công, schema-sync-check pass | 1 |

---

## Bẫy cần tránh

### Bẫy 1: Lưu token plaintext

**Sai**: `access_token` ở DB không mã hoá.
**Đúng**: Dùng `encryptSmtpSecret` từ `backend/src/utils/smtpSecretCrypto.js:51-64` (AES-256-GCM, key từ `SMTP_SECRET_KEY` env). Helper `encryptSmtpSecret` đã được dùng bởi `zaloCookieCrypto.util.js:23-27` và `baileysAuthCrypto.util.js:114-125`. Prefix `enc:v1:` (`smtpSecretCrypto.js:5`) để nhận biết ciphertext.

### Bẫy 2: Quên JSON.parse 2 lần

**Sai**: `const content = req.body.content; channel.sendReply(...content.text.body)`.
**Đúng**: `let content = req.body.content; if (typeof content === 'string') content = JSON.parse(content);`.
Bài kiểm tra: ghi unit test với cả 2 dạng (string và object đã parse).

### Bẫy 3: Race condition ở rate limit

**Sai**: `if (count >= 10) block; else send + insert` — 2 request song song cùng vượt 10.
**Đúng**: Dùng `INSERT ... SELECT ... WHERE (SELECT count(*) FROM tiktok_outbound_log WHERE ...) < 10` trong 1 transaction, hoặc dùng `SELECT FOR UPDATE` trên `(accountId, conversationId)`. Kết hợp Redis cache cho hot path (xem việc 6).

### Bẫy 4: Nhầm `user_openid` với `id_user` UKNOW

**Sai**: Lưu `user_openid` vào `id_user` (cột FK `users(id)`) — TikTok ID không map được.
**Đúng**: `user_openid` (= `business_id`) là ID của TikTok Business, lưu vào `tiktok_business_accounts.business_id`. ID của TikTok user nhắn (`unique_identifier` trong content) là ID bên ngoài, lưu vào `external_id` của conversation.

### Bẫy 5: Mount webhook sai middleware order

**Sai**: Tạo middleware `express.raw` riêng cho TikTok (giống Zalo).
**Đúng**: TikTok chỉ verify qua `client_key` (không HMAC), KHÔNG cần raw body. Dùng `webhookLimiter` + `express.json()` global đã mount ở `backend/src/app.js:202` (`app.use('/api/webhooks', webhookLimiter, webhookRoutes)`). Cú pháp như `webhookLimiter` đã dùng cho cả Zalo OA và Facebook ở `app.js:202`.

### Bẫy 6: Quên `bootstrap.sql` mirror

**Sai**: Tạo migration 296 mà quên update `backend/tests/integration/sql/bootstrap.sql` → CI fail.
**Đúng**: Mỗi migration thêm bảng/cột PHẢI mirror ngay (skill `viet-plan:42-45`). Đã verify: migration 292-295 hiện KHÔNG có trong bootstrap → cần bổ sung trước khi bắt đầu PR này (workstream riêng).

### Bẫy 7: `CHANNEL_CONVERSATION_LOG_CHANNELS` ở `chatRouter.service.js:45-50`

```js
const CHANNEL_CONVERSATION_LOG_CHANNELS = new Set(['zalo_oa', 'facebook']);
```

**Sai**: Thêm `tiktok_business` vào đây khi chưa verify. Set này quyết định `_logMessage` có ghi vào `channel_messages` không.
**Đúng**: Comment `chatRouter.service.js:43-49` nói rõ "Hiện không có đường sống nào đi qua nhánh này" → KHÔNG thêm `tiktok_business`. Controller `chatbotChannelWebhook.controller.js` tự ghi `chatbot_messages` (bảng ở `backend/migrations/044_chatbot_conversations_messages.sql`).

### Bẫy 8: Tạo cron ở file mới

**Sai**: Tạo `backend/src/jobs/tiktokRefresh.js` mới.
**Đúng**: Tất cả cron UKNOW nằm trong `backend/src/utils/scheduler.js:653-1700` (hàm `initScheduler()`). Mỗi cron wrap bằng `cronJobRunRepository.recordRun(<code>, async () => {...})` để ghi log lịch sử. Thêm cron TikTok ngay sau block Facebook token refresh ở `scheduler.js:1668-1700`.

### Bẫy 9: Tự tạo Redis client mới

**Sai**: `new IORedis({...})` riêng cho rate limit.
**Đúng**: ioredis đã dùng chung qua `buildRedisConfig()` (`chatbotRateLimit.service.js:32-42`), env `BULLMQ_REDIS_URL` hoặc `REDIS_HOST/REDIS_PORT/REDIS_PASSWORD/REDIS_DB`. Copy pattern: tạo `tiktokRateLimit` service với `redis` getter giống `chatbotRateLimit.service.js:114-123` (lazy init + fallback in-memory).

### Bẫy 10: Phân biệt EU/non-EU trong webhook

**Sai**: Parse `im_receive_msg` rồi giả định `im_receive_msg_eu` có cùng schema → lỗi vì `im_receive_msg_eu.content` chỉ có `to`, `to_user`, `timestamp`.
**Đúng**: Branch theo `event`:
- `im_receive_msg` → parse full content
- `im_receive_msg_eu` → gọi `GET /business/message/{conversationId}/` để lấy content (lưu ý: cần check rate limit riêng của endpoint này).

### Bẫy 11: State OAuth không có chữ ký

**Sai**: `state = randomUUID()` → có thể bị CSRF nếu attacker biết user_id.
**Đúng**: `state = HMAC-SHA256(userId + nonce, TIKTOK_STATE_SECRET)` — server verify lại khi callback. `TIKTOK_STATE_SECRET` là env riêng (việc 10).

### Bẫy 12: Quên thêm method `findActiveByExternalChannelId`

`chatbotChannelRepository.findActiveChannel` (`backend/src/repositories/ai/chatbotChannel.repository.js:34-43`) chỉ nhận `channelType` — không nhận `external_channel_id`. Webhook TikTok cần tra theo `business_id` để biết `chatbot_id`. Cần thêm method mới:
```js
async findActiveByExternalChannelId(channelType, externalChannelId) {
  const { rows } = await db.query(
    `SELECT * FROM chatbot_channel_connections
     WHERE channel_type = $1 AND external_channel_id = $2 AND is_active = true`,
    [channelType, externalChannelId]
  );
  return rows[0] || null;
}
```

### Bẫy 13: Dùng nhầm `tiktok_business` ở nơi dùng `tiktok_personal`

UKNOW CHƯA có `tiktok_personal`. Nếu trong tương lai có:
- `tiktok_business` = business messaging API (công khai, có webhook, có rate limit 10/48h)
- `tiktok_personal` = chưa hỗ trợ, giống pattern `zalo_oa` vs `zalo_personal`

Đặt tên `tiktok_business` cho đúng nghĩa, tránh sau này nhầm.

**Bổ sung theo nghiên cứu 10/09** (xem `docs/research/tiktok-connection-options-2026.md`):

### Bẫy 14: User ở region bị chặn (EEA / Thụy Sĩ / UK)

**Sai**: Cho phép OAuth chạy, đến lúc gọi `POST /business/message/send/` mới thấy 403.
**Đúng**: Sau khi exchange code → token, gọi `GET /v2/user/info/` (Login Kit endpoint, `developers.tiktok.com/doc/tiktok-api-user-info-basic`) để lấy `region`. Nếu `region` ∈ {EEA, CH, UK} → không lưu account, trả lỗi 403 với i18n `tiktok.regionBlocked` ngay từ callback. Tránh user tưởng "đã kết nối thành công" rồi mới thất vọng ở bước gửi tin.

Nguồn region mapping: [TikTok Business Messaging docs](https://business-api.tiktok.com/portal/docs/business-messaging-api/v1.3), [Whautomate](https://whautomate.com/integrations/tiktok).

### Bẫy 15: Direct Messages privacy = "Friends" thay vì "Everyone"

**Sai**: User kết nối thành công, webhook mount, nhưng KHÔNG bao giờ nhận được tin nhắn.
**Nguyên nhân**: TikTok mặc định DM = "Friends" (chỉ bạn bè nhắn được). Khi người lạ nhắn → rơi vào "Message requests" → **API KHÔNG nhận** (chỉ thấy khi owner mở TikTok app).
**Đúng**: Hiển thị bước onboarding trong FE ngay sau OAuth thành công:
1. Mở TikTok app
2. Settings → Privacy → Direct Messages → "Everyone"
3. Sau khi xong, bấm "Tôi đã bật" để UKNOW test gửi 1 tin tới chính mình (qua `POST /business/message/send/` với `recipient_type=USER_OPENID`).

Nguồn: [Whautomate](https://whautomate.com/integrations/tiktok) — "Set TikTok direct messages to 'Everyone' first, otherwise new messages arrive as message requests".

### Bẫy 16: User có personal account thay vì Business

**Sai**: OAuth từ Login Kit chạy với personal account (vì chỉ cần `user.info.basic` scope), nhưng Business Messaging API từ chối.
**Nguyên nhân**: OAuth + Login Kit cho cả personal lẫn business. Phân biệt ở `role` trong response của `/v2/user/info/`: `personal_account` vs `business_account`.
**Đúng**: Sau khi lấy token, gọi `/v2/user/info/`. Nếu `role === 'personal_account'` → trả lỗi 403 với i18n `tiktok.personalAccountNotice` + hướng dẫn "Vào TikTok app → Settings → Account → Switch to Business Account" (miễn phí, mất vài phút, KHÔNG mất followers/videos theo [Hootsuite 2026](https://blog.hootsuite.com/tiktok-business-vs-personal/)).

### Bẫy 17: Personal account automation (Hooka, UnifyPort, ManyChat reverse-engineer)

**Sai**: Nghĩ "nếu Business bị giới hạn thì dùng tool bên thứ 3" → chạy browser automation, reverse-engineer request, ADB tap trên điện thoại.
**Hậu quả**:
- **Vi phạm TikTok TOS** ([điều khoản 15/07/2026](https://www.tiktok.com/legal/page/global/terms-of-service-july-eea/en)): "extract any data or content from the Platform using any automated system or software that is not provided by TikTok or approved in writing by TikTok" + "reverse engineer, disassemble, or decompile the Platform"
- **TikTok ghi nhận số lần vi phạm** → ban account → user mất kênh bán hàng
- **UKNOW chịu trách nhiệm pháp lý** nếu đứng giữa tool này
- **Không scale**: tool third-party chỉ chạy 1 account/lần, UKNOW là SaaS đa-tenant

**Đúng**: BỎ. Plan này chỉ dùng Business Messaging API chính thức. Hooka cũng thừa nhận: "no API parameter removes ban risk".

---

## Lịch trình gợi ý

| PR | Thời gian ước tính | Phụ thuộc |
|---|---|---|
| PR-1 (BE schema + service + cron) | 3–4 ngày | Migration, repository, service OAuth + refresh, mount cron vào `scheduler.js` |
| PR-2 (BE settings controller + routes) | 2 ngày | PR-1, env |
| PR-3 (BE webhook + adapter + rate limit) | 4–5 ngày | PR-1, PR-2 |
| PR-4 (FE kết nối + tab TikTok + i18n) | 2 ngày | PR-2 |
| PR-5 (FE inbox) | 2–3 ngày | PR-3 |
| Tổng | **13–16 ngày làm việc** | |

## Mục chưa làm ở plan này (ghi nhận để PR sau)

| Mục | Lý do để sau |
|---|---|
| Comment-to-Message (`direct_reply/update`) | Cần scope riêng, có thể không có sẵn ở open beta |
| Welcome / suggested question / chat prompt / keyword auto-reply | TikTok có API riêng (`auto_message/*`), UX khác AI chatbot |
| `im_receive_high_intent_comment` | Tiêu chí chưa public |
| Gửi video qua DM | Cần upload pipeline riêng, cũng là v1 feature khác |
| Template Q&A button / text link | Phức tạp, AI generate không tự nhiên |
| Giao tài khoản TikTok cho nhân viên (member_channel_accounts) | Cần tách quyền, làm v2 khi có yêu cầu |

---

## Tài liệu tham chiếu

| Nguồn | URL / Path |
|---|---|
| Nghiên cứu chính | `docs/research/tiktok-business-messaging-integration.md` |
| Nghiên cứu bổ sung (4 lựa chọn liên kết) | `docs/research/tiktok-connection-options-2026.md` |
| Business Messaging API reference | https://business-api.tiktok.com/portal/docs/business-messaging/v1.3 |
| Webhook subscription + schema | https://business-api.tiktok.com/portal/docs/subscribe-to-business-messaging-webhook-events-via-webhooks-api/v1.3 |
| OAuth user access token | https://developers.tiktok.com/doc/oauth-user-access-token-management/ |
| Scopes overview | https://developers.tiktok.com/docs/en/scopes-overview |
| Login Kit (chỉ auth + profile) | https://developers.tiktok.com/docs/en/login-kit-overview |
| Display API (chỉ đọc video/profile) | https://developers.tiktok.com/docs/en/display-api-get-started |
| User info basic | https://developers.tiktok.com/doc/tiktok-api-user-info-basic |
| Business entitlement tiers | https://ads.tiktok.com/help/article/about-tiktok-account-entitlements |
| Switch personal → business | https://blog.hootsuite.com/tiktok-business-vs-personal/ |
| TikTok Terms of Service (15/07/2026) | https://www.tiktok.com/legal/page/global/terms-of-service-july-eea/en |
| Skill viết plan | `.claude/skills/viet-plan/SKILL.md` |
| Scheduler (chỗ thêm cron) | `backend/src/utils/scheduler.js:653-1700` |
| Facebook token refresh (pattern copy) | `backend/src/utils/scheduler.js:1668-1700` + `backend/src/services/chatbot/facebookTokenRefresh.service.js` |
| Crypto helper (token) | `backend/src/utils/smtpSecretCrypto.js:51-64` |
| Webhook mount | `backend/src/app.js:202` |
| AI channel router ADAPTERS map | `backend/src/services/chatbot/chatRouter.service.js:32-38` |
| Toggle AI endpoint (đã có) | `backend/src/controllers/unifiedInbox.controller.js:554-571` |
