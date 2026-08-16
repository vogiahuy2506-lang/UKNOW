-- Alert when Mat Bao e-invoice series is low or series year mismatch.
INSERT INTO alert_rules (
  code, name, description, threshold_value, window_minutes, channel, severity, cooldown_minutes, config
)
VALUES (
  'einvoice_series_low',
  'Dải số hoá đơn Mắt Bão sắp hết hoặc sai năm',
  'Số lượng hoá đơn còn lại dưới ngưỡng hoặc ký hiệu hoá đơn không khớp năm hiện tại',
  50, NULL, 'email', 'critical', 360,
  '{"jobCode": "einvoice_series_check"}'::jsonb
)
ON CONFLICT (code) DO NOTHING;
