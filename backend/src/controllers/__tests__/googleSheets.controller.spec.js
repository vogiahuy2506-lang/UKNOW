import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockAxiosGet = jest.fn();

jest.unstable_mockModule('axios', () => ({
  default: {
    get: mockAxiosGet,
  },
}));

const { default: googleSheetsController } = await import('../googleSheets.controller.js');

const makeRes = () => {
  const res = {
    statusCode: 200,
    body: null,
    status: jest.fn((code) => {
      res.statusCode = code;
      return res;
    }),
    json: jest.fn((data) => {
      res.body = data;
      return res;
    }),
  };
  return res;
};

const VALID_SHEET_URL = 'https://docs.google.com/spreadsheets/d/abc123XYZ_DEF/edit#gid=0';

function htmlviewWithSheetNames(...sheetNames) {
  const pushes = sheetNames.map((n) => `items.push({name: "${n}", gid: "0"});`).join('\n');
  return `<!DOCTYPE html><html><head><script>${pushes}</script></head><body></body></html>`;
}

describe('GoogleSheetsController Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('check()', () => {
    it('empty sheetName -> fetches first tab without &sheet= param and skips htmlview validation', async () => {
      mockAxiosGet.mockImplementation(async (url) => {
        expect(url).not.toContain('&sheet=');
        expect(url).toContain('/gviz/tq?tqx=out:csv');
        return {
          status: 200,
          headers: { 'content-type': 'text/csv' },
          data: 'Họ tên,Email,Số điện thoại\nNguyen Van A,a@test.com,0901234567',
        };
      });

      const req = { body: { sheetUrl: VALID_SHEET_URL, sheetName: '' } };
      const res = makeRes();

      await googleSheetsController.check(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.columns).toEqual(['Họ tên', 'Email', 'Số điện thoại']);
      expect(res.body.data.meta.sheetName).toBe('');
      expect(res.body.data.meta.csvUrl).not.toContain('&sheet=');
      // Verify htmlview was NOT called because sheetName is empty
      expect(mockAxiosGet).toHaveBeenCalledTimes(1);
    });

    it('Vietnamese sheetName -> validates via htmlview and encodes in csvUrl', async () => {
      mockAxiosGet.mockImplementation(async (url) => {
        if (url.includes('/htmlview')) {
          return { status: 200, data: htmlviewWithSheetNames('Trang tính1', 'Sheet 2') };
        }
        expect(url).toContain('&sheet=Trang%20t%C3%ADnh1');
        return {
          status: 200,
          headers: { 'content-type': 'text/csv' },
          data: 'Tên,SĐT\nVan B,0909999999',
        };
      });

      const req = { body: { sheetUrl: VALID_SHEET_URL, sheetName: 'Trang tính1' } };
      const res = makeRes();

      await googleSheetsController.check(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.columns).toEqual(['Tên', 'SĐT']);
      expect(res.body.data.meta.sheetName).toBe('Trang tính1');
      expect(mockAxiosGet).toHaveBeenCalledTimes(2);
    });

    it('missing tab name in htmlview -> 400 with list of available tabs', async () => {
      mockAxiosGet.mockImplementation(async (url) => {
        if (url.includes('/htmlview')) {
          return { status: 200, data: htmlviewWithSheetNames('Trang tính1', 'Data 2026') };
        }
        return { status: 200, data: '' };
      });

      const req = { body: { sheetUrl: VALID_SHEET_URL, sheetName: 'Sheet1' } };
      const res = makeRes();

      await googleSheetsController.check(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Không tìm thấy tab "Sheet1" trong file.');
      expect(res.body.message).toContain('File này có: Trang tính1, Data 2026');
    });

    it('unreadable file (e.g. 403 not public) when validating sheetName -> 400 with clear permission message', async () => {
      mockAxiosGet.mockImplementation(async (url) => {
        if (url.includes('/htmlview')) {
          return { status: 403, data: 'Forbidden' };
        }
        return { status: 403, data: '' };
      });

      const req = { body: { sheetUrl: VALID_SHEET_URL, sheetName: 'Tab1' } };
      const res = makeRes();

      await googleSheetsController.check(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Không đọc được file.');
      expect(res.body.message).toContain('Bất kỳ ai có đường liên kết');
    });
  });

  describe('preview()', () => {
    it('empty sheetName -> previews first tab without &sheet=', async () => {
      mockAxiosGet.mockImplementation(async (url) => {
        expect(url).not.toContain('&sheet=');
        return {
          status: 200,
          headers: { 'content-type': 'text/csv' },
          data: 'Email,Name\na@test.com,Alice\nb@test.com,Bob',
        };
      });

      const req = { body: { sheetUrl: VALID_SHEET_URL, sheetName: '', limit: 10 } };
      const res = makeRes();

      await googleSheetsController.preview(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.items).toEqual([
        { row_number: 2, Email: 'a@test.com', Name: 'Alice' },
        { row_number: 3, Email: 'b@test.com', Name: 'Bob' },
      ]);
      expect(res.body.data.meta.sheetName).toBe('');
    });

    it('invalid sheetName in preview -> 400 with available tabs', async () => {
      mockAxiosGet.mockImplementation(async (url) => {
        if (url.includes('/htmlview')) {
          return { status: 200, data: htmlviewWithSheetNames('DanhSach') };
        }
        return { status: 200, data: '' };
      });

      const req = { body: { sheetUrl: VALID_SHEET_URL, sheetName: 'SaiTen' } };
      const res = makeRes();

      await googleSheetsController.preview(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Không tìm thấy tab "SaiTen" trong file.');
      expect(res.body.message).toContain('File này có: DanhSach');
    });
  });
});
