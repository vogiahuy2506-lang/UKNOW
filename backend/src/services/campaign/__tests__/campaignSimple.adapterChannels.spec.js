import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * PLAN_TUNG_BUOC_TELEGRAM_WHATSAPP_2026-10-17 — Telegram + WhatsApp trong trình tạo chiến dịch từng bước.
 * Mock cùng bộ ranh giới với campaignSimple.service.spec.js; bộ biên dịch (compileCampaign) chạy THẬT nên đồ thị kiểm ở đây là đồ
 * thị thật mà `campaignController.create` sẽ lưu.
 */
const mockPrepareScript = jest.fn();
const mockAutoCreateEmailTemplates = jest.fn();
const mockAutoCreateZaloTemplates = jest.fn();
const mockCleanupAutoCreatedTemplates = jest.fn();
const mockBuildConfirmationView = jest.fn();
const mockApplyLandingAudienceResolution = jest.fn();
const mockGetFormIdsOwnedBy = jest.fn();
const mockCountWorkspaceCustomers = jest.fn();
const mockFillReadSheetFirstTabNames = jest.fn();
const mockCheckUserResourceLimit = jest.fn();
const mockFindTemplateById = jest.fn();

jest.unstable_mockModule('../../ai/aiCampaignDraft.service.js', () => ({
  default: {
    prepareScript: mockPrepareScript,
    autoCreateEmailTemplates: mockAutoCreateEmailTemplates,
    autoCreateZaloTemplates: mockAutoCreateZaloTemplates,
    cleanupAutoCreatedTemplates: mockCleanupAutoCreatedTemplates,
  },
}));
jest.unstable_mockModule('../../ai/campaignConfirmation.service.js', () => ({
  default: { buildConfirmationView: mockBuildConfirmationView },
}));
jest.unstable_mockModule('../../ai/landingAudienceResolver.service.js', () => ({
  applyLandingAudienceResolution: mockApplyLandingAudienceResolution,
  default: { applyLandingAudienceResolution: mockApplyLandingAudienceResolution },
}));
jest.unstable_mockModule('../../../repositories/ai/aiCampaign.repository.js', () => ({
  default: { getFormIdsOwnedBy: mockGetFormIdsOwnedBy },
}));
jest.unstable_mockModule('../../../repositories/customer/customerRead.repository.js', () => ({
  default: { countWorkspaceCustomers: mockCountWorkspaceCustomers },
}));
jest.unstable_mockModule('../../../repositories/zalo/zaloTemplate.repository.js', () => ({
  default: { findById: mockFindTemplateById },
}));
jest.unstable_mockModule('../readSheetAutoName.service.js', () => ({
  fillReadSheetFirstTabNames: mockFillReadSheetFirstTabNames,
}));
jest.unstable_mockModule('../../../utils/userResourceLimit.util.js', () => ({
  checkUserResourceLimit: mockCheckUserResourceLimit,
}));

const service = await import('../campaignSimple.service.js');
const { runWithChannelEntitlements } = await import('../campaignChannelFlags.util.js');
const { getNodeSubtype } = await import('../../../utils/nodeSubtype.util.js');

const {
  SIMPLE_CHANNELS,
  SIMPLE_AUDIENCE_TYPES_BY_CHANNEL,
  buildSimpleDraft,
  buildSimpleCreateDraft,
  previewSimpleCampaign,
  normalizeSimpleBody,
} = service;

const user = { id: 7, role: 'user', activeContext: { type: 'self' } };
const SESSION_KEY = '7-main';
const subtypes = (script) => script.nodes.map((node) => getNodeSubtype(node));
const sendNode = (script, subtype) => script.nodes.find((node) => getNodeSubtype(node) === subtype);

const telegramBody = (overrides = {}) => ({
  channel: 'telegram',
  senderId: 5,
  audience: { type: 'conversations' },
  content: { mode: 'custom', body: 'Xin chào bạn' },
  ...overrides,
});
const whatsappBody = (overrides = {}) => ({
  channel: 'whatsapp',
  senderKey: SESSION_KEY,
  audience: { type: 'conversations' },
  content: { mode: 'custom', body: 'Xin chào bạn' },
  ...overrides,
});
const followUp = (n, overrides = {}) => ({
  delayValue: n,
  delayUnit: 'hours',
  content: { mode: 'custom', body: `Tin sau ${n}` },
  ...overrides,
});

const readyView = (overrides = {}) => ({
  readyToCreate: true,
  blockingIssues: [],
  steps: [{
    sender: { id: 5, label: '@shop' },
    content: { templateId: null, templateName: null, subject: '', bodyText: 'Xin chào bạn' },
    recipients: { mode: 'source', sourceLabel: null, conversations: { count: 12, accountLabel: '@shop' } },
  }],
  estimate: { perNode: [{ nodeId: 'n', recipients: 12 }], warnings: [] },
  ...overrides,
});

const savedFlags = {};
beforeEach(() => {
  jest.clearAllMocks();
  savedFlags.telegram = process.env.CAMPAIGN_CHANNEL_TELEGRAM_ENABLED;
  savedFlags.whatsapp = process.env.CAMPAIGN_CHANNEL_WHATSAPP_ENABLED;
  process.env.CAMPAIGN_CHANNEL_TELEGRAM_ENABLED = 'true';
  process.env.CAMPAIGN_CHANNEL_WHATSAPP_ENABLED = 'true';
  mockPrepareScript.mockImplementation(async (script) => structuredClone(script));
  mockBuildConfirmationView.mockResolvedValue(readyView());
  mockApplyLandingAudienceResolution.mockImplementation(async (intent) => intent);
  mockGetFormIdsOwnedBy.mockImplementation(async (_owner, ids) => ids);
  mockCountWorkspaceCustomers.mockResolvedValue(0);
  mockCheckUserResourceLimit.mockResolvedValue({ allowed: true, limit: null, currentCount: 0, message: null });
  mockFillReadSheetFirstTabNames.mockResolvedValue(undefined);
  mockFindTemplateById.mockResolvedValue(null);
});

afterEach(() => {
  for (const [key, envName] of [['telegram', 'CAMPAIGN_CHANNEL_TELEGRAM_ENABLED'], ['whatsapp', 'CAMPAIGN_CHANNEL_WHATSAPP_ENABLED']]) {
    if (savedFlags[key] === undefined) delete process.env[envName];
    else process.env[envName] = savedFlags[key];
  }
});

describe('bảng kênh + nguồn người nhận', () => {
  it('Telegram CHỈ nhận nguồn "conversations"; WhatsApp: conversations + khách đã lưu + landing + biểu mẫu + Sheet (KHÔNG nhập tay)', () => {
    expect(SIMPLE_CHANNELS).toEqual(expect.arrayContaining(['telegram', 'whatsapp']));
    expect(SIMPLE_AUDIENCE_TYPES_BY_CHANNEL.telegram).toEqual(['conversations']);
    expect(SIMPLE_AUDIENCE_TYPES_BY_CHANNEL.whatsapp).toEqual(['conversations', 'customers', 'landing', 'form', 'sheet']);
  });

  it('nguồn không hợp kênh → 400 INVALID_AUDIENCE: Telegram + sheet/customers/manual, WhatsApp + manual/zalo_friends, kênh khác + conversations', async () => {
    for (const audience of [{ type: 'sheet', sheetUrl: 'https://docs.google.com/spreadsheets/d/abc123/edit' }, { type: 'customers' }, { type: 'manual', phones: ['0912345678'] }]) {
      await expect(buildSimpleDraft({ body: telegramBody({ audience }), authUser: user }))
        .rejects.toMatchObject({ statusCode: 400, code: 'INVALID_AUDIENCE' });
    }
    for (const audience of [{ type: 'manual', phones: ['0912345678'] }, { type: 'zalo_friends', uids: ['1234567'] }]) {
      await expect(buildSimpleDraft({ body: whatsappBody({ audience }), authUser: user }))
        .rejects.toMatchObject({ statusCode: 400, code: 'INVALID_AUDIENCE' });
    }
    await expect(buildSimpleDraft({
      body: { channel: 'email', senderId: 5, audience: { type: 'conversations' }, content: { mode: 'custom', subject: 's', body: 'b' } },
      authUser: user,
    })).rejects.toMatchObject({ code: 'INVALID_AUDIENCE' });
    expect(mockPrepareScript).not.toHaveBeenCalled();
  });
});

describe('Telegram — đồ thị biên dịch thật', () => {
  it('conversations, một tin: manual → send_telegram; telegramAccountId + recipientSource telegram_conversations + steps[0].message', async () => {
    const { script } = await buildSimpleDraft({ body: telegramBody(), authUser: user });
    expect(subtypes(script)).toEqual(['manual', 'send_telegram']);
    const cfg = sendNode(script, 'send_telegram').config;
    expect(cfg.telegramAccountId).toBe(5);
    expect(cfg.recipientSource).toBe('telegram_conversations');
    expect(cfg.steps).toHaveLength(1);
    expect(cfg.steps[0].message).toBe('Xin chào bạn');
    expect(script.campaignType).toBe('telegram');
    expect(script.compilerApplied).toBe(true);
  });

  it('thiếu / sai senderId → 400 SENDER_REQUIRED', async () => {
    await expect(buildSimpleDraft({ body: telegramBody({ senderId: undefined }), authUser: user }))
      .rejects.toMatchObject({ statusCode: 400, code: 'SENDER_REQUIRED' });
    await expect(buildSimpleDraft({ body: telegramBody({ senderId: 'abc' }), authUser: user }))
      .rejects.toMatchObject({ code: 'SENDER_REQUIRED' });
  });

  it('chữ tự soạn quá 4000 ký tự → 400 CONTENT_TOO_LONG', async () => {
    await expect(normalizeSimpleBody(telegramBody({ content: { mode: 'custom', body: 'a'.repeat(4001) } }), { ownerId: 7 }))
      .rejects.toMatchObject({ statusCode: 400, code: 'CONTENT_TOO_LONG' });
    await expect(normalizeSimpleBody(telegramBody({ content: { mode: 'custom', body: 'a'.repeat(4000) } }), { ownerId: 7 }))
      .resolves.toBeDefined();
  });
});

describe('WhatsApp — đồ thị biên dịch thật', () => {
  it('conversations: send_whatsapp mang whatsappSessionKey + recipientSource whatsapp_conversations, không có node dữ liệu', async () => {
    const { script } = await buildSimpleDraft({ body: whatsappBody(), authUser: user });
    expect(subtypes(script)).toEqual(['manual', 'send_whatsapp']);
    const cfg = sendNode(script, 'send_whatsapp').config;
    expect(cfg.whatsappSessionKey).toBe(SESSION_KEY);
    expect(cfg.recipientSource).toBe('whatsapp_conversations');
    expect(script.campaignType).toBe('whatsapp');
  });

  it.each([
    ['customers', { type: 'customers' }, 'interested_customers'],
    ['sheet', { type: 'sheet', sheetUrl: 'https://docs.google.com/spreadsheets/d/abc123/edit' }, 'read_sheet'],
    ['landing', { type: 'landing', slugs: ['khoa-hoc'] }, 'read_landing_leads'],
    ['form', { type: 'form', formIds: [7, 8] }, 'read_form_submissions'],
  ])('nguồn %s → manual → node dữ liệu → send_whatsapp, recipientSource node trỏ đúng node dữ liệu', async (_name, audience, dataSubtype) => {
    const { script } = await buildSimpleDraft({ body: whatsappBody({ audience }), authUser: user });
    expect(subtypes(script)).toEqual(['manual', dataSubtype, 'send_whatsapp']);
    const dataNode = sendNode(script, dataSubtype);
    const cfg = sendNode(script, 'send_whatsapp').config;
    expect(cfg.recipientSource).toBe('node');
    expect(cfg.recipientNodeId).toBe(dataNode.id);
  });

  it('thiếu senderKey / senderId số thay senderKey → 400 SENDER_REQUIRED; mã phiên sai dạng → 400 SENDER_INVALID', async () => {
    await expect(buildSimpleDraft({ body: whatsappBody({ senderKey: undefined }), authUser: user }))
      .rejects.toMatchObject({ statusCode: 400, code: 'SENDER_REQUIRED' });
    await expect(buildSimpleDraft({ body: whatsappBody({ senderKey: undefined, senderId: 5 }), authUser: user }))
      .rejects.toMatchObject({ code: 'SENDER_REQUIRED' });
    await expect(buildSimpleDraft({ body: whatsappBody({ senderKey: 'khong-phai-ma-phien' }), authUser: user }))
      .rejects.toMatchObject({ statusCode: 400, code: 'SENDER_INVALID' });
  });

  it('chữ tự soạn: 4096 ký tự qua, 4097 → 400 CONTENT_TOO_LONG', async () => {
    await expect(normalizeSimpleBody(whatsappBody({ content: { mode: 'custom', body: 'a'.repeat(4096) } }), { ownerId: 7 })).resolves.toBeDefined();
    await expect(normalizeSimpleBody(whatsappBody({ content: { mode: 'custom', body: 'a'.repeat(4097) } }), { ownerId: 7 }))
      .rejects.toMatchObject({ code: 'CONTENT_TOO_LONG' });
  });
});

describe('chuỗi tin — trần 5 tin cho Telegram/WhatsApp', () => {
  it.each([['telegram', telegramBody, 'send_telegram'], ['whatsapp', whatsappBody, 'send_whatsapp']])(
    '%s: chuỗi 5 tin (4 tin sau) → steps có đúng độ trễ từng tin, bước sau chờ kể từ bước trước',
    async (_channel, makeBody, subtype) => {
      const followUps = [followUp(2), followUp(3, { delayUnit: 'days' }), followUp(30, { delayUnit: 'minutes' }), followUp(1)];
      const { script } = await buildSimpleDraft({ body: makeBody({ followUps }), authUser: user });
      const steps = sendNode(script, subtype).config.steps;
      expect(steps).toHaveLength(5);
      expect(steps.map((step) => step.message)).toEqual(['Xin chào bạn', 'Tin sau 2', 'Tin sau 3', 'Tin sau 30', 'Tin sau 1']);
      expect(steps[0].delayValue).toBeUndefined();
      expect(steps.slice(1).map((step) => [step.delayValue, step.delayUnit])).toEqual([[2, 'hours'], [3, 'days'], [30, 'minutes'], [1, 'hours']]);
      // Hình dạng khớp node trình dựng lưu: không có delayFrom (kênh adapter luôn tính kể từ bước trước).
      expect(steps.some((step) => 'delayFrom' in step)).toBe(false);
    },
  );

  it.each([['telegram', telegramBody], ['whatsapp', whatsappBody]])('%s: 5 tin sau (tổng 6 tin) → 400 FOLLOW_UPS_TOO_MANY', async (_channel, makeBody) => {
    const followUps = [followUp(1), followUp(1), followUp(1), followUp(1), followUp(1)];
    await expect(buildSimpleDraft({ body: makeBody({ followUps }), authUser: user }))
      .rejects.toMatchObject({ statusCode: 400, code: 'FOLLOW_UPS_TOO_MANY', message: expect.stringContaining('5 tin') });
  });

  it('email vẫn được 9 tin sau (trần 5 chỉ áp cho kênh adapter)', async () => {
    const followUps = Array.from({ length: 9 }, (_v, i) => ({
      delayValue: i + 1, delayUnit: 'days', content: { mode: 'custom', subject: `s${i}`, body: `b${i}` },
    }));
    await expect(normalizeSimpleBody({
      channel: 'email', senderId: 5, audience: { type: 'landing', slugs: ['a'] }, content: { mode: 'custom', subject: 's', body: 'b' }, followUps,
    }, { ownerId: 7 })).resolves.toBeDefined();
  });

  it('chờ quá 30 ngày giữa hai tin → 400 INVALID_FOLLOW_UP_DELAY (preflight cũng chặn, báo sớm ở đây)', async () => {
    await expect(buildSimpleDraft({ body: telegramBody({ followUps: [followUp(31, { delayUnit: 'days' })] }), authUser: user }))
      .rejects.toMatchObject({ code: 'INVALID_FOLLOW_UP_DELAY' });
    await expect(buildSimpleDraft({ body: telegramBody({ followUps: [followUp(30, { delayUnit: 'days' })] }), authUser: user }))
      .resolves.toBeDefined();
  });
});

describe('mẫu tin dùng chung — CHÉP nội dung + tệp vào bước', () => {
  const template = (overrides = {}) => ({
    id: 3,
    template_name: 'Ưu đãi',
    body_text: '  Chào {{ten}}, ưu đãi tháng 10  ',
    attachments: [{ key: 'a/anh.png', name: 'anh.png', size: 1000 }, { key: 'a/bang-gia.pdf', name: 'bang-gia.pdf', size: 2000 }],
    ...overrides,
  });

  it('mẫu: message = nội dung mẫu (đã cắt khoảng trắng), attachments = tệp của mẫu, templateId giữ lại; tra mẫu theo CHỦ workspace', async () => {
    mockFindTemplateById.mockResolvedValue(template());
    const { script } = await buildSimpleDraft({
      body: telegramBody({ content: { mode: 'template', templateId: 3 } }),
      authUser: user,
    });
    const [step] = sendNode(script, 'send_telegram').config.steps;
    expect(step.message).toBe('Chào {{ten}}, ưu đãi tháng 10');
    expect(step.attachments).toEqual(template().attachments);
    expect(step.templateId).toBe(3);
    expect(mockFindTemplateById).toHaveBeenCalledWith({ id: 3, userId: 7, isAdmin: false });
  });

  it('chuỗi: tin 1 dùng mẫu, tin 2 tự soạn → chỉ tin 1 mang tệp, tin 2 chỉ có chữ', async () => {
    mockFindTemplateById.mockResolvedValue(template());
    const { script } = await buildSimpleDraft({
      body: whatsappBody({ content: { mode: 'template', templateId: 3 }, followUps: [followUp(1)] }),
      authUser: user,
    });
    const steps = sendNode(script, 'send_whatsapp').config.steps;
    expect(steps[0].attachments).toHaveLength(2);
    expect(steps[1].attachments).toBeUndefined();
    expect(steps[1].message).toBe('Tin sau 1');
  });

  it('mẫu không tìm thấy → bước giữ templateId, message rỗng (thẻ xác nhận báo template_not_found, không 500)', async () => {
    mockFindTemplateById.mockResolvedValue(null);
    mockBuildConfirmationView.mockResolvedValue(readyView({
      readyToCreate: false,
      blockingIssues: [{ code: 'template_not_found', nodeId: 'node_send_telegram_1', stepIndex: 0 }],
    }));
    const result = await previewSimpleCampaign({ body: telegramBody({ content: { mode: 'template', templateId: 999 } }), authUser: user });
    expect(result.readyToCreate).toBe(false);
    expect(result.issues).toEqual([expect.objectContaining({ code: 'template_not_found', severity: 'blocking' })]);
  });

  it('mẫu rỗng cả chữ lẫn tệp → 400 CONTENT_REQUIRED', async () => {
    mockFindTemplateById.mockResolvedValue(template({ body_text: '   ', attachments: [] }));
    await expect(buildSimpleDraft({ body: telegramBody({ content: { mode: 'template', templateId: 3 } }), authUser: user }))
      .rejects.toMatchObject({ statusCode: 400, code: 'CONTENT_REQUIRED' });
  });

  it('mẫu chỉ có tệp (không chữ) vẫn dùng được', async () => {
    mockFindTemplateById.mockResolvedValue(template({ body_text: null }));
    const { script } = await buildSimpleDraft({ body: telegramBody({ content: { mode: 'template', templateId: 3 } }), authUser: user });
    const [step] = sendNode(script, 'send_telegram').config.steps;
    expect(step.message).toBe('');
    expect(step.attachments).toHaveLength(2);
  });

  it('mẫu dài hơn trần của kênh → 400 CONTENT_TOO_LONG (Telegram 4000, WhatsApp 4096)', async () => {
    mockFindTemplateById.mockResolvedValue(template({ body_text: 'a'.repeat(4050), attachments: [] }));
    await expect(buildSimpleDraft({ body: telegramBody({ content: { mode: 'template', templateId: 3 } }), authUser: user }))
      .rejects.toMatchObject({ code: 'CONTENT_TOO_LONG' });
    await expect(buildSimpleDraft({ body: whatsappBody({ content: { mode: 'template', templateId: 3 } }), authUser: user }))
      .resolves.toBeDefined();
  });

  it('mẫu có quá 5 ảnh → 400 CHANNEL_ATTACHMENT_LIMIT (báo lỗi rõ như trình dựng); tin trong chuỗi có tiền tố "Tin N:"', async () => {
    const sixImages = Array.from({ length: 6 }, (_v, i) => ({ key: `a/${i}.png`, name: `${i}.png`, size: 10 }));
    mockFindTemplateById.mockResolvedValue(template({ attachments: sixImages }));
    await expect(buildSimpleDraft({ body: telegramBody({ content: { mode: 'template', templateId: 3 } }), authUser: user }))
      .rejects.toMatchObject({ statusCode: 400, code: 'CHANNEL_ATTACHMENT_LIMIT', message: expect.stringContaining('5 ảnh') });
    await expect(buildSimpleDraft({
      body: telegramBody({ followUps: [{ delayValue: 1, delayUnit: 'days', content: { mode: 'template', templateId: 3 } }] }),
      authUser: user,
    })).rejects.toMatchObject({ code: 'CHANNEL_ATTACHMENT_LIMIT', message: expect.stringMatching(/^Tin 2: /) });
  });

  it('WebP là ảnh của WhatsApp nhưng là tài liệu của Telegram: 3 webp + 2 pdf → Telegram quá 3 tài liệu (chặn), WhatsApp ổn', async () => {
    const files = [
      ...Array.from({ length: 3 }, (_v, i) => ({ key: `w${i}.webp`, name: `w${i}.webp`, size: 10 })),
      ...Array.from({ length: 2 }, (_v, i) => ({ key: `d${i}.pdf`, name: `d${i}.pdf`, size: 10 })),
    ];
    mockFindTemplateById.mockResolvedValue(template({ attachments: files }));
    // Telegram: 5 tài liệu (webp tính là tài liệu) → vượt 3. WhatsApp: 3 ảnh + 2 tài liệu → ổn.
    await expect(buildSimpleDraft({ body: telegramBody({ content: { mode: 'template', templateId: 3 } }), authUser: user }))
      .rejects.toMatchObject({ code: 'CHANNEL_ATTACHMENT_LIMIT' });
    await expect(buildSimpleDraft({ body: whatsappBody({ content: { mode: 'template', templateId: 3 } }), authUser: user }))
      .resolves.toBeDefined();
  });
});

describe('chốt chặn kênh: cờ hệ thống + gói', () => {
  it.each([['telegram', 'CAMPAIGN_CHANNEL_TELEGRAM_ENABLED', telegramBody], ['whatsapp', 'CAMPAIGN_CHANNEL_WHATSAPP_ENABLED', whatsappBody]])(
    '%s: cờ hệ thống TẮT → 400 CHANNEL_NOT_ENABLED (cả preview lẫn tạo); không chạm prepareScript',
    async (_channel, envName, makeBody) => {
      delete process.env[envName];
      await expect(previewSimpleCampaign({ body: makeBody(), authUser: user }))
        .rejects.toMatchObject({ statusCode: 400, code: 'CHANNEL_NOT_ENABLED' });
      await expect(buildSimpleCreateDraft({ body: makeBody(), authUser: user, createdTemplates: { emailTemplateIds: [], zaloTemplateIds: [] } }))
        .rejects.toMatchObject({ statusCode: 400, code: 'CHANNEL_NOT_ENABLED' });
      expect(mockPrepareScript).not.toHaveBeenCalled();
    },
  );

  it('cờ bật nhưng gói không có kênh (ngữ cảnh channelEntitlementContext) → 403 CHANNEL_NOT_IN_PLAN nêu ĐÚNG tên kênh; kênh còn lại + email vẫn qua', async () => {
    await runWithChannelEntitlements({ telegram: false, whatsapp: true, zalo: true }, async () => {
      await expect(buildSimpleDraft({ body: telegramBody(), authUser: user }))
        .rejects.toMatchObject({ statusCode: 403, code: 'CHANNEL_NOT_IN_PLAN', message: expect.stringContaining('Telegram') });
      await expect(buildSimpleDraft({ body: whatsappBody(), authUser: user })).resolves.toBeDefined();
    });
    await runWithChannelEntitlements({ telegram: true, whatsapp: false, zalo: true }, async () => {
      await expect(buildSimpleDraft({ body: whatsappBody(), authUser: user }))
        .rejects.toMatchObject({ statusCode: 403, code: 'CHANNEL_NOT_IN_PLAN', message: expect.stringContaining('WhatsApp') });
      await expect(buildSimpleDraft({ body: telegramBody(), authUser: user })).resolves.toBeDefined();
    });
  });
});

describe('prepareScript gỡ tài khoản chưa giao cho nhân viên', () => {
  it('Telegram: telegramAccountId bị gỡ → issue missing_sender; WhatsApp: whatsappSessionKey bị gỡ → missing_sender', async () => {
    mockPrepareScript.mockImplementation(async (script) => {
      const clone = structuredClone(script);
      for (const node of clone.nodes) {
        if (node.config) {
          delete node.config.telegramAccountId;
          delete node.config.whatsappSessionKey;
        }
      }
      return clone;
    });
    const telegram = await buildSimpleDraft({ body: telegramBody(), authUser: user });
    expect(telegram.issues.map((issue) => issue.code)).toEqual(['missing_sender']);
    const whatsapp = await buildSimpleDraft({ body: whatsappBody(), authUser: user });
    expect(whatsapp.issues.map((issue) => issue.code)).toEqual(['missing_sender']);
    await expect(buildSimpleCreateDraft({ body: telegramBody(), authUser: user, createdTemplates: { emailTemplateIds: [], zaloTemplateIds: [] } }))
      .rejects.toMatchObject({ statusCode: 400, code: 'SENDER_NOT_AVAILABLE' });
  });
});

describe('tạo / xem trước', () => {
  it('tạo bản nháp: KHÔNG tạo mẫu tin (chữ nằm thẳng trong steps[].message), kể cả khi tin tự soạn', async () => {
    const created = { emailTemplateIds: [], zaloTemplateIds: [] };
    const draft = await buildSimpleCreateDraft({
      body: whatsappBody({ followUps: [followUp(2)] }),
      authUser: user,
      createdTemplates: created,
    });
    expect(draft.channel).toBe('whatsapp');
    expect(mockAutoCreateEmailTemplates).not.toHaveBeenCalled();
    expect(mockAutoCreateZaloTemplates).not.toHaveBeenCalled();
    const [first, second] = sendNode({ nodes: draft.nodes }, 'send_whatsapp').config.steps;
    expect(first.message).toBe('Xin chào bạn');
    expect(second.message).toBe('Tin sau 2');
  });

  it('hạn mức chiến dịch: chỉ kiểm trần chung `campaigns` (Telegram/WhatsApp không có trần theo loại), không gọi với khoá undefined', async () => {
    await previewSimpleCampaign({ body: telegramBody(), authUser: user });
    await previewSimpleCampaign({ body: whatsappBody(), authUser: user });
    const keys = mockCheckUserResourceLimit.mock.calls.map(([arg]) => arg.resourceKey);
    expect(keys).toEqual(['campaigns', 'campaigns']);
  });

  it('conversations: recipientCount lấy từ số hội thoại đang mở của thẻ xác nhận; recipientUnit person; không báo "chưa đếm được"', async () => {
    mockBuildConfirmationView.mockResolvedValue(readyView({
      estimate: { perNode: [{ nodeId: 'n', recipients: 0 }], warnings: [{ code: 'recipient_count_unknown', params: {} }] },
    }));
    const result = await previewSimpleCampaign({ body: telegramBody(), authUser: user });
    expect(result.recipientCount).toBe(12);
    expect(result.recipientUnit).toBe('person');
    expect(result.summary).toMatchObject({ channel: 'telegram', audienceType: 'conversations', senderLabel: '@shop' });
    expect(result.issues.map((issue) => issue.code)).not.toContain('recipient_count_unknown');
  });

  it('conversations 0 người → vẫn readyToCreate nhưng có cảnh báo conversations_empty', async () => {
    mockBuildConfirmationView.mockResolvedValue(readyView({
      steps: [{ sender: { id: SESSION_KEY, label: 'Shop' }, content: { bodyText: 'x' }, recipients: { conversations: { count: 0, accountLabel: 'Shop' } } }],
    }));
    const result = await previewSimpleCampaign({ body: whatsappBody(), authUser: user });
    expect(result.readyToCreate).toBe(true);
    expect(result.recipientCount).toBe(0);
    expect(result.issues).toEqual([expect.objectContaining({ code: 'conversations_empty', severity: 'warning' })]);
  });

  it('WhatsApp + khách đã lưu: đếm theo tổng khách của workspace như kênh khác', async () => {
    mockCountWorkspaceCustomers.mockResolvedValue(40);
    const result = await previewSimpleCampaign({ body: whatsappBody({ audience: { type: 'customers' } }), authUser: user });
    expect(result.recipientCount).toBe(40);
  });
});
