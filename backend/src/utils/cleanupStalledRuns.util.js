export const STALLED_RUN_CLEANUP_HOURS = 48;

/**
 * Parse CLI của cleanup script. Chỉ `--apply --ids=<id,id>` mới cho phép ghi DB.
 * @param {string[]} [argv]
 * @returns {{ apply: boolean, requestedRunIds: number[] }}
 */
export function parseCleanupStalledRunArgs(argv = []) {
  const apply = argv.includes('--apply');
  const rawIds = argv.find((arg) => arg.startsWith('--ids='));
  if (!rawIds) {
    if (apply) {
      throw new Error('Từ chối ghi DB: cần truyền ID đã xác nhận, ví dụ: --apply --ids=227,314');
    }
    return { apply, requestedRunIds: [] };
  }

  const requestedRunIds = rawIds.slice('--ids='.length).split(',').map((value) => Number(value.trim()));
  if (!requestedRunIds.length || requestedRunIds.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
    throw new Error('--ids phải là danh sách ID dương, ví dụ: --ids=227,314');
  }
  return { apply, requestedRunIds: [...new Set(requestedRunIds)] };
}

/**
 * Tách các ID vừa được UPDATE thành công khỏi ID bị bỏ qua.
 * node-postgres mặc định trả PostgreSQL BIGINT ở dạng string, trong khi CLI đã
 * parse ID thành number; so sánh sau khi chuẩn hoá string để log không báo nhầm.
 * @param {number[]} requestedRunIds
 * @param {Array<{ id: string|number|bigint }>} closedRows
 * @returns {{ closedIds: Array<string|number|bigint>, skippedIds: number[] }}
 */
export function splitCleanupStalledRunIds(requestedRunIds, closedRows = []) {
  const closedIds = closedRows.map((row) => row.id);
  const closedIdSet = new Set(closedIds.map((id) => String(id)));

  return {
    closedIds,
    skippedIds: requestedRunIds.filter((id) => !closedIdSet.has(String(id))),
  };
}

/**
 * Predicate bảo thủ cho script dọn một lần.
 * Bất kỳ dấu vết recipient/defer đang được runtime quản lý đều loại run khỏi danh sách.
 * @param {string} hoursParam PostgreSQL placeholder, ví dụ `$1`
 */
export function buildSafeStalledRunPredicate(hoursParam) {
  return `
    cr.status = 'running'
    AND cr.started_at < NOW() - (${hoursParam} || ' hours')::interval
    AND NOT EXISTS (
      SELECT 1
      FROM campaign_executions ce_recent
      WHERE ce_recent.id_run = cr.id
        AND GREATEST(ce_recent.created_at, ce_recent.updated_at) >= NOW() - (${hoursParam} || ' hours')::interval
    )
    AND NOT EXISTS (
      SELECT 1
      FROM campaign_run_recipient_steps crs_parked
      WHERE crs_parked.id_run = cr.id
        AND COALESCE(crs_parked.is_fully_completed, FALSE) = FALSE
        AND NULLIF(TRIM(COALESCE(crs_parked.meta->>'nextDueAt', '')), '') IS NOT NULL
    )
    AND NULLIF(TRIM(COALESCE(cr.run_metadata->>'quotaDeferredUntil', '')), '') IS NULL
    AND NULLIF(TRIM(COALESCE(cr.run_metadata->>'zaloOutboundDeferredUntil', '')), '') IS NULL
    AND NULLIF(TRIM(COALESCE(cr.run_metadata->>'nonContinuousDeferredUntil', '')), '') IS NULL
  `;
}
