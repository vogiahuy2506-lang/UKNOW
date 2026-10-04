import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * D-10 (PLAN_SUA_AI_DOT4 PR-3): Nhận xét Dashboard chỉ trừ 1 credit khi AI TẠO RA bản phân tích dùng được.
 *
 * Trước đây `generateInsights` trả `success: true` kèm khung lỗi khi Gemini trả JSON hỏng, controller bỏ qua kết quả
 * `persistInsightIfUsable` rồi `chargeAiCredit` vô điều kiện — khách mất 1 credit cho một khung lỗi (và khung đó còn ghi
 * "Kiểm tra GEMINI_MODEL … GEMINI_API_KEY", lộ tên cấu hình máy chủ).
 *
 * Test chạy SERVICE THẬT + CONTROLLER THẬT; chỉ giả ranh giới: `fetch` tới Google (bằng `Response` thật), repository ghi DB,
 * bộ ghi token, chính sách model, và `chargeAiCredit` (để đếm số lần trừ).
 */
const getInsightSnapshot = jest.fn();
const chargeAiCredit = jest.fn();
const replaceForUser = jest.fn();
const record = jest.fn();

jest.unstable_mockModule('../../services/dashboard/dashboardAnalytics.service.js', () => ({
  default: { getInsightSnapshot },
}));
jest.unstable_mockModule('../../middleware/aiCredit.middleware.js', () => ({ chargeAiCredit }));
jest.unstable_mockModule('../../utils/workspaceContext.util.js', () => ({ resolveWorkspaceOwnerId: () => 7 }));
jest.unstable_mockModule('../../repositories/dashboard/dashboardInsight.repository.js', () => ({
  default: { replaceForUser, findLatestByUser: jest.fn() },
}));
jest.unstable_mockModule('../../services/ai/aiModelPolicy.service.js', () => ({
  resolveAllowedModel: jest.fn(async () => 'gemini-2.5-flash'),
}));
jest.unstable_mockModule('../../services/ai/aiUsageMeter.service.js', () => ({ default: { record } }));

const { default: dashboardController } = await import('../dashboard.controller.js');

const originalFetch = global.fetch;
const originalApiKey = process.env.GEMINI_API_KEY;

const SNAPSHOT = {
  filters: { startDate: '2026-09-01', endDate: '2026-09-30', campaignType: 'all', campaignIds: [] },
  overview: {
    sent: { total: 200, friendRequests: 0, byChannel: [{ channel: 'email', sent: 200 }] },
    failed: { total: 4 },
    email: { sent: 200, opened: 50, openRate: 25, clicked: 10, clickRate: 5 },
    clicks: { total: 12, byChannel: [{ channel: 'email', clicked: 12 }] },
    orders: { pending: 3, completed: 4, byChannel: [{ channel: 'email', pending: 3, completed: 4 }] },
  },
  dailySent: [],
  ordersTimeline: [],
  campaigns: [],
};

/** Phản hồi generateContent của Google với `text` là phần model trả về. */
const googleReply = (text) => new Response(JSON.stringify({
  candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }],
  usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
}), { status: 200, headers: { 'content-type': 'application/json; charset=UTF-8' } });

const USABLE_INSIGHT = JSON.stringify({
  overview: 'Chiến dịch email hiệu quả ổn định trong tháng.',
  key_metrics_analysis: { open_rate: { value: '25%', comment: 'Khá' } },
  insights: [{ title: 'Tối ưu tiêu đề', type: 'opportunity', priority: 'high', detail: 'Thử A/B', impact: 'Tăng mở' }],
  charts: {},
  notes: [],
});

const makeRes = () => {
  const res = { status: jest.fn(() => res), json: jest.fn(() => res), set: jest.fn(() => res) };
  return res;
};

const call = async (locale = 'vi') => {
  const res = makeRes();
  await dashboardController.generateInsights(
    { body: { filters: {}, locale }, query: {}, headers: {}, user: { id: 7, role: 'user' } },
    res,
  );
  return res;
};

describe('POST /dashboard/insights — chỉ trừ credit khi có bản phân tích dùng được (D-10)', () => {
  let errorSpy;
  let logSpy;

  beforeEach(() => {
    process.env.GEMINI_API_KEY = 'AIza-khoa-bi-mat-dashboard-credit';
    getInsightSnapshot.mockReset().mockResolvedValue(SNAPSHOT);
    chargeAiCredit.mockReset().mockResolvedValue(undefined);
    replaceForUser.mockReset().mockResolvedValue(undefined);
    record.mockReset().mockResolvedValue(undefined);
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
    logSpy.mockRestore();
    global.fetch = originalFetch;
    if (originalApiKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalApiKey;
  });

  it('AI trả JSON dùng được → lưu DB và trừ ĐÚNG 1 lần', async () => {
    global.fetch = jest.fn(async () => googleReply(USABLE_INSIGHT));

    const res = await call('vi');

    expect(res.json.mock.calls[0][0]).toMatchObject({ success: true, data: { overview: 'Chiến dịch email hiệu quả ổn định trong tháng.' } });
    expect(res.json.mock.calls[0][0].data.parseFailed).toBeUndefined();
    expect(replaceForUser).toHaveBeenCalledTimes(1);
    expect(chargeAiCredit).toHaveBeenCalledTimes(1);
  });

  it('AI trả rác không phải JSON (vi) → khung lỗi `parseFailed`, KHÔNG trừ credit, KHÔNG lưu DB', async () => {
    global.fetch = jest.fn(async () => googleReply('xin loi toi khong the tra ve JSON luc nay'));

    const res = await call('vi');

    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.data.parseFailed).toBe(true);
    expect(chargeAiCredit).not.toHaveBeenCalled();
    expect(replaceForUser).not.toHaveBeenCalled();
  });

  it('khung lỗi không còn lộ tên cấu hình máy chủ (GEMINI_MODEL / GEMINI_API_KEY) — cả vi lẫn en', async () => {
    for (const locale of ['vi', 'en']) {
      global.fetch = jest.fn(async () => googleReply('khong phai json'));
      // eslint-disable-next-line no-await-in-loop
      const res = await call(locale);
      const shown = JSON.stringify(res.json.mock.calls[0][0]);
      expect(shown).not.toMatch(/GEMINI_MODEL|GEMINI_API_KEY|gemini-2\.5-flash/);
    }
  });

  it('AI trả rác (en) → cũng KHÔNG trừ credit và KHÔNG lưu DB — bản en từng lọt vì bộ dò chỉ biết câu tiếng Việt', async () => {
    global.fetch = jest.fn(async () => googleReply('sorry, I cannot return JSON right now'));

    const res = await call('en');

    expect(res.json.mock.calls[0][0].data.overview).toMatch(/^Failed to parse JSON from Gemini/);
    expect(res.json.mock.calls[0][0].data.parseFailed).toBe(true);
    expect(chargeAiCredit).not.toHaveBeenCalled();
    expect(replaceForUser).not.toHaveBeenCalled();
  });

  it('Gemini trả rỗng (không nội dung) → không trừ credit', async () => {
    global.fetch = jest.fn(async () => googleReply(''));

    const res = await call('vi');

    expect(res.json.mock.calls[0][0].data.parseFailed).toBe(true);
    expect(chargeAiCredit).not.toHaveBeenCalled();
  });

  it('bản phân tích dùng được nhưng GHI DB lỗi → khách đã nhận kết quả thật nên VẪN trừ 1 lần (không biến lượt thành công thành miễn phí)', async () => {
    global.fetch = jest.fn(async () => googleReply(USABLE_INSIGHT));
    replaceForUser.mockRejectedValue(new Error('connection terminated'));

    const res = await call('vi');

    expect(res.json.mock.calls[0][0]).toMatchObject({ success: true });
    expect(chargeAiCredit).toHaveBeenCalledTimes(1);
  });
});
