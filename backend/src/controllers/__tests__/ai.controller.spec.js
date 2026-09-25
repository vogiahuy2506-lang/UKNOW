import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const processSmartChat = jest.fn();
const processSmartChatV2 = jest.fn();
const chargeAiCredit = jest.fn();
const createSession = jest.fn();
const saveMessages = jest.fn();
const getSessionWizardState = jest.fn();
const updateWizardStateSections = jest.fn();
const tryHandleHelpChat = jest.fn(async () => null);

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
    processSmartChatV2,
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
jest.unstable_mockModule('../../repositories/aiSession.repository.js', () => ({
  createSession,
  saveMessages,
  getSessionWizardState,
  updateWizardStateSections,
  getLandingPageMessage,
  updateLandingPageMessage,
  saveMessagesReturningIds,
  saveAssistantMessage,
  listUserFilesSinceLastLanding: jest.fn(async () => []),
}));

const { default: aiController } = await import('../ai.controller.js');
const { buildAutoLayoutFixInstruction, normalizeLayoutFindings } = await import('../../utils/landingLayoutFindings.util.js');

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

    prepareScript.mockReset();
    autoCreateEmailTemplates.mockReset();
    autoCreateEmailTemplates.mockResolvedValue(undefined);
    autoCreateZaloTemplates.mockReset();
    autoCreateZaloTemplates.mockResolvedValue(undefined);
    cleanupAutoCreatedTemplates.mockReset();
    cleanupAutoCreatedTemplates.mockResolvedValue(undefined);
    assertResourceVersionsCurrent.mockReset();
    assertResourceVersionsCurrent.mockResolvedValue(undefined);
    buildConfirmationView.mockReset();
    buildConfirmationView.mockResolvedValue({ readyToCreate: true });
    validateNodeConfig.mockReset();
    validateNodeConfig.mockReturnValue({ valid: true, errors: [] });
    campaignControllerCreate.mockReset();
    fillReadSheetFirstTabNames.mockReset();
    fillReadSheetFirstTabNames.mockResolvedValue(undefined);
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

  /**
   * PLAN_TU_NHAN_TEN_SHEET_DAU_TIEN_2026-09-15, Việc 2: mọi chiến dịch AI tạo đi qua
   * createCampaignFromDraft. Node read_sheet có sheetName trống phải được điền tên tab đầu
   * tiên (fillReadSheetFirstTabNames) SAU prepareScript, TRƯỚC vòng validateNodeConfig — để
   * node đã điền tên đi vào bước tạo, không phải node còn trống.
   */
  it('createCampaignFromDraft: node read_sheet sheetName trống -> tự điền tên tab trước khi validate và trước khi gửi vào bước tạo', async () => {
    const readSheetNode = {
      id: 'n1',
      nodeSubtype: 'read_sheet',
      config: { sheetUrl: 'https://docs.google.com/spreadsheets/d/abc123/edit', sheetName: '' },
    };

    prepareScript.mockResolvedValue({
      campaignName: 'Chiến dịch test',
      description: '',
      campaignType: 'zalo_personal',
      nodes: [readSheetNode],
      connections: [],
    });

    // fillReadSheetFirstTabNames sửa TRỰC TIẾP trên object node (đúng hành vi thật của service —
    // xem readSheetAutoName.service.spec.js); mock giả lập lại đúng effect đó.
    fillReadSheetFirstTabNames.mockImplementation(async (nodes) => {
      for (const node of nodes) {
        if (node.nodeSubtype === 'read_sheet' && !node.config.sheetName) {
          node.config.sheetName = 'Khách tháng 9';
          node.config.sheetNameSource = 'auto';
        }
      }
    });

    campaignControllerCreate.mockImplementation(async (req, res) => {
      res.json({ success: true, data: { id: 999 } });
    });

    const req = {
      body: { script: { nodes: [readSheetNode], connections: [] } },
      user: { id: 7, role: 'user' },
    };
    const res = makeRes();

    await aiController.createCampaignFromDraft(req, res);

    expect(fillReadSheetFirstTabNames).toHaveBeenCalledTimes(1);
    // Vòng validate chạy SAU khi đã điền — thấy node với sheetName đã có, không phải rỗng.
    expect(validateNodeConfig).toHaveBeenCalledWith(
      'read_sheet',
      expect.objectContaining({ sheetName: 'Khách tháng 9', sheetNameSource: 'auto' })
    );
    // Node gửi vào bước tạo campaign thật (campaignController.create) cũng đã có tên điền sẵn.
    expect(campaignControllerCreate).toHaveBeenCalledTimes(1);
    const [createReqArg] = campaignControllerCreate.mock.calls[0];
    expect(createReqArg.body.nodes[0].config.sheetName).toBe('Khách tháng 9');
    expect(createReqArg.body.nodes[0].config.sheetNameSource).toBe('auto');
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, campaignId: 999 }));
  });

  it('T10. editLandingHtml: truyền landingPageId: null vào ingestLandingAttachments và gom unusedAssets/strippedImageUrls vào skippedAttachments', async () => {
    findLandingByIdInScope.mockResolvedValue({ id: 456, customConfig: null });
    ingestLandingAttachments.mockResolvedValue({
      assets: [{ url: 'https://cdn.example.com/a1.png', originalName: 'a1.png' }],
      documents: [],
      skipped: [],
    });

    editHtml.mockResolvedValue({
      title: 'Trang sửa',
      html: '<div>Đã sửa</div>',
      unusedAssets: [{ originalName: 'a2.png', url: 'https://cdn.example.com/a2.png' }],
      strippedImageUrls: ['https://fake.cdn.com/bad.png'],
    });

    const req = {
      user: { id: 1, role: 'user' },
      body: {
        currentHtml: '<div>Gốc</div>',
        instruction: 'Đổi tiêu đề',
        landingPageId: 456,
        files: [{ tempId: 't1', originalName: 'a1.png' }],
      },
    };
    const res = makeRes();

    await aiController.editLandingHtml(req, res);

    expect(ingestLandingAttachments).toHaveBeenCalledWith(
      expect.objectContaining({
        landingPageId: null,
      })
    );
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({
        title: 'Trang sửa',
        // Khuôn { originalName, kind, reason }: frontend useCanvasConversation đọc originalName,
        // AiChatbot lọc theo kind — không so chuỗi tiếng Việt.
        skippedAttachments: [
          {
            originalName: 'a2.png',
            kind: 'reference_image',
            reason: 'Không chèn vào trang — coi là ảnh tham khảo',
          },
          {
            originalName: 'https://fake.cdn.com/bad.png',
            kind: 'fake_image_url',
            reason: 'AI tự bịa URL ảnh, đã gỡ khỏi trang',
          },
        ],
      }),
    });
  });
});


/**
 * PLAN_LANDING_TU_KIEM_HIEN_THI_TU_SUA mục 10 (PR-2): lượt sửa tự động không trừ credit, lệnh sửa do
 * server dựng, trần 2 lượt/tin, lưu bản trước + Hoàn tác, và trả messageId của thẻ landing vừa sinh.
 */
describe('ai.controller — sửa landing tự động / hoàn tác (PR-2 landing tự kiểm)', () => {
  const finding = (over = {}) => ({
    kind: 'text_covered',
    width: 1280,
    text: '03/02/2026',
    selector: 'span.block.text-lg.font-extrabold:nth-of-type(1)',
    coveredBy: { text: '1', selector: 'div.absolute.-left-11.w-8:nth-of-type(1)' },
    overlapPx: 12,
    side: 'right',
    sectionTitle: 'Dòng Thời Gian',
    ...over,
  });

  const autoReq = (body = {}, user = { id: 1, role: 'user' }) => ({
    user,
    body: {
      currentHtml: '<div>Trang hiện tại</div>',
      autoLayoutFix: true,
      layoutFindings: [finding()],
      sessionId: 55,
      messageId: 900,
      ...body,
    },
  });
  const manualReq = (body = {}) => ({
    user: { id: 1, role: 'user' },
    body: {
      currentHtml: '<div>Trang hiện tại</div>',
      instruction: 'Đổi tiêu đề thành Xin chào',
      sessionId: 55,
      messageId: 900,
      ...body,
    },
  });

  beforeEach(() => {
    editHtml.mockReset();
    generateLanding.mockReset();
    chargeAiCredit.mockReset();
    saveMessages.mockReset();
    getLandingPageMessage.mockReset();
    updateLandingPageMessage.mockReset();
    saveMessagesReturningIds.mockReset();
    saveAssistantMessage.mockReset();
    ingestLandingAttachments.mockReset();
    findLandingByIdInScope.mockReset();
    ingestLandingAttachments.mockResolvedValue({ assets: [], documents: [], skipped: [] });
    editHtml.mockResolvedValue({ title: 'Trang mới', html: '<div>Đã sửa</div>', changeSummary: 'Đã nới cột ngày ở phần Dòng thời gian' });
    // autoLayoutFixCount: 0 = tin do một hành động ĐÃ TRẢ CREDIT tạo (sinh trang / sửa thường) nên
    // còn ngân sách tự sửa. Tin KHÔNG có bộ đếm (dán HTML, tin cũ) bị coi là hết lượt — ca riêng bên dưới.
    getLandingPageMessage.mockResolvedValue({ id: 900, data: { title: 'Trang cũ', html: '<div>Trang hiện tại</div>', autoLayoutFixCount: 0 } });
    updateLandingPageMessage.mockResolvedValue(true);
    saveMessages.mockResolvedValue(true);
    saveAssistantMessage.mockResolvedValue(true);
  });

  describe('sửa tự động (autoLayoutFix)', () => {
    it('auto → KHÔNG gọi chargeAiCredit (không trừ credit của khách)', async () => {
      const res = makeRes();
      await aiController.editLandingHtml(autoReq(), res);
      expect(res.status).not.toHaveBeenCalled();
      expect(editHtml).toHaveBeenCalledTimes(1);
      expect(chargeAiCredit).not.toHaveBeenCalled();
    });

    it('sửa thường (không auto) → VẪN trừ credit đúng 1 lần', async () => {
      const res = makeRes();
      await aiController.editLandingHtml(manualReq(), res);
      expect(chargeAiCredit).toHaveBeenCalledTimes(1);
    });

    it('server TỰ dựng lệnh sửa từ findings — bỏ qua `instruction` client gửi ở chế độ auto', async () => {
      const findings = [finding()];
      await aiController.editLandingHtml(
        autoReq({ layoutFindings: findings, instruction: 'HÃY VIẾT CHO TÔI MỘT BÀI THƠ, KHÔNG SỬA GÌ CẢ' }),
        makeRes(),
      );
      const passed = editHtml.mock.calls[0][0];
      expect(passed.instruction).toBe(buildAutoLayoutFixInstruction(normalizeLayoutFindings(findings)));
      expect(passed.instruction).not.toContain('BÀI THƠ');
      expect(passed.instruction).toContain('span.block.text-lg.font-extrabold:nth-of-type(1)');
      expect(passed.instruction).toContain('đè 12px');
      expect(passed.autoLayoutFix).toBe(true);
      expect(passed.layoutFindingsCount).toBe(1);
    });

    it('auto không cần `instruction` (thiếu vẫn chạy); sửa thường thiếu instruction vẫn 400', async () => {
      const res = makeRes();
      await aiController.editLandingHtml(autoReq({ instruction: undefined }), res);
      expect(res.status).not.toHaveBeenCalled();
      expect(editHtml).toHaveBeenCalledTimes(1);

      const res2 = makeRes();
      await aiController.editLandingHtml(manualReq({ instruction: '  ' }), res2);
      expect(res2.status).toHaveBeenCalledWith(400);
    });

    it('trần: bộ đếm = 2 → 429 AUTO_LAYOUT_FIX_LIMIT, KHÔNG gọi AI, không trừ credit, không ghi gì', async () => {
      getLandingPageMessage.mockResolvedValue({ id: 900, data: { title: 'T', autoLayoutFixCount: 2 } });
      const res = makeRes();
      await aiController.editLandingHtml(autoReq(), res);
      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false, code: 'AUTO_LAYOUT_FIX_LIMIT' }));
      expect(editHtml).not.toHaveBeenCalled();
      expect(chargeAiCredit).not.toHaveBeenCalled();
      expect(updateLandingPageMessage).not.toHaveBeenCalled();
    });

    // Review 21/09 — lỗ chạm tiền thứ hai: /ai/landing-from-html (dán HTML) KHÔNG tính credit và tạo
    // tin landing_page mới không giới hạn. Bản đầu coi "thiếu bộ đếm" là 0 → mỗi lần dán được 2 lượt
    // AI miễn phí, lặp vô hạn. Ngân sách tự sửa chỉ do hành động đã trả credit cấp (ghi bộ đếm = 0).
    it.each([
      ['tin dán HTML (source: pasted, không có bộ đếm)', { title: 'Dán', html: '<div>x</div>', source: 'pasted' }],
      ['tin cũ sinh trước bản này (không có bộ đếm)', { title: 'Cũ', html: '<div>x</div>' }],
      ['bộ đếm là chuỗi', { autoLayoutFixCount: '0' }],
      ['bộ đếm âm', { autoLayoutFixCount: -1 }],
      ['bộ đếm null', { autoLayoutFixCount: null }],
    ])('%s → 429, KHÔNG gọi AI, không ghi gì', async (_label, data) => {
      getLandingPageMessage.mockResolvedValue({ id: 900, data });
      const res = makeRes();
      await aiController.editLandingHtml(autoReq(), res);
      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'AUTO_LAYOUT_FIX_LIMIT' }));
      expect(editHtml).not.toHaveBeenCalled();
      expect(updateLandingPageMessage).not.toHaveBeenCalled();
    });

    it('bộ đếm > 2 (dữ liệu lạ) cũng bị chặn; bộ đếm = 1 vẫn được sửa và tăng lên 2', async () => {
      getLandingPageMessage.mockResolvedValue({ id: 900, data: { autoLayoutFixCount: 7 } });
      const blocked = makeRes();
      await aiController.editLandingHtml(autoReq(), blocked);
      expect(blocked.status).toHaveBeenCalledWith(429);

      getLandingPageMessage.mockResolvedValue({ id: 900, data: { title: 'T', autoLayoutFixCount: 1 } });
      const ok = makeRes();
      await aiController.editLandingHtml(autoReq(), ok);
      expect(ok.status).not.toHaveBeenCalled();
      expect(updateLandingPageMessage.mock.calls[0][2].autoLayoutFixCount).toBe(2);
    });

    it('findings rỗng / toàn phần tử sai kiểu → 400 LAYOUT_FINDINGS_REQUIRED, không gọi AI', async () => {
      for (const layoutFindings of [undefined, [], 'x', [{ kind: 'bogus' }, null, 3]]) {
        const res = makeRes();
        await aiController.editLandingHtml(autoReq({ layoutFindings }), res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'LAYOUT_FINDINGS_REQUIRED' }));
      }
      expect(editHtml).not.toHaveBeenCalled();
      expect(getLandingPageMessage).not.toHaveBeenCalled();
    });

    it('thiếu sessionId → 400; không tìm thấy tin landing_page → 404; cả hai không gọi AI', async () => {
      const noSession = makeRes();
      await aiController.editLandingHtml(autoReq({ sessionId: undefined }), noSession);
      expect(noSession.status).toHaveBeenCalledWith(400);
      expect(noSession.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'AUTO_LAYOUT_FIX_SESSION_REQUIRED' }));

      getLandingPageMessage.mockResolvedValue(null);
      const noMessage = makeRes();
      await aiController.editLandingHtml(autoReq(), noMessage);
      expect(noMessage.status).toHaveBeenCalledWith(404);
      expect(noMessage.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'LANDING_MESSAGE_NOT_FOUND' }));
      expect(editHtml).not.toHaveBeenCalled();
    });

    it('không đọc được tin (lỗi DB) → không chạy sửa miễn phí (500), không gọi AI', async () => {
      getLandingPageMessage.mockRejectedValue(new Error('db down'));
      const res = makeRes();
      await aiController.editLandingHtml(autoReq(), res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(editHtml).not.toHaveBeenCalled();
    });

    it('thành công: một UPDATE ghi html mới + previousHtml + previousTitle + autoLayoutFixCount 1, đúng id tin đã đọc', async () => {
      const res = makeRes();
      await aiController.editLandingHtml(autoReq({ messageId: undefined }), res);
      expect(updateLandingPageMessage).toHaveBeenCalledTimes(1);
      const [sid, uid, patch, mid] = updateLandingPageMessage.mock.calls[0];
      expect([sid, uid, mid]).toEqual([55, 1, 900]); // id lấy từ tin đã đọc, không phải messageId client
      expect(patch).toEqual({
        title: 'Trang mới',
        html: '<div>Đã sửa</div>',
        previousHtml: '<div>Trang hiện tại</div>',
        previousTitle: 'Trang cũ',
        autoLayoutFixCount: 1,
      });
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          html: '<div>Đã sửa</div>',
          changeSummary: 'Đã nới cột ngày ở phần Dòng thời gian',
          canRevert: true,
        }),
      });
    });

    it('lưu hỏng thì KHÔNG báo canRevert; không có title cũ thì không ghi previousTitle', async () => {
      updateLandingPageMessage.mockResolvedValue(false);
      // Không có title cũ, nhưng vẫn còn ngân sách tự sửa (tin thiếu bộ đếm bị chặn 429 — ca riêng ở trên).
      getLandingPageMessage.mockResolvedValue({ id: 900, data: { autoLayoutFixCount: 0 } });
      const res = makeRes();
      await aiController.editLandingHtml(autoReq(), res);
      const { data } = res.json.mock.calls[0][0];
      expect(data).not.toHaveProperty('canRevert');
      expect(updateLandingPageMessage.mock.calls[0][2]).not.toHaveProperty('previousTitle');
    });

    it('lệnh kỹ thuật KHÔNG bị lưu thành tin của người dùng: chỉ ghi lời xác nhận tiếng người của AI', async () => {
      await aiController.editLandingHtml(autoReq(), makeRes());
      expect(saveMessages).not.toHaveBeenCalled();
      expect(saveAssistantMessage).toHaveBeenCalledTimes(1);
      const [, , ack] = saveAssistantMessage.mock.calls[0];
      expect(ack.type).toBe('landing_edit_ack');
      expect(ack.content).toBe('Đã chỉnh hiển thị: Đã nới cột ngày ở phần Dòng thời gian');
      expect(ack.content).not.toMatch(/px|span\.|nth-of-type|absolute/);
    });

    it('không có changeSummary → lời xác nhận chung, không lộ gì kỹ thuật', async () => {
      editHtml.mockResolvedValue({ title: 'T', html: '<div>x</div>' });
      await aiController.editLandingHtml(autoReq(), makeRes());
      expect(saveAssistantMessage.mock.calls[0][2].content).toBe('Đã chỉnh lại hiển thị của trang.');
    });

    it('auto không nhận file đính kèm (không mở đường nạp file miễn phí)', async () => {
      await aiController.editLandingHtml(autoReq({ files: [{ tempId: 't1', originalName: 'a.png' }] }), makeRes());
      expect(ingestLandingAttachments).toHaveBeenCalledWith(expect.objectContaining({ files: [] }));
    });

    it('bắn song song: request thứ hai cùng tin khi lượt đầu chưa xong → 429 (không lách trần bằng đua request)', async () => {
      let finishFirst;
      editHtml.mockImplementationOnce(
        () => new Promise((resolve) => { finishFirst = () => resolve({ title: 'T', html: '<div>x</div>' }); }),
      );
      const firstRes = makeRes();
      const first = aiController.editLandingHtml(autoReq(), firstRes);
      await new Promise((resolve) => setImmediate(resolve)); // để lượt đầu tới chỗ chờ AI

      const secondRes = makeRes();
      await aiController.editLandingHtml(autoReq(), secondRes);
      expect(secondRes.status).toHaveBeenCalledWith(429);
      expect(editHtml).toHaveBeenCalledTimes(1);

      finishFirst();
      await first;
      expect(firstRes.status).not.toHaveBeenCalled();

      // xong lượt đầu thì khoá nhả: lượt sau (bộ đếm vẫn 0 trong mock) chạy được
      const thirdRes = makeRes();
      await aiController.editLandingHtml(autoReq(), thirdRes);
      expect(thirdRes.status).not.toHaveBeenCalled();
    });

    it('AI lỗi giữa chừng vẫn nhả khoá — lượt sau không bị kẹt 429', async () => {
      editHtml.mockRejectedValueOnce(Object.assign(new Error('AI hỏng'), { status: 502 }));
      const failed = makeRes();
      await aiController.editLandingHtml(autoReq(), failed);
      expect(failed.status).toHaveBeenCalledWith(502);
      expect(updateLandingPageMessage).not.toHaveBeenCalled();

      const retry = makeRes();
      await aiController.editLandingHtml(autoReq(), retry);
      expect(retry.status).not.toHaveBeenCalled();
    });
  });

  describe('sửa thường (người dùng gõ, có trừ credit)', () => {
    it('lưu previousHtml + previousTitle, ĐẶT LẠI bộ đếm về 0, báo canRevert, lưu tin user + tin xác nhận như cũ', async () => {
      getLandingPageMessage.mockResolvedValue({ id: 900, data: { title: 'Trang cũ', autoLayoutFixCount: 2 } });
      const res = makeRes();
      await aiController.editLandingHtml(manualReq(), res);
      expect(editHtml.mock.calls[0][0].instruction).toBe('Đổi tiêu đề thành Xin chào');
      expect(editHtml.mock.calls[0][0].autoLayoutFix).toBe(false);
      expect(updateLandingPageMessage.mock.calls[0][2]).toEqual({
        title: 'Trang mới',
        html: '<div>Đã sửa</div>',
        previousHtml: '<div>Trang hiện tại</div>',
        previousTitle: 'Trang cũ',
        autoLayoutFixCount: 0,
      });
      expect(res.json.mock.calls[0][0].data.canRevert).toBe(true);
      expect(saveMessages).toHaveBeenCalledWith(55, 1, 'Đổi tiêu đề thành Xin chào', expect.objectContaining({ type: 'landing_edit_ack' }));
      expect(saveAssistantMessage).not.toHaveBeenCalled();
    });

    // Review PR-3 (21/09): frontend từng tự nối findings vào `instruction` → server lưu cả selector/
    // pixel thành tin của người dùng và lặp lại trong lời xác nhận; tải lại phiên là lộ (phạm nguyên
    // tắc 1: khách không bao giờ thấy class/pixel). Giờ findings đi trường riêng, chỉ vào lệnh cho AI.
    it('sửa thường KÈM layoutFindings: AI nhận số đo, còn tin người dùng + lời xác nhận lưu NGUYÊN VĂN câu họ gõ', async () => {
      const res = makeRes();
      await aiController.editLandingHtml(
        manualReq({ instruction: 'chỗ này bị đè, sửa giúp tôi', layoutFindings: [finding()] }),
        res,
      );
      const sentToAi = editHtml.mock.calls[0][0].instruction;
      expect(sentToAi.startsWith('chỗ này bị đè, sửa giúp tôi\n\n')).toBe(true);
      expect(sentToAi).toContain('span.block.text-lg.font-extrabold:nth-of-type(1)');
      expect(sentToAi).toContain('đè 12px');
      expect(editHtml.mock.calls[0][0].autoLayoutFix).toBe(false);

      const [, , savedUserContent, savedAck] = saveMessages.mock.calls[0];
      expect(savedUserContent).toBe('chỗ này bị đè, sửa giúp tôi');
      for (const leaked of ['nth-of-type', '12px', 'span.block', 'Hệ thống vừa render']) {
        expect(savedUserContent).not.toContain(leaked);
        expect(savedAck.content).not.toContain(leaked);
      }
      expect(chargeAiCredit).toHaveBeenCalledTimes(1); // vẫn là lượt sửa trả phí
    });

    it('sửa thường với layoutFindings rác / rỗng → lệnh cho AI y nguyên câu người dùng', async () => {
      for (const layoutFindings of [undefined, [], 'x', [{ kind: 'bogus' }, null]]) {
        editHtml.mockClear();
        await aiController.editLandingHtml(manualReq({ layoutFindings }), makeRes());
        expect(editHtml.mock.calls[0][0].instruction).toBe('Đổi tiêu đề thành Xin chào');
      }
    });

    it('không đọc được tin (lỗi DB) → vẫn sửa được như trước, dùng messageId client', async () => {
      getLandingPageMessage.mockRejectedValue(new Error('db down'));
      const res = makeRes();
      await aiController.editLandingHtml(manualReq(), res);
      expect(res.status).not.toHaveBeenCalled();
      expect(updateLandingPageMessage.mock.calls[0][3]).toBe(900);
      expect(updateLandingPageMessage.mock.calls[0][2]).not.toHaveProperty('previousTitle');
    });

    it('không có sessionId → không đọc/ghi tin nào, không canRevert (hành vi cũ)', async () => {
      const res = makeRes();
      await aiController.editLandingHtml(manualReq({ sessionId: undefined }), res);
      expect(getLandingPageMessage).not.toHaveBeenCalled();
      expect(updateLandingPageMessage).not.toHaveBeenCalled();
      expect(res.json.mock.calls[0][0].data).not.toHaveProperty('canRevert');
    });
  });

  describe('Hoàn tác (PATCH /ai/sessions/:id/landing-message)', () => {
    const revertReq = (data = { revert: true }, extra = {}) => ({
      user: { id: 1, role: 'user' },
      params: { id: '55' },
      body: { messageId: 900, data, ...extra },
    });
    const stored = {
      id: 900,
      data: { title: 'Trang mới', html: '<div>B mới</div>', previousTitle: 'Trang cũ', previousHtml: '<div>A cũ</div>', autoLayoutFixCount: 2 },
    };

    beforeEach(() => {
      getSessionWizardState.mockResolvedValue({ any: 'state' });
      getLandingPageMessage.mockResolvedValue(stored);
    });

    it('hoán html ↔ previousHtml và title ↔ previousTitle do SERVER làm, trả { title, html }', async () => {
      const res = makeRes();
      await aiController.patchLandingMessage(revertReq(), res);
      expect(getLandingPageMessage).toHaveBeenCalledWith(55, 1, 900);
      expect(updateLandingPageMessage).toHaveBeenCalledWith(
        55,
        1,
        { title: 'Trang cũ', html: '<div>A cũ</div>', previousHtml: '<div>B mới</div>', previousTitle: 'Trang mới' },
        900,
      );
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: { title: 'Trang cũ', html: '<div>A cũ</div>', canRevert: true },
      });
    });

    it('không có bản trước → 409 NOTHING_TO_REVERT, không ghi gì', async () => {
      for (const data of [{ title: 'T', html: '<p/>' }, { title: 'T', html: '<p/>', previousHtml: '   ' }, { previousHtml: 5 }]) {
        getLandingPageMessage.mockResolvedValue({ id: 900, data });
        const res = makeRes();
        await aiController.patchLandingMessage(revertReq(), res);
        expect(res.status).toHaveBeenCalledWith(409);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'NOTHING_TO_REVERT' }));
      }
      expect(updateLandingPageMessage).not.toHaveBeenCalled();
    });

    it('BỎ QUA html/title/previousHtml client gửi kèm — chỉ dùng bản đã lưu ở server', async () => {
      const res = makeRes();
      await aiController.patchLandingMessage(
        revertReq({ revert: true, html: '<script>evil()</script>', title: 'HACK', previousHtml: '<b>evil</b>', previousTitle: 'HACK2' }),
        res,
      );
      const patch = updateLandingPageMessage.mock.calls[0][2];
      expect(patch.html).toBe('<div>A cũ</div>');
      expect(patch.title).toBe('Trang cũ');
      expect(patch.previousHtml).toBe('<div>B mới</div>');
      expect(JSON.stringify(patch)).not.toMatch(/evil|HACK/);
      expect(JSON.stringify(res.json.mock.calls[0][0])).not.toMatch(/evil|HACK/);
    });

    it('thiếu previousTitle → giữ title hiện tại, và title hiện tại thành previousTitle mới (Hoàn tác ↔ Làm lại)', async () => {
      getLandingPageMessage.mockResolvedValue({ id: 900, data: { title: 'Trang mới', html: '<div>B</div>', previousHtml: '<div>A</div>' } });
      await aiController.patchLandingMessage(revertReq(), makeRes());
      const patch = updateLandingPageMessage.mock.calls[0][2];
      expect(patch).toEqual({ title: 'Trang mới', html: '<div>A</div>', previousHtml: '<div>B</div>', previousTitle: 'Trang mới' });
    });

    it('session không thuộc user → 404; tin không tồn tại → 404; không ghi', async () => {
      getSessionWizardState.mockResolvedValue(null);
      const noSession = makeRes();
      await aiController.patchLandingMessage(revertReq(), noSession);
      expect(noSession.status).toHaveBeenCalledWith(404);

      getSessionWizardState.mockResolvedValue({ any: 'state' });
      getLandingPageMessage.mockResolvedValue(null);
      const noMessage = makeRes();
      await aiController.patchLandingMessage(revertReq(), noMessage);
      expect(noMessage.status).toHaveBeenCalledWith(404);
      expect(updateLandingPageMessage).not.toHaveBeenCalled();
    });

    it('chỉ revert === true mới vào nhánh hoàn tác; các nhánh cũ (whitelist 3 khoá) giữ nguyên', async () => {
      const res = makeRes();
      await aiController.patchLandingMessage(revertReq({ revert: 'true', html: '<p>x</p>' }), res);
      expect(res.status).toHaveBeenCalledWith(400); // không có khoá whitelist nào
      expect(updateLandingPageMessage).not.toHaveBeenCalled();

      const res2 = makeRes();
      await aiController.patchLandingMessage(revertReq({ slug: 'trang-a', html: '<p>x</p>' }), res2);
      expect(updateLandingPageMessage).toHaveBeenCalledWith(55, 1, { slug: 'trang-a' }, 900);
      expect(res2.json).toHaveBeenCalledWith({ success: true, data: { slug: 'trang-a' } });
    });
  });

  describe('generateLandingHtml trả messageId (10.1)', () => {
    const genReq = (body = {}) => ({ user: { id: 1, role: 'user' }, body: { prompt: 'Landing khoá học', sessionId: 55, ...body } });

    beforeEach(() => {
      generateLanding.mockResolvedValue({ title: 'Trang khoá học', html: '<div>Nội dung</div>' });
    });

    it('lưu tin bằng saveMessagesReturningIds và gán data.messageId = id tin assistant', async () => {
      saveMessagesReturningIds.mockResolvedValue({ userMessageId: 4241, assistantMessageId: 4242 });
      const res = makeRes();
      await aiController.generateLandingHtml(genReq(), res);
      expect(saveMessagesReturningIds).toHaveBeenCalledTimes(1);
      expect(saveMessagesReturningIds.mock.calls[0][4]).toBeUndefined();
      expect(saveMessagesReturningIds.mock.calls[0][3]).toMatchObject({ type: 'landing_page', data: { title: 'Trang khoá học' } });
      // Review 21/09: sinh trang (đã trừ credit) phải CẤP ngân sách tự sửa bằng bộ đếm = 0; tin thiếu
      // bộ đếm bị editLandingHtml coi là hết lượt (chặn đường dán HTML lấy lượt miễn phí vô hạn).
      expect(saveMessagesReturningIds.mock.calls[0][3].data.autoLayoutFixCount).toBe(0);
      expect(saveMessages).not.toHaveBeenCalled(); // không đổi saveMessages / không lưu hai lần
      expect(res.json).toHaveBeenCalledWith({ success: true, data: expect.objectContaining({ messageId: 4242 }) });
      expect(chargeAiCredit).toHaveBeenCalledTimes(1); // sinh trang vẫn trừ credit
    });

    it('lưu hỏng (null hoặc ném lỗi) → không có messageId, response vẫn thành công', async () => {
      saveMessagesReturningIds.mockResolvedValue(null);
      const res = makeRes();
      await aiController.generateLandingHtml(genReq(), res);
      expect(res.json.mock.calls[0][0].data).not.toHaveProperty('messageId');

      saveMessagesReturningIds.mockRejectedValue(new Error('db down'));
      const res2 = makeRes();
      await aiController.generateLandingHtml(genReq(), res2);
      expect(res2.json.mock.calls[0][0]).toMatchObject({ success: true });
      expect(res2.json.mock.calls[0][0].data).not.toHaveProperty('messageId');
    });

    it('không có sessionId → không lưu, không messageId', async () => {
      const res = makeRes();
      await aiController.generateLandingHtml(genReq({ sessionId: undefined }), res);
      expect(saveMessagesReturningIds).not.toHaveBeenCalled();
      expect(res.json.mock.calls[0][0].data).not.toHaveProperty('messageId');
    });
  });

  describe('chat sinh landing page trả messageId và cấp ngân sách tự sửa (lệnh giao 25/09)', () => {
    const chatReq = (body = {}) => ({
      user: { id: 1, role: 'user' },
      body: {
        history: [{ role: 'user', content: 'Tạo landing page bán khoá học' }],
        locale: 'vi',
        sessionId: 55,
        ...body,
      },
    });

    beforeEach(() => {
      saveMessagesReturningIds.mockReset();
      saveMessages.mockReset();
      tryHandleHelpChat.mockReset();
      tryHandleHelpChat.mockResolvedValue(null);
    });

    it('1. Lượt chat sinh landing page cấp sẵn ngân sách tự sửa autoLayoutFixCount = 0', async () => {
      processSmartChat.mockResolvedValue({
        type: 'landing_page',
        content: 'Đây là landing page của bạn',
        data: { title: 'Trang khoá học', html: '<div>Trang mẫu</div>' },
      });
      saveMessagesReturningIds.mockResolvedValue({ userMessageId: 201, assistantMessageId: 202 });

      const res = makeRes();
      await aiController.chat(chatReq(), res);

      expect(saveMessagesReturningIds).toHaveBeenCalledTimes(1);
      expect(saveMessages).not.toHaveBeenCalled();
      const [, , , assistantMsg] = saveMessagesReturningIds.mock.calls[0];
      expect(assistantMsg).toMatchObject({
        type: 'landing_page',
        data: {
          title: 'Trang khoá học',
          autoLayoutFixCount: 0,
        },
      });
    });

    it('2. Response của lượt chat sinh landing page trả kèm messageId', async () => {
      processSmartChat.mockResolvedValue({
        type: 'landing_page',
        content: 'Đây là landing page của bạn',
        data: { title: 'Trang khoá học', html: '<div>Trang mẫu</div>' },
      });
      saveMessagesReturningIds.mockResolvedValue({ userMessageId: 101, assistantMessageId: 102 });

      const res = makeRes();
      await aiController.chat(chatReq(), res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          type: 'landing_page',
          messageId: 102,
          sessionId: 55,
        }),
      });
    });

    it('3. Lượt chat KHÔNG PHẢI landing page gọi saveMessages như cũ và không có autoLayoutFixCount', async () => {
      processSmartChat.mockResolvedValue({
        type: 'text',
        content: 'Xin chào, tôi có thể giúp gì?',
        data: null,
      });

      const res = makeRes();
      await aiController.chat(chatReq(), res);

      expect(saveMessages).toHaveBeenCalledTimes(1);
      expect(saveMessagesReturningIds).not.toHaveBeenCalled();
      const [, , , assistantMsg] = saveMessages.mock.calls[0];
      expect(assistantMsg?.data?.autoLayoutFixCount).toBeUndefined();
      expect(res.json.mock.calls[0][0].data).not.toHaveProperty('messageId');
    });
  });
});

