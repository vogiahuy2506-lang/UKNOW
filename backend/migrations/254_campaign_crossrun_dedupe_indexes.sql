-- PR-7b (PLAN_ON_DINH_GUI_CHIEN_DICH_2026-09-26) — cửa sổ chống trùng liên-run cần lọc theo
-- id_campaign (khác id_run), việc hiện KHÔNG có index nào phủ (chỉ có idx_email_messages_run /
-- không có index nào trên id_campaign của zalo_messages) -> Seq Scan toàn bảng mỗi lần gửi.
--
-- Không dùng lại idx_email_messages_quota_count / idx_zalo_messages_quota_count (migration 090):
-- 2 index đó thiếu trong bootstrap.sql/schema.sql (lệch, chưa xác nhận có tồn tại thật trên
-- production) và khác predicate (status list, sent_at thay vì created_at) nên planner không chắc
-- dùng được cho truy vấn mới.

CREATE INDEX IF NOT EXISTS idx_email_messages_campaign_step_created
  ON email_messages (id_campaign, email_step, created_at)
  WHERE status IN ('sent', 'delivered', 'opened', 'clicked');

CREATE INDEX IF NOT EXISTS idx_zalo_messages_campaign_channel_created
  ON zalo_messages (id_campaign, channel, created_at)
  WHERE (tracking_metadata->>'status') = 'sent';
