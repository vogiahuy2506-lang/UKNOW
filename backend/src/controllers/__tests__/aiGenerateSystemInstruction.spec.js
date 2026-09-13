import { beforeEach, describe, expect, it, jest } from '@jest/globals';

// PLAN_AI_VIET_HO_CHI_DAN_CHATBOT_2026-09-13.md, mục 3.3 — soi đầu vào (hint 1-500 ký tự,
// language vi/en) sống ở CONTROLLER (cùng khuôn generateLandingHtml trong file này), không ở
// route/service — nên test riêng ở tầng controller, tách khỏi chatbotInstructionWriter.service
// (đã có bộ test riêng, mock ở đây để cô lập chỉ soi validate + chargeAiCredit).
const mockChargeAiCredit = jest.fn();
const mockGenerateSystemInstruction = jest.fn();

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
  HELP_ROUTE_LABELS: {},
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
jest.unstable_mockModule('../../services/ai/chatbotInstructionWriter.service.js', () => ({
  generateSystemInstruction: mockGenerateSystemInstruction,
}));

const { default: aiController } = await import('../ai.controller.js');

const makeRes = () => {
  const res = { status: jest.fn(() => res), json: jest.fn(() => res) };
  return res;
};

describe('aiController.generateSystemInstruction — soi đầu vào (mục 3.3)', () => {
  beforeEach(() => {
    mockChargeAiCredit.mockReset();
    mockGenerateSystemInstruction.mockReset();
    mockGenerateSystemInstruction.mockResolvedValue({ instruction: 'Bạn là trợ lý.', businessContextUsed: false });
  });

  it('ca 8 — hint rỗng → 400, không phải 500, không gọi service/chargeAiCredit', async () => {
    const req = { body: { hint: '' }, user: { id: 1 } };
    const res = makeRes();

    await aiController.generateSystemInstruction(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockGenerateSystemInstruction).not.toHaveBeenCalled();
    expect(mockChargeAiCredit).not.toHaveBeenCalled();
  });

  it('hint chỉ có khoảng trắng → 400 (coi như rỗng)', async () => {
    const req = { body: { hint: '     ' }, user: { id: 1 } };
    const res = makeRes();

    await aiController.generateSystemInstruction(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('hint quá 500 ký tự → 400', async () => {
    const req = { body: { hint: 'a'.repeat(501) }, user: { id: 1 } };
    const res = makeRes();

    await aiController.generateSystemInstruction(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockGenerateSystemInstruction).not.toHaveBeenCalled();
  });

  it('hint đúng 500 ký tự (biên) → hợp lệ, gọi được service', async () => {
    const req = { body: { hint: 'a'.repeat(500) }, user: { id: 1 } };
    const res = makeRes();

    await aiController.generateSystemInstruction(req, res);

    expect(mockGenerateSystemInstruction).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalledWith(400);
  });

  it('language lạ (không phải vi/en) → 400, không gọi service', async () => {
    const req = { body: { hint: 'Trợ lý bán hàng', language: 'fr' }, user: { id: 1 } };
    const res = makeRes();

    await aiController.generateSystemInstruction(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockGenerateSystemInstruction).not.toHaveBeenCalled();
  });

  it('không truyền language → mặc định "vi"', async () => {
    const req = { body: { hint: 'Trợ lý bán hàng' }, user: { id: 9 } };
    const res = makeRes();

    await aiController.generateSystemInstruction(req, res);

    expect(mockGenerateSystemInstruction).toHaveBeenCalledWith({
      userId: 9,
      hint: 'Trợ lý bán hàng',
      language: 'vi',
    });
  });

  it('hint/language hợp lệ → gọi service, TRỪ credit đúng 1 lần rồi mới trả 200', async () => {
    const req = { body: { hint: 'Trợ lý tư vấn khoá học', language: 'en' }, user: { id: 5 } };
    const res = makeRes();
    const callOrder = [];
    mockGenerateSystemInstruction.mockImplementation(async () => {
      callOrder.push('generate');
      return { instruction: 'You are an assistant.', businessContextUsed: false };
    });
    mockChargeAiCredit.mockImplementation(async () => { callOrder.push('charge'); });

    await aiController.generateSystemInstruction(req, res);

    expect(callOrder).toEqual(['generate', 'charge']);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { instruction: 'You are an assistant.', businessContextUsed: false },
    });
  });

  it('service ném lỗi (ví dụ 502 hết credit sau làm sạch) → KHÔNG trừ credit, trả đúng status của lỗi', async () => {
    const error = new Error('AI không trả về nội dung hợp lệ, vui lòng thử lại.');
    error.status = 502;
    mockGenerateSystemInstruction.mockRejectedValue(error);
    const req = { body: { hint: 'Trợ lý bán hàng' }, user: { id: 1 } };
    const res = makeRes();

    await aiController.generateSystemInstruction(req, res);

    expect(mockChargeAiCredit).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(502);
  });

  it('ca 12 — hết credit: lỗi từ assertAiCreditAvailable không đi qua đây (route-level), controller chỉ lo lỗi SAU khi đã qua cổng credit', async () => {
    // Ca 12 (hết credit) chốt bằng assertAiCreditAvailable ở route — đã có test riêng cho
    // middleware này (aiCredit.middleware). Ca này chỉ ghim: nếu service tự ném lỗi có
    // upgradeRequired (mô phỏng hạn mức), controller vẫn trả đúng payload đọc được.
    const error = new Error('Đã hết lượt AI trong kỳ');
    error.status = 402;
    error.upgradeRequired = true;
    mockGenerateSystemInstruction.mockRejectedValue(error);
    const req = { body: { hint: 'Trợ lý bán hàng' }, user: { id: 1 } };
    const res = makeRes();

    await aiController.generateSystemInstruction(req, res);

    expect(res.status).toHaveBeenCalledWith(402);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      message: 'Đã hết lượt AI trong kỳ',
      upgradeRequired: true,
    }));
  });
});
