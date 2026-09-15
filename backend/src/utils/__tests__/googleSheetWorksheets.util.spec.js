import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockAxiosGet = jest.fn();

jest.unstable_mockModule('axios', () => ({
  default: {
    get: mockAxiosGet,
  },
}));

const {
  extractSpreadsheetId,
  fetchWorksheetNames,
  getFirstWorksheetName,
  decodeJsQuotedString,
} = await import('../googleSheetWorksheets.util.js');

function htmlviewWithSheetNames(...sheetNames) {
  const pushes = sheetNames.map((n) => `items.push({name: "${n}", gid: "0"});`).join('\n');
  return `<!DOCTYPE html><html><head><script>${pushes}</script></head><body></body></html>`;
}

const VALID_SHEET_URL = 'https://docs.google.com/spreadsheets/d/abc123XYZ_DEF/edit#gid=0';

describe('googleSheetWorksheets.util', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('extractSpreadsheetId', () => {
    it('trích đúng spreadsheetId từ URL', () => {
      expect(extractSpreadsheetId(VALID_SHEET_URL)).toBe('abc123XYZ_DEF');
    });

    it('URL không hợp lệ -> null', () => {
      expect(extractSpreadsheetId('https://example.com')).toBeNull();
      expect(extractSpreadsheetId('')).toBeNull();
      expect(extractSpreadsheetId(null)).toBeNull();
    });
  });

  describe('decodeJsQuotedString', () => {
    it('giải mã chuỗi có dấu " thoát (\\")', () => {
      expect(decodeJsQuotedString('Kh\\"ach h\\"ang')).toBe('Kh"ach h"ang');
    });
  });

  describe('fetchWorksheetNames', () => {
    it('parse HTML có 3 tab (kể cả tên có dấu tiếng Việt) -> đúng thứ tự trong file', async () => {
      mockAxiosGet.mockResolvedValue({
        status: 200,
        data: htmlviewWithSheetNames('Khách tháng 9', 'Trang tính1', 'Dữ liệu cũ'),
      });

      const res = await fetchWorksheetNames('abc123XYZ_DEF');

      expect(res.ok).toBe(true);
      expect(res.names).toEqual(['Khách tháng 9', 'Trang tính1', 'Dữ liệu cũ']);
    });

    it('tên tab có dấu " thoát (\\") -> giải mã đúng', async () => {
      mockAxiosGet.mockResolvedValue({
        status: 200,
        data: `<!DOCTYPE html><script>items.push({name: "Kh\\"ach VIP", gid: "0"});</script>`,
      });

      const res = await fetchWorksheetNames('abc123XYZ_DEF');

      expect(res.ok).toBe(true);
      expect(res.names).toEqual(['Kh"ach VIP']);
    });

    it('HTTP 403 -> ok:false, reason unreadable', async () => {
      mockAxiosGet.mockResolvedValue({ status: 403, data: 'Forbidden' });

      const res = await fetchWorksheetNames('abc123XYZ_DEF');

      expect(res.ok).toBe(false);
      expect(res.reason).toBe('unreadable');
      expect(res.status).toBe(403);
    });
  });

  describe('getFirstWorksheetName', () => {
    it('lấy đúng tên tab ĐẦU TIÊN theo thứ tự trong file', async () => {
      mockAxiosGet.mockResolvedValue({
        status: 200,
        data: htmlviewWithSheetNames('Khách tháng 9', 'Cũ'),
      });

      const name = await getFirstWorksheetName(VALID_SHEET_URL);

      expect(name).toBe('Khách tháng 9');
    });

    it('URL không hợp lệ -> null, không gọi mạng', async () => {
      const name = await getFirstWorksheetName('https://example.com/not-a-sheet');

      expect(name).toBeNull();
      expect(mockAxiosGet).not.toHaveBeenCalled();
    });

    it('lỗi mạng (network error) -> null, không throw', async () => {
      mockAxiosGet.mockRejectedValue(new Error('ECONNRESET'));

      const name = await getFirstWorksheetName(VALID_SHEET_URL);

      expect(name).toBeNull();
    });

    it('timeout -> null, không throw', async () => {
      mockAxiosGet.mockRejectedValue(Object.assign(new Error('timeout of 8000ms exceeded'), { code: 'ECONNABORTED' }));

      const name = await getFirstWorksheetName(VALID_SHEET_URL);

      expect(name).toBeNull();
    });

    it('htmlview trả 403 -> null (để trống, không chặn tạo)', async () => {
      mockAxiosGet.mockResolvedValue({ status: 403, data: 'Forbidden' });

      const name = await getFirstWorksheetName(VALID_SHEET_URL);

      expect(name).toBeNull();
    });

    it('file không có tab nào (htmlview rỗng) -> null', async () => {
      mockAxiosGet.mockResolvedValue({ status: 200, data: '<!DOCTYPE html><html></html>' });

      const name = await getFirstWorksheetName(VALID_SHEET_URL);

      expect(name).toBeNull();
    });

    it('dùng timeout mặc định 8000ms (không dùng READ_SHEET_FETCH_TIMEOUT_MS 180s)', async () => {
      mockAxiosGet.mockResolvedValue({ status: 200, data: htmlviewWithSheetNames('Tab1') });

      await getFirstWorksheetName(VALID_SHEET_URL);

      expect(mockAxiosGet).toHaveBeenCalledWith(
        expect.stringContaining('/htmlview'),
        expect.objectContaining({ timeout: 8000 })
      );
    });
  });
});
