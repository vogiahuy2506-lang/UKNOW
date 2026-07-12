-- Migration: 088 — Persist AI campaign wizard state per chat session.
-- Trạng thái wizard (kênh, tài khoản gửi, nguồn dữ liệu, link Sheet, lịch, duyệt kế hoạch)
-- và tiến độ content plan trước đây được suy ngược từ chat history ([wizard]{...} markers)
-- và React state phía client — mất khi session reload. Lưu bản chuẩn server-side.
-- Shape: { v: 1, gates: {...}, plan: {...}, meta: {...} } — xem aiCampaignWizard.service.js.

ALTER TABLE ai_chat_sessions
  ADD COLUMN IF NOT EXISTS wizard_state JSONB;
