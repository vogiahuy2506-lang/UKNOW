-- Migration 222: Nhãn kêu gọi mở chat trên widget web (script embed), mặc định TẮT
-- NULL = giữ hành vi hiện tại (chỉ nút tròn). Chủ chatbot nhập nhãn thì widget.js mới
-- vẽ thêm viên nhãn cạnh bong bóng. Xem _internal/PLAN_NHAN_NUT_MO_CHAT_WIDGET_2026-09-15.md.
ALTER TABLE custom_chatbots
  ADD COLUMN IF NOT EXISTS launcher_label VARCHAR(40) DEFAULT NULL;
