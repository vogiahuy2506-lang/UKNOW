import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * PR-10 mục 3(b) (D-OLD-C4 / D-22): ghi usage hỏng trước đây chỉ ở docker log (mất mỗi lần deploy) nên không ai đếm được "bao nhiêu lượt Google đã
 * tính tiền mà sổ token không có". Nay `aiUsageMeter.record` hỏng → MỘT sự kiện bền `error_code = USAGE_WRITE_FAILED` (tầng 'app', không vào tỉ lệ
 * lỗi Gemini) mà cảnh báo `ai_usage_write_failed` đọc. Ranh giới giả lập: trackUsage (CSDL) và recordAiCallEvent (sổ bền).
 */
const trackUsage = jest.fn();
const recordAiCallEvent = jest.fn(() => Promise.resolve(true));

jest.unstable_mockModule('../../payment/usageTracking.service.js', () => ({ default: { trackUsage } }));
jest.unstable_mockModule('../../../utils/geminiClient.util.js', () => ({ generateGeminiContent: jest.fn() }));
jest.unstable_mockModule('../aiModelPolicy.service.js', () => ({
  resolveAllowedModel: jest.fn(async (_u, m) => m || 'gemini-2.5-flash'),
  getFallbackModel: jest.fn(async () => null),
}));
jest.unstable_mockModule('../aiCallEvents.service.js', () => ({
  recordAiCallEvent,
  AI_CALL_LAYER: { GEMINI: 'gemini', APP: 'app' },
  AI_CALL_OUTCOME: { ERROR: 'error' },
  USAGE_WRITE_FAILED_CODE: 'USAGE_WRITE_FAILED',
}));

const { default: aiUsageMeter } = await import('../aiUsageMeter.service.js');

describe('aiUsageMeter.record — ghi usage hỏng thành sổ bền', () => {
  let errorSpy;

  beforeEach(() => {
    trackUsage.mockReset();
    recordAiCallEvent.mockClear();
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => errorSpy.mockRestore());

  it('trackUsage hỏng → đúng MỘT sự kiện USAGE_WRITE_FAILED (tầng app) mang feature/model/chủ/người thao tác/số token, KHÔNG mang câu lỗi CSDL', async () => {
    trackUsage.mockRejectedValue(Object.assign(new Error('relation "usage_logs" does not exist'), { code: '42P01' }));

    await expect(aiUsageMeter.record(7, { promptTokens: 4, outputTokens: 6, totalTokens: 10 }, {
      feature: 'chatbot_reply', model: 'gemini-x', actorUserId: 9,
    })).resolves.toBeUndefined();

    expect(recordAiCallEvent).toHaveBeenCalledTimes(1);
    expect(recordAiCallEvent).toHaveBeenCalledWith({
      layer: 'app',
      feature: 'chatbot_reply',
      model: 'gemini-x',
      outcome: 'error',
      errorCode: 'USAGE_WRITE_FAILED',
      ownerUserId: 7,
      actorUserId: 9,
      meta: { totalTokens: 10, pgCode: '42P01' },
    });
    expect(JSON.stringify(recordAiCallEvent.mock.calls[0][0])).not.toContain('usage_logs');
  });

  it('ghi thành công → KHÔNG có sự kiện nào', async () => {
    trackUsage.mockResolvedValue(undefined);
    await aiUsageMeter.record(7, { totalTokens: 10 }, { feature: 'x' });
    expect(recordAiCallEvent).not.toHaveBeenCalled();
  });

  it('không có token để ghi → không ghi, không có sự kiện', async () => {
    await aiUsageMeter.record(7, { totalTokens: 0 }, { feature: 'x' });
    expect(trackUsage).not.toHaveBeenCalled();
    expect(recordAiCallEvent).not.toHaveBeenCalled();
  });

  it('sổ bền cũng hỏng (ném đồng bộ) → record() vẫn KHÔNG ném lỗi', async () => {
    trackUsage.mockRejectedValue(new Error('DB sập'));
    recordAiCallEvent.mockImplementationOnce(() => { throw new Error('sổ bền hỏng'); });
    await expect(aiUsageMeter.record(7, { totalTokens: 10 }, { feature: 'x' })).resolves.toBeUndefined();
  });

  it('khách vãng lai (không chủ) vẫn ghi sự kiện với owner null', async () => {
    trackUsage.mockRejectedValue(new Error('DB sập'));
    await aiUsageMeter.record(null, { totalTokens: 5 }, { feature: 'hero_consultation' });
    expect(recordAiCallEvent.mock.calls[0][0]).toMatchObject({ ownerUserId: null, actorUserId: null, feature: 'hero_consultation' });
  });
});
