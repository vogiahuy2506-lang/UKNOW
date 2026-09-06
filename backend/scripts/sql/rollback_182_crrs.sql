-- ==============================================================================
-- RUNBOOK SCRIPT: DISASTER RECOVERY ROLLBACK MIGRATION 182
-- File: backend/scripts/sql/rollback_182_crrs.sql
-- Mục đích: Hoàn nguyên khẩn cấp migration 182 (gỡ bỏ index, phục hồi duplicate rows)
--           dành riêng cho cửa sổ bảo trì / sự cố dữ liệu preflight.
--
-- LƯU Ý QUAN TRỌNG:
-- 1. Nếu chỉ rollback phiên bản ứng dụng (application revision), KHÔNG CHẠY script này!
--    Theo Mục 13 của Plan ("Schema là additive"), ứng dụng tại revision bridge tương
--    thích (commit/tag bridge SẠCH được release gần nhất — xem registry digest ghi
--    trong runbook triển khai, KHÔNG dùng lại một tag bridge cũ nếu đã có bridge mới
--    hơn thay thế nó) hoàn toàn khớp 100% với full unique index uq_crrs_progress mà
--    không gặp lỗi 42P10.
--    Quy trình chuẩn:
--    - Merge bridge commit sạch (migration 182 + hardening hiện hành) vào main trước,
--      deploy riêng, ghi lại registry digest thực tế;
--    - Sau đó deploy PR-Q4c; khi rollback Q4c, tạo revert commit cho PR-Q4c trên main.
--    - Nếu hot-swap trực tiếp trên VPS, chạy: bash backend/scripts/ops/hot_swap_rollback.sh [IMAGE]
--    TUYỆT ĐỐI KHÔNG DROP INDEX, KHÔNG PHỤC HỒI DUPLICATE.
-- 2. Chỉ chạy script này khi cần khôi phục lại dữ liệu duplicate gốc trong cửa sổ sự cố.
--
-- CẢNH BÁO TRẠNG THÁI DB SAU ROLLBACK & PHA FORWARD RECOVERY BẮT BUỘC:
-- - Khi script này chạy xong: unique index uq_crrs_progress bị drop và các duplicate rows được phục hồi.
-- - TẠI THỜI ĐIỂM NÀY, CẢ PHIÊN BẢN ỨNG DỤNG CŨ VÀ MỚI ĐỀU KHÔNG THỂ GHI TIẾN ĐỘ
--   vì câu lệnh ON CONFLICT (id_run, id_node, channel, recipient_key) sẽ lỗi 42P10
--   do thiếu unique arbiter index!
-- - BẮT BUỘC TIẾN HÀNH PHA FORWARD RECOVERY TRƯỚC KHI MỞ LẠI TRAFFIC:
--   1. TIẾP TỤC ĐÓNG CHẶT write traffic và workers. Tuyệt đối không khởi động workers!
--   2. Triển khai migration sửa lỗi (số migration kế tiếp chưa dùng tại thời điểm
--      triển khai — chạy `ls backend/migrations | tail -3` để lấy số đúng, KHÔNG
--      đóng đinh một số cố định vì các migration khác có thể đã chiếm số đó) tái lập
--      unique arbiter sau khi fix root cause
--      hoặc deploy binary chuyên dụng không phụ thuộc ON CONFLICT.
--      TUYỆT ĐỐI KHÔNG rerun nguyên văn migration 182 nếu chính migration 182 là nguyên nhân sự cố!
--   3. Tái lập unique arbiter và kiểm tra schema parity (npm run check:schema).
--   4. Chỉ sau khi schema có unique arbiter và kiểm tra sạch, mới mở lại traffic và start workers.
--
-- CÁCH CHẠY BẰNG PSQL (PSQL CLI ONLY):
--   psql -v target_batch_id=<uuid> -f backend/scripts/sql/rollback_182_crrs.sql
--   (Lưu ý: KHÔNG bọc <uuid> trong dấu nháy; cú pháp :'target_batch_id' của psql sẽ tự động single-quote giá trị)
-- ==============================================================================

\set ON_ERROR_STOP on
BEGIN;

-- B1. Thiết lập lock timeout và statement timeout an toàn
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '30s';

-- B2. Khóa bảng chống race condition với workers/clients
LOCK TABLE campaign_run_recipient_steps IN ACCESS EXCLUSIVE MODE;

-- Gán target_batch_id vào session variable nếu truyền qua psql -v target_batch_id=...
\if :{?target_batch_id}
  SET LOCAL uknow.target_batch_id = :'target_batch_id';
\endif

DO $$
DECLARE
  v_batch_str TEXT;
  v_batch_id UUID;
  v_batch_count INTEGER;
  v_invalid_groups INTEGER;
  v_missing_survivors INTEGER;
  v_multiple_survivors INTEGER;
  v_replacement_survivors INTEGER;
  v_mutated_survivors INTEGER;
BEGIN
  -- B3. Kiểm tra target_batch_id được cung cấp và là UUID hợp lệ
  v_batch_str := NULLIF(TRIM(current_setting('uknow.target_batch_id', true)), '');
  IF v_batch_str IS NULL THEN
    RAISE EXCEPTION 'Rollback bị từ chối: Chưa cung cấp target_batch_id. Vui lòng truyền biến psql -v target_batch_id=<uuid> -f backend/scripts/sql/rollback_182_crrs.sql';
  END IF;

  -- Defense-in-depth: loại bỏ dấu nháy đơn hoặc nháy kép nếu operator vô tình truyền thừa
  v_batch_str := TRIM(BOTH '"' FROM TRIM(BOTH '''' FROM v_batch_str));

  BEGIN
    v_batch_id := v_batch_str::uuid;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Rollback bị từ chối: target_batch_id không phải là UUID hợp lệ: %', v_batch_str;
  END;

  -- B4. Kiểm tra batch tồn tại và có dữ liệu backup (>0 rows)
  SELECT COUNT(*) INTO v_batch_count
  FROM campaign_run_recipient_steps_backup_182
  WHERE migration_batch_id = v_batch_id;

  IF v_batch_count = 0 THEN
    RAISE EXCEPTION 'Rollback bị từ chối: Không tìm thấy bản ghi backup nào với target_batch_id = %. Kiểm tra lại migration_batch_id!', v_batch_id;
  END IF;

  -- B5. MUTATED SURVIVOR GUARD THEO LOGICAL KEY:
  -- Kiểm tra từng nhóm logical key (id_run, id_node, channel, recipient_key) trong batch backup:
  -- - Phải có đúng 1 live survivor (live_count = 1). Nếu 0: survivor bị xóa; nếu > 1: trùng lặp mới.
  -- - ID của live survivor phải thuộc tập source_id của batch (chống replacement row).
  -- - Survivor chưa có tiến độ mới sau thời điểm backup (updated_at <= max_backed_up_at).
  SELECT
    COUNT(*) AS invalid_groups,
    COALESCE(SUM(CASE WHEN live_count = 0 THEN 1 ELSE 0 END), 0) AS missing_survivors,
    COALESCE(SUM(CASE WHEN live_count > 1 THEN 1 ELSE 0 END), 0) AS multiple_survivors,
    COALESCE(SUM(CASE WHEN has_replacement THEN 1 ELSE 0 END), 0) AS replacement_survivors,
    COALESCE(SUM(CASE WHEN has_mutated THEN 1 ELSE 0 END), 0) AS mutated_survivors
  INTO
    v_invalid_groups,
    v_missing_survivors,
    v_multiple_survivors,
    v_replacement_survivors,
    v_mutated_survivors
  FROM (
    SELECT
      b_keys.id_run,
      b_keys.id_node,
      b_keys.channel,
      b_keys.recipient_key,
      COUNT(crrs.id) AS live_count,
      COALESCE(BOOL_OR(crrs.id IS NOT NULL AND crrs.id NOT IN (
        SELECT source_id FROM campaign_run_recipient_steps_backup_182 WHERE migration_batch_id = v_batch_id
      )), FALSE) AS has_replacement,
      COALESCE(BOOL_OR(crrs.updated_at > b_keys.max_backed_up_at), FALSE) AS has_mutated
    FROM (
      SELECT
        (source_row->>'id_run')::bigint AS id_run,
        source_row->>'id_node' AS id_node,
        source_row->>'channel' AS channel,
        source_row->>'recipient_key' AS recipient_key,
        MAX(backed_up_at) AS max_backed_up_at
      FROM campaign_run_recipient_steps_backup_182
      WHERE migration_batch_id = v_batch_id
      GROUP BY
        (source_row->>'id_run')::bigint,
        source_row->>'id_node',
        source_row->>'channel',
        source_row->>'recipient_key'
    ) b_keys
    LEFT JOIN campaign_run_recipient_steps crrs
      ON crrs.id_run = b_keys.id_run
     AND crrs.id_node = b_keys.id_node
     AND crrs.channel = b_keys.channel
     AND crrs.recipient_key = b_keys.recipient_key
    GROUP BY
      b_keys.id_run,
      b_keys.id_node,
      b_keys.channel,
      b_keys.recipient_key,
      b_keys.max_backed_up_at
    HAVING COUNT(crrs.id) <> 1
        OR COALESCE(BOOL_OR(crrs.id IS NOT NULL AND crrs.id NOT IN (
             SELECT source_id FROM campaign_run_recipient_steps_backup_182 WHERE migration_batch_id = v_batch_id
           )), FALSE)
        OR COALESCE(BOOL_OR(crrs.updated_at > b_keys.max_backed_up_at), FALSE)
  ) invalid_check;

  IF v_invalid_groups > 0 THEN
    RAISE EXCEPTION 'Rollback bị từ chối: Phát hiện % nhóm logical key không hợp lệ (missing=%, multiple=%, replacement=%, mutated=% tiến độ live). Bắt buộc dùng Forensic Reconciliation thay vì destructive rollback để tránh mất dữ liệu live.',
      v_invalid_groups, v_missing_survivors, v_multiple_survivors, v_replacement_survivors, v_mutated_survivors;
  END IF;

  -- B6. Drop full unique index để cho phép lưu lại các dòng trùng lặp ban đầu
  DROP INDEX IF EXISTS uq_crrs_progress;

  -- B7. Xóa survivor rows đã được gộp trong đợt migration tương ứng
  DELETE FROM campaign_run_recipient_steps
  WHERE id IN (
    SELECT source_id
    FROM campaign_run_recipient_steps_backup_182
    WHERE migration_batch_id = v_batch_id
  );

  -- B8. Phục hồi toàn bộ duplicate rows ban đầu với đầy đủ 15 cột production
  INSERT INTO campaign_run_recipient_steps (
    id, id_run, id_campaign, id_node, channel, recipient_key,
    last_completed_step, is_fully_completed, meta, last_sent_at,
    created_at, first_seen_at, first_step_sent_at, next_due_at, updated_at
  )
  SELECT
    (source_row->>'id')::bigint,
    (source_row->>'id_run')::bigint,
    (source_row->>'id_campaign')::bigint,
    source_row->>'id_node',
    source_row->>'channel',
    source_row->>'recipient_key',
    (source_row->>'last_completed_step')::int,
    (source_row->>'is_fully_completed')::boolean,
    (source_row->'meta')::jsonb,
    (source_row->>'last_sent_at')::timestamptz,
    COALESCE((source_row->>'created_at')::timestamptz, NOW()),
    (source_row->>'first_seen_at')::timestamptz,
    (source_row->>'first_step_sent_at')::timestamptz,
    (source_row->>'next_due_at')::timestamptz,
    COALESCE((source_row->>'updated_at')::timestamptz, NOW())
  FROM campaign_run_recipient_steps_backup_182
  WHERE migration_batch_id = v_batch_id;

  -- B9. Bảo toàn sequence: KHÔNG BAO GIỜ hạ sequence xuống thấp hơn giá trị đã cấp
  PERFORM setval(
    pg_get_serial_sequence('campaign_run_recipient_steps', 'id'),
    GREATEST(
      (SELECT last_value FROM campaign_run_recipient_steps_id_seq),
      COALESCE((SELECT MAX(id) FROM campaign_run_recipient_steps), 1)
    )
  );

  -- B10. Xử lý migration tracking: Xóa bản ghi 182 khỏi schema_migrations nếu bảng tồn tại
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'schema_migrations') THEN
    DELETE FROM schema_migrations WHERE filename = '182_ensure_crrs_unique_progress_index.sql';
  END IF;
END $$;

COMMIT;
