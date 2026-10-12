import { describe, it, expect, vi, beforeEach } from 'vitest';

const { saveBlobAsFile } = vi.hoisted(() => ({ saveBlobAsFile: vi.fn() }));
vi.mock('../../features/customers/utils/customerList.helpers', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, saveBlobAsFile: (...args) => saveBlobAsFile(...args) };
});

const { downloadCsvFromRequest, readCsvExportMeta, CSV_EXPORT_MAX_ROWS } = await import('../csvExportDownload');

function csvResponse({ headers = {}, text = '﻿A,B\r\n1,2\r\n' } = {}) {
  return {
    data: new Blob([text], { type: 'text/csv' }),
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="khach-de-lai-thong-tin-bieu-mau-20261013-0030.csv"',
      'x-export-row-count': '1',
      'x-export-total': '1',
      'x-export-truncated': 'false',
      ...headers,
    },
  };
}

beforeEach(() => {
  saveBlobAsFile.mockReset();
});

describe('readCsvExportMeta', () => {
  it('đọc số dòng, tổng, cờ bị cắt từ header X-Export-*', () => {
    expect(readCsvExportMeta({ 'x-export-row-count': '20000', 'x-export-total': '25000', 'x-export-truncated': 'true' })).toEqual({
      rowCount: 20000,
      total: 25000,
      truncated: true,
    });
  });

  it('thiếu header → 0 dòng, không cắt; tổng mặc định bằng số dòng', () => {
    expect(readCsvExportMeta({})).toEqual({ rowCount: 0, total: 0, truncated: false });
    expect(readCsvExportMeta({ 'x-export-row-count': '5' })).toEqual({ rowCount: 5, total: 5, truncated: false });
  });

  it('trần hiển thị khớp backend (20.000)', () => {
    expect(CSV_EXPORT_MAX_ROWS).toBe(20000);
  });
});

describe('downloadCsvFromRequest', () => {
  it('lưu file với tên lấy từ Content-Disposition, trả số liệu', async () => {
    const result = await downloadCsvFromRequest(Promise.resolve(csvResponse()), 'du-phong.csv');
    expect(saveBlobAsFile).toHaveBeenCalledTimes(1);
    const [blob, filename] = saveBlobAsFile.mock.calls[0];
    expect(blob).toBeInstanceOf(Blob);
    expect(filename).toBe('khach-de-lai-thong-tin-bieu-mau-20261013-0030.csv');
    expect(result).toMatchObject({ rowCount: 1, total: 1, truncated: false, filename });
  });

  it('thiếu Content-Disposition → dùng tên dự phòng', async () => {
    await downloadCsvFromRequest(Promise.resolve(csvResponse({ headers: { 'content-disposition': '' } })), 'du-phong.csv');
    expect(saveBlobAsFile.mock.calls[0][1]).toBe('du-phong.csv');
  });

  it('bị cắt ở trần → truncated + tổng thật', async () => {
    const result = await downloadCsvFromRequest(
      Promise.resolve(csvResponse({ headers: { 'x-export-row-count': '20000', 'x-export-total': '25000', 'x-export-truncated': 'true' } }))
    );
    expect(result).toMatchObject({ rowCount: 20000, total: 25000, truncated: true });
  });

  it('server trả lỗi dạng Blob JSON (responseType blob) → ném Error mang message của server, KHÔNG lưu file', async () => {
    const error = Object.assign(new Error('Request failed with status code 404'), {
      response: {
        status: 404,
        data: new Blob([JSON.stringify({ success: false, message: 'Không tìm thấy biểu mẫu', code: 'FORM_NOT_FOUND' })], { type: 'application/json' }),
      },
    });
    await expect(downloadCsvFromRequest(Promise.reject(error))).rejects.toMatchObject({
      message: 'Không tìm thấy biểu mẫu',
      response: { data: { message: 'Không tìm thấy biểu mẫu' } },
    });
    expect(saveBlobAsFile).not.toHaveBeenCalled();
  });

  it('lỗi mạng (không có response) → ném lại nguyên lỗi', async () => {
    const error = new Error('Network Error');
    await expect(downloadCsvFromRequest(Promise.reject(error))).rejects.toBe(error);
    expect(saveBlobAsFile).not.toHaveBeenCalled();
  });

  it('200 nhưng Content-Type là JSON (lỗi lọt qua) → không lưu thành file CSV', async () => {
    const response = {
      data: new Blob([JSON.stringify({ message: 'Hết phiên' })], { type: 'application/json' }),
      headers: { 'content-type': 'application/json; charset=utf-8' },
    };
    await expect(downloadCsvFromRequest(Promise.resolve(response))).rejects.toThrow('Hết phiên');
    expect(saveBlobAsFile).not.toHaveBeenCalled();
  });

  it('thân không phải Blob (môi trường test / axios adapter khác) vẫn lưu được', async () => {
    const response = { data: '﻿A\r\n1\r\n', headers: { 'content-type': 'text/csv', 'x-export-row-count': '1' } };
    await downloadCsvFromRequest(Promise.resolve(response), 'x.csv');
    expect(saveBlobAsFile.mock.calls[0][0]).toBeInstanceOf(Blob);
  });
});
