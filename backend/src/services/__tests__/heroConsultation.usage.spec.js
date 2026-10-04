import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * PR-12 (audit_ai.md C-4): chat tư vấn trang chủ là lời gọi Gemini của KHÁCH VÃNG LAI (không tài khoản) — Google tính tiền
 * nhưng bản cũ không ghi gì. Nay ghi token `hero_consultation` với id_user NULL (userId = null).
 */
const resolveAllowedModel = jest.fn();
const record = jest.fn();
jest.unstable_mockModule('../ai/aiModelPolicy.service.js', () => ({ resolveAllowedModel }));
jest.unstable_mockModule('../ai/aiUsageMeter.service.js', () => ({ default: { record } }));

const { default: heroConsultationService } = await import('../heroConsultation.service.js');

const geminiReply = (text, usageMetadata) => ({
  ok: true,
  json: async () => ({ candidates: [{ content: { parts: [{ text }] } }], ...(usageMetadata ? { usageMetadata } : {}) }),
});

describe('heroConsultation — ghi token của khách vãng lai', () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.GEMINI_API_KEY;

  beforeEach(() => {
    heroConsultationService._resetForTests();
    process.env.GEMINI_API_KEY = 'mock_key';
    resolveAllowedModel.mockReset();
    resolveAllowedModel.mockResolvedValue('gemini-3.5-flash');
    record.mockReset();
    record.mockResolvedValue(undefined);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalKey;
  });

  it('ghi token feature=hero_consultation, chủ = null (khách vãng lai), model thật đã gọi', async () => {
    global.fetch = jest.fn().mockResolvedValue(geminiReply('Xin chào!', {
      promptTokenCount: 1200, candidatesTokenCount: 80, totalTokenCount: 1300,
    }));

    const res = await heroConsultationService.processChat({ visitorId: 'v_usage_1', message: 'Chào', ip: '10.1.0.1' });

    expect(res.success).toBe(true);
    expect(res.reply).toBe('Xin chào!');
    expect(record).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith(
      null,
      { promptTokens: 1200, outputTokens: 80, totalTokens: 1300 },
      { feature: 'hero_consultation', model: 'gemini-3.5-flash' },
    );
  });

  it('ghi sổ ném lỗi / treo → khung chat vẫn trả lời khách (không await, không phá luồng chính)', async () => {
    global.fetch = jest.fn().mockResolvedValue(geminiReply('Vẫn trả lời.', { totalTokenCount: 500 }));
    record.mockReturnValue(new Promise(() => {})); // không bao giờ xong

    const res = await heroConsultationService.processChat({ visitorId: 'v_usage_2', message: 'Chào', ip: '10.1.0.2' });
    expect(res).toMatchObject({ success: true, reply: 'Vẫn trả lời.' });

    record.mockRejectedValue(new Error('db down'));
    const res2 = await heroConsultationService.processChat({ visitorId: 'v_usage_3', message: 'Chào', ip: '10.1.0.3' });
    expect(res2).toMatchObject({ success: true, reply: 'Vẫn trả lời.' });
  });

  it('Gemini lỗi (không có phản hồi để tính tiền): không ghi', async () => {
    // Response THẬT (lõi đọc `response.text()` của lỗi). 400 để khỏi chờ nghỉ giữa các lượt thử lại của 5xx.
    global.fetch = jest.fn().mockImplementation(async () => new Response(
      JSON.stringify({ error: { code: 400, message: 'boom', status: 'INVALID_ARGUMENT' } }),
      { status: 400, headers: { 'content-type': 'application/json' } },
    ));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const res = await heroConsultationService.processChat({ visitorId: 'v_usage_4', message: 'Chào', ip: '10.1.0.4' });

    expect(res.success).toBe(false);
    expect(record).not.toHaveBeenCalled();
    console.error.mockRestore();
  });
});
