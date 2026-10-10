-- 295: bang email_suppressions - PLAN_RA_SOAT_DOT3 muc B PR-Q1 viec 1.
--
-- Truoc day huy dang ky / hard bounce chi ghi len bang customers (email_subscribed=false, email_hard_bounced=true) nen
-- nguoi nhan khong nam trong customers (Sheet, lead, form...) huy dang ky roi van nhan tiep. Bang nay giu danh sach CAM
-- GUI theo (workspace, email) cho MOI nguon nguoi nhan; kiem truoc reserveSendQuota() trong campaignEmailSender.service.js.
--
-- Expand-only: bang moi, khong doi bang cu. Backfill idempotent (ON CONFLICT DO NOTHING) tu:
--   1) customers.email_hard_bounced = true            -> hard_bounce
--   2) customers.email_subscribed = false             -> unsubscribe
--   3) email_messages.status = 'bounced' & bounce_type = 'hard' (khong phai tin gui thu)  -> hard_bounce
--   4) email_messages.status = 'unsubscribed' (khong phai tin gui thu)                    -> unsubscribe
-- Chay thu tu hard_bounce truoc de ly do manh hon thang khi cung (workspace, email) co ca hai.

CREATE TABLE IF NOT EXISTS email_suppressions (
  id                  BIGSERIAL    PRIMARY KEY,
  workspace_owner_id  BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email_lower         VARCHAR(320) NOT NULL,
  reason              VARCHAR(20)  NOT NULL CHECK (reason IN ('unsubscribe', 'hard_bounce')),
  source              VARCHAR(40),
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT email_suppressions_workspace_email_key UNIQUE (workspace_owner_id, email_lower)
);

INSERT INTO email_suppressions (workspace_owner_id, email_lower, reason, source)
SELECT DISTINCT ON (COALESCE(c.workspace_owner_id, c.id_user), LOWER(BTRIM(c.email)))
       COALESCE(c.workspace_owner_id, c.id_user), LOWER(BTRIM(c.email)), 'hard_bounce', 'backfill_customer'
  FROM customers c
 WHERE c.email_hard_bounced = TRUE
   AND c.email IS NOT NULL AND BTRIM(c.email) <> ''
ON CONFLICT (workspace_owner_id, email_lower) DO NOTHING;

INSERT INTO email_suppressions (workspace_owner_id, email_lower, reason, source)
SELECT DISTINCT ON (COALESCE(c.workspace_owner_id, c.id_user), LOWER(BTRIM(c.email)))
       COALESCE(c.workspace_owner_id, c.id_user), LOWER(BTRIM(c.email)), 'unsubscribe', 'backfill_customer'
  FROM customers c
 WHERE c.email_subscribed = FALSE
   AND c.email IS NOT NULL AND BTRIM(c.email) <> ''
ON CONFLICT (workspace_owner_id, email_lower) DO NOTHING;

INSERT INTO email_suppressions (workspace_owner_id, email_lower, reason, source)
SELECT DISTINCT ON (COALESCE(m.workspace_owner_id, cp.workspace_owner_id, cp.id_user), LOWER(BTRIM(m.recipient_email)))
       COALESCE(m.workspace_owner_id, cp.workspace_owner_id, cp.id_user), LOWER(BTRIM(m.recipient_email)),
       'hard_bounce', 'backfill_message'
  FROM email_messages m
  LEFT JOIN campaigns cp ON cp.id = m.id_campaign
 WHERE m.status = 'bounced'
   AND m.bounce_type = 'hard'
   AND COALESCE(m.is_preview, FALSE) = FALSE
   AND m.recipient_email IS NOT NULL AND BTRIM(m.recipient_email) <> ''
   AND COALESCE(m.workspace_owner_id, cp.workspace_owner_id, cp.id_user) IS NOT NULL
ON CONFLICT (workspace_owner_id, email_lower) DO NOTHING;

INSERT INTO email_suppressions (workspace_owner_id, email_lower, reason, source)
SELECT DISTINCT ON (COALESCE(m.workspace_owner_id, cp.workspace_owner_id, cp.id_user), LOWER(BTRIM(m.recipient_email)))
       COALESCE(m.workspace_owner_id, cp.workspace_owner_id, cp.id_user), LOWER(BTRIM(m.recipient_email)),
       'unsubscribe', 'backfill_message'
  FROM email_messages m
  LEFT JOIN campaigns cp ON cp.id = m.id_campaign
 WHERE m.status = 'unsubscribed'
   AND COALESCE(m.is_preview, FALSE) = FALSE
   AND m.recipient_email IS NOT NULL AND BTRIM(m.recipient_email) <> ''
   AND COALESCE(m.workspace_owner_id, cp.workspace_owner_id, cp.id_user) IS NOT NULL
ON CONFLICT (workspace_owner_id, email_lower) DO NOTHING;
