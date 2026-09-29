-- Migration 261: Cong tac bat/tat tra loi tung chatbot (PLAN_CONG_TAC_TRANG_THAI_CHATBOT_2026-09-29 PR-2)
-- true (mac dinh) = chatbot tu tra loi nhu cu; false = moi kenh im lang, tin khach van vao Lich su tro chuyen.
-- KHONG dung custom_chatbots.is_active: do la co xoa mem.
ALTER TABLE custom_chatbots
  ADD COLUMN IF NOT EXISTS replies_enabled BOOLEAN NOT NULL DEFAULT true;
