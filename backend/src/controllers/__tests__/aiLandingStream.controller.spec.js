import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

// Đầu file (các mock module) dùng chung với ai.controller.spec.js: controller nạp rất nhiều dịch vụ, mock đủ để không đụng CSDL.
const processSmartChat = jest.fn();
const chargeAiCredit = jest.fn();
const createSession = jest.fn();
const saveMessages = jest.fn();
const getSessionWizardState = jest.fn();
const updateWizardStateSections = jest.fn();
const tryHandleHelpChat = jest.fn(async () => null);
// PR-2 (PLAN_VA_TRO_LY_AI_2026-09-28) — lưới an toàn mục 2, đọc trực tiếp bởi ai.controller.js.
const answerWithDocs = jest.fn();
const searchHelpChunks = jest.fn();
const insertUnanswered = jest.fn(async () => {});

// createCampaignFromDraft: mock các service dùng bởi luồng tạo chiến dịch để test không đụng DB.
const prepareScript = jest.fn();
const autoCreateEmailTemplates = jest.fn(async () => {});
const autoCreateZaloTemplates = jest.fn(async () => {});
const cleanupAutoCreatedTemplates = jest.fn(async () => {});
const assertResourceVersionsCurrent = jest.fn(async () => {});
const buildConfirmationView = jest.fn(async () => ({ readyToCreate: true }));
const validateNodeConfig = jest.fn(() => ({ valid: true, errors: [] }));
const campaignControllerCreate = jest.fn();
const fillReadSheetFirstTabNames = jest.fn(async () => {});

jest.unstable_mockModule('../../services/ai/aiCampaign.service.js', () => ({
  default: {
    processSmartChat,
  },
}));

const editHtml = jest.fn();
const generateLanding = jest.fn();
jest.unstable_mockModule('../../services/ai/aiLandingPage.service.js', () => ({
  default: {
    editHtml,
    generate: generateLanding,
  },
}));

const ingestLandingAttachments = jest.fn();
jest.unstable_mockModule('../../services/landing/landingAsset.service.js', () => ({
  ingestLandingAttachments,
  mergeAndFilterLandingFiles: jest.fn((files) => ({ files: files || [], skipped: [] })),
}));

const findLandingByIdInScope = jest.fn();
jest.unstable_mockModule('../../repositories/landingPage.repository.js', () => ({
  default: {
    findByIdInScope: findLandingByIdInScope,
  },
}));
jest.unstable_mockModule('../../services/ai/aiCampaignDraft.service.js', () => ({
  default: {
    prepareScript,
    autoCreateEmailTemplates,
    autoCreateZaloTemplates,
    cleanupAutoCreatedTemplates,
  },
}));
jest.unstable_mockModule('../../services/ai/campaignConfirmation.service.js', () => ({
  default: {
    assertResourceVersionsCurrent,
    buildConfirmationView,
  },
}));
jest.unstable_mockModule('../../services/campaign/campaignNodeRegistry.service.js', () => ({
  default: {
    validateNodeConfig,
  },
}));
jest.unstable_mockModule('../../services/campaign/readSheetAutoName.service.js', () => ({
  fillReadSheetFirstTabNames,
}));
jest.unstable_mockModule('../../services/ai/businessProfile.service.js', () => ({
  default: {},
  serializeProductList: jest.fn(() => ''),
}));
jest.unstable_mockModule('../../services/ai/customChat.service.js', () => ({ default: {} }));
jest.unstable_mockModule('../../repositories/ai/chatbot.repository.js', () => ({
  default: {
    findChatbotById: jest.fn(),
  },
}));
jest.unstable_mockModule('../../services/chatbot/chatbotStudioConversation.service.js', () => ({ default: {} }));
jest.unstable_mockModule('../../services/ai/aiModelPolicy.service.js', () => ({
  getAllowedModelsForUser: jest.fn(),
  savePreferredModelForUser: jest.fn(),
  resolveAllowedModel: jest.fn(async () => 'gemini-2.5-flash'),
}));
jest.unstable_mockModule('../../services/help/helpAssistant.service.js', () => ({
  tryHandleHelpChat,
  answerWithDocs,
  HELP_ROUTE_LABELS: {
    hỏi_đáp: 'hỏi_đáp',
    làm_giúp: 'làm_giúp',
    không_rõ: 'không_rõ',
    ngoài_phạm_vi: 'ngoài_phạm_vi',
  },
}));
jest.unstable_mockModule('../../services/help/helpCenter.service.js', () => ({
  searchHelpChunks,
}));
jest.unstable_mockModule('../../repositories/help/helpArticle.repository.js', () => ({
  insertUnanswered,
}));
jest.unstable_mockModule('../../middleware/aiCredit.middleware.js', () => ({
  chargeAiCredit,
}));
jest.unstable_mockModule('../campaign.controller.js', () => ({
  default: {
    create: campaignControllerCreate,
  },
}));
jest.unstable_mockModule('../../services/campaign/campaignCrud.service.js', () => ({ default: {} }));
// C P3-3: ai.controller kiểm hạn mức tài nguyên (campaigns / landingPages) ở lượt mở luồng — mock đủ export để module khác nạp được.
const ALLOWED_SLOT = { allowed: true, limit: null, currentCount: 0, message: null };
const checkUserResourceLimit = jest.fn(async () => ALLOWED_SLOT);
jest.unstable_mockModule('../../utils/userResourceLimit.util.js', () => ({
  checkUserResourceLimit,
  enforceResourceLimitTx: jest.fn(),
  createResourceLimitExceededError: jest.fn(),
  getResourceUsageSnapshot: jest.fn(),
}));
const getLandingPageMessage = jest.fn();
const updateLandingPageMessage = jest.fn();
const saveMessagesReturningIds = jest.fn();
const saveAssistantMessage = jest.fn();
// G3a.2: bốn endpoint phiên (list/đọc/PATCH wizard/xoá) — spec cuối file khẳng định chúng tra theo id NGƯỜI THAO TÁC.
const getUserSessions = jest.fn();
const getSessionMessages = jest.fn();
const writeWizardState = jest.fn();
const deleteSession = jest.fn();
jest.unstable_mockModule('../../repositories/aiSession.repository.js', () => ({
  createSession,
  saveMessages,
  getSessionWizardState,
  updateWizardStateSections,
  getLandingPageMessage,
  updateLandingPageMessage,
  saveMessagesReturningIds,
  saveAssistantMessage,
  getUserSessions,
  getSessionMessages,
  writeWizardState,
  deleteSession,
  listUserFilesSinceLastLanding: jest.fn(async () => []),
}));

const { default: aiController } = await import('../ai.controller.js');
const { default: express } = await import('express');
const { attachToExistingLandingTurn, resetLandingTurnsForTest } = await import('../../services/ai/aiLandingTurn.service.js');
const { createClientAbortError } = await import('../../utils/aiAbort.util.js');
const { StorageQuotaExceededError } = await import('../../services/storage/storageQuota.service.js');
const { NDJSON, until, deferred, openNdjsonClient } = await import('../../services/ai/__tests__/helpers/ndjsonTestClient.js');

const REQUEST_ID = 'req-00000001-aaaa';

/**
 * PR-9 (B-4) — hai route landing trả phản hồi LUỒNG NDJSON khi client xin, đúng hình dạng JSON cũ ở dòng `result`; lỗi trước khi
 * mở luồng vẫn là JSON + mã HTTP như cũ. Chạy trên máy chủ HTTP thật (cổng ngẫu nhiên) với controller THẬT, còn dịch vụ AI / CSDL
 * là mock như các spec controller khác.
 */
describe('ai.controller — luồng NDJSON của sinh / sửa landing (PR-9)', () => {
  let server;
  let port;

  const startApp = async () => {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.user = { id: Number(req.headers['x-user'] || 7), role: 'user' };
      next();
    });
    app.post('/gen', attachToExistingLandingTurn('generate', { pingMs: 15 }), (req, res) => aiController.generateLandingHtml(req, res));
    app.post('/edit', attachToExistingLandingTurn('edit', { pingMs: 15 }), (req, res) => aiController.editLandingHtml(req, res));
    server = await new Promise((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    port = server.address().port;
  };

  const gen = (body = {}, opts = {}) => openNdjsonClient(port, { path: '/gen', body: { prompt: 'Landing khoá học', requestId: REQUEST_ID, ...body }, ...opts });
  const edit = (body = {}, opts = {}) => openNdjsonClient(port, {
    path: '/edit',
    body: { currentHtml: '<div>Trang hiện tại</div>', instruction: 'Đổi tiêu đề', sessionId: 55, messageId: 900, requestId: REQUEST_ID, ...body },
    ...opts,
  });

  beforeEach(async () => {
    resetLandingTurnsForTest();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    for (const m of [generateLanding, editHtml, chargeAiCredit, ingestLandingAttachments, findLandingByIdInScope,
      saveMessagesReturningIds, saveMessages, saveAssistantMessage, getLandingPageMessage, updateLandingPageMessage]) {
      m.mockReset();
    }
    checkUserResourceLimit.mockReset();
    checkUserResourceLimit.mockResolvedValue(ALLOWED_SLOT);
    ingestLandingAttachments.mockResolvedValue({ assets: [], documents: [], skipped: [] });
    generateLanding.mockResolvedValue({ title: 'Trang khoá học', html: '<div>Nội dung</div>' });
    editHtml.mockResolvedValue({ title: 'Trang mới', html: '<div>Đã sửa</div>', changeSummary: 'Đã đổi tiêu đề' });
    saveMessagesReturningIds.mockResolvedValue({ userMessageId: 1, assistantMessageId: 2 });
    getLandingPageMessage.mockResolvedValue({ id: 900, data: { title: 'Trang cũ', html: '<div>Trang hiện tại</div>', autoLayoutFixCount: 0 } });
    updateLandingPageMessage.mockResolvedValue(true);
    saveMessages.mockResolvedValue(true);
    saveAssistantMessage.mockResolvedValue(true);
    await startApp();
  });

  afterEach(async () => {
    await new Promise((resolve) => { server.closeAllConnections?.(); server.close(resolve); });
    jest.restoreAllMocks();
  });

  describe('sinh trang', () => {
    it('xin luồng → header NDJSON; dòng cuối là result ĐÚNG hình dạng JSON cũ; thứ tự lưu phiên → trừ credit', async () => {
      const order = [];
      saveMessagesReturningIds.mockImplementation(async () => { order.push('save'); return { userMessageId: 1, assistantMessageId: 42 }; });
      chargeAiCredit.mockImplementation(async () => { order.push('charge'); });

      const c = gen({ sessionId: 55 });
      await c.done;

      expect(c.status).toBe(200);
      expect(c.headers['content-type']).toContain(NDJSON);
      expect(c.headers['x-accel-buffering']).toBe('no');
      expect(c.lines[c.lines.length - 1]).toEqual({
        type: 'result',
        success: true,
        data: { title: 'Trang khoá học', html: '<div>Nội dung</div>', messageId: 42 },
      });
      expect(order).toEqual(['save', 'charge']);
      expect(chargeAiCredit).toHaveBeenCalledTimes(1);
    });

    it('truyền xuống dịch vụ: signal, deadlineAtMs (≈ 240 giây từ giờ), onStage, streamed=1', async () => {
      const c = gen();
      await c.done;
      const arg = generateLanding.mock.calls[0][0];
      expect(arg.signal).toBeInstanceOf(AbortSignal);
      expect(arg.signal.aborted).toBe(false);
      expect(arg.deadlineAtMs - Date.now()).toBeGreaterThan(230_000);
      expect(arg.deadlineAtMs - Date.now()).toBeLessThanOrEqual(240_000);
      expect(typeof arg.onStage).toBe('function');
      expect(arg.streamed).toBe(1);
    });

    it('dịch vụ báo tiến độ → dòng stage trên luồng', async () => {
      const gate = deferred();
      generateLanding.mockImplementation(async (arg) => {
        arg.onStage('generating');
        await gate.promise;
        arg.onStage('fixing');
        return { title: 'T', html: '<div>x</div>' };
      });
      const c = gen();
      await until(() => c.lines.some((l) => l.type === 'stage' && l.stage === 'generating'), { label: 'stage generating' });
      gate.resolve();
      await c.done;
      expect(c.lines.filter((l) => l.type === 'stage').map((l) => l.stage)).toEqual(['generating', 'fixing']);
    });

    it('lưu phiên hỏng → result vẫn thành công kèm saved:false (B-18), credit vẫn trừ đúng 1 lần', async () => {
      saveMessagesReturningIds.mockResolvedValue(null);
      const c = gen({ sessionId: 55 });
      await c.done;
      const last = c.lines[c.lines.length - 1];
      expect(last.type).toBe('result');
      expect(last.data.saved).toBe(false);
      expect(last.data).not.toHaveProperty('messageId');
      expect(chargeAiCredit).toHaveBeenCalledTimes(1);
    });

    it('lỗi TRƯỚC khi mở luồng vẫn là JSON + mã HTTP như cũ: thiếu prompt → 400, quá dài → 400 + mã máy, hết suất → 400 limitReached', async () => {
      const empty = gen({ prompt: '   ' });
      await empty.done;
      expect(empty.status).toBe(400);
      expect(empty.headers['content-type']).toContain('application/json');
      expect(JSON.parse(empty.raw)).toEqual({ success: false, message: 'Vui lòng nhập mô tả trang landing cho AI' });

      const long = gen({ prompt: 'a'.repeat(8001) });
      await long.done;
      expect(long.status).toBe(400);
      expect(JSON.parse(long.raw)).toMatchObject({ success: false, code: 'LANDING_PROMPT_TOO_LONG' });

      checkUserResourceLimit.mockResolvedValue({ allowed: false, limit: 5, currentCount: 5, message: 'Đã đạt giới hạn landing' });
      const full = gen();
      await full.done;
      expect(full.status).toBe(400);
      expect(JSON.parse(full.raw)).toEqual({ success: false, message: 'Đã đạt giới hạn landing', limitReached: true, resource: 'landingPages' });

      expect(generateLanding).not.toHaveBeenCalled();
      expect(chargeAiCredit).not.toHaveBeenCalled();
    });

    it('Gemini lỗi giữa chừng → một dòng error mang status + thân lỗi cũ; KHÔNG lưu phiên, KHÔNG trừ credit', async () => {
      generateLanding.mockRejectedValue(Object.assign(new Error('AI bịa URL ảnh ngoài hệ thống. Vui lòng thử lại.'), { status: 422 }));
      const c = gen({ sessionId: 55 });
      await c.done;
      const last = c.lines[c.lines.length - 1];
      expect(last).toMatchObject({ type: 'error', status: 422, success: false, message: 'AI bịa URL ảnh ngoài hệ thống. Vui lòng thử lại.' });
      expect(c.lines.filter((l) => l.type === 'result')).toHaveLength(0);
      expect(saveMessagesReturningIds).not.toHaveBeenCalled();
      expect(chargeAiCredit).not.toHaveBeenCalled();
    });

    it('hết dung lượng khi nạp tệp (trong luồng) → dòng error mang đúng mã + thân của JSON cũ (status của lỗi, code STORAGE_QUOTA_EXCEEDED, data = usage)', async () => {
      ingestLandingAttachments.mockRejectedValue(new StorageQuotaExceededError({ usedBytes: 10, limitBytes: 5 }));
      const c = gen();
      await c.done;
      const last = c.lines[c.lines.length - 1];
      expect(last).toEqual({
        type: 'error',
        status: 409,
        success: false,
        code: 'STORAGE_QUOTA_EXCEEDED',
        message: 'Đã dùng hết dung lượng lưu trữ',
        data: { usedBytes: 10, limitBytes: 5 },
      });
      expect(chargeAiCredit).not.toHaveBeenCalled();
    });

    it('người dùng đóng kết nối giữa lượt Gemini → signal truyền xuống bị huỷ; KHÔNG lưu phiên, KHÔNG trừ credit', async () => {
      let signal = null;
      generateLanding.mockImplementation((arg) => new Promise((_resolve, reject) => {
        signal = arg.signal;
        arg.signal.addEventListener('abort', () => reject(createClientAbortError()));
      }));
      const c = gen({ sessionId: 55 });
      await until(() => c.status === 200 && signal, { label: 'luồng mở và Gemini bắt đầu' });

      c.destroy();
      await until(() => signal.aborted, { label: 'signal bị huỷ' });
      await new Promise((resolve) => { setTimeout(resolve, 40); });

      expect(saveMessagesReturningIds).not.toHaveBeenCalled();
      expect(chargeAiCredit).not.toHaveBeenCalled();
    });

    it('cùng requestId hai lần (đang chạy) → Gemini 1 lần, trừ 1 lần, cả hai nhận trang', async () => {
      const gate = deferred();
      generateLanding.mockImplementation(async () => { await gate.promise; return { title: 'T', html: '<div>một</div>' }; });
      const a = gen({ sessionId: 55 });
      await until(() => a.status === 200 && generateLanding.mock.calls.length === 1, { label: 'A đang chạy' });
      const b = gen({ sessionId: 55 });
      await until(() => b.status === 200, { label: 'B bám vào' });
      gate.resolve();
      await Promise.all([a.done, b.done]);

      expect(generateLanding).toHaveBeenCalledTimes(1);
      expect(chargeAiCredit).toHaveBeenCalledTimes(1);
      expect(saveMessagesReturningIds).toHaveBeenCalledTimes(1);
      expect(a.lines[a.lines.length - 1].data.html).toBe('<div>một</div>');
      expect(b.lines[b.lines.length - 1].data.html).toBe('<div>một</div>');
    });

    it('cùng requestId SAU khi đã xong → nhận lại kết quả cũ, không gọi Gemini, không trừ lần 2', async () => {
      await gen().done;
      const again = gen();
      await again.done;
      expect(generateLanding).toHaveBeenCalledTimes(1);
      expect(chargeAiCredit).toHaveBeenCalledTimes(1);
      expect(again.lines[again.lines.length - 1]).toMatchObject({ type: 'result', success: true, data: { title: 'Trang khoá học' } });
    });

    it('client KHÔNG xin luồng (bản frontend cũ) → JSON một lần như trước, không có dòng NDJSON', async () => {
      const c = gen({}, { accept: 'application/json' });
      await c.done;
      expect(c.status).toBe(200);
      expect(c.headers['content-type']).toContain('application/json');
      expect(JSON.parse(c.raw)).toEqual({ success: true, data: { title: 'Trang khoá học', html: '<div>Nội dung</div>' } });
      expect(generateLanding.mock.calls[0][0].streamed).toBe(0);
    });
  });

  describe('sửa trang', () => {
    it('xin luồng → result; trừ credit 1 lần SAU khi ghi phiên; editHtml nhận timeBudgetMs = trần tổng 240 giây', async () => {
      const order = [];
      updateLandingPageMessage.mockImplementation(async () => { order.push('update'); return true; });
      chargeAiCredit.mockImplementation(async () => { order.push('charge'); });
      const c = edit();
      await c.done;
      expect(c.lines[c.lines.length - 1]).toMatchObject({ type: 'result', success: true, data: { title: 'Trang mới', canRevert: true } });
      expect(order).toEqual(['update', 'charge']);
      const arg = editHtml.mock.calls[0][0];
      expect(arg.timeBudgetMs).toBe(240_000);
      expect(arg.signal).toBeInstanceOf(AbortSignal);
      expect(arg.streamed).toBe(1);
    });

    it('đường JSON cũ: KHÔNG truyền timeBudgetMs (dịch vụ giữ ngân sách 85 giây)', async () => {
      const c = edit({}, { accept: 'application/json' });
      await c.done;
      expect(JSON.parse(c.raw).success).toBe(true);
      expect(editHtml.mock.calls[0][0]).not.toHaveProperty('timeBudgetMs');
      expect(editHtml.mock.calls[0][0].streamed).toBe(0);
    });

    it('tự sửa hiển thị (autoLayoutFix) → giao kết quả, KHÔNG trừ credit; khoá "đang chạy" nhả khi xong để lượt sau được chạy', async () => {
      const finding = { kind: 'text_covered', width: 1280, text: '03/02', selector: 'span.a', coveredBy: { text: '1', selector: 'div.b' }, overlapPx: 12, side: 'right', sectionTitle: 'Mốc' };
      const body = { autoLayoutFix: true, layoutFindings: [finding], instruction: undefined };
      const c1 = edit({ ...body, requestId: 'req-autofix-0001' });
      await c1.done;
      expect(c1.lines[c1.lines.length - 1].type).toBe('result');
      expect(chargeAiCredit).not.toHaveBeenCalled();

      getLandingPageMessage.mockResolvedValue({ id: 900, data: { title: 'Trang cũ', html: '<div>Trang hiện tại</div>', autoLayoutFixCount: 0 } });
      const c2 = edit({ ...body, requestId: 'req-autofix-0002' });
      await c2.done;
      // Nếu khoá không được nhả sau lượt 1, lượt 2 sẽ bị 429 AUTO_LAYOUT_FIX_LIMIT.
      expect(c2.status).toBe(200);
      expect(c2.lines[c2.lines.length - 1].type).toBe('result');
    });

    it('lỗi Gemini ở lượt tự sửa → dòng error, KHÔNG trừ credit, khoá vẫn nhả (lượt sau không bị 429 oan)', async () => {
      const finding = { kind: 'text_covered', width: 1280, text: '03/02', selector: 'span.a', coveredBy: { text: '1', selector: 'div.b' }, overlapPx: 12, side: 'right', sectionTitle: 'Mốc' };
      const body = { autoLayoutFix: true, layoutFindings: [finding], instruction: undefined };
      editHtml.mockRejectedValueOnce(Object.assign(new Error('Google quá tải'), { status: 503 }));
      const c1 = edit({ ...body, requestId: 'req-autofix-0003' });
      await c1.done;
      expect(c1.lines[c1.lines.length - 1]).toMatchObject({ type: 'error', status: 503 });
      const c2 = edit({ ...body, requestId: 'req-autofix-0004' });
      await c2.done;
      expect(c2.status).toBe(200);
    });

    it('lỗi TRƯỚC khi mở luồng (thiếu HTML hiện tại) → JSON 400 như cũ', async () => {
      const c = edit({ currentHtml: '  ' });
      await c.done;
      expect(c.status).toBe(400);
      expect(JSON.parse(c.raw)).toEqual({ success: false, message: 'Thiếu nội dung HTML hiện tại để chỉnh sửa' });
      expect(editHtml).not.toHaveBeenCalled();
    });

    it('người dùng đóng kết nối giữa lượt sửa → signal huỷ; KHÔNG ghi phiên, KHÔNG trừ credit', async () => {
      let signal = null;
      editHtml.mockImplementation((arg) => new Promise((_resolve, reject) => {
        signal = arg.signal;
        arg.signal.addEventListener('abort', () => reject(createClientAbortError()));
      }));
      const c = edit();
      await until(() => c.status === 200 && signal, { label: 'luồng mở' });
      c.destroy();
      await until(() => signal.aborted, { label: 'signal bị huỷ' });
      await new Promise((resolve) => { setTimeout(resolve, 40); });
      expect(updateLandingPageMessage).not.toHaveBeenCalled();
      expect(chargeAiCredit).not.toHaveBeenCalled();
    });
  });
});
