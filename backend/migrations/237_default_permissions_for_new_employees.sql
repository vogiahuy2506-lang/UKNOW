-- Migration 237: cấp quyền xem mặc định cho các membership CHƯA BAO GIỜ được phân quyền.
--
-- Từ 22/09/2026 backend truyền quyền mặc định tường minh khi thêm nhân viên
-- (`buildDefaultNewEmployeePermissions` — campaigns_view + reports_view, đều chỉ-đọc).
-- Migration này lo phần dữ liệu cũ: những hàng sinh ra trước đó nhận mặc định của cột
-- (`'[]'::jsonb` trên production) nên nhân viên vào không gian công ty thấy trang trắng —
-- đúng phản ánh "add nhân viên xong không xem được chiến dịch của công ty".
--
-- CHỈ đụng hàng chưa từng được phân quyền, nhận ra bằng HÌNH DẠNG dữ liệu:
--   * `[]` (mảng)  → chưa ai mở màn phân quyền lần nào;
--   * `{}` (object rỗng) → mặc định của schema.sql/bootstrap, cũng là chưa từng lưu.
-- Chủ bấm "Bỏ hết" rồi Lưu thì `normalizePermissions` ghi đủ 22 khoá = false (object KHÔNG
-- rỗng) → KHÔNG khớp điều kiện, quyết định thu hồi quyền của chủ được giữ nguyên.
--
-- Idempotent: chạy lại lần hai không khớp hàng nào (sau lần đầu permissions đã là object có khoá).
-- Không đổi schema nên không cần mirror sang bootstrap.sql.

BEGIN;

UPDATE user_members
SET permissions = '{"campaigns_view": true, "reports_view": true}'::jsonb,
    updated_at  = NOW()
WHERE status = 'active'
  AND (
    jsonb_typeof(permissions) <> 'object'
    OR permissions = '{}'::jsonb
  );

COMMIT;
