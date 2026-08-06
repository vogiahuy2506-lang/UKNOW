-- 109: Mở rộng mua lẻ — thêm slot cấu trúc (TK Zalo/Email, LP, chatbot, NV)
-- Giá theo bảng "mua lẻ" (premium hơn gói tự chọn một chút).
-- Grant vẫn neo cycle_end = subscription_expires_at như tin/email/AI.

INSERT INTO topup_pricing (item_key, unit_price, min_qty, step_qty, max_qty, is_active, sort_order)
VALUES
  ('zalo_accounts',  50000, 1, 1, 50,  TRUE, 40),
  ('email_accounts', 50000, 1, 1, 50,  TRUE, 50),
  ('landing_pages',  30000, 1, 1, 200, TRUE, 60),
  ('chatbots',      100000, 1, 1, 100, TRUE, 70),
  ('employees',      50000, 1, 1, 100, TRUE, 80)
ON CONFLICT (item_key) DO UPDATE SET
  unit_price = EXCLUDED.unit_price,
  min_qty = EXCLUDED.min_qty,
  step_qty = EXCLUDED.step_qty,
  max_qty = EXCLUDED.max_qty,
  is_active = EXCLUDED.is_active,
  sort_order = EXCLUDED.sort_order,
  updated_at = NOW();
