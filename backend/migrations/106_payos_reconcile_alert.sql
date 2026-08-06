-- Alert when PayOS reconcile cron has to rescue paid orders (webhook gap).
INSERT INTO alert_rules (
  code, name, description, threshold_value, window_minutes, channel, severity, cooldown_minutes, config
)
VALUES (
  'payos_reconcile_rescued',
  'Đối soát PayOS cứu được đơn đã trả',
  'Cron đối soát tìm thấy đơn PAID mà webhook chưa kích hoạt — webhook có thể đang hỏng',
  1, NULL, 'email', 'critical', 30,
  '{"jobCode": "payos_order_reconcile"}'::jsonb
)
ON CONFLICT (code) DO NOTHING;
