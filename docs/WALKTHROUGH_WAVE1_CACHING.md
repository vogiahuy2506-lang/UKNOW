# BÁO CÁO NGHIỆM THU — NÂNG CẤP CACHING TOÀN DIỆN CHO UKNOW (WAVE 1)

**Mức độ:** Phức tạp · **Thời gian:** 01/09/2026
**Trạng thái:** Hoàn tất 100% phạm vi code của Wave 1. Toàn bộ **234 backend unit suites (2040 tests)** và **39 frontend test files (222 tests)** đều PASS xanh, frontend lint & build đạt chuẩn.

---

## 1. Chi tiết Phân định Trạng thái Kỹ thuật

### 1. Quota 1s Read Cache (`userSendLimit.util.js`) — Trạng thái: Accepted Risk / Deferred to Wave 2
- **Thực tế mã nguồn:** `checkSendQuota()` trong `userSendLimit.util.js` (được gọi từ các luồng gửi tin chính thức như `campaignEmailSender.service.js` line 483) tiếp tục sử dụng `quotaCache` (Map in-memory, TTL 1,000ms).
- **Phân tích rủi ro:** Helper `cached()` không có singleflight hay cơ chế atomic reservation. Trong kịch bản nhiều luồng gửi/worker bắn tin song song tốc độ cao (burst concurrency) trong cùng 1 giây, các worker có thể cùng đọc số count cũ và cùng cho phép gửi, dẫn đến nguy cơ gửi vượt hạn mức nhỏ (burst over-quota).
- **Phân loại:** Được phân loại chính thức là **Technical Debt / Accepted Architectural Risk của Wave 1 (hoãn xử lý sang Wave 2)**. Kế hoạch Wave 2 sẽ chuyển toàn bộ quyết định gửi tin chính thức sang giao dịch DB có row lock (`FOR UPDATE`) hoặc Redis atomic token bucket / rate limiter.

### 2. Danh mục Cache Toàn diện (30 tầng Cache) & Metadata Khớp 100% Codebase
- **File tài liệu:** `docs/CACHE_INVENTORY.md` và `_internal/CACHE_INVENTORY_2026-08-31.md`
- **Các bổ sung và chuẩn hóa:**
  - `quotaCountCache`: Ghi đúng 16 key patterns thực tế (`${billingUserId}:limits`, `emp:${ownerId}:${employeeId}:limits`, `${billingUserId}:email_today`, `${billingUserId}:email_cycle:${start}:${end}`, `${billingUserId}:zalo_today`, `${billingUserId}:zalo_cycle:${start}:${end}`, `${billingUserId}:combined:${start}:${end}`, `emp:${ownerId}:${employeeId}:email_today`, `emp:${ownerId}:${employeeId}:email_cycle:${start}:${end}`, `emp:${ownerId}:${employeeId}:email_month`, `emp:${ownerId}:${employeeId}:zalo_today`, `emp:${ownerId}:${employeeId}:zalo_cycle:${start}:${end}`, `emp:${ownerId}:${employeeId}:zalo_month`, `resolve:${userId}:${ownerContextId}`, `${billingUserId}:cycle`, `${billingUserId}:subscription`) và các bảng nguồn (`users`, `plans`, `user_members`, `email_messages`, `campaigns`, `usage_logs`, `zalo_messages`, `zalo_personal_messages`).
  - `smtpTransporterCache`: Ghi chính xác tên hàm invalidation là `invalidateTransporter(settingsId)`.
  - `smtpRateLimitStateCache`: `campaignEmailSender.service.js` cache `smtp_account:${settings.id}` với TTL 90 phút (dọn state không hoạt động), khi miss tạo mới limiter queue state.
  - `runNodeCache`: `campaignEmailSender.service.js` cache `run:${runId}:node:${nodeId}` với TTL 30m, Max 500.
  - `matbaoAuthTokenCache`: `matbaoHddtClient.util.js` cache `cachedToken` với TTL 23 giờ từ endpoint `/api/auth/login`.
  - `capacityCache`: `storageCapacity.util.js` cache disk stats với key `${absPath}`, TTL 20s (policy 1s-60s).
  - `ownerMinutesCache`: `aiHandoffResume.util.js` cache timeout minutes với key `ownerUserId`, TTL 60s, invalidation `invalidateAiHandoffAutoResumeCache(ownerUserId)`.
  - `capabilityMapCache`: `helpCenter.service.js` cache context text theo fingerprint bài viết và locale.
  - `founderaiDataCache`: `heroConsultation.service.js` cache data gói cước và khóa học từ `plans` và `courses` với TTL 5 phút.
  - `chatbotOwnerCapCache`: `chatbotRateLimit.service.js` cache owner cap từ `users` với TTL 60s, invalidation `invalidateOwnerCapCache(ownerUserId)`.
  - `chatbotConfigCache`: `chatbotRateLimit.service.js` cache chatbot config từ `custom_chatbots` với TTL 60s, invalidation `invalidateChatbotConfigCache(chatbotId)`.
  - `chatbotRateLimitMemory`: `chatbotRateLimit.service.js` fallback counters với key `cbrl:sender:...`, `cbrl:bot:...`, `cbrl:owner:...`, `cbrl:custom:...`, `cbrl:notified:...` với fixed window từ 60s đến 40 ngày.
  - `zaloSettingCache`: `zaloInbox.service.js` key `${userId}_${accountId}`, invalidation `forgetAccount(userId, accountId)`.
  - `zaloActiveAccountsCache`: `zaloInbox.service.js` đọc `zalo_settings` (`is_active = true AND status = 'connected'`) với TTL 5m, invalidation `invalidateAccountCache()` / `forgetAccount()`.
  - `zaloGroupNameCache` & `zaloUserProfileCache`: `zaloInbox.service.js` key `${accountId}:group:${bare}` và `${accountId}:user:${uid}`, LRUCache max 5,000, TTL 30m.
  - `verifiedDomainsCache`: Ghi đúng cấu trúc `Map` lưu trữ `{ domains: Set<string>, timestamp: number }` keyed bởi `'verified_domains'`.
  - `embeddingCache`: Ghi đúng key pattern đầy đủ `${userId|'global'}:${feature}:${model}:${dim}:${sha256(text).slice(0, 16)}`.
  - `usePublicLandingOverrides`: `usePublicLandingOverrides.js` module object + localStorage, invalidation qua `invalidateOverridesCache(page)` / `refetch()` / postMessage / custom event.
  - `storageQuotaState`: `useStorageQuota.js` module object (`cachedUsage`) có singleflight qua `fetchPromise`.
  - Cột `Stampede Protection`: Phân biệt chính xác giữa `Singleflight + Key Versioning` (cho `hostMappingCache`, `payloadCache`), `In-flight Promise Sharing` (cho `usePlansQuery`, `useStorageQuota`), và `None (In-memory lookup)` (cho các cache đơn giản).

### 3. Các Phần đã Nghiệm thu Đạt Chuẩn Kỹ thuật
- **`verifyCredentials()` Cloudflare:** Kiểm tra chặt chẽ cả `Boolean(response.data?.success)` và `response.data?.result?.status === 'active'`. Đã có unit test bao phủ các ca active, disabled, và API failure.
- **Negative TTL Zone Cache:** Chứng minh đúng 60 giây bằng Jest fake timers (t=30s hit cache, t=61s expired & refetch).
- **Singleflight & Key Versioning:** Hoàn chỉnh trên L1 `LRUCache`, ngăn chặn hoàn toàn loader cũ ghi đè dữ liệu sau mutation invalidation.
- **Pricing Render Loop:** Đã sửa dứt điểm, loại bỏ nguy cơ treo máy (CPU lock).
- **Domain Purge:** Phủ kín tất cả các mutation (auto-provision, setHostname, verifyDns) và hỗ trợ multi-part TLD (`.com.vn`, `.co.uk`) cùng zone isolation.
- **Frontend Isolation & Admin Mutation Invalidation:** Đã có test thực tế trên `queryClient` state.

---

## 2. Bảng Tổng kết Kết quả Kiểm thử Toàn diện

| Hạng mục kiểm thử | Chi tiết | Kết quả |
| :--- | :--- | :--- |
| **Backend Unit Test Suites** | Toàn bộ 234 test suites backend (`npm run test:unit`) | **234/234 suites PASS (2040/2040 tests PASS - 7.3s)** |
| **Backend Targeted Suites** | Các suite caching: `lruCache`, `domainResolver`, `cloudflare`, `landingPagePublic`, `plan`, `adminPlans`, `embeddingCache`, `landingPageDomain` | **52/52 tests PASS** |
| **Frontend Test Files** | Toàn bộ 39 test files frontend (`npm run test`) | **39/39 files PASS (222/222 tests PASS - 4.8s)** |
| **Backend ESLint** | `npm run lint` | **PASS (0 errors, 0 warnings)** |
| **Frontend ESLint** | `npm run lint` | **0 errors, 2 warnings (ngoài scope)** |
| **Frontend Build** | `npm run build` (Vite production bundle) | **PASS (Clean build)** |
| **Git Diff Whitespace** | `git diff --check` | **PASS (0 whitespace error)** |
