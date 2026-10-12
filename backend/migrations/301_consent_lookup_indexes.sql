-- 301: chi muc cho chot dong y truoc khi gui (PLAN_BIEU_MAU_TUY_BIEN_AI_LANDING_2026-10-11, PR-7b).
--
-- Chot dong y (PR-2) tra form_submissions + leads cho TUNG nguoi nhan trong vong gui
-- (campaignEmailSender.repository.js: isLeadConsentRefusedOrWithdrawn / isLeadPhoneConsentRefused):
--   form_submissions:  workspace_owner_id = $1 AND LOWER(respondent_email) = $2
--                      workspace_owner_id = $1 AND RIGHT(regexp_replace(respondent_phone, '[^0-9]', '', 'g'), 9) = $2
--   leads:             email = $2     |     RIGHT(regexp_replace(phone, '[^0-9]', '', 'g'), 9) = $2
-- Truoc day form_submissions chi co index theo owner (quet moi bai nop cua workspace cho tung nguoi nhan) va leads
-- khong co index theo SDT (quet ca bang leads - bang dung chung moi workspace). Khi AI landing do khach vao Bieu mau,
-- vong gui hang nghin nguoi se quet cham.
--
-- Khong doi cot nen khong dong den productionSchemaInventory.json. CREATE INDEX thuong (khong CONCURRENTLY: runner boc moi
-- file trong transaction); form_submissions / leads production con nho nen tao nhanh.
--
-- Bieu thuc index phai khop TUNG CHU voi cau truy van (CONSENT_*_MATCH_SQL trong campaignEmailSender.repository.js) thi
-- Postgres moi dung duoc index; tests/integration/consentLookupIndexes.test.js chay EXPLAIN tren chinh cau truy van that.
--
-- leads.email: idx_leads_email co trong schema.sql goc; cau truy van PR-2 chi them dieu kien workspace / marketing_consent
-- nen index don cot do du dung. Dong ben duoi chi la IF NOT EXISTS de chac chan (no-op neu da co), khong doi gi.

CREATE INDEX IF NOT EXISTS idx_form_submissions_owner_email_key
  ON form_submissions (workspace_owner_id, (LOWER(respondent_email)));

CREATE INDEX IF NOT EXISTS idx_form_submissions_owner_phone_key
  ON form_submissions (workspace_owner_id, (RIGHT(regexp_replace(respondent_phone, '[^0-9]', '', 'g'), 9)));

CREATE INDEX IF NOT EXISTS idx_leads_phone_key
  ON leads ((RIGHT(regexp_replace(phone, '[^0-9]', '', 'g'), 9)));

CREATE INDEX IF NOT EXISTS idx_leads_email ON leads (email);
