-- 144: Cảnh báo hoá đơn điện tử đã thu tiền nhưng không phát hành được.
--
-- Lý do: cron `einvoice_matbao_retry` cố tình BỎ QUA những dòng `failed` có mã lỗi
-- ngoài danh sách retry được (matbaoInvoice.service.js:450 — `skipped += 1; continue;`),
-- và không bao giờ nhặt `cqt_rejected`. Trước migration này, những hoá đơn đó nằm chết
-- trong bảng mà không ai biết — khách đã trả tiền, luật buộc phải xuất hoá đơn.
--
-- severity=critical để không bị bỏ qua trong khung giờ yên lặng (23:00–06:00).
-- cooldown 720 phút: quy tắc này cố ý KHÔNG có cận trên theo tuổi (nghĩa vụ xuất hoá
-- đơn không tự hết hạn) nên sẽ bắn lại cho tới khi có người xử lý — 12 giờ một lần
-- là đủ nhắc mà không khiến người ta tắt cảnh báo.
INSERT INTO alert_rules (
  code, name, description, threshold_value, window_minutes, channel, severity, cooldown_minutes, config
)
VALUES (
  'einvoice_stuck',
  'Hoá đơn điện tử kẹt — đã thu tiền, chưa xuất được',
  'Hoá đơn hỏng hẳn (cron không tự thử lại) hoặc đọng quá lâu ở trạng thái chờ',
  1, NULL, 'email', 'critical', 720,
  '{"staleHours": 6}'::jsonb
)
ON CONFLICT (code) DO NOTHING;
