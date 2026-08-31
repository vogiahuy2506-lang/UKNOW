// BẮT BUỘC: script chạy độc lập với app nên không đi qua `src/index.js` — nơi duy nhất
// gọi dotenv. Thiếu dòng này thì DB_HOST rơi về mặc định 'localhost' và script chết
// ECONNREFUSED khi chạy trong container (Postgres nằm ở host 'uknow-postgres').
import 'dotenv/config';
import db from '../src/config/database.js';
import {
  buildSafeStalledRunPredicate,
  parseCleanupStalledRunArgs,
  splitCleanupStalledRunIds,
  STALLED_RUN_CLEANUP_HOURS,
} from '../src/utils/cleanupStalledRuns.util.js';

/**
 * Script dọn dẹp một lần cho các run kẹt ở trạng thái 'running' không có hoạt động trong > 48 giờ.
 *
 * VÌ SAO 48 GIỜ, KHÔNG PHẢI 24: một run im lặng KHÔNG có nghĩa là treo. Các khoảng
 * chờ hợp lệ theo thiết kế:
 *   - Đụng trần gửi email theo ngày → chờ tới lần reset kế tiếp: tối đa ~24 giờ
 *     (`assertSendQuotaOrYield` → `persistQuotaDeferYieldSlot`).
 *   - SMTP bị rate-limit → tạm dừng 12 giờ (EMAIL_RATE_LIMIT_PAUSE_MS).
 *   - Giờ yên lặng Zalo 23:00–06:00 → tới ~7 giờ.
 * Ngưỡng 24 giờ cũ có thể đóng nhầm một chiến dịch email đang chờ quota reset.
 *
 * Cách dùng:
 *   node scripts/cleanupStalledRuns.js
 *     → chỉ in các ứng viên an toàn, KHÔNG ghi DB.
 *   node scripts/cleanupStalledRuns.js --apply --ids=227,314
 *     → chỉ đóng các ID đã được người vận hành xem trước và xác nhận.
 */
const STALLED_HOURS = STALLED_RUN_CLEANUP_HOURS;
const { apply: APPLY, requestedRunIds: REQUESTED_RUN_IDS } = parseCleanupStalledRunArgs(process.argv.slice(2));

async function cleanupStalledRuns() {
  console.log(`[CleanupStalledRuns] Đang quét các run bị treo${APPLY ? ' để áp dụng thay đổi' : ' (dry-run)'}...`);

  const selectQuery = `
    SELECT
      cr.id,
      cr.id_campaign,
      cr.started_at,
      cr.total_recipients,
      cr.successful_sends,
      cr.failed_sends,
      cr.status,
      -- updated_at CHỨ KHÔNG PHẢI created_at: campaign_executions được cập nhật TẠI CHỖ
      -- theo từng node (một node gửi chạy nhiều giờ vẫn giữ nguyên created_at ban đầu).
      -- Dùng created_at sẽ coi một chiến dịch đang gửi suốt nhiều ngày là "đứng yên".
      MAX(GREATEST(ce.created_at, ce.updated_at)) AS last_execution_at
    FROM campaign_runs cr
    LEFT JOIN campaign_executions ce ON ce.id_run = cr.id
    WHERE ${buildSafeStalledRunPredicate('$1')}
    GROUP BY cr.id, cr.id_campaign, cr.started_at, cr.total_recipients, cr.successful_sends, cr.failed_sends, cr.status
    ORDER BY cr.id ASC;
  `;

  try {
    const { rows } = await db.query(selectQuery, [String(STALLED_HOURS)]);

    if (rows.length === 0) {
      console.log(`[CleanupStalledRuns] Không tìm thấy run nào bị treo quá ${STALLED_HOURS} giờ mà không có mốc chờ hợp lệ.`);
      return;
    }

    console.log(`[CleanupStalledRuns] Tìm thấy ${rows.length} run đủ điều kiện an toàn để xem xét:`);
    console.table(
      rows.map((r) => ({
        run_id: r.id,
        campaign_id: r.id_campaign,
        started_at: r.started_at,
        last_activity: r.last_execution_at || 'Không có execution',
        total_recipients: r.total_recipients,
        successful_sends: r.successful_sends,
      }))
    );

    if (!APPLY) {
      console.log(
        `\n[CleanupStalledRuns] Dry-run: CHƯA ghi DB. Sau khi xem danh sách, chạy lại với --apply --ids=${rows.map((row) => row.id).join(',')}`
      );
      return;
    }

    if (REQUESTED_RUN_IDS.length === 0) {
      throw new Error('Từ chối ghi DB: cần truyền ID đã xác nhận, ví dụ: --apply --ids=227,314');
    }

    // Re-check toàn bộ predicate trong chính UPDATE. Nếu scheduler vừa tạo execution mới
    // hoặc vừa ghi một mốc defer sau dry-run, run đó sẽ không bị đóng nhầm.
    const updateQuery = `
      UPDATE campaign_runs cr
      SET status = 'failed',
          completed_at = CURRENT_TIMESTAMP,
          error_message = $3
      WHERE cr.id = ANY($1::bigint[])
        AND ${buildSafeStalledRunPredicate('$2')}
      RETURNING id, status, completed_at, error_message;
    `;

    const updateResult = await db.query(updateQuery, [
      REQUESTED_RUN_IDS,
      String(STALLED_HOURS),
      `Lượt chạy bị bỏ rơi — không có hoạt động quá ${STALLED_HOURS} giờ (dọn dẹp thủ công).`,
    ]);
    const { closedIds, skippedIds } = splitCleanupStalledRunIds(REQUESTED_RUN_IDS, updateResult.rows);
    console.log(`[CleanupStalledRuns] ✅ Đã đóng ${updateResult.rowCount} run: ${closedIds.join(', ') || '(không có)'}.`);
    if (skippedIds.length) {
      console.log(
        `[CleanupStalledRuns] Bỏ qua ${skippedIds.join(', ')} vì không còn thỏa điều kiện an toàn (có thể đã được phục hồi).`
      );
    }
  } finally {
    // db.pool.end() chu KHONG phai db.end(): default export cua config/database.js la
    // { query, getClient, pool, withRetry, isConnectionError } — khong co ham end().
    // Moi script khac trong scripts/ deu dung db.pool.end().
    await db.pool.end();
  }
}

cleanupStalledRuns().catch((err) => {
  console.error('[CleanupStalledRuns] ❌ Lỗi:', err);
  process.exit(1);
});
