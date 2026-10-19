import { beforeEach, describe, expect, it, jest } from '@jest/globals';

// PLAN_AI_VIET_MAU_TIN_2026-10-19.md, mục 1 — controller POST /ai/write-message: quy tắc TRỪ CREDIT.
// Từ chối / layout_changed / lỗi AI / sai đầu vào → KHÔNG trừ; có kết quả dùng được → trừ ĐÚNG MỘT lần.
// Service và validate được mock (có bộ test riêng); ở đây chỉ soi dây nối + credit + chủ workspace.
const mockChargeAiCredit = jest.fn();
const mockWriteMessage = jest.fn();
const mockValidate = jest.fn();

jest.unstable_mockModule('../../services/ai/aiLandingPage.service.js', () => ({ default: {} }));
jest.unstable_mockModule('../../services/ai/aiCampaignDraft.service.js', () => ({ default: {} }));
jest.unstable_mockModule('../../services/ai/businessProfile.service.js', () => ({ default: {} }));
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
jest.unstable_mockModule('../../middleware/aiCredit.middleware.js', () => ({
  chargeAiCredit: mockChargeAiCredit,
}));
jest.unstable_mockModule('../../services/ai/aiMessageWriter.service.js', () => ({
  writeMessage: mockWriteMessage,
  validateWriteMessageInput: mockValidate,
}));

const { default: aiController } = await import('../ai.controller.js');

const makeRes = () => {
  const res = { status: jest.fn(() => res), json: jest.fn(() => res) };
  return res;
};

describe('aiController.writeMessage — trừ credit', () => {
  beforeEach(() => {
    mockChargeAiCredit.mockReset();
    mockWriteMessage.mockReset();
    mockValidate.mockReset();
    mockValidate.mockImplementation((body) => ({ ...body, normalized: true }));
    mockWriteMessage.mockResolvedValue({ refused: false, subject: 'Tiêu đề', body: '<p>Xin chào</p>', warnings: [], missingVariables: [] });
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('có kết quả dùng được → trừ credit ĐÚNG MỘT lần và trả subject/body/warnings', async () => {
    const res = makeRes();
    await aiController.writeMessage({ body: { mode: 'create' }, user: { id: 7 } }, res);

    expect(mockChargeAiCredit).toHaveBeenCalledTimes(1);
    const payload = res.json.mock.calls[0][0];
    expect(payload.success).toBe(true);
    expect(payload.data).toMatchObject({ refused: false, subject: 'Tiêu đề', body: '<p>Xin chào</p>', warnings: [] });
  });

  it('bị từ chối (refused) → 200 {refused, message}, KHÔNG trừ credit', async () => {
    mockWriteMessage.mockResolvedValue({ refused: true, message: 'Mình chỉ giúp viết tin' });
    const res = makeRes();
    await aiController.writeMessage({ body: {}, user: { id: 7 } }, res);

    expect(mockChargeAiCredit).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { refused: true, message: 'Mình chỉ giúp viết tin' } });
  });

  it('layout_changed (service ném 422) → trả lỗi kèm code, KHÔNG trừ credit', async () => {
    mockWriteMessage.mockRejectedValue(Object.assign(new Error('Bố cục bị đổi'), { status: 422, code: 'layout_changed' }));
    const res = makeRes();
    await aiController.writeMessage({ body: {}, user: { id: 7 } }, res);

    expect(mockChargeAiCredit).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json.mock.calls[0][0]).toMatchObject({ success: false, code: 'layout_changed' });
  });

  it('đầu vào sai → 400, không gọi AI, không trừ credit', async () => {
    mockValidate.mockImplementation(() => { throw Object.assign(new Error('mode sai'), { status: 400, code: 'invalid_mode' }); });
    const res = makeRes();
    await aiController.writeMessage({ body: {}, user: { id: 7 } }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockWriteMessage).not.toHaveBeenCalled();
    expect(mockChargeAiCredit).not.toHaveBeenCalled();
  });

  it('nhân viên bấm → userId là CHỦ workspace, actorUserId là nhân viên', async () => {
    const res = makeRes();
    await aiController.writeMessage({ body: {}, user: { id: 11, activeContext: { type: 'employee', ownerId: 4 } } }, res);

    expect(mockWriteMessage).toHaveBeenCalledWith(expect.objectContaining({ userId: 4, actorUserId: 11 }));
  });
});
