-- Migration 182: Đảm bảo tồn tại full unique index uq_crrs_progress cho campaign_run_recipient_steps
-- Hỗ trợ câu lệnh ON CONFLICT (id_run, id_node, channel, recipient_key) trong recipientLedger.repository.js

-- 0. Khóa bảng chống race condition với container production cũ và tránh treo vô hạn (P2)
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '30s';
LOCK TABLE campaign_run_recipient_steps IN SHARE ROW EXCLUSIVE MODE;

-- 1. Định nghĩa bảng backup schema cố định cho mọi môi trường (Option A - Schema Parity)
-- RUNBOOK VẬN HÀNH & PII RETENTION GOVERNANCE:
-- - Owner: Platform / Database Engineering (phuong.doan / Lead DB).
-- - Mục đích: Lưu trữ snapshot nguyên vẹn (lossless source_row JSONB) các duplicate rows trước khi deduplicate.
-- - Quy ước quyền truy cập (Access Convention):
--     Hạ tầng UKNOW hiện dùng chung một database role (DB_USER) cho cả migration runner (migrate.js)
--     và application runtime (database.js). Do đó, việc giới hạn truy cập là quy ước kiến trúc mã nguồn
--     (Source Code Architectural Convention) — tuyệt đối không tạo repository/service query tới bảng này từ src/.
--     Nếu hạ tầng sau này phân tách roles, thực hiện:
--     REVOKE ALL ON campaign_run_recipient_steps_backup_182 FROM uknow_app;
-- - Tối thiểu hóa PII: Bảng backup không lưu recipient_key ở cột riêng nhằm tránh nhân bản PII (SĐT/email)
--     dạng plain text ra cột phụ; toàn bộ dữ liệu 15 cột được đóng gói nguyên vẹn trong source_row JSONB.
-- - Thời hạn lưu trữ tối đa (Retention SLA): 30 ngày kể từ ngày deploy migration 182 trên production.
-- - Lệnh kiểm tra trước khi dọn dẹp:
--     SELECT migration_batch_id, COUNT(*), MIN(backed_up_at), MAX(backed_up_at)
--     FROM campaign_run_recipient_steps_backup_182 GROUP BY migration_batch_id;
--
-- - QUY TRÌNH ROLLBACK VẬN HÀNH:
--   A. ROLLBACK ỨNG DỤNG TIÊU CHUẨN (STANDARD APPLICATION ROLLBACK - ZERO DB DOWNTIME):
--      Tuân thủ nguyên tắc cốt lõi tại Mục 13 của Plan: "Schema là additive nên rollback ứng dụng không drop table/column".
--      QUY TRÌNH ROLLOUT & ROLLBACK CHUẨN:
--      1. Trước khi deploy PR-Q4c: Merge một compatibility bridge commit SẠCH (chứa
--         migration 182, bootstrap full index, recipientLedger terminal hardening và
--         mọi hardening cache/readiness hiện hành tại thời điểm release — KHÔNG dùng
--         lại tag bridge cũ nếu đã có commit mới sau nó) vào main và deploy độc lập
--         lên production qua CI/CD.
--         - Docker image của bridge: ${DOCKERHUB_USERNAME}/uknow-backend@sha256:<digest>
--           (image tag commit SHA được CI build sau khi push bridge lên main; ghi lại
--           registry digest thực tế vào runbook trước khi dùng làm mốc rollback).
--      2. Sau đó commit và deploy phần còn lại của PR-Q4c (atomic quota reservation engine) lên main.
--      3. Khi cần rollback PR-Q4c:
--         - Đường 1 (CI/CD Chuẩn): Tạo REVERT COMMIT cho riêng commit PR-Q4c trên main (git revert <commit_q4c_sha>).
--           Do bridge đã nằm trong lịch sử main từ trước, revert commit sẽ hoàn nguyên quota logic
--           nhưng VẪN GIỮ migration 182 và recipientLedger hardening. Bước `node scripts/migrate.js`
--           trên CI/CD chạy thành công 100% (0 pending, 0 missing) và container swap an toàn.
--         - Đường 2 (Hot-swap Khẩn cấp trên VPS):
--           Chạy script chuẩn hóa đã đóng gói đầy đủ cờ production và cơ chế auto-recovery:
--             bash backend/scripts/ops/hot_swap_rollback.sh [IMAGE_OR_DIGEST]
--           (Preflights nghiêm ngặt, standby container bảo toàn trạng thái, tự động phục hồi nếu healthcheck đỏ).
--      4. KHÔNG THỰC HIỆN ROLLBACK DATABASE, KHÔNG DROP INDEX VÀ KHÔNG PHỤC HỒI DUPLICATE!
--         Ứng dụng chạy an toàn trên full unique index uq_crrs_progress, không phát sinh lỗi 42P10
--         và không bị nhân đôi dữ liệu duplicate.
--
--   B. HOÀN NGUYÊN KHẨN CẤP DATABASE (DISASTER RECOVERY DB ROLLBACK - PSQL ONLY):
--      Chỉ sử dụng khi phát hiện lỗi dữ liệu nghiêm trọng phát sinh trong chính quá trình deduplication
--      của migration 182 tại cửa sổ bảo trì (chưa có traffic ghi live của worker).
--      Thực thi script độc lập qua psql CLI (lưu ý không bọc target_batch_id trong dấu nháy):
--
--      psql -v target_batch_id=<target_batch_id> -f backend/scripts/sql/rollback_182_crrs.sql
--
--      Script trên thực hiện nguyên khối (atomic transaction):
--      - Khóa bảng ACCESS EXCLUSIVE MODE và set timeouts an toàn.
--      - Kiểm tra target_batch_id tồn tại và có dữ liệu (>0 rows).
--      - Mutated Survivor Guard theo Logical Key: Abort nếu bất kỳ nhóm (id_run, id_node, channel, recipient_key)
--        nào bị thiếu survivor (bị xóa), có >1 survivor, có replacement row (ID mới), hoặc survivor đã đổi updated_at.
--      - Drop full unique index uq_crrs_progress.
--      - Xóa survivor rows của batch và phục hồi nguyên vẹn 15 cột duplicate ban đầu từ JSONB.
--      - Reset sequence với GREATEST((SELECT last_value...), COALESCE((SELECT MAX(id)...), 1)) chống sequence rewind.
--      - Xóa migration 182 khỏi schema_migrations.
--
--      CẢNH BÁO: Sau khi chạy rollback script này, DB KHÔNG CÒN unique arbiter index.
--      Nếu bật lại ứng dụng ngay, các lệnh ON CONFLICT sẽ lỗi PostgreSQL 42P10!
--      BẮT BUỘC TIẾN HÀNH PHA FORWARD RECOVERY TRƯỚC KHI MỞ LẠI TRAFFIC:
--      1. TIẾP TỤC ĐÓNG CHẶT write traffic và workers. Tuyệt đối không khởi động workers!
--      2. Triển khai migration sửa lỗi (số migration kế tiếp chưa dùng tại thời điểm
--         triển khai — chạy `ls backend/migrations | tail -3` để lấy số đúng, KHÔNG
--         đóng đinh một số cố định) hoặc binary chuyên dụng không phụ thuộc ON CONFLICT.
--         TUYỆT ĐỐI KHÔNG rerun nguyên văn migration 182 nếu chính migration 182 là nguyên nhân sự cố!
--      3. Tái lập unique arbiter index và kiểm tra schema parity (npm run check:schema).
--      4. Chỉ sau khi schema có unique arbiter và kiểm tra sạch, mới mở lại traffic và start workers.
--
-- - Quy trình Forensic Recovery (Đối chiếu điều tra độc lập mà không can thiệp bảng chính):
--     CREATE TABLE IF NOT EXISTS campaign_run_recipient_steps_forensic_<batch> AS
--     SELECT (jsonb_populate_record(null::campaign_run_recipient_steps, source_row)).*
--     FROM campaign_run_recipient_steps_backup_182
--     WHERE migration_batch_id = '<target_batch_id>';
-- - Kế hoạch dọn dẹp & Decommission:
--     Theo dõi tại task TASK-DECOMMISSION-CRRS-BACKUP-182 trong docs/PLAN_QUOTA_ATOMIC_WAVE2_2026-09-01.md
--     (deadline 30 ngày sau deploy prod; tạo migration kế tiếp chưa dùng tại thời điểm
--     triển khai — `ls backend/migrations | tail -3` — để DROP TABLE sau khi gate kiểm thử đạt).
CREATE TABLE IF NOT EXISTS campaign_run_recipient_steps_backup_182 (
  id                  BIGSERIAL PRIMARY KEY,
  migration_batch_id  UUID NOT NULL,
  source_id           BIGINT NOT NULL,
  id_run              BIGINT,
  source_row          JSONB NOT NULL,
  backed_up_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
DECLARE
  v_dup_keys INTEGER;
  v_dup_rows INTEGER;
  v_backed_up INTEGER;
  v_batch_id UUID;
  r RECORD;
  v_auth RECORD;
  v_idx RECORD;
BEGIN
  -- 2. Preflight Deduplication: Kiểm tra và gộp dữ liệu trùng lặp nếu có
  SELECT COUNT(*), COALESCE(SUM(c), 0)
  INTO v_dup_keys, v_dup_rows
  FROM (
    SELECT COUNT(*) AS c
    FROM campaign_run_recipient_steps
    WHERE id_run IS NOT NULL AND id_node IS NOT NULL AND channel IS NOT NULL AND recipient_key IS NOT NULL
    GROUP BY id_run, id_node, channel, recipient_key
    HAVING COUNT(*) > 1
  ) dups;

  IF v_dup_keys > 0 THEN
    v_batch_id := gen_random_uuid();

    -- 2a. Snapshot toàn bộ các row trùng lặp vào bảng backup (lossless)
    INSERT INTO campaign_run_recipient_steps_backup_182 (
      migration_batch_id, source_id, id_run, source_row
    )
    SELECT
      v_batch_id, crrs.id, crrs.id_run, to_jsonb(crrs.*)
    FROM campaign_run_recipient_steps crrs
    INNER JOIN (
      SELECT id_run, id_node, channel, recipient_key
      FROM campaign_run_recipient_steps
      WHERE id_run IS NOT NULL AND id_node IS NOT NULL AND channel IS NOT NULL AND recipient_key IS NOT NULL
      GROUP BY id_run, id_node, channel, recipient_key
      HAVING COUNT(*) > 1
    ) d ON crrs.id_run = d.id_run
       AND crrs.id_node = d.id_node
       AND crrs.channel = d.channel
       AND crrs.recipient_key = d.recipient_key;

    GET DIAGNOSTICS v_backed_up = ROW_COUNT;
    IF v_backed_up < v_dup_rows THEN
      RAISE EXCEPTION 'Preflight backup 182 thất bại: cần backup % rows nhưng chỉ ghi nhận % rows',
        v_dup_rows, v_backed_up;
    END IF;

    -- 1b. Authoritative Deduplication: Xác định authoritative row theo tiến độ/hoàn tất/thời gian
    FOR r IN
      SELECT id_run, id_node, channel, recipient_key
      FROM campaign_run_recipient_steps
      WHERE id_run IS NOT NULL AND id_node IS NOT NULL AND channel IS NOT NULL AND recipient_key IS NOT NULL
      GROUP BY id_run, id_node, channel, recipient_key
      HAVING COUNT(*) > 1
    LOOP
      -- Lấy row authoritative nhất trong nhóm trùng lặp
      SELECT id, last_completed_step, is_fully_completed, meta, last_sent_at, updated_at
      INTO v_auth
      FROM campaign_run_recipient_steps
      WHERE id_run = r.id_run
        AND id_node = r.id_node
        AND channel = r.channel
        AND recipient_key = r.recipient_key
      ORDER BY
        is_fully_completed DESC,
        last_completed_step DESC,
        COALESCE(last_sent_at, updated_at) DESC,
        id DESC
      LIMIT 1;

      -- Đảm bảo authoritative row giữ 100% meta và updated_at gốc (zero hybrid state)
      UPDATE campaign_run_recipient_steps
      SET
        last_completed_step = v_auth.last_completed_step,
        is_fully_completed = v_auth.is_fully_completed,
        last_sent_at = v_auth.last_sent_at,
        meta = v_auth.meta,
        updated_at = v_auth.updated_at
      WHERE id = v_auth.id;

      -- Xóa toàn bộ các dòng non-authoritative
      DELETE FROM campaign_run_recipient_steps
      WHERE id_run = r.id_run
        AND id_node = r.id_node
        AND channel = r.channel
        AND recipient_key = r.recipient_key
        AND id <> v_auth.id;
    END LOOP;
  END IF;

  -- 2. Kiểm tra catalog index: Đảm bảo index uq_crrs_progress khớp chính xác specification (P1)
  SELECT
    t.relname AS table_name,
    c.relname AS index_name,
    i.indnkeyatts,
    i.indisunique,
    i.indisvalid,
    i.indisready,
    TRIM(COALESCE(pg_get_expr(i.indpred, i.indrelid), '')) AS pred_expr,
    ARRAY(
      SELECT a.attname::text
      FROM unnest(i.indkey[0:i.indnkeyatts-1]) WITH ORDINALITY AS k(attnum, ord)
      JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum
      ORDER BY k.ord
    ) AS col_names
  INTO v_idx
  FROM pg_class c
  JOIN pg_index i ON c.oid = i.indexrelid
  JOIN pg_class t ON t.oid = i.indrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relname = 'uq_crrs_progress'
    AND n.nspname = current_schema();

  IF FOUND THEN
    -- 2a. Kiểm tra index thuộc đúng bảng
    IF v_idx.table_name <> 'campaign_run_recipient_steps' THEN
      RAISE EXCEPTION 'Index uq_crrs_progress tồn tại nhưng thuộc bảng % thay vì campaign_run_recipient_steps',
        v_idx.table_name;
    END IF;

    -- 2b. Kiểm tra tính unique, validity và readiness
    IF NOT (v_idx.indisunique AND v_idx.indisvalid AND v_idx.indisready) THEN
      RAISE EXCEPTION 'Index uq_crrs_progress tồn tại nhưng không unique, invalid hoặc not ready (indisunique=%, indisvalid=%, indisready=%)',
        v_idx.indisunique, v_idx.indisvalid, v_idx.indisready;
    END IF;

    -- 2c. Kiểm tra đúng 4 key columns theo thứ tự
    IF v_idx.indnkeyatts <> 4 OR v_idx.col_names <> ARRAY['id_run', 'id_node', 'channel', 'recipient_key'] THEN
      RAISE EXCEPTION 'Index uq_crrs_progress tồn tại nhưng sai danh sách cột: % (cần 4 cột: id_run, id_node, channel, recipient_key)',
        v_idx.col_names;
    END IF;

    -- 2d. Kiểm tra không có partial predicate (Full Unique Index hỗ trợ tương thích 2 chiều)
    IF v_idx.pred_expr <> '' THEN
      RAISE EXCEPTION 'Index uq_crrs_progress tồn tại nhưng có predicate không mong muốn: % (cần Full Unique Index không có predicate)',
        v_idx.pred_expr;
    END IF;
  ELSE
    -- Tạo full unique index nếu chưa tồn tại
    CREATE UNIQUE INDEX uq_crrs_progress
      ON campaign_run_recipient_steps(id_run, id_node, channel, recipient_key);
  END IF;
END $$;
