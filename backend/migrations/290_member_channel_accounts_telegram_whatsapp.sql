-- Migration 290: giao tung tai khoan Telegram / WhatsApp (Baileys) cho nhan vien - backfill 'legacy'
-- (PLAN_GIAO_TK_TG_WA PR-H1; nen la bang member_channel_accounts cua migration 283, KHONG doi cau truc).
--
-- Bang 283 da co `channel VARCHAR(30)` (khong CHECK) + `account_ref TEXT` nen chi them hai gia tri `channel`:
--   'telegram'          account_ref = telegram_accounts.id (chuoi)
--   'whatsapp_baileys'  account_ref = session_key DAY DU "<idChu>-<khoaNgan>" (khong co bang tai khoan - phien song o
--                       whatsapp_baileys_session_creds). WhatsApp Cloud API KHONG nam trong pham vi.
--
-- Truoc day moi nhan vien co quyen kenh / hop thu / chien dich / tro ly AI deu thay va dung DUOC MOI tai khoan Telegram
-- va WhatsApp cua chu. Backfill 'legacy' giu nguyen quyen dang dung cho nhan vien HIEN CO (khong gay viec cua khach):
-- moi cap (nhan vien dang hoat dong co it nhat mot quyen cham toi kenh) x (moi tai khoan cua chu). Giong 283 nhung BO
-- `zalo_settings` (quyen rieng cua Zalo). Chu khong nhan hang (chu luon thay tat ca). Nhan vien MOI sau migration nay
-- mac dinh KHONG co tai khoan nao; tai khoan chu them SAU deploy cung khong tu giao cho nhan vien cu.
--
-- CHI chay khi chua co hang nao cua kenh do (cung tinh than 283 - chay lai sau khi chu da go bot se khong cap lai),
-- idempotent (ON CONFLICT DO NOTHING), bao ve bang co the thieu bang to_regclass.
-- Chi INSERT vao bang da co, khong DROP / ALTER.

DO $$
BEGIN
  IF to_regclass('public.member_channel_accounts') IS NULL THEN
    RETURN;
  END IF;

  -- Telegram
  IF to_regclass('public.telegram_accounts') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM member_channel_accounts WHERE channel = 'telegram') THEN
    INSERT INTO member_channel_accounts (owner_id, employee_id, channel, account_ref, source)
    SELECT um.owner_id, um.employee_id, 'telegram', ta.id::text, 'legacy'
    FROM user_members um
    JOIN telegram_accounts ta ON ta.id_user = um.owner_id
    WHERE um.status = 'active'
      AND um.accepted_at IS NOT NULL
      AND (
        um.permissions @> '{"chatbot_channels_manage": true}'::jsonb
        OR um.permissions @> '{"inbox_view": true}'::jsonb
        OR um.permissions @> '{"inbox_reply": true}'::jsonb
        OR um.permissions @> '{"inbox_manage": true}'::jsonb
        OR um.permissions @> '{"campaigns_create": true}'::jsonb
        OR um.permissions @> '{"campaigns_run": true}'::jsonb
        OR um.permissions @> '{"ai_assistant_use": true}'::jsonb
      )
    ON CONFLICT (owner_id, employee_id, channel, account_ref) DO NOTHING;
  END IF;

  -- WhatsApp Baileys: phien = dong creds; chu = tien to "<so>-" cua session_key.
  IF to_regclass('public.whatsapp_baileys_session_creds') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM member_channel_accounts WHERE channel = 'whatsapp_baileys') THEN
    INSERT INTO member_channel_accounts (owner_id, employee_id, channel, account_ref, source)
    SELECT um.owner_id, um.employee_id, 'whatsapp_baileys', c.session_key, 'legacy'
    FROM user_members um
    JOIN whatsapp_baileys_session_creds c ON c.session_key LIKE (um.owner_id::text || '-%')
    WHERE um.status = 'active'
      AND um.accepted_at IS NOT NULL
      AND (
        um.permissions @> '{"chatbot_channels_manage": true}'::jsonb
        OR um.permissions @> '{"inbox_view": true}'::jsonb
        OR um.permissions @> '{"inbox_reply": true}'::jsonb
        OR um.permissions @> '{"inbox_manage": true}'::jsonb
        OR um.permissions @> '{"campaigns_create": true}'::jsonb
        OR um.permissions @> '{"campaigns_run": true}'::jsonb
        OR um.permissions @> '{"ai_assistant_use": true}'::jsonb
      )
    ON CONFLICT (owner_id, employee_id, channel, account_ref) DO NOTHING;
  END IF;
END $$;
