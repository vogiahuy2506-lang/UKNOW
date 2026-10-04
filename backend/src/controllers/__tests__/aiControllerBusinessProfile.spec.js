import { beforeEach, describe, expect, it, jest } from '@jest/globals';

// D-13 — PUT /ai/business-profile: "Thông tin bổ sung" (extra_context) đi nguyên văn vào mọi prompt chatbot nên LƯU MỚI quá
// 20.000 ký tự bị chặn ở controller (400 + mã + câu tiếng Việt), trước khi gọi service (không tốn lượt embedding).
// Mock header khuôn aiGenerateSystemInstruction.spec.js (controller kéo nhiều service).
const mockSaveProfile = jest.fn();

jest.unstable_mockModule('../../services/ai/aiLandingPage.service.js', () => ({ default: {} }));
jest.unstable_mockModule('../../services/ai/aiCampaignDraft.service.js', () => ({ default: {} }));
jest.unstable_mockModule('../../services/ai/businessProfile.service.js', () => ({ default: { saveProfile: mockSaveProfile } }));
jest.unstable_mockModule('../../services/ai/customChat.service.js', () => ({ default: {} }));
jest.unstable_mockModule('../../services/ai/aiCampaign.service.js', () => ({ default: {} }));
jest.unstable_mockModule('../../repositories/ai/chatbot.repository.js', () => ({ default: {} }));
jest.unstable_mockModule('../../services/chatbot/chatbotStudioConversation.service.js', () => ({ default: {} }));
jest.unstable_mockModule('../../services/ai/aiModelPolicy.service.js', () => ({
  getAllowedModelsForUser: jest.fn(),
  savePreferredModelForUser: jest.fn(),
  resolveAllowedModel: jest.fn(async () => 'gemini-2.5-flash'),
}));
jest.unstable_mockModule('../../services/help/helpAssistant.service.js', () => ({
  tryHandleHelpChat: jest.fn(async () => null),
  answerWithDocs: jest.fn(),
  HELP_ROUTE_LABELS: {},
}));
jest.unstable_mockModule('../../services/help/helpCenter.service.js', () => ({
  searchHelpChunks: jest.fn(async () => ({ chunks: [], topSimilarity: 0 })),
}));
jest.unstable_mockModule('../../repositories/help/helpArticle.repository.js', () => ({
  insertUnanswered: jest.fn(async () => {}),
}));
jest.unstable_mockModule('../campaign.controller.js', () => ({ default: {} }));
jest.unstable_mockModule('../../services/campaign/campaignCrud.service.js', () => ({ default: {} }));
jest.unstable_mockModule('../../repositories/aiSession.repository.js', () => ({
  createSession: jest.fn(),
  saveMessages: jest.fn(),
  getSessionWizardState: jest.fn(),
  updateWizardStateSections: jest.fn(),
  listUserFilesSinceLastLanding: jest.fn(async () => []),
}));
jest.unstable_mockModule('../../middleware/aiCredit.middleware.js', () => ({ chargeAiCredit: jest.fn() }));
jest.unstable_mockModule('../../services/ai/chatbotInstructionWriter.service.js', () => ({ generateSystemInstruction: jest.fn() }));

const { default: aiController } = await import('../ai.controller.js');

const makeRes = () => {
  const res = { status: jest.fn(() => res), json: jest.fn(() => res) };
  return res;
};
const body = (extra_context) => ({ company_name: 'Shop A', industry: 'Bán lẻ', extra_context });

beforeEach(() => {
  mockSaveProfile.mockReset().mockResolvedValue({ id: 1, company_name: 'Shop A' });
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('aiController.saveBusinessProfile — trần extra_context (D-13)', () => {
  it('20.001 ký tự → 400 + code EXTRA_CONTEXT_TOO_LONG + câu tiếng Việt, KHÔNG gọi service', async () => {
    const res = makeRes();

    await aiController.saveBusinessProfile({ user: { id: 7 }, body: body('a'.repeat(20001)) }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    const payload = res.json.mock.calls[0][0];
    expect(payload.success).toBe(false);
    expect(payload.code).toBe('EXTRA_CONTEXT_TOO_LONG');
    expect(payload.message).toContain('quá dài');
    expect(payload.message).toContain('20.000');
    expect(mockSaveProfile).not.toHaveBeenCalled();
  });

  it('đúng 20.000 ký tự / rỗng / không gửi → lưu bình thường', async () => {
    for (const value of ['a'.repeat(20000), '', undefined]) {
      mockSaveProfile.mockClear();
      const res = makeRes();

      await aiController.saveBusinessProfile({ user: { id: 7 }, body: body(value) }, res);

      expect(mockSaveProfile).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    }
  });

  it('repository chốt trần (lỗi 400 mã EXTRA_CONTEXT_TOO_LONG từ service) → controller trả 400 kèm mã, không thành 500', async () => {
    mockSaveProfile.mockRejectedValue(Object.assign(new Error('Phần "Thông tin bổ sung" quá dài'), { status: 400, code: 'EXTRA_CONTEXT_TOO_LONG' }));
    const res = makeRes();

    await aiController.saveBusinessProfile({ user: { id: 7 }, body: body('ngắn') }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0]).toEqual({ success: false, code: 'EXTRA_CONTEXT_TOO_LONG', message: 'Phần "Thông tin bổ sung" quá dài' });
  });

  it('lỗi khác (vd pg code 57014) → 500, KHÔNG lộ mã lỗi hạ tầng ra client', async () => {
    mockSaveProfile.mockRejectedValue(Object.assign(new Error('canceling statement due to statement timeout'), { code: '57014' }));
    const res = makeRes();

    await aiController.saveBusinessProfile({ user: { id: 7 }, body: body('ngắn') }, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json.mock.calls[0][0]).not.toHaveProperty('code');
  });
});
