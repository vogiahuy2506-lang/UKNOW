-- Migration 240: Backfill dữ liệu cũ theo lô từ campaigns vào email_messages và zalo_messages.
-- QUYẾT ĐỊNH QUAN TRỌNG: Chỉ backfill từ campaigns. Dòng nào không suy ra được chủ
-- (ví dụ thư hệ thống không gắn campaign) thì GIỮ NGUYÊN NULL để không làm tăng vọt hạn mức của khách.
-- Tách riêng khỏi Migration 239 để chạy trong transaction độc lập, không giữ khóa ACCESS EXCLUSIVE.

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
      SET workspace_owner_id = COALESCE(c.workspace_owner_id, c.id_user)
      FROM campaigns c
      WHERE c.id = em.id_campaign
        AND em.workspace_owner_id IS NULL
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
      SET workspace_owner_id = COALESCE(c.workspace_owner_id, c.id_user)
      FROM campaigns c
      WHERE c.id = zm.id_campaign
        AND zm.workspace_owner_id IS NULL
        AND zm.id BETWEEN v_cur_id AND (v_cur_id + v_batch_size - 1);

      v_cur_id := v_cur_id + v_batch_size;
    END LOOP;
  END IF;
END $$;
