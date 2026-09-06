# BÁO CÁO NGHIỆM THU — PR-Q4c: CAMPAIGN QUOTA ATOMIC (WAVE 2)

**Độ khó:** Phức tạp · **Thời gian cập nhật:** 05/09/2026<br/>
**Phạm vi:** Wave 2 — Campaign Reservation & Recipient Ledger Hardening (PR-Q4c).<br/>
**Trạng thái kiểm thử của lượt cập nhật 06/09:** backend unit **265 suite / 2.335 test PASS**; integration `recipientLedger.outOfOrder` **5/5 PASS** trên PostgreSQL local; gate ops container **39/39 PASS** trên image test tạm. Full integration suite của toàn repo chưa được chạy lại trên bridge release digest.

---

## 1. Bối cảnh & Các Quyết định Kiến trúc Cốt lõi

### 1.1. Chuyển đổi sang Full Unique Index & Tương thích Hai Chiều (Bi-directional Compatibility)
- **Vấn đề lịch sử:** Trước PR-Q4c, bảng `campaign_run_recipient_steps` tồn tại các dòng duplicate do thiếu ràng buộc duy nhất trên production, trong khi câu lệnh tại [recipientLedger.repository.js](../backend/src/repositories/campaign/recipientLedger.repository.js) sử dụng `ON CONFLICT (id_run, id_node, channel, recipient_key)` không có predicate `WHERE`. Việc tạo partial unique index với `WHERE ...` ở các round đầu khiến các truy vấn không có predicate bị PostgreSQL từ chối với mã lỗi `42P10` (*there is no unique or exclusion constraint matching the ON CONFLICT specification*).
- **Giải pháp dứt điểm:**
  - [182_ensure_crrs_unique_progress_index.sql](../backend/migrations/182_ensure_crrs_unique_progress_index.sql) thực hiện Authoritative Preflight Deduplication để snapshot các duplicate rows vào `campaign_run_recipient_steps_backup_182`, sau đó tạo **Full Unique Index** (không predicate `WHERE`):
    ```sql
    CREATE UNIQUE INDEX uq_crrs_progress
      ON campaign_run_recipient_steps(id_run, id_node, channel, recipient_key);
    ```
  - Đồng bộ định nghĩa Full Unique Index trong [bootstrap.sql](../backend/tests/integration/sql/bootstrap.sql).
  - Cập nhật [recipientLedger.repository.js](../backend/src/repositories/campaign/recipientLedger.repository.js) dùng `ON CONFLICT (id_run, id_node, channel, recipient_key)` (không predicate).
  - **Kết quả:** Cả ứng dụng tại revision trước Q4c lẫn revision hiện tại sau Q4c đều khớp 100% với unique index `uq_crrs_progress`, loại bỏ hoàn toàn lỗi `42P10`.

### 1.2. Quy trình Rollback Phân tầng (Two-Tier Rollback SOP)
Tuân thủ Mục 13 của Plan (*"Schema là additive nên rollback ứng dụng không drop table/column"*):

     > [!CAUTION]
     > **Rollback artifact hiện chưa được chốt.** Không dùng tag
     > `release-2026-09-02-ledger-safe` (`646f9544…`) để deploy hay rollback. Dù tag đó
     > có migration/index và terminal-state hardening, nó **thiếu** guard cập nhật cache
     > recipient theo state authoritative trả về từ PostgreSQL. Vì vậy nó không còn là
     > artifact self-contained sau hardening Round 10.
     >
     > Trước rollout phải tạo một bridge commit sạch, chứa đồng thời migration 182,
     > `recipientLedger.repository`, `campaignRun.service`, readiness startup và ops
     > hot-swap hiện hành; sau đó build CI, ghi lại **registry digest**, chạy gate artifact
     > trên chính digest đó, rồi mới gắn tag release mới. Không rollback về commit/tag cũ
     > tùy ý, vì các revision cũ có thể cho stale write ghi đè metadata (out-of-order/hybrid
     > state).
     >
     > **Đặc tả Chiến lược Triển khai & Hoàn nguyên Production:**
     > - **Nguyên lý Git Topology & CI Build:** Không suy ra artifact production từ SHA local hay Git tag. Workflow [deploy-backend.yml](../.github/workflows/deploy-backend.yml) phải build revision đã được push; runbook chỉ dùng registry digest CI ghi nhận.
     > - **Quy trình Triển khai 2 Giai đoạn Chuẩn (Recommended 2-Stage Rollout):**
     >   1. **Giai đoạn 1 (Deploy Bridge trước):** Tạo và review bridge commit sạch theo điều kiện ở cảnh báo trên, push lên `main`, để CI/CD build/deploy độc lập. Giai đoạn này áp dụng Migration 182, full unique index `uq_crrs_progress`, recipientLedger hardening và readiness/hot-swap hiện hành mà chưa bật engine atomic quota mới. Sau khi CI hoàn tất, ghi registry digest thực tế vào runbook trước khi cho phép rollback.
     >   2. **Giai đoạn 2 (Deploy Atomic Quota):** Sau khi Giai đoạn 1 vận hành ổn định, commit và deploy phần còn lại của PR-Q4c lên `main`.
     > - **Quy trình Hoàn nguyên (Standard CI/CD Rollback via Revert):**
     >   Khi cần rollback PR-Q4c, chỉ cần tạo **revert commit** cho riêng commit PR-Q4c trên nhánh `main`:
     >   ```bash
     >   git revert <commit_q4c_sha>
     >   git push origin main
     >   ```
     >   Khi bridge đã được tạo và rollout theo Giai đoạn 1, revert commit sẽ hoàn nguyên logic quota mới nhưng **GIỮ NGUYÊN** Migration 182 và recipientLedger hardening. Bước `node scripts/migrate.js` trên CI/CD phải báo 0 pending, 0 missing trước khi mở traffic.
     > - **Đường Hoàn nguyên Khẩn cấp trên VPS (Emergency Production Hot-Swap & Auto-Recovery):**
     >   Để tránh rủi ro copy lệnh rút gọn thiếu cờ cấu hình production hoặc gây sập hệ thống khi container mới lỗi, sử dụng script ops chuẩn hóa [backend/scripts/ops/hot_swap_rollback.sh](../backend/scripts/ops/hot_swap_rollback.sh):
     >   ```bash
     >   bash backend/scripts/ops/hot_swap_rollback.sh <IMAGE_OR_DIGEST>
     >   ```
     >   *Bắt buộc truyền registry digest content-addressed do CI ghi nhận,* ví dụ: `founderai/uknow-backend@sha256:<digest>`. Không dùng commit-SHA tag cho production rollback vì tag registry không phải định danh bytes bất biến.
     >   Script tái hiện 100% cấu hình từ `deploy-backend.yml` và bổ sung các cơ chế bảo vệ tối đa:
     >   - **Preflights nghiêm ngặt:** Kiểm tra bắt buộc tham số image, sự tồn tại của `.env`, script SSL, docker network `uknow_network`, và từ chối mọi tag production kể cả SHA tag; chỉ chấp nhận `@sha256` digest.
     >   - **Metadata revision inspection:** Kiểm tra đồng thời OCI revision label và `BUILD_SHA`; cả hai phải là SHA-40 hợp lệ và trùng nhau.
     >   - **Process protection trap & Auto-recovery:** Cài đặt các signal handler riêng biệt: `on_mutation_err` (giữ exit code), `on_mutation_int` (exit 130), `on_mutation_term` (exit 143), `on_mutation_hup` (exit 129), và `on_mutation_exit` bảo vệ toàn bộ giai đoạn mutation. Nếu có bất kỳ lỗi nào xảy ra hoặc readiness `/api/health` không xanh sau các lần thử, script tự động dọn container mới hỏng, khôi phục container standby ban đầu, cập nhật restart policy và **thăm dò `/api/health` để xác thực container cũ đã phục hồi hoạt động bình thường** (nếu không đạt sẽ trả mã lỗi 1) trước khi kết luận.
     >   - **Đặc tính thời gian Downtime:** Script dừng container cũ trước khi start container mới nhằm giải phóng port và tài nguyên; thời gian downtime tương ứng với thời gian container mới khởi động và vượt qua healthcheck (thường từ 2-5 giây).
     >   - **Kiểm chứng thực tế:** Gate ops hiện đạt **39/39 PASS** trên image test tạm. Gate này kiểm tra digest policy, stale-standby preservation, readiness stability window và attestation `src/`/`scripts/`/bootstrap SQL/package manifests. Đây **không** thay thế gate trên registry digest của bridge release; phải chạy lại gate với CI artifact đã chứng thực trước production. Suite yêu cầu `docker`, `psql`, `node`, `git` và một trong `nc`/`lsof`; mọi quyền DB cho image chỉ được cấp sau khi attestation artifact hoàn tất.
     > - **TUYỆT ĐỐI KHÔNG CAN THIỆP DATABASE, KHÔNG DROP INDEX VÀ KHÔNG PHỤC HỒI DUPLICATE.**
     > - Ứng dụng chạy an toàn trên nền index `uq_crrs_progress`, không phát sinh lỗi 42P10 và dữ liệu không bị nhân đôi.
     > - Khởi động lại workers và mở lại traffic.

2. **Pha Hoàn nguyên Khẩn cấp Database (Disaster Recovery DB Rollback - PSQL CLI Only):**
   - Chỉ áp dụng khi có sự cố nghiêm trọng phát sinh trong chính quá trình deduplicate của migration 182 tại cửa sổ bảo trì (chưa có traffic ghi live của worker).
   - Thực thi file script độc lập [rollback_182_crrs.sql](../backend/scripts/sql/rollback_182_crrs.sql) qua `psql`:
     ```bash
     psql -h <host> -p <port> -U <user> -d <dbname> \
       -v target_batch_id=<target_batch_id> \
       -f backend/scripts/sql/rollback_182_crrs.sql
     ```
     *(Lưu ý: Không bọc target_batch_id trong dấu nháy; psql tự động quote biến khi gọi `:'target_batch_id'`).*

3. **Pha Forward Recovery Bắt buộc sau Disaster DB Rollback:**
   > [!WARNING]
   > **Cảnh báo trạng thái Database sau Disaster Rollback:** Khi script `rollback_182_crrs.sql` chạy xong, index `uq_crrs_progress` bị drop và duplicate rows được phục hồi. Tại thời điểm này, cả phiên bản cũ và mới đều KHÔNG THỂ GHI TIẾN ĐỘ do thiếu unique arbiter index (sẽ gặp lỗi 42P10).
   > **Quy trình bắt buộc trước khi mở lại traffic:**
   > 1. Tiếp tục đóng chặt traffic và dừng workers.
   > 2. Triển khai migration sửa lỗi (ví dụ migration 183 tái lập unique arbiter sau khi xử lý nguyên nhân gốc) hoặc deploy binary chuyên dụng không phụ thuộc `ON CONFLICT`.
   > 3. Tuyệt đối không rerun nguyên văn migration 182 nếu chính migration 182 là nguyên nhân sự cố.
   > 4. Tái lập unique arbiter và chạy `npm run check:schema` xác nhận sạch trước khi mở lại traffic.

### 1.3. Mutated Survivor Guard theo Logical Key Toàn diện
Script rollback [rollback_182_crrs.sql](../backend/scripts/sql/rollback_182_crrs.sql) bảo vệ dữ liệu live theo từng nhóm `(id_run, id_node, channel, recipient_key)`:
- `missing_survivors` (`live_count = 0` do survivor bị xóa có chủ đích) -> **ABORT!**
- `multiple_survivors` (`live_count > 1` do trùng lặp mới phát sinh) -> **ABORT!**
- `replacement_survivors` (survivor có ID mới không thuộc tập `source_id` của batch) -> **ABORT!**
- `mutated_survivors` (`crrs.updated_at > b_keys.max_backed_up_at`) -> **ABORT!**
Bất kỳ vi phạm nào đều kích hoạt `RAISE EXCEPTION`, rollback transaction và chuyển sang quy trình Forensic Reconciliation độc lập qua bảng đối chiếu `campaign_run_recipient_steps_forensic_<batch>`.

### 1.4. Sequence Rewind Prevention
Lệnh reset sequence sử dụng hàm `GREATEST` chống tua lùi sequence dưới mức ID đã cấp phát:
```sql
PERFORM setval(
  pg_get_serial_sequence('campaign_run_recipient_steps', 'id'),
  GREATEST(
    (SELECT last_value FROM campaign_run_recipient_steps_id_seq),
    COALESCE((SELECT MAX(id) FROM campaign_run_recipient_steps), 1)
  )
);
```

---

## 2. Kết Quả Kiểm Thử & Đo Lường Thực Tế

- **Môi trường thực thi:** PostgreSQL trên `localhost:5433` (Docker container), database: `uknow_campaign_test`.
- **Node.js Environment:** v20.19.6

| Bộ kiểm thử / Tiêu chí | Mẫu số đo lường | Kết quả đo thực tế | Đánh giá |
|---|---|---|---|
| `npm run check:migration-safety` | 1 file migration trong diff ([182](../backend/migrations/182_ensure_crrs_unique_progress_index.sql)) | Tuân thủ 100% Immutability & DDL guards | **PASS (code 0)** |
| `npm run check:bootstrap-columns` | 238 cột do migration thêm bằng ALTER TABLE | 0 cột thiếu | **PASS (code 0)** |
| `check:schema` (bỏ qua `.env` Neon) | Toàn bộ core schema trên DB test `localhost:5433` | Drift table: (empty) | **PASS (code 0)** |
| Unit test configs & repos | `sendQuota.config.spec.js`, `campaignCrud.repository.spec.js` | **9 / 9 passed (100%)** | **PASS (code 0)** |
| `tests/integration/crrsUniqueProgressMigration.test.js` | 15 tests (Full unique index, bi-directional compatibility, **4 tests psql CLI subprocess: success, non-existent batch, malformed UUID, and real lock contention abort with 40s timeout**; logical key guard: mutated/missing/replacement/invalid-batch) | **15 / 15 passed (100%)** | **PASS (code 0)** |
| `tests/integration/recipientLedger.outOfOrder.test.js` | 5 tests (Out-of-order & terminal completed invariant) | **5 / 5 passed (100%)** | **PASS (code 0)** |
| `tests/integration/schemaInventory.test.js` | 5 tests (Chiều 0 counter check 121 tables, 1635 cols & Chiều 1-4 2-way parity) | **5 / 5 passed (100%)** | **PASS (code 0)** |
| `tests/integration/campaignQuotaMatrix.test.js` | 27 tests (4 job types, resume reconciliation hook, employee context, replay snapshot) | **27 / 27 passed (100%)** | **PASS (code 0)** |
| `git diff --check` & `--cached --check` | Toàn bộ staged & unstaged diff | 0 trailing whitespace, 0 merge marker | **PASS (code 0)** |
| **Kiểm thử lịch sử trên clean checkout `release-2026-09-02-ledger-safe`** | `crrsUniqueProgressMigration.test.js` (15/15), `recipientLedger.outOfOrder.test.js` (5/5), `schemaInventory.test.js` (5/5), `checkMigrationSafety` (PASS), `checkBootstrapColumns` (238/238) | **25 / 25 passed (100%)** | **Không phải approval deploy** — tag thiếu hardening cache hiện hành |
| **Thực nghiệm Migration Runner Gate (lịch sử bridge)** | DB chứa row migration 182 (hash snapshot tại thời điểm đó: `a7d5ac33d49cf5431e260c2667b6524f87b2539c9585e503c5d1d0fb892fdf72` — chỉ là giá trị lịch sử của một commit cũ, KHÔNG phải hằng số gate; migration 182 đã đổi comment sau đó nên hash thật đã khác): `node scripts/migrate.js --check` & `node scripts/migrate.js` | **0 pending, 0 missing, 0 mismatches (code 0)** | **PASS (code 0)** |
| **Thực nghiệm Smoke Test Health (lịch sử bridge)** | Khởi chạy server `node src/index.js` từ worktree độc lập của commit bridge | `GET /api/health` -> HTTP 200 `{"status":"ok",...}` | **Không bao phủ readiness sau worker startup** |
| **Kiểm thử Ops Hot-Swap Rollback & Auto-Recovery (`test_hot_swap_rollback.sh`)** | 9 test groups gồm production digest policy, local SHA fail-closed, stale-standby preservation, readiness stability window và runtime source attestation | **39 / 39 passed (100%)** trên image test tạm | **PASS (code 0)** — phải chạy lại với registry digest của bridge release. Suite 6 (real Docker artifact) nay bắt buộc tham số thứ 3 `TRUSTED_GIT_REF` (hoặc `UKNOW_TRUSTED_GIT_REF`) trỏ đúng bridge commit/tag sắp release; `EXPECTED_182_HASH` không còn hardcode, được tính trực tiếp từ trusted manifest của chính ref đó |

- **Kết quả trực tiếp của lượt cập nhật 06/09:** **2.335 backend unit tests**, **5 integration tests ledger**, và **39 assertions ops container** đều PASS. Image local không khớp source bị gate chặn và không được tính thay cho artifact CI/registry.
- **Giới hạn đo lường:** `npm run test:integration` full suite chưa được chạy lại trong lượt này; bridge release mới chưa được tạo, CI build, hay chạy gate với registry digest.

---

## 3. Trạng Thái Repository & Kế Hoạch Tiếp Theo

1. **Working Tree:** Sẵn sàng cho đối soát độc lập.
2. **Affiliate WIP ([scheduler.js](../backend/src/utils/scheduler.js)):** Tiếp tục giữ nguyên trạng thái unstaged, không đụng chạm.
3. **Kế hoạch [PLAN_QUOTA_ATOMIC_WAVE2_2026-09-01.md](PLAN_QUOTA_ATOMIC_WAVE2_2026-09-01.md):**
   - Dòng 1013 (7 test bắt buộc mở rộng gồm crash-injection / quiet-hours): tiếp tục để mở `- [ ]`.
   - Dòng 1018 (Full integration suite toàn repo): tiếp tục để mở `- [ ]`.
   - Dòng 1027: Duy trì task hạ giải `TASK-DECOMMISSION-CRRS-BACKUP-182` (deadline 30 ngày sau deploy prod).
