import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * D-09 (PLAN_SUA_AI_DOT4 PR-3): lượt "Phân tích bằng AI" của Dashboard chạy trong MỘT ngân sách thời gian tổng 85 s.
 *
 * Trước đây mỗi lời gọi `timeoutMs: 120000`, không `totalTimeoutMs`, và khi lượt đầu không đọc được JSON thì chạy thêm một lượt
 * rút gọn — tối đa 2 × 120 s trong khi Cloudflare cắt request /api ở 100 s (server vẫn chạy tiếp, ghi kết quả, tốn tiền Gemini).
 *
 * Giả ranh giới: lõi `generateGeminiContent` (bắt tham số + đẩy đồng hồ giả), chính sách model, bộ ghi token, repository DB.
 * Đồng hồ: `Date.now` giả, mỗi lời gọi Gemini "tốn" số mili-giây chỉ định.
 */
const generateGeminiContent = jest.fn();

jest.unstable_mockModule('../../../utils/geminiClient.util.js', () => ({ generateGeminiContent }));
jest.unstable_mockModule('../../ai/aiModelPolicy.service.js', () => ({
  resolveAllowedModel: jest.fn(async () => 'gemini-2.5-flash'),
}));
jest.unstable_mockModule('../../ai/aiUsageMeter.service.js', () => ({
  default: { record: jest.fn(async () => {}) },
}));
jest.unstable_mockModule('../../../repositories/dashboard/dashboardInsight.repository.js', () => ({
  default: { findLatestByUser: jest.fn(), replaceForUser: jest.fn() },
}));

const { default: service, INSIGHT_TOTAL_BUDGET_MS, INSIGHT_RETRY_MIN_REMAINING_MS } = await import('../dashboardInsights.service.js');

const SNAPSHOT = {
  filters: { startDate: '2026-09-01', endDate: '2026-09-30', campaignType: 'all', campaignIds: [] },
  overview: { sent: { total: 10 }, email: { sent: 10 }, clicks: { total: 1 }, orders: { pending: 0, completed: 1 } },
  dailySent: [],
  ordersTimeline: [],
  campaigns: [],
};

const GOOD = JSON.stringify({ overview: 'Ổn định.', key_metrics_analysis: { open_rate: { value: '25%' } }, charts: {}, notes: [] });
const reply = (text) => ({ text, finishReason: 'STOP', blockReason: undefined, usage: { totalTokens: 15 } });

describe('generateInsights — ngân sách thời gian tổng (D-09)', () => {
  let now;
  let dateSpy;
  let logSpy;

  /** Mỗi lời gọi Gemini tốn `costMs` rồi trả `text`. */
  const queueCall = (costMs, text) => {
    generateGeminiContent.mockImplementationOnce(async () => {
      now += costMs;
      return reply(text);
    });
  };

  beforeEach(() => {
    now = 1_700_000_000_000;
    dateSpy = jest.spyOn(Date, 'now').mockImplementation(() => now);
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    generateGeminiContent.mockReset();
  });

  afterEach(() => {
    dateSpy.mockRestore();
    logSpy.mockRestore();
  });

  it('hằng số: trần tổng 85 s, bỏ lượt rút gọn khi còn < 40 s', () => {
    expect(INSIGHT_TOTAL_BUDGET_MS).toBe(85000);
    expect(INSIGHT_RETRY_MIN_REMAINING_MS).toBe(40000);
  });

  it('lượt đầu truyền totalTimeoutMs = 85 s (và timeoutMs không vượt phần còn lại) cho LÕI — không còn 120 s/lượt', async () => {
    queueCall(1000, GOOD);

    await service.generateInsights({ userId: 7, snapshot: SNAPSHOT, locale: 'vi' });

    expect(generateGeminiContent).toHaveBeenCalledTimes(1);
    const args = generateGeminiContent.mock.calls[0][0];
    expect(args.totalTimeoutMs).toBe(85000);
    expect(args.timeoutMs).toBeLessThanOrEqual(85000);
    expect(args.parts).toEqual([{ text: expect.stringContaining('SỐ LIỆU TỔNG QUAN') }]);
    expect(args.jsonMode).toBe(true);
  });

  it('lượt đầu xong sau 10 s nhưng JSON hỏng → chạy lượt rút gọn với ngân sách = phần còn lại (75 s), không phải 85 s mới', async () => {
    queueCall(10_000, 'khong phai json');
    queueCall(5_000, GOOD);

    const out = await service.generateInsights({ userId: 7, snapshot: SNAPSHOT, locale: 'vi' });

    expect(generateGeminiContent).toHaveBeenCalledTimes(2);
    expect(generateGeminiContent.mock.calls[1][0].totalTimeoutMs).toBe(75_000);
    expect(generateGeminiContent.mock.calls[1][0].timeoutMs).toBe(75_000);
    expect(out.data.parseFailed).toBeUndefined();
    expect(out.data.notes.join(' ')).toMatch(/thu gọn/);
  });

  it('lượt đầu tốn 50 s (còn 35 s < 40 s) rồi JSON hỏng → BỎ lượt rút gọn, trả khung lỗi parseFailed', async () => {
    queueCall(50_000, 'khong phai json');
    queueCall(5_000, GOOD);

    const out = await service.generateInsights({ userId: 7, snapshot: SNAPSHOT, locale: 'vi' });

    expect(generateGeminiContent).toHaveBeenCalledTimes(1);
    expect(out.data.parseFailed).toBe(true);
  });

  it('biên: còn đúng 40 s thì vẫn chạy lượt rút gọn; còn 39,999 s thì không', async () => {
    queueCall(45_000, 'khong phai json');
    queueCall(1_000, GOOD);
    await service.generateInsights({ userId: 7, snapshot: SNAPSHOT, locale: 'vi' });
    expect(generateGeminiContent).toHaveBeenCalledTimes(2);

    generateGeminiContent.mockReset();
    queueCall(45_001, 'khong phai json');
    queueCall(1_000, GOOD);
    await service.generateInsights({ userId: 7, snapshot: SNAPSHOT, locale: 'vi' });
    expect(generateGeminiContent).toHaveBeenCalledTimes(1);
  });

  it('lõi ném AI_TIMEOUT (hết ngân sách) → lỗi đi thẳng lên controller, không thử thêm lượt nào', async () => {
    const timeoutErr = Object.assign(new Error('AI phản hồi quá lâu. Bạn vui lòng thử lại sau ít phút.'), { code: 'AI_TIMEOUT', status: 503 });
    generateGeminiContent.mockRejectedValueOnce(timeoutErr);

    await expect(service.generateInsights({ userId: 7, snapshot: SNAPSHOT, locale: 'vi' })).rejects.toBe(timeoutErr);
    expect(generateGeminiContent).toHaveBeenCalledTimes(1);
  });
});
