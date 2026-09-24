import { describe, expect, it } from '@jest/globals';

import { buildAiErrorPayload } from '../ai.controller.js';
import { AI_PROVIDER_BUSY_CODE, AI_PROVIDER_BUSY_MESSAGE } from '../../utils/geminiClient.util.js';

/**
 * Sự cố 24/09/2026: khách sinh landing thấy nguyên cục
 *   Gemini API lỗi (503): { "error": { "code": 503, "message": "This model is currently
 *   experiencing high demand…", "status": "UNAVAILABLE" } }
 * vì buildAiErrorPayload trả thẳng `error.message`. Hàm này dùng ở 14 route AI.
 */
const THAN_503 = 'Gemini API lỗi (503): { "error": { "code": 503, "message": "This model is currently experiencing high demand.", "status": "UNAVAILABLE" } }';

const loiGoogle = (geminiStatus, message = THAN_503) => Object.assign(new Error(message), { geminiStatus, status: 503 });

describe('buildAiErrorPayload — không để câu thô của Google lọt ra khách', () => {
  it('ĐÚNG ca khách gặp: 503 thô → câu tiếng Việt bảo thử lại, mã AI_PROVIDER_BUSY', () => {
    const payload = buildAiErrorPayload(loiGoogle(503), 'Lỗi khi sinh landing HTML');

    expect(payload.message).toBe(AI_PROVIDER_BUSY_MESSAGE);
    expect(payload.message).not.toMatch(/[{}]|UNAVAILABLE|high demand|Gemini/);
    expect(payload.code).toBe(AI_PROVIDER_BUSY_CODE);
  });

  it('429 (Google giới hạn tần suất) cũng là "quá tải, thử lại"', () => {
    expect(buildAiErrorPayload(loiGoogle(429)).code).toBe(AI_PROVIDER_BUSY_CODE);
  });

  it('lỗi khác của Google (400) → câu dự phòng của route, không phải JSON tiếng Anh', () => {
    const payload = buildAiErrorPayload(
      loiGoogle(400, 'Gemini API lỗi (400): { "error": { "message": "Request payload size exceeds the limit" } }'),
      'Lỗi khi sinh landing HTML',
    );

    expect(payload.message).toBe('Lỗi khi sinh landing HTML');
    expect(payload.code).toBeUndefined();
  });

  it('lỗi nghiệp vụ của chính mình (không có geminiStatus) → đi NGUYÊN như cũ, kèm các trường hạn mức', () => {
    const err = Object.assign(new Error('Bạn đã dùng hết credit AI của kỳ này.'), {
      code: 'RESOURCE_LIMIT_EXCEEDED', resource: 'ai_credit', used: 100, limit: 100, upgradeRequired: true,
    });

    expect(buildAiErrorPayload(err)).toEqual({
      success: false,
      message: 'Bạn đã dùng hết credit AI của kỳ này.',
      code: 'RESOURCE_LIMIT_EXCEEDED',
      resource: 'ai_credit',
      used: 100,
      limit: 100,
      upgradeRequired: true,
    });
  });

  it('lỗi đã được lớp Gemini đổi câu sẵn (hết lượt thử) → giữ câu tiếng Việt đó', () => {
    const err = Object.assign(new Error(AI_PROVIDER_BUSY_MESSAGE), {
      geminiStatus: 503, code: AI_PROVIDER_BUSY_CODE, providerMessage: THAN_503,
    });

    const payload = buildAiErrorPayload(err);
    expect(payload.message).toBe(AI_PROVIDER_BUSY_MESSAGE);
    expect(JSON.stringify(payload)).not.toContain('high demand');
  });
});
