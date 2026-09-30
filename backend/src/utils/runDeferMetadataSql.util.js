/**
 * Biểu thức SQL "lượt chạy đang chờ tới khi nào / vì sao", đọc từ `campaign_runs.run_metadata`.
 *
 * Bốn họ khoá defer (campaignRun.service.js ghi qua `persistRunDeferYieldSlot`), theo thứ tự ưu tiên:
 * quota gói → bước kế của chiến dịch one-shot → Zalo → kênh adapter (Telegram/WhatsApp). DÙNG CHUNG cho bảng lượt chạy
 * của admin (services/shared/deliveryMonitorTopRuns.query.js) và trang Giám sát gửi tin của người dùng
 * (repositories/user/userDeliveryMonitor.repository.js): thêm một khoá defer mới thì sửa MỘT chỗ này, hai màn không
 * lệch nhau.
 *
 * Kết quả là chuỗi (ISO với mốc, mã ngắn với lý do) hoặc NULL. Mốc KHÔNG được parse ở SQL — một giá trị hỏng trong
 * JSON sẽ làm hỏng cả truy vấn — nên nơi dùng tự kiểm mốc còn ở tương lai.
 */
import { safeMetadataTimestampSql } from './metadataTimestampSql.util.js';

/**
 * @param {string} alias bí danh của bảng/CTE có cột `run_metadata`
 * @returns {string} biểu thức trả mốc chờ (chuỗi ISO) hoặc NULL
 */
export const runDeferredUntilSql = (alias) => `COALESCE(${alias}.run_metadata->>'quotaDeferredUntil', ${alias}.run_metadata->>'nonContinuousDeferredUntil', ${alias}.run_metadata->>'zaloOutboundDeferredUntil', ${alias}.run_metadata->>'channelDeferredUntil')`;

/**
 * Cặp của {@link runDeferredUntilSql}.
 *
 * @param {string} alias bí danh của bảng/CTE có cột `run_metadata`
 * @returns {string} biểu thức trả mã lý do chờ (vd `quiet_hours`, `plan_quota_daily`) hoặc NULL
 */
export const runDeferredReasonSql = (alias) => `COALESCE(${alias}.run_metadata->>'quotaDeferredReason', ${alias}.run_metadata->>'nonContinuousDeferredReason', ${alias}.run_metadata->>'zaloDeferredReason', ${alias}.run_metadata->>'channelDeferredReason')`;

/**
 * "Lượt này CÓ đang chờ không": mốc hoãn MUỘN NHẤT trong bốn khoá, đã parse an toàn (giá trị hỏng → NULL, không làm hỏng
 * cả truy vấn). Dùng để đếm/lọc (`> NOW()`). Khác {@link runDeferredUntilSql} (lấy khoá ĐẦU TIÊN có giá trị) — cặp
 * COALESCE ở trên dành cho HIỂN THỊ, vì mốc và lý do phải lấy từ cùng một khoá. Dùng ở khối Hoạt động nhóm
 * (repositories/user/teamOverview.repository.js).
 *
 * @param {string} alias bí danh của bảng/CTE có cột `run_metadata`
 * @returns {string} biểu thức timestamptz hoặc NULL
 */
export const runDeferredUntilLatestSql = (alias) => `GREATEST(
  ${safeMetadataTimestampSql(`${alias}.run_metadata->>'quotaDeferredUntil'`)},
  ${safeMetadataTimestampSql(`${alias}.run_metadata->>'zaloOutboundDeferredUntil'`)},
  ${safeMetadataTimestampSql(`${alias}.run_metadata->>'nonContinuousDeferredUntil'`)},
  ${safeMetadataTimestampSql(`${alias}.run_metadata->>'channelDeferredUntil'`)}
)`;
