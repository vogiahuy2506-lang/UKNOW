# CACHE INVENTORY & BASELINE — UKNOW CAMPAIGN

**Ngày:** 31/08/2026 (Cập nhật: 01/09/2026)
**Phiên bản:** Wave 1 (Toàn diện 100% — Full 30 Cache Layers Matrix)
**Mục đích:** Danh mục quản lý chi tiết toàn bộ 30 tầng cache trong hệ thống UKNOW, cơ chế đồng bộ, trigger invalidation, known architectural deviations / accepted risks, và bảng mô hình hóa kỳ vọng tác động lý thuyết trước khi đo lường thực tế trên staging/production.

---

## 1. Danh mục Toàn diện các Tầng Cache (Full 30 Cache Layers Matrix)

| Tầng / Layer | Tên Cache | Vị trí lưu | Key Pattern | TTL / MaxSize | Negative TTL | Owner Module | Fallback Behavior | Invalidation Trigger | Source of Truth | Stampede Protection | Metrics & Observability |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Backend L1** | `hostMappingCache` | In-Memory (`LRUCache`) | `hostname` (lowercase) | TTL: 60s<br>Max: 1,000 | 30s | `domainResolver.js` | Direct DB Query | Khi domain update/xóa/verify | PostgreSQL (`landing_page_domains`) | Singleflight + Key Versioning | `getDomainResolverCacheStats()` (`hits`, `misses`, `hitRate`) |
| **Backend L1** | `payloadCache` | In-Memory (`LRUCache`) | `slug:<slug>` hoặc `id:<id>` | TTL: 30s<br>Max: 500 | Không (bỏ qua) | `domainResolver.js` | Direct DB Query | Khi landing sửa/xóa/publish | PostgreSQL (`landing_pages`) | Singleflight + Key Versioning | `getDomainResolverCacheStats()` (`hits`, `misses`, `hitRate`) |
| **Backend L1** | `verifiedDomainsCache` | In-Memory (`Map`) | `'verified_domains'` (value: `{ domains: Set<string>, timestamp: number }`) | TTL: 5m<br>Max: 1 entry | Không | `dynamicCors.middleware.js` | Direct DB Query | Khi domain được verify/xóa (`clearVerifiedDomainsCache()`) | PostgreSQL (`landing_page_domains`, `landing_pages`) | None (In-memory Map check) | Reload định kỳ 5m / Mutation invalidation |
| **Backend L1** | `cloudflareZoneCache` | In-Memory (`LRUCache`) | `zoneName` (lowercase) | TTL: 10m<br>Max: 200 | 60s | `cloudflare.service.js` | Bỏ qua edge purge cho unmanaged domain | TTL Expiration | Cloudflare API `/zones` | None (In-Memory LRU check) | `console.warn` log khi unresolvable |
| **Backend L1** | `aiCatalogCache` | In-Memory Object (`catalogCache`) | `'enabled'` / `'all'` | TTL: 10m | Không | `aiModelCatalog.service.js` | Direct DB Query | `invalidateCatalogCache()` khi admin CRUD | PostgreSQL (`ai_models`) | None (In-memory object check) | Unit tests + Log |
| **Backend L1** | `quotaCountCache` | In-Memory (`Map`) | `${billingUserId}:limits`<br>`emp:${ownerId}:${employeeId}:limits`<br>`${billingUserId}:email_today`<br>`${billingUserId}:email_cycle:${start}:${end}`<br>`${billingUserId}:zalo_today`<br>`${billingUserId}:zalo_cycle:${start}:${end}`<br>`${billingUserId}:combined:${start}:${end}`<br>`emp:${ownerId}:${employeeId}:email_today`<br>`emp:${ownerId}:${employeeId}:email_cycle:${start}:${end}`<br>`emp:${ownerId}:${employeeId}:email_month`<br>`emp:${ownerId}:${employeeId}:zalo_today`<br>`emp:${ownerId}:${employeeId}:zalo_cycle:${start}:${end}`<br>`emp:${ownerId}:${employeeId}:zalo_month`<br>`resolve:${userId}:${ownerContextId}`<br>`${billingUserId}:cycle`<br>`${billingUserId}:subscription` | TTL: 1,000ms (1s) | Không | `userSendLimit.util.js` | Direct DB Query | TTL Expiration / `_clearQuotaCache()` | PostgreSQL (`users`, `plans`, `user_members`, `email_messages`, `campaigns`, `usage_logs`, `zalo_messages`, `zalo_personal_messages`) | None (Short-term Map lookup — Xem Accepted Risk Wave 1) | Server log khi vượt hạn mức |
| **Backend L1** | `embeddingCache` | In-Memory (`LRUCache`) | `${userId\|'global'}:${feature}:${model}:${dim}:${sha256(text).slice(0, 16)}` | TTL: 5m<br>Max: 2,000 | Không | `embeddingCache.util.js` | Gemini API Call | TTL Expiration / `clearUserCache()` / `clearAllCache()` | Gemini Embedding API | None (LRUCache eviction) | `getCacheStats()` (`hits`, `misses`, `hitRate`) |
| **Backend L1** | `smtpTransporterCache` | In-Memory (`Map`) | `smtp:${settings.id}` | Process Lifetime | Không | `campaignEmailSender.service.js` | Create new Transporter | `invalidateTransporter(settingsId)` khi update/auth error | PostgreSQL (`email_settings`) | None (Map lookup) | Nodemailer connection pool events |
| **Backend L1** | `smtpRateLimitStateCache` | In-Memory (`Map`) | `smtp_account:${settings.id}` | TTL: 90m (Dọn state không hoạt động) | Không | `campaignEmailSender.service.js` | Tạo state rate-limit window mới | TTL Expiration khi không truy cập quá 90m | In-memory limiter queue state | None (Map lookup) | Campaign send error / rate limit logs |
| **Backend L1** | `runNodeCache` | In-Memory (`Map`) | `run:${runId}:node:${nodeId}` | TTL: 30m<br>Max: 500 | Không | `campaignEmailSender.service.js` | Direct DB Query | TTL Expiration | PostgreSQL (`email_templates`, `email_settings`) | None (Map lookup) | Campaign run execution logs |
| **Backend L1** | `matbaoAuthTokenCache` | In-Memory Object (`cachedToken`) | Singleton (`cachedToken`) | TTL: 23 hours | Không | `matbaoHddtClient.util.js` | Re-login Mắt Bão | Re-login khi 401 / `_resetMatbaoTokenCacheForTests()` | Mắt Bão HDDT API `/api/auth/login` | None (In-memory object check) | E-Invoice issuance logs |
| **Backend L1** | `capacityCache` | In-Memory (`Map`) | `${absPath}` | TTL: 20s (policy 1s-60s) | Không | `storageCapacity.util.js` | Throw `STORAGE_CAPACITY_UNKNOWN` khi đọc disk thất bại | TTL Expiration | OS Disk Stats (`df -k`) | None (Map lookup) | Mã lỗi HTTP 503 `STORAGE_CAPACITY_UNKNOWN` / `STORAGE_CAPACITY_PROTECTED` |
| **Backend L1** | `ownerMinutesCache` | In-Memory (`Map`) | `ownerUserId` (number) | TTL: 60s | Không | `aiHandoffResume.util.js` | Direct DB Query | `invalidateAiHandoffAutoResumeCache(ownerUserId)` / TTL | PostgreSQL (`users`) | None (Map lookup) | AI handoff countdown logs |
| **Backend L1** | `capabilityMapCache` | In-Memory Object | Object: `{ text, builtAt, fingerprint, locale }` | Fingerprint + Locale Match | Không | `helpCenter.service.js` | Rebuild map from DB | `_clearCapabilityMapCache()` khi bài viết CRUD/translate | PostgreSQL (`help_articles`, `help_categories`) | None (Object check) | Help Center AI context logs |
| **Backend L1** | `founderaiDataCache` | In-Memory Object | Object: `{ plans, courses, lastUpdated }` | TTL: 5 minutes | Không | `heroConsultation.service.js` | Return stale data on error | TTL Expiration | PostgreSQL (`plans`, `courses`) | None (Object check) | Hero consultation generation logs |
| **Backend L1** | `chatbotOwnerCapCache` | In-Memory (`Map`) | `ownerUserId` (string/number) | TTL: 60s | Không | `chatbotRateLimit.service.js` | Direct DB Query | `invalidateOwnerCapCache(ownerUserId)` / TTL Expiration | PostgreSQL (`users`) | None (Map lookup) | Rate limit audit log |
| **Backend L1** | `chatbotConfigCache` | In-Memory (`Map`) | `chatbotId` (string/number) | TTL: 60s | Không | `chatbotRateLimit.service.js` | Direct DB Query | `invalidateChatbotConfigCache(chatbotId)` / TTL Expiration | PostgreSQL (`custom_chatbots`) | None (Map lookup) | Rate limit audit log |
| **Backend L1** | `chatbotRateLimitMemory` | In-Memory (`Map`) | `cbrl:sender:${ch}:${bot}:${sender}:m`<br>`cbrl:sender:${ch}:${bot}:${sender}:h`<br>`cbrl:sender:${ch}:${bot}:${sender}:d:${date}`<br>`cbrl:bot:${ch}:${bot}:h`<br>`cbrl:owner:${owner}:d:${date}`<br>`cbrl:custom:${bot}:m`<br>`cbrl:custom:${bot}:h`<br>`cbrl:custom:${bot}:d:${date}`<br>`cbrl:custom:${bot}:mo:${month}`<br>`cbrl:notified:${ch}:${bot}:${sender}:${reason}` | Fixed Window (60s đến 40 ngày) | Không | `chatbotRateLimit.service.js` | In-memory count | Fixed Window Expiration | In-Memory Fallback Counters | Memory Increment | Redis fallback indicator log |
| **Backend L1** | `inboundReplyDebounce` | In-Memory (`Map`) | `${channel}:${accountId}:${conversationId}` | Trailing Edge Debounce (1s-5s) | Không | `inboundReplyDebounce.service.js` | Flush message immediately | Khi flush batch hoàn tất | Inbound Webhook Streams | Execution lock / Next bucket queuing | Inbound debounced metrics |
| **Backend L1** | `zaloSettingCache` | In-Memory (`Map`) | `${userId}_${accountId}` | Process Lifetime | Không | `zaloInbox.service.js` | Direct DB Query | `forgetAccount(userId, accountId)` / Map delete | PostgreSQL (`zalo_settings`) | None (Map lookup) | Sync logs |
| **Backend L1** | `zaloActiveAccountsCache` | In-Memory Object (`_accountCache`) | `'active_accounts'` | TTL: 5m | Không | `zaloInbox.service.js` | Direct DB Query | `invalidateAccountCache()` / `forgetAccount()` / TTL 5m | PostgreSQL (`zalo_settings` với `is_active = true AND status = 'connected'`) | None (Object lookup) | Cron sync logs |
| **Backend L1** | `zaloGroupNameCache` | In-Memory (`LRUCache`) | `${accountId}:group:${bare}` | TTL: 30m<br>Max: 5,000 | Không | `zaloInbox.service.js` | Zalo Open API Call | TTL Expiration | Zalo Open API / PostgreSQL | None (LRUCache eviction) | Zalo API error / group resolve logs |
| **Backend L1** | `zaloUserProfileCache` | In-Memory (`LRUCache`) | `${accountId}:user:${uid}` | TTL: 30m<br>Max: 5,000 | Không | `zaloInbox.service.js` | Zalo Open API Call | TTL Expiration | Zalo Open API | None (LRUCache eviction) | Zalo API error / profile resolve logs |
| **Backend L1** | `zaloAccountSession` | In-Memory (`Map`) | `accountId` | Process Lifetime | Không | `zaloAccountSession.service.js` | Re-login Zalo | Khi tài khoản disconnect / session close | Zalo WebSocket / Session | None (Map lookup) | Connection Guard Handlers |
| **HTTP / Edge** | Landing Page Public API & HTML | Cloudflare Edge / Browser | URLs: `/api/public/landing-pages/:slug`, `/api/public/lp`, `https://<host>/` | Browser: 30s<br>CDN: 60s<br>SWR: 120s | Không | `landingPagePublic.controller.js` | Backend API | `cloudflareService.purgeLandingCache()` (non-blocking) | Backend API / PostgreSQL | Cloudflare Edge + ETag SHA-256 / 304 Not Modified | Header `CF-Cache-Status` (`HIT`/`MISS`/`BYPASS`) |
| **HTTP / Edge** | Subscription Plans API | Cloudflare Edge / Browser | URLs: `/api/plans`, `/pricing` | Browser: 30s<br>CDN: 60s<br>SWR: 120s | Không | `plan.controller.js` | Backend API | `adminPlans.controller.js` purge | PostgreSQL (`plans`) | Cloudflare Edge | Header `CF-Cache-Status` (`HIT`/`MISS`/`BYPASS`) |
| **Frontend State** | Public Plans (`usePlansQuery`) | TanStack Query v5 | `['plans', 'public']` | `staleTime`: 60s<br>`gcTime`: 5m | Không | `usePlansQuery.js` | API call | `adminPlansApi.service.js` mutation / `clearQueryCache()` | Backend API `GET /api/plans` | TanStack Query in-flight promise sharing | TanStack Query Cache State |
| **Frontend State** | Public Landing Overrides (`useLandingOverrides`) | Module Object + localStorage | `cachedOverrides[page]` | Module / Application lifetime | Không | `usePublicLandingOverrides.js` | API call | `invalidateOverridesCache(page)` / `refetch()` / postMessage `OVERRIDES_UPDATED` / custom event | Backend API `/public/landing-overrides/:page` | None (Module-level object) | Landing Customizer Editor |
| **Frontend State** | Storage Quota State (`useStorageQuota`) | Module Object (`cachedUsage`) | `cachedUsage` | Module / Application lifetime | Không | `useStorageQuota.js` | API call | `subscribeStorageQuotaRefresh` / `subscribeStorageQuotaClear` (`clearStorageQuotaCache()`) | Backend API `GET /api/storage/quota` | In-flight Promise Sharing (`fetchPromise`) | Custom Event Listener |
| **Frontend State** | Auth Session Cache | Zustand `useAuthStore` | Memory + `localStorage` / `sessionStorage` | Session lifetime | Không | `authStore.js` | Re-login | Logout / Switch Workspace (`await clearQueryCache()`) | Backend API `/users/profile` | Auth Store Actions | Console / Network Inspection |

---

## 2. Bảng mô hình hóa kỳ vọng & Tác động lý thuyết (Expected / Modelled Impact — Pending Staging/Production Empirical Baseline)

> [!IMPORTANT]
> **Trạng thái Gate Vận hành (Operational Gate — Checkpoint 0 & B2):**
> Các số liệu dưới đây thể hiện tác động lý thuyết dự kiến theo kiến trúc Wave 1. Bảng số liệu thực đo (request rate, p50/p95/p99 latency, pg_stat_statements query duration, DB pool connection saturation, và tỉ lệ CF-Cache-Status HIT/BYPASS) sẽ được nghiệm thu trên môi trường Staging/Production sau khi deploy và cấu hình Cloudflare Cache Rule.

| Kịch bản truy cập | Trước khi nâng cấp (Before - Không Cache) | Sau khi nâng cấp Wave 1 (After - Dự kiến) | Cải thiện kỳ vọng lý thuyết |
| :--- | :--- | :--- | :--- |
| **Khách truy cập Custom Domain Landing** (`GET https://sub.domain.com/`) | 2 truy vấn DB liên tiếp (`getPublishedLandingIdForHost` + `getPublishedPayloadById`) cho mỗi request | **0 truy vấn DB** khi L1 Hit.<br>**2 truy vấn DB** khi L1 Cold Miss (1 mapping query + 1 payload query) và được cache ngay. | Giảm 100% tải DB khi cache hit; thời gian phản hồi giảm từ ~80ms xuống <2ms tại backend. |
| **100 request đồng thời vào cùng 1 Custom Landing mới** | 200 truy vấn DB đồng thời (Cache stampede rủi ro nghẽn DB pool) | **2 truy vấn DB duy nhất** (1 mapping + 1 payload) qua Singleflight Concurrency Deduplication; 98 request còn lại share Promise. | Loại bỏ 99% truy vấn trùng lặp trong khoảnh khắc bùng nổ traffic. |
| **Tấn công / spam hostname không tồn tại** | Mỗi request đều query DB tìm kiếm trong bảng `landing_page_domains` | 1 query DB ban đầu, sau đó **Negative Cache 30s** chặn đứng toàn bộ request tiếp theo tại RAM. | Triệt tiêu nguy cơ vét cạn connection pool từ bot/crawler quét subdomain rác. |
| **Admin chỉnh sửa / xóa Landing Page** | Dữ liệu stale có thể bị loader cũ nạp lại nếu có request in-flight | **Key Versioning & in-flight version checking** hủy ghi stale data + Purge Cloudflare Edge tức thì. | Đảm bảo tính nhất quán dữ liệu (data consistency) giữa L1 và CDN Edge. |
| **Người dùng xem Bảng giá (Pricing)** | Mỗi component render lại hoặc đổi tab gọi lại API `GET /api/plans` | **TanStack Query deduplication** (staleTime 60s) + HTTP Edge CDN Cache (60s). | Giảm tải 100% request lặp từ client; chuyển đổi trang mượt mà không có loading spinner giật lag. |
| **Admin sửa giá gói cước trong CMS** | Trình duyệt của Admin có thể hiển thị giá cũ tới 60s | **`adminPlansApi.service.js` tự động invalidate `['plans', 'public']`** ngay sau khi mutation thành công. | Admin thấy ngay bảng giá cập nhật trên giao diện mà không cần reload cứng trang. |
| **Chuyển đổi Workspace / Logout tài khoản** | Query cache của workspace trước có thể sót lại trên bộ nhớ client | `await clearQueryCache()` trong `authStore.logout()` và `switchContext()` hủy query đang chạy và xóa sạch cache trước khi đổi activeContext. | Ngăn chặn triệt để rò rỉ dữ liệu giữa các workspace (Workspace Data Isolation). |

---

## 3. Quy định Nghiêm ngặt về Dữ liệu Nhạy cảm, Known Deviations & Rủi ro

### 3.1. Exclusion Policy (Không áp dụng Read Cache Dài hạn)
Hệ thống **TUYỆT ĐỐI KHÔNG** áp dụng read cache dài hạn đối với các luồng nghiệp vụ sau:
1. **Thanh toán & Nạp tiền (PayOS checkout & webhook):** Không cache kết quả thanh toán hay webhook.
2. **Số dư ví & Ledger tài chính:** Luôn đọc trực tiếp từ PostgreSQL với row-level locking (`FOR UPDATE`).
3. **Idempotency keys của Campaign Runs:** Quản lý qua Redis/Postgres lock và ledger.

### 3.2. Known Architectural Deviation & Rủi ro đã nhận diện (Wave 1: Accepted / Deferred Risk)
> [!WARNING]
> **Quota Count Read Cache (`userSendLimit.util.js`) — Trạng thái: Accepted Risk / Deferred to Wave 2:**
> - **Hiện trạng mã nguồn:** `userSendLimit.util.js` sử dụng `quotaCache` (Map in-memory, TTL 1,000ms) để giảm bớt truy vấn đếm tin nhắn lặp lại. Quyết định kiểm tra hạn mức gửi tin `checkSendQuota()` (được gọi trên các luồng gửi chính thức như `campaignEmailSender.service.js` line 483) vẫn đọc từ count cache này.
> - **Rủi ro kỹ thuật:** Helper `cached()` này **không có Singleflight** và **không có cơ chế atomic reservation**. Trong kịch bản nhiều luồng gửi/worker bắn tin song song tốc độ cao (burst concurrency) trong cùng cửa sổ 1 giây, các worker có thể cùng đọc số count cũ và cùng cho phép gửi, dẫn đến nguy cơ gửi vượt hạn mức nhỏ (burst over-quota).
> - **Kế hoạch Wave 2:** Giữ cache 1s này chỉ cho mục đích hiển thị/pre-flight advisory; toàn bộ quyết định gửi tin chính thức cuối cùng sẽ được chuyển sang giao dịch DB có row lock (`FOR UPDATE`) hoặc Redis atomic token bucket / rate limiter.

---

## 4. Hướng dẫn Giám sát (Observability)

- **API Endpoint:** `GET /api/admin/system/overview` (Yêu cầu quyền Admin).
- **Cấu trúc dữ liệu giám sát L1 Cache:**
  ```json
  "caches": {
    "domainResolver": {
      "hostMapping": {
        "size": 12,
        "maxSize": 1000,
        "ttlMs": 60000,
        "hits": 450,
        "misses": 15,
        "evictions": 0,
        "sets": 15,
        "hitRate": 0.9677
      },
      "payload": {
        "size": 8,
        "maxSize": 500,
        "ttlMs": 30000,
        "hits": 380,
        "misses": 10,
        "evictions": 0,
        "sets": 10,
        "hitRate": 0.9744
      },
      "enabled": true
    }
  }
  ```
