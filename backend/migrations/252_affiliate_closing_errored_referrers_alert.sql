-- PR-4 (PLAN_VA_LOI_LUONG_TIEN_2026-09-26) — canh bao khi luot dong so hoa hong affiliate gan
-- nhat co referrer tinh hoa hong loi (erroredReferrers > 0). Cron van bao status success/noop
-- (loi tung referrer chi console.error), nen phai doc rieng result.erroredReferrers.
INSERT INTO alert_rules (
  code, name, description, threshold_value, window_minutes, channel, severity, cooldown_minutes, config
)
VALUES (
  'affiliate_closing_errored_referrers',
  'Dong so hoa hong affiliate co referrer loi',
  'Luot dong so hoa hong affiliate gan nhat co referrer tinh hoa hong loi - cron van bao success/noop nen khong tu phat hien duoc qua status, can xem log AffiliateClosing va xu ly tay',
  1, NULL, 'email', 'critical', 60,
  '{"jobCode": "affiliate_month_closing"}'::jsonb
)
ON CONFLICT (code) DO NOTHING;
