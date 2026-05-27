-- Migration 035: Seed default plans
-- Tạo sẵn các gói dịch vụ mặc định cho hệ thống.
-- Chạy sau khi đã apply migration 034.

BEGIN;

-- ============================================================
-- Xoá dữ liệu cũ nếu có (để có thể re-run sạch sẽ)
-- ============================================================
DELETE FROM plans WHERE is_custom = FALSE;

-- ============================================================
-- 1. TRIAL — Dùng thử 10 ngày
-- ============================================================
INSERT INTO plans (
  code, name, price, price_yearly, description, features,
  max_employees, is_active, is_custom,
  duration_days,
  daily_email_limit, monthly_email_limit, daily_zalo_limit, monthly_zalo_limit,
  messages_per_period, is_fup_enabled,
  max_landing_pages, max_campaigns, max_zalo_campaigns, max_zalo_group_campaigns, max_email_campaigns,
  max_zalo_accounts, max_email_accounts, max_email_templates, max_zalo_templates
) VALUES (
  'trial',
  'Dùng thử',
  0,
  NULL,
  'Trải nghiệm đầy đủ tính năng trong 10 ngày. Không cần thẻ tín dụng.',
  '["Nhắn tin Zalo OA không giới hạn", "Gửi email không giới hạn", "Tạo chiến dịch Zalo & Email", "1 Landing page", "Hỗ trợ qua chat"]',
  1,
  TRUE,
  FALSE,
  10,
  NULL, NULL, NULL, NULL,
  100, FALSE,
  1, NULL, NULL, NULL, NULL,
  1, 1, 3, 3
);

-- ============================================================
-- 2. STARTER — Cho cá nhân / freelancer
-- ============================================================
INSERT INTO plans (
  code, name, price, price_yearly, description, features,
  max_employees, is_active, is_custom,
  duration_days,
  daily_email_limit, monthly_email_limit, daily_zalo_limit, monthly_zalo_limit,
  messages_per_period, is_fup_enabled,
  max_landing_pages, max_campaigns, max_zalo_campaigns, max_zalo_group_campaigns, max_email_campaigns,
  max_zalo_accounts, max_email_accounts, max_email_templates, max_zalo_templates
) VALUES (
  'starter',
  'Starter',
  299000,
  2691000,
  'Gói cơ bản dành cho cá nhân và freelancer quản lý khách hàng hiệu quả.',
  '["1,000 tin Zalo/tháng", "500 email/tháng", "3 chiến dịch", "2 Landing pages", "1 tài khoản Zalo OA", "1 tài khoản Email"]',
  1,
  TRUE,
  FALSE,
  30,
  NULL, 500, NULL, 1000,
  NULL, FALSE,
  2, 3, 2, 2, 1,
  1, 1, 10, 10
);

-- ============================================================
-- 3. BASIC — Cho shop nhỏ / doanh nghiệp nhỏ
-- ============================================================
INSERT INTO plans (
  code, name, price, price_yearly, description, features,
  max_employees, is_active, is_custom,
  duration_days,
  daily_email_limit, monthly_email_limit, daily_zalo_limit, monthly_zalo_limit,
  messages_per_period, is_fup_enabled,
  max_landing_pages, max_campaigns, max_zalo_campaigns, max_zalo_group_campaigns, max_email_campaigns,
  max_zalo_accounts, max_email_accounts, max_email_templates, max_zalo_templates
) VALUES (
  'basic',
  'Basic',
  599000,
  5391000,
  'Gói Basic dành cho shop nhỏ và doanh nghiệp vừa phải mở rộng quy mô tiếp cận khách hàng.',
  '["5,000 tin Zalo/tháng", "2,000 email/tháng", "10 chiến dịch", "5 Landing pages", "2 tài khoản Zalo OA", "2 tài khoản Email", "Báo cáo chi tiết"]',
  3,
  TRUE,
  FALSE,
  30,
  NULL, 2000, NULL, 5000,
  NULL, FALSE,
  5, 10, 5, 5, 3,
  2, 2, 25, 25
);

-- ============================================================
-- 4. PROFESSIONAL — Cho doanh nghiệp vừa
-- ============================================================
INSERT INTO plans (
  code, name, price, price_yearly, description, features,
  max_employees, is_active, is_custom,
  duration_days,
  daily_email_limit, monthly_email_limit, daily_zalo_limit, monthly_zalo_limit,
  messages_per_period, is_fup_enabled,
  max_landing_pages, max_campaigns, max_zalo_campaigns, max_zalo_group_campaigns, max_email_campaigns,
  max_zalo_accounts, max_email_accounts, max_email_templates, max_zalo_templates
) VALUES (
  'professional',
  'Professional',
  1299000,
  11691000,
  'Gói Professional dành cho doanh nghiệp vừa cần quản lý đa kênh chuyên nghiệp.',
  '["20,000 tin Zalo/tháng", "10,000 email/tháng", "Không giới hạn chiến dịch", "15 Landing pages", "5 tài khoản Zalo OA", "5 tài khoản Email", "Tự động hoá Zalo", "API truy cập", "Ưu tiên hỗ trợ"]',
  10,
  TRUE,
  FALSE,
  30,
  NULL, 10000, NULL, 20000,
  NULL, FALSE,
  15, NULL, NULL, NULL, NULL,
  5, 5, 100, 100
);

-- ============================================================
-- 5. ENTERPRISE — Cho tổ chức lớn
-- ============================================================
INSERT INTO plans (
  code, name, price, price_yearly, description, features,
  max_employees, is_active, is_custom,
  duration_days,
  daily_email_limit, monthly_email_limit, daily_zalo_limit, monthly_zalo_limit,
  messages_per_period, is_fup_enabled,
  max_landing_pages, max_campaigns, max_zalo_campaigns, max_zalo_group_campaigns, max_email_campaigns,
  max_zalo_accounts, max_email_accounts, max_email_templates, max_zalo_templates
) VALUES (
  'enterprise',
  'Enterprise',
  2999000,
  26991000,
  'Gói Enterprise không giới hạn dành cho tổ chức lớn với nhu cầu cao cấp.',
  '["Không giới hạn tin Zalo", "Không giới hạn email", "Không giới hạn chiến dịch", "Không giới hạn Landing pages", "Không giới hạn tài khoản", "White-label", "Dedicated support", "SLA 99.9%", "Custom integrations"]',
  50,
  TRUE,
  FALSE,
  30,
  NULL, NULL, NULL, NULL,
  NULL, TRUE,
  NULL, NULL, NULL, NULL, NULL,
  NULL, NULL, NULL, NULL
);

COMMIT;
