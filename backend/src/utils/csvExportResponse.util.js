import { streamCsv } from './csvExport.util.js';

/**
 * Gửi một "kế hoạch xuất CSV" (xem `ExportPlan` ở formSubmissionExport.service.js / leadCsvExport.service.js) xuống response Express:
 * đặt header tải tệp + các header đếm dòng, rồi `streamCsv` ghi từng lô. Dùng chung cho xuất bài nộp biểu mẫu và xuất khách landing.
 *
 * Header `X-Export-*` được lộ qua CORS (`Access-Control-Expose-Headers`) để frontend đọc số dòng và cờ bị cắt.
 *
 * Lỗi giữa chừng (sau khi byte đầu đã đi) không còn trả JSON được nữa: log rồi cắt kết nối để trình duyệt báo tải lỗi thay vì lưu một tệp cụt.
 *
 * @param {import('express').Response} res
 * @param {{
 *   filename: string,
 *   headerCells: unknown[],
 *   ids: Array<string|number>,
 *   total: number,
 *   truncated: boolean,
 *   loadRows: (ids: Array<string|number>) => Promise<object[]>,
 *   rowId: (row: object) => string|number,
 *   toCells: (row: object) => unknown[],
 * }} plan
 * @param {{ logLabel?: string }} [options]
 * @returns {Promise<void>}
 */
export async function sendCsvExport(res, plan, { logLabel = 'CsvExport' } = {}) {
  res.status(200);
  res.set({
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${plan.filename}"`,
    'Cache-Control': 'no-store',
    'X-Export-Row-Count': String(plan.ids.length),
    'X-Export-Total': String(plan.total),
    'X-Export-Truncated': plan.truncated ? 'true' : 'false',
    'Access-Control-Expose-Headers': 'Content-Disposition, X-Export-Row-Count, X-Export-Total, X-Export-Truncated',
  });
  try {
    await streamCsv(res, plan);
    res.end();
  } catch (error) {
    console.error(`[${logLabel}] Lỗi giữa chừng khi ghi CSV:`, error);
    // Không truyền lỗi vào destroy(): response không có listener 'error' thì sự kiện đó thành uncaughtException.
    res.destroy();
  }
}
