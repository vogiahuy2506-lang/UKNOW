/**
 * Nền chung cho các lần xuất CSV từ màn "Khách để lại thông tin" và trang bài nộp biểu mẫu
 * (PLAN_BIEU_MAU_TUY_BIEN_AI_LANDING_2026-10-11, PR-8c). Hàm thuần + một bộ ghi luồng, không chạm DB.
 *
 * Quy ước file (Excel mở đúng tiếng Việt, đọc lại được bằng bất kỳ trình đọc CSV nào):
 *  - UTF-8 có BOM; mỗi dòng kết thúc CRLF (kể cả dòng cuối);
 *  - ô chứa dấu phẩy / nháy kép / xuống dòng thì bọc nháy kép, nháy kép bên trong nhân đôi (RFC 4180);
 *  - chống CSV / formula injection: chuỗi bắt đầu bằng `=` `+` `-` `@`, tab hoặc CR thì chèn `'` đầu ô — Excel / Sheets / LibreOffice sẽ
 *    không coi nó là công thức. Áp cho MỌI ô, kể cả tiêu đề cột (nhãn trường do chủ biểu mẫu tự gõ). Chỉ số thật (kiểu number) giữ nguyên
 *    để số âm vẫn là số.
 */

/** BOM UTF-8 — đặt ở đầu file. */
export const CSV_BOM = '﻿';
/** Kết thúc dòng theo RFC 4180. */
export const CSV_EOL = '\r\n';
/** Trần số dòng dữ liệu một lần xuất; vượt thì cắt và báo qua `X-Export-Truncated`. */
export const CSV_EXPORT_MAX_ROWS = 20000;
/** Số dòng đọc DB / ghi xuống kết nối mỗi lượt. */
export const CSV_EXPORT_BATCH_SIZE = 500;

const FORMULA_PREFIX_PATTERN = /^[=+\-@\t\r]/;
const VIETNAM_TIME_ZONE = 'Asia/Ho_Chi_Minh';

/**
 * @param {unknown} value
 * @returns {string} giá trị đã chuẩn hoá thành chuỗi, chưa bọc nháy
 */
function toCellText(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : value.toISOString();
  return String(value);
}

/**
 * Chèn `'` đầu chuỗi nếu nó có thể bị bảng tính hiểu là công thức.
 *
 * @param {string} text
 * @returns {string}
 */
export function neutralizeFormula(text) {
  return FORMULA_PREFIX_PATTERN.test(text) ? `'${text}` : text;
}

/**
 * Một ô CSV đã escape, sẵn để nối bằng dấu phẩy.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function escapeCsvCell(value) {
  const raw = toCellText(value);
  // Số thật (number) không thể là công thức — giữ nguyên "-5" thay vì "'-5".
  const text = typeof value === 'number' ? raw : neutralizeFormula(raw);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/**
 * @param {unknown[]} cells
 * @returns {string} một dòng CSV kèm CRLF
 */
export function buildCsvLine(cells) {
  return `${(cells || []).map(escapeCsvCell).join(',')}${CSV_EOL}`;
}

/**
 * Ngày giờ theo giờ Việt Nam, dạng `dd/MM/yyyy HH:mm` (rỗng nếu không đọc được).
 *
 * @param {unknown} value Date | chuỗi ISO | số
 * @returns {string}
 */
export function formatCsvDateTimeVn(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: VIETNAM_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value])
  );
  return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}`;
}

/**
 * Dấu thời gian trong tên tệp: `YYYYMMDD-HHmm` theo giờ Việt Nam.
 *
 * @param {Date} [now]
 * @returns {string}
 */
export function formatExportFileStamp(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: VIETNAM_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(now)
      .map((part) => [part.type, part.value])
  );
  return `${parts.year}${parts.month}${parts.day}-${parts.hour}${parts.minute}`;
}

/**
 * Chữ → phần tên tệp an toàn: bỏ dấu tiếng Việt, chữ thường, chỉ a-z 0-9 và gạch nối, cắt `maxLength`.
 *
 * @param {unknown} text
 * @param {{ fallback?: string, maxLength?: number }} [options]
 * @returns {string}
 */
export function slugifyForFilename(text, { fallback = 'bieu-mau', maxLength = 40 } = {}) {
  const slug = String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength)
    .replace(/-+$/g, '');
  return slug || fallback;
}

/**
 * Ghi một khối chữ xuống luồng, chờ `drain` khi bộ đệm đầy; trả về false nếu phía nhận đã đóng (client huỷ tải).
 *
 * @param {import('node:stream').Writable} out
 * @param {string} chunk
 * @returns {Promise<boolean>}
 */
async function writeChunk(out, chunk) {
  if (out.destroyed || out.writableEnded) return false;
  if (!out.write(chunk)) await waitForDrain(out);
  return !(out.destroyed || out.writableEnded);
}

/**
 * Chờ bộ đệm ghi thoát ('drain') hoặc phía nhận đóng / lỗi. Gỡ cả ba listener ngay khi MỘT sự kiện xảy ra — file lớn chờ drain hàng chục lần,
 * để listener ở lại thì `res` báo MaxListenersExceededWarning (đã gặp khi xuất 20.000 dòng).
 */
function waitForDrain(out) {
  return new Promise((resolve) => {
    const done = () => {
      out.off('drain', done);
      out.off('close', done);
      out.off('error', done);
      resolve();
    };
    out.once('drain', done);
    out.once('close', done);
    out.once('error', done);
  });
}

/**
 * Ghi CSV xuống `out` theo từng lô: BOM + dòng tiêu đề, rồi với mỗi lô `batchSize` id → `loadRows(ids)` → ghi các dòng theo ĐÚNG thứ tự id
 * (id đã bị xoá giữa chừng thì bỏ qua). Bộ nhớ chỉ giữ một lô — không dồn cả bảng vào RAM.
 *
 * @template Row
 * @param {import('node:stream').Writable} out thường là `res` của Express
 * @param {{
 *   headerCells: unknown[],
 *   ids: Array<string|number>,
 *   loadRows: (ids: Array<string|number>) => Promise<Row[]>,
 *   rowId: (row: Row) => string|number,
 *   toCells: (row: Row) => unknown[],
 *   batchSize?: number,
 * }} params
 * @returns {Promise<{ rowsWritten: number, aborted: boolean }>}
 */
export async function streamCsv(out, { headerCells, ids, loadRows, rowId, toCells, batchSize = CSV_EXPORT_BATCH_SIZE }) {
  let rowsWritten = 0;
  if (!(await writeChunk(out, `${CSV_BOM}${buildCsvLine(headerCells)}`))) return { rowsWritten, aborted: true };

  for (let offset = 0; offset < ids.length; offset += batchSize) {
    const batchIds = ids.slice(offset, offset + batchSize);
    // eslint-disable-next-line no-await-in-loop
    const rows = await loadRows(batchIds);
    const byId = new Map(rows.map((row) => [String(rowId(row)), row]));
    let chunk = '';
    for (const id of batchIds) {
      const row = byId.get(String(id));
      if (!row) continue;
      chunk += buildCsvLine(toCells(row));
      rowsWritten += 1;
    }
    // eslint-disable-next-line no-await-in-loop
    if (chunk && !(await writeChunk(out, chunk))) return { rowsWritten, aborted: true };
  }
  return { rowsWritten, aborted: false };
}
