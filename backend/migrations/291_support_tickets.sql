-- 291: ticket gop y / ho tro trong ung dung - PLAN_TICKET_GOP_Y_VA_CHUONG_THONG_BAO_2026-10-10 PR-4.
--
-- Truoc day khach chi co the lien he qua trang chu (bang contact_submissions, khong man admin nao doc) hoac chat voi chatbot. Hai bang
-- nay la hop thu ticket: MOT ticket = MOT chu de cua MOT nguoi dung, gom nhieu tin (nguoi dung <-> super admin).
--
--   * support_tickets.user_id            : NGUOI TAO ticket that (nhan vien co dong users rieng) - chi nguoi nay thay ticket cua minh.
--   * support_tickets.workspace_owner_id : chu workspace khi ticket duoc tao trong ngu canh nhan vien (NULL khi tao o khong gian rieng).
--   * support_tickets.status             : open (cho admin) / awaiting_user (admin da tra loi, cho khach) / closed.
--                                          Cron support_ticket_auto_close dong ticket awaiting_user qua 7 ngay khong ai dong dap.
--   * support_tickets.closed_by          : NULL khi he thong tu dong dong.
--   * support_ticket_messages.attachments: [{ storageObjectId, key, name, size, mime }] - toi da 3 anh/tin, tep nam o storage_objects
--                                          (category 'support_ticket', reference_type 'support_ticket', reference_id = id ticket).
-- Noi dung ticket la van ban thuan: khong bao gio render HTML cua nguoi dung.
-- Chi CREATE, khong DROP/ALTER cot cu.

CREATE TABLE IF NOT EXISTS support_tickets (
  id                  BIGSERIAL    PRIMARY KEY,
  user_id             BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_owner_id  BIGINT       REFERENCES users(id) ON DELETE SET NULL,
  subject             VARCHAR(200) NOT NULL,
  category            VARCHAR(24)  NOT NULL
    CHECK (category IN ('feedback', 'bug', 'billing', 'other')),
  status              VARCHAR(24)  NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'awaiting_user', 'closed')),
  last_message_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  last_admin_reply_at TIMESTAMPTZ,
  closed_at           TIMESTAMPTZ,
  closed_by           INTEGER      REFERENCES users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_status_last_message
  ON support_tickets (status, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_user_created
  ON support_tickets (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS support_ticket_messages (
  id             BIGSERIAL   PRIMARY KEY,
  ticket_id      BIGINT      NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  author_user_id BIGINT      REFERENCES users(id) ON DELETE SET NULL,
  author_role    VARCHAR(8)  NOT NULL
    CHECK (author_role IN ('user', 'admin')),
  body           TEXT        NOT NULL,
  attachments    JSONB       NOT NULL DEFAULT '[]'::jsonb,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_ticket_messages_ticket_created
  ON support_ticket_messages (ticket_id, created_at);

COMMENT ON TABLE support_tickets IS
  'Ticket gop y / ho tro cua nguoi dung gui cho super admin: mot dong = mot chu de. user_id la nguoi tao that (nhan vien co dong rieng). Xem services/support/supportTicket.service.js.';
COMMENT ON TABLE support_ticket_messages IS
  'Tin trong mot ticket (van ban thuan, khong HTML). attachments = [{ storageObjectId, key, name, size, mime }], toi da 3 anh/tin.';
