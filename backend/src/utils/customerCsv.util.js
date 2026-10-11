/**
 * Dựng file CSV xuất danh sách khách (`GET /api/customers/export.csv`). Hàm thuần, không DB — test được.
 *
 * - UTF-8 có BOM để Excel đọc đúng tiếng Việt.
 * - Ô bắt đầu bằng `= + - @` (hoặc tab/CR) bị Excel coi là công thức → chèn `'` đầu ô (CSV injection);
 *   riêng ô trông như số (SĐT `+84…`) giữ nguyên để xuất ra rồi nhập lại vẫn khớp.
 */

/** Trần số dòng một lần xuất. */
export const CUSTOMER_EXPORT_MAX_ROWS = 10000;

export const CSV_BOM = '\uFEFF';

export const CUSTOMER_CSV_HEADERS = Object.freeze([
  'Họ tên', 'Email', 'Số điện thoại', 'Nguồn dữ liệu', 'Trạng thái email', 'Ngày tạo',
]);

const CONSENT_SOURCE_LABELS = Object.freeze({
  manual: 'Thủ công',
  import: 'Nhập file',
  landing_lead: 'Landing page',
  webhook: 'Webhook đơn hàng',
  zalo: 'Zalo',
  form_submission: 'Biểu mẫu',
});

const NUMBER_LOOKING_PATTERN = /^[+-]?[\d\s().-]+$/;
const FORMULA_PREFIX_PATTERN = /^[=+\-@\t\r]/;

/**
 * @param {unknown} value
 * @returns {string} ô CSV đã escape, sẵn để nối bằng dấu phẩy
 */
export function escapeCsvCell(value) {
  let text = value === null || value === undefined ? '' : String(value);
  if (FORMULA_PREFIX_PATTERN.test(text) && !NUMBER_LOOKING_PATTERN.test(text)) {
    text = `'${text}`;
  }
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/** @param {unknown[]} cells @returns {string} một dòng CSV kèm CRLF */
export function buildCsvLine(cells) {
  return `${cells.map(escapeCsvCell).join(',')}\r\n`;
}

/**
 * @param {{ email_subscribed?: boolean, email_hard_bounced?: boolean }} row
 * @returns {'Bounce'|'Đã huỷ nhận'|'Đang nhận'}
 */
export function describeEmailStatus(row) {
  if (row.email_hard_bounced) return 'Bounce';
  if (row.email_subscribed === false) return 'Đã huỷ nhận';
  return 'Đang nhận';
}

/** Ngày giờ theo giờ Việt Nam, dạng `dd/MM/yyyy HH:mm`. */
export function formatExportDate(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(date).map((part) => [part.type, part.value])
  );
  return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}`;
}

/** @param {object} row hàng từ `getCustomerExportRows` @returns {string} */
export function buildCustomerCsvRow(row) {
  return buildCsvLine([
    row.full_name,
    row.email,
    row.phone,
    row.consent_source ? (CONSENT_SOURCE_LABELS[row.consent_source] || row.consent_source) : '',
    describeEmailStatus(row),
    formatExportDate(row.created_at),
  ]);
}

/** @returns {string} BOM + dòng tiêu đề */
export function buildCustomerCsvHeader() {
  return `${CSV_BOM}${buildCsvLine(CUSTOMER_CSV_HEADERS)}`;
}
