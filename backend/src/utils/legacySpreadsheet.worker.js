/**
 * Worker đọc bảng tính định dạng cũ (.xls BIFF, HTML/XML đội lốt .xls…) bằng SheetJS (`xlsx`).
 *
 * CHỈ chạy bên trong `worker_threads` do `legacySpreadsheetParser.util.js` tạo ra — đừng import
 * file này từ tiến trình chính. `xlsx@0.18.5` là bản cuối trên npm và còn lỗ hổng khi đọc tệp do
 * người dùng tải lên; chạy ở đây thì mọi thứ nó làm bẩn chỉ nằm trong isolate của worker, còn
 * tiến trình chính chỉ nhận lại dữ liệu thuần (mảng dòng / chuỗi CSV) qua structured clone.
 *
 * Giữ nguyên lời gọi SheetJS như bản chạy trực tiếp trước đây để kết quả đọc không đổi.
 */
import module from 'node:module';
import { parentPort, workerData } from 'node:worker_threads';

const require = module.createRequire(import.meta.url);

function parse({ bytes, output }) {
  const XLSX = require('xlsx');
  // Bọc lại thành Buffer (không sao chép) để đi đúng nhánh `type: 'buffer'` như trước.
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetNames = Array.isArray(workbook.SheetNames) ? workbook.SheetNames : [];

  if (output === 'csv') {
    return {
      sheets: sheetNames.map((name) => ({
        name: String(name),
        csv: String(XLSX.utils.sheet_to_csv(workbook.Sheets[name], { blankrows: false })),
      })),
    };
  }

  const firstSheetName = sheetNames[0];
  if (!firstSheetName) return { sheetName: null, rows: [] };
  return {
    sheetName: String(firstSheetName),
    rows: XLSX.utils.sheet_to_json(workbook.Sheets[firstSheetName], { header: 1, defval: '' }),
  };
}

// Bị import nhầm ở tiến trình chính thì không làm gì (parentPort chỉ có trong worker).
if (parentPort) {
  try {
    parentPort.postMessage({ ok: true, result: parse(workerData || {}) });
  } catch (err) {
    parentPort.postMessage({ ok: false, message: String((err && err.message) || err) });
  }
}
