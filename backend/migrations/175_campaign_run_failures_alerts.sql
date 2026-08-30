-- Migration 175: Seed alert rules for early campaign run failures and repeated campaign failures.

INSERT INTO alert_rules (
  code, name, description, threshold_value, window_minutes, channel, severity, cooldown_minutes, config
)
VALUES (
  'campaign_run_failures',
  'Nhiều lượt chạy chiến dịch thất bại',
  'Có nhiều lượt chạy chiến dịch bị failed trong khoảng thời gian ngắn (kể cả chiến dịch chết sớm 0 recipient)',
  3, 60, 'email', 'critical', 60,
  '{}'::jsonb
),
(
  'campaign_repeated_failures',
  'Chiến dịch hỏng lặp lại nhiều ngày',
  'Chiến dịch có lượt chạy thất bại liên tiếp trong >= 3 ngày và không có lượt nào thành công',
  1, 1440, 'email', 'critical', 720,
  '{"days": 3}'::jsonb
)
ON CONFLICT (code) DO NOTHING;
