// PR-8a (PLAN_ON_DINH_GUI_CHIEN_DICH_2026-09-26) — Việt hoá trạng thái LƯỢT CHẠY
// (campaign_runs.status). Trước đây CampaignRunLogsPanel.jsx / UserDeliveryMonitorPage.jsx in
// thô giá trị cột, người dùng thấy "running"/"failed" tiếng Anh trần.

const KNOWN_RUN_STATUSES = new Set(['running', 'completed', 'failed', 'stopped']);

/**
 * Việt hoá (hoặc dịch theo locale hiện tại) trạng thái lượt chạy chiến dịch.
 *
 * Chỉ dịch 4 giá trị CHECK constraint thật của `campaign_runs.status`. Trạng thái lạ/rỗng (dữ liệu
 * cũ, giá trị chưa biết) trả về NGUYÊN CHUỖI GỐC — không trả khoá i18n (`t()` trả nguyên khoá khi
 * thiếu bản dịch, in "campaignRun.runStatus.xxx" ra màn hình sẽ tệ hơn cả in thô status gốc).
 *
 * @param {(key: string, params?: object) => string} t hàm dịch từ useI18n()
 * @param {string|null|undefined} status giá trị campaign_runs.status
 * @returns {string}
 */
export function getRunStatusLabel(t, status) {
  const safeStatus = String(status || '').trim();
  if (!KNOWN_RUN_STATUSES.has(safeStatus)) return safeStatus;
  return t(`campaignRun.runStatus.${safeStatus}`);
}
