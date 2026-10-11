-- 297: landing_page_forms - bang chi muc landing <-> bieu mau, NHIEU-NHIEU (PLAN_BIEU_MAU_TUY_BIEN_AI_LANDING_2026-10-11 PR-6).
--
-- Truoc day moi landing dung 1 bieu mau (cot don forms.landing_page_id, migration 225). Nay mot landing co nhieu bieu mau
-- (tu van + dat lich + thu coc...) va mot bieu mau dung cho nhieu landing.
--
-- NGUON SU THAT cua "landing nao dang nhung bieu mau nao" van la cac khoi nhung trong HTML da luu
-- (<div data-founderai-form="KEY">). Bang nay chi la CHI MUC, duoc ghi LAI tu HTML trong cung transaction moi lan luu landing
-- (landingPageAdmin.service.js) - de truy van nguoc "landing X co nhung form nao" khong phai quet HTML.
--
--   position : thu tu xuat hien trong HTML (0 = dau tien).
--   kind     : loai bieu mau khi he thong TU TAO tu cho trong (consult|booking|payment|survey|blank); NULL = bieu mau co san
--              chu chon / du lieu cu. Dung de (a) nhac "can bo sung" cho loai payment chua khai so tien + tai khoan,
--              (b) cho trong tran (khong gia tri) tai dung lai bieu mau consult/NULL da gan thay vi de form mo coi.
--
-- forms.landing_page_id GIU lai mot dot (backfill ben duoi, code van ghi cho tuong thich) nhung code moi THOI DOC cot do;
-- cot se bi xoa o dot sau. Migration chi them bang + index + backfill, KHONG DROP gi.

CREATE TABLE IF NOT EXISTS landing_page_forms (
  landing_page_id BIGINT      NOT NULL REFERENCES landing_pages(id) ON DELETE CASCADE,
  form_id         BIGINT      NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  position        INT         NOT NULL,
  kind            VARCHAR(20),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (landing_page_id, form_id)
);

-- Tra nguoc "bieu mau nay dang nam o landing nao" (xoa form, hien 'dang dung o N trang').
CREATE INDEX IF NOT EXISTS idx_landing_page_forms_form_id ON landing_page_forms (form_id);

-- Backfill tu cot don cu: moi form dang gan 1 landing -> 1 dong, position 0 (truoc day moi landing toi da 1 form).
-- Idempotent: chay lai khong nhan doi (PK + ON CONFLICT DO NOTHING).
INSERT INTO landing_page_forms (landing_page_id, form_id, position)
SELECT f.landing_page_id, f.id, 0
FROM forms f
WHERE f.landing_page_id IS NOT NULL
ON CONFLICT (landing_page_id, form_id) DO NOTHING;
