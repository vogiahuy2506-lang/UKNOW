import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const processSmartChat = jest.fn();
const processSmartChatV2 = jest.fn();
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

// G3a: hai endpoint sinh kịch bản đọc tệp theo storage_key — controller phải truyền id CHỦ để dịch vụ kiểm chủ tệp.
const generateCampaignScript = jest.fn();
const generateCampaignWithRegistry = jest.fn();
const validateCampaignScript = jest.fn(() => ({ valid: true, errors: [], warnings: [] }));

jest.unstable_mockModule('../../services/ai/aiCampaign.service.js', () => ({
  default: {
    processSmartChat,
    processSmartChatV2,
    generateCampaignScript,
    generateCampaignWithRegistry,
    validateCampaignScript,
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

const makeRes = () => {
  const res = { status: jest.fn(() => res), json: jest.fn(() => res) };
  return res;
};

/**
 * PLAN_SUA_AI_DOT4 PR-3 — chính sách credit của trợ lý (memory project_ai_credit_policy): 1 credit / lần AI TẠO RA câu trả lời;
 * câu cố định và lượt hỏng KHÔNG trừ.
 *
 *  - C P3-1: câu cố định của nhánh help (`fixedCapabilityReply`) và lượt JSON hỏng (`parseFailed`) từng vẫn bị trừ.
 *  - C P3-5: lưới an toàn RAG từng thay câu từ chối quyền (`permissionDenied`) bằng bài hướng dẫn, gọi embedding + Gemini
 *    mà lượt đó vốn không trừ.
 *
 * Hình dạng phản hồi giả = hình dạng THẬT của nơi sinh ra chúng: `fixedCapabilityReply` (helpAssistant.service.js),
 * `parseAiJson` (aiJsonParse.util.js), câu từ chối quyền + câu "Đã dừng" của processSmartChat (aiCampaign.service.js).
 */
const reqFor = (text) => ({
  body: { history: [{ role: 'user', content: text }], locale: 'vi' },
  user: { id: 7, role: 'user' },
});
const sentData = (res) => res.json.mock.calls[0][0].data;

const FIXED_PROBE = {
  type: 'text',
  content: 'Có, mình làm được tạo chiến dịch. Bạn muốn bắt đầu không?',
  data: { helpRoute: 'hỏi_đáp', capabilityProbe: true, capabilityKind: 'core' },
};
const UNSUPPORTED_SEND = {
  type: 'text',
  content: 'Hiện chưa hỗ trợ gửi SMS. Mình có thể giúp bạn tạo chiến dịch qua Email, Zalo.',
  data: { helpRoute: 'hỏi_đáp', capabilityProbe: true, capabilityKind: 'unsupported', unsupportedSend: true },
};
const DOCS_ANSWER = {
  type: 'text',
  content: 'Theo tài liệu: vào Cài đặt > Zalo > Kết nối.',
  data: { helpRoute: 'hỏi_đáp', sources: [{ slug: 'ket-noi-zalo', title: 'Kết nối Zalo', url: '/huong-dan/ket-noi-zalo' }], topSimilarity: 0.82 },
};
const PARSE_FAILED = {
  type: 'text',
  content: 'Xin lỗi, tôi gặp lỗi định dạng khi tạo câu trả lời. Bạn gửi lại yêu cầu giúp tôi nhé.',
  data: null,
  missing_fields: [],
  parseFailed: true,
};
const PERMISSION_DENIED = {
  type: 'text',
  content: 'Tài khoản nhân viên của bạn chưa được cấp quyền "Tạo chiến dịch" nên mình chưa thể tạo giúp bạn.',
  missing_fields: [],
  data: { permissionDenied: 'campaigns_create' },
  wizardShortCircuit: true,
  _wizard: { gates: {}, brief: {}, gateAsked: null, meta: {}, planChanged: true, planReset: true },
};

describe('chat() — chính sách credit của câu cố định / lượt hỏng (PR-3)', () => {
  beforeEach(() => {
    processSmartChat.mockReset();
    chargeAiCredit.mockReset();
    createSession.mockReset();
    createSession.mockResolvedValue({ id: 123, title: 'Chat' });
    saveMessages.mockReset();
    getSessionWizardState.mockReset();
    getSessionWizardState.mockResolvedValue(null);
    updateWizardStateSections.mockReset();
    updateWizardStateSections.mockResolvedValue(undefined);
    tryHandleHelpChat.mockReset();
    tryHandleHelpChat.mockResolvedValue(null);
    answerWithDocs.mockReset();
    searchHelpChunks.mockReset();
    searchHelpChunks.mockResolvedValue({ chunks: [], topSimilarity: 0 });
    insertUnanswered.mockReset();
    insertUnanswered.mockResolvedValue(undefined);
  });

  describe('C P3-1 — nhánh help', () => {
    it('câu cố định "hỏi năng lực" (data.capabilityProbe) → KHÔNG trừ credit, vẫn trả đúng câu và lưu phiên', async () => {
      tryHandleHelpChat.mockResolvedValue(FIXED_PROBE);
      const res = makeRes();

      await aiController.chat(reqFor('trợ lý tạo được chiến dịch không'), res);

      expect(chargeAiCredit).not.toHaveBeenCalled();
      expect(sentData(res)).toMatchObject({ content: FIXED_PROBE.content, sessionId: 123 });
      expect(saveMessages).toHaveBeenCalledTimes(1);
    });

    it('câu cố định "gửi qua kênh chưa hỗ trợ" (capabilityProbe + unsupportedSend) → KHÔNG trừ credit', async () => {
      tryHandleHelpChat.mockResolvedValue(UNSUPPORTED_SEND);
      const res = makeRes();

      await aiController.chat(reqFor('gửi sms cho khách'), res);

      expect(chargeAiCredit).not.toHaveBeenCalled();
    });

    it('câu help do AI tạo ra (trả lời theo tài liệu, không có capabilityProbe) → VẪN trừ ĐÚNG 1 lần', async () => {
      tryHandleHelpChat.mockResolvedValue(DOCS_ANSWER);
      const res = makeRes();

      await aiController.chat(reqFor('làm sao kết nối zalo'), res);

      expect(chargeAiCredit).toHaveBeenCalledTimes(1);
      expect(sentData(res).content).toBe(DOCS_ANSWER.content);
    });
  });

  describe('C P3-1 — lượt JSON hỏng (parseFailed)', () => {
    it('model trả JSON hỏng → lời xin lỗi soạn sẵn, KHÔNG trừ credit; cờ nội bộ không lọt ra phản hồi hay vào DB', async () => {
      processSmartChat.mockResolvedValue(PARSE_FAILED);
      const res = makeRes();

      await aiController.chat(reqFor('tạo giúp tôi chiến dịch email'), res);

      expect(chargeAiCredit).not.toHaveBeenCalled();
      expect(sentData(res).content).toBe(PARSE_FAILED.content);
      expect(sentData(res)).not.toHaveProperty('parseFailed');
      expect(saveMessages.mock.calls[0][3]).not.toHaveProperty('parseFailed');
    });

    it('lượt bình thường (model trả JSON hợp lệ, không cờ) → trừ ĐÚNG 1 lần', async () => {
      processSmartChat.mockResolvedValue({ type: 'text', content: 'Bạn muốn gửi cho nhóm khách nào?', missing_fields: [], data: null });
      const res = makeRes();

      await aiController.chat(reqFor('tạo giúp tôi chiến dịch email'), res);

      expect(chargeAiCredit).toHaveBeenCalledTimes(1);
    });

    it('parseFailed nhưng lưới RAG thay lời xin lỗi bằng câu trả lời bám tài liệu (Gemini tạo ra) → được trừ 1 lần', async () => {
      tryHandleHelpChat.mockResolvedValue({ handled: false, route: 'làm_giúp' });
      processSmartChat.mockResolvedValue(PARSE_FAILED);
      searchHelpChunks.mockResolvedValue({ chunks: [{ slug: 'ket-noi-zalo', title: 'Kết nối Zalo', content_text: 'bước 1' }], topSimilarity: 0.8 });
      answerWithDocs.mockResolvedValue(DOCS_ANSWER);
      const res = makeRes();

      await aiController.chat(reqFor('làm sao kết nối zalo'), res);

      expect(answerWithDocs).toHaveBeenCalledTimes(1);
      expect(sentData(res).content).toBe(DOCS_ANSWER.content);
      expect(chargeAiCredit).toHaveBeenCalledTimes(1);
    });

    it('parseFailed + lưới RAG KHÔNG tìm được tài liệu (giữ lời xin lỗi) → vẫn không trừ', async () => {
      tryHandleHelpChat.mockResolvedValue({ handled: false, route: 'không_rõ' });
      processSmartChat.mockResolvedValue(PARSE_FAILED);
      searchHelpChunks.mockResolvedValue({ chunks: [], topSimilarity: 0 });
      const res = makeRes();

      await aiController.chat(reqFor('làm sao tạo chiến dịch email?'), res);

      expect(answerWithDocs).not.toHaveBeenCalled();
      expect(sentData(res).content).toBe(PARSE_FAILED.content);
      expect(chargeAiCredit).not.toHaveBeenCalled();
    });
  });
});
