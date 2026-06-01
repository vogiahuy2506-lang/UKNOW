-- Migration 035: Seed default plans
-- Tạo/cập nhật các gói dịch vụ mặc định cho hệ thống.
--
-- Lưu ý: KHÔNG xoá plans cũ vì orders.plan_id có FK tới plans.
-- Migration này update theo code nếu plan đã tồn tại, insert nếu chưa có.

BEGIN;

CREATE TEMP TABLE _seed_plans (
  code VARCHAR(50),
  name VARCHAR(255),
  price NUMERIC(12, 2),
  price_yearly NUMERIC(12, 2),
  description TEXT,
  features JSONB,
  max_employees INTEGER,
  is_active BOOLEAN,
  is_custom BOOLEAN,
  duration_days INTEGER,
  daily_email_limit INTEGER,
  monthly_email_limit INTEGER,
  daily_zalo_limit INTEGER,
  monthly_zalo_limit INTEGER,
  messages_per_period INTEGER,
  is_fup_enabled BOOLEAN,
  max_landing_pages INTEGER,
  max_campaigns INTEGER,
  max_zalo_campaigns INTEGER,
  max_zalo_group_campaigns INTEGER,
  max_email_campaigns INTEGER,
  max_zalo_accounts INTEGER,
  max_email_accounts INTEGER,
  max_email_templates INTEGER,
  max_zalo_templates INTEGER
) ON COMMIT DROP;

INSERT INTO _seed_plans (
  code, name, price, price_yearly, description, features,
  max_employees, is_active, is_custom, duration_days,
  daily_email_limit, monthly_email_limit, daily_zalo_limit, monthly_zalo_limit,
  messages_per_period, is_fup_enabled,
  max_landing_pages, max_campaigns, max_zalo_campaigns, max_zalo_group_campaigns, max_email_campaigns,
  max_zalo_accounts, max_email_accounts, max_email_templates, max_zalo_templates
) VALUES
(
  'trial',
  'Dùng thử',
  0,
  NULL,
  'Trải nghiệm đầy đủ tính năng trong 10 ngày. Không cần thẻ tín dụng.',
  '["Nhắn tin Zalo OA không giới hạn", "Gửi email không giới hạn", "Tạo chiến dịch Zalo & Email", "1 Landing page", "Hỗ trợ qua chat"]'::jsonb,
  1,
  TRUE,
  FALSE,
  10,
  NULL, NULL, NULL, NULL,
  100, FALSE,
  1, NULL, NULL, NULL, NULL,
  1, 1, 3, 3
),
(
  'starter',
  'Starter',
  299000,
  2691000,
  'Gói cơ bản dành cho cá nhân và freelancer quản lý khách hàng hiệu quả.',
  '["1,000 tin Zalo/tháng", "500 email/tháng", "3 chiến dịch", "2 Landing pages", "1 tài khoản Zalo OA", "1 tài khoản Email"]'::jsonb,
  1,
  TRUE,
  FALSE,
  30,
  NULL, 500, NULL, 1000,
  NULL, FALSE,
  2, 3, 2, 2, 1,
  1, 1, 10, 10
),
(
  'basic',
  'Basic',
  599000,
  5391000,
  'Gói Basic dành cho shop nhỏ và doanh nghiệp vừa phải mở rộng quy mô tiếp cận khách hàng.',
  '["5,000 tin Zalo/tháng", "2,000 email/tháng", "10 chiến dịch", "5 Landing pages", "2 tài khoản Zalo OA", "2 tài khoản Email", "Báo cáo chi tiết"]'::jsonb,
  3,
  TRUE,
  FALSE,
  30,
  NULL, 2000, NULL, 5000,
  NULL, FALSE,
  5, 10, 5, 5, 3,
  2, 2, 25, 25
),
(
  'professional',
  'Professional',
  1299000,
  11691000,
  'Gói Professional dành cho doanh nghiệp vừa cần quản lý đa kênh chuyên nghiệp.',
  '["20,000 tin Zalo/tháng", "10,000 email/tháng", "Không giới hạn chiến dịch", "15 Landing pages", "5 tài khoản Zalo OA", "5 tài khoản Email", "Tự động hoá Zalo", "API truy cập", "Ưu tiên hỗ trợ"]'::jsonb,
  10,
  TRUE,
  FALSE,
  30,
  NULL, 10000, NULL, 20000,
  NULL, FALSE,
  15, NULL, NULL, NULL, NULL,
  5, 5, 100, 100
),
(
  'enterprise',
  'Enterprise',
  2999000,
  26991000,
  'Gói Enterprise không giới hạn dành cho tổ chức lớn với nhu cầu cao cấp.',
  '["Không giới hạn tin Zalo", "Không giới hạn email", "Không giới hạn chiến dịch", "Không giới hạn Landing pages", "Không giới hạn tài khoản", "White-label", "Dedicated support", "SLA 99.9%", "Custom integrations"]'::jsonb,
  50,
  TRUE,
  FALSE,
  30,
  NULL, NULL, NULL, NULL,
  NULL, TRUE,
  NULL, NULL, NULL, NULL, NULL,
  NULL, NULL, NULL, NULL
);

UPDATE plans p
SET name = s.name,
    price = s.price,
    price_yearly = s.price_yearly,
    description = s.description,
    features = s.features,
    max_employees = s.max_employees,
    is_active = s.is_active,
    is_custom = s.is_custom,
    duration_days = s.duration_days,
    daily_email_limit = s.daily_email_limit,
    monthly_email_limit = s.monthly_email_limit,
    daily_zalo_limit = s.daily_zalo_limit,
    monthly_zalo_limit = s.monthly_zalo_limit,
    messages_per_period = s.messages_per_period,
    is_fup_enabled = s.is_fup_enabled,
    max_landing_pages = s.max_landing_pages,
    max_campaigns = s.max_campaigns,
    max_zalo_campaigns = s.max_zalo_campaigns,
    max_zalo_group_campaigns = s.max_zalo_group_campaigns,
    max_email_campaigns = s.max_email_campaigns,
    max_zalo_accounts = s.max_zalo_accounts,
    max_email_accounts = s.max_email_accounts,
    max_email_templates = s.max_email_templates,
    max_zalo_templates = s.max_zalo_templates,
    updated_at = NOW()
FROM _seed_plans s
WHERE LOWER(p.code) = LOWER(s.code)
  AND p.is_custom = FALSE;

INSERT INTO plans (
  code, name, price, price_yearly, description, features,
  max_employees, is_active, is_custom,
  duration_days,
  daily_email_limit, monthly_email_limit, daily_zalo_limit, monthly_zalo_limit,
  messages_per_period, is_fup_enabled,
  max_landing_pages, max_campaigns, max_zalo_campaigns, max_zalo_group_campaigns, max_email_campaigns,
  max_zalo_accounts, max_email_accounts, max_email_templates, max_zalo_templates
)
SELECT
  s.code, s.name, s.price, s.price_yearly, s.description, s.features,
  s.max_employees, s.is_active, s.is_custom,
  s.duration_days,
  s.daily_email_limit, s.monthly_email_limit, s.daily_zalo_limit, s.monthly_zalo_limit,
  s.messages_per_period, s.is_fup_enabled,
  s.max_landing_pages, s.max_campaigns, s.max_zalo_campaigns, s.max_zalo_group_campaigns, s.max_email_campaigns,
  s.max_zalo_accounts, s.max_email_accounts, s.max_email_templates, s.max_zalo_templates
FROM _seed_plans s
WHERE NOT EXISTS (
  SELECT 1
  FROM plans p
  WHERE LOWER(p.code) = LOWER(s.code)
    AND p.is_custom = FALSE
);

COMMIT;
