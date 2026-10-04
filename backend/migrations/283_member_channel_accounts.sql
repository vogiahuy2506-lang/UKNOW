-- Migration 283: member_channel_accounts - giao tung tai khoan kenh (truoc mat: Zalo ca nhan) cho nhan vien
-- (PLAN_GIAO_TAI_KHOAN_ZALO_CHO_NHAN_VIEN_2026-10-04 PR-G1).
--
-- Truoc day moi nhan vien co quyen inbox_view / zalo_settings / campaigns_* deu thay va dung DUOC MOI tai khoan
-- Zalo ca nhan cua chu (ke ca nick gia dinh). Bang nay ghi ro nhan vien nao duoc dung tai khoan nao; chi ngu canh
-- 'employee' bi loc, chu va super admin van thay het.
--
--   channel     'zalo_personal' (chua cho de telegram / whatsapp / email lam sau)
--   account_ref id zalo_settings dang CHUOI (TEXT de sau nay chua duoc session key WhatsApp; khong FK duoc nen
--               xoa tai khoan Zalo thi code don hang tuong ung)
--   source      'assigned'   chu giao o man Quan ly nhan vien
--               'self_login' nhan vien tu quet QR mot tai khoan MOI (tao hang zalo_settings moi)
--               'legacy'     nhan vien da co san luc deploy: giu quyen dang dung de khong gay viec cua khach
--
-- Nhan vien MOI sau migration nay mac dinh KHONG co tai khoan nao.
--
-- Backfill 'legacy' CHI chay khi bang vua duoc tao (cung tinh than migration 257): chay lai sau khi chu da go bot
-- tai khoan o man moi se khong tu cap lai.
-- Chi tao bang / index moi, khong DROP / ALTER bang cu.

DO $$
DECLARE
  table_existed boolean;
BEGIN
  SELECT to_regclass('public.member_channel_accounts') IS NOT NULL INTO table_existed;

  IF NOT table_existed THEN
    CREATE TABLE member_channel_accounts (
      id          BIGSERIAL PRIMARY KEY,
      owner_id    BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      employee_id BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      channel     VARCHAR(30)  NOT NULL,
      account_ref TEXT         NOT NULL,
      source      VARCHAR(20)  NOT NULL DEFAULT 'assigned'
        CONSTRAINT chk_member_channel_accounts_source CHECK (source IN ('assigned', 'self_login', 'legacy')),
      created_by  BIGINT       REFERENCES users(id) ON DELETE SET NULL,
      created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_member_channel_accounts UNIQUE (owner_id, employee_id, channel, account_ref)
    );

    CREATE INDEX idx_member_channel_accounts_employee
      ON member_channel_accounts (owner_id, employee_id, channel);
    CREATE INDEX idx_member_channel_accounts_ref
      ON member_channel_accounts (channel, account_ref);

    -- Nhan vien DANG CO giu quyen dang dung: moi cap (nhan vien dang hoat dong co it nhat mot quyen cham toi
    -- tai khoan Zalo) x (moi tai khoan Zalo hien co cua chu).
    INSERT INTO member_channel_accounts (owner_id, employee_id, channel, account_ref, source)
    SELECT um.owner_id, um.employee_id, 'zalo_personal', zs.id::text, 'legacy'
    FROM user_members um
    JOIN zalo_settings zs ON zs.id_user = um.owner_id
    WHERE um.status = 'active'
      AND um.accepted_at IS NOT NULL
      AND (
        um.permissions @> '{"zalo_settings": true}'::jsonb
        OR um.permissions @> '{"inbox_view": true}'::jsonb
        OR um.permissions @> '{"inbox_reply": true}'::jsonb
        OR um.permissions @> '{"inbox_manage": true}'::jsonb
        OR um.permissions @> '{"campaigns_create": true}'::jsonb
        OR um.permissions @> '{"campaigns_run": true}'::jsonb
        OR um.permissions @> '{"ai_assistant_use": true}'::jsonb
        OR um.permissions @> '{"chatbot_channels_manage": true}'::jsonb
      )
    ON CONFLICT (owner_id, employee_id, channel, account_ref) DO NOTHING;
  END IF;
END $$;
