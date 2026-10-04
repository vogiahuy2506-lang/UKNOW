/**
 * Rà soát C P3-4 (04/10/2026) — UID bạn bè Zalo + tên KHÔNG được vào prompt Gemini.
 *
 * Phép thử thật qua processSmartChat: lịch sử chat mang marker `{ gate:'zaloFriends', friendCount }` (FE mới), UID nằm ở `wizard_state` đã lưu. Bản cũ
 * gửi UID trong marker nên mọi lượt sau Gemini nhận nguyên danh sách. Kiểm trên CHÍNH nội dung request gửi cho Gemini (`contents` + `systemInstruction`).
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { createBrainGeminiAdapter } from './fixtures/brainGeminiAdapter.js';

const axiosPost = jest.fn();
const extractGeminiUsage = jest.fn();
const reserve = jest.fn();
const record = jest.fn();

jest.unstable_mockModule('axios', () => ({ default: { post: axiosPost } }));
jest.unstable_mockModule('../../../utils/geminiClient.util.js', () => ({
  extractGeminiUsage,
  generateGeminiContent: createBrainGeminiAdapter({ axiosPost, extractGeminiUsage }),
}));
jest.unstable_mockModule('../businessProfile.service.js', () => ({
  default: {
    getProfile: jest.fn(),
    getContextForPrompt: jest.fn(async () => ''),
    formatProfileForPrompt: jest.fn(() => ''),
    getFormattedProfileForPrompt: jest.fn(async () => ''),
  },
  serializeProductList: jest.fn(() => ''),
}));
jest.unstable_mockModule('../adminContext.service.js', () => ({ buildAdminContext: jest.fn() }));
jest.unstable_mockModule('../aiLandingPage.service.js', () => ({ default: { generate: jest.fn() } }));
jest.unstable_mockModule('../../../controllers/upload.controller.js', () => ({ default: { readTempFileBuffer: jest.fn() } }));
jest.unstable_mockModule('../../../utils/fileParser.util.js', () => ({ extractTextFromBuffer: jest.fn() }));
jest.unstable_mockModule('../../../utils/googleUrlFetch.util.js', () => ({
  attachGoogleUrlParts: jest.fn(async () => ({ parts: [], warnings: [] })),
}));
jest.unstable_mockModule('../aiPromptResources.service.js', () => ({
  default: {
    getZaloAccountsFull: jest.fn(async () => [{ id: 5, displayName: 'Shop', zaloName: 'Shop', status: 'connected', isActive: true, isDefault: true }]),
    getActiveEmailSenders: jest.fn(async () => []),
    getEmailTemplates: jest.fn(async () => []),
    getZaloAccounts: jest.fn(async () => [{ id: 5, displayName: 'Shop', status: 'connected' }]),
    getZaloGroups: jest.fn(async () => []),
    getZaloTemplates: jest.fn(async () => []),
    getRecommendedCampaignType: jest.fn(async () => 'zalo'),
    getCustomerStats: jest.fn(async () => ({ total: 10, hasEmail: 0, hasZalo: 10 })),
    getCourses: jest.fn(async () => []),
    getLandingPages: jest.fn(async () => []),
    getLandingPickerOptions: jest.fn(async () => ({ landings: [], totalLeads: 0 })),
    getForms: jest.fn(async () => []),
    getAdapterChannelAccounts: async () => ({ telegram: [], whatsapp: [] }),
    getAdapterAccountsPromptBlock: async () => '',
    getAdapterNodeTypesPromptLines: () => '',
    getBlockedZaloPromptNotice: () => '',
  },
}));
jest.unstable_mockModule('../aiUsageMeter.service.js', () => ({
  default: { reserve, record, resolveFallbackModel: jest.fn(async () => null) },
}));
jest.unstable_mockModule('../aiModelPolicy.service.js', () => ({
  resolveAllowedModel: jest.fn(async (_userId, model) => model || 'gemini-2.5-flash'),
}));

const { default: aiCampaignService } = await import('../aiCampaign.service.js');
const { createEmptyWizardState } = await import('../aiCampaignWizard.service.js');

const UIDS = ['100000000000001', '100000000000002', '100000000000003'];
const FRIEND_NAME = 'Nguyễn Văn Bạn-Rất-Riêng-Tư';

const user = (content) => ({ role: 'user', content });
const HISTORY = [
  user('Tạo chiến dịch Zalo gửi cho bạn bè Zalo, mời học thử'),
  user('[wizard]{"gate":"channel","channel":"zalo"}\nZalo cá nhân'),
  user('[wizard]{"gate":"senderAccount","channel":"zalo","accountId":5,"accountName":"Shop"}\nShop'),
  user('[wizard]{"gate":"dataSource","value":"zalo_contacts"}\nDanh bạ Zalo'),
  // Marker + câu chữ đúng như FE mới gửi: chỉ số lượng, KHÔNG UID, KHÔNG tên.
  user('[wizard]{"gate":"zaloFriends","accountId":5,"friendCount":3}\nTôi chọn 3 bạn bè từ danh bạ Zalo.'),
  user('[wizard]{"gate":"campaignBrief","contentMode":"custom_topic","topicText":"Mời học thử"}\nChủ đề'),
  user('[wizard]{"gate":"schedule","value":"once","mode":"once"}\nGửi 1 lần'),
];

const persistedState = (zaloFriendIds) => ({
  v: 1,
  gates: { ...createEmptyWizardState().gates, isCampaignFlow: true, channel: 'zalo', senderAccountId: 5, dataSource: 'zalo_contacts', zaloFriendIds },
  plan: createEmptyWizardState().plan,
  brief: createEmptyWizardState().brief,
  meta: createEmptyWizardState().meta,
});

const MODEL_CONFIRM = {
  type: 'confirm_create',
  content: 'Mình đã soạn xong.',
  data: {
    campaignName: 'Zalo bạn bè',
    campaignType: 'zalo',
    autoRun: false,
    nodes: [
      { tempId: 'n_sel', nodeType: 'data', nodeSubtype: 'select_zalo_account', config: { zaloAccountId: 5 } },
      { tempId: 'n_send', nodeType: 'action', nodeSubtype: 'send_zalo_personal', config: { zaloAccountId: 5, zaloRecipientSource: 'manual', zaloPersonalTemplateSteps: [{ message: 'Chào bạn!' }] } },
    ],
    connections: [{ sourceNodeId: 'n_sel', targetNodeId: 'n_send', connectionType: 'default', connectionLabel: '' }],
  },
  missing_fields: [],
};

describe('C P3-4 — UID/tên bạn bè Zalo không vào prompt Gemini', () => {
  beforeEach(() => {
    [axiosPost, extractGeminiUsage, reserve, record].forEach((fn) => fn.mockReset());
    reserve.mockResolvedValue({ maxOutputTokens: 1024 });
    extractGeminiUsage.mockReturnValue({ promptTokens: 1, outputTokens: 1, totalTokens: 2 });
    axiosPost.mockResolvedValue({ data: { candidates: [{ content: { parts: [{ text: JSON.stringify(MODEL_CONFIRM) }] } }] } });
  });

  it('marker chỉ-số-lượng + UID đã lưu ở server khớp → cổng zaloFriends thông qua, model được gọi, và request Gemini KHÔNG chứa UID/tên nào', async () => {
    const result = await aiCampaignService.processSmartChat({
      userId: 7,
      history: HISTORY,
      persistedWizardState: persistedState(UIDS),
      locale: 'vi',
    });

    expect(result.type).toBe('confirm_create');
    expect(axiosPost).toHaveBeenCalledTimes(1);
    const sentToGemini = JSON.stringify(axiosPost.mock.calls[0][1]);
    UIDS.forEach((uid) => expect(sentToGemini).not.toContain(uid));
    expect(sentToGemini).not.toContain(FRIEND_NAME);
    // Model vẫn biết SỐ LƯỢNG người nhận (để viết nội dung), không biết là ai.
    expect(sentToGemini).toContain('zaloFriendCount: 3');
  });

  it('cùng lịch sử nhưng server CHƯA có danh sách UID (ghi lỗi) → thẻ chọn bạn bè hiện lại, KHÔNG gọi model', async () => {
    const result = await aiCampaignService.processSmartChat({
      userId: 7,
      history: HISTORY,
      persistedWizardState: persistedState([]),
      locale: 'vi',
    });

    expect(result.type).toBe('zalo_friend_picker');
    expect(axiosPost).not.toHaveBeenCalled();
  });

  it('đối chứng — marker KIỂU CŨ mang UID: UID lọt vào request Gemini (đúng lỗi gốc mà marker mới tránh)', async () => {
    const legacyHistory = HISTORY.map((m) => (String(m.content).includes('"gate":"zaloFriends"')
      ? user(`[wizard]${JSON.stringify({ gate: 'zaloFriends', accountId: 5, friendIds: UIDS })}\nTôi chọn 3 bạn bè từ danh bạ Zalo: ${FRIEND_NAME}.`)
      : m));
    await aiCampaignService.processSmartChat({ userId: 7, history: legacyHistory, locale: 'vi' });

    const sentToGemini = JSON.stringify(axiosPost.mock.calls[0][1]);
    expect(sentToGemini).toContain(UIDS[0]);
    expect(sentToGemini).toContain(FRIEND_NAME);
  });
});
