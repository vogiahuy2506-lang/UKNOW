-- Migration 177: Nâng ngưỡng luật 'campaign_run_stalled' từ 6 giờ lên 48 giờ.
--
-- Lý do: một lượt chạy ở trạng thái 'running' im lặng KHÔNG đồng nghĩa với treo.
-- Các khoảng im lặng hợp lệ theo thiết kế:
--   - Giờ yên lặng Zalo (23:00-06:00): tới ~7 giờ. Đo trên dữ liệu thật 30 ngày:
--     khoảng lặng qua đêm dài nhất của run ĐÃ HOÀN TẤT là 6,57 giờ > ngưỡng 6 giờ cũ,
--     tức luật cũ bắn báo động giả cho chiến dịch khoẻ mạnh chạy qua đêm.
--   - SMTP bị rate-limit: tạm dừng 12 giờ cố định (EMAIL_RATE_LIMIT_PAUSE_MS).
--   - Cooldown tra số điện thoại Zalo: 3 giờ.
--   - Người nhận hẹn giờ (hasPendingRecipientDue): không giới hạn.
--
-- 48 giờ nằm trên mọi khoảng chờ thiết kế (dài nhất 12 giờ) mà vẫn bắt được các run
-- treo thật (tại thời điểm viết: run 227 treo 1312 giờ, run 314 và 323 treo ~210 giờ).
--
-- Đây là giải pháp tạm. Cách đúng là ghi 'nextWakeAt' xuống run_metadata rồi cảnh báo
-- khi lượt chạy quá giờ hẹn của chính nó — hiện nextContinuousWakeAtMs chỉ sống trong RAM.

UPDATE alert_rules
SET config = '{"hours": 48}'::jsonb,
    window_minutes = 2880,
    description = 'Có lượt chạy chiến dịch ở trạng thái running nhưng không có thêm hoạt động/execution nào trong 48 giờ qua'
WHERE code = 'campaign_run_stalled';
