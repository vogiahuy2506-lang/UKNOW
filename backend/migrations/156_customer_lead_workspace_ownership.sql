-- Migration 156 / PR-3A: chuẩn hóa workspace ownership cho Customer và Lead.
--
-- Dữ liệu customer lịch sử không lưu active employee context tại thời điểm tạo.
-- Chỉ backfill chắc chắn theo id_user; không suy đoán owner từ membership hiện tại.
-- Lead được tạo qua public form nên không có authenticated actor để gán created_by.

BEGIN;

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS workspace_owner_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS created_by BIGINT REFERENCES users(id) ON DELETE SET NULL;

UPDATE customers
SET workspace_owner_id = COALESCE(workspace_owner_id, id_user),
    created_by = COALESCE(created_by, id_user)
WHERE workspace_owner_id IS NULL
   OR created_by IS NULL;

CREATE INDEX IF NOT EXISTS idx_customers_workspace_owner
  ON customers (workspace_owner_id);

CREATE INDEX IF NOT EXISTS idx_customers_effective_workspace_owner
  ON customers ((COALESCE(workspace_owner_id, id_user)));

CREATE INDEX IF NOT EXISTS idx_customers_created_by
  ON customers (created_by)
  WHERE created_by IS NOT NULL;

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS workspace_owner_id BIGINT REFERENCES users(id) ON DELETE CASCADE;

UPDATE leads
SET workspace_owner_id = COALESCE(workspace_owner_id, id_user)
WHERE workspace_owner_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_leads_workspace_owner
  ON leads (workspace_owner_id);

CREATE INDEX IF NOT EXISTS idx_leads_effective_workspace_owner
  ON leads ((COALESCE(workspace_owner_id, id_user)));

DO $$
DECLARE
  customer_total BIGINT;
  customer_ambiguous BIGINT;
  lead_total BIGINT;
BEGIN
  SELECT COUNT(*) INTO customer_total FROM customers;
  SELECT COUNT(*) INTO lead_total FROM leads;

  SELECT COUNT(*) INTO customer_ambiguous
  FROM customers c
  WHERE (
    SELECT COUNT(*)
    FROM user_members um
    WHERE um.employee_id = c.created_by
      AND um.status = 'active'
  ) > 1;

  RAISE NOTICE 'Customer/lead ownership report: customers=%, leads=%, customer-multiple-current-owner-candidates=%. Historical rows remain self-scoped.',
    customer_total, lead_total, customer_ambiguous;
END $$;

COMMIT;
