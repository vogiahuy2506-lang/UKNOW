import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

const trackUsage = jest.fn();
const generateGeminiContent = jest.fn();

jest.unstable_mockModule('../../payment/usageTracking.service.js', () => ({
  default: {
    trackUsage,
  },
}));

jest.unstable_mockModule('../../../utils/geminiClient.util.js', () => ({
  generateGeminiContent,
}));

const getFallbackModel = jest.fn(async () => null);

jest.unstable_mockModule('../aiModelPolicy.service.js', () => ({
  resolveAllowedModel: jest.fn(async (_userId, model) => model || 'gemini-2.5-flash'),
  getFallbackModel,
}));

const { resolveAllowedModel } = await import('../aiModelPolicy.service.js');
const { default: aiUsageMeter } = await import('../aiUsageMeter.service.js');

describe('aiUsageMeter.service', () => {
  beforeEach(() => {
    trackUsage.mockReset();
    generateGeminiContent.mockReset();
    resolveAllowedModel.mockReset();
    resolveAllowedModel.mockImplementation(async (_userId, model) => model || 'gemini-2.5-flash');
  });

  it('reserve no longer blocks on token quota — returns model and output cap only', async () => {
    resolveAllowedModel.mockResolvedValue('gemini-2.5-flash');

    const result = await aiUsageMeter.reserve(10, {
      model: 'gemini-2.5-pro',
      requestedMaxOutputTokens: 2048,
    });

    expect(result.model).toBe('gemini-2.5-flash');
    expect(result.maxOutputTokens).toBe(2048);
    expect(result.remaining).toBeNull();
  });

  it('generateWithBudget still records token usage for admin analytics', async () => {
    generateGeminiContent.mockResolvedValue({
      text: 'ok',
      usage: { promptTokens: 1, outputTokens: 2, totalTokens: 3 },
    });

    await aiUsageMeter.generateWithBudget(10, {
      parts: [{ text: 'hi' }],
      feature: 'test',
    });

    expect(trackUsage).toHaveBeenCalledWith(10, 'ai_token', 3, expect.objectContaining({
      feature: 'test',
      totalTokens: 3,
      actorUserId: 10,
    }));
  });

  it('generateWithBudget keeps billing userId but records separate actorUserId', async () => {
    generateGeminiContent.mockResolvedValue({
      text: 'ok',
      usage: { promptTokens: 1, outputTokens: 1, totalTokens: 2 },
    });

    await aiUsageMeter.generateWithBudget(3, {
      parts: [{ text: 'hi' }],
      feature: 'landing_page',
      metadata: { actorUserId: 9 },
    });

    expect(trackUsage).toHaveBeenCalledWith(3, 'ai_token', 2, expect.objectContaining({
      feature: 'landing_page',
      actorUserId: 9,
    }));
  });

  it('generateWithBudget records actual modelUsed when fallback model is used', async () => {
    resolveAllowedModel.mockResolvedValue('gemini-chinh');
    getFallbackModel.mockResolvedValue('gemini-du-phong');

    generateGeminiContent.mockResolvedValue({
      text: 'kết quả từ dự phòng',
      usage: { promptTokens: 10, outputTokens: 20, totalTokens: 30 },
      modelUsed: 'gemini-du-phong',
    });

    await aiUsageMeter.generateWithBudget(5, {
      parts: [{ text: 'generate' }],
      feature: 'landing_builder',
    });

    expect(generateGeminiContent).toHaveBeenCalledWith(expect.objectContaining({
      model: 'gemini-chinh',
      fallbackModel: 'gemini-du-phong',
    }));

    // Bắt buộc ghi usage bằng model thật sự đã trả lời (gemini-du-phong), không phải model hệ thống (gemini-chinh)
    expect(trackUsage).toHaveBeenCalledWith(5, 'ai_token', 30, expect.objectContaining({
      feature: 'landing_builder',
      model: 'gemini-du-phong',
      totalTokens: 30,
    }));
  });

  it('generateWithBudget ghi fallbackUsed=true vào metadata CHỈ khi dự phòng thật đã trả lời (lọc được "bao nhiêu lượt phải nhờ dự phòng")', async () => {
    resolveAllowedModel.mockResolvedValue('gemini-chinh');
    getFallbackModel.mockResolvedValue('gemini-du-phong');

    generateGeminiContent.mockResolvedValueOnce({
      text: 'từ dự phòng',
      usage: { promptTokens: 1, outputTokens: 2, totalTokens: 3 },
      modelUsed: 'gemini-du-phong',
      fallbackUsed: true,
    });
    await aiUsageMeter.generateWithBudget(5, { parts: [{ text: 'a' }], feature: 'landing_builder' });
    expect(trackUsage).toHaveBeenLastCalledWith(5, 'ai_token', 3, expect.objectContaining({ fallbackUsed: true }));

    generateGeminiContent.mockResolvedValueOnce({
      text: 'từ model chính',
      usage: { promptTokens: 1, outputTokens: 2, totalTokens: 3 },
      modelUsed: 'gemini-chinh',
      fallbackUsed: false,
    });
    await aiUsageMeter.generateWithBudget(5, { parts: [{ text: 'b' }], feature: 'landing_builder' });
    expect(trackUsage.mock.calls.at(-1)[3]).not.toHaveProperty('fallbackUsed');
  });

  // G2 (03/10/2026): chatbot trả lời khách cũng dùng model dự phòng; tra danh mục model là việc PHỤ — hỏng thì mất dự phòng,
  // KHÔNG được làm hỏng câu trả lời.
  describe('resolveFallbackModel — không bao giờ ném lỗi', () => {
    it('trả model dự phòng do super admin chọn', async () => {
      getFallbackModel.mockResolvedValueOnce('gemini-du-phong');
      await expect(aiUsageMeter.resolveFallbackModel()).resolves.toBe('gemini-du-phong');
    });

    it('chưa chọn dự phòng → null', async () => {
      getFallbackModel.mockResolvedValueOnce(null);
      await expect(aiUsageMeter.resolveFallbackModel()).resolves.toBeNull();
    });

    it('tra danh mục model lỗi (CSDL chập chờn) → null, không ném', async () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      getFallbackModel.mockRejectedValueOnce(new Error('connection terminated'));

      await expect(aiUsageMeter.resolveFallbackModel()).resolves.toBeNull();
      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    });
  });

  // PR-12 (audit_ai.md C-4): loi goi Gemini KHONG co chu tai khoan (khach vang lai) van ghi, id_user = NULL.
  describe('record — loi goi khong co chu tai khoan (id_user NULL)', () => {
    it.each([[null], [undefined], [0], ['']])('userId = %p -> van ghi, id_user NULL, actorUserId null', async (userId) => {
      await aiUsageMeter.record(userId, { promptTokens: 10, outputTokens: 5, totalTokens: 15 }, {
        feature: 'hero_consultation',
        model: 'gemini-3.5-flash',
      });

      expect(trackUsage).toHaveBeenCalledTimes(1);
      expect(trackUsage).toHaveBeenCalledWith(null, 'ai_token', 15, expect.objectContaining({
        feature: 'hero_consultation',
        model: 'gemini-3.5-flash',
        promptTokens: 10,
        outputTokens: 5,
        totalTokens: 15,
        actorUserId: null,
      }));
    });

    it('totalTokens <= 0 thi khong ghi (du co hay khong co chu)', async () => {
      await aiUsageMeter.record(null, { totalTokens: 0 }, { feature: 'hero_consultation' });
      await aiUsageMeter.record(7, { totalTokens: 0 }, { feature: 'smart_chat' });
      await aiUsageMeter.record(null, undefined, { feature: 'hero_consultation' });
      expect(trackUsage).not.toHaveBeenCalled();
    });

    it('co chu: van ghi id_user = chu, actorUserId mac dinh = chu (khong doi hanh vi cu)', async () => {
      await aiUsageMeter.record(7, { totalTokens: 3 }, { feature: 'smart_chat' });
      expect(trackUsage).toHaveBeenCalledWith(7, 'ai_token', 3, expect.objectContaining({ actorUserId: 7 }));
    });
  });

  describe('record — ghi hut vi loi CSDL phai LO ra trong log', () => {
    let errorSpy;
    let warnSpy;
    beforeEach(() => {
      errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    });
    afterEach(() => {
      errorSpy.mockRestore();
      warnSpy.mockRestore();
    });

    it('console.error co tag "[aiUsageMeter] ghi usage that bai", kem feature va model; khong nem loi', async () => {
      trackUsage.mockRejectedValue(new Error('connection terminated'));

      await expect(aiUsageMeter.record(7, { totalTokens: 12 }, { feature: 'kb_ocr', model: 'gemini-3.5-flash' }))
        .resolves.toBeUndefined();

      expect(errorSpy).toHaveBeenCalledTimes(1);
      const line = String(errorSpy.mock.calls[0][0]);
      expect(line).toContain('[aiUsageMeter] ghi usage thất bại');
      expect(line).toContain('feature=kb_ocr');
      expect(line).toContain('model=gemini-3.5-flash');
      expect(line).toContain('user=7');
      expect(line).toContain('connection terminated');
      expect(warnSpy).not.toHaveBeenCalled(); // truoc day chi la warn — de bi lan trong nhieu canh bao khac
    });

    it('khach vang lai ghi hut: log ghi user=null (thay duoc do la dong khong co chu)', async () => {
      trackUsage.mockRejectedValue(new Error('boom'));
      await aiUsageMeter.record(null, { totalTokens: 9 }, { feature: 'hero_consultation' });
      const line = String(errorSpy.mock.calls[0][0]);
      expect(line).toContain('feature=hero_consultation');
      expect(line).toContain('user=null');
    });
  });

  it('isLimitError recognizes ai_credit resource', () => {
    expect(aiUsageMeter.isLimitError({
      code: 'RESOURCE_LIMIT_EXCEEDED',
      resource: 'ai_credit',
    })).toBe(true);
  });
});
