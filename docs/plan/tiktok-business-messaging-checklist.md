# Checklist triển khai: TikTok Business Messaging cho UKNOW

> Ngày bắt đầu: 11/10/2026
> Plan: `docs/plan/tiktok-business-messaging-integration.md`
> Nghiên cứu: `docs/research/tiktok-business-messaging-integration.md`, `docs/research/tiktok-connection-options-2026.md`
> Update tiến độ: đánh dấu `[x]` khi xong, `[-]` khi đang làm, `[ ]` khi chưa.

---

## PR-1: BE schema + service + cron (3–4 ngày)

| # | Việc | File / test | Trạng thái |
|---|---|---|---|
| 1.1 | Migration 296: mở rộng `chatbot_channel_connections.channel_type` CHECK thêm `'tiktok_business'` | `backend/migrations/296_chatbot_channel_connections_tiktok_business.sql` | [x] |
| 1.2 | Migration 296: tạo bảng `tiktok_business_accounts` (id, id_user, business_id, encrypted tokens, scope, expires, is_active, last_webhook_at, region, role) | cùng file trên | [x] |
| 1.3 | Mirror migration 296 sang `bootstrap.sql` | `backend/tests/integration/sql/bootstrap.sql` (cuối file) | [x] |
| 1.4 | Repository skeleton `tiktokBusinessAccount.repository.js` (8 method: list/findByBusinessId/findById/upsert/updateTokens/deactivate/touchWebhook/findExpiringForRefresh) | `backend/src/repositories/ai/tiktokBusinessAccount.repository.js` | [x] |
| 1.5 | Test repo (mock db): chống IDOR, upsert nhận ciphertext, findExpiringForRefresh có LIMIT 100 | `backend/src/repositories/ai/__tests__/tiktokBusinessAccount.repository.spec.js` | [x] |
| 2.2 | Service OAuth: signState/verifyState HMAC, getAuthorizeUrl, exchangeCodeForToken, refreshAccessToken, revokeToken, getUserInfo, isRegionSupported (Bẫy 14) | `backend/src/services/tiktok/tiktokOAuth.service.js` | [x] |
| 2.2 | Test OAuth service: state round-trip, tamper detect, TTL 10 phút, region support (APAC/LATAM/METAP/NA, EEA/CH/UK blocked) | `backend/src/services/tiktok/__tests__/tiktokOAuth.service.spec.js` | [x] |
| 2.3 | Service cron refresh `refreshExpiringTikTokTokens` (decrypt → refresh → encrypt → update, deactivate nếu hết hạn 365d) | `backend/src/services/tiktok/tiktokTokenRefresh.service.js` | [x] |
| 2.3 | Mount cron vào `scheduler.js` ngay sau Facebook token refresh (chạy 02:00 hàng ngày, wrap recordRun) | `backend/src/utils/scheduler.js:1702-1750` | [x] |
| 10 | Env vars: `TIKTOK_APP_CLIENT_KEY/SECRET`, `TIKTOK_OAUTH_TOKEN_BASE`, `TIKTOK_MESSAGE_API_BASE`, `TIKTOK_OAUTH_REDIRECT_URI`, `TIKTOK_WEBHOOK_CALLBACK_URL`, `TIKTOK_APP_CLIENT_KEYS`, `TIKTOK_TOKEN_REFRESH_ENABLED` | `backend/.env` (cuối file) | [x] |
| 1.5 | Chạy `npm run migrate:check` (hoặc tương đương) trên DB local | (chạy tay) | [ ] |
| 1.5 | Chạy `npm test` → 2 test file TikTok pass | (chạy tay) | [ ] |

### Workstream riêng (blocker, không thuộc PR TikTok)

- [ ] Mirror migration 292-295 vào `bootstrap.sql` (hiện 0 match)
- [ ] Verify tích hợp 292 (`member_channel_accounts_telegram_whatsapp`) với `tiktok_business_accounts` (nếu cần dùng chung bảng tài khoản)

---

## PR-2: Settings controller + routes (2 ngày)

| # | Việc | File / test | Trạng thái |
|---|---|---|---|
| 3.1 | Controller `tiktokSettings.controller.js` (6 endpoint: connect/callback/accounts/refresh/delete/test-send) | `backend/src/controllers/tiktokSettings.controller.js` | [x] |
| 3.2 | Routes `tiktokSettings.routes.js` (mount `/api/settings`, copy pattern Facebook — middleware per route) | `backend/src/routes/tiktokSettings.routes.js` | [x] |
| 3.3 | Mount `tiktokSettingsRoutes` vào `app.js:209` (cùng prefix `/api/settings` với Facebook) | `backend/src/app.js:41,209` | [x] |
| 3.3 | Mount callback public `/api/webhooks/oauth/callback/tiktok` ở `webhook.routes.js` (giống Facebook callback dòng 83) | `backend/src/routes/webhook.routes.js:5,93-95` | [x] |
| 3.3 | Sanitize: bỏ `access_token`/`refresh_token` ra response (`has_access_token`/`has_refresh_token` boolean) | controller + test | [x] |
| 2.4 | Test controller: 6 endpoint + sanitize + 401 + 404 + 400 | `backend/src/controllers/__tests__/tiktokSettings.controller.spec.js` | [x] |
| - | Test region check: callback ở EEA → 403 với hướng dẫn (Bẫy 14) | controller spec | [x] |
| - | Test role check: callback ở personal_account → 403 với hướng dẫn switch (Bẫy 16) | controller spec | [x] |
| - | Test state sai (Bẫy 11) → redirect error=invalid_state | controller spec | [x] |
| - | Test hint check_dm_privacy ở success redirect (Bẫy 15) | controller spec | [x] |
| - | Test revoke best-effort: revoke fail vẫn deactivate | controller spec | [x] |
| - | Chạy `npm test -- --testPathPattern=tiktok` → 45 test pass | (chạy tay) | [x] |

---

## PR-3: BE webhook + adapter + rate limit (4–5 ngày)

| # | Việc | File / test | Trạng thái |
|---|---|---|---|
| 9 | Thêm `tiktok_business: tiktokBusinessAdapter` vào `chatRouter.service.js:32-38` | `backend/src/services/chatbot/chatRouter.service.js:12,38` | [x] |
| 12 | Thêm method `findActiveByExternalChannelId(channelType, externalChannelId)` vào `chatbotChannel.repository.js` | `backend/src/repositories/ai/chatbotChannel.repository.js` | [x] |
| 4 | Adapter `tiktokBusiness.adapter.js` (sendReply + sendImage, slice 6000 chars, refresh 1 lần khi 401) | `backend/src/services/chatbot/channelAdapters/tiktokBusiness.adapter.js` | [x] |
| 4 | Test adapter (7 test): Bẫy 3, Bẫy 8, 401 retry, business_id ở body | `backend/src/services/chatbot/channelAdapters/__tests__/tiktokBusiness.adapter.spec.js` | [x] |
| 5.1 | Mount route `POST /api/webhooks/tiktok-business` (webhookLimiter, không raw body) | `backend/src/routes/webhook.routes.js:101-104` | [x] |
| 5.2 | Verify client_key ∈ env `TIKTOK_APP_CLIENT_KEYS` (fail-open khi env trống) | controller | [x] |
| 5.3 | Handler `_processTikTokBatch` → branch theo 8 event (im_send_msg, im_receive_msg, im_referral_msg, im_mark_read_msg, ...) | `backend/src/controllers/tiktokBusinessWebhook.controller.js` | [x] |
| 5.3 | EU event bị bỏ qua (Bẫy 10 plan) | controller (dòng 95-99) | [x] |
| 5.3 | Touch `last_webhook_at` qua repo (Bẫy plan việc 5) | controller + repo.touchWebhook | [x] |
| 6 | Migration 297: bảng `tiktok_outbound_log` (BIGSERIAL, 2 index cho count + cleanup) | `backend/migrations/297_tiktok_outbound_log.sql` | [x] |
| 6 | Mirror migration 297 sang `bootstrap.sql` | `backend/tests/integration/sql/bootstrap.sql` | [x] |
| 6 | Service `tiktokRateLimit.service.js` (Redis cache + SQL log fallback, fail-closed khi SQL log fail) | `backend/src/services/chatbot/tiktokRateLimit.service.js` | [x] |
| 6 | Test rate limit (7 test): Bẫy 3, count >= 10, Redis miss → SQL, log fail fail-closed, cleanup 42P01 | `backend/src/services/chatbot/__tests__/tiktokRateLimit.service.spec.js` | [x] |
| 6 | Mount cron cleanup log 03:30 hàng ngày | `backend/src/utils/scheduler.js` | [x] |
| - | Method `findByIdAnyUser` + `findByBusinessIdAnyUser` ở repo (internal, không phơi HTTP) | repo | [x] |
| - | Chạy `npm test -- --testPathPattern=tiktok` → 59 test pass | (chạy tay) | [x] |

---

## PR-4: FE kết nối + tab TikTok + i18n (2 ngày)

| # | Việc | File / test | Trạng thái |
|---|---|---|---|
| 7.1 | FE service `tiktokBusinessApi.service.js` (5 method: list/refresh/delete/testSend/getConnectUrl) | `frontend/src/features/settings/services/tiktokBusinessApi.service.js` | [x] |
| 7.2 | Component `TiktokBusinessSettings.jsx` (list + Connect + Refresh + Delete + OAuthErrorNotice + AccountStatus + region/rateLimit notice) | `frontend/src/pages/settings/TiktokBusinessSettings.jsx` | [x] |
| 7.3 | Đăng ký tab TikTok thứ 6 trong `ChannelSettings.jsx:18-23` | `frontend/src/pages/settings/ChannelSettings.jsx` | [x] |
| 7.4 | i18n vi: 18 key mới (tiktokBusiness.title/subtitle/connect/empty/confirmDelete/status/action/toast/rateLimit/regions/errors/hints) | `frontend/src/i18n/vi.js` | [x] |
| 7.4 | i18n en: 18 key tương ứng | `frontend/src/i18n/en.js` | [x] |
| 7.5 | Mở rộng `ChannelNotInPlanNotice.jsx:18` thêm 'tiktok' | `frontend/src/features/settings/components/ChannelNotInPlanNotice.jsx` | [x] |
| 7.5 | Mở rộng `useChannelEntitlements.js` thêm `tiktok` (fail-open) | `frontend/src/hooks/queries/useChannelEntitlements.js` | [x] |
| 7.6 | OAuthErrorNotice component: render 3 bẫy 14/15/16 từ URL params (error=region_unsupported, error=personal_account, hint=check_dm_privacy) | component | [x] |
| 7.6 | AccountStatus pill: 4 trạng thái (connected/expired/expiringSoon/disconnected) | component | [x] |
| 7.6 | URL params clear sau khi đọc (không pollute history) | component | [x] |
| - | Test FE 12 test (render + 3 bẫy + 3 actions + 3 status pill) | `frontend/src/pages/settings/__tests__/TiktokBusinessSettings.spec.jsx` | [x] |
| - | Verify BE 59 test TikTok vẫn pass (không regression) | (chạy tay) | [x] |

---

## PR-5: FE inbox (2–3 ngày)

| # | Việc | Trạng thái |
|---|---|---|
| 8.1 | Component `TiktokChannelCard.jsx` (avatar, @username, unread badge, indicator AI/paused/rate-limited) | [x] |
| 8.1 | Component `TiktokConversationList.jsx` (group theo tiktok_business_account) | [x] |
| 8.2 | Nút toggle AI: gọi endpoint `setAiPaused` đã có (không tạo mới) | [x] |
| 8.3 | Test E2E: 3 account, mỗi account 2 conversation → 3 group, mỗi group 2 card | [x] |

---

## Việc 11: Đăng ký webhook (1 lần, thủ công)

- [ ] Chạy `curl` đăng ký webhook ở TikTok dashboard (1 lần khi onboard app đầu tiên)
- [ ] Tạo `scripts/tiktok/register-webhook.sh` để chạy tay lần sau

---

## Bẫy đã ghi nhận (17)

| # | Bẫy | File:line chính |
|---|---|---|
| 1 | Lưu token plaintext → dùng `encryptSmtpSecret` | `smtpSecretCrypto.js:51-64` |
| 2 | Quên `JSON.parse` 2 lần content | `chatbotChannelWebhook.controller.js` (handler mới) |
| 3 | Race condition rate limit → INSERT WHERE count<10 hoặc Redis atomic | `tiktokRateLimit.service.js` |
| 4 | Nhầm `user_openid` với `id_user` UKNOW | `tiktokBusinessAccount.repository.js:24-37` |
| 5 | Mount webhook sai middleware (đã verify: KHÔNG cần raw body) | `app.js:202` |
| 6 | Quên `bootstrap.sql` mirror (đã xử lý cho 296) | `bootstrap.sql:3395-3436` |
| 7 | `CHANNEL_CONVERSATION_LOG_CHANNELS` — KHÔNG thêm tiktok | `chatRouter.service.js:45-50` |
| 8 | Cron ở file mới (đã mount đúng vào `scheduler.js:1702-1750`) | `scheduler.js:1702-1750` |
| 9 | Tự tạo Redis client mới (sẽ copy `buildRedisConfig()` ở PR-3) | `chatbotRateLimit.service.js:32-42` |
| 10 | Phân biệt EU/non-EU trong webhook | `chatbotChannelWebhook.controller.js` |
| 11 | State OAuth không chữ ký (đã xử lý: HMAC-SHA256) | `tiktokOAuth.service.js:32-78` |
| 12 | Quên method `findActiveByExternalChannelId` (làm ở PR-3) | `chatbotChannel.repository.js` |
| 13 | Đặt tên `tiktok_business` đúng nghĩa | (ghi chú) |
| 14 | Region EEA/CH/UK blocked (đã xử lý: `isRegionSupported`) | `tiktokOAuth.service.js:268-271` |
| 15 | DM privacy = "Friends" → API không nhận (làm ở PR-4 onboarding) | (FE) |
| 16 | Personal account → reject ở callback (Bẫy 16 sẽ check `role` ở PR-2) | `tiktokOAuth.service.js:218-245` |
| 17 | Personal automation (Hooka, UnifyPort) → vi phạm TOS, KHÔNG dùng | (ghi chú trong research) |

---

## Nghiệm thu tổng hợp (theo PR)

- [x] PR-1: migration idempotent, 25 test pass (repo + OAuth pure functions)
- [x] PR-2: 6 endpoint mount đúng (5 qua auth + 1 callback public), 20 test controller pass
- [x] PR-3: 8 event xử lý đúng, response < 3s, rate limit 11/48h block, 14 test mới (adapter + rate limit)
- [x] PR-4: 6 tab hiển thị, OAuth flow E2E (3 bẫy notice), i18n vi/en (18 key), 12 test FE pass
- [x] PR-5: 3 group, toggle AI hoạt động, 21 test FE pass (TiktokChannelCard 12 + TiktokConversationList 9)
- [x] Code review: H1-H4 + M1-M5 đã fix, 0 ESLint warning, 0 regression
- [ ] Việc 11: webhook TikTok đăng ký thành công, sandbox test inbound
