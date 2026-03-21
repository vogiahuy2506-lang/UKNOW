/**
 * Lấy mốc thời gian lớn nhất trong danh sách log (ưu tiên `updatedAt`) để poll delta từ API.
 *
 * @param {Array<{ updatedAt?: string, createdAt?: string }>} logs danh sách execution log
 * @returns {string|null} chuỗi dùng cho `executionLogsUpdatedAfter`, hoặc null
 */
export function getMaxExecutionLogUpdatedAt(logs = []) {
  let max = '';
  for (const l of logs) {
    const u = l?.updatedAt || l?.createdAt || '';
    if (u && (!max || String(u) > String(max))) max = String(u);
  }
  return max || null;
}

/**
 * Tải chi tiết một lượt chạy và gom đủ `executionLogs` qua nhiều request (cursor theo `id`).
 *
 * Luồng hoạt động:
 * 1. Gọi GET chi tiết run kèm `executionLogsLimit` (trang đầu).
 * 2. Nếu `executionLogsHasMore`, gọi tiếp với `executionLogsAfterId` cho đến hết.
 * 3. Trả về object run với `executionLogs` đã nối (UI tổng hợp theo node).
 *
 * @param {(runId: number|string, query: object) => Promise<{ data?: { data?: object } }>} getDetail vd `campaignRunApiService.getCampaignRunDetail`
 * @param {number|string} runId id lượt chạy
 * @param {number} [pageSize=150] số log tối đa mỗi trang (backend tối đa 500)
 * @returns {Promise<object>}
 */
export async function fetchCampaignRunDetailAllExecutionLogs(getDetail, runId, pageSize = 150) {
  let afterId = null;
  /** @type {object|null} */
  let runBase = null;
  const mergedLogs = [];

  for (;;) {
    const params = { executionLogsLimit: pageSize };
    if (afterId != null) params.executionLogsAfterId = afterId;

    const res = await getDetail(runId, params);
    const data = res?.data?.data;
    if (!data) {
      const err = new Error('Thiếu dữ liệu lượt chạy');
      err.code = 'MISSING_RUN_DATA';
      throw err;
    }

    if (!runBase) {
      runBase = { ...data };
      delete runBase.executionLogs;
      delete runBase.executionLogsHasMore;
      delete runBase.executionLogsNextAfterId;
    }

    mergedLogs.push(...(data.executionLogs || []));

    if (!data.executionLogsHasMore) break;
    afterId = data.executionLogsNextAfterId;
    if (afterId == null) break;
  }

  return { ...runBase, executionLogs: mergedLogs };
}
