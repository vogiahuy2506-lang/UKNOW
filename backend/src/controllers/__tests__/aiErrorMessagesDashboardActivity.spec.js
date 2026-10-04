import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import { generateGeminiContent } from '../../utils/geminiClient.util.js';

/**
 * G2.4 (D-19, 03/10/2026): Nhận xét Dashboard và Tóm tắt Hộp thư trả thẳng `error.message`. Lỗi 400/403/404 của Google (model bị
 * khai tử → 404) đến tay khách nguyên câu `Gemini API lỗi (404): {json}`; hết giờ ra "This operation was aborted".
 * Lỗi trong test sinh ra từ LÕI THẬT với `fetch` giả bằng `Response` thật — đúng hình dạng lỗi production, không tự chế.
 */
const generateInsights = jest.fn();
const persistInsightIfUsable = jest.fn();
const getInsightSnapshot = jest.fn();
const summarizeDailyActivity = jest.fn();
const chargeAiCredit = jest.fn();

jest.unstable_mockModule('../../services/dashboard/dashboardAnalytics.service.js', () => ({
  default: { getInsightSnapshot },
}));
jest.unstable_mockModule('../../services/dashboard/dashboardInsights.service.js', () => ({
  default: { generateInsights, persistInsightIfUsable },
}));
jest.unstable_mockModule('../../middleware/aiCredit.middleware.js', () => ({ chargeAiCredit }));
jest.unstable_mockModule('../../utils/workspaceContext.util.js', () => ({
  resolveWorkspaceOwnerId: () => 7,
  // aiActivity.controller (G2 giao tài khoản Zalo) đọc ngữ cảnh để lọc theo tài khoản được giao — chủ: thấy hết.
  getWorkspaceContext: () => ({ workspaceOwnerId: 7, actorUserId: 7, contextType: 'owner' }),
}));
jest.unstable_mockModule('../../services/chatbot/aiActivity.service.js', () => ({
  default: { summarizeDailyActivity },
}));
jest.unstable_mockModule('../../services/storage/storageQuota.service.js', () => ({ resolveWorkspaceOwnerId: () => 7 }));
jest.unstable_mockModule('../../services/audit.service.js', () => ({
  AUDIT_ACTIONS: {},
  AUDIT_ENTITY_TYPES: {},
  logWorkspace: jest.fn(),
}));
jest.unstable_mockModule('../../utils/auditContext.util.js', () => ({ getWorkspaceAuditContext: () => ({}) }));

const { default: dashboardController } = await import('../dashboard.controller.js');
const { default: aiActivityController } = await import('../chatbot/aiActivity.controller.js');

const originalFetch = global.fetch;
const originalApiKey = process.env.GEMINI_API_KEY;

const googleReply = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=UTF-8' },
});

/** Lỗi THẬT do lõi ném ra khi Google trả `status`/`body`. */
async function realCoreError(response, options = {}) {
  global.fetch = jest.fn().mockImplementation(async () => response.clone());
  return generateGeminiContent({
    parts: [{ text: 'hi' }], retryDelaysMs: [0, 0], retryBudgetMs: 60_000, ...options,
  }).catch((e) => e);
}

const makeRes = () => {
  const res = { status: jest.fn(() => res), json: jest.fn(() => res) };
  return res;
};
const sentBody = (res) => res.json.mock.calls[0][0];

const MODEL_KHAI_TU = googleReply(404, {
  error: { code: 404, message: 'models/gemini-3.5-flash is not found for API version v1beta, or is not supported for generateContent.', status: 'NOT_FOUND' },
});
const QUA_TAI = googleReply(503, {
  error: { code: 503, message: 'This model is currently experiencing high demand. Spikes in demand are usually temporary.', status: 'UNAVAILABLE' },
});

describe('Nhận xét Dashboard (POST /dashboard/insights) — câu lỗi cho khách', () => {
  let errorSpy;
  let warnSpy;

  beforeEach(() => {
    process.env.GEMINI_API_KEY = 'AIza-khoa-bi-mat-dashboard';
    getInsightSnapshot.mockReset().mockResolvedValue({ filters: {} });
    generateInsights.mockReset();
    chargeAiCredit.mockReset();
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
    warnSpy.mockRestore();
    global.fetch = originalFetch;
    if (originalApiKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalApiKey;
  });

  const call = async () => {
    const res = makeRes();
    await dashboardController.generateInsights({ body: { filters: {} }, query: {}, headers: {}, user: { id: 7, role: 'user' } }, res);
    return res;
  };

  it('model bị Google khai tử (404 thật) → KHÔNG lộ "Gemini API lỗi (404): {json}", trả câu tiếng Việt; không trừ credit', async () => {
    generateInsights.mockRejectedValue(await realCoreError(MODEL_KHAI_TU));

    const res = await call();

    const body = sentBody(res);
    expect(body.success).toBe(false);
    expect(body.message).toBe('Không thể tạo nhận xét báo cáo bằng AI. Vui lòng thử lại sau.');
    expect(body.message).not.toMatch(/Gemini API|not found|NOT_FOUND|[{}]/);
    expect(chargeAiCredit).not.toHaveBeenCalled();
  });

  it('Google quá tải mãi (503 thật) → câu AI_PROVIDER_BUSY tiếng Việt + mã', async () => {
    generateInsights.mockRejectedValue(await realCoreError(QUA_TAI));

    const res = await call();

    expect(sentBody(res)).toMatchObject({
      success: false,
      message: 'Máy chủ AI đang quá tải tạm thời. Bạn vui lòng thử lại sau ít phút.',
      code: 'AI_PROVIDER_BUSY',
    });
    expect(res.status).toHaveBeenCalledWith(503);
  });

  it('Google treo, hết giờ → câu tiếng Việt AI_TIMEOUT (không phải "This operation was aborted")', async () => {
    global.fetch = jest.fn((_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(Object.assign(new Error('This operation was aborted'), { name: 'AbortError' })));
    }));
    generateInsights.mockRejectedValue(await generateGeminiContent({ parts: [{ text: 'hi' }], timeoutMs: 30 }).catch((e) => e));

    const res = await call();

    const body = sentBody(res);
    expect(body.code).toBe('AI_TIMEOUT');
    expect(body.message).not.toMatch(/aborted/i);
  });

  it('lỗi KHÔNG phải của Google (vd hết hạn mức) vẫn đi nguyên như cũ, kèm trường hạn mức', async () => {
    generateInsights.mockRejectedValue(Object.assign(new Error('Bạn đã dùng hết credit AI.'), {
      status: 402, code: 'RESOURCE_LIMIT_EXCEEDED', resource: 'ai_credit', used: 10, limit: 10,
    }));

    const res = await call();

    expect(res.status).toHaveBeenCalledWith(402);
    expect(sentBody(res)).toMatchObject({ message: 'Bạn đã dùng hết credit AI.', code: 'RESOURCE_LIMIT_EXCEEDED', resource: 'ai_credit' });
  });

  it('log máy chủ vẫn đọc được nguyên nhân thật (câu gốc của Google) dù khách chỉ thấy câu tiếng Việt', async () => {
    generateInsights.mockRejectedValue(await realCoreError(QUA_TAI));

    await call();

    const logged = errorSpy.mock.calls.flat().map(String).join(' ');
    expect(logged).toContain('high demand');
    expect(logged).not.toContain('AIza-khoa-bi-mat-dashboard');
  });
});

describe('Tóm tắt Hộp thư (POST /chatbot/inbox/ai-activity/summarize) — câu lỗi cho khách', () => {
  let errorSpy;
  let warnSpy;

  beforeEach(() => {
    process.env.GEMINI_API_KEY = 'AIza-khoa-bi-mat-tomtat';
    summarizeDailyActivity.mockReset();
    chargeAiCredit.mockReset();
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
    warnSpy.mockRestore();
    global.fetch = originalFetch;
    if (originalApiKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalApiKey;
  });

  const call = async () => {
    const res = makeRes();
    await aiActivityController.summarizeActivity({ body: {}, query: {}, user: { id: 7 } }, res);
    return res;
  };

  it('model bị Google khai tử (404 thật) → câu dự phòng tiếng Việt, KHÔNG lộ JSON tiếng Anh', async () => {
    summarizeDailyActivity.mockRejectedValue(await realCoreError(MODEL_KHAI_TU));

    const res = await call();

    const body = sentBody(res);
    expect(body.message).toBe('Không thể tóm tắt hội thoại bằng AI');
    expect(body.message).not.toMatch(/Gemini API|not found|NOT_FOUND|[{}]/);
    expect(chargeAiCredit).not.toHaveBeenCalled();
  });

  it('Google quá tải mãi → câu AI_PROVIDER_BUSY', async () => {
    summarizeDailyActivity.mockRejectedValue(await realCoreError(QUA_TAI));

    const res = await call();

    expect(sentBody(res)).toMatchObject({ code: 'AI_PROVIDER_BUSY', message: 'Máy chủ AI đang quá tải tạm thời. Bạn vui lòng thử lại sau ít phút.' });
  });

  it('lỗi không phải của Google → giữ nguyên câu của chính mình', async () => {
    summarizeDailyActivity.mockRejectedValue(Object.assign(new Error('Không có hội thoại nào trong ngày này.'), { status: 404 }));

    const res = await call();

    expect(res.status).toHaveBeenCalledWith(404);
    expect(sentBody(res).message).toBe('Không có hội thoại nào trong ngày này.');
  });
});
