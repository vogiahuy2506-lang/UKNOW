-- PR-12 (PLAN_SO_LIEU_DUNG_GON_KHOP_2026-09-30, audit_ai.md C-4) - ghi usage cho loi goi AI KHONG co chu tai khoan.
--
-- Khach vang lai o chat tu van trang chu va tro giup chua dang nhap goi Gemini (Google tinh tien) nhung khong co user nao de gan:
-- `aiUsageMeter.record` truoc day `return` som khi userId rong nen trang Chi phi AI thap hon hoa don. Tu nay ghi dong `ai_token`
-- voi id_user = NULL (chi phi he thong, khong thuoc khach nao).
--
-- Chi NOI rang buoc (khong mat du lieu, khong ghi lai bang): DROP NOT NULL chi doi metadata catalog, khong quet/viet lai bang.
-- Khoa ngoai `REFERENCES users(id) ON DELETE CASCADE` GIU NGUYEN: dong co id_user that van bi xoa theo user nhu cu; dong NULL
-- khong tro toi user nao nen khong bi cascade (ton tai sau khi bat ky user nao bi xoa - dung y: chi phi da tra Google).
-- Backend cu (dang phuc vu luc deploy) chi ghi id_user co gia tri nen khong bi anh huong.

ALTER TABLE usage_logs ALTER COLUMN id_user DROP NOT NULL;
