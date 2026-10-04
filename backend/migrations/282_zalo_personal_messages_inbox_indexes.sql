-- Migration 282: 2 index cho Hop thu tren zalo_personal_messages (~488k dong, 520 MB tren production).
-- Ly do (RA_SOAT_3_MAN H-06): bang chi co index (id_conversation) nen "tin cuoi" cua mot hoi thoai phai doc va sap
-- toan bo tin cua no, va dem "tin khach chua doc" phai quet het tin cua hoi thoai (nhom co hang chuc nghin tin).
--  1. (id_conversation, created_at DESC, id DESC): tin cuoi = 1 lan doc index; phan trang khung doc theo (created_at, id)
--     cung dung no. Giong idx_webchat_messages_conv_created / idx_channel_messages_conv_created (migration 058).
--  2. (id_conversation) WHERE role = 'visitor' AND is_read = false: dem chua doc chi di qua dung cac tin chua doc.
-- Bang lon: tao truoc tren production bang CREATE INDEX CONCURRENTLY, ngoai runner (runner boc transaction nen khong
-- chay duoc CONCURRENTLY; CI chan tu khoa nay trong file migration) - khi do 2 cau duoi la no-op. Xem migration 275.
CREATE INDEX IF NOT EXISTS idx_zalo_personal_msg_conv_created ON zalo_personal_messages (id_conversation, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_zalo_personal_msg_conv_unread ON zalo_personal_messages (id_conversation) WHERE role = 'visitor' AND is_read = false;
