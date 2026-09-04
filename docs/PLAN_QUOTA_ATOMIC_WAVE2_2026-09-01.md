# PLAN — Wave 2: Atomic Send Quota & Reservation Ledger

**Ngày:** 01/09/2026

**Mức độ:** Phức tạp · effort cao

**Trạng thái:** Sẵn sàng giao Gemini implement theo từng PR; tài liệu chính thức được Git theo dõi

**Phạm vi:** quota gửi Email/Zalo, employee/workspace limits, top-up wallet,
campaign/BullMQ retry, direct/preview/inbox send và observability

**Phụ thuộc:** Wave 1 caching đã hoàn tất; PostgreSQL là source of truth

---

## 0. Hướng dẫn bắt buộc cho người implement

Đây là plan correctness, không phải plan read-cache. Gemini phải implement tuần tự theo các PR bên
dưới, không gộp toàn bộ thành một PR lớn.

Trước mỗi PR:

1. Đọc `CLAUDE.md`, `AGENTS.md`, plan này và code hiện tại ở các call site được liệt kê.
2. Chạy `git status --short`; không chạm file ngoài scope.
3. Xác nhận migration number mới nhất. Tên dự kiến là
   `178_send_quota_reservations.sql`, nhưng phải dùng **next available number** tại thời điểm làm.
4. Giữ kiến trúc `routes -> controllers -> services -> repositories -> database`; không thêm SQL
   mới vào controller.
5. Mọi migration là append-only, không có `BEGIN/COMMIT`, và phải mirror vào
   `backend/tests/integration/sql/bootstrap.sql`.
6. Nếu code thực tế khác plan ở điểm làm thay đổi state machine, cách đếm hay contract API, dừng và
   báo finding trước khi tự thiết kế lại.

Không được:

- dùng Redis/Map làm source of truth cho quota, wallet hoặc send ledger;
- giữ DB transaction/advisory lock trong lúc gọi SMTP/Zalo/API ngoài;
- fallback sang cache 1 giây khi PostgreSQL reservation lỗi ở chế độ enforce;
- giải phóng một send có kết quả provider không chắc chắn rồi gửi lại ngay;
- thay đổi quiet hours Zalo `23:00–06:00`, rate limit hoặc campaign scheduling;
- xoá cache 1 giây trước khi tất cả call site đã migrate và rollout đã ổn định.

---

## 1. Vấn đề cần giải quyết

`checkSendQuota()` hiện là quy trình read/check rồi mới send. Các `COUNT` được cache trong process
1.000 ms. Khi nhiều request/worker cùng chạy, tất cả có thể đọc cùng một số cũ và cùng được phép
gửi. Đây là race condition check-then-act; giảm TTL hoặc thêm singleflight không thể sửa tính nguyên
tử.

Luồng direct/preview còn có cửa sổ lỗi lớn hơn:

```text
check quota -> provider chấp nhận -> recordDirectSendUsage()
                                      ^
                         process chết ở đây => đã gửi nhưng chưa ghi usage
```

Top-up wallet cũng chỉ được kiểm tra trước, rồi debit sau provider send. Nhiều send đồng thời có thể
cùng thấy số dư còn lại. `topup_debits` đã có idempotency và advisory lock, nhưng check quota, giữ
chỗ wallet và ghi usage chưa nằm trong cùng một protocol.

Mục tiêu Wave 2:

- không cho phép burst concurrency vượt quota đã cấu hình;
- cùng một logical send/retry chỉ chiếm quota và trừ ví một lần;
- bảo toàn hành vi employee/workspace/daily/monthly/combined-period hiện tại;
- xử lý rõ ba kết quả provider: thành công, thất bại chắc chắn, không xác định;
- triển khai từng nhóm call site bằng feature flag, có shadow mode và rollback nhanh.

Không hứa exactly-once delivery qua SMTP/Zalo. Không thể đạt exactly-once với provider không có
idempotency/reconciliation API. Wave này đảm bảo **at-most-one quota charge cho một logical send** và
không tự động gửi lại trường hợp kết quả không xác định.

---

## 2. Phạm vi và ngoài phạm vi

### Trong phạm vi

- Quota Email và Zalo ở workspace owner và employee context.
- Daily limit theo múi giờ Việt Nam, billing-cycle monthly limit và
  `messages_per_period` dùng chung hai kênh.
- Top-up wallet `emails` và `zalo_messages`.
- Direct SMTP/test send, Zalo preview/test, unified inbox manual Zalo Personal.
- Campaign Email và các BullMQ worker Zalo.
- Idempotency key, reservation state machine, reconciler và metrics.
- Giữ `checkSendQuota()` làm read-only advisory cho UI/pre-flight trong giai đoạn chuyển đổi.

### Ngoài phạm vi

- Redis L2 application read-cache ở Checkpoint D của plan caching.
- AI credits, storage quota, chatbot visitor rate limit.
- Scale-out toàn bộ campaign runtime/locks/progress.
- Thay đổi giá gói, định nghĩa billing cycle hoặc quota message text nếu không cần thiết.
- Exactly-once provider delivery.

Plan caching hiện tại ghi Redis runtime có thể chứa “quota”, nhưng với send quota tính tiền của UKNOW,
quyết định cố định của plan này là PostgreSQL ledger. Redis sau này chỉ có thể làm accelerator/rate
limiter không mang tính billing; Redis lỗi không được làm sai số quota.

---

## 3. Baseline code phải được bảo toàn

### 3.1. Nguồn đếm hiện tại

`backend/src/utils/userSendLimit.util.js` tổng hợp usage từ:

- `email_messages` với trạng thái được tính quota và `is_preview = false`;
- `zalo_messages` với trạng thái gửi trong `tracking_metadata` và `is_preview = false`;
- `zalo_personal_messages` do agent/manual inbox gửi;
- `usage_logs` loại `email_direct_send` và `zalo_direct_send`;
- quan hệ `users`, `plans`, `user_members`, subscription và billing cycle.

`quotaCache` TTL 1 giây hiện cache resolve context, limit, cycle và count. Sau Wave 2, cache này được
đổi tên/ghi chú thành **advisory read cache**; atomic reservation tuyệt đối không gọi helper
`cached()`.

### 3.2. Thứ tự policy hiện tại

Phải giữ cùng ý nghĩa và thứ tự deny:

1. Admin bypass khi caller thực sự truyền admin role.
2. Employee active + employee daily/monthly limit.
3. Subscription expired/no plan.
4. Workspace daily limit.
5. Workspace monthly channel limit; phần vượt plan có thể dùng top-up wallet.
6. Workspace combined `messages_per_period` cho Email + Zalo.

Campaign hiện chủ ý không truyền role để quota owner luôn được áp dụng. Không vô tình biến campaign
của admin thành bypass.

### 3.3. Call-site inventory bắt buộc đối soát lại trước khi code

| Luồng | Call site hiện tại | Điểm reserve mục tiêu |
|---|---|---|
| Campaign Email | `campaignEmailSender.service.js` quanh dòng 483 | Sau quiet/rate/scheduling gate, ngay trước SMTP/provider call cho từng recipient |
| Campaign pre-flight | `campaignRun.service.js` quanh dòng 1242 | Chỉ advisory/yield; không reserve sớm cho cả batch |
| Campaign Zalo workers | `campaignZaloSender.service.js` quanh dòng 1880, 2048, 2191 | Trong worker, sau mọi delay gate, ngay trước provider call |
| Direct/test SMTP | `emailSettingsSmtp.service.js` | Ngay trước provider call; settle cùng usage log |
| Zalo preview/test | `zaloSettings.controller.js` | Di chuyển orchestration xuống service; reserve từng recipient, không reserve cả danh sách quá sớm |
| Unified inbox manual | `unifiedInbox.controller.js` + `unifiedInbox.service.js` | Trong service, trước provider call; retry dùng cùng logical key |
| Campaign quick send | `campaign.controller.js` quanh dòng 1083 | Di chuyển quota orchestration khỏi controller, audit cả Email/Zalo success persistence |

Trước PR đầu tiên phải chạy lại:

```bash
rg -n "checkSendQuota|recordDirectSendUsage" backend/src backend/tests
```

Mọi call site mới phát hiện phải được thêm vào matrix và migration checklist; không được để một
đường gửi production chỉ dùng pre-flight cũ.

### 3.4. Findings đã xác nhận sau baseline audit ngày 01/09/2026

| Finding | Kết luận từ code | Xử lý bắt buộc |
|---|---|---|
| Quick-Send Zalo không ghi usage | **Confirmed.** `testSendQuickCampaign()` trả success ngay sau `sendPersonalMessage()`; nhánh Email đi qua `sendCustomEmail()` và có ghi usage, nhánh Zalo không gọi `recordDirectSendUsage()` hay ghi nguồn quota khác | Hotfix ở PR-Q0.1, sau đó thay bằng reservation trong PR-Q3 |
| Transaction-local count bị publish vào global cache 1 giây | **Confirmed.** `recordDirectSendUsage()` insert `usage_logs` chưa commit rồi gọi `countEmail/ZaloSentThisMonth(..., client)`; loader query bằng transaction client nhưng wrapper `cached()` lưu kết quả ra `quotaCache` dùng chung process | Chặn ngay ở PR-Q0.1; PR-Q2 tách hẳn live transactional counts khỏi advisory cache |
| Zalo preview ghi usage từng recipient | **Finding đúng một phần.** Partial DB usage tương ứng partial provider success là hành vi đúng; batch không được all-or-nothing. Lỗi thật là cửa sổ provider đã thành công nhưng process crash trước `recordPreviewSendQuota()` và pre-flight cả batch không phải atomic authority | PR-Q3 dùng một reservation/idempotency key cho từng recipient ngay trước provider call; không reserve cả batch hàng loạt |
| Hard bounce đang được tính quota | **Confirmed cho campaign baseline.** Các count Email đều gồm `email_messages.status = 'bounced'`; campaign SMTP recipient bounce tạo row bounced và có thể debit wallet. Direct/preview hiện chưa hoàn toàn nhất quán | Chốt policy Wave 2: hard bounce sau provider attempt là `consumed`; recipient đã biết hard-bounced và bị skip trước provider thì không consume |

“Dirty read” ở finding thứ hai chính xác hơn là **transaction-local uncommitted value bị publish vào
shared application cache**. PostgreSQL không cho transaction khác đọc row chưa commit; chính process
Node đã materialize count bằng `client` rồi chia sẻ value đó. Ảnh hưởng giới hạn ở các request trùng
cache key/billing workspace, không phải mọi user trong hệ thống, nhưng vẫn có thể gây false deny hoặc
wallet allocation sai trong cửa sổ race nên là correctness bug cần chặn trước PR-Q1.

---

## 4. Quyết định kiến trúc

### 4.1. PostgreSQL reservation ledger là authority

Luồng đích:

```text
request/worker
  -> advisory scheduling/rate/quiet-hour gates
  -> reserveSendQuota() trong transaction + workspace advisory lock
  -> COMMIT, nhả lock
  -> đánh dấu sending
  -> gọi provider (không giữ transaction)
     -> thành công chắc chắn: consume reservation + ghi source/usage + debit wallet cùng transaction
     -> thất bại chắc chắn trước acceptance: release reservation
     -> timeout/kết quả mơ hồ: mark uncertain, không auto-send lại
```

Một advisory lock theo `billing_user_id` đủ tuần tự hoá đồng thời employee, workspace, hai channel và
combined-period của cùng workspace. Repository dùng pattern hiện có của repo:

```sql
SELECT pg_advisory_xact_lock(hashtext($1::text), hashtext($2));
-- params: send_quota:${billingUserId}, workspace
```

Nếu cần lock wallet trong cùng transaction, thứ tự duy nhất ở mọi code path là:

1. send-quota workspace lock;
2. wallet lock của `item_key`.

Gemini phải audit `topupWallet.service.js`, `topup.repository.js` và các caller khác để không tạo thứ
tự lock ngược. Transaction không được retry vô hạn; log lock wait và trả lỗi hạ tầng có kiểm soát.

### 4.2. Ledger song song với dữ liệu lịch sử

Không backfill hàng triệu message cũ và không chuyển toàn bộ analytics sang bảng mới trong một lần.
Công thức đếm sau khi một path được migrate:

```text
legacy source rows có quota_reservation_id IS NULL
+ reservation ledger có is_metered = true ở trạng thái reserved/sending/uncertain/consumed
= quota usage thực tế
```

Source row của send mới gắn `quota_reservation_id`, vì vậy không bị đếm hai lần. Ledger là phần usage
canonical cho send mới; message/usage row vẫn phục vụ tracking và analytics.

### 4.3. Không giữ transaction qua network I/O

Reservation là saga ba bước, không phải một transaction khổng lồ:

1. Reserve transaction.
2. Provider I/O ngoài transaction.
3. Settle transaction.

Crash giữa bước 1 và 2 để lại reservation có lease và được reconciler xử lý. Crash giữa provider
acceptance và bước 3 phải chuyển thành `uncertain`/cảnh báo khi worker hồi phục; không được mặc định
release rồi gửi lại.

### 4.4. Fail-open/fail-closed

| Mode | PostgreSQL reservation lỗi | Hành vi |
|---|---|---|
| `off` | Không gọi code mới | Giữ behavior cũ |
| `shadow` | Log/metric candidate failure | Enforcement cũ vẫn quyết định |
| `enforce` | Không fallback cache/Redis | Fail closed trước provider, HTTP/service code `SEND_QUOTA_UNAVAILABLE` |

Quota exceeded giữ contract hiện tại (`403`, `RESOURCE_LIMIT_EXCEEDED`, `resetAt`, message tiếng
Việt). Hạ tầng quota lỗi là `503`, không giả thành “hết gói”. Logical key đang `sending` có thể trả
`409 SEND_ALREADY_IN_PROGRESS`; đã `consumed` trả kết quả idempotent và tuyệt đối không gọi provider
lần nữa.

---

## 5. Data model mục tiêu

### 5.1. Bảng `send_quota_reservations`

Migration mới tạo bảng với tối thiểu các cột sau. Tên type có thể điều chỉnh theo convention hiện
tại, nhưng invariant không được đổi.

| Cột | Ý nghĩa |
|---|---|
| `id BIGSERIAL PK` | ID nội bộ |
| `reservation_key VARCHAR(...) UNIQUE NOT NULL` | Idempotency key không chứa PII |
| `request_fingerprint VARCHAR(64) NOT NULL` | SHA-256 fingerprint của request payload để chặn key reuse sai payload |
| `fingerprint_version VARCHAR(10) DEFAULT 'v1' NOT NULL` | Phiên bản thuật toán canonical fingerprint hash |
| `billing_user_id BIGINT NOT NULL` | Workspace bị tính quota |
| `actor_user_id BIGINT NULL` | Employee/người thao tác thực tế |
| `membership_id BIGINT NULL` | Snapshot context nếu có |
| `channel VARCHAR(10)` | Chỉ `email` hoặc `zalo` |
| `quantity INTEGER CHECK > 0` | Số đơn vị giữ chỗ |
| `is_metered BOOLEAN DEFAULT true` | `false` cho admin bypass nhưng vẫn giữ idempotency/audit |
| `wallet_item_key VARCHAR(...) NULL` | `emails`/`zalo_messages` nếu cần top-up |
| `wallet_quantity INTEGER DEFAULT 0 CHECK >= 0` | Phần quota được giữ bằng ví |
| `source_type VARCHAR(...)` | campaign/direct/preview/inbox/quick-send |
| `source_ref JSONB DEFAULT '{}'` | Chỉ ID kỹ thuật, không raw email/phone/content |
| `status VARCHAR(...)` | `reserved`, `sending`, `consumed`, `released`, `uncertain` |
| `vn_day_start`, `vn_day_end TIMESTAMPTZ` | Snapshot cửa sổ daily Việt Nam |
| `cycle_start`, `cycle_end TIMESTAMPTZ NULL` | Snapshot billing cycle |
| `expires_at TIMESTAMPTZ NULL` | Lease của reserved, không phải TTL của consumed |
| `provider_reference VARCHAR(...) NULL` | Message/request ID đã băm hoặc ID an toàn |
| `failure_code VARCHAR(...) NULL` | Mã phân loại, không lưu secret/raw payload |
| `response_snapshot JSONB NULL` | Technical result snapshot allowlisted (<= 4KB, không PII/token) phục vụ replay idempotent an toàn |
| `created_at`, `updated_at` | Audit timestamps |
| `sending_at`, `consumed_at`, `released_at`, `uncertain_at` | State timestamps |

Ràng buộc bắt buộc:

- unique `reservation_key`;
- check channel/status/quantity/wallet quantity;
- `wallet_quantity <= quantity`;
- `request_fingerprint` là mandatory (NOT NULL) trên mọi bản ghi reservation;
- `response_snapshot` chỉ chứa allowlisted technical fields (e.g. `messageId`, `provider`, `sentAt`, `recipientHash`, `status`, `tracking`), giới hạn tối đa 4KB, tuyệt đối không lưu credentials/token/raw body/PII;
- FK user dùng chính sách delete phù hợp audit: không cascade làm mất ledger; ưu tiên `ON DELETE
  RESTRICT` hoặc giữ ID không FK nếu convention dữ liệu hiện hữu yêu cầu. Gemini phải ghi rõ lựa chọn;
- index theo `(billing_user_id, status, vn_day_start, vn_day_end)`;
- index theo `(billing_user_id, channel, status, cycle_start, cycle_end)`;
- index employee `(billing_user_id, actor_user_id, channel, status, ...)`;
- partial index cho reservation active/uncertain và sweeper `expires_at`;
- không dùng PostgreSQL enum để rollback/deploy state mới dễ hơn; dùng `CHECK`.

Quy định Retention và Lifecycle dọn dẹp:
- `consumed` là audit/quota ledger, retention tối thiểu 13 tháng trước khi có policy archive;
- `sending` quá hạn lease (`SEND_QUOTA_SENDING_UNCERTAIN_SECONDS`) phải được sweeper chuyển thành `uncertain`;
- `uncertain` có thể là tin đã gửi thành công ngoài provider nên **tuyệt đối không được tự động cleanup sau TTL**; phải giữ vô thời hạn hoặc tối thiểu 13 tháng cho tới khi được đối soát/reconcile;
- Chỉ bản ghi `released` mới được cleanup sau 30 ngày;
- `reserved` hết hạn lease phải được sweeper transition sang `released` trước khi cleanup.

### 5.2. Liên kết source rows

Thêm nullable `quota_reservation_id BIGINT` và index vào:

- `email_messages`;
- `zalo_messages`;
- `zalo_personal_messages`;
- `usage_logs`.

Mỗi logical send chỉ có một source row quota-bearing. Tạo unique partial index trên
`quota_reservation_id WHERE quota_reservation_id IS NOT NULL` nếu và chỉ nếu audit call site xác nhận
cardinality 1:1. Với direct send `quantity > 1`, một `usage_logs` row đại diện toàn bộ quantity. Nếu có
path hợp lệ 1:N, không nới lỏng im lặng: ghi rõ path đó và dùng bảng liên kết riêng hoặc chuyển thành
một reservation cho mỗi recipient.

Migration phải additive, nullable và backward compatible. Không sửa migration cũ. Mirror đầy đủ vào
test bootstrap và cập nhật schema snapshot mà repo đang dùng.

### 5.3. Trạng thái và transition hợp lệ

| Từ | Sang | Khi nào |
|---|---|---|
| chưa có | `reserved` | Atomic check thành công |
| `reserved` | `sending` | Ngay trước provider call; ghi attempt metadata |
| `sending` | `consumed` | Provider xác nhận acceptance/success |
| `reserved` | `released` | Bị huỷ chắc chắn trước provider call |
| `sending` | `released` | Provider trả lỗi chắc chắn không nhận request |
| `sending` | `uncertain` | Timeout/network/process recovery không biết provider đã nhận chưa |
| `uncertain` | `consumed` | Reconcile chứng minh đã gửi |
| `uncertain` | `released` | Reconcile chứng minh chưa gửi |
| `released` | `reserved` | Chỉ explicit retry của cùng logical send sau definitive no-send, dưới lock |

Transition khác phải bị repository/service từ chối. `consumed` là terminal. Idempotent call lặp lại
transition hiện tại phải trả cùng kết quả, không tạo side effect mới.

Các trạng thái được tính quota: `reserved`, `sending`, `uncertain`, `consumed`. `released` không tính.
Chỉ row `is_metered = true` được đưa vào count. Wallet hold chỉ tính ở `reserved`, `sending`,
`uncertain`; khi `consumed`, top-up debit đã được insert trong cùng settle transaction nên không cộng
hold lần hai.

Admin bypass vẫn phải đi qua idempotency/state machine để retry không gửi trùng, nhưng reservation có
`is_metered = false`, `wallet_quantity = 0` và không kiểm plan/quota. `billing_user_id` dùng workspace
context nếu có, nếu không dùng chính admin user ID để giữ key/ownership nhất quán. Campaign tiếp tục
không truyền admin role nên luôn là metered như hiện tại.

Mốc tính usage của ledger là thời điểm transaction reserve thành công, không phải thời điểm provider
trả response. Đây là lựa chọn xác định để request sát 00:00 không nhảy giữa hai cửa sổ. Vì reserve
được đặt ngay trước provider call nên sai lệch thông thường rất nhỏ. Nếu một row `released` được
explicit retry ở ngày/kỳ mới, transaction re-reserve phải cập nhật lại toàn bộ window snapshot; row
`consumed` không bao giờ đổi cửa sổ.

---

## 6. Service/repository contract

Tạo module riêng thay vì tiếp tục phình `userSendLimit.util.js`:

```text
backend/src/repositories/sendQuota.repository.js
backend/src/services/quota/sendQuotaReservation.service.js
backend/src/services/quota/sendQuotaReconciliation.service.js
backend/src/services/quota/sendQuotaKey.service.js
```

Tên có thể theo convention hiện tại nhưng trách nhiệm phải tách:

- repository: SQL, lock, insert/update/select/count;
- reservation service: policy orchestration và transaction;
- key service: canonical idempotency key, hash phần có thể chứa PII, request fingerprint;
- reconciliation service: sweep/reconcile state treo;
- controller chỉ map HTTP input/output.

API nội bộ mục tiêu:

```js
reserveSendQuota({
  userId,
  actorUserId,
  ownerContextId,
  membershipId,
  roleCode,
  channel,
  quantity,
  reservationKey,
  requestFingerprint,
  fingerprintVersion = 'v1',
  sourceType,
  sourceRef,
})

markSendQuotaSending({ reservationId, attemptKey })

consumeSendQuota({
  reservationId,
  providerReference,
  responseSnapshot, // allowlisted technical result snapshot (<= 4KB)
  persistSource, // callback/repository operation dùng cùng DB client
})

releaseSendQuota({ reservationId, reasonCode })

markSendQuotaUncertain({ reservationId, reasonCode, providerReference })
```

`reserveSendQuota()` phải:

1. Resolve billing/actor context không qua quota cache.
2. Mở transaction, lấy workspace quota advisory lock.
3. Tìm `reservation_key` trước:
   - Nếu đã có: so sánh cặp `(fingerprint_version, request_fingerprint)` đã lưu với fingerprint được tính toán theo đúng version đã lưu của reservation đó. Khi nâng thuật toán fingerprint, retry của reservation cũ phải được tính lại bằng version đã lưu, không dùng mặc định version mới.
   - Nếu fingerprint mismatch: throw `409 IDEMPOTENCY_KEY_REUSED` (không gọi provider, không trừ quota).
   - Nếu fingerprint match: trả idempotent result/state hiện tại (nếu `consumed`, trả `response_snapshot`).
4. Đọc live employee status/limits, subscription/plan/cycle trong cùng client.
5. Đếm legacy rows `quota_reservation_id IS NULL` + ledger states đang tính quota.
6. Áp policy đúng thứ tự mục 3.2 cho `quantity`.
7. Nếu vượt monthly plan, lấy wallet lock sau quota lock; available wallet bằng
   `grants - debits - active_wallet_holds`.
8. Insert reservation với snapshot windows, `request_fingerprint`, `fingerprint_version` và `wallet_quantity`.
9. Commit, clear advisory read cache và trả reservation.

`consumeSendQuota()` phải trong một transaction:

1. Lấy quota lock rồi wallet lock nếu cần.
2. Lock reservation row `FOR UPDATE`.
3. Nếu đã consumed, trả idempotent success (với `response_snapshot`); nếu released, từ chối.
4. Gọi persistence operation bằng đúng `client` để ghi source row/usage row với
   `quota_reservation_id`.
5. Insert `topup_debits` idempotently với `source_key = quota_reservation:<id>` cho
   `wallet_quantity`.
6. Chuyển reservation thành consumed, lưu `response_snapshot` và `provider_reference`.
7. Commit rồi clear advisory read cache.

Không được truyền callback tuỳ ý từ controller. `persistSource` ở pseudocode phải là operation/service
đã kiểm soát hoặc repository method cụ thể, để transaction boundary rõ và test được.

### Read-only API cũ

Trong giai đoạn chuyển đổi:

- `checkSendQuota()` vẫn trả shape cũ cho UI, pre-flight và campaign yield;
- đổi comment để nói rõ kết quả advisory, không đủ quyền cho provider send;
- thêm tùy chọn `queryable`/các hàm `...Uncached` ở tầng repository để reservation transaction không
  vô tình dùng global Map;
- `recordDirectSendUsage()` được giữ tương thích cho path chưa migrate, sau đó deprecate và xoá ở PR
  cleanup cuối.

---

## 7. Idempotency key theo từng luồng

Key không được chứa raw email, phone, UID hay message content. Nếu recipient là thành phần duy nhất,
dùng SHA-256 và chỉ log prefix hash.

| Luồng | Key canonical đề xuất |
|---|---|
| Campaign Email | `campaign:{runId}:{nodeId}:email:{recipientKeyHash}:{logicalStep}` |
| Campaign Zalo | `campaign:{runId}:{nodeId}:zalo:{recipientKeyHash}:{logicalStep}` |
| Unified inbox | `inbox:zalo:{messageId}`; tạo DB message/id trước hoặc dùng client idempotency key |
| Direct/test Email | `direct:email:{billingUserId}:{clientIdempotencyKey}` |
| Zalo preview/test | `preview:zalo:{billingUserId}:{requestKey}:{recipientHash}` |
| Campaign quick send | `quick:{channel}:{billingUserId}:{requestKey}:{recipientHash}` |

Campaign retry phải dùng cùng logical key, không thêm BullMQ attempt number vào phần định danh send.
`campaign_run_recipient_steps` unique key hiện có là nguồn tốt để tạo logical identity; không tạo một
reservation mới chỉ vì job retry.

Với endpoint do người dùng bấm gửi:

- frontend tạo UUID một lần cho hành động và gửi `Idempotency-Key`/field tương đương;
- retry HTTP cùng action dùng lại UUID;
- server tính `request_fingerprint = SHA256(canonical(channel, recipient, payload_hash, options))`;
- nếu tìm thấy `reservation_key` đã tồn tại nhưng `request_fingerprint` khác: từ chối ngay với HTTP `409 IDEMPOTENCY_KEY_REUSED`, không gọi provider và không trừ quota;
- nếu `reservation_key` và `request_fingerprint` khớp:
  - đang ở `sending`: trả `409 SEND_ALREADY_IN_PROGRESS`;
  - đã `consumed`: trả `response_snapshot` đã lưu (hoặc reconstructed result), không gọi provider lần hai;
  - đã `released`: cho phép explicit retry transition cùng row `released -> reserved` dưới lock và cập nhật window snapshot;
- giai đoạn backward compatible có thể server-generate key cho client cũ, nhưng key đó chỉ bảo vệ
  trong một request và phải có metric `missing_client_idempotency_key`;
- sau khi frontend đã rollout, cân nhắc bắt buộc header ở contract version sau, không phá client cũ
  trong PR đầu.

Retention của idempotency records:
- `consumed` record là audit/quota ledger chính thức, lưu trữ tối thiểu 13 tháng để phục vụ đối soát và báo cáo chu kỳ;
- chỉ bản ghi `released` mới được dọn dẹp sau 30 ngày; expired `reserved` phải được sweeper transition sang `released` trước khi dọn.

---

## 8. Phân loại kết quả provider và policy hard bounce

Mỗi adapter SMTP/Zalo phải map lỗi vào ba nhóm; không suy từ message text phân tán ở call site.

| Nhóm | Ví dụ | Reservation |
|---|---|---|
| `accepted` | provider trả message/request ID hoặc success chắc chắn | `consumed` |
| `billable_bounce` | SMTP đã được gọi và trả recipient hard bounce | `consumed` theo baseline/policy UKNOW |
| `definitive_no_send` | validation/pre-known hard bounce trước provider, auth/config reject, quiet/rate gate chưa gọi provider | `released` hoặc chưa reserve |
| `unknown` | timeout sau write, connection reset không rõ acceptance, process crash | `uncertain` |

Không được suy luận “hard bounce = provider không nhận = hoàn quota”. Policy sản phẩm hiện tại tính
campaign hard bounce trong quota và top-up. Vì vậy:

- recipient đã được đánh dấu hard-bounced từ trước và bị skip trước provider: không reserve/consume;
- SMTP hard bounce phát sinh sau provider attempt: consume reservation, link source row `bounced` và
  debit wallet nếu phần usage nằm ngoài plan;
- DSN hard bounce đến sau khi provider từng accept: reservation đã consumed, chỉ cập nhật delivery
  status; không release/refund;
- auth/config error và rate-limit chắc chắn chưa gửi: release;
- soft/transient failure chỉ release khi adapter chứng minh provider chưa accept; nếu không chắc thì
  `uncertain`.

Direct/test Email hiện không ghi usage khi `sendMail()` ném hard-bounce, trong khi campaign có ghi row
`bounced`. PR migrate source phải chuẩn hoá theo policy trên và có regression test; không sao chép sự
không nhất quán của baseline sang ledger mới.

Rate-limit/quiet-hour/scheduling phải chạy **trước reserve** nếu chỉ là trì hoãn. Nếu provider đã được
gọi rồi mới trả response mơ hồ, không được phân loại thành definitive chỉ để retry nhanh.

Reconciler:

- `reserved` quá lease nhưng chưa `sending`: release an toàn nếu chứng minh provider chưa được gọi;
- `sending` quá ngưỡng: chuyển `uncertain`, không release tự động;
- `uncertain`: reconcile qua provider/source ledger nếu có khả năng; nếu không có, alert/manual
  resolution;
- mọi sweep dùng `FOR UPDATE SKIP LOCKED`, batch nhỏ, có metric và không chạy song song không giới hạn.

---

## 9. Feature flags và rollout contract

Một biến mode chính:

```text
SEND_QUOTA_RESERVATION_MODE=off|shadow|enforce
```

Thêm allowlist theo source để rollout từng luồng, ví dụ:

```text
SEND_QUOTA_RESERVATION_SOURCES=direct_email,zalo_preview,inbox,campaign_email,campaign_zalo,quick_send
SEND_QUOTA_RESERVED_LEASE_SECONDS=900
SEND_QUOTA_SENDING_UNCERTAIN_SECONDS=300
```

Giá trị/timeout cuối cùng phải được config module validate; không đọc `process.env` rải rác.

- `off`: code cũ hoàn toàn.
- `shadow`: enforcement cũ vẫn quyết định; code mới tính candidate decision và metric mismatch. Shadow
  không tạo wallet debit và reservation shadow không được tính quota. Có thể log snapshot hoặc dùng
  status riêng chỉ khi schema/check đã thiết kế rõ; ưu tiên không ghi ledger ở shadow.
- `enforce`: source trong allowlist phải dùng reservation authority; không gọi provider nếu reserve
  thất bại.

Shadow chỉ chứng minh parity của policy/read model; nó không thể chứng minh loại bỏ race nếu không giữ
chỗ. Tính atomic phải được chứng minh bằng concurrency integration test ở PR-Q2 và staging load test.

Không bật toàn bộ sources cùng lúc. Cổng chuyển source từ shadow sang enforce:

- ít nhất 7 ngày hoặc đủ volume đại diện;
- zero unexplained decision mismatch;
- p95 reserve latency và lock wait trong SLO được chốt từ baseline;
- không có reservation treo quá alert threshold;
- source persistence và wallet reconciliation mismatch bằng 0;
- rollback flag đã được diễn tập staging.

---

## 10. Kế hoạch triển khai theo PR

### PR-Q0 — Freeze semantics, baseline và contract tests

Không thay behavior production.

- [x] Đối soát toàn bộ call sites bằng `rg` và cập nhật matrix mục 3.3.
- [x] Viết test đặc tả cho policy hiện tại: admin bypass, employee inactive, employee daily/monthly,
      expired/no-plan, workspace daily/monthly, wallet top-up và combined period.
- [x] Thêm baseline metrics/log timing cho check hiện tại và DB count queries, không log PII.
- [x] Ghi rõ provider error classification hiện tại ở từng adapter.
- [x] Audit quick-send: xác nhận mọi provider success đang được ghi vào nguồn usage nào; nếu không có,
      ghi finding và bắt buộc sửa ở PR migrate source đó.
- [x] Audit transaction path unified inbox và campaign message persistence.
- [x] Chốt HTTP idempotency contract backward-compatible cho direct/preview/quick-send.

**Gate:** full unit xanh; integration quota/top-up xanh; có tài liệu baseline trước khi tạo enforcement.

### PR-Q0.1 — Blocking correctness hotfix trước schema

PR nhỏ này phải deploy trước PR-Q1/Q2; không chờ reservation rollout mới vá hai lỗi production đã
được xác nhận.

- [x] Sau Quick-Send Zalo success, ghi `zalo_direct_send` amount 1 với đúng
      `billingUserId`, `actorUserId` và source `zalo_quick_send`; failure/quiet-hours không ghi usage.
- [x] Bổ sung mock/test chứng minh nhánh Zalo success ghi đúng một usage, nhánh failure ghi zero;
      nhánh Email không bị double-record vì `sendCustomEmail()` đã tự ghi.
- [x] Tạo đường count uncached cho transaction client. Khi `queryable` là `PoolClient`,
      `countEmailSentInCycle()`/`countZaloSentInCycle()` không được đọc hoặc ghi `quotaCache`.
- [x] Không nhận diện transaction bằng thuộc tính mong manh; API count phải nhận explicit option
      `cache: false` hoặc tách hàm repository/live-count rõ ràng.
- [x] Test rollback: insert usage trong transaction, count uncached thấy row, rollback, request pool
      sau đó không nhận count transaction-local từ cache.
- [x] Test concurrent same-workspace trong khoảng trước COMMIT không thấy cached value chưa commit.
- [x] Giữ `_clearQuotaCache()` sau commit/rollback để tương thích các read advisory còn lại.

PR-Q0.1 chỉ là containment. Nó không tuyên bố quota đã atomic và không thay thế reservation ở PR-Q2/Q3.

**Gate:** targeted `userSendLimit` + `campaign.quickSend` xanh, full backend unit xanh, integration
rollback/concurrency xanh.

### PR-Q1 — Additive schema, repository và state machine (mode off)

- [x] Tạo migration next-available cho `send_quota_reservations` và nullable source links.
- [x] Mirror `backend/tests/integration/sql/bootstrap.sql` và schema snapshot liên quan.
- [x] Tạo `sendQuota.repository.js`: advisory lock, idempotent insert/select, counts, transitions,
      active wallet holds, sweeper queries.
- [x] Tạo key service và unit tests key ổn định/không PII.
- [x] Tạo reservation service với mode `off`; chưa đổi call site production.
- [x] Thêm state transition tests, invalid transition tests, idempotent transition tests.
- [x] Chạy migration safety check.

**Gate:** migration forward chạy trên DB test sạch và DB có schema cũ; mode off không đổi behavior.

### PR-Q2 — Atomic decision engine + concurrency integration tests

- [x] Hoàn tất tách live-read quota policy khỏi global 1s cache; mọi query trong reserve dùng cùng
      `client`. Không được quay lại wrapper advisory đã hotfix ở PR-Q0.1.
- [x] Implement `reserveSendQuota`, `mark...Sending`, `consume`, `release`, `uncertain`.
- [x] Cập nhật count SQL thành legacy-null + reservation ledger, giữ exact status/date predicates.
- [x] Integrate active wallet holds và top-up debit transaction.
- [x] Thêm `SEND_QUOTA_RESERVATION_MODE=shadow`, multidimensional mismatch metrics:
      - `legacy_allow_atomic_deny`: legacy allow nhưng candidate từ chối.
      - `legacy_deny_atomic_allow`: legacy từ chối (403) nhưng candidate allow.
      - `atomic_candidate_error`: lỗi hạ tầng/hệ thống (5xx/internal DB error) trong sandbox;
        các từ chối nghiệp vụ 403 hoặc validation 400 không làm tăng metric lỗi hạ tầng này.
- [x] Chưa chuyển provider call sang enforce.

Integration tests dùng PostgreSQL test thật, nhiều client/transaction thật:

- [x] limit còn 1, 20 concurrent unique keys => đúng 1 allowed;
- [x] 20 calls cùng idempotency key => đúng 1 reservation, cùng result;
- [x] employee limit thấp hơn workspace => employee limit thắng;
- [x] hai employee cùng tranh workspace slot => tổng không vượt workspace;
- [x] Email + Zalo cùng tranh combined-period slot => tổng không vượt;
- [x] monthly plan hết, wallet còn 1 => đúng 1 wallet hold/consume;
- [x] rollback ở mọi bước không để partial debit/source row;
- [x] cycle/day boundary dùng timestamp snapshot đúng múi giờ Việt Nam và chu kỳ hóa đơn;
- [x] lock timeout/deadlock-class error map thành `SEND_QUOTA_UNAVAILABLE` (503), không provider call;
- [x] source row có reservation link không bị đếm hai lần.

**Gate:** concurrency suite lặp 20 vòng không flaky (15/15 gates PASS trên DB test thật); shadow production measurement (24h/48h live traffic) sẽ được thực hiện khi deploy staging/production.

### PR-Q3 — Migrate synchronous/direct send paths

Thứ tự rollout đề xuất: direct Email -> Zalo preview/test -> quick-send -> unified inbox.

- [x] Di chuyển orchestration quota khỏi controller xuống service.
- [x] Frontend/request service tạo và giữ idempotency key cho một user action.
- [x] Reserve ngay trước provider; persist source + consume + wallet debit theo protocol.
- [x] Definitive provider failure release; timeout/ambiguous mark uncertain.
- [x] Zalo preview nhiều recipient reserve từng recipient ngay trước send.
- [x] Unified inbox retry dùng key gốc, không charge hoặc send trùng khi already consumed.
- [x] Giữ response quota hiện tại; thêm 503/409 codes có test.
- [ ] Shadow từng source, staging verify, rồi enforce từng source qua allowlist (operational pending: cần số đo volume đại diện staging/reconciliation trước khi đóng rollout).

**Gate:** provider mocks chứng minh success/definitive failure/timeout/retry; không path synchronous nào
trong allowlist còn gọi `checkSendQuota()` như enforcement duy nhất.

### PR-Q4 — Migrate campaign Email/Zalo và BullMQ retry

**Cập nhật 03/09/2026 — chi tiết hoá sau khi đối soát code thật.** Bản dưới đây thay thế checklist cũ
bằng call site cụ thể (`file:dòng`) và tách PR-Q4 thành ba sub-PR tuần tự vì phạm vi đụng 3 file lớn
(`campaignEmailSender.service.js` 960 dòng, `campaignZaloSender.service.js` 2282 dòng,
`campaignRun.service.js` 7540 dòng). Không gộp Q4a/Q4b/Q4c thành một PR.

**Cập nhật 03/09/2026 (implement)** — Q4a và Q4b **đã implement + test xanh** trên Postgres thật (mode
`enforce`), theo đúng thiết kế mô tả bên dưới:

- Q4a: `campaignEmailSender.service.js` (`sendEmailToCustomerDirect`) đã chuyển sang
  `reserveSendQuota/markSendQuotaSending/consumeSendQuota/releaseSendQuota/markSendQuotaUncertain`.
  Sửa kèm một bug thật phát hiện khi implement: `sendQuotaReservation.service.js` (nhánh mode `off` và
  `shadow`) không copy `resetAt/limitType/limit/currentCount` từ `checkSendQuota()` lên error object khi
  throw — vá tại đó vì `campaignRun.service.js:3457-3484` đọc trực tiếp `resetAt` để quyết định
  pause-and-resume thay vì fail cứng; không vá thì mọi caller mới (không riêng campaign) đều mất field
  này ở mode mặc định production. 5 test integration mới trong
  `backend/tests/integration/synchronousSendQuota.test.js` (describe `Campaign Email Send`): reserve+consume
  thành công, replay đúng idempotency key (mô phỏng BullMQ stalled-job redelivery), hard bounce → consume,
  lỗi SMTP không phân loại được → uncertain, `dailyEmailLimit=1` → recipient thứ hai bị từ chối với
  `resetAt` còn nguyên.
- Q4b: cả 3 kênh Zalo (`sendPersonalMessageByQueue`/`sendFriendRequestByQueue`/`sendGroupMessageByQueue`
  trong `campaignZaloSender.service.js`) dùng chung 4 helper mới trên class
  (`reserveCampaignZaloQuota`/`consumeCampaignZaloQuota`/`settleCampaignZaloQuotaOnError`/
  `markCampaignZaloQuotaUncertain`) thay cho backstop `checkSendQuota` cũ. `campaignRun.service.js`
  (3 call site `send*Queued`) truyền thêm `runId/nodeId/stepIndex/quotaRecipientKey/zaloMessageId`; closure
  dùng chung `updateZaloMessageTrackingMeta` (dòng ~2454) được sửa để gắn `quota_reservation_id` (repository
  method mới `zaloMessageRepository.linkQuotaReservation`) và **bỏ debit ví cũ** (`maybeDebitWalletForSend`
  key `zalo_message:<id>`) khi send đã đi qua reservation — tránh double-debit với debit tự động của
  `consumeSendQuota` (key `quota_reservation:<id>`); path legacy (mode off/shadow) giữ nguyên hành vi debit
  cũ 100%, không đổi gì. 5 test integration mới (describe `Campaign Zalo Send`): reserve+consume cho cả 3
  kênh, release khi provider throw lỗi xác định, replay đúng logical key.
- Q4c: phần "test stalled-job redelivery" coi như đã phủ bởi 2 test replay ở trên (gọi handler 2 lần
  với đúng logical key, xác nhận provider chỉ gọi 1 lần). Phần "reconciliation hook khi resume run" **CHƯA
  làm** — để lại cho PR-Q5 (sweeper chung), không xây riêng cho campaign.

**Review độc lập 03/09/2026** (subagent riêng, tự chạy lại toàn bộ test, không tin báo cáo implement) —
tìm 3 finding, cả 3 đã sửa:
1. **[Đã sửa]** Zalo `consumeCampaignZaloQuota()` gọi `consumeSendQuota()` không truyền `persistSource` —
   việc gắn `quota_reservation_id`/`status='sent'` xảy ra ở transaction RIÊNG (`updateZaloMessageTrackingMeta`),
   không atomic với debit ví. Crash giữa hai bước để lại reservation `consumed` (đã trừ ví) nhưng
   `zalo_messages` vẫn `status='queued'`. Đã vá: `persistSource` giờ tự merge `status='sent'` +
   `linkQuotaReservation` trong CÙNG transaction consume, dùng `payload.zaloMessageId` xuyên suốt 3 call
   site; `updateZaloMessageTrackingMeta` gọi sau đó là ghi đè vô hại (idempotent), chỉ để merge thêm
   field khác (uid/response/groupName...). Test mới xác nhận `zalo_messages.quota_reservation_id` +
   `tracking_metadata.status='sent'` đã đúng NGAY sau khi `sendPersonalMessageByQueue()` trả về, không
   phụ thuộc bước gọi riêng sau đó.
2. **[Đã sửa]** Cả Email lẫn Zalo gộp MỌI lỗi từ `reserveSendQuota()` (kể cả 503
   `SEND_QUOTA_UNAVAILABLE` hạ tầng, 409 `CONCURRENT_SEND_IN_PROGRESS`/`IDEMPOTENCY_KEY_REUSED`) thành
   `plan_send_limit_exceeded` — vi phạm mục 4.4 ("hạ tầng quota lỗi là 503, không giả thành hết gói").
   Với Email còn có tác dụng phụ thật: code cũ để lỗi hạ tầng ném ra ngoài cho retry-wrapper phía trên
   (`executeWithTimeoutRetry`) tự bắt; code mới nuốt hết thành kết quả "sạch" nên một DB blip thoáng
   qua thành `failedSends++` vĩnh viễn thay vì được retry. Đã vá cả hai: chỉ khi
   `quotaErr.code === 'RESOURCE_LIMIT_EXCEEDED'` mới map sang kết quả/nhãn quota-exceeded; mọi lỗi khác
   throw nguyên trạng.
3. **[Đã sửa]** `requestFingerprint` chỉ gồm `{channel, recipient, sourceType, quantity}`, thiếu
   `subject/content/templateId` như plan mẫu — rủi ro thấp (reviewer đánh giá LOW, không double-send/
   double-charge) nhưng vẫn vá cho khớp thiết kế: Email thêm `subject/content(htmlBody)/templateId`,
   Zalo thêm `content(message)`.
- Đã xác nhận một lỗi test **có sẵn trên `main`, không liên quan Wave 2**:
  `src/utils/__tests__/scheduleOnceSkip.spec.js` fail vì mock `database.js` thiếu export
  `isConnectionError` mà `scheduler.js` đang import — `git diff` trên cả 3 file liên quan đều rỗng (không
  phải do Q4a/Q4b), khả năng do một nhánh làm việc song song khác chưa hoàn tất. Cần người khác xử lý
  riêng, sẽ chặn pre-push hook nếu không được vá trước khi merge.

#### 0. Hạ tầng đã có sẵn từ PR-Q1..Q3 — không cần build lại

Đối soát code cho thấy phần lớn plumbing PR-Q4 cần đã được Codex làm sẵn ở các PR trước nhưng **chưa
có call site nào dùng**:

| Thành phần | Vị trí | Trạng thái |
|---|---|---|
| `buildCampaignReservationKey({runId, nodeId, channel, recipient, logicalStep})` | `backend/src/services/quota/sendQuotaKey.service.js:251-261` | Đã có, đã có unit test (`sendQuotaKey.service.spec.js`), **0 call site production** |
| Cột `quota_reservation_id` trên `email_messages`/`zalo_messages`/`zalo_personal_messages`/`usage_logs` | migration `178_send_quota_reservations.sql`, mirror `backend/tests/integration/sql/bootstrap.sql:2843-2864` | Đã có, đã mirror bootstrap |
| `emailSettingsSmtpService.logEmailSentWithClient(client, payload)` — nhận `quotaReservationId`, KHÔNG tự debit ví | `backend/src/services/email/emailSettingsSmtp.service.js:129-211` | Đã có, docblock ghi rõ "Used by atomic persistSource callback and legacy logEmailSent" (dòng 126-128) |
| `zaloMessageRepository.insertCampaignZaloMessage({..., quotaReservationId}, queryable)` | `backend/src/repositories/campaign/zaloMessage.repository.js:58-110` | Đã có, nhận `queryable` client tuỳ chọn |
| `reserveSendQuota/markSendQuotaSending/consumeSendQuota/releaseSendQuota/markSendQuotaUncertain` | `backend/src/services/quota/sendQuotaReservation.service.js:513,969,1043,1171,1259` | Đã có, đã dùng ở PR-Q3 (quick-send, preview, inbox) |

**Không cần migration mới cho PR-Q4** — cột/index cần đều đã tồn tại từ migration 178. Next available
migration number tại thời điểm viết là **179** (`ls backend/migrations | tail -3` → `178_send_quota_reservations.sql`
là mới nhất); chỉ dùng nếu Q4c cần thêm index cho reconciliation, xác nhận lại số trước khi tạo file vì
agent khác có thể đã chiếm 179 lúc implement.

**Khác biệt calling convention phải xử lý:** `checkSendQuota()` (legacy) trả `{allowed:false, message,
resetAt, limitType}` — không throw. `reserveSendQuota()` (mới) **throw** Error có `.status/.code/.resetAt/.limitType`
khi vượt hạn mức (xác nhận tại `sendQuotaReservation.service.js` các dòng ~590, 665-673, 970 `err.status=403;
err.code='RESOURCE_LIMIT_EXCEEDED'`). Mọi call site Q4a/Q4b phải đổi từ `if (!check.allowed)` sang
`try/catch` và map lại đúng shape response hiện tại (`errorType: 'plan_send_limit_exceeded'`, giữ
`resetAt`/`limitType`) để không phá luồng defer/yield đang đọc các field này ở `campaignRun.service.js`.

---

#### PR-Q4a — Campaign Email (làm trước, đơn giản nhất)

**Call site:** `backend/src/services/campaign/campaignEmailSender.service.js`, hàm `sendEmailToCustomerDirect()`.

- Advisory pre-check hiện tại ở `campaignRun.service.js:1239-1263` (hàm `assertSendQuotaOrYield`)
  **giữ nguyên, không đổi** — đây đúng là "pre-flight chỉ advisory" theo mục 3.3 của plan gốc, ngăn
  campaign cắm đầu gửi khi cả batch chắc chắn sẽ bị từ chối. Không reserve ở đây.
- Reserve thật nằm ở `campaignEmailSender.service.js:484`, hiện là:
  ```js
  const emailLimitCheck = await checkSendQuota({ userId: campaign.id_user, channel: 'email' });
  ```
  Vị trí này **sớm hơn** provider call một khoảng (còn phải resolve template/settings/tracking token,
  dòng 503-699 — đều là DB read/build string, không phải network I/O rủi ro). Theo mục 4.1 plan gốc
  ("ngay trước provider call"), cách an toàn nhất là **giữ nguyên vị trí gọi reserve ở dòng 484** (để
  không phải refactor lại toàn bộ hàm 400+ dòng) nhưng rút ngắn khoảng hở bằng cách đặt `markSendQuotaSending()`
  ngay trước `sendRawEmail()` ở dòng 703 — tức tách `reserveSendQuota` (dòng 484) và `markSendQuotaSending`
  (ngay trước dòng 703) làm hai bước, đúng state machine mục 5.3 (`reserved -> sending -> ...`). Nếu
  Cursor thấy khoảng hở này vẫn đáng ngại (ví dụ template lookup chậm bất thường), có thể dời cả
  `reserveSendQuota` xuống ngay trước dòng 703 — đổi vị trí không phá tính đúng, chỉ cần đảm bảo mọi
  nhánh return sớm giữa dòng 484 và 703 (không có nhánh nào hiện tại — đã đọc toàn bộ đoạn 484-700,
  không có `return` nào chen giữa ngoài quota check) đều không rời hàm khi đã có reservation mà chưa release.

- **Key & fingerprint:**
  ```js
  const logicalStep = Number.isInteger(sendMeta?.emailStep) ? sendMeta.emailStep : 1;
  const reservationKey = buildCampaignReservationKey({
    runId, nodeId: actionNode.id, channel: 'email', recipient: customer.email, logicalStep,
  });
  const requestFingerprint = computeRequestFingerprint({
    channel: 'email', recipient: customer.email, subject, content: htmlBody,
    templateId, sourceType: 'campaign_email',
  }); // version 'v2' mặc định
  ```
  `sendMeta.emailStep` đã là logical step 1-based có sẵn trong signature hàm (dùng lại, xác nhận tại
  dòng 506, 516) — không cần query `campaign_run_recipient_steps` để suy ra step.
  Vì key không phụ thuộc `retryMeta`/attempt count, một lần retry theo lịch (nhánh
  `smtp_rate_limited_retry_scheduled`, dòng 469-482 và 747-767) sẽ tự nhiên tái dùng đúng
  `reservationKey` — cơ chế idempotent-replay có sẵn trong `reserveSendQuota` (fingerprint match →
  trả lại state hiện tại, không gọi provider lần hai nếu đã `consumed`) xử lý đúng ca này miễn phí,
  không cần code thêm ở tầng campaign.

- **`sourceType: 'campaign_email'`**, `sourceRef: { runId, nodeId: logNodeIdForDb, emailStep: logEmailStepForDb }`
  (dùng đúng 2 biến đã có sẵn ở dòng 507-508, không đưa email/recipient thô vào `source_ref`).

- **Map từng nhánh kết quả sang state machine** (theo bảng phân loại mục 8 của plan gốc):

  | Nhánh hiện tại | Dòng | Phân loại | Hành động |
  |---|---|---|---|
  | `sendRawEmail()` thành công | 701-714 | `accepted` | `consumeSendQuota({reservationId, providerReference: hash(info.messageId), responseSnapshot: {messageId, provider:'smtp', sentAt}, persistSource: (client) => emailSettingsSmtpService.logEmailSentWithClient(client, {...payload, quotaReservationId: reservation.id})})` |
  | `providerRateLimitError` (SMTP từ chối trước khi nhận) | 722-724, 747-767 | `definitive_no_send` | `releaseSendQuota({reservationId, reasonCode:'SMTP_PROVIDER_RATE_LIMITED'})` — **chỉ khi hết lượt retry** (`!canRetry`, dòng 769); nhánh còn lượt retry (`canRetry`, dòng 754-767) cũng release vì chưa gửi được, lần retry kế tự re-reserve đúng key |
  | `smtpConfigError` (535 v.v.) | 725, 778-818 | `definitive_no_send` | `releaseSendQuota({reservationId, reasonCode:'SMTP_CONFIG_ERROR'})` |
  | SMTP lỗi khác không rõ có bị nhận hay không (`!shouldMarkAsRecipientBounce`, nhánh "smtp_delivery") | 821-856 | `unknown` — **đổi hành vi**: hiện code coi như thất bại chắc chắn (ghi `email_messages.status='failed'`, không debit) nhưng KHÔNG có cách chứng minh SMTP server chưa nhận email trước khi lỗi | `markSendQuotaUncertain({reservationId, reasonCode:'SMTP_DELIVERY_ERROR_AMBIGUOUS'})` thay vì release. Đây là thay đổi hành vi thật so với code hiện tại — ghi rõ trong PR description, không phải hotfix âm thầm |
  | Hard bounce xác định (`shouldMarkAsRecipientBounce`) | 858-905 | `billable_bounce` | `consumeSendQuota({..., persistSource: (client) => { const id = await logEmailSentWithClient(client, {...}); await markEmailMessageBouncedWithClient(client, ...); return id; }})` — **hiện tại 2 call tách rời, 2 transaction khác nhau** (`logEmailSent()` mở transaction riêng ở dòng 868, `markEmailMessageBounced()` là query rời ở dòng 890) → phải gộp vào cùng 1 `client` trong `persistSource` để atomic với `consumeSendQuota`. `campaignEmailSenderRepository.markEmailMessageBounced` hiện không nhận `client` — cần thêm overload nhận `queryable` giống pattern `insertCampaignZaloMessage` |

- **Bỏ `debitWallet: true`** khỏi mọi lời gọi `logEmailSent`/`logEmailSentWithClient` trong luồng
  campaign đã migrate — `consumeSendQuota()` tự debit ví qua `topup_debits` với
  `source_key = quota_reservation:<id>` (mục 6, bước 5 plan gốc). Giữ `debitWallet:true` ở đây sẽ
  debit hai lần qua hai idempotency key khác nhau (`email_message:<id>` cũ vs `quota_reservation:<id>`
  mới) — đây là **bẫy cần tránh số 1**, không phải giả định, đã đọc thấy `logEmailSent()` dòng 222-238
  tự gọi `debitDirectEmailIfNeeded` độc lập với reservation.

**Test bắt buộc PR-Q4a** (unit + integration Postgres thật, theo pattern `synchronousSendQuota.test.js`
đã có từ PR-Q3):
- limit còn 1, gửi 2 recipient khác nhau cùng lúc → đúng 1 email ra provider (mock SMTP), 1 bị từ chối trước gửi;
- retry theo lịch (`smtp_rate_limited_retry_scheduled`) dùng lại đúng reservation, không tạo reservation thứ hai;
- hard bounce → reservation `consumed`, `email_messages.status='bounced'`, `quota_reservation_id` khớp, ví bị trừ đúng 1 lần nếu vượt gói;
- SMTP lỗi không phân loại được → reservation `uncertain`, không tự gửi lại trong cùng run;
- không đổi hành vi các nhánh còn lại của `campaignEmailSenderAttachments.spec.js` (đã có, phải chạy lại xanh).

**Gate Q4a:** `campaignEmailSender` unit + attachments spec xanh; 1 integration test mới xác nhận
concurrency + bounce + uncertain; không đổi API response shape cho phía frontend.

---

#### PR-Q4b — Campaign Zalo cá nhân / nhóm / kết bạn

**Call site đã xác nhận (3 chỗ, đều theo cùng pattern "backstop trong worker"):**

| Kênh | Enqueue (campaignRun.service.js) | Worker thực thi + `checkSendQuota` backstop (campaignZaloSender.service.js) |
|---|---|---|
| Cá nhân | `sendPersonalMessageQueued(...)` gọi tại dòng 4722 | `sendPersonalMessageByQueue()` dòng 1876, quota check dòng 1878 |
| Kết bạn | `sendFriendRequestQueued(...)` gọi tại dòng 6049 | `sendFriendRequestByQueue()` dòng 2044, quota check dòng 2046 |
| Nhóm | `sendGroupMessageQueued(...)` gọi tại dòng 6161 | `sendGroupMessageByQueue()` dòng 2187, quota check dòng 2189 |

Comment tại `campaignRun.service.js:1240-1242` tự gọi các quota check này là "backstop" — xác nhận
đây đúng là điểm "final send boundary" cần reserve, không phải điểm advisory.

**Khác biệt cấu trúc quan trọng so với Email — đọc kỹ trước khi copy pattern Q4a:**

Zalo campaign **không** insert-message-sau-khi-gửi như email. Nó insert một dòng `zalo_messages`
**trước khi gửi** với `tracking_metadata.status='queued'`
(`createZaloMessageTrackingRecord` → `zaloMessageRepository.insertCampaignZaloMessage`,
định nghĩa tại `campaignRun.service.js:2414-2450`, gọi tại dòng 4680 trước khi tới `sendPersonalMessageQueued`
ở dòng 4722), rồi **update** dòng đó thành `status='sent'` sau khi gửi xong qua
`updateZaloMessageTrackingMeta()` (định nghĩa dòng 2454-2496, gọi tại dòng 4816/4754 vùng lân cận).
Việc debit ví Zalo nằm trong chính `updateZaloMessageTrackingMeta`, dòng 2460-2495: khi
`metadata.status==='sent'`, mở transaction riêng, gọi `maybeDebitWalletForSend(client, {billingUserId,
itemKey:'zalo_messages', sourceKey: \`zalo_message:${zaloMessageId}\`, ...})`.

Vì vậy `persistSource` cho Zalo **là một UPDATE, không phải INSERT** — khác hẳn email. Thiết kế đề xuất:

1. Reserve **trước** `createZaloMessageTrackingRecord` (tức trước dòng 4680, bên trong
   `runWithZaloAccountMutex` sau `assertSendQuotaOrYield`/`enforceZaloOutboundPolicyBeforeSend` ở dòng
   4638-4644) — để `reservation.id` có sẵn khi insert placeholder, gắn ngay `quota_reservation_id` vào
   `insertCampaignZaloMessage(..., quotaReservationId: reservation.id)` thay vì để `null`. Nếu process
   crash giữa insert-placeholder và gọi provider, row `zalo_messages` đã có `quota_reservation_id` để
   reconciler đối chiếu.
2. `markSendQuotaSending()` ngay trước lời gọi `sendPersonalMessageQueued`/`sendFriendRequestQueued`/`sendGroupMessageQueued`
   (dòng 4722 / 6049 / 6161) — đây chính là điểm enqueue BullMQ; **lease phải đủ dài hơn thời gian job
   có thể nằm chờ trong queue + inter-message delay** (nhắc lại: production đang chạy delay 80-150s/tin
   Zalo — xem CLAUDE.md phần "Operational Parameters"), nếu không sweeper sẽ mark `uncertain` một
   reservation còn đang chờ tới lượt trong hàng đợi chứ chưa hề gọi provider. `SEND_QUOTA_SENDING_UNCERTAIN_SECONDS`
   mặc định plan gốc là 300s (mục 9) — **phải tăng riêng cho Zalo campaign** hoặc dời điểm
   `markSendQuotaSending` xuống sau khi `enqueueAndWait` đã thực sự vào tay worker (nếu
   `outboundMessageQueueService` có hook "job started" thì dùng, chưa xác nhận có hay không — GIẢ ĐỊNH,
   Cursor kiểm `outboundMessageQueue.service.js` trước khi chọn phương án). Đây là điểm khác biệt lớn
   nhất so với email/direct-send (không phải trong `send*ByQueue` — nơi có `checkSendQuota` backstop —
   vì payload job đi qua Redis, không mang được `reservationId` một cách an toàn nếu reserve trước khi
   enqueue... thực ra mang được, `reservationId` chỉ là số nguyên, không phải PII, an toàn để nhét vào
   payload). **Quyết định đơn giản nhất**: reserve + `markSendQuotaSending` cùng lúc, ngay trước
   `enqueueAndWait`, và set lease `expires_at` theo tổng ước lượng "thời gian chờ hàng đợi + gửi" chứ
   không dùng default — cần đo baseline queue depth thực tế trước khi chốt số (không đoán ở đây).
3. Sau `enqueueAndWait` trả về, worker (`send*ByQueue`) **bỏ hẳn** `checkSendQuota` backstop
   (dòng 1878/2046/2189) — vì đã reserve trước khi enqueue rồi, backstop check cũ giờ redundant và
   dùng advisory cache không còn ý nghĩa.
4. Kết quả `sendResult`:
   - `isZaloPartialDeliveryResult(sendResult)` (đã có sẵn util từ PR-Q3,
     `backend/src/utils/zaloDispatchDelivery.util.js`, đã dùng trong `campaignRun.service.js:4747`) → `markSendQuotaUncertain`;
   - thành công bình thường (`markZaloOutboundSuccess` nhánh, dòng 4754-4763) → `consumeSendQuota({..., persistSource: (client) => { await mergeZaloMessageTrackingMetadata(zaloMessageId, {status:'sent',...}, client); await maybeDebitWalletForSend(client, {billingUserId, itemKey:'zalo_messages', sourceKey: \`quota_reservation:${reservation.id}\`, ...}); }})` — **đổi `sourceKey` từ `zalo_message:<id>` sang `quota_reservation:<id>`** để nhất quán với mục 6 bước 5 plan gốc, và **xoá lời gọi `maybeDebitWalletForSend` cũ trong `updateZaloMessageTrackingMeta`** (dòng 2488-2494) cho luồng đã migrate — tránh debit hai lần với hai key khác nhau, y hệt bẫy đã nêu ở Q4a;
   - lỗi Zalo throw ra từ `sendPersonalMessageQueued` (catch tại dòng 4730-4738, phân loại qua `annotateZaloSendError`/`classifyZaloSendError` có sẵn ở `zaloSendErrorClassifier.util.js`) → map theo bảng mục 8: rate-limit/quota lỗi xác định trước gửi → `release`; timeout/network không rõ → `uncertain` (đã có cờ `classified.isTimeout` dùng ở PR-Q3 cho quick-send/preview, tái dùng y hệt).
5. `findExistingSentCampaignZaloMessage()` (`zaloMessage.repository.js:16-56`, gọi qua
   `trySyncLedgerFromExistingZaloMessage` tại `campaignRun.service.js:1864-1887`) là cơ chế dedupe
   **resume sau crash** hiện có — **giữ nguyên, không xoá**. Nó giải quyết vấn đề khác (ledger
   `campaign_run_recipient_steps` không khớp `zalo_messages` sau crash), còn reservation giải quyết
   "không charge quota hai lần". Cả hai cùng tồn tại, không thay thế nhau.

**`sourceType: 'campaign_zalo'`** cho cả 3 kênh (khớp ví dụ allowlist ở mục 9 plan gốc:
`campaign_email,campaign_zalo` — không tách `campaign_zalo_personal/group/friend_request` trừ khi
sau này cần allowlist riêng từng kênh); phân biệt kênh qua `sourceRef.channel` (`zalo_personal` /
`zalo_group` / `zalo_friend_request`, đúng giá trị cột `channel` hiện có trong `zalo_messages`).

**`logicalStep`:**
- cá nhân/nhóm: `stepMeta?.stepIndex || 1` (đã dùng sẵn ở dòng 4691/dòng tương ứng phần nhóm — xác nhận
  `stepMeta?.stepIndex ?? null` xuất hiện trong đoạn code nhóm quanh dòng 6617);
- kết bạn: luôn `1` — xác nhận tại dòng quanh 6049 không có khái niệm `stepMeta`/multi-step, tracking
  metadata hardcode `stepIndex: 1`.

**Test bắt buộc PR-Q4b:** áp lại đúng 7 test mục "Test bắt buộc" gốc (hai worker cùng recipient, retry
sau success không debit lại, rate-limit trước acceptance release+retry được, quiet-hour defer không giữ
reservation treo, crash trước/sau provider) cho **cả 3 kênh** — viết bằng fixture Zalo fake session
giống pattern đã sửa ở `synchronousSendQuota.test.js` (PR-Q3, phần Unified Inbox) để tránh lặp lại đúng
lỗi false-positive đã gặp ở đó (test không cấu hình fake session, provider không thực sự được gọi mà
test vẫn xanh).

**Gate Q4b:** targeted `campaignZaloSender` + `campaignRun` Zalo suites xanh; 1 integration test/kênh
xác nhận reservation lifecycle đúng; lease `SEND_QUOTA_SENDING_UNCERTAIN_SECONDS` cho Zalo đã đo bằng
số liệu queue depth thật trên staging, không dùng default 300s mà không kiểm.

---

#### PR-Q4c — BullMQ stalled-job hardening + reconciliation hook + test matrix còn lại

Đối soát `backend/src/services/queue/outboundMessageQueue.service.js:256-271` (khởi tạo `new Worker`)
cho thấy **không override** `lockDuration`/`stalledInterval`/`maxStalledCount` — dùng default BullMQ
(`lockDuration=30000ms`, `maxStalledCount=1`). Cả 4 job type campaign (`EMAIL_SEND`, `ZALO_PERSONAL_SEND`,
`ZALO_GROUP_SEND`, `ZALO_FRIEND_REQUEST_SEND`, đăng ký tại
`backend/src/services/queue/outboundMessageProcessorRegistry.js:22-47`) đều gọi `enqueueAndWait` với
`jobOptions: { attempts: 1 }` — nghĩa là **BullMQ's `attempts` retry không áp dụng cho các job này**;
nguồn retry duy nhất hiện tại là tầng application (`campaign_run_recipient_steps.meta.nextDueAt` +
`retryCount`, xem `recipientLedger.repository.js`). Nhưng **stalled-job recovery vẫn hoạt động độc lập
với `attempts`**: nếu worker crash giữa lúc xử lý job (ví dụ sau khi provider đã accept, trước khi
`enqueueAndWait` trả kết quả về caller), BullMQ mặc định sẽ coi job "stalled" sau 30s và giao lại đúng
job đó cho một worker khác **tối đa 1 lần** (`maxStalledCount=1`) — tức là handler
(`sendEmailToCustomerDirect`/`sendPersonalMessageByQueue`/...) có thể chạy lại với **cùng payload**
dù `attempts:1`. Đây chính là kịch bản "job retry sau success/response loss" trong test bắt buộc gốc —
xác nhận nó là rủi ro thật, không phải giả định, và lý do idempotency key theo Q4a/Q4b (không phụ
thuộc BullMQ attempt count) là cơ chế phòng vệ đúng chỗ.

- [ ] Viết test giả lập: gọi trực tiếp handler 2 lần với cùng `reservationKey` (mô phỏng stalled-job
      redelivery) → xác nhận provider chỉ được gọi 1 lần nếu lần đầu đã `consumed`, hoặc job thứ hai
      nhận `409 SEND_ALREADY_IN_PROGRESS` nếu lần đầu còn `sending`.
- [ ] Reconciliation hook: khi resume một run bị dừng giữa chừng, ngoài
      `trySyncLedgerFromExistingZaloMessage` hiện có, thêm bước quét reservation `uncertain`/`reserved`
      quá hạn thuộc `sourceType IN ('campaign_email','campaign_zalo')` gắn với `runId` đang resume —
      không tự động release/consume, chỉ log + để sweeper chung (PR-Q5) xử lý, tránh xây riêng một
      reconciler cho campaign.
- [ ] Chạy đủ 7 test bắt buộc còn lại trong danh sách gốc (mục "Test bắt buộc") cho toàn bộ 4 job type,
      gồm cả kịch bản "campaign owner/employee context vẫn tính đúng billing owner" — campaign vẫn
      **không truyền `roleCode`** khi gọi `reserveSendQuota` (giữ đúng quy tắc mục 3.2: "Campaign hiện
      chủ ý không truyền role để quota owner luôn được áp dụng"), xác nhận không có regress admin-bypass
      lọt vào luồng campaign.
- [ ] `npm run test:integration` full suite (không chỉ file mới) xanh — Q4a/Q4b có thể đã sửa
      `campaignEmailSenderRepository`/`zaloMessageRepository` theo cách ảnh hưởng test cũ.

**Gate Q4c:** toàn bộ test bắt buộc gốc của PR-Q4 (7 dòng mục "Test bắt buộc") pass cho cả email và 3
kênh Zalo; `npm run test:integration` full xanh; staging chạy một campaign concurrency đại diện (song
song ≥ 2 recipient cùng workspace, ≥ 1 recipient chạm limit) và reconciliation sạch — như Gate gốc.

---

**Bẫy cần tránh (tổng hợp cả 3 sub-PR):**

1. Double debit ví do giữ nguyên `debitWallet:true`/`maybeDebitWalletForSend(...,sourceKey:'zalo_message:<id>')`
   cũ song song với `consumeSendQuota`'s tự debit qua `quota_reservation:<id>` — xoá đường cũ ngay khi
   migrate từng nhánh, không để cả hai cùng chạy "cho chắc".
2. Copy nguyên pattern Email (insert-sau-khi-gửi) sang Zalo — Zalo là update-sau-khi-gửi, persistSource
   phải là UPDATE không phải INSERT, xem mục PR-Q4b.
3. Đặt `markSendQuotaSending`/lease timeout cho Zalo bằng default 300s mà không tính thời gian chờ
   hàng đợi BullMQ + inter-message delay thật (80-150s/tin trên production) — sweeper sẽ đánh
   `uncertain` hàng loạt reservation còn đang chờ tới lượt, gây báo động giả và có thể chặn nhầm gửi.
4. Coi mọi lỗi SMTP không phân loại được là "thất bại chắc chắn" như code cũ đang làm — theo policy
   mới đây phải là `uncertain`, đổi hành vi thật, cần ghi rõ trong PR description để reviewer không
   tưởng nhầm là giữ nguyên logic.
5. Xoá `findExistingSentCampaignZaloMessage`/ledger dedupe hiện có vì tưởng reservation đã thay thế —
   hai cơ chế giải quyết hai vấn đề khác nhau (ledger đồng bộ tiến trình gửi, reservation chặn charge
   quota trùng), phải giữ cả hai.

### PR-Q5 — Reconciler, observability, enforce toàn bộ và cleanup

- [ ] Tạo scheduled reconciliation worker/job với leader-safe locking và `SKIP LOCKED`.
- [ ] Expose metrics trong system overview/metrics stack.
- [ ] Alert uncertain/reserved age, lock wait, decision mismatch, wallet/source mismatch.
- [ ] Reconciliation report so sánh ledger, linked source rows và top-up debits.
- [ ] Bật enforce theo source qua rollout gate, không bật một lần toàn hệ thống.
- [ ] Sau thời gian ổn định, deprecate/xoá `recordDirectSendUsage()` ở các path đã migrate.
- [ ] Đổi tên/comment `quotaCache` thành advisory read cache; không quảng bá nó là enforcement.
- [ ] Xoá fallback enforcement cũ chỉ khi `rg` và tests chứng minh toàn bộ production paths đã migrate.
- [ ] Cập nhật `CLAUDE.md`, `docs/CACHE_INVENTORY.md`, walkthrough và runbook sự cố quota.

**Gate:** 7 ngày production không over-quota unexplained, không double debit, không uncertain quá SLO;
rollback drill thành công.

---

## 11. Test matrix hoàn chỉnh

### Unit

- policy precedence và message/resetAt contract;
- key canonical + hashing;
- state machine/invalid transitions;
- provider error classification;
- wallet allocation: within plan, partly plan/partly wallet, all wallet, insufficient wallet;
- admin bypass và employee context;
- feature mode off/shadow/enforce.

### Integration PostgreSQL

- migration/bootstrap parity;
- concurrency thật bằng nhiều pool client, không mock lock;
- idempotent reserve/consume/debit;
- legacy + ledger dual count không duplicate;
- transaction rollback và unique constraint races;
- day/cycle boundaries;
- reconciler `SKIP LOCKED` và nhiều runner;
- retention query/index plan trên volume đại diện.

### Service/provider

- provider success -> source linked + consumed + optional debit;
- SMTP hard bounce sau provider attempt -> source bounced + consumed + optional debit;
- pre-known hard bounce skip trước provider -> không consume;
- definitive no-send -> released, không source success/debit;
- ambiguous -> uncertain, retry blocked;
- response lost sau consume -> same key trả idempotent result;
- missing client idempotency key vẫn backward compatible và có metric.

### Regression commands

```bash
cd backend
npm run check:migration-safety
npm run test:unit
npm run test:integration
npm run lint

cd ../frontend
npm run test
npm run lint
npm run build

cd ..
git diff --check
```

Nếu integration cần DB/Redis/env không có, không được ghi “PASS”; báo rõ suite nào chưa chạy và gate
chưa đóng.

---

## 12. Observability và runbook

Metrics tối thiểu, label cardinality thấp:

- `send_quota_reserve_total{channel,source,outcome,mode}`;
- `send_quota_reserve_duration_ms`;
- `send_quota_lock_wait_ms`;
- `send_quota_state_total{status,channel,source}`;
- `send_quota_decision_mismatch_total{reason}`;
- `send_quota_idempotent_replay_total{state}`;
- `send_quota_uncertain_age_seconds`;
- `send_quota_wallet_hold_total{item}`;
- `send_quota_reconciliation_mismatch_total{kind}`;
- `send_quota_provider_outcome_total{provider,class}`.

Không dùng `billing_user_id`, reservation key, recipient hoặc campaign ID làm metric label. Structured
log có thể dùng ID nội bộ/hash prefix theo policy log hiện tại, không log email/phone/content/token.

Alert gợi ý ban đầu, phải tune theo baseline:

- có reservation `uncertain` quá 5 phút;
- `reserved` hết lease nhưng không được sweep;
- source/debit mismatch > 0;
- decision mismatch shadow > 0 không giải thích;
- p95 lock wait/reserve latency tăng đột biến;
- `SEND_QUOTA_UNAVAILABLE` vượt error budget.

Runbook phải có:

1. Cách chuyển một source `enforce -> shadow/off` mà không restart nếu config platform hỗ trợ; nếu
   không, ghi rõ redeploy procedure.
2. Query xem reservation theo ID/hash, không theo raw recipient.
3. Cách phân loại/resolution `uncertain`; thao tác manual phải audit và idempotent.
4. Cách đối soát top-up debit `quota_reservation:<id>`.
5. Quy tắc tuyệt đối: không bulk release `sending/uncertain` chỉ để giảm queue.

---

## 13. Rollback

Schema là additive nên rollback ứng dụng không drop table/column.

### Trước khi source bật enforce

- Chuyển mode `off`; code cũ tiếp tục.
- Reservation shadow không ảnh hưởng count/wallet.

### Sau khi một source đã bật enforce

- Ưu tiên chuyển riêng source đó về `shadow`, không tắt source khác đang ổn định.
- Không để request vừa đi qua ledger vừa ghi legacy row không có reservation link, vì sẽ double count.
- Trước rollback binary, chạy reconciliation để không còn `reserved/sending` treo của version mới.
- `consumed` ledger vẫn phải được dual-count sau rollback cho tới hết cửa sổ billing; vì vậy phiên bản
  rollback phải hiểu ledger hoặc deploy một compatibility view/query trước khi bật enforce lần đầu.

Điểm cuối là release gate bắt buộc: không bật enforce production nếu artifact rollback không biết đếm
reservation đã consumed.

---

## 14. Definition of Done Wave 2

Wave 2 chỉ được coi hoàn tất khi:

- [ ] Tất cả call site production trong inventory dùng reservation ở final send boundary.
- [ ] `checkSendQuota()` không còn là enforcement duy nhất trước bất kỳ provider call nào.
- [ ] Concurrency test chứng minh không vượt employee/workspace/channel/combined/wallet limits.
- [ ] Một logical retry không tạo thêm reservation, provider call hoặc wallet debit sau consumed.
- [ ] Ambiguous provider result vào `uncertain`, không auto-release/resend.
- [ ] Hard bounce sau provider attempt là `consumed`; pre-known hard-bounced recipient bị skip không
      consume.
- [ ] Legacy rows + ledger không bị double count.
- [ ] Migration/bootstrap/safety gates xanh.
- [ ] Unit, integration, lint và build liên quan xanh.
- [ ] Metrics/dashboard/alerts/runbook hoạt động trên staging và production.
- [ ] Rollback compatibility đã diễn tập.
- [ ] Có số liệu ít nhất 7 ngày production hoặc volume đại diện, không over-quota/double-debit
      unexplained.

---

## 15. Kết quả ứng dụng nhận được

Sau Wave 2, UKNOW có thể:

- chặn chính xác burst gửi đồng thời thay vì chỉ giảm race bằng cache 1 giây;
- scale nhiều worker Email/Zalo mà quota vẫn nhất quán theo workspace/employee;
- giữ chỗ và trừ top-up wallet đúng một lần;
- retry job/request an toàn hơn nhờ logical idempotency key;
- không gửi lại mù khi provider timeout và không biết kết quả;
- audit được một send đã reserve, đang gửi, consumed, released hay uncertain;
- tách rõ ba khái niệm: read cache để nhanh, rate limit để điều tiết, PostgreSQL ledger để đảm bảo
  correctness/billing.

Đây là nền tảng correctness để scale campaign; nó không thay thế Wave Redis L2 read-cache và cũng
không tự động giải quyết toàn bộ campaign runtime state đang nằm trong RAM.
