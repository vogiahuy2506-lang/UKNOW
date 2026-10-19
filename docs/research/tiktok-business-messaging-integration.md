# Nghiên cứu: Tích hợp TikTok Business Messaging cho chatbot AI reply

> Ngày: 11/10/2026 · Tác giả: AI nghiên cứu (UKNOW codebase + TikTok Business API docs)
> Mục tiêu: Cho UKNOW hỗ trợ **liên kết tài khoản TikTok Business** để **chatbot AI tự động reply tin nhắn DM** cho khách hàng, cùng mạch đã có với Zalo / Facebook / Telegram / WhatsApp.

---

## 1. Tổng quan TikTok Business Messaging API

### 1.1. Trạng thái

| Mục | Giá trị |
|---|---|
| Tên chính thức | **TikTok Business Messaging API** (suite, không phải Display API) |
| Phiên bản | **v1.3** (docs chính: `business-api.tiktok.com/portal/docs/business-messaging/v1.3`) |
| Trạng thái phát hành | **Open Beta** tại 4 khu vực: **APAC, LATAM, METAP, Bắc Mỹ** |
| Bắt buộc để dùng | Tài khoản TikTok For Business, đăng ký developer, tạo developer app, bật quyền **Business Messaging** cho app |
| Khác với | TikTok Login Kit (Display API) — đó là OAuth user info, **không** gửi DM |

### 1.2. Rate limit quan trọng nhất

> **Tối đa 10 tin nhắn gửi đi trong vòng 48 giờ sau khi nhận một tin nhắn từ user.**

Đây là ràng buộc cứng ảnh hưởng trực tiếp đến thiết kế chatbot:

- **Không thể gửi chủ động** (outbound) quá 10/48h/conversation.
- Khi user nhắn → bộ đếm 48h reset cho conversation đó.
- Phù hợp với mô hình "bot reply khi được hỏi" — **không phù hợp với broadcast/proactive marketing**.
- Một conversation mới (chưa từng nhận inbound) → **không thể gửi trước** (trừ auto-message đã cấu hình sẵn qua API khác).

### 1.3. Scope OAuth

Khi tạo developer app cần enable:
- **Business Messaging permission** (mới có quyền gọi nhóm endpoint này).
- OAuth scopes cần xin (chưa có tên chính thức công bố rõ ràng trong bản open beta docs hiện có — cần verify qua portal developer khi tạo app thật; theo webhook schema, có dấu hiệu cần `message.list.read` để nhận một số event phụ, và scope ngầm định cho gửi DM).

### 1.4. Endpoints chính

| Nhóm | Endpoint | Mục đích |
|---|---|---|
| DM | `POST /open_api/v1.3/business/message/send/` | Gửi 1 tin nhắn vào conversation |
| DM | `GET  /open_api/v1.3/business/message/conversation/list/` | Liệt kê conversation (tối đa 90 ngày gần nhất) |
| DM | `GET  /open_api/v1.3/business/message/{conversation_id}/` | Lấy tối đa 20 tin nhắn gần nhất của conversation |
| DM | `POST /open_api/v1.3/business/message/image/upload/` | Upload ảnh (JPG/PNG, ≤ 3 MB) → lấy `media_id` |
| DM | `GET  /open_api/v1.3/business/message/media/download/` | Download ảnh / video từ message |
| Comment-to-Message | `POST .../direct_reply/update/` | Bật/tắt auto-DM khi có comment |
| Comment-to-Message | `GET  .../direct_reply/get/` | Xem trạng thái |
| Webhook | `POST /open_api/v1.3/business/webhook/update/` | Đăng ký callback URL cho `DIRECT_MESSAGE` |
| Webhook | `GET  /open_api/v1.3/business/webhook/get/` | Lấy config hiện tại |
| Webhook | `POST /open_api/v1.3/business/webhook/delete/` | Xoá |
| Auto-message | 5 endpoint `auto_message/*` | Quản lý welcome / suggested question / chat prompt / keyword reply |

Base URL: `https://business-api.tiktok.com`. Auth: header `Access-Token: <user_access_token>`, **không** dùng Bearer.

### 1.5. Message types hỗ trợ gửi

`text` (max 6000 chars) · `image` (cần `media_id` upload trước) · `share_post` (TikTok post) · `video` · `emoji` · `sticker` · `reaction` · `template` (chỉ 2 loại: `qa_button_card`, `qa_link_card`).

UKNOW hiện chỉ cần `text` + `image` là đủ cho chatbot AI reply cơ bản.

---

## 2. OAuth flow

| Bước | Hành động | Endpoint |
|---|---|---|
| 1 | User bấm "Kết nối TikTok" → redirect sang TikTok authorize URL kèm `client_key`, `redirect_uri`, `scope`, `state` | `https://www.tiktok.com/v2/auth/authorize/` |
| 2 | User đồng ý → TikTok redirect về `redirect_uri` kèm `?code=...&state=...` | — |
| 3 | Server **BE** exchange code → access token | `POST https://open.tiktokapis.com/v2/oauth/token/` (form-urlencoded) |
| 4 | Lưu: `access_token` (24h), `refresh_token` (365d), `open_id` (= `business_id` cho messaging), `scope`, `expires_in` | — |
| 5 | Cron refresh token trước khi hết hạn | `POST .../oauth/token/` với `grant_type=refresh_token` |
| 6 | Khi user thu hồi (uninstall app) | `POST https://open.tiktokapis.com/v2/oauth/revoke/` |

**Lưu ý quan trọng**: `business_id` dùng trong DM API = `open_id` trả về từ OAuth (cùng giá trị). `user_openid` trong webhook cũng là `open_id` này.

---

## 3. Webhook schema (đã đọc chi tiết từ docs chính thức)

### 3.1. Đăng ký

`POST /open_api/v1.3/business/webhook/update/`

```json
{
  "app_id": "{{app_id}}",
  "secret": "{{app_secret}}",
  "event_type": "DIRECT_MESSAGE",
  "callback_url": "https://uknow.example.com/webhooks/tiktok"
}
```

Đăng ký **một lần ở cấp developer app**, áp dụng cho mọi business đã authorize. Cần HTTPS public, response HTTP 200 để ack.

### 3.2. Các event

| Event | Khi nào bắn | Quan trọng cho UKNOW? |
|---|---|---|
| `im_send_msg` | BE **đã gửi** tin nhắn thành công tới user | Có — để mark `delivered` trong inbox |
| `im_receive_msg` | User **ngoài** EEA/Thụy Sĩ/Anh nhắn cho business | **Có — trigger AI reply** |
| `im_receive_msg_eu` | User **trong** EEA/Thụy Sĩ/Anh nhắn cho business | **Có — trigger AI reply** (schema đơn giản hơn, không có `from`/`text`) |
| `im_referral_msg` | User mở conversation từ Click-to-Message Ad hoặc `tiktok.me` link | Có — gắn `ad_id` / `ref` vào contact để tracking |
| `im_mark_read_msg` | User đánh dấu đã đọc cả session | Có — update `last_read_at` |
| `im_auto_message_config_update` | Welcome / suggested / prompt / keyword thay đổi (qua API hoặc tay) | Không cần xử lý — chỉ log |
| `im_auto_message_audit_update` | Audit trạng thái auto-message | Không cần |
| `im_receive_high_intent_comment` | Có comment "ý định cao" (chưa public rõ tiêu chí) | Có thể bỏ qua v1 |

### 3.3. Cấu trúc envelope (chung cho mọi event)

```json
{
  "client_key": "bwo1m23456a7k89",   // App ID
  "event": "im_receive_msg",
  "create_time": 1714430514,         // Unix seconds
  "user_openid": "b1d2f34d-5b6c-78fb-91c2-cd345678912b",  // = business_id
  "content": "<JSON STRING>"          // ⚠️ content là STRING, phải JSON.parse(content)
}
```

**Bẫy phổ biến**: `content` là chuỗi JSON bên trong JSON, phải `JSON.parse` 2 lần.

### 3.4. `content` schema của `im_receive_msg`

```json
{
  "from": "vappe256",                  // TikTok username người gửi
  "to": "userxyz",
  "unique_identifier": "...",          // ID user, KHÔNG đổi giữa các API
  "from_user":  { "id": "...", "role": "personal_account" },
  "to_user":    { "id": "<business_id>", "role": "business_account" },
  "conversation_id": "...",            // dùng để gửi reply
  "message_id": "...",
  "timestamp": 1701090879815,          // ms
  "type": "text",                      // text | image | share_post | video | emoji | sticker | reaction | template
  "text": { "body": "..." },
  "scene_type": 0,
  "is_follower": true,
  "message_tag": { "source": "APP" }   // APP | WEB | API | OTHERS | UNKNOWN_SOURCE
}
```

`im_receive_msg_eu` chỉ có `to`, `to_user`, `timestamp` — **không có nội dung tin nhắn**, vì luật EU yêu cầu user chủ động consent. UKNOW cần gọi `GET /business/message/{conversation_id}/` để lấy nội dung.

### 3.5. Cú pháp gửi reply

```
POST /open_api/v1.3/business/message/send/
Headers: Access-Token: <user_access_token>, Content-Type: application/json
Body:
{
  "business_id": "<open_id>",
  "recipient_type": "CONVERSATION",
  "recipient": "<conversation_id>",
  "message_type": "TEXT",
  "text": { "body": "Xin chào, UKNOW có thể giúp gì cho bạn?" }
}
```

Response `{ code: 0, message: "OK", data: { message: { message_id: "..." } } }`. Lỗi: `code != 0` + `message` mô tả + `request_id` để debug.

---

## 4. Pattern UKNOW hiện có (cần khớp để tích hợp)

### 4.1. Tầng dữ liệu — 2 bảng quan trọng

**`channel_connections`** (migration 031) — mỗi user sở hữu nhiều kết nối kênh:

```
id, id_user, channel, display_name, fb_user_id, fb_page_id, fb_page_name,
external_channel_id, webhook_url, credentials (JSONB), settings (JSONB),
is_active, created_at, updated_at
```

`channel` hiện có giá trị: `facebook`, `telegram`, `whatsapp_baileys`, `zalo_oa`, `zalo_personal`, `web`. Cần thêm **`tiktok_business`**.

**`member_channel_accounts`** (migration 283/292) — phạm vi giao tài khoản cho nhân viên:

```
owner_id, employee_id, channel, account_ref, source
```

`channel` chỉ được filter ở 2 giá trị `'telegram'` và `'whatsapp_baileys'` (xem `channelAccessScope.util.js` → `SCOPED_CHANNELS`). `tiktok_business` nên **không** thuộc scope lọc ở bước đầu (giống `facebook`, `zalo_oa`) — chủ = thấy hết, nhân viên = chưa cấp.

### 4.2. Tầng controller

| File hiện có | Vai trò | Cần thêm cho TikTok |
|---|---|---|
| `controllers/facebookSettings.controller.js` | OAuth, page list, token refresh, test send | Tương tự: `tiktokSettings.controller.js` |
| `controllers/zaloSettings.controller.js` | OAuth + webhook config | Tham khảo pattern |
| `controllers/chatbotChannelWebhook.controller.js` | **Entry point** nhận mọi webhook từ FB/Zalo/WA, verify chữ ký, gọi `chatRouter` | Thêm `case 'tiktok_business'` cho 1 path mới `/webhooks/tiktok` (vì TikTok không ký HMAC mà verify qua app secret trong envelope) |
| `controllers/__tests__/facebookSettings.controller.spec.js` | Spec mock OAuth flow | Cần spec tương tự cho TikTok |

### 4.3. Tầng adapter (chatbot)

`backend/src/services/chatbot/channelAdapters/` có sẵn:
- `facebook.adapter.js` — `sendReply({externalId, message, userId, channelId, attachments})`
- `zaloOA.adapter.js`
- `telegram.adapter.js`
- `whatsapp.adapter.js`
- `webChat.adapter.js`
- `zaloPersonal.adapter.js`

Interface chung: **`sendReply({ externalId, message, userId, channelId, attachments })`** — TikTok cần `tiktok.adapter.js` cùng signature, với `externalId` = `conversation_id`, `channelId` = `channel_connections.id` (để lookup `credentials.access_token` + `external_channel_id` = `business_id`).

### 4.4. Tầng repository

- `repositories/ai/channelConnections.repository.js` — đã có `listFacebookConnections`, `upsertFacebookConnection`. Cần thêm `listTikTokConnections`, `upsertTikTokConnection` (key: `external_channel_id` = `business_id`).
- `repositories/ai/chatbotChannel.repository.js` — lưu `is_active` per chatbot.
- `repositories/ai/unifiedInbox.repository.js` — đã hỗ trợ channel dispatch, cần đăng ký `tiktok_business` ở `chatRouter`.

### 4.5. Tầng verify webhook (bảo mật)

Hiện có `utils/webhookVerification.util.js`:
- `FACEBOOK_VERIFY_TOKEN_ENV_NAMES` — verify token qua query string (GET handshake).
- `timingSafeStringEqual` — so sánh chữ ký HMAC.

TikTok **không dùng HMAC**, chỉ verify qua:
- HTTPS (bắt buộc).
- `client_key` (app ID) khớp với app đã đăng ký — nên whitelist theo danh sách `TIKTOK_APP_CLIENT_KEYS` (env, nhiều app có thể cùng gửi).
- Response `200 OK` trong **vài giây** (TikTok timeout nghiêm ngặt hơn Meta).

### 4.6. Tầng i18n / UI hiện có

- `frontend/src/i18n/vi.js`, `en.js` — cần thêm key `tiktokBusiness.name`, `tiktokBusiness.connect`, `tiktokBusiness.connected`, `tiktokBusiness.rateLimitNotice`, …
- `frontend/src/features/chatbot/` — nơi hiển thị danh sách kênh đã liên kết + nút bật/tắt cho từng chatbot.
- `frontend/src/pages/SettingsPage.jsx` (hoặc tương đương) — khu vực "Kênh liên kết" / "Channel Connections".

---

## 5. Đề xuất kiến trúc triển khai

### 5.1. Phân rã theo PR (gợi ý — khớp pattern đang dùng trong UKNOW)

| PR | Phạm vi | Output |
|---|---|---|
| **PR-1 (BE schema + service)** | Migration 296 — mở rộng `channel_connections.channel` thêm giá trị `'tiktok_business'`, thêm cột `tiktok_business_id` nếu muốn tách; bảng `tiktok_business_accounts` (mirror `telegram_accounts`/zalo_settings) chứa `id`, `id_user`, `open_id` (= business_id), `display_name`, `access_token` (encrypted), `refresh_token` (encrypted), `scope`, `token_expires_at`, `refresh_expires_at`, `is_active`, `last_webhook_at`, `created_at`, `updated_at`. Repository + token refresh cron. | DB + 2 service file + cron |
| **PR-2 (BE OAuth + settings API)** | Controller `tiktokSettings.controller.js` — endpoint `GET /api/chatbot/channels/tiktok/connect` (redirect), `GET /api/chatbot/channels/tiktok/callback` (đổi code), `POST /api/chatbot/channels/tiktok/refresh`, `GET /api/chatbot/channels/tiktok/accounts`, `DELETE /api/chatbot/channels/tiktok/accounts/:id`. Spec mock đầy đủ. | Controller + route + spec |
| **PR-3 (BE webhook + AI reply)** | Route `POST /webhooks/tiktok` (mount trước `app.use(express.json())` vì TikTok gửi `Content-Type: application/json` chuẩn, không cần raw), parse `content` (string → object), tạo `tiktok.adapter.js`, đăng ký case `'tiktok_business'` trong `chatbotChannelWebhook.controller.js`, đẩy vào `chatRouter` giống Facebook. Thêm `tiktok_business` vào channel whitelist. | Adapter + webhook handler + spec |
| **PR-4 (FE kết nối)** | Component `TiktokChannelConnectButton` + service `tiktokChannel.service.js`, modal callback page, nút hiển thị trong `Channels` page, i18n vi/en. | UI + service + i18n |
| **PR-5 (FE inbox + bật/tắt chatbot)** | Hiển thị conversation TikTok trong unified inbox, nút bật AI reply cho từng connection, hiển thị rate limit notice (10/48h). Spec component. | UI + spec |

> Quy mô này phù hợp pattern 5-PR mà team đã chốt cho Facebook và Zalo trước đó. Có thể gộp PR-1+PR-2 nếu muốn nhanh hơn.

### 5.2. Tích hợp với chatbot AI (quan trọng nhất)

Tận dụng `chatRouter.service.js` hiện có — chỉ cần:

1. Thêm map `channel → adapter` cho `tiktok_business` → `tiktokAdapter.sendReply(...)`.
2. `chatbotChannelWebhook.controller.js` nhận `im_receive_msg` → gọi `unifiedInbox.repository.upsertInboundMessage({ channel: 'tiktok_business', conversationId, sender: { id, username }, text, attachments, isFollower, messageTag })` → trả về `chatRouter` để:
   - Xác định chatbot nào phụ trách `channel_connection.id`.
   - Check AI enabled + active hours.
   - Gọi `chatbotCore.generateReply()` (đã có).
   - Debounce 5–10s (đã có `inboundReplyDebounce.service.js`).
   - Gửi qua `tiktokAdapter.sendReply({ externalId: conversationId, message, channelId, attachments })`.
3. Rate limit 10/48h: cần `tiktokRateLimit.service.js` đếm số reply gửi đi mỗi conversation, block khi vượt, kèm message thân thiện cho user ("Bạn đã nhận quá nhiều phản hồi tự động, vui lòng chờ 48h hoặc nhắn lại sau 48h để reset.").

### 5.3. Bảo mật & lưu trữ token

- `access_token` (24h) và `refresh_token` (365d) **phải mã hoá** trước khi lưu DB. UKNOW đã có helper mã hoá ở nơi khác (xem pattern Zalo/FB) — copy cách làm.
- Không bao giờ trả token về FE. `sanitize(connection)` giống Facebook (`has_credentials: true`).
- Refresh cron chạy mỗi 12h (an toàn cho 24h lifetime).
- `client_secret` nằm trong env, không bao giờ xuất hiện ở FE hay logs.

### 5.4. Env cần thêm

```bash
# .env.example
TIKTOK_APP_CLIENT_KEY=                 # nhiều app cách nhau dấu phẩy nếu multi-tenant
TIKTOK_APP_CLIENT_SECRET=
TIKTOK_OAUTH_REDIRECT_URI=https://uknow.example.com/api/chatbot/channels/tiktok/callback
TIKTOK_WEBHOOK_CALLBACK_URL=https://uknow.example.com/webhooks/tiktok
TIKTOK_MESSAGE_API_BASE=https://business-api.tiktok.com/open_api/v1.3
TIKTOK_OAUTH_TOKEN_BASE=https://open.tiktokapis.com/v2/oauth
```

---

## 6. Rủi ro và điểm cần verify thêm

| # | Rủi ro | Mức | Cách xử lý |
|---|---|---|---|
| 1 | **Open Beta + scope cần xin**: app mới cần TikTok duyệt riêng, có thể mất vài ngày đến vài tuần | Cao | Plan PR sớm để có thời gian duyệt; UKNOW có thể dev & test với TikTok sandbox |
| 2 | **Rate limit 10/48h** không thể bypass | Cao | Hiển thị rõ cho user, đề xuất human takeover khi gần giới hạn |
| 3 | **Webhook 2 lần JSON.parse** dễ bug nếu quên | Trung bình | Viết helper `parseTikTokWebhook(req)` có unit test cho cả trường hợp `content` đã là object (TikTok có thể đổi) |
| 4 | **`im_receive_msg_eu` không có nội dung** vì luật EU | Trung bình | Gọi `GET /business/message/{conversation_id}/` để fetch lại — đã có rate limit riêng cho endpoint này (theo docs) |
| 5 | **Phân biệt EU/non-EU chỉ qua 2 event khác nhau** | Thấp | BE phải xử lý 2 schema song song; viết parser 2 nhánh, test cả 2 |
| 6 | **`user_openid` = `business_id` không phải ID user nhắn** — dễ nhầm | Thấp | Comment rõ trong code; ID user thật là `unique_identifier` trong `content` |
| 7 | **TikTok chưa có Display API OAuth ở VN?** (Login Kit dùng cho user info cá nhân, không cho business DM) | Thấp | Đã rõ — UKNOW cần Business Messaging API, không phải Login Kit |
| 8 | **Comment-to-Message API** có thể bật/tắt được nhưng cần `direct_reply/update` scope | Thấp | Để v2 |
| 9 | **Multi-language template** (Q&A button card) cần 1 tấm ảnh / 1 template JSON, có thể không tiện cho AI generate | Thấp | Dùng `text` + `image` cho chatbot, không dùng `template` ở v1 |
| 10 | **Có cần xét duyệt TikTok App để dùng webhook `im_receive_high_intent_comment`?** | Trung bình | Bỏ qua event này ở v1, chỉ subscribe `DIRECT_MESSAGE` (mặc định bao gồm các event DM, không bao gồm high_intent_comment) |

---

## 7. So sánh nhanh với các kênh UKNOW đang có

| Đặc tính | Facebook Messenger | Zalo OA | Telegram | WhatsApp Baileys | **TikTok Business** |
|---|---|---|---|---|---|
| Region | Toàn cầu | VN | Toàn cầu | Toàn cầu | APAC/LATAM/METAP/NA (open beta) |
| Auth | OAuth + Page token | OAuth | Bot token | QR scan session | OAuth user access token |
| Token lifetime | 60d long-lived | hết hạn theo app | không hết hạn | session file | 24h access / 365d refresh |
| Gửi text | ✅ | ✅ | ✅ | ✅ | ✅ (max 6000 char) |
| Gửi ảnh | ✅ | ✅ | ✅ | ✅ | ✅ (upload trước, ≤3MB) |
| Gửi template | ✅ (button + generic) | ✅ | inline keyboard | ❌ | qa_button_card / qa_link_card |
| Outbound rate limit | theo page tier | 50KB/req | 30 msg/s | tự quản | **10 msg / 48h / conversation** |
| Webhook ký | HMAC SHA-1/X-Hub | verify_token | secret token | không ký | không HMAC (verify qua `client_key`) |
| AI auto-reply hiện có | ✅ | ✅ | ✅ | ✅ | **❌ cần làm** |

---

## 8. Tóm tắt một dòng

> TikTok Business Messaging v1.3 (open beta) cung cấp OAuth + `sendMessage` + 8 webhook event cho DM; UKNOW có thể tích hợp bằng cách thêm giá trị `tiktok_business` vào `channel_connections.channel`, tạo `tiktok.adapter.js` cùng interface `sendReply({externalId, message, userId, channelId, attachments})` với adapter Facebook hiện có, đăng ký case mới trong `chatbotChannelWebhook.controller.js`, và viết 1 service rate-limit riêng cho giới hạn cứng **10 tin / 48h / conversation**.

---

## 9. Tài liệu tham chiếu

| Nguồn | URL |
|---|---|
| Business Messaging API reference | https://business-api.tiktok.com/portal/docs/business-messaging/v1.3 |
| Webhook subscription + schema | https://business-api.tiktok.com/portal/docs/subscribe-to-business-messaging-webhook-events-via-webhooks-api/v1.3 |
| OAuth user access token | https://developers.tiktok.com/doc/oauth-user-access-token-management/ |
| Scopes overview | https://developers.tiktok.com/docs/en/scopes-overview |
| Business Messaging overview | https://business-api.tiktok.com/portal/docs/business-messaging-api/v1.3 |
| File local lưu chi tiết webhook | `/Users/senna/.cursor/projects/Users-senna-Code-Project-UKNOW/agent-tools/290bec5f-3695-48c6-b05e-02841f87e658.txt` |
