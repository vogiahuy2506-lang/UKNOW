-- PR-S1 (PLAN_ON_DINH_SAO_LUU_CANH_BAO_ZALO_2026-09-29) — 2 luat canh bao van hanh:
--   db_backup_stale : ban sao luu DB tren GCS (db-backups/) qua cu hoac khong co (chi chay khi STORAGE_BACKEND=gcs)
--   disk_usage_high : dia may chu vuot nguong % (dung lai doc dung luong cua storageCapacity.util)
-- Cooldown 360 phut de khong bao moi gio. Chi INSERT dong, khong doi cau truc bang.
INSERT INTO alert_rules (
  code, name, description, threshold_value, window_minutes, channel, severity, cooldown_minutes, config
)
VALUES
(
  'db_backup_stale',
  'Sao luu DB ngoai VPS qua cu hoac mat',
  'Ban sao luu moi nhat trong GCS db-backups/ cu hon maxAgeHours (mac dinh 30 gio), khong co ban nao, hoac khong doc duoc GCS - kiem tra cron backup-offsite.sh tren host',
  1, NULL, 'email', 'critical', 360,
  '{"maxAgeHours": 30}'::jsonb
),
(
  'disk_usage_high',
  'Dia may chu gan day',
  'Dung luong dia may chu vuot thresholdPercent (mac dinh 85%) - don backup cu / docker image / log truoc khi dia day',
  1, NULL, 'email', 'warning', 360,
  '{"thresholdPercent": 85}'::jsonb
)
ON CONFLICT (code) DO NOTHING;
