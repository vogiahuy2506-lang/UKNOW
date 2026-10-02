/**
 * Đọc bảng tính định dạng cũ (.xls) bằng SheetJS trong một `worker_threads` riêng.
 *
 * `xlsx@0.18.5` (bản cuối trên npm, không còn được vá) có lỗi prototype pollution và ReDoS khi
 * đọc tệp lạ, mà ExcelJS lại không đọc được .xls (BIFF). Nên SheetJS chỉ còn chạy ở đây:
 *   - worker có heap riêng → prototype pollution không lan sang tiến trình chính;
 *   - quá `timeoutMs` thì `worker.terminate()` → một tệp ReDoS không treo được server;
 *   - `resourceLimits` (+ canh heap từ bên ngoài) chặn tệp làm phình bộ nhớ; mỗi lúc chỉ vài
 *     worker chạy song song;
 *   - kết quả là dữ liệu thuần, được kiểm hình dạng lại trước khi trả cho nơi gọi.
 */
import { Worker } from 'node:worker_threads';
import { MAX_UPLOAD_FILE_BYTES, MAX_UPLOAD_FILE_MB } from './uploadLimits.util.js';

export const LEGACY_SPREADSHEET_TIMEOUT_MS = 15_000;
export const LEGACY_SPREADSHEET_MAX_OLD_GENERATION_MB = 256;
/** Số worker đọc .xls chạy cùng lúc — mỗi worker được tới ~256MB heap. */
const MAX_CONCURRENT_WORKERS = 2;
/** Quá số lượt chờ này thì từ chối ngay thay vì để request treo sau hàng dài. */
const MAX_WAITING_JOBS = 20;
/**
 * Canh heap của worker từ bên ngoài. Cần vì `resourceLimits.maxOldGenerationSizeMb` bị cờ
 * `--max-old-space-size` toàn tiến trình (vd. đặt qua NODE_OPTIONS) ghi đè âm thầm — khi đó
 * worker được dùng tới trần heap của cả tiến trình. Chỉ chạy khi Node có
 * `worker.getHeapStatistics()` (22.16+); đọc được cả lúc worker đang bận vòng lặp đồng bộ.
 */
const HEAP_WATCHDOG_INTERVAL_MS = 200;
/** Chừa chỗ cho young generation / code space ngoài trần old generation. */
const HEAP_WATCHDOG_HEADROOM_MB = 64;

const WORKER_URL = new URL('./legacySpreadsheet.worker.js', import.meta.url);

let activeWorkers = 0;
const waitingJobs = [];

function spreadsheetError(message, code, statusCode = 400) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

/**
 * Chặn tệp bảng tính vượt trần dung lượng TRƯỚC khi đọc (bộ đọc nào cũng bung tệp ra bộ nhớ).
 * Mặc định dùng lại trần tải tệp chung `MAX_UPLOAD_FILE_BYTES`.
 *
 * @param {Buffer} buffer
 * @param {number} [maxBytes]
 */
export function assertSpreadsheetSize(buffer, maxBytes = MAX_UPLOAD_FILE_BYTES) {
  if (buffer && buffer.length > maxBytes) {
    const limitMb = maxBytes === MAX_UPLOAD_FILE_BYTES
      ? MAX_UPLOAD_FILE_MB
      : Math.max(1, Math.round(maxBytes / (1024 * 1024)));
    throw spreadsheetError(
      `Tệp bảng tính vượt giới hạn ${limitMb}MB.`,
      'SPREADSHEET_TOO_LARGE',
      413
    );
  }
}

function acquireSlot() {
  if (activeWorkers < MAX_CONCURRENT_WORKERS) {
    activeWorkers += 1;
    return Promise.resolve();
  }
  if (waitingJobs.length >= MAX_WAITING_JOBS) {
    return Promise.reject(spreadsheetError(
      'Hệ thống đang bận đọc các tệp bảng tính khác. Vui lòng thử lại sau ít phút.',
      'SPREADSHEET_PARSER_BUSY',
      503
    ));
  }
  return new Promise((resolve) => waitingJobs.push(resolve));
}

function releaseSlot() {
  const next = waitingJobs.shift();
  // Có người đang chờ thì chuyển thẳng suất cho họ, số worker đang chạy giữ nguyên.
  if (next) next();
  else activeWorkers -= 1;
}

function toPlainCell(value) {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? value : '';
}

function normalizeResult(output, result) {
  if (!result || typeof result !== 'object') {
    throw new Error('Kết quả đọc bảng tính không hợp lệ.');
  }
  if (output === 'csv') {
    const sheets = Array.isArray(result.sheets) ? result.sheets : [];
    return {
      sheets: sheets.map((sheet) => ({
        name: String(sheet?.name ?? ''),
        csv: typeof sheet?.csv === 'string' ? sheet.csv : '',
      })),
    };
  }
  const rows = Array.isArray(result.rows) ? result.rows : [];
  return {
    sheetName: typeof result.sheetName === 'string' ? result.sheetName : null,
    rows: Array.from(rows, (row) => (Array.isArray(row) ? Array.from(row, toPlainCell) : [])),
  };
}

function resourceLimitError() {
  return spreadsheetError(
    'Tệp bảng tính quá lớn hoặc quá phức tạp, vượt giới hạn bộ nhớ khi đọc. '
      + 'Hãy lưu lại dưới dạng .xlsx hoặc .csv rồi tải lên lại.',
    'SPREADSHEET_PARSE_RESOURCE_LIMIT'
  );
}

function runWorker(bytes, { output, timeoutMs, maxOldGenerationSizeMb, workerUrl }) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let worker;
    let timer = null;
    let heapWatchdog = null;

    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (heapWatchdog) clearInterval(heapWatchdog);
      // Worker đã trả kết quả thường tự thoát; terminate() để chắc chắn không còn thread treo.
      if (worker) worker.terminate().catch(() => {});
      if (error) reject(error);
      else resolve(value);
    };

    try {
      worker = new Worker(workerUrl, {
        workerData: { bytes, output },
        // Chuyển quyền sở hữu vùng nhớ sang worker thay vì sao chép thêm lần nữa.
        transferList: [bytes.buffer],
        resourceLimits: { maxOldGenerationSizeMb },
        // Không cho worker thừa hưởng biến môi trường (secret) hay cờ node của tiến trình chính
        // (vd. `-r dotenv/config`): bộ đọc bảng tính không cần tới chúng.
        env: {},
        execArgv: [],
      });
    } catch (err) {
      reject(err);
      return;
    }

    timer = setTimeout(() => {
      finish(spreadsheetError(
        `Đọc tệp bảng tính quá ${Math.max(1, Math.round(timeoutMs / 1000))} giây nên đã dừng. `
          + 'Hãy mở tệp bằng Excel, lưu lại dưới dạng .xlsx hoặc .csv rồi tải lên lại.',
        'SPREADSHEET_PARSE_TIMEOUT'
      ));
    }, timeoutMs);

    if (typeof worker.getHeapStatistics === 'function') {
      const heapBudgetBytes = (maxOldGenerationSizeMb + HEAP_WATCHDOG_HEADROOM_MB) * 1024 * 1024;
      heapWatchdog = setInterval(() => {
        worker.getHeapStatistics()
          .then((stats) => {
            if (stats && stats.used_heap_size > heapBudgetBytes) finish(resourceLimitError());
          })
          // Worker vừa thoát giữa chừng → không đọc được nữa; các listener bên dưới lo phần còn lại.
          .catch(() => {});
      }, HEAP_WATCHDOG_INTERVAL_MS);
    }

    // Dùng `on` (không phải `once`) cho mọi sự kiện: `finish` chỉ chạy một lần, còn một 'error'
    // phát ra khi đã hết listener sẽ thành ngoại lệ không bắt được ở tiến trình chính.
    worker.on('message', (message) => {
      if (message && message.ok === true) {
        try {
          finish(null, normalizeResult(output, message.result));
        } catch (err) {
          finish(err);
        }
        return;
      }
      finish(new Error(String(message?.message || 'Không đọc được tệp bảng tính.')));
    });

    worker.on('error', (err) => {
      if (err?.code === 'ERR_WORKER_OUT_OF_MEMORY') {
        finish(resourceLimitError());
        return;
      }
      finish(new Error(String(err?.message || err || 'Không đọc được tệp bảng tính.')));
    });

    worker.on('messageerror', () => finish(new Error('Không nhận được kết quả đọc bảng tính.')));

    worker.on('exit', (code) => {
      finish(new Error(`Tiến trình đọc bảng tính dừng bất thường (mã ${code}).`));
    });
  });
}

/**
 * Đọc bảng tính bằng SheetJS trong worker cô lập.
 *
 * @param {Buffer|Uint8Array} buffer nội dung tệp (không bị sửa hay chuyển quyền — worker nhận bản sao)
 * @param {object} [options]
 * @param {'rows'|'csv'} [options.output] 'rows' → `{ sheetName, rows }` của trang tính đầu tiên
 *   (giống `sheet_to_json(sheet, { header: 1, defval: '' })`); 'csv' → `{ sheets: [{ name, csv }] }`
 *   cho mọi trang tính (giống `sheet_to_csv(sheet, { blankrows: false })`).
 * @param {number} [options.timeoutMs] trần thời gian đọc (mặc định 15 giây).
 * @param {number} [options.maxOldGenerationSizeMb] trần heap của worker (mặc định 256MB).
 * @param {number} [options.maxBytes] trần dung lượng tệp (mặc định = trần tải tệp chung).
 * @param {URL|string} [options.workerUrl] chỉ dùng cho test — thay worker thật bằng worker giả.
 * @returns {Promise<{ sheetName: string|null, rows: Array<Array<string|number|boolean>> }
 *   | { sheets: Array<{ name: string, csv: string }> }>}
 */
export async function parseLegacySpreadsheet(buffer, {
  output = 'rows',
  timeoutMs = LEGACY_SPREADSHEET_TIMEOUT_MS,
  maxOldGenerationSizeMb = LEGACY_SPREADSHEET_MAX_OLD_GENERATION_MB,
  maxBytes = MAX_UPLOAD_FILE_BYTES,
  workerUrl = WORKER_URL,
} = {}) {
  if (!(Buffer.isBuffer(buffer) || buffer instanceof Uint8Array) || buffer.length === 0) {
    throw spreadsheetError('Tệp bảng tính rỗng hoặc không hợp lệ.', 'INVALID_FILE_BUFFER');
  }
  assertSpreadsheetSize(buffer, maxBytes);
  if (output !== 'rows' && output !== 'csv') {
    throw new Error(`output không hợp lệ: ${output}`);
  }

  await acquireSlot();
  try {
    // Sao chép sang ArrayBuffer riêng rồi mới chuyển cho worker: Buffer của nơi gọi có thể là một
    // lát của vùng nhớ dùng chung (Buffer pool) — chuyển thẳng sẽ làm hỏng dữ liệu của nơi khác.
    const bytes = new Uint8Array(buffer.byteLength);
    bytes.set(buffer);
    return await runWorker(bytes, { output, timeoutMs, maxOldGenerationSizeMb, workerUrl });
  } finally {
    releaseSlot();
  }
}

export default { parseLegacySpreadsheet, assertSpreadsheetSize };
