import { beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * PR-10 mục 8: GET /admin/ai-usage/errors — ô "Lỗi AI 24 giờ: N / tổng M (x%)" của trang Chi phí AI (đọc ai_call_events, không làm trang mới).
 * Controller + service THẬT; ranh giới giả lập: repository. SQL thật + khớp với luật cảnh báo: tests/integration/aiCallEventsAlerts.test.js.
 */
const getErrorSummarySince = jest.fn();
jest.unstable_mockModule('../../../repositories/ai/aiCallEvent.repository.js', () => ({
  insertEvent: jest.fn(),
  deleteOlderThanDays: jest.fn(),
  getErrorSummarySince,
}));
jest.unstable_mockModule('../../../services/admin/aiUsage.service.js', () => ({ getAiUsageOverview: jest.fn() }));

const { errors } = await import('../adminAiUsage.controller.js');

const makeRes = () => {
  const res = { statusCode: 200, body: null };
  res.status = jest.fn((c) => { res.statusCode = c; return res; });
  res.json = jest.fn((d) => { res.body = d; return res; });
  return res;
};

describe('adminAiUsage.errors', () => {
  beforeEach(() => getErrorSummarySince.mockReset());

  it('trả 24 giờ: lỗi / tổng, tỉ lệ, dự phòng, ghi usage hỏng, bộ đếm ghi sổ trong RAM', async () => {
    getErrorSummarySince.mockResolvedValue({ total: 200, failed: 30, fallback: 4, usageWriteFailed: 2 });
    const res = makeRes();

    await errors({}, res);

    expect(getErrorSummarySince).toHaveBeenCalledWith(24);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({ windowHours: 24, total: 200, failed: 30, fallback: 4, usageWriteFailed: 2, rate: 0.15 });
    expect(res.body.data.writer).toEqual(expect.objectContaining({ written: expect.any(Number), writeFailed: expect.any(Number), dropped: expect.any(Number) }));
  });

  it('chưa có lần gọi nào → rate null (trang hiện "—", không phải 0%)', async () => {
    getErrorSummarySince.mockResolvedValue({ total: 0, failed: 0, fallback: 0, usageWriteFailed: 0 });
    const res = makeRes();
    await errors({}, res);
    expect(res.body.data.rate).toBeNull();
  });

  it('CSDL lỗi → 500 JSON có message, không ném ra ngoài', async () => {
    getErrorSummarySince.mockRejectedValue(Object.assign(new Error('DB sập'), { status: 503 }));
    const res = makeRes();
    await errors({}, res);
    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual({ success: false, message: 'DB sập' });
  });
});
