-- Migration 257: user_members.accepted_at — mốc người bị LIÊN KẾT (origin = 'linked') bấm "Chấp nhận"
-- lời mời vào nhóm. NULL = đang chờ chấp nhận; resolveUserContext (auth.middleware.js) chặn không cho
-- switch sang context của chủ cho tới lúc này.
--
-- RA_SOAT_NHAN_VIEN_PHAN_QUYEN_2026-09-28 mục 1 (phần còn lại sau migration 256): liên kết một tài
-- khoản có sẵn diễn ra tức thì và im lặng — người bị liên kết không biết mình vừa thành "nhân viên"
-- của ai, chủ nhóm thấy được số liệu đóng góp của họ ngay. Cột này là nơi ghi lại đã đồng ý hay chưa.
--
-- DEFAULT NOW() (không phải NULL) cho MỌI insert không tường minh set cột này — cùng tinh thần
-- default 'linked' của origin ở migration 256: nhầm về phía "coi như đã đồng ý" chỉ mất tính năng
-- chặn, nhầm về phía "chưa đồng ý" khoá luôn người đang làm việc thật ra khỏi không gian của họ (26
-- file test tích hợp khác dựng user_members bằng INSERT tay để test context-switch của các tính năng
-- không liên quan — không set cột này thì phải coi là đã đồng ý). Chỉ MỘT chỗ trong code cố ý ghi đè
-- NULL: linkExistingUserAsEmployee (employee.repository.js) — lúc liên kết tài khoản có sẵn thật sự
-- chưa ai đồng ý gì.
--
-- Backfill: MỌI dòng đang tồn tại (kể cả origin='created' — chủ tự tạo, coi là đồng ý ngầm từ lúc
-- tạo) set accepted_at = created_at, KHÔNG lấy mốc NOW() lúc chạy migration (mốc đó không có ý nghĩa
-- gì với dòng cũ) — người đang làm việc thật không được bị khoá ra ngoài.
--
-- Bọc trong kiểm tra "cột đã tồn tại chưa" (như migration 256 kiểm constraint) để AN TOÀN khi lỡ chạy
-- lại: nếu chạy lại sau khi đã có lời mời thật đang chờ (accepted_at IS NULL vì lý do hợp lệ), một
-- UPDATE ... WHERE accepted_at IS NULL không điều kiện sẽ tự động "chấp nhận hộ" các lời mời đó — bug.
-- Không DROP/RENAME gì.

DO $$
DECLARE
  col_existed boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_members' AND column_name = 'accepted_at'
  ) INTO col_existed;

  IF NOT col_existed THEN
    ALTER TABLE user_members ADD COLUMN accepted_at TIMESTAMPTZ;

    UPDATE user_members
    SET accepted_at = created_at
    WHERE accepted_at IS NULL;

    ALTER TABLE user_members ALTER COLUMN accepted_at SET DEFAULT NOW();
  END IF;
END $$;
