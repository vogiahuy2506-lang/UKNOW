import { beforeEach, describe, expect, it, jest } from '@jest/globals';

// PLAN_TRO_LY_CHINH_LANDING_TRON_GOI_2026-09-13.md, Việc 1.3 — mock scaffold chép theo
// landingBriefWiring.spec.js (import ai.controller.js kéo theo cả graph, nên phải mock đủ).
const mockCreateSession = jest.fn();
const mockGetSessionWizardState = jest.fn();
const mockSaveMessages = jest.fn();
const mockUpdateLandingPageMessage = jest.fn();
const mockChargeAiCredit = jest.fn();

jest.unstable_mockModule('../../repositories/aiSession.repository.js', () => ({
  createSession: mockCreateSession,
  getSessionWizardState: mockGetSessionWizardState,
  saveMessages: mockSaveMessages,
  saveAssistantMessage: jest.fn(),
  updateLandingPageMessage: mockUpdateLandingPageMessage,
  listUserFilesSinceLastLanding: jest.fn(async () => []),
}));
jest.unstable_mockModule('../../middleware/aiCredit.middleware.js', () => ({
  chargeAiCredit: mockChargeAiCredit,
}));
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
jest.unstable_mockModule('../../services/ai/chatbotInstructionWriter.service.js', () => ({
  generateSystemInstruction: jest.fn(),
}));

const { default: aiController } = await import('../ai.controller.js');

const makeRes = () => {
  const res = { status: jest.fn(() => res), json: jest.fn(() => res) };
  return res;
};

describe('aiController.landingFromHtml (Việc 1.1)', () => {
  beforeEach(() => {
    mockCreateSession.mockReset();
    mockGetSessionWizardState.mockReset();
    mockSaveMessages.mockReset();
    mockChargeAiCredit.mockReset();
    mockCreateSession.mockResolvedValue({ id: 501, title: 'Landing Test' });
    mockSaveMessages.mockResolvedValue(true);
  });

  it('HTML hợp lệ, không sessionId → tạo session + lưu 2 tin, KHÔNG trừ credit', async () => {
    const req = {
      body: { html: '<html><head><title>Trang Test</title></head><body>Hi</body></html>' },
      user: { id: 9 },
    };
    const res = makeRes();

    await aiController.landingFromHtml(req, res);

    expect(mockCreateSession).toHaveBeenCalledWith(9, 'Trang Test');
    expect(mockSaveMessages).toHaveBeenCalledTimes(1);
    const [sid, uid, userContent, assistantMsg] = mockSaveMessages.mock.calls[0];
    expect(sid).toBe(501);
    expect(uid).toBe(9);
    // Bẫy 1: tin user là marker, KHÔNG chứa HTML thật.
    expect(userContent).toBe('[Dán HTML có sẵn: "Trang Test", 66 ký tự]');
    expect(userContent).not.toContain('<html>');
    expect(assistantMsg.type).toBe('landing_page');
    expect(assistantMsg.data).toEqual({
      title: 'Trang Test',
      html: '<html><head><title>Trang Test</title></head><body>Hi</body></html>',
      source: 'pasted',
    });
    expect(mockChargeAiCredit).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { sessionId: 501, sessionTitle: 'Landing Test', message: assistantMsg },
    });
  });

  it('title ưu tiên: body.title > <title> trong HTML > "Landing dán vào lúc HH:mm"', async () => {
    const req = {
      body: { html: '<html><title>Từ HTML</title></html>', title: 'Từ body' },
      user: { id: 9 },
    };
    const res = makeRes();
    await aiController.landingFromHtml(req, res);
    expect(mockCreateSession).toHaveBeenCalledWith(9, 'Từ body');
  });

  it('không có body.title, không có <title> → rơi về "Landing dán vào lúc HH:mm"', async () => {
    const req = { body: { html: '<div>Không có title</div>' }, user: { id: 9 } };
    const res = makeRes();
    await aiController.landingFromHtml(req, res);
    expect(mockCreateSession).toHaveBeenCalledWith(9, expect.stringMatching(/^Landing dán vào lúc \d{2}:\d{2}$/));
  });

  it('có sessionId hợp lệ (thuộc về mình) → KHÔNG tạo session mới, dùng lại sessionId đó', async () => {
    mockGetSessionWizardState.mockResolvedValue({ id: 77, wizard_state: null });
    const req = { body: { sessionId: 77, html: '<div>ok</div>' }, user: { id: 9 } };
    const res = makeRes();

    await aiController.landingFromHtml(req, res);

    expect(mockGetSessionWizardState).toHaveBeenCalledWith(77, 9);
    expect(mockCreateSession).not.toHaveBeenCalled();
    expect(mockSaveMessages).toHaveBeenCalledWith(77, 9, expect.any(String), expect.any(Object));
  });

  it('session người khác (getSessionWizardState trả null) → 404, không lưu tin', async () => {
    mockGetSessionWizardState.mockResolvedValue(null);
    const req = { body: { sessionId: 999, html: '<div>ok</div>' }, user: { id: 9 } };
    const res = makeRes();

    await aiController.landingFromHtml(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockSaveMessages).not.toHaveBeenCalled();
  });

  it('HTML quá 500.000 ký tự → 400, không tạo session/lưu tin', async () => {
    const req = { body: { html: `<div>${'a'.repeat(500001)}</div>` }, user: { id: 9 } };
    const res = makeRes();

    await aiController.landingFromHtml(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockCreateSession).not.toHaveBeenCalled();
    expect(mockSaveMessages).not.toHaveBeenCalled();
  });

  it('nội dung không có ký tự "<" (không phải HTML) → 400', async () => {
    const req = { body: { html: 'chỉ là văn bản thường' }, user: { id: 9 } };
    const res = makeRes();

    await aiController.landingFromHtml(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockSaveMessages).not.toHaveBeenCalled();
  });
});

describe('aiController.patchLandingMessage (Việc 1.2)', () => {
  beforeEach(() => {
    mockGetSessionWizardState.mockReset();
    mockUpdateLandingPageMessage.mockReset();
    mockGetSessionWizardState.mockResolvedValue({ id: 77, wizard_state: null });
    mockUpdateLandingPageMessage.mockResolvedValue(true);
  });

  it('nhận đúng 3 khoá (landingPageId/slug/isPublished), gọi updateLandingPageMessage với đúng patch', async () => {
    const req = {
      params: { id: '77' },
      body: { data: { landingPageId: 5, slug: 'test-chat-1', isPublished: true } },
      user: { id: 9 },
    };
    const res = makeRes();

    await aiController.patchLandingMessage(req, res);

    expect(mockGetSessionWizardState).toHaveBeenCalledWith(77, 9);
    expect(mockUpdateLandingPageMessage).toHaveBeenCalledWith(
      77, 9, { landingPageId: 5, slug: 'test-chat-1', isPublished: true }, undefined
    );
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { landingPageId: 5, slug: 'test-chat-1', isPublished: true },
    });
  });

  it('whitelist — khoá lạ bị bỏ qua, chỉ 3 khoá hợp lệ đi qua', async () => {
    const req = {
      params: { id: '77' },
      body: { data: { landingPageId: 5, htmlContent: '<script>xss</script>', role: 'admin' } },
      user: { id: 9 },
    };
    const res = makeRes();

    await aiController.patchLandingMessage(req, res);

    expect(mockUpdateLandingPageMessage).toHaveBeenCalledWith(77, 9, { landingPageId: 5 }, undefined);
  });

  it('data toàn khoá lạ (không còn khoá hợp lệ nào) → 400, không gọi update', async () => {
    const req = { params: { id: '77' }, body: { data: { htmlContent: 'x' } }, user: { id: 9 } };
    const res = makeRes();

    await aiController.patchLandingMessage(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockUpdateLandingPageMessage).not.toHaveBeenCalled();
  });

  it('truyền messageId thì chuyển thẳng cho updateLandingPageMessage', async () => {
    const req = {
      params: { id: '77' },
      body: { messageId: 555, data: { isPublished: false } },
      user: { id: 9 },
    };
    const res = makeRes();

    await aiController.patchLandingMessage(req, res);

    expect(mockUpdateLandingPageMessage).toHaveBeenCalledWith(77, 9, { isPublished: false }, 555);
  });

  it('session id không phải số → 400', async () => {
    const req = { params: { id: 'abc' }, body: { data: { isPublished: true } }, user: { id: 9 } };
    const res = makeRes();

    await aiController.patchLandingMessage(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockGetSessionWizardState).not.toHaveBeenCalled();
  });

  it('session không tồn tại/không thuộc mình → 404', async () => {
    mockGetSessionWizardState.mockResolvedValue(null);
    const req = { params: { id: '77' }, body: { data: { isPublished: true } }, user: { id: 9 } };
    const res = makeRes();

    await aiController.patchLandingMessage(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockUpdateLandingPageMessage).not.toHaveBeenCalled();
  });

  it('session hợp lệ nhưng không có tin landing_page nào để cập nhật → 404', async () => {
    mockUpdateLandingPageMessage.mockResolvedValue(false);
    const req = { params: { id: '77' }, body: { data: { isPublished: true } }, user: { id: 9 } };
    const res = makeRes();

    await aiController.patchLandingMessage(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });
});
