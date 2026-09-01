# Báo Cáo Audit Baseline Send Quota (Wave 2 - PR-Q0)

**Ngày thực hiện:** 01/09/2026
**Trạng thái:** Hoàn tất PR-Q0
**Tác vụ:** Freeze semantics, baseline audit, call-site inventory, provider error classification và policy contract tests.

---

## 1. Call-Site Inventory & Mapping

Đối soát toàn bộ các điểm kiểm tra (`checkSendQuota`) và ghi nhận (`recordDirectSendUsage`) trong codebase:

| STT | Luồng nghiệp vụ | File & Call-site hiện tại | Cơ chế hiện tại | Điểm reserve mục tiêu (Wave 2) |
|---|---|---|---|---|
| 1 | **Campaign Email** | `backend/src/services/campaign/campaignEmailSender.service.js` (dòng ~483) | `checkSendQuota({ userId, channel: 'email' })` | Sau quiet/rate/scheduling gate, ngay trước SMTP call |
| 2 | **Campaign Pre-flight** | `backend/src/services/campaign/campaignRun.service.js` (dòng ~1242) | `checkSendQuota({ userId, channel })` | Giữ advisory read để yield sớm; không reserve cả batch |
| 3 | **Campaign Zalo Workers** | `backend/src/services/campaign/campaignZaloSender.service.js` (dòng ~1880, 2048, 2191) | `checkSendQuota({ userId, channel: 'zalo' })` | Trong worker, sau delay/rate gate, ngay trước provider call |
| 4 | **Direct / Test Email** | `backend/src/services/email/emailSettingsSmtp.service.js` (dòng ~23, ~331) | `assertDirectEmailQuota()` -> `checkSendQuota` + `recordDirectEmailQuota()` -> `recordDirectSendUsage()` | Ngay trước SMTP transport call; settle trong transaction |
| 5 | **Zalo Preview / Test** | `backend/src/controllers/zaloSettings.controller.js` (dòng ~49, ~67, ~2343) | `checkSendQuota()` trước batch + `recordPreviewSendQuota()` sau mỗi recipient | Chuyển orchestration xuống service; reserve từng recipient |
| 6 | **Unified Inbox Manual Zalo** | `backend/src/controllers/unifiedInbox.controller.js` (dòng ~214) + `backend/src/services/chatbot/unifiedInbox.service.js` (dòng ~393) | Pre-flight `checkSendQuota()` ở controller + `debitZaloPersonalInboxIfNeeded()` trong service transaction | Reserve trong service trước provider call; idempotent replay theo `messageId` |
| 7 | **Quick Send Campaign** | `backend/src/controllers/campaign.controller.js` (dòng ~1083) | `checkSendQuota()` ở controller | Chuyển orchestration xuống service, reserve riêng từng channel |

---

## 2. Policy Precedence (Thứ tự ưu tiên kiểm tra hạn mức)

Hệ thống tuân thủ nghiêm ngặt thứ tự 5 tầng sau:

```text
Tier 0: Admin Role Bypass (nếu caller truyền roleCode === 'admin' -> allowed ngay, không query DB)
  ↓
Tier 1: Employee Limits (khi có ownerContextId / khác userId)
  ├─ Membership status !== 'active' -> DENY (employee_inactive)
  ├─ Daily limit = 0 -> DENY (employee)
  ├─ Daily count + req > daily limit -> DENY (employee)
  ├─ Monthly limit = 0 -> DENY (employee)
  └─ Monthly count + req > monthly limit -> DENY (employee)
  ↓
Tier 2: Workspace Subscription & Plan
  ├─ Subscription expired / no active plan -> DENY (expired / no_plan)
  ├─ Daily limit = 0 -> DENY (disabled)
  └─ Daily count + req > daily limit -> DENY (daily)
  ↓
Tier 3: Workspace Monthly Channel Limit + Top-up Wallet Availability
  ├─ Monthly limit = 0 -> DENY (disabled)
  └─ Monthly count + req > monthly limit:
      ├─ coveredByPlan = Math.max(0, monthlyLimit - currentCount)
      ├─ requiredTopup = Math.max(0, requiredCount - coveredByPlan)
      ├─ Nếu ví top-up đủ số dư (wallet.remaining >= requiredTopup) -> ALLOWED (trừ ví lúc settle)
      └─ Nếu ví không đủ -> DENY (monthly)
  ↓
Tier 4: Workspace Combined Period Limit (messages_per_period)
  ├─ Period limit = 0 -> DENY (disabled)
  └─ Combined email + zalo count + req > period limit -> DENY (period)
```

---

## 3. Nguồn đếm dữ liệu (Counting Sources)

| Kênh | Nguồn dữ liệu đếm | Điều kiện lọc |
|---|---|---|
| **Email** | `email_messages` + `usage_logs` (`email_direct_send`) | `status IN ('sent', 'delivered', 'bounced') AND NOT is_preview` |
| **Zalo** | `zalo_messages` + `zalo_personal_messages` + `usage_logs` (`zalo_direct_send`) | `tracking_metadata->>'status' = 'sent' AND NOT is_preview` (campaign)<br>`role = 'agent' AND metadata->>'source' = 'manual_inbox'` (personal) |

---

## 4. Bảng phân loại lỗi Provider (Provider Error Classification)

### 4.1. SMTP Email (`emailBounce.utils.js`, `emailSettingsSmtp.service.js`)

Việc phân loại rate-limit không dựa trên generic 421/450 mà phải dựa trên classifier chuẩn `isSmtpProviderRateLimitError()`:
- Message có dấu hiệu quota/rate-limit (`rate limit`, `quota exceeded`, `temporarily deferred`, `too many requests`, ...);
- Mã 451 kèm gợi ý rate limit (`limit`, `quota`, `exceeded`, `too many`, `throttl`, ...);
- Mã 429 (`Too Many Requests`).

| Mã lỗi / Tình huống | Kết quả Classifier | Xử lý Reservation Wave 2 |
|---|---|---|
| `250 OK` / `messageId` returned | Thành công (`accepted`) | `consumed` |
| `isRecipientAddressNotFoundError(error)` === true (SMTP 550/551/553 với context recipient) | Hard bounce (`billable_bounce`) | **`consumed`** (theo chính sách UKNOW tính phí bounce sau khi gửi) |
| `isSmtpAuthConfigError(error)` === true (auth error, unverified sender) | Lỗi cấu hình gửi (`definitive_no_send`) | `released` |
| `isSmtpProviderRateLimitError(error)` === true | Rate-limited (`definitive_no_send` trước acceptance) | `released` + reschedule |
| Soft bounce khác (mailbox đầy, tạm thời, connection timeout) | Soft bounce | `released` (nếu chắc chắn chưa gửi) hoặc `uncertain` (nếu timeout sau data) |
| Network Timeout / Socket Hangup sau DATA | Không xác định (`unknown`) | **`uncertain`** (không tự động hoàn tiền/gửi lại) |

### 4.2. Zalo Personal / Campaign (`zaloSendErrorClassifier.util.js`, `zaloTimeoutRetry.util.js`)

| Mã lỗi / Tình huống | Kết quả Classifier | Xử lý Reservation Wave 2 |
|---|---|---|
| `status: 'success'` / API trả kết quả | Thành công (`accepted`) | `consumed` |
| Tra số quá giới hạn (`PHONE_LOOKUP_RATE_LIMIT`) | Thất bại trước gửi (`definitive_no_send`) | `released` |
| Số chưa đăng ký / Sai số (`RECIPIENT_NOT_FOUND`) | Thất bại trước gửi (`definitive_no_send`) | `released` |
| Người nhận chặn / Chưa kết bạn (`NOT_FRIEND_OR_BLOCKED`) | Thất bại gửi (`definitive_no_send`) | `released` |
| Mất phiên / Hết hạn session (`ACCOUNT_DISCONNECTED`) | Thất bại xác thực (`definitive_no_send`) | `released` |
| Zalo Timeout / Mạng treo (`TIMEOUT`) | Không xác định (`unknown`) | **`uncertain`** |

---

## 5. Các phát hiện quan trọng trong Baseline Audit (Findings)

1. **Bug Quick-Send Zalo (`campaign.controller.js`):**
   - Khi gửi thử nghiệm Zalo thành công qua `sendPersonalMessage()`, hệ thống chỉ gọi `checkSendQuota()` trước khi gửi mà **không hề gọi `recordDirectSendUsage()` hay ghi nhận vào `usage_logs` / `zalo_personal_messages`**.
   - *Xử lý:* Hotfix ở **PR-Q0.1** ghi `usage_logs` cho Zalo Quick-Send, sau đó migrate sang Reservation Ledger ở **PR-Q3**.

2. **Lỗi Publish Uncommitted Data vào Shared Cache (`userSendLimit.util.js`):**
   - Trong `recordDirectSendUsage()`, hàm gọi `_clearQuotaCache()` rồi chạy query với `client` (transaction chưa commit). Do hàm đếm bị wrap trong `cached()`, kết quả uncommitted này bị lưu vào global process cache 1s, gây hiện tượng transaction-local uncommitted value bị public sang cache dùng chung.
   - *Xử lý:* Chặn ở **PR-Q0.1** bằng cách cung cấp đường count uncached rõ ràng cho transaction client; PR-Q2 tách hẳn live-read query khỏi cache.

3. **Zalo Preview Send Multi-Recipient Loop (`zaloSettings.controller.js`):**
   - Partial DB usage tương ứng partial provider success là hành vi đúng (batch không all-or-nothing). Lỗi thực tế là cửa sổ rủi ro khi provider đã gửi thành công nhưng process crash trước khi `recordPreviewSendQuota()` được gọi, và pre-flight cả batch trước đó không phải atomic authority.
   - *Xử lý:* PR-Q3 chuyển sang mô hình reserve và settle riêng cho từng recipient ngay trước mỗi provider call.

4. **Chính sách Hard Bounce Billing:**
   - Đã xác nhận trên baseline rằng `email_messages.status = 'bounced'` được tính vào quota usage. Do đó, hard bounce sau khi gọi SMTP được phân loại là `consumed`.

---

## 6. HTTP Idempotency Contract (Backward-Compatible)

Đối với các endpoint synchronous/direct send (Direct Email, Zalo Preview, Quick Send, Unified Inbox):

1. **Header và Định danh:**
   - **Header:** `Idempotency-Key: <UUIDv4 | chuỗi opaque 1–128 ký tự>` (Frontend phát UUIDv4, backend chấp nhận chuỗi opaque an toàn 1–128 ký tự).
   - Nếu client không gửi header: Server tự sinh UUID tạm cho request, log metric `missing_client_idempotency_key` để theo dõi mà không làm gián đoạn client cũ.

2. **Request Fingerprint Validation:**
   - Server tính toán `request_fingerprint = SHA256(canonical(channel, recipient, payload_hash, options))` với `fingerprint_version = 'v1'`.
   - `request_fingerprint` là trường bắt buộc (`NOT NULL`) trong bảng `send_quota_reservations`.
   - Khi kiểm tra existing key, so sánh cặp `(fingerprint_version, request_fingerprint)` đã lưu; retry của reservation cũ được tính lại bằng version đã lưu.
   - **Trường hợp trùng key nhưng khác fingerprint:** Trả về HTTP `409 Conflict` với mã lỗi `IDEMPOTENCY_KEY_REUSED` (không thực thi gửi, không trừ quota).

3. **Response Snapshot & Replay Rules:**
   - Khi send thành công và reservation chuyển sang `consumed`, server lưu `response_snapshot` vào ledger.
   - `response_snapshot` chỉ chứa các trường kỹ thuật allowlisted (e.g. `messageId`, `provider`, `sentAt`, `recipientHash`, `status`, `tracking`), kích thước tối đa 4KB, tuyệt đối không lưu token/credentials/raw body/PII.
   - Khi client gọi lại với cùng `Idempotency-Key` và cùng `request_fingerprint`:
     - Nếu đang ở `sending`: Trả về `409 Conflict` (`SEND_ALREADY_IN_PROGRESS`).
     - Nếu đã `consumed`: Replay lại `response_snapshot` đã lưu (hoặc reconstructed snapshot), tuyệt đối không gọi provider lần hai.
     - Nếu đã `released`: Cho phép explicit retry transition cùng row `released -> reserved` dưới lock và cập nhật window snapshot.
     - Nếu đang ở `uncertain`: Không tự động resend/release, dừng auto-retry và yêu cầu đối soát.

4. **Quy định Retention và Dọn dẹp:**
   - Bản ghi ở trạng thái `consumed` và `uncertain` là audit/quota ledger chính thức, lưu trữ tối thiểu 13 tháng để phục vụ đối soát và báo cáo chu kỳ (`uncertain` không bao giờ được tự động dọn vì có rủi ro tin đã gửi ngoài provider).
   - `sending` quá hạn lease phải được sweeper chuyển thành `uncertain`.
   - `reserved` hết hạn lease phải được sweeper transition sang `released` trước khi dọn.
   - Chỉ bản ghi ở trạng thái `released` mới được cleanup sau 30 ngày.
