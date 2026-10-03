-- Migration 275: index (id_user, created_at) cho zalo_personal_messages.
-- Ly do: ban tin tuan chatbot (chatbot_digest_weekly) qua 30 s va bi huy boi statement timeout,
-- vi bang co ~480k dong ma chi co index partial idx_zalo_personal_msg_quota_count
-- (WHERE role = 'agent' AND manual_inbox) nen cau role = 'visitor' phai quet toan bang.
-- Index da duoc tao truoc tren production 03/10/2026 bang cach khong khoa bang, ngoai runner;
-- o production cau nay la no-op.
CREATE INDEX IF NOT EXISTS idx_zalo_personal_msg_user_created ON zalo_personal_messages (id_user, created_at);
