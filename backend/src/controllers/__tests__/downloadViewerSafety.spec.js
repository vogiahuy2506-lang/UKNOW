import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

// fileDownloadToken không còn fallback secret — test phải tự đặt.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-download-viewer';

/**
 * Trang xem tệp GET /file/:token trả HTML từ origin ứng dụng: tên tệp/MIME lấy từ DB (người dùng
 * đặt được) phải được escape. IP ghi sự kiện lấy từ req.ip (trust proxy), không từ header thô.
 */

const mockClientQuery = jest.fn();
const mockFindFileByStorageKey = jest.fn();

jest.unstable_mockModule('../../config/database.js', () => ({
  default: {
    getClient: jest.fn(async () => ({ query: mockClientQuery, release: jest.fn() })),
    query: jest.fn(),
  },
}));

jest.unstable_mockModule('../../repositories/download.repository.js', () => ({
  default: {
    findFileByStorageKey: mockFindFileByStorageKey,
  },
}));

const { default: downloadController } = await import('../download.controller.js');
const { generateFileToken } = await import('../../utils/fileDownloadToken.js');

function buildReq({ token, ip = '203.0.113.9', headers = {}, query = {} } = {}) {
  return {
    params: { token },
    query,
    ip,
    headers,
    socket: { remoteAddress: '10.0.0.1' },
    protocol: 'https',
    get: (name) => ({ host: 'app.example.com', 'user-agent': 'jest' }[String(name).toLowerCase()]),
  };
}

function buildRes() {
  const res = {};
  res.status = jest.fn(() => res);
  res.send = jest.fn((body) => { res.body = body; return res; });
  return res;
}

describe('downloadController — trang xem tệp & IP', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockClientQuery.mockResolvedValue({ rows: [] });
  });

  it('_getIp dùng req.ip, bỏ qua X-Forwarded-For client tự đặt', () => {
    const req = buildReq({ ip: '203.0.113.9', headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' } });
    expect(downloadController._getIp(req)).toBe('203.0.113.9');
  });

  it('_getIp không có req.ip → rơi về socket.remoteAddress', () => {
    const req = buildReq({ ip: null, headers: { 'x-forwarded-for': '1.2.3.4' } });
    expect(downloadController._getIp(req)).toBe('10.0.0.1');
  });

  it('handleView escape tên hiển thị / tên gốc / MIME trong HTML', async () => {
    mockFindFileByStorageKey.mockResolvedValue({
      id: 1,
      display_name: '<img src=x onerror=alert(1)>',
      original_name: '"><script>alert(2)</script>.png',
      mime_type: 'video/mp4" onerror="alert(3)',
    });
    const token = generateFileToken('uploads/10/1700_a.png', null, null, null);
    const res = buildRes();

    await downloadController.handleView(buildReq({ token }), res);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.body).not.toContain('<img src=x onerror=alert(1)>');
    expect(res.body).not.toContain('<script>alert(2)</script>');
    expect(res.body).not.toContain('onerror="alert(3)');
    expect(res.body).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(res.body).toContain('&quot;&gt;&lt;script&gt;alert(2)&lt;/script&gt;.png');
  });

  it('handleView ghi sự kiện OPEN với IP từ req.ip', async () => {
    mockFindFileByStorageKey.mockResolvedValue({ id: 1, display_name: 'Báo giá', original_name: 'bao-gia.pdf', mime_type: 'application/pdf' });
    const token = generateFileToken('uploads/10/1700_bao-gia.pdf', null, null, null);

    await downloadController.handleView(
      buildReq({ token, ip: '198.51.100.7', headers: { 'x-forwarded-for': '6.6.6.6' } }),
      buildRes()
    );
    // _logAccessEvent chạy nền (không await trong handleView) — chờ một nhịp.
    await new Promise((resolve) => setImmediate(resolve));

    const insertCall = mockClientQuery.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO file_access_events'));
    expect(insertCall).toBeDefined();
    expect(insertCall[1]).toContain('198.51.100.7');
    expect(insertCall[1]).not.toContain('6.6.6.6');
  });

  /**
   * M-06 (Thư viện media): ảnh xem trước TRONG ỨNG DỤNG dùng link ký không gắn chiến dịch/khách/email. Mỗi ảnh từng ghi
   * một dòng DOWNLOAD (BEGIN/COMMIT rồi mới trả byte) — mở thư viện là phồng số "lượt tải tệp". Chỉ bỏ ghi cho đúng loại
   * link đó; link gửi khách và tải thật vẫn ghi.
   */
  describe('handleDownload — sự kiện DOWNLOAD', () => {
    const downloadInserts = () => mockClientQuery.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO file_access_events'));
    let sendLocalFile;

    beforeEach(() => {
      mockFindFileByStorageKey.mockResolvedValue({ id: 1, original_name: 'anh.png', mime_type: 'image/png' });
      sendLocalFile = jest.spyOn(downloadController, 'sendLocalFile').mockResolvedValue(true);
    });

    afterEach(() => {
      sendLocalFile.mockRestore();
    });

    it('xem trước trong app (preview=true, token trống chiến dịch/khách/email) → vẫn trả ảnh nhưng KHÔNG ghi sự kiện', async () => {
      const token = generateFileToken('uploads/10/chat/1700_anh.png', null, null, null);

      await downloadController.handleDownload(buildReq({ token, query: { preview: 'true' } }), buildRes());

      expect(downloadInserts()).toHaveLength(0);
      expect(sendLocalFile).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ storageKey: 'uploads/10/chat/1700_anh.png', preview: true }));
    });

    it('tải thật (không preview) vẫn ghi DOWNLOAD', async () => {
      const token = generateFileToken('uploads/10/chat/1700_anh.png', null, null, null);

      await downloadController.handleDownload(buildReq({ token }), buildRes());

      expect(downloadInserts()).toHaveLength(1);
      expect(sendLocalFile).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ preview: false }));
    });

    it.each([
      ['gắn khách hàng', [7, 33, null]],
      ['gắn email người nhận', [null, null, 'khach@example.com']],
    ])('link gửi khách (%s) dù preview=true vẫn ghi — trang xem tệp trong email dùng đúng đường này', async (_label, [campaignId, customerId, email]) => {
      const token = generateFileToken('uploads/10/email/1700_anh.png', campaignId, customerId, email);

      await downloadController.handleDownload(buildReq({ token, query: { preview: 'true' } }), buildRes());

      expect(downloadInserts()).toHaveLength(1);
    });
  });
});
