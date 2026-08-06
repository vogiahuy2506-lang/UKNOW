-- Migration 107: Repair orders/users schema drift (PLAN_SCHEMA_BUOC2 Loại A).
--
-- VPS 06/08/2026: order_code varchar thiếu UNIQUE/NOT NULL, payment_method 34 NULL,
-- users.active_plan_id thiếu FK + 10 orphan. Neon/bootstrap có thể ĐÃ có UNIQUE/FK
-- → mọi ADD CONSTRAINT phải idempotent (kiểm pg_constraint trước).
--
-- @see _internal/PLAN_SCHEMA_BUOC2.md

BEGIN;

-- 1. Backfill payment_method
UPDATE orders SET payment_method = 'payos' WHERE payment_method IS NULL;

-- 2. NULL-out active_plan_id trỏ gói không tồn tại
UPDATE users u SET active_plan_id = NULL
WHERE active_plan_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM plans p WHERE p.id = u.active_plan_id);

-- 3. Đổi kiểu order_code — chỉ khi còn không phải bigint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'orders'
      AND column_name = 'order_code'
      AND data_type <> 'bigint'
  ) THEN
    ALTER TABLE orders
      ALTER COLUMN order_code TYPE BIGINT USING order_code::bigint;
  END IF;
END $$;

-- 4. NOT NULL (idempotent) + DEFAULT payos
ALTER TABLE orders
  ALTER COLUMN order_code      SET NOT NULL,
  ALTER COLUMN amount          SET NOT NULL,
  ALTER COLUMN status          SET NOT NULL,
  ALTER COLUMN discount_amount SET NOT NULL,
  ALTER COLUMN payment_method  SET NOT NULL;
ALTER TABLE plans ALTER COLUMN is_custom SET NOT NULL;

ALTER TABLE orders ALTER COLUMN payment_method SET DEFAULT 'payos';

-- 5. UNIQUE order_code — chỉ thêm nếu chưa có (Neon: orders_order_code_key)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_order_code_key'
  ) THEN
    ALTER TABLE orders ADD CONSTRAINT orders_order_code_key UNIQUE (order_code);
  END IF;
END $$;

-- 6. FK users.active_plan_id — chỉ thêm nếu chưa có (Neon: users_active_plan_id_fkey)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_active_plan_id_fkey'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_active_plan_id_fkey
      FOREIGN KEY (active_plan_id) REFERENCES plans(id) ON DELETE SET NULL;
  END IF;
END $$;

COMMIT;
