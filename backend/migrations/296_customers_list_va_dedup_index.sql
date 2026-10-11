-- 296: index cho danh sach khach va khop trung lien he - PLAN_RA_SOAT_DOT3_KHACH_HANG (PR-C2 viec 1 + 5).
--
-- Khong doi cot nen khong dong den productionSchemaInventory.json. CREATE INDEX thuong (khong CONCURRENTLY: runner boc moi file
-- trong transaction); bang customers production cho phep tao nhanh.
--
-- 1) idx_customers_ws_created: GET /api/customers loc theo workspace roi ORDER BY created_at DESC, id DESC LIMIT n
--    (customerRead.repository.js getAllCustomerRows). Truoc day chi co index dem workspace -> sort toan workspace moi trang.
-- 2) idx_customers_ws_email_key / idx_customers_ws_phone_key: ham khop chung findExistingCustomerByContact
--    (utils/customerContactMatch.util.js) tra theo LOWER(email) va 9 so cuoi SDT. Bieu thuc phai khop TUNG CHU voi
--    CUSTOMER_EMAIL_KEY_SQL / CUSTOMER_PHONE_KEY_SQL thi Postgres moi dung duoc index.

CREATE INDEX IF NOT EXISTS idx_customers_ws_created
  ON customers ((COALESCE(workspace_owner_id, id_user)), created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_customers_ws_email_key
  ON customers ((COALESCE(workspace_owner_id, id_user)), (LOWER(email)));

CREATE INDEX IF NOT EXISTS idx_customers_ws_phone_key
  ON customers ((COALESCE(workspace_owner_id, id_user)), (RIGHT(regexp_replace(phone, '[^0-9]', '', 'g'), 9)));
