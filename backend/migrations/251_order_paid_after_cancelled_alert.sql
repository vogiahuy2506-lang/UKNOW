-- PR-4 (PLAN_VA_LOI_LUONG_TIEN_2026-09-26) — canh bao khi don cancelled/failed nhung PayOS
-- bao da tra tien (webhook gap: checkout moi huy don cu nhung link PayOS cu van tra duoc).
INSERT INTO alert_rules (
  code, name, description, threshold_value, window_minutes, channel, severity, cooldown_minutes, config
)
VALUES (
  'order_paid_after_cancelled',
  'Don cancelled/failed nhung PayOS bao da tra tien',
  'Webhook PayOS xac nhan da thu tien cho mot don da bi huy/that bai trong he thong - can nguoi that xu ly tay (kich hoat bu hoac hoan tien), KHONG tu dong kich hoat goi',
  1, NULL, 'email', 'critical', 60,
  '{"maxAgeHours": 168}'::jsonb
)
ON CONFLICT (code) DO NOTHING;
