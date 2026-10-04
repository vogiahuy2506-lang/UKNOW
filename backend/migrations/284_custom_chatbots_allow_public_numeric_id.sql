-- Migration 284: custom_chatbots.allow_public_numeric_id - chi chatbot DANG CO moi con chat cong khai duoc theo id so
-- (PLAN_SUA_AI_DOT4_PR5_CHAT_CONG_KHAI_2026-10-04; ma ra soat A P1-5).
--
-- Truoc day trang /chat/<id> va POST /api/chatbot-public/custom-chatbot/id/<id>/chat nhan id so tuan tu: ai lap id 1..N cung
-- chat duoc voi MOI chatbot dang hoat dong (ke ca bot chi gan Zalo) va dot credit cua chu. Tu nay id so chi khop khi cot nay
-- = true; con lai chi tra cuu theo widget_key (khong doan duoc).
--
--   true  : chatbot da ton tai luc migrate - iFrame / link /chat/<id> da dan tren site khach van chay (khong duoc tat)
--   false : chatbot tao SAU migration (mac dinh) - chi chat cong khai qua widget_key
--
-- Backfill (true cho moi hang dang co) CHI chay khi cot vua duoc them: chay lai migration KHONG bat lai id so cho
-- chatbot moi tao sau do (cung tinh than migration 257 / 283). Khong DROP, khong SET NOT NULL tren cot cu.

DO $$
DECLARE
  column_existed boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'custom_chatbots'
      AND column_name = 'allow_public_numeric_id'
  ) INTO column_existed;

  IF NOT column_existed THEN
    ALTER TABLE custom_chatbots
      ADD COLUMN allow_public_numeric_id BOOLEAN NOT NULL DEFAULT false;

    UPDATE custom_chatbots SET allow_public_numeric_id = true;
  END IF;
END
$$;
