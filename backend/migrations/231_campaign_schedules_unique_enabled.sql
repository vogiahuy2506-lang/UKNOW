-- Lịch chạy chiến dịch: mỗi (chiến dịch, kiểu lịch, cron) chỉ được có MỘT lịch đang bật.
--
-- Lịch trùng hệt nhau nổ cùng lúc → gửi hai lần cho cùng một danh sách. Đã tái diễn:
--   05/08/2026 lịch #31/#33 của chiến dịch 37; 20/09/2026 lịch #177/#178 của chiến dịch 395 (đặt cách
--   nhau đúng một phút, cron '30 07 21 9 *' y hệt). Controller đã chặn ở lớp ứng dụng; index này là lớp
--   cuối cho trường hợp hai request cùng lúc.
--
-- Index bán phần (WHERE enabled): lịch TẮT trùng nhau vẫn được phép (soạn sẵn / lịch cũ đã dừng).
--
-- An toàn khi deploy: nếu production còn nhóm lịch BẬT trùng nhau thì CREATE UNIQUE INDEX sẽ thất bại
-- và làm đỏ cả lượt deploy, nên chỉ tạo index khi chưa có nhóm trùng; ngược lại chỉ RAISE WARNING và
-- bỏ qua (dọn xong thì tạo tay đúng câu CREATE UNIQUE INDEX bên dưới). Kiểm bằng:
--   SELECT id_campaign, schedule_type, cron_expression, COUNT(*), array_agg(id)
--   FROM campaign_schedules WHERE enabled GROUP BY 1,2,3 HAVING COUNT(*) > 1;
DO $$
DECLARE
  duplicate_groups integer;
BEGIN
  SELECT COUNT(*) INTO duplicate_groups FROM (
    SELECT 1
    FROM campaign_schedules
    WHERE enabled
    GROUP BY id_campaign, schedule_type, cron_expression
    HAVING COUNT(*) > 1
  ) grouped;

  IF duplicate_groups > 0 THEN
    RAISE WARNING 'Migration 231: BO QUA uq_campaign_schedules_enabled_dup vi con % nhom lich dang bat bi trung — don xong roi tao tay index nay', duplicate_groups;
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS uq_campaign_schedules_enabled_dup
      ON campaign_schedules (id_campaign, schedule_type, cron_expression)
      WHERE enabled;
  END IF;
END $$;
