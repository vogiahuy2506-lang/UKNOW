-- 285: so ghi BEN cac lan goi AI thanh / bai (PLAN_SUA_AI_DOT4_PR10_DO_LOI_AI_BEN - D-15, B-8, A P2-10, C P2-2).
--
-- Truoc day loi AI chi nam trong console.* / docker log, ma log bi xoa moi lan deploy: khong ai biet ti le loi Gemini, so lan chuyen
-- model du phong, AI_PROVIDER_BUSY, ghi usage hong, luot landing bi huy vi khach dong tab, luot tro ly loi. Canh bao duy nhat
-- ai_cost_spike do tong token (gom ca embedding) nen khong thay duoc cac so tren.
--
-- Mot dong = mot SU KIEN, thuoc mot trong hai tang (cot layer):
--   * 'gemini' - mot lan goi that toi Google (loi generateContent hoac embedding): ok / error / busy / timeout / fallback_ok /
--                client_closed / blocked. Ti le loi va so lan chuyen du phong CHI dem tang nay (moi lan goi dung mot dong).
--   * 'app'    - su kien cua ung dung (luot landing, luot tro ly, ghi usage hong...): khong phai mot lan goi toi Google nen KHONG
--                vao mau/tu so ti le loi (neu khong mot loi Google se bi dem hai lan: o tang goi va o tang luot).
--
-- KHONG ghi noi dung prompt / cau tra loi / thong tin ca nhan vao meta: chi so dem, id, ma (service ep lai khi ghi).
-- owner_user_id / actor_user_id KHONG co khoa ngoai: day la so quan sat, khong duoc chan viec xoa nguoi dung va khong duoc loi chen
-- khi dong users da mat. Luot khong co chu (khach vang lai chat trang chu) de NULL. Giu 30 ngay (cron data_retention_cleanup).
-- Chi CREATE, khong DROP/ALTER cot cu.

CREATE TABLE IF NOT EXISTS ai_call_events (
  id            BIGSERIAL    PRIMARY KEY,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  owner_user_id BIGINT       NULL,
  actor_user_id BIGINT       NULL,
  layer         VARCHAR(10)  NOT NULL DEFAULT 'gemini',
  feature       VARCHAR(60)  NOT NULL,
  model         VARCHAR(80)  NULL,
  outcome       VARCHAR(20)  NOT NULL,
  http_status   INTEGER      NULL,
  error_code    VARCHAR(60)  NULL,
  duration_ms   INTEGER      NULL,
  meta          JSONB        NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_ai_call_events_created ON ai_call_events (created_at);
CREATE INDEX IF NOT EXISTS idx_ai_call_events_feature_created ON ai_call_events (feature, created_at);

COMMENT ON TABLE ai_call_events IS
  'So ghi ben cac lan goi AI (layer gemini = goi that toi Google; layer app = su kien ung dung). outcome: ok, error, busy, timeout, fallback_ok, parse_failed, client_closed, blocked. Khong chua noi dung prompt/tra loi. Giu 30 ngay. Xem services/ai/aiCallEvents.service.js.';
