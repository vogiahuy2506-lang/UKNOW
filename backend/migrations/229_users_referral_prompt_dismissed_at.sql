-- Migration 229: Ghi nhận người dùng đã "Bỏ qua" bước nhập mã giới thiệu lúc đăng ký
-- Luật sếp (note 19/09/2026): khi vào hiện bảng nhập mã giới thiệu; bỏ qua thì thôi,
-- KHÔNG cho nhập bổ sung. Trước đây cờ bỏ qua chỉ nằm trong localStorage của trình duyệt
-- nên đổi máy trong 24h đầu vẫn được hỏi lại và vẫn gắn mã được. Cột này để server chặn.

ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_prompt_dismissed_at TIMESTAMPTZ;
