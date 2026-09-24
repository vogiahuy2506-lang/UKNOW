-- Migration 242: Backfill actor_user_id theo lô từ campaigns.created_by vào email_messages và zalo_messages.
-- QUYẾT ĐỊNH QUAN TRỌNG: Chỉ backfill từ campaigns.created_by. Dòng nào không suy ra được
-- (ví dụ chiến dịch không có created_by, hoặc thư gửi không gắn campaign) thì GIỮ NGUYÊN NULL,
-- không đoán để không làm tăng vọt hạn mức nhân viên của khách.
-- Tách riêng khỏi Migration 241 để chạy trong transaction độc lập, không giữ khóa ACCESS EXCLUSIVE.

DO $$
DECLARE
  v_min_id BIGINT;
  v_max_id BIGINT;
  v_cur_id BIGINT;
  v_batch_size CONSTANT BIGINT := 10000;
BEGIN
  -- 1. Backfill email_messages
  SELECT MIN(id), MAX(id) INTO v_min_id, v_max_id FROM email_messages;
  IF v_min_id IS NOT NULL AND v_max_id IS NOT NULL THEN
    v_cur_id := v_min_id;
    WHILE v_cur_id <= v_max_id LOOP
      UPDATE email_messages em
      SET actor_user_id = c.created_by
      FROM campaigns c
      WHERE c.id = em.id_campaign
        AND c.created_by IS NOT NULL
        AND em.actor_user_id IS NULL
        AND em.id BETWEEN v_cur_id AND (v_cur_id + v_batch_size - 1);

      v_cur_id := v_cur_id + v_batch_size;
    END LOOP;
  END IF;

  -- 2. Backfill zalo_messages
  SELECT MIN(id), MAX(id) INTO v_min_id, v_max_id FROM zalo_messages;
  IF v_min_id IS NOT NULL AND v_max_id IS NOT NULL THEN
    v_cur_id := v_min_id;
    WHILE v_cur_id <= v_max_id LOOP
      UPDATE zalo_messages zm
      SET actor_user_id = c.created_by
      FROM campaigns c
      WHERE c.id = zm.id_campaign
        AND c.created_by IS NOT NULL
        AND zm.actor_user_id IS NULL
        AND zm.id BETWEEN v_cur_id AND (v_cur_id + v_batch_size - 1);

      v_cur_id := v_cur_id + v_batch_size;
    END LOOP;
  END IF;
END $$;
