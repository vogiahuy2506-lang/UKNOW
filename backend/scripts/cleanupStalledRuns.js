import db from '../src/config/database.js';

/**
 * Script dọn dẹp một lần cho các run đang bị treo ở trạng thái 'running' không có hoạt động trong > 24 giờ.
 * An toàn: Tự động loại bỏ các run đang chạy thật (có execution trong 24h qua).
 */
async function cleanupStalledRuns() {
  console.log('[CleanupStalledRuns] Đang quét các run bị treo...');

  const selectQuery = `
    SELECT
      cr.id,
      cr.id_campaign,
      cr.started_at,
      cr.total_recipients,
      cr.successful_sends,
      cr.failed_sends,
      cr.status,
      MAX(ce.created_at) AS last_execution_at
    FROM campaign_runs cr
    LEFT JOIN campaign_executions ce ON ce.id_run = cr.id
    WHERE cr.status = 'running'
      AND cr.started_at < NOW() - INTERVAL '24 hours'
    GROUP BY cr.id, cr.id_campaign, cr.started_at, cr.total_recipients, cr.successful_sends, cr.failed_sends, cr.status
    HAVING MAX(ce.created_at) IS NULL OR MAX(ce.created_at) < NOW() - INTERVAL '24 hours'
    ORDER BY cr.id ASC;
  `;

  const { rows } = await db.query(selectQuery);

  if (rows.length === 0) {
    console.log('[CleanupStalledRuns] Không tìm thấy run nào bị treo quá 24 giờ.');
    await db.end();
    return;
  }

  console.log(`[CleanupStalledRuns] Tìm thấy ${rows.length} run bị treo:`);
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

  const runIds = rows.map((r) => r.id);

  const updateQuery = `
    UPDATE campaign_runs
    SET status = 'completed',
        completed_at = CURRENT_TIMESTAMP,
        error_message = 'Đã hoàn thành (dọn dẹp thủ công run không có hoạt động > 24h)'
    WHERE id = ANY($1::bigint[])
      AND status = 'running'
    RETURNING id, status, completed_at, error_message;
  `;

  const updateResult = await db.query(updateQuery, [runIds]);
  console.log(`[CleanupStalledRuns] ✅ Đã đóng ${updateResult.rowCount} run treo thành công.`);
  await db.end();
}

cleanupStalledRuns().catch((err) => {
  console.error('[CleanupStalledRuns] ❌ Lỗi:', err);
  process.exit(1);
});
