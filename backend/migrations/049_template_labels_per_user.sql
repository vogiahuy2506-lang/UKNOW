-- Migration 049: Make template_labels per-user (remove global UNIQUE on name, add UNIQUE per user)

-- 1. Xoá constraint unique cũ (name toàn bảng)
ALTER TABLE template_labels DROP CONSTRAINT IF EXISTS template_labels_name_key;

-- 2. Thêm constraint unique theo (name, created_by) để mỗi user không tạo trùng tên nhãn,
--    nhưng các user khác nhau có thể dùng cùng tên.
--    Drop trước (IF EXISTS) để migration chạy lại được trên DB đã có constraint (idempotent).
ALTER TABLE template_labels DROP CONSTRAINT IF EXISTS template_labels_name_created_by_key;
ALTER TABLE template_labels
  ADD CONSTRAINT template_labels_name_created_by_key UNIQUE (name, created_by);

-- 3. Cập nhật nhãn seed mặc định (created_by = NULL) – giữ nguyên, không xoá.
--    Các nhãn seed này sẽ KHÔNG hiển thị cho bất kỳ user nào nữa vì
--    ta sẽ lọc theo created_by trong query.
