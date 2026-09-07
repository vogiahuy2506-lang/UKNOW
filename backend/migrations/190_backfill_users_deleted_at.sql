-- Migration 190: điền mốc xoá cho tài khoản đã xoá mềm trước khi có cột deleted_at (PR-N4b)
--
-- Không suy mốc từ updated_at: cột đó bị mọi thao tác sửa khác chạm vào nên số ra sẽ sai
-- mà không ai biết sai bao nhiêu. Lấy NOW() nghĩa là "bắt đầu đếm từ lúc có khả năng đếm" —
-- các tài khoản này được trọn 90 ngày kể từ hôm chạy migration.
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE users
     SET deleted_at = NOW()
   WHERE status = 'deleted' AND deleted_at IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'Migration 190: đã cập nhật deleted_at cho % tài khoản status=deleted', v_count;
END $$;
