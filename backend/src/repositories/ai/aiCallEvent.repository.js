import db from '../../config/database.js';

/**
 * Ghi MỘT sự kiện vào `ai_call_events` (migration 285). Đầu vào đã được service chuẩn hoá/ép kiểu — repository không tự sửa.
 *
 * @param {{ ownerUserId: number|null, actorUserId: number|null, layer: string, feature: string, model: string|null,
 *   outcome: string, httpStatus: number|null, errorCode: string|null, durationMs: number|null, meta: object }} row
 */
export async function insertEvent(row) {
  await db.query(
    `INSERT INTO ai_call_events
       (owner_user_id, actor_user_id, layer, feature, model, outcome, http_status, error_code, duration_ms, meta)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)`,
    [
      row.ownerUserId,
      row.actorUserId,
      row.layer,
      row.feature,
      row.model,
      row.outcome,
      row.httpStatus,
      row.errorCode,
      row.durationMs,
      JSON.stringify(row.meta || {}),
    ],
  );
}

/**
 * Xoá sự kiện cũ hơn `days` ngày, theo lô để không khoá bảng lâu. Trả về tổng số dòng đã xoá.
 *
 * @param {number} days
 * @param {number} [batchSize=1000]
 */
export async function deleteOlderThanDays(days, batchSize = 1000) {
  const keepDays = Number.isFinite(Number(days)) && Number(days) > 0 ? Math.floor(Number(days)) : 30;
  const limit = Number.isFinite(Number(batchSize)) && Number(batchSize) > 0 ? Math.floor(Number(batchSize)) : 1000;
  let total = 0;
  while (true) {
    // `$1 || ' days'` cùng khuôn các truy vấn khoảng thời gian khác của repo (alert.repository.js).
    // eslint-disable-next-line no-await-in-loop
    const { rowCount } = await db.query(
      `DELETE FROM ai_call_events
        WHERE id IN (
          SELECT id FROM ai_call_events
           WHERE created_at < NOW() - ($1 || ' days')::interval
           LIMIT $2
        )`,
      [String(keepDays), limit],
    );
    const deleted = rowCount || 0;
    total += deleted;
    if (deleted < limit) break;
  }
  return total;
}
