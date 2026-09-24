import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * Chat tư vấn trang chủ chọn model thế nào.
 *
 * Trước 24/09/2026 nó đọc thẳng GEMINI_MODEL trong .env (không có thì 'gemini-2.5-flash') — đường
 * duy nhất phía khách KHÔNG theo model super admin chọn. Nay theo resolveAllowedModel như mọi tính
 * năng AI khác, NHƯNG vẫn giữ tính chất vốn có của khung chat này: sống sót khi CSDL lỗi.
 */
const resolveAllowedModel = jest.fn();
jest.unstable_mockModule('../ai/aiModelPolicy.service.js', () => ({ resolveAllowedModel }));

const { default: heroConsultationService } = await import('../heroConsultation.service.js');
const { DEFAULT_AI_MODEL } = await import('../../utils/aiModelTier.util.js');

const modelTrongUrl = () => {
  const url = String(global.fetch.mock.calls.at(-1)?.[0] || '');
  return decodeURIComponent(url.match(/models\/([^:]+):generateContent/)?.[1] || '');
};

describe('heroConsultation — chọn model', () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.GEMINI_API_KEY;
  const originalModel = process.env.GEMINI_MODEL;
  let warn;

  beforeEach(() => {
    heroConsultationService._resetForTests();
    process.env.GEMINI_API_KEY = 'mock_key';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: 'Xin chào!' }] } }] }),
    });
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    resolveAllowedModel.mockReset();
  });

  // Dọn ở afterEach chứ không cuối từng ca: ca đỏ giữa chừng mà còn để biến lại thì ca SAU đỏ lây,
  // chỉ sai chỗ (đo được khi đột biến 24/09).
  afterEach(() => {
    global.fetch = originalFetch;
    warn.mockRestore();
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalKey;
    if (originalModel === undefined) delete process.env.GEMINI_MODEL;
    else process.env.GEMINI_MODEL = originalModel;
  });

  it('dùng ĐÚNG model super admin chọn, không phải GEMINI_MODEL trong .env', async () => {
    resolveAllowedModel.mockResolvedValue('gemini-3.5-flash');
    process.env.GEMINI_MODEL = 'model-trong-env-khong-duoc-dung';

    const res = await heroConsultationService.processChat({ visitorId: 'v_admin', message: 'Chào', ip: '10.0.0.1' });

    expect(res.success).toBe(true);
    expect(modelTrongUrl()).toBe('gemini-3.5-flash');
  });

  it('đọc model hệ thống LỖI (CSDL trục trặc) → khung chat vẫn trả lời, bằng model dự phòng', async () => {
    resolveAllowedModel.mockRejectedValue(new Error('password authentication failed for user "postgres"'));

    const res = await heroConsultationService.processChat({ visitorId: 'v_loi', message: 'Chào', ip: '10.0.0.2' });

    expect(res.success).toBe(true);
    expect(res.reply).toBe('Xin chào!');
    expect(modelTrongUrl()).toBe(DEFAULT_AI_MODEL);
  });
});
