import { beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * PR-10 mục 4 + 6 (D-22 / D-OLD-A5 / D-25): dịch "tính năng gói" của admin.
 *  - 45 dòng → 3 lô (20 + 20 + 5), không còn một lượt `maxOutputTokens: 1024` làm JSON cắt cụt rồi `JSON.parse` ném → 500;
 *  - mỗi lô ghi token `admin_plan_translate` (bản cũ không ghi gì);
 *  - kết quả hỏng → 422 + câu tiếng Việt, không phải 500.
 * Chạy controller + service THẬT; ranh giới giả lập: Gemini (`generateGeminiText`), chính sách model, sổ token, và các service không liên quan.
 */
const generateGeminiText = jest.fn();
const record = jest.fn();

jest.unstable_mockModule('../../../utils/geminiClient.util.js', () => ({ generateGeminiText }));
jest.unstable_mockModule('../../../services/ai/aiModelPolicy.service.js', () => ({
  resolveAllowedModel: jest.fn(async () => 'gemini-he-thong'),
}));
jest.unstable_mockModule('../../../services/ai/aiUsageMeter.service.js', () => ({ default: { record } }));
jest.unstable_mockModule('../../../services/admin/adminPlans.service.js', () => ({}));
jest.unstable_mockModule('../../../services/cloudflare.service.js', () => ({ default: {} }));
jest.unstable_mockModule('../../../services/audit.service.js', () => ({
  logSystem: jest.fn(),
  AUDIT_ACTIONS: {},
  AUDIT_ENTITY_TYPES: {},
}));
jest.unstable_mockModule('../../../utils/auditContext.util.js', () => ({ getSystemAuditContext: jest.fn(() => ({})) }));

const { translateFeatures } = await import('../adminPlans.controller.js');

const makeReqRes = (body) => {
  const res = { statusCode: 200, body: null };
  res.status = jest.fn((c) => { res.statusCode = c; return res; });
  res.json = jest.fn((d) => { res.body = d; return res; });
  return { req: { body, user: { id: 3 } }, res };
};

const vi = (n) => Array.from({ length: n }, (_, i) => `Tính năng số ${i + 1}`);
/** Gemini giả lập đúng hình dạng thật: đọc các dòng đánh số trong prompt, trả mảng JSON cùng số phần tử. */
const geminiTranslatesLines = async ({ prompt }) => {
  const lines = prompt.split('\n').filter((l) => /^\d+\. /.test(l));
  return {
    text: JSON.stringify(lines.map((l) => `EN: ${l.replace(/^\d+\. /, '')}`)),
    usage: { promptTokens: 10, outputTokens: 5, totalTokens: 15 },
    modelUsed: 'gemini-he-thong',
  };
};

describe('POST translate-features', () => {
  beforeEach(() => {
    generateGeminiText.mockReset().mockImplementation(geminiTranslatesLines);
    record.mockReset().mockResolvedValue(undefined);
  });

  it('45 dòng → 3 lô (20/20/5), đủ 45 bản dịch ĐÚNG THỨ TỰ, 200', async () => {
    const texts = vi(45);
    const { req, res } = makeReqRes({ texts });
    await translateFeatures(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(45);
    expect(res.body.data[0]).toBe('EN: Tính năng số 1');
    expect(res.body.data[44]).toBe('EN: Tính năng số 45');
    expect(generateGeminiText).toHaveBeenCalledTimes(3);
    const sizes = generateGeminiText.mock.calls.map(([arg]) => arg.prompt.split('\n').filter((l) => /^\d+\. /.test(l)).length);
    expect(sizes.sort((a, b) => b - a)).toEqual([20, 20, 5]);
    // Trần token không còn là 1024 cố định.
    expect(generateGeminiText.mock.calls[0][0].maxOutputTokens).toBeGreaterThanOrEqual(2048);
  });

  it('mỗi lô ghi MỘT dòng token admin_plan_translate (theo người bấm, kèm model thật)', async () => {
    const { req, res } = makeReqRes({ texts: vi(45) });
    await translateFeatures(req, res);
    expect(record).toHaveBeenCalledTimes(3);
    expect(record).toHaveBeenCalledWith(3, { promptTokens: 10, outputTokens: 5, totalTokens: 15 }, { feature: 'admin_plan_translate', model: 'gemini-he-thong' });
    expect(generateGeminiText.mock.calls[0][0]).toMatchObject({ feature: 'admin_plan_translate', ownerUserId: 3 });
  });

  it('1 dòng → 1 lượt gọi (như cũ)', async () => {
    const { req, res } = makeReqRes({ texts: ['Gửi email'] });
    await translateFeatures(req, res);
    expect(generateGeminiText).toHaveBeenCalledTimes(1);
    expect(res.body.data).toEqual(['EN: Gửi email']);
  });

  it('JSON cắt cụt giữa chừng → 422 + câu tiếng Việt (KHÔNG 500, KHÔNG SyntaxError), token vẫn được ghi', async () => {
    generateGeminiText.mockResolvedValue({ text: '["EN: Tính năng 1", "EN: Tính nă', usage: { totalTokens: 9 }, modelUsed: 'gemini-he-thong' });
    const { req, res } = makeReqRes({ texts: vi(3) });
    await translateFeatures(req, res);
    expect(res.statusCode).toBe(422);
    expect(res.body).toMatchObject({ success: false, code: 'TRANSLATE_BAD_RESULT' });
    expect(res.body.message).toMatch(/AI dịch trả về kết quả không đọc được/);
    expect(res.body.message).not.toMatch(/JSON|Unexpected|position/);
    expect(record).toHaveBeenCalledTimes(1);
  });

  it('một lô trong nhiều lô hỏng → cả yêu cầu 422 (không trả danh sách thiếu lặng lẽ)', async () => {
    generateGeminiText
      .mockImplementationOnce(geminiTranslatesLines)
      .mockResolvedValueOnce({ text: 'không phải JSON', usage: { totalTokens: 1 }, modelUsed: 'm' });
    const { req, res } = makeReqRes({ texts: vi(25) });
    await translateFeatures(req, res);
    expect(res.statusCode).toBe(422);
  });

  it('sai số phần tử so với số dòng gửi → 422', async () => {
    generateGeminiText.mockResolvedValue({ text: '["chỉ một"]', usage: { totalTokens: 1 }, modelUsed: 'm' });
    const { req, res } = makeReqRes({ texts: vi(3) });
    await translateFeatures(req, res);
    expect(res.statusCode).toBe(422);
  });

  it('JSON bọc ```json … ``` hoặc có chữ thừa quanh mảng vẫn đọc được', async () => {
    generateGeminiText.mockResolvedValue({ text: '```json\n["A", "B"]\n```', usage: { totalTokens: 1 }, modelUsed: 'm' });
    const { req, res } = makeReqRes({ texts: ['a', 'b'] });
    await translateFeatures(req, res);
    expect(res.body.data).toEqual(['A', 'B']);
  });

  it('đầu vào sai → 400 trước khi gọi Gemini: không phải mảng / rỗng / phần tử không phải chuỗi / quá 100 dòng', async () => {
    for (const texts of [undefined, 'abc', [], [1, 2], vi(101)]) {
      const { req, res } = makeReqRes({ texts });
      // eslint-disable-next-line no-await-in-loop
      await translateFeatures(req, res);
      expect(res.statusCode).toBe(400);
    }
    expect(generateGeminiText).not.toHaveBeenCalled();
  });
});
