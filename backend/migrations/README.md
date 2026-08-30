# Quy ước Database Schema Migrations (UKNOW Campaign)

Tài liệu này quy định tiêu chuẩn viết và triển khai migration cho database PostgreSQL trong dự án UKNOW.

---

## 1. Nguyên tắc cốt lõi: Tính bất biến (Append-only)

1. **Không sửa / không xóa / không đổi tên** bất kỳ file migration nào đã được release hoặc merge vào `main`.
2. Khi cần bổ sung hoặc sửa đổi schema, **luôn tạo một file migration mới** với số prefix kế tiếp.
3. Số prefix: Sử dụng định dạng `XXX_ten_migration.sql` (ví dụ: `191_create_user_profiles.sql`). Kiểm tra file có số thứ tự lớn nhất trong thư mục `backend/migrations/` để lấy số tiếp theo.

---

## 2. Quy trình tương thích ngược: Expand $\rightarrow$ Deploy $\rightarrow$ Contract

Trong quá trình deploy trên VPS, backend container phiên bản cũ vẫn đang nhận request và phục vụ người dùng trong lúc migration chạy. Do đó:

1. **Phase 1 — Expand (Mở rộng)**:
   - Thêm bảng mới hoặc thêm cột mới.
   - Cột mới **phải là `NULLABLE`** hoặc có giá trị `DEFAULT` an toàn.
   - Không được `SET NOT NULL` trực tiếp trên cột đang có dữ liệu mà không qua backfill an toàn.
2. **Phase 2 — Deploy & Backfill**:
   - Triển khai backend code mới hỗ trợ đọc/ghi trên cấu trúc mới (và vẫn tương thích dự phòng với cấu trúc cũ nếu cần).
   - Chạy script backfill dữ liệu nếu có.
3. **Phase 3 — Contract (Thu hẹp / Dọn dẹp)**:
   - Chỉ dọn dẹp (drop column/table cũ) ở một phiên bản release tiếp theo, sau khi toàn bộ traffic đã chuyển sang code mới ổn định.

---

## 3. Transaction & Transaction Block Rules

1. **Runner sở hữu Transaction**:
   - Migration runner (`backend/src/utils/migrationRunner.util.js`) tự động mở transaction (`BEGIN`) và `COMMIT` cho từng file migration (all-or-nothing per file).
   - **Không tự thêm `BEGIN;` và `COMMIT;` ngoài cùng** vào file migration mới.
2. **Không dùng `CREATE INDEX CONCURRENTLY`**:
   - PostgreSQL cấm chạy `CREATE INDEX CONCURRENTLY` bên trong transaction block (`BEGIN...COMMIT`).
   - Sử dụng `CREATE INDEX` thông thường (hoặc `CREATE INDEX IF NOT EXISTS`). Nếu bảng có dung lượng cực lớn cần index không lock, liên hệ lead vận hành để chạy lệnh ngoài transaction runner.

---

## 4. Hàng rào CI & Destructive DDL Guard

CI (`checkMigrationSafety.js`) sẽ tự động quét và chặn các hành vi sau:
- Chỉnh sửa (Modified), xóa (Deleted) hoặc đổi tên (Renamed) migration cũ.
- `DROP TABLE`, `DROP COLUMN`, `DROP TYPE`, `DROP CONSTRAINT`.
- `RENAME TABLE`, `RENAME COLUMN`.
- `SET NOT NULL` trực tiếp.
- `CREATE INDEX CONCURRENTLY`.
- `ALTER COLUMN TYPE` (nguy cơ rewrite bảng hoặc mất dữ liệu).

### Ngoại lệ có chủ đích (Annotation)
Nếu migration có chủ ý nghiệp vụ đặc biệt (ví dụ: dọn dẹp bảng tạm đã ngưng sử dụng, hoặc nới rộng độ dài VARCHAR an toàn) và đã được code review chấp thuận, hãy gắn annotation ở đầu file, ngay trước DDL cần miễn:
```sql
-- allow-destructive-ddl: Giải thích lý do vì sao thao tác này an toàn
```

Annotation chỉ có hiệu lực khi nằm trong comment trước câu lệnh SQL đầu tiên,
có lý do không rỗng, và chỉ miễn **một** DDL nguy hiểm nằm liền sau annotation
(chỉ được cách bởi khoảng trắng). Nó không phải cờ tắt toàn bộ guard: mọi DDL
nguy hiểm khác trong cùng file vẫn bị chặn. Annotation đặt sau code hoặc chỉ có
khoảng trắng sẽ không có hiệu lực.

---

## 5. Đồng bộ DB Test (`bootstrap.sql`)

Khi migration có thêm bảng mới (`CREATE TABLE`), thêm cột mới (`ADD COLUMN`) hoặc thêm extension (`CREATE EXTENSION`):
- **Bắt buộc mirror thay đổi tương ứng vào `backend/tests/integration/sql/bootstrap.sql`**.
- CI sẽ kiểm tra và chặn nếu có migration thêm schema mới mà quên cập nhật `bootstrap.sql`.

---

## 6. Lệnh kiểm tra an toàn cục bộ

```bash
cd backend
npm run check:migration-safety
```

## 7. Checksum lịch sử

`schema_migrations.checksum_sha256` lưu SHA-256 của đúng bytes file migration trên
đĩa (trước khi runner bóc `BEGIN`/`COMMIT`). Runner sẽ baseline một lần các row
legacy còn `NULL` dưới advisory lock; sau đó cả `run` và `--check` đều dừng nếu
file đã chạy bị sửa hoặc bị thiếu. Không tự ghi đè checksum đã có — cần xử lý
roll-forward/khôi phục lịch sử có review.

### Rollout checkpoint checksum

Khi đưa checksum vào một database legacy, release đó **không được kèm migration
nghiệp vụ mới**. Deploy riêng, xác nhận log baseline và chạy `migrate:check` lại
trước. Chỉ sau khi xác nhận thành công mới tạo/deploy release kế tiếp có migration
nghiệp vụ (ví dụ `174_repair_billing_cycle_anchors.sql`). Không dùng retry của
cùng artifact checksum để thay cho release kế tiếp. Runner lưu checkpoint kèm
`BUILD_SHA` (hoặc `MIGRATION_RELEASE_ID` khi chạy tay), nên retry cùng image sẽ
bị từ chối nếu còn migration pending; chỉ image của release/commit kế tiếp mới
được phép tiếp tục.

`check:migration-safety` cũng chặn ngay trong CI nếu diff đồng thời đưa code
checksum-baseline và một file migration mới. Chốt này cố ý làm batch hỗn hợp
fail trước khi chạm VPS: tách thành commit checksum-only trước, rồi commit
migration ở release kế tiếp.

### Backup bắt buộc cho migration 174

Trước khi `174_repair_billing_cycle_anchors.sql` chạy, dùng
`npm run backup:billing-anchor-repair`. Script chỉ đọc những row migration sẽ
thay đổi, ghi JSON với quyền `0600`, số row và SHA-256 vào thư mục
`BILLING_ANCHOR_BACKUP_DIR`. Production workflow mount thư mục VPS riêng để
backup không đi vào image, git hoặc CI log. Mount đó phải giữ **cùng đường dẫn
tuyệt đối** ở VPS và trong container preflight; `backup_path` được lưu vào DB
để audit/khôi phục phải trỏ tới file thực trên VPS, không phải một path tạm như
`/backups` chỉ tồn tại trong container.

Ở môi trường local/development, `npm run migrate` và startup auto-run tự tạo
preflight vào thư mục `backups/` trước khi chạy 174. Production vẫn phải chạy
backup VPS riêng trong workflow; không dùng local fallback trong image release.

Ngoài file, script ghi một preflight manifest ngắn hạn vào DB. Migration 174
chỉ update row còn khớp manifest; row nào vừa được entitlement/payment khác
thay đổi sau backup sẽ bị bỏ qua để không ghi đè dữ liệu mới. Migration sẽ từ
chối chạy nếu không có manifest mới (tối đa 2 giờ) **và DB đã có active
entitlement**; database trắng không có dữ liệu để repair được phép đi qua để
bootstrap từ đầu. Manifest chỉ bị xóa cùng transaction khi repair thành công.
Không chạy migration trên DB có entitlement nếu backup hoặc manifest không tạo
được. Workflow production chạy `auditBillingCycles.js` read-only ngay sau
migration; log audit ghi số dòng snapshot/repair/skip và các dòng cần manual
review. Snapshot DB bị xóa khi transaction commit, chỉ còn metadata kết quả và
file backup VPS để truy vết/rollback có kiểm soát.
