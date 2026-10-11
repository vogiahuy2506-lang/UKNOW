/**
 * Nhập khách từ CSV/Excel: đọc file ở trình duyệt, nhận diện cột, chia lô gọi `POST /api/customers/bulk`.
 * Phần lớn là hàm thuần để test được; chỉ `readSpreadsheetFile` đụng thư viện `xlsx` (nạp động, khỏi nặng bundle).
 */

/** Backend trần 2.000 dòng mỗi lần gọi `/bulk` (`BULK_MAX_ITEMS`) — quá là 400, không xử lý một phần. */
export const IMPORT_BATCH_SIZE = 2000;

/** Trần số dòng một file — bảo vệ trình duyệt và hạn mức gọi API (tối đa 10 lô). */
export const IMPORT_MAX_FILE_ROWS = 20000;

export const IMPORT_PREVIEW_ROWS = 20;

/** Hiện tối đa bấy nhiêu dòng lỗi trong kết quả; phần còn lại gom thành "… và N lỗi khác". */
export const IMPORT_MAX_ERRORS_SHOWN = 50;

export const IMPORT_FIELDS = Object.freeze(['fullName', 'email', 'phone', 'notes']);

const HEADER_ALIASES = Object.freeze({
  email: ['email', 'e-mail', 'mail', 'emailaddress', 'diachiemail', 'thudientu'],
  phone: ['phone', 'sdt', 'sodienthoai', 'dienthoai', 'tel', 'mobile', 'sodt', 'phonenumber', 'dtdd'],
  fullName: ['hoten', 'hovaten', 'ten', 'tenkhachhang', 'khachhang', 'fullname', 'name', 'customername'],
  notes: ['ghichu', 'note', 'notes', 'mota'],
});

/** Bỏ dấu tiếng Việt, chữ thường, chỉ giữ chữ-số: "Số điện thoại" -> "sodienthoai". */
export function normalizeHeader(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * @param {unknown[]} headerRow dòng đầu của file
 * @returns {Partial<Record<'fullName'|'email'|'phone'|'notes', number>>} chỉ số cột của từng trường nhận diện được
 */
export function detectColumns(headerRow = []) {
  const columns = {};
  headerRow.forEach((cell, index) => {
    const key = normalizeHeader(cell);
    if (!key) return;
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      if (columns[field] === undefined && aliases.includes(key)) {
        columns[field] = index;
        break;
      }
    }
  });
  return columns;
}

const cellText = (value) => (value === null || value === undefined ? '' : String(value).trim());

/**
 * Đổi ma trận (dòng đầu là tiêu đề) thành các dòng nhập.
 *
 * - `rowNumber` là số dòng TRONG FILE (mặc định tiêu đề = dòng 1) để báo lỗi khớp với cái người dùng thấy trong Excel.
 * - Dòng trống hoàn toàn bị bỏ khỏi danh sách (không tính là dòng).
 * - Dòng thiếu cả email lẫn SĐT: `skipped = true` — backend cũng sẽ bỏ qua, nên KHÔNG gửi lên.
 *
 * @param {unknown[][]} matrix
 * @param {number} [firstRowNumber] số dòng trong file của dòng đầu ma trận (sheet bắt đầu ở dòng 3 thì truyền 3)
 * @returns {{ columns: object, rows: Array<{ rowNumber: number, fields: object, skipped: boolean }>, hasContactColumn: boolean }}
 */
export function buildImportRows(matrix = [], firstRowNumber = 1) {
  const [headerRow = [], ...dataRows] = Array.isArray(matrix) ? matrix : [];
  const columns = detectColumns(headerRow);
  const hasContactColumn = columns.email !== undefined || columns.phone !== undefined;

  const rows = [];
  dataRows.forEach((raw, index) => {
    const cells = Array.isArray(raw) ? raw : [];
    if (cells.every((cell) => cellText(cell) === '')) return;
    const fields = {};
    IMPORT_FIELDS.forEach((field) => {
      fields[field] = columns[field] !== undefined ? cellText(cells[columns[field]]) : '';
    });
    rows.push({
      rowNumber: firstRowNumber + 1 + index,
      fields,
      skipped: !fields.email && !fields.phone,
    });
  });
  return { columns, rows, hasContactColumn };
}

/** Dòng nhập -> phần tử gửi `/bulk` (chỉ trường có giá trị — ô trống không ghi đè dữ liệu cũ). */
export function toBulkItem(row) {
  const item = {};
  IMPORT_FIELDS.forEach((field) => {
    if (row.fields[field]) item[field] = row.fields[field];
  });
  return item;
}

/** @template T @param {T[]} list @param {number} size @returns {T[][]} */
export function chunk(list, size = IMPORT_BATCH_SIZE) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/**
 * Gửi các dòng hợp lệ theo lô ≤ {@link IMPORT_BATCH_SIZE}, tuần tự. Lô lỗi (HTTP) thì DỪNG — các lô trước đã lưu.
 * `errors[].index` của backend tính trong CHÍNH lô đó → quy ra số dòng trong file qua `rowNumbers`.
 *
 * @param {object} input
 * @param {object[]} input.items phần tử `/bulk` (đã loại dòng thiếu liên hệ)
 * @param {number[]} input.rowNumbers số dòng trong file, song song với `items`
 * @param {(items: object[]) => Promise<{ data: { data: object } }>} input.bulkFn
 * @param {(progress: { current: number, total: number }) => void} [input.onProgress]
 * @param {number} [input.batchSize]
 * @returns {Promise<{ totals: object, errors: Array<{ row: number, field: string, message: string }>, failedBatch: null|{ batch: number, message: string } }>}
 */
export async function importInBatches({ items, rowNumbers, bulkFn, onProgress, batchSize = IMPORT_BATCH_SIZE }) {
  const totals = { inserted: 0, updated: 0, skipped: 0, invalid: 0 };
  const errors = [];
  const batches = chunk(items, batchSize);

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
    onProgress?.({ current: batchIndex + 1, total: batches.length });
    const offset = batchIndex * batchSize;
    let result;
    try {
      const response = await bulkFn(batches[batchIndex]);
      result = response?.data?.data || {};
    } catch (error) {
      return {
        totals,
        errors,
        failedBatch: {
          batch: batchIndex + 1,
          message: error?.response?.data?.message || error?.message || '',
        },
      };
    }
    totals.inserted += Number(result.inserted) || 0;
    totals.updated += Number(result.updated) || 0;
    totals.skipped += Number(result.skipped) || 0;
    totals.invalid += Number(result.invalid) || 0;
    (Array.isArray(result.errors) ? result.errors : []).forEach((rowError) => {
      const position = offset + Number(rowError.index);
      errors.push({
        row: rowNumbers[position] ?? position + 2,
        field: rowError.field,
        message: rowError.message,
      });
    });
  }
  return { totals, errors, failedBatch: null };
}

/**
 * Đọc CSV/XLSX/XLS thành ma trận chuỗi. CSV đọc như văn bản UTF-8 (`raw: true` giữ nguyên số 0 đầu của SĐT);
 * Excel đọc theo giá trị hiển thị.
 *
 * @param {File} file
 * @returns {Promise<{ matrix: string[][], firstRowNumber: number }>} `firstRowNumber`: số dòng thật của dòng đầu
 *   (Excel bỏ các dòng trống ở đầu sheet nên có thể > 1)
 */
export async function readSpreadsheetFile(file) {
  const XLSX = await import('xlsx');
  const isText = /\.(csv|txt)$/i.test(file.name || '') || (file.type || '').startsWith('text/');
  const workbook = isText
    ? XLSX.read(await file.text(), { type: 'string', raw: true })
    : XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet || !sheet['!ref']) return { matrix: [], firstRowNumber: 1 };
  const firstRowNumber = XLSX.utils.decode_range(sheet['!ref']).s.r + 1;
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '', blankrows: true });
  return { matrix, firstRowNumber };
}
