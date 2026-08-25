import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const processSmartChat = jest.fn();
const processSmartChatV2 = jest.fn();
const chargeAiCredit = jest.fn();
const createSession = jest.fn();
const saveMessages = jest.fn();
const getSessionWizardState = jest.fn();
const updateWizardStateSections = jest.fn();
const tryHandleHelpChat = jest.fn(async () => null);

jest.unstable_mockModule('../../services/ai/aiCampaign.service.js', () => ({
  default: {
    processSmartChat,
    processSmartChatV2,
  },
}));

jest.unstable_mockModule('../../services/ai/aiLandingPage.service.js', () => ({ default: {} }));
jest.unstable_mockModule('../../services/ai/aiCampaignDraft.service.js', () => ({ default: {} }));
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
  HELP_ROUTE_LABELS: {
    hỏi_đáp: 'hỏi_đáp',
    làm_giúp: 'làm_giúp',
    không_rõ: 'không_rõ',
    ngoài_phạm_vi: 'ngoài_phạm_vi',
  },
}));
jest.unstable_mockModule('../../middleware/aiCredit.middleware.js', () => ({
  chargeAiCredit,
}));
jest.unstable_mockModule('../campaign.controller.js', () => ({ default: {} }));
jest.unstable_mockModule('../../services/campaign/campaignCrud.service.js', () => ({ default: {} }));
jest.unstable_mockModule('../../repositories/aiSession.repository.js', () => ({
  createSession,
  saveMessages,
  getSessionWizardState,
  updateWizardStateSections,
}));

const { default: aiController } = await import('../ai.controller.js');

const makeRes = () => {
  const res = {
    status: jest.fn(() => res),
    json: jest.fn(() => res),
  };
  return res;
};

describe('ai.controller', () => {
  beforeEach(() => {
    processSmartChat.mockReset();
    processSmartChatV2.mockReset();
    chargeAiCredit.mockReset();
    createSession.mockReset();
    saveMessages.mockReset();
    tryHandleHelpChat.mockReset();
    tryHandleHelpChat.mockResolvedValue(null);
    createSession.mockResolvedValue({ id: 123, title: 'Wizard chat' });
    getSessionWizardState.mockReset();
    getSessionWizardState.mockResolvedValue(null);
    updateWizardStateSections.mockReset();
    updateWizardStateSections.mockResolvedValue(undefined);
  });

  it('does not charge AI credit for wizard short-circuit chat responses', async () => {
    processSmartChat.mockResolvedValue({
      type: 'ask_sender_account',
      content: 'Chọn tài khoản gửi',
      data: { channel: 'zalo' },
      wizardShortCircuit: true,
    });

    const req = {
      body: {
        history: [{ role: 'user', content: '[wizard]{"gate":"channel","channel":"zalo"}\nTôi chọn Zalo.' }],
        locale: 'vi',
      },
      user: { id: 42, role: 'user' },
    };
    const res = makeRes();

    await aiController.chat(req, res);

    expect(chargeAiCredit).not.toHaveBeenCalled();
    // saveMessages nay nhận tham số thứ 5 (safeFiles) — request này không có tệp → [].
    expect(saveMessages).toHaveBeenCalledWith(123, 42, expect.any(String), expect.not.objectContaining({
      wizardShortCircuit: true,
    }), []);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: expect.not.objectContaining({ wizardShortCircuit: true }),
    });
  });

  it('không có tệp: câu hỏi được help-router trả lời, không gọi processSmartChat', async () => {
    tryHandleHelpChat.mockResolvedValue({ type: 'help', content: 'Xem hướng dẫn' });

    const req = {
      body: { history: [{ role: 'user', content: 'gói cước bao nhiêu tiền' }], locale: 'vi' },
      user: { id: 7, role: 'user' },
    };
    const res = makeRes();

    await aiController.chat(req, res);

    expect(tryHandleHelpChat).toHaveBeenCalledTimes(1);
    expect(tryHandleHelpChat).toHaveBeenCalledWith(expect.objectContaining({
      locale: 'vi',
      userId: 7,
      planOwnerUserId: 7,
    }));
    expect(processSmartChat).not.toHaveBeenCalled();
    expect(updateWizardStateSections).toHaveBeenCalledWith(
      123,
      7,
      expect.objectContaining({
        meta: expect.objectContaining({
          conversationLocale: expect.any(String),
        }),
      })
    );
    expect(updateWizardStateSections.mock.calls[0][2].gates).toBeUndefined();
    expect(updateWizardStateSections.mock.calls[0][2].brief).toBeUndefined();
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({ content: 'Xem hướng dẫn' }),
    });
  });

  it('có tệp đính kèm: BỎ QUA help-router, vào thẳng processSmartChat (đọc tệp)', async () => {
    // Help-router sẽ trả lời nếu bị gọi — nhưng có tệp thì không được gọi.
    tryHandleHelpChat.mockResolvedValue({ type: 'help', content: 'KHÔNG ĐƯỢC HIỆN' });
    processSmartChat.mockResolvedValue({ type: 'text', content: 'Đã đọc tệp' });

    const req = {
      body: {
        history: [{ role: 'user', content: 'bạn đọc được file này ko' }],
        files: [{ tempId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301', originalName: 'bao_cao.pdf', contentType: 'application/pdf' }],
        locale: 'vi',
      },
      user: { id: 7, role: 'user' },
    };
    const res = makeRes();

    await aiController.chat(req, res);

    expect(tryHandleHelpChat).not.toHaveBeenCalled();
    expect(processSmartChat).toHaveBeenCalledTimes(1);
    expect(processSmartChat).toHaveBeenCalledWith(expect.objectContaining({
      files: [expect.objectContaining({ tempId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301' })],
    }));
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({ content: 'Đã đọc tệp' }),
    });
  });

  /**
   * Regression (bug thật 25/08/2026): "Tạo template Ngày 2 bị lỗi: Có, mình làm được tạo
   * chiến dịch đa kênh qua Email và Zalo…".
   *
   * Prompt xin template từng slot do frontend tự sinh, mang theo văn xuôi kế hoạch làm
   * payload. Help-router đọc nó thành CÂU HỎI NĂNG LỰC vì classifyCapabilityProbe chỉ cần
   * (a) "có thể" / cặp "có … không" cách nhau ≤120 ký tự — văn nói thường ngày, và
   * (b) chữ "email" hoặc "zalo" — mà prompt slot luôn có "(Email)". Trả câu kịch bản xong
   * thì frontend không nhận được template_draft và báo lỗi.
   */
  it('prompt xin template theo slot (planSlotKey): BỎ QUA help-router', async () => {
    tryHandleHelpChat.mockResolvedValue({ type: 'help', content: 'Có, mình làm được tạo chiến dịch đa kênh' });
    processSmartChat.mockResolvedValue({ type: 'template_draft', content: 'Nội dung ngày 2', data: { channel: 'email' } });

    const req = {
      body: {
        history: [{
          role: 'user',
          // Câu này ĐÚNG là câu đã làm nổ bug: có "(Email)" và cặp "có … không".
          content: 'Tạo chi tiết template cho ngày 2, slot 1 (Email). Mục tiêu ngày: Nhắc lại ưu đãi cho khách hàng có quan tâm nhưng chưa đăng ký, không bỏ lỡ hạn chót.',
        }],
        locale: 'vi',
        planSlotKey: 'd2-s1',
      },
      user: { id: 7, role: 'user' },
    };
    const res = makeRes();

    await aiController.chat(req, res);

    expect(tryHandleHelpChat).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({ type: 'template_draft' }),
    });
  });

  it('prompt xin content_plan (intent=content_plan_request): BỎ QUA help-router', async () => {
    tryHandleHelpChat.mockResolvedValue({ type: 'help', content: 'Có, mình làm được tạo chiến dịch đa kênh' });
    processSmartChat.mockResolvedValue({ type: 'content_plan', content: 'Kế hoạch 3 ngày', data: { totalDays: 3 } });

    const req = {
      body: {
        history: [{
          role: 'user',
          content: 'Hãy trả về content_plan JSON (kế hoạch từng ngày, không viết full nội dung tin) cho: gửi email và zalo, khách có thể đăng ký sớm',
        }],
        locale: 'vi',
        intent: 'content_plan_request',
      },
      user: { id: 7, role: 'user' },
    };
    const res = makeRes();

    await aiController.chat(req, res);

    expect(tryHandleHelpChat).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({ type: 'content_plan' }),
    });
  });

  it('câu hỏi năng lực THẬT (không phải prompt máy) vẫn đi vào help-router', async () => {
    tryHandleHelpChat.mockResolvedValue({ type: 'help', content: 'Có, mình làm được tạo chiến dịch đa kênh' });

    const req = {
      body: {
        history: [{ role: 'user', content: 'bạn có tạo được chiến dịch email không' }],
        locale: 'vi',
      },
      user: { id: 7, role: 'user' },
    };
    const res = makeRes();

    await aiController.chat(req, res);

    expect(tryHandleHelpChat).toHaveBeenCalledTimes(1);
  });

  it('đang trả lời gate wizard: BỎ QUA help-router (kể cả câu lạc đề)', async () => {
    tryHandleHelpChat.mockResolvedValue({ type: 'help', content: 'KHÔNG ĐƯỢC HIỆN' });
    processSmartChat.mockResolvedValue({ type: 'ask_sender_account', content: 'Chọn tài khoản gửi' });

    const req = {
      body: {
        history: [
          { role: 'assistant', type: 'ask_campaign_details', content: 'Bạn muốn gửi qua kênh nào?' },
          { role: 'user', content: 'thời tiết hôm nay' },
        ],
        locale: 'vi',
      },
      user: { id: 7, role: 'user' },
    };
    const res = makeRes();

    await aiController.chat(req, res);

    expect(tryHandleHelpChat).not.toHaveBeenCalled();
    expect(processSmartChat).toHaveBeenCalledTimes(1);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({ content: 'Chọn tài khoản gửi' }),
    });
  });

  it('employee chat V1/V2: truyền resourceOwnerUserId (owner) và userId (actor)', async () => {
    processSmartChat.mockResolvedValue({ type: 'text', content: 'ok' });
    processSmartChatV2.mockResolvedValue({ type: 'text', content: 'ok v2' });

    const employee = {
      id: 9,
      role: 'user',
      activeContext: { type: 'employee', ownerId: 3 },
    };
    const history = [{ role: 'user', content: 'Xin chào' }];

    await aiController.chat({
      body: { history, locale: 'vi' },
      user: employee,
    }, makeRes());

    expect(tryHandleHelpChat).toHaveBeenCalledWith(expect.objectContaining({
      userId: 9,
      planOwnerUserId: 3,
    }));
    expect(processSmartChat).toHaveBeenCalledWith(expect.objectContaining({
      userId: 9,
      resourceOwnerUserId: 3,
    }));

    await aiController.chatV2({
      body: { history, locale: 'vi' },
      user: employee,
    }, makeRes());

    expect(processSmartChatV2).toHaveBeenCalledWith(expect.objectContaining({
      userId: 9,
      resourceOwnerUserId: 3,
    }));
  });

  it('plan-advice help response still meta-only persists locale without touching gates/brief', async () => {
    tryHandleHelpChat.mockResolvedValue({
      type: 'text',
      content: 'Starter phù hợp.\n\n[Xem Bảng giá](/pricing)',
      data: { planAdvice: true, currentPlanCode: 'starter', pricingPath: '/pricing' },
    });

    const req = {
      body: {
        history: [{ role: 'user', content: 'Gói nào phù hợp cho shop nhỏ?' }],
        locale: 'vi',
        sessionId: 55,
      },
      user: { id: 7, role: 'user' },
    };
    getSessionWizardState.mockResolvedValue({
      wizard_state: {
        version: 1,
        gates: { channel: 'email' },
        brief: { version: 1, contentLocale: 'vi' },
        meta: { conversationLocale: 'vi' },
      },
    });
    const res = makeRes();
    await aiController.chat(req, res);

    expect(processSmartChat).not.toHaveBeenCalled();
    expect(updateWizardStateSections).toHaveBeenCalledWith(
      55,
      7,
      expect.objectContaining({
        meta: expect.objectContaining({ conversationLocale: expect.any(String) }),
      }),
    );
    expect(updateWizardStateSections.mock.calls[0][2].gates).toBeUndefined();
    expect(updateWizardStateSections.mock.calls[0][2].brief).toBeUndefined();
  });

  /**
   * planSlotKey là DANH TÍNH của slot trong kế hoạch nội dung: nó được lưu xuống
   * ai_chat_messages.data và là thứ duy nhất giúp dựng lại luồng soạn sau khi tải lại
   * trang. Bản đầu (25/08) để backend regex ngược prompt văn xuôi "ngày N, slot M" —
   * biến một câu chữ do frontend sinh thành thứ gánh dữ liệu. Giờ client gửi tường minh.
   */
  it('chuyển planSlotKey hợp lệ xuống processSmartChat', async () => {
    processSmartChat.mockResolvedValue({ type: 'template_draft', content: 'ok', data: {} });

    const req = {
      body: {
        history: [{ role: 'user', content: 'Tạo chi tiết template cho ngày 2, slot 1 (Email).' }],
        locale: 'vi',
        planSlotKey: 'd2-s1',
      },
      user: { id: 9, role: 'user' },
    };

    await aiController.chat(req, makeRes());

    expect(processSmartChat).toHaveBeenCalledWith(
      expect.objectContaining({ planSlotKey: 'd2-s1' })
    );
  });

  it('KHÔNG nhận planSlotKey sai khuôn — client không nhét được chuỗi tuỳ ý vào DB', async () => {
    processSmartChat.mockResolvedValue({ type: 'template_draft', content: 'ok', data: {} });

    for (const bad of ['../../etc/passwd', 'd1', 's1-d2', '<script>', 'd1-s1; DROP TABLE', '']) {
      processSmartChat.mockClear();
      const req = {
        body: { history: [{ role: 'user', content: 'x' }], locale: 'vi', planSlotKey: bad },
        user: { id: 9, role: 'user' },
      };
      // eslint-disable-next-line no-await-in-loop
      await aiController.chat(req, makeRes());
      expect(processSmartChat).toHaveBeenCalledWith(
        expect.objectContaining({ planSlotKey: null })
      );
    }
  });
});
