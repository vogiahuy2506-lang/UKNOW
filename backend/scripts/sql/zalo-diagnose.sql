-- =============================================================================
-- CHẨN ĐOÁN LƯỢT CHẠY ZALO — CHỈ ĐỌC (SELECT), không sửa dữ liệu.
--
-- Câu hỏi: "phần mềm báo đã gửi N tin" nhưng Zalo thực tế chỉ có M tin.
--
-- CÁCH CHẠY (trên VPS, production):
--   docker exec -i uknow-campaign-backend psql -U "$DB_USER" -d "$DB_NAME" \
--     -v run_id=<ID_LUOT_CHAY> -f - < zalo-diagnose.sql
--
--   Hoặc dùng script Node (tự in bảng, tự liệt kê lượt chạy gần nhất):
--   docker exec -i uknow-campaign-backend node -r dotenv/config \
--     scripts/diagnoseZaloRun.mjs --run=<ID_LUOT_CHAY>
--
-- ĐỔI CHỖ DUY NHẤT: dòng \set run_id ở dưới.
-- =============================================================================

\set run_id 1

-- 1. LƯỢT CHẠY GẦN NHẤT — dùng id_run để chạy tiếp
SELECT
  cr.id                                                                   AS run,
  cr.id_campaign                                                          AS campaign,
  cr.status                                                               AS trang_thai,
  cr.total_recipients                                                     AS tong_nguoi_nhan,
  cr.successful_sends                                                     AS thanh_cong,
  cr.failed_sends                                                         AS loi,
  cr.skipped_sends                                                        AS bo_qua,
  cr.started_at,
  COUNT(zm.id)::int                                                       AS dong_DB,
  COUNT(zm.id) FILTER (WHERE COALESCE(NULLIF(zm.status::text,'pending'), zm.tracking_metadata->>'status') = 'sent')::int
                                                                             AS SENT_THAT
FROM campaign_runs cr
LEFT JOIN zalo_messages zm ON zm.id_run = cr.id
WHERE cr.started_at >= NOW() - INTERVAL '30 days'
GROUP BY cr.id
ORDER BY cr.id DESC
LIMIT 15;

-- 2. CÂU QUYẾT ĐỊNH — đối chiếu bộ đếm UI với số tin `sent` THẬT trong DB
--    UI_DA_GUI    = successful + failed + skipped = số "Đã gửi X/Y" mà phần mềm hiện
--    THAT_SU_SENT = số tin trong zalo_messages được ghi status='sent' (có msgId hợp lệ)
--    CHENH_LECH   = UI_DA_GUI - THAT_SU_SENT
SELECT
  cr.id                                                                   AS run,
  cr.status                                                               AS trang_thai,
  cr.total_recipients                                                     AS tong_nguoi_nhan,
  cr.successful_sends                                                     AS ui_thanh_cong,
  cr.failed_sends                                                         AS ui_loi,
  cr.skipped_sends                                                        AS ui_bo_qua,
  (cr.successful_sends + cr.failed_sends + cr.skipped_sends)               AS UI_DA_GUI,
  COUNT(zm.id) FILTER (WHERE COALESCE(NULLIF(zm.status::text,'pending'), zm.tracking_metadata->>'status') = 'sent')::int
                                                                             AS THAT_SU_SENT,
  (cr.successful_sends + cr.failed_sends + cr.skipped_sends)
    - COUNT(zm.id) FILTER (WHERE COALESCE(NULLIF(zm.status::text,'pending'), zm.tracking_metadata->>'status') = 'sent')::int
                                                                             AS CHENH_LECH,
  cr.started_at
FROM campaign_runs cr
LEFT JOIN zalo_messages zm ON zm.id_run = cr.id
WHERE cr.id = :run_id
GROUP BY cr.id;

-- 3. NGUYÊN NHÂN LỖI CHIẾM ĐA SỐ — quyết định vấn đề là #1 hay #2
SELECT
  COALESCE(zm.tracking_metadata->>'errorCategory', '(khong phan loai)')  AS error_category,
  LEFT(COALESCE(NULLIF(BTRIM(zm.tracking_metadata->>'errorLabel'), ''),
                 NULLIF(BTRIM(zm.tracking_metadata->>'error'), ''),
                 '(trong)'), 70)                                        AS loi,
  COUNT(*)::int                                                          AS so
FROM zalo_messages zm
WHERE zm.id_run = :run_id
  AND COALESCE(NULLIF(zm.status::text,'pending'), zm.tracking_metadata->>'status') IN ('failed','partial')
GROUP BY 1, 2
ORDER BY so DESC
LIMIT 15;

-- 4. THEO TÀI KHOẢN ZALO — đối chiếu ngưỡng cảnh báo
--    (deliveryMonitorSignals.util.js: mặc định minAttempts=10, minRate=30%, critical=50%)
SELECT
  zm.account_id,
  MAX(NULLIF(BTRIM(COALESCE(zm.account_name,'')), ''))                     AS ten,
  COUNT(*)::int                                                            AS attempts,
  COUNT(*) FILTER (WHERE zm.tracking_metadata->>'errorCategory' = 'ZALO_SILENT_DROP')::int
                                                                              AS silent_drops,
  COUNT(*) FILTER (WHERE COALESCE(NULLIF(zm.status::text,'pending'), zm.tracking_metadata->>'status') = 'sent')::int
                                                                              AS sent,
  ROUND(100.0 * COUNT(*) FILTER (WHERE zm.tracking_metadata->>'errorCategory' = 'ZALO_SILENT_DROP')
        / NULLIF(COUNT(*), 0), 1)                                           AS pct_silent,
  CASE
    WHEN COUNT(*) >= 10
     AND COUNT(*) FILTER (WHERE zm.tracking_metadata->>'errorCategory' = 'ZALO_SILENT_DROP')::numeric
         / NULLIF(COUNT(*), 0) >= 0.3
    THEN 'CO CANH BAO (>=30% va >=10 luot)' ELSE 'duoi nguong canh bao'
  END                                                                      AS trang_thai_canh_bao
FROM zalo_messages zm
WHERE zm.id_run = :run_id
  AND zm.account_id IS NOT NULL
  AND NOT COALESCE(zm.is_preview, FALSE)
GROUP BY zm.account_id
ORDER BY attempts DESC;

-- 5. TỪNG NGƯỜI NHẬN — để đối chiếu THỦ CÔNG với Zalo app
--    (mở Zalo, xem tin nào thật sự tới → so với cột status ở đây)
SELECT
  zm.id,
  zm.channel,
  COALESCE(zm.recipient_value, zm.group_id, zm.uid, '(trong)')  AS nguoi_nhan,
  COALESCE(NULLIF(zm.status::text,'pending'), zm.tracking_metadata->>'status') AS status,
  COALESCE(zm.tracking_metadata->>'errorCategory', '')           AS errorCategory,
  LEFT(COALESCE(zm.tracking_metadata->>'errorLabel', zm.tracking_metadata->>'error', ''), 60) AS loi,
  zm.sent_at
FROM zalo_messages zm
WHERE zm.id_run = :run_id
ORDER BY zm.id
LIMIT 300;

-- =============================================================================
-- CÁCH ĐỌC KẾT QUẢ:
--
--   UI_DA_GUI >> THAT_SU_SENT  ->  VẤN ĐỀ #1.
--       Phần mềm cộng cả tin lỗi / bỏ qua vào ô "Đã gửi X/Y"
--       (campaignRun.service.js: successfulSends + failedSends + skippedSends).
--       Sửa: tách bộ đếm hiển thị.
--
--   UI_DA_GUI ~ THAT_SU_SENT  ->  VẤN ĐỀ #2.
--       Phần mềm ghi "sent" (có msgId hợp lệ) nhưng Zalo không có tin.
--       Hệ thống KHÔNG có bước xác nhận giao thật nào — chỉ đọc msgId API trả về.
--       Xem mục 3 (nguyên nhân lỗi) + mục 4 (silent-drop theo tài khoản) để định vị.
--
--   Mục 3 trả về 'ZALO_SILENT_DROP' chiếm đa số -> Zalo im lặng chặn ở tầng
--   không quan sát được. Mục 4 cho biết tài khoản nào bị.
-- =============================================================================
