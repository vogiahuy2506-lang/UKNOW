/**
 * Integration tests cho `/api/google-sheets` — Batch E.
 *
 * Phạm vi:
 *   - POST /check   (xác thực sheetUrl + sheetName + trả về cột header)
 *   - POST /preview (lấy preview rows + filter cột)
 *
 * Mock:
 *   - `axios.get` (Google Docs htmlview + gviz CSV).
 *   - Papa.parse dùng thật (deterministic, dễ test).
 *
 * Lưu ý:
 *   - Pure passthrough — không đụng DB.
 *   - Controller gọi axios 2 lần per request: htmlview để liệt kê sheetName,
 *     gviz tq?out=csv để lấy CSV.
 */
import { describe, it, expect, beforeAll, beforeEach, jest } from '@jest/globals';

const mockAxiosGet = jest.fn();

jest.unstable_mockModule('axios', () => ({
  default: { get: mockAxiosGet },
}));

const request = (await import('supertest')).default;
const { createApp } = await import('../../src/app.js');
const { truncateAll, createUser } = await import('./helpers/db.js');

let app;

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await truncateAll();
  mockAxiosGet.mockReset();
});

async function loginAs(user) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: user.username, password: user.plainPassword });
  return res.body.data.accessToken;
}

const VALID_SHEET_URL = 'https://docs.google.com/spreadsheets/d/abc123XYZ_DEF/edit#gid=0';

/**
 * Helper trả về htmlview HTML mock với danh sách `sheetNames`.
 */
function htmlviewWithSheetNames(...sheetNames) {
  const pushes = sheetNames.map((n) => `items.push({name: "${n}", gid: "0"});`).join('\n');
  return `<html><script>${pushes}</script></html>`;
}

// ═══════════════════════════════════════════════════════════════════════
// POST /api/google-sheets/check
// ═══════════════════════════════════════════════════════════════════════
describe('POST /api/google-sheets/check', () => {
  it('không token → 401', async () => {
    const res = await request(app).post('/api/google-sheets/check').send({ sheetUrl: VALID_SHEET_URL });
    expect(res.status).toBe(401);
  });

  it('thiếu sheetUrl → 400', async () => {
    const user = await createUser({ username: 'gs-1' });
    const token = await loginAs(user);
    const res = await request(app)
      .post('/api/google-sheets/check')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Thiếu sheetUrl/);
  });

  it('sheetUrl không có spreadsheets/d/<id> → 400', async () => {
    const user = await createUser({ username: 'gs-2' });
    const token = await loginAs(user);
    const res = await request(app)
      .post('/api/google-sheets/check')
      .set('Authorization', `Bearer ${token}`)
      .send({ sheetUrl: 'https://google.com/something' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/không hợp lệ/);
  });

  it('sheetName không tồn tại trong htmlview → 400', async () => {
    const user = await createUser({ username: 'gs-3' });
    const token = await loginAs(user);
    mockAxiosGet.mockImplementation(async (url) => {
      if (url.includes('/htmlview')) {
        return { status: 200, data: htmlviewWithSheetNames('Sheet1', 'Data') };
      }
      return { status: 200, headers: { 'content-type': 'text/csv' }, data: 'a,b\n1,2' };
    });
    const res = await request(app)
      .post('/api/google-sheets/check')
      .set('Authorization', `Bearer ${token}`)
      .send({ sheetUrl: VALID_SHEET_URL, sheetName: 'KhongCoSheetNay' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/sheetName không tồn tại/);
  });

  it('CSV response trả về text/html → 400 (sheet không public)', async () => {
    const user = await createUser({ username: 'gs-4' });
    const token = await loginAs(user);
    mockAxiosGet.mockImplementation(async (url) => {
      if (url.includes('/htmlview')) {
        return { status: 200, data: htmlviewWithSheetNames('Sheet1') };
      }
      return {
        status: 200,
        headers: { 'content-type': 'text/html; charset=UTF-8' },
        data: '<!DOCTYPE html><html><body>Sign in</body></html>',
      };
    });
    const res = await request(app)
      .post('/api/google-sheets/check')
      .set('Authorization', `Bearer ${token}`)
      .send({ sheetUrl: VALID_SHEET_URL });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Không đọc được sheet/);
  });

  it('CSV trả về status 500 → 502 "Không thể tải dữ liệu sheet"', async () => {
    const user = await createUser({ username: 'gs-5' });
    const token = await loginAs(user);
    mockAxiosGet.mockImplementation(async (url) => {
      if (url.includes('/htmlview')) {
        return { status: 200, data: htmlviewWithSheetNames('Sheet1') };
      }
      return { status: 500, headers: { 'content-type': 'text/csv' }, data: '' };
    });
    const res = await request(app)
      .post('/api/google-sheets/check')
      .set('Authorization', `Bearer ${token}`)
      .send({ sheetUrl: VALID_SHEET_URL });
    expect(res.status).toBe(502);
  });

  it('happy path → 200, columns được parse từ header row', async () => {
    const user = await createUser({ username: 'gs-6' });
    const token = await loginAs(user);
    mockAxiosGet.mockImplementation(async (url) => {
      if (url.includes('/htmlview')) {
        return { status: 200, data: htmlviewWithSheetNames('Sheet1', 'Other') };
      }
      return {
        status: 200,
        headers: { 'content-type': 'text/csv' },
        data: 'email,full_name,phone\nfoo@bar.com,Foo,0901\nbaz@bar.com,Baz,0902',
      };
    });
    const res = await request(app)
      .post('/api/google-sheets/check')
      .set('Authorization', `Bearer ${token}`)
      .send({ sheetUrl: VALID_SHEET_URL });
    expect(res.status).toBe(200);
    expect(res.body.data.columns).toEqual(['email', 'full_name', 'phone']);
    expect(res.body.data.meta).toMatchObject({
      spreadsheetId: 'abc123XYZ_DEF',
      sheetName: 'Sheet1',
      headerRow: 1,
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════
// POST /api/google-sheets/preview
// ═══════════════════════════════════════════════════════════════════════
describe('POST /api/google-sheets/preview', () => {
  it('không token → 401', async () => {
    const res = await request(app).post('/api/google-sheets/preview').send({ sheetUrl: VALID_SHEET_URL });
    expect(res.status).toBe(401);
  });

  it('happy path → 200, items đầy đủ với row_number', async () => {
    const user = await createUser({ username: 'gs-p-1' });
    const token = await loginAs(user);
    mockAxiosGet.mockImplementation(async (url) => {
      if (url.includes('/htmlview')) {
        return { status: 200, data: htmlviewWithSheetNames('Sheet1') };
      }
      return {
        status: 200,
        headers: { 'content-type': 'text/csv' },
        data: 'email,full_name\nfoo@bar.com,Foo\nbaz@bar.com,Baz',
      };
    });
    const res = await request(app)
      .post('/api/google-sheets/preview')
      .set('Authorization', `Bearer ${token}`)
      .send({ sheetUrl: VALID_SHEET_URL });
    expect(res.status).toBe(200);
    expect(res.body.data.items).toEqual([
      { row_number: 2, email: 'foo@bar.com', full_name: 'Foo' },
      { row_number: 3, email: 'baz@bar.com', full_name: 'Baz' },
    ]);
    expect(res.body.data.meta.fetched).toBe(2);
    expect(res.body.data.meta.columns).toEqual(['email', 'full_name']);
  });

  it('limit clamp → tối đa PREVIEW_LIMIT_MAX=20000 (đưa limit=99999 vẫn nhận đủ rows)', async () => {
    const user = await createUser({ username: 'gs-p-2' });
    const token = await loginAs(user);
    const csvRows = ['col1,col2'];
    for (let i = 1; i <= 5; i += 1) csvRows.push(`v${i},x${i}`);
    mockAxiosGet.mockImplementation(async (url) => {
      if (url.includes('/htmlview')) {
        return { status: 200, data: htmlviewWithSheetNames('Sheet1') };
      }
      return { status: 200, headers: { 'content-type': 'text/csv' }, data: csvRows.join('\n') };
    });
    const res = await request(app)
      .post('/api/google-sheets/preview')
      .set('Authorization', `Bearer ${token}`)
      .send({ sheetUrl: VALID_SHEET_URL, limit: 99999 });
    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(5); // tất cả rows, không cắt
  });

  it('limit nhỏ hơn số rows → cắt theo limit', async () => {
    const user = await createUser({ username: 'gs-p-3' });
    const token = await loginAs(user);
    mockAxiosGet.mockImplementation(async (url) => {
      if (url.includes('/htmlview')) {
        return { status: 200, data: htmlviewWithSheetNames('Sheet1') };
      }
      return {
        status: 200,
        headers: { 'content-type': 'text/csv' },
        data: 'col1,col2\na,1\nb,2\nc,3\nd,4',
      };
    });
    const res = await request(app)
      .post('/api/google-sheets/preview')
      .set('Authorization', `Bearer ${token}`)
      .send({ sheetUrl: VALID_SHEET_URL, limit: 2 });
    expect(res.body.data.items).toHaveLength(2);
    expect(res.body.data.items[0]).toMatchObject({ row_number: 2, col1: 'a' });
    expect(res.body.data.items[1]).toMatchObject({ row_number: 3, col1: 'b' });
  });

  it('dataSelectedColumns filter → chỉ giữ cột được chọn + row_number', async () => {
    const user = await createUser({ username: 'gs-p-4' });
    const token = await loginAs(user);
    mockAxiosGet.mockImplementation(async (url) => {
      if (url.includes('/htmlview')) {
        return { status: 200, data: htmlviewWithSheetNames('Sheet1') };
      }
      return {
        status: 200,
        headers: { 'content-type': 'text/csv' },
        data: 'email,phone,full_name\nfoo@bar.com,0901,Foo',
      };
    });
    const res = await request(app)
      .post('/api/google-sheets/preview')
      .set('Authorization', `Bearer ${token}`)
      .send({ sheetUrl: VALID_SHEET_URL, dataSelectedColumns: ['email'] });
    expect(res.status).toBe(200);
    expect(res.body.data.items[0]).toEqual({ row_number: 2, email: 'foo@bar.com' });
    expect(res.body.data.items[0]).not.toHaveProperty('phone');
    expect(res.body.data.items[0]).not.toHaveProperty('full_name');
  });

  it('headerRow=2 + dataStartRow=3 → bỏ qua dòng preamble, lấy header từ row 2', async () => {
    const user = await createUser({ username: 'gs-p-5' });
    const token = await loginAs(user);
    mockAxiosGet.mockImplementation(async (url) => {
      if (url.includes('/htmlview')) {
        return { status: 200, data: htmlviewWithSheetNames('Sheet1') };
      }
      return {
        status: 200,
        headers: { 'content-type': 'text/csv' },
        data: 'Báo cáo tháng 5,,\nemail,full_name,\nx@y.com,X,\n',
      };
    });
    const res = await request(app)
      .post('/api/google-sheets/preview')
      .set('Authorization', `Bearer ${token}`)
      .send({ sheetUrl: VALID_SHEET_URL, headerRow: 2, dataStartRow: 3 });
    expect(res.status).toBe(200);
    expect(res.body.data.meta.columns).toEqual(['email', 'full_name']);
    expect(res.body.data.items[0]).toMatchObject({ row_number: 3, email: 'x@y.com', full_name: 'X' });
  });

  it('CSV chỉ có header, không có data row → 200 items=[]', async () => {
    const user = await createUser({ username: 'gs-p-6' });
    const token = await loginAs(user);
    mockAxiosGet.mockImplementation(async (url) => {
      if (url.includes('/htmlview')) {
        return { status: 200, data: htmlviewWithSheetNames('Sheet1') };
      }
      return { status: 200, headers: { 'content-type': 'text/csv' }, data: 'email,phone' };
    });
    const res = await request(app)
      .post('/api/google-sheets/preview')
      .set('Authorization', `Bearer ${token}`)
      .send({ sheetUrl: VALID_SHEET_URL });
    expect(res.status).toBe(200);
    expect(res.body.data.items).toEqual([]);
    expect(res.body.data.meta.fetched).toBe(0);
  });
});
