-- Migration 176: Seed alert rule for stalled campaign runs.

INSERT INTO alert_rules (
  code, name, description, threshold_value, window_minutes, channel, severity, cooldown_minutes, config
)
VALUES (
  'campaign_run_stalled',
  'Lượt chạy chiến dịch đứng yên',
  'Có lượt chạy chiến dịch ở trạng thái running nhưng không có thêm hoạt động/execution nào trong 6 giờ qua',
  1, 360, 'email', 'warning', 180,
  '{"hours": 6}'::jsonb
)
ON CONFLICT (code) DO NOTHING;
