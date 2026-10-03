-- 277: dau moc "AI khong tra loi duoc cho khach" (PLAN_SUA_AI_DOT2 G3b muc 1, A P1-6).
--
-- Khi chu het credit / het goi / cham han muc AI, chatbot chi tra cau xin loi cho khach va chi console.warn - chu khong biet.
-- Bang nay giu HAI loai moc, deu phai SONG QUA RESTART (nen o DB, khong o bo nho):
--   * owner_email     - lan cuoi gui email bao CHU "chatbot dang khong tra loi duoc" (cooldown 24 gio / chu).
--                       notice_key = '' (mot dong / chu).
--   * visitor_apology - lan cuoi gui cau xin loi cho MOT khach (toi da 1 cau / khach / 6 gio - khach nhan 10 tin khong nhan 10 cau).
--                       notice_key = '<kenh>:<id hoi thoai>'.
-- "Chiem" mot moc la mot cau INSERT ... ON CONFLICT DO UPDATE ... WHERE last_sent_at <= moc - cooldown: nguyen tu, hai
-- tien trinh tranh nhau thi chi mot ben thang (mot email / mot cau xin loi).
-- Chi CREATE, khong DROP/ALTER cot cu.

CREATE TABLE IF NOT EXISTS ai_unavailable_notices (
  id_user      BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind         VARCHAR(20)  NOT NULL CHECK (kind IN ('owner_email', 'visitor_apology')),
  notice_key   VARCHAR(200) NOT NULL DEFAULT '',
  last_sent_at TIMESTAMPTZ  NOT NULL,
  send_count   INTEGER      NOT NULL DEFAULT 1,
  PRIMARY KEY (id_user, kind, notice_key)
);

CREATE INDEX IF NOT EXISTS idx_ai_unavailable_notices_sent ON ai_unavailable_notices (last_sent_at);

COMMENT ON TABLE ai_unavailable_notices IS
  'Moc thong bao khi AI khong tra loi duoc: owner_email (email bao chu, cooldown 24h) va visitor_apology (cau xin loi cho khach, cooldown 6h). Xem services/chatbot/aiUnavailableNotice.service.js.';
