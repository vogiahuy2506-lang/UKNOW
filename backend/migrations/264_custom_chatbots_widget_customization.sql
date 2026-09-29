-- Migration 264: tuy chinh Giao dien Widget chay that (PLAN_TUY_CHINH_WIDGET_THAT_2026-09-29)
-- widget_auto_open: Chat Widget tu mo sau 2 giay (moi phien trinh duyet 1 lan).
-- embed_show_header: an/hien thanh header tren trang /chat/:id (iFrame + Public Link).
-- embed_size: chieu cao ma nhung iFrame (small 480 / medium 600 / large 760).
ALTER TABLE custom_chatbots
  ADD COLUMN IF NOT EXISTS widget_auto_open BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS embed_show_header BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS embed_size VARCHAR(10) NOT NULL DEFAULT 'medium'
    CHECK (embed_size IN ('small', 'medium', 'large'));
