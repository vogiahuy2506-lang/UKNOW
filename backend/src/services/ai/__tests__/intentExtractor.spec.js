import { describe, expect, it, jest } from '@jest/globals';
import { CAMPAIGN_INTENT_V1_SCHEMA } from '../campaignIntent.schema.js';

const mockGenerateGeminiContent = jest.fn();
jest.unstable_mockModule('../../../utils/geminiClient.util.js', () => ({
  generateGeminiContent: mockGenerateGeminiContent,
}));

const {
  extractIntentFromText,
  compareIntentShadow,
  runShadowIntentExtraction,
} = await import('../intentExtractor.service.js');

describe('PR-3: Shadow Intent Extraction via LLM', () => {
  afterEach(() => {
    jest.clearAllMocks();
    delete process.env.INTENT_SHADOW_ENABLED;
  });

  describe('extractIntentFromText', () => {
    it('gọi generateGeminiContent với responseSchema = CAMPAIGN_INTENT_V1_SCHEMA', async () => {
      mockGenerateGeminiContent.mockResolvedValueOnce({
        text: JSON.stringify({
          version: 1,
          channel: 'email',
          audience: { type: 'sheet' },
        }),
      });

      const res = await extractIntentFromText('Gửi email từ google sheet');
      expect(mockGenerateGeminiContent).toHaveBeenCalledTimes(1);
      const callArg = mockGenerateGeminiContent.mock.calls[0][0];
      expect(callArg.responseSchema).toEqual(CAMPAIGN_INTENT_V1_SCHEMA);
      expect(res.intent).toEqual({
        version: 1,
        channel: 'email',
        audience: { type: 'sheet' },
      });
      expect(res.error).toBeNull();
    });

    it('LLM lỗi mạng hoặc timeout → không throw, trả về error', async () => {
      mockGenerateGeminiContent.mockRejectedValueOnce(new Error('Network timeout'));

      const res = await extractIntentFromText('Gửi email');
      expect(res.intent).toBeNull();
      expect(res.error).toContain('Network timeout');
    });

    it('LLM trả JSON sai schema → không throw, trả về error validation', async () => {
      mockGenerateGeminiContent.mockResolvedValueOnce({
        text: JSON.stringify({
          version: 2, // version sai
          channel: 'sms', // channel sai
        }),
      });

      const res = await extractIntentFromText('Gửi sms');
      expect(res.intent).toBeNull();
      expect(res.error).toContain('Schema validation failed');
    });

    it('Text rỗng → trả error, không gọi Gemini', async () => {
      const res = await extractIntentFromText('');
      expect(res.intent).toBeNull();
      expect(res.error).toBe('Empty text');
      expect(mockGenerateGeminiContent).not.toHaveBeenCalled();
    });
  });

  describe('compareIntentShadow', () => {
    it('tính toán agree = true khi regex và LLM khớp kênh, nguồn và lịch', () => {
      const regexState = { channel: 'email', dataSource: 'sheet', schedule: { mode: 'once' } };
      const llmIntent = {
        version: 1,
        channel: 'email',
        audience: { type: 'sheet' },
        schedule: { type: 'once' },
      };

      const comparison = compareIntentShadow({ turn: 1, regexState, llmIntent });
      expect(comparison.agree).toBe(true);
      expect(comparison.regexChannel).toBe('email');
      expect(comparison.llmChannel).toBe('email');
      expect(comparison.regexDataSource).toBe('sheet');
      expect(comparison.llmDataSource).toBe('sheet');
      // Không được chứa nội dung tin nhắn người dùng
      expect(comparison).not.toHaveProperty('text');
      expect(comparison).not.toHaveProperty('prompt');
      expect(comparison).not.toHaveProperty('message');
    });

    it('tính toán agree = false khi có điểm lệch giữa regex và LLM', () => {
      const regexState = { channel: 'email', dataSource: 'db' };
      const llmIntent = {
        version: 1,
        channel: 'zalo',
        audience: { type: 'sheet' },
      };

      const comparison = compareIntentShadow({ turn: 2, regexState, llmIntent });
      expect(comparison.agree).toBe(false);
      expect(comparison.regexChannel).toBe('email');
      expect(comparison.llmChannel).toBe('zalo');
    });
  });

  describe('runShadowIntentExtraction', () => {
    it('khi INTENT_SHADOW_ENABLED tắt → không gọi Gemini, trả null', async () => {
      process.env.INTENT_SHADOW_ENABLED = 'false';

      const res = await runShadowIntentExtraction({
        text: 'Tạo chiến dịch email',
        regexState: { channel: 'email' },
      });

      expect(res).toBeNull();
      expect(mockGenerateGeminiContent).not.toHaveBeenCalled();
    });

    it('khi INTENT_SHADOW_ENABLED = true → gọi Gemini, ghi log so sánh và trả shadowLog', async () => {
      process.env.INTENT_SHADOW_ENABLED = 'true';
      mockGenerateGeminiContent.mockResolvedValueOnce({
        text: JSON.stringify({
          version: 1,
          channel: 'email',
        }),
      });

      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      const res = await runShadowIntentExtraction({
        text: 'Tạo chiến dịch email',
        regexState: { channel: 'email' },
        turn: 1,
      });

      expect(mockGenerateGeminiContent).toHaveBeenCalledTimes(1);
      expect(res).not.toBeNull();
      expect(res.agree).toBe(true);
      expect(logSpy).toHaveBeenCalledWith('[IntentShadow]', expect.any(String));

      logSpy.mockRestore();
    });
  });
});
