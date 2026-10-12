import { saveBlobAsFile, filenameFromDisposition } from '../features/customers/utils/customerList.helpers';

/**
 * Tải file CSV từ API xuất dữ liệu khách (PLAN_BIEU_MAU_TUY_BIEN_AI_LANDING_2026-10-11, PR-8c): màn "Khách để lại thông tin" (2 tab) và
 * trang bài nộp từng biểu mẫu. Backend trả `text/csv` (UTF-8 có BOM) kèm các header `X-Export-*`; lỗi (400/403/404) trả JSON — mà khi gọi
 * với `responseType: 'blob'` thì thân lỗi cũng là Blob nên phải đọc lại ra chữ.
 */

/** Trần số dòng một lần xuất — khớp `CSV_EXPORT_MAX_ROWS` ở backend (utils/csvExport.util.js), chỉ dùng để nói với người dùng. */
export const CSV_EXPORT_MAX_ROWS = 20000;

/** Axios timeout cho lệnh xuất (file lớn): dài hơn mặc định của `api`. */
export const CSV_EXPORT_TIMEOUT_MS = 120000;

/**
 * Đọc thông báo lỗi từ thân dạng Blob (JSON `{ message }`).
 *
 * @param {Blob} blob
 * @returns {Promise<string>}
 */
async function messageFromErrorBlob(blob) {
  try {
    const parsed = JSON.parse(await readBlobText(blob));
    return parsed?.message || '';
  } catch {
    return '';
  }
}

/** `Blob.text()` có ở mọi trình duyệt hiện hành nhưng thiếu ở Safari < 14 và jsdom — rơi về FileReader. */
function readBlobText(blob) {
  if (typeof blob.text === 'function') return blob.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

/**
 * @param {Record<string, string>|undefined} headers header phản hồi (axios đã hạ chữ thường)
 * @returns {{ rowCount: number, total: number, truncated: boolean }}
 */
export function readCsvExportMeta(headers) {
  const rowCount = Number(headers?.['x-export-row-count']) || 0;
  const total = Number(headers?.['x-export-total']) || rowCount;
  const truncated = String(headers?.['x-export-truncated'] || '').toLowerCase() === 'true';
  return { rowCount, total, truncated };
}

/**
 * Chờ phản hồi của lệnh xuất, lưu thành file, trả số liệu để báo người dùng.
 *
 * @param {Promise<import('axios').AxiosResponse>} requestPromise lời gọi `api.get(..., { responseType: 'blob' })`
 * @param {string} [fallbackFilename] tên tệp khi thiếu `Content-Disposition`
 * @returns {Promise<{ rowCount: number, total: number, truncated: boolean, filename: string }>}
 */
export async function downloadCsvFromRequest(requestPromise, fallbackFilename = 'export.csv') {
  let response;
  try {
    response = await requestPromise;
  } catch (error) {
    const data = error?.response?.data;
    if (data instanceof Blob) {
      const message = await messageFromErrorBlob(data);
      if (message) {
        const wrapped = new Error(message);
        wrapped.response = { ...error.response, data: { message } };
        throw wrapped;
      }
    }
    throw error;
  }

  const contentType = String(response.headers?.['content-type'] || '');
  if (contentType.includes('application/json')) {
    throw new Error((await messageFromErrorBlob(response.data)) || 'Export failed');
  }
  const blob = response.data instanceof Blob ? response.data : new Blob([response.data], { type: 'text/csv;charset=utf-8' });
  const filename = filenameFromDisposition(response.headers?.['content-disposition'], fallbackFilename);
  saveBlobAsFile(blob, filename);
  return { ...readCsvExportMeta(response.headers), filename };
}
