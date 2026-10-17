import { beforeEach, describe, expect, it, jest } from '@jest/globals';

// Trần người nhận đọc LÚC IMPORT manualRecipients.util.js → đặt TRƯỚC khi nạp service để test "vượt trần" dùng số nhỏ.
process.env.MAX_AI_MANUAL_RECIPIENTS = '3';

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
  buildSimpleIntent,
  buildSimpleDraft,
  buildSimpleCreateDraft,
  previewSimpleCampaign,
  resolvePreviewEstimateOptions,
  normalizeSimpleBody,
  buildDefaultCampaignName,
  SimpleCampaignError,
} = service;

const user = { id: 7, role: 'user', activeContext: { type: 'self' } };

const readyView = (overrides = {}) => ({
  readyToCreate: true,
  blockingIssues: [],
  steps: [{
    sender: { id: 5, label: 'shop@abc.vn' },
    content: { templateId: null, templateName: null, subject: '', bodyText: 'Xin chào' },
    recipients: { mode: 'manual', sourceLabel: null },
  }],
  estimate: { perNode: [{ nodeId: 'n', recipients: 9 }], warnings: [] },
  ...overrides,
});

const subtypes = (script) => script.nodes.map((node) => getNodeSubtype(node));
const sendNode = (script, subtype) => script.nodes.find((node) => getNodeSubtype(node) === subtype);

const emailBody = (overrides = {}) => ({
  channel: 'email',
  senderId: 5,
  audience: { type: 'manual', emails: ['A@Example.com', 'b@example.com'] },
  content: { mode: 'custom', subject: 'Ưu đãi', body: 'Xin chào bạn' },
  ...overrides,
});
const zaloBody = (overrides = {}) => ({
  channel: 'zalo',
  senderId: 9,
  audience: { type: 'manual', phones: ['0912345678', '0987654321'] },
  content: { mode: 'custom', body: 'Xin chào bạn' },
  ...overrides,
});
const groupBody = (overrides = {}) => ({
  channel: 'zalo_group',
  senderId: 9,
  audience: { type: 'zalo_groups', groupIds: ['111', '222'] },
  content: { mode: 'template', templateId: 3 },
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  // prepareScript thật gỡ tài khoản chưa giao cho nhân viên; mặc định ở đây là chuyển tiếp nguyên bản (bản sao).
  mockPrepareScript.mockImplementation(async (script) => structuredClone(script));
  mockBuildConfirmationView.mockResolvedValue(readyView());
  mockApplyLandingAudienceResolution.mockImplementation(async (intent) => intent);
  mockGetFormIdsOwnedBy.mockImplementation(async (_owner, ids) => ids);
  mockCountWorkspaceCustomers.mockResolvedValue(0);
  mockCheckUserResourceLimit.mockResolvedValue({ allowed: true, limit: null, currentCount: 0, message: null });
  mockFillReadSheetFirstTabNames.mockResolvedValue(undefined);
  mockAutoCreateEmailTemplates.mockResolvedValue(undefined);
  mockAutoCreateZaloTemplates.mockResolvedValue(undefined);
  mockCleanupAutoCreatedTemplates.mockResolvedValue(undefined);
});

describe('buildSimpleIntent — bảng ánh xạ audience → CampaignIntentV1 (plan §PR-1)', () => {
  const norm = (extra) => ({ campaignName: 'x', senderId: 5, directRecipients: null, ...extra });

  it('customers (email) → db + recipientKind email (khối động `all`, không còn danh sách chụp lúc tạo)', () => {
    const intent = buildSimpleIntent(norm({ channel: 'email', audience: { type: 'customers' } }));
    expect(intent.audience).toEqual({ type: 'db', recipientKind: 'email' });
  });

  it('customers (zalo) → db + recipientKind phone', () => {
    const intent = buildSimpleIntent(norm({ channel: 'zalo', audience: { type: 'customers' } }));
    expect(intent.audience).toEqual({ type: 'db', recipientKind: 'phone' });
  });

  it('không followUps → lịch once; có followUps → drip days = 1 + N, mỗi ngày 1 tin', () => {
    expect(buildSimpleIntent(norm({ channel: 'email', audience: { type: 'landing', slugs: ['a'] } })).schedule).toEqual({ type: 'once' });
    const intent = buildSimpleIntent(norm({
      channel: 'email',
      audience: { type: 'landing', slugs: ['a'] },
      followUps: [{ delayValue: 2, delayUnit: 'days', content: {} }, { delayValue: 5, delayUnit: 'hours', content: {} }],
    }));
    expect(intent.schedule).toEqual({ type: 'drip', days: 3, slotsPerDay: 1 });
  });

  it('landing → { type: landing, slugs }', () => {
    const intent = buildSimpleIntent(norm({ channel: 'email', audience: { type: 'landing', slugs: ['khoa-hoc'] } }));
    expect(intent.audience).toEqual({ type: 'landing', slugs: ['khoa-hoc'] });
  });

  it('form → { type: form, formIds }', () => {
    const intent = buildSimpleIntent(norm({ channel: 'zalo', audience: { type: 'form', formIds: [7, 8] } }));
    expect(intent.audience).toEqual({ type: 'form', formIds: [7, 8] });
  });

  it('sheet → { type: sheet, url }', () => {
    const intent = buildSimpleIntent(norm({
      channel: 'email',
      audience: { type: 'sheet', sheetUrl: 'https://docs.google.com/spreadsheets/d/abc123/edit' },
    }));
    expect(intent.audience).toEqual({ type: 'sheet', url: 'https://docs.google.com/spreadsheets/d/abc123/edit' });
  });

  it('manual: email → recipientKind email; zalo → phone', () => {
    expect(buildSimpleIntent(norm({ channel: 'email', audience: { type: 'manual' } })).audience)
      .toEqual({ type: 'manual', recipientKind: 'email' });
    expect(buildSimpleIntent(norm({ channel: 'zalo', audience: { type: 'manual' } })).audience)
      .toEqual({ type: 'manual', recipientKind: 'phone' });
  });

  it('zalo_friends → { type: zalo_contacts, friendIds: uids }', () => {
    const intent = buildSimpleIntent(norm({
      channel: 'zalo',
      audience: { type: 'zalo_friends' },
      directRecipients: { uids: ['123456', '654321'] },
    }));
    expect(intent.audience).toEqual({ type: 'zalo_contacts', friendIds: ['123456', '654321'] });
  });

  it('zalo_groups → { type: manual, groupIds }', () => {
    const intent = buildSimpleIntent(norm({ channel: 'zalo_group', audience: { type: 'zalo_groups', groupIds: ['111'] } }));
    expect(intent.audience).toEqual({ type: 'manual', groupIds: ['111'] });
  });

  it('sender + schedule + version đúng kênh', () => {
    const email = buildSimpleIntent(norm({ channel: 'email', audience: { type: 'manual' } }));
    expect(email).toMatchObject({ version: 1, channel: 'email', sender: { type: 'email_account', id: 5 }, schedule: { type: 'once' } });
    const zalo = buildSimpleIntent(norm({ channel: 'zalo', audience: { type: 'manual' } }));
    expect(zalo.sender).toEqual({ type: 'zalo_account', id: 5 });
    const group = buildSimpleIntent(norm({ channel: 'zalo_group', audience: { type: 'zalo_groups', groupIds: ['1'] } }));
    expect(group.sender).toEqual({ type: 'zalo_account', id: 5 });
  });
});

describe('buildSimpleDraft — chuỗi khối compiler sinh ra cho từng nguồn (plan §1)', () => {
  it('email + manual: manual → send_email, người nhận nhập sẵn (thường hoá, khử trùng)', async () => {
    const { script } = await buildSimpleDraft({ body: emailBody(), authUser: user });
    expect(subtypes(script)).toEqual(['manual', 'send_email']);
    const cfg = sendNode(script, 'send_email').config;
    expect(cfg.recipientSource).toBe('manual');
    expect(cfg.recipientEmails).toEqual(['a@example.com', 'b@example.com']);
    expect(cfg.fromEmailId).toBe(5);
    expect(script.compilerApplied).toBe(true);
    expect(script.campaignType).toBe('email');
  });

  it('email + form [7,8]: manual → read_form_submissions → send_email, node mang formIds', async () => {
    const { script } = await buildSimpleDraft({
      body: emailBody({ audience: { type: 'form', formIds: [7, 8] } }),
      authUser: user,
    });
    expect(subtypes(script)).toEqual(['manual', 'read_form_submissions', 'send_email']);
    expect(sendNode(script, 'read_form_submissions').config.formIds).toEqual([7, 8]);
    expect(sendNode(script, 'send_email').config.recipientSource).toBe('node');
  });

  it('email + sheet: manual → read_sheet → send_email; sheetName người dùng nhập được giữ', async () => {
    const url = 'https://docs.google.com/spreadsheets/d/abc123/edit';
    const { script } = await buildSimpleDraft({
      body: emailBody({ audience: { type: 'sheet', sheetUrl: url, sheetName: 'Danh sách' } }),
      authUser: user,
    });
    expect(subtypes(script)).toEqual(['manual', 'read_sheet', 'send_email']);
    expect(sendNode(script, 'read_sheet').config).toMatchObject({ sheetUrl: url, sheetName: 'Danh sách' });
    expect(mockFillReadSheetFirstTabNames).toHaveBeenCalledTimes(1);
  });

  it('email + landing: manual → read_landing_leads → send_email (slug được chuẩn hoá chữ thường, bỏ dấu /)', async () => {
    const { script } = await buildSimpleDraft({
      body: emailBody({ audience: { type: 'landing', slugs: ['/Khoa-Hoc/', 'khoa-hoc'] } }),
      authUser: user,
    });
    expect(subtypes(script)).toEqual(['manual', 'read_landing_leads', 'send_email']);
    expect(sendNode(script, 'read_landing_leads').config.landingLeadsSlugs).toEqual(['khoa-hoc']);
    expect(mockApplyLandingAudienceResolution).toHaveBeenCalledWith(expect.objectContaining({ audience: { type: 'landing', slugs: ['khoa-hoc'] } }), 7);
  });

  it('email + landing có biểu mẫu gắn: bộ phân giải đổi sang read_form_submissions (giống AI)', async () => {
    mockApplyLandingAudienceResolution.mockImplementation(async (intent) => ({
      ...intent,
      audience: { type: 'form', formId: 41, formIds: [41, 42], recipientKind: intent.audience.recipientKind },
    }));
    const { script } = await buildSimpleDraft({
      body: emailBody({ audience: { type: 'landing', slugs: ['khoa-hoc'] } }),
      authUser: user,
    });
    expect(subtypes(script)).toEqual(['manual', 'read_form_submissions', 'send_email']);
    expect(sendNode(script, 'read_form_submissions').config.formIds).toEqual([41, 42]);
  });

  it('zalo + manual (SĐT): manual → select_zalo_account → send_zalo_personal, type phone', async () => {
    const { script } = await buildSimpleDraft({ body: zaloBody(), authUser: user });
    expect(subtypes(script)).toEqual(['manual', 'select_zalo_account', 'send_zalo_personal']);
    const cfg = sendNode(script, 'send_zalo_personal').config;
    expect(cfg).toMatchObject({ zaloRecipientSource: 'manual', zaloRecipientType: 'phone', zaloAccountId: 9 });
    expect(cfg.zaloRecipientPhones).toEqual(['0912345678', '0987654321']);
  });

  it('zalo + bạn bè Zalo: cùng chuỗi khối, type uid, danh sách là UID', async () => {
    const { script } = await buildSimpleDraft({
      body: zaloBody({ audience: { type: 'zalo_friends', uids: ['1234567', '7654321'] } }),
      authUser: user,
    });
    expect(subtypes(script)).toEqual(['manual', 'select_zalo_account', 'send_zalo_personal']);
    const cfg = sendNode(script, 'send_zalo_personal').config;
    expect(cfg).toMatchObject({ zaloRecipientSource: 'manual', zaloRecipientType: 'uid' });
    expect(cfg.zaloRecipientPhones).toEqual(['1234567', '7654321']);
  });

  it('zalo + form: manual → select_zalo_account → read_form_submissions → send_zalo_personal', async () => {
    const { script } = await buildSimpleDraft({
      body: zaloBody({ audience: { type: 'form', formIds: [7] } }),
      authUser: user,
    });
    expect(subtypes(script)).toEqual(['manual', 'select_zalo_account', 'read_form_submissions', 'send_zalo_personal']);
  });

  it('zalo_group: manual → select_zalo_account → get_all_groups → send_zalo_group, zaloSelectedGroupIds đúng nhóm đã chọn', async () => {
    const { script } = await buildSimpleDraft({ body: groupBody(), authUser: user });
    expect(subtypes(script)).toEqual(['manual', 'select_zalo_account', 'get_all_groups', 'send_zalo_group']);
    expect(sendNode(script, 'get_all_groups').config.zaloSelectedGroupIds).toEqual(['111', '222']);
    expect(sendNode(script, 'send_zalo_group').config.zaloSelectedGroupIds).toEqual(['111', '222']);
    expect(sendNode(script, 'send_zalo_group').config.zaloGroupIds).toEqual(['111', '222']);
  });

  it('customers (email): khối động interested_customers loại all, KHÔNG có danh sách nhập sẵn, KHÔNG đọc danh sách khách lúc tạo', async () => {
    const { script, input } = await buildSimpleDraft({
      body: emailBody({ audience: { type: 'customers' } }),
      authUser: user,
    });
    expect(subtypes(script)).toEqual(['manual', 'interested_customers', 'send_email']);
    expect(sendNode(script, 'interested_customers').config).toEqual({ interestedCustomerType: 'all' });
    const send = sendNode(script, 'send_email').config;
    expect(send.recipientSource).toBe('node');
    expect(send.recipientField).toBe('email');
    expect(send.recipientEmails).toBeUndefined();
    expect(input.directRecipients).toBeNull();
    expect(input.recipientCountHint).toBeNull();
  });

  it('customers (zalo cá nhân): khối all + cột phone, nguồn "node"', async () => {
    const { script } = await buildSimpleDraft({
      body: zaloBody({ audience: { type: 'customers' } }),
      authUser: user,
    });
    expect(subtypes(script)).toEqual(['manual', 'select_zalo_account', 'interested_customers', 'send_zalo_personal']);
    expect(sendNode(script, 'interested_customers').config.interestedCustomerType).toBe('all');
    const send = sendNode(script, 'send_zalo_personal').config;
    expect(send.zaloRecipientSource).toBe('node');
    expect(send.zaloRecipientField).toBe('phone');
    expect(send.zaloRecipientType).toBe('phone');
    expect(send.zaloRecipientPhones).toBeUndefined();
  });

  it('nhân viên: prepareScript nhận id nhân viên + chủ workspace; khối customers không mang id người dùng nào', async () => {
    await buildSimpleDraft({
      body: emailBody({ audience: { type: 'customers' } }),
      authUser: { id: 8, role: 'user', activeContext: { type: 'employee', ownerId: 3 } },
    });
    expect(mockPrepareScript).toHaveBeenCalledWith(expect.anything(), 8, { ownerUserId: 3 });
  });
});

describe('nội dung: mẫu có sẵn vs tự soạn', () => {
  it('mẫu có sẵn (email): templateId gán vào bước 0, KHÔNG chạy assertNoEmptyContent (bước chỉ có templateId vẫn qua)', async () => {
    const { script } = await buildSimpleDraft({
      body: emailBody({ content: { mode: 'template', templateId: 12 } }),
      authUser: user,
    });
    const step = sendNode(script, 'send_email').config.emailSteps[0];
    expect(step.templateId).toBe(12);
    expect(step.emailBody).toBe('');
    expect(step.emailSubject).toBe('');
  });

  it('mẫu có sẵn (zalo cá nhân + zalo nhóm): templateId vào đúng trường bước của từng kênh', async () => {
    const personal = await buildSimpleDraft({ body: zaloBody({ content: { mode: 'template', templateId: 4 } }), authUser: user });
    expect(sendNode(personal.script, 'send_zalo_personal').config.zaloPersonalTemplateSteps[0].templateId).toBe(4);
    const group = await buildSimpleDraft({ body: groupBody(), authUser: user });
    expect(sendNode(group.script, 'send_zalo_group').config.zaloGroupTemplateSteps[0].templateId).toBe(3);
  });

  it('tự soạn (email): tiêu đề + thân HTML vào bước 0; chưa tạo mẫu ở bước dựng nháp', async () => {
    const { script } = await buildSimpleDraft({ body: emailBody(), authUser: user });
    const step = sendNode(script, 'send_email').config.emailSteps[0];
    expect(step.emailSubject).toBe('Ưu đãi');
    expect(step.emailBody).toBe('<p>Xin chào bạn</p>');
    expect(mockAutoCreateEmailTemplates).not.toHaveBeenCalled();
  });

  it('tạo (tự soạn): mẫu tin được tạo thành mẫu thật thuộc CHỦ workspace; tên mẫu mượn tên chiến dịch rồi xoá khỏi node', async () => {
    const createdTemplates = { emailTemplateIds: [], zaloTemplateIds: [] };
    mockAutoCreateEmailTemplates.mockImplementation(async (nodes) => {
      const send = nodes.find((node) => getNodeSubtype(node) === 'send_email');
      expect(send.nodeName).toBe('Chiến dịch thử');
      send.config.emailSteps[0].templateId = 99;
    });
    const draft = await buildSimpleCreateDraft({
      body: emailBody({ campaignName: 'Chiến dịch thử' }),
      authUser: { id: 8, role: 'user', activeContext: { type: 'employee', ownerId: 3 } },
      createdTemplates,
    });
    // structuredClone của Node trả mảng khác realm với jest → không dùng expect.any(Array).
    for (const mock of [mockAutoCreateEmailTemplates, mockAutoCreateZaloTemplates]) {
      expect(mock).toHaveBeenCalledTimes(1);
      const [nodesArg, ownerArg, createdArg] = mock.mock.calls[0];
      expect(Array.isArray(nodesArg)).toBe(true);
      expect(ownerArg).toBe(3);
      expect(createdArg).toBe(createdTemplates);
    }
    expect(draft.nodes.find((node) => getNodeSubtype(node) === 'send_email').nodeName).toBeUndefined();
    expect(draft.campaignName).toBe('Chiến dịch thử');
    expect(draft.channel).toBe('email');
  });

  it('tạo (mẫu có sẵn): KHÔNG tạo mẫu tin nào', async () => {
    const createdTemplates = { emailTemplateIds: [], zaloTemplateIds: [] };
    await buildSimpleCreateDraft({
      body: emailBody({ content: { mode: 'template', templateId: 12 } }),
      authUser: user,
      createdTemplates,
    });
    expect(mockAutoCreateEmailTemplates).not.toHaveBeenCalled();
    expect(mockAutoCreateZaloTemplates).not.toHaveBeenCalled();
  });

  it('mẫu của workspace khác (thẻ xác nhận báo template_not_found): tạo → 400 TEMPLATE_NOT_FOUND, KHÔNG tạo mẫu nào', async () => {
    mockBuildConfirmationView.mockResolvedValue(readyView({
      readyToCreate: false,
      blockingIssues: [{ code: 'template_not_found', nodeId: 'node_send_email_1', stepIndex: 0 }],
    }));
    const createdTemplates = { emailTemplateIds: [], zaloTemplateIds: [] };
    await expect(buildSimpleCreateDraft({
      body: emailBody({ content: { mode: 'template', templateId: 777 } }),
      authUser: user,
      createdTemplates,
    })).rejects.toMatchObject({ statusCode: 400, code: 'TEMPLATE_NOT_FOUND' });
    expect(mockAutoCreateEmailTemplates).not.toHaveBeenCalled();
  });

  it('thẻ xác nhận chặn tài khoản gửi → 400 SENDER_NOT_AVAILABLE kèm danh sách issues', async () => {
    mockBuildConfirmationView.mockResolvedValue(readyView({
      readyToCreate: false,
      blockingIssues: [{ code: 'missing_sender', nodeId: 'node_send_email_1', stepIndex: 0 }],
    }));
    const error = await buildSimpleCreateDraft({
      body: emailBody(), authUser: user, createdTemplates: { emailTemplateIds: [], zaloTemplateIds: [] },
    }).catch((e) => e);
    expect(error).toBeInstanceOf(SimpleCampaignError);
    expect(error.statusCode).toBe(400);
    expect(error.code).toBe('SENDER_NOT_AVAILABLE');
    expect(error.extra.issues).toEqual([expect.objectContaining({ code: 'missing_sender' })]);
  });

  it('email tự soạn thiếu tiêu đề → 400 SUBJECT_REQUIRED', async () => {
    await expect(buildSimpleDraft({
      body: emailBody({ content: { mode: 'custom', subject: '   ', body: 'Xin chào' } }),
      authUser: user,
    })).rejects.toMatchObject({ statusCode: 400, code: 'SUBJECT_REQUIRED' });
  });

  it('tự soạn thiếu nội dung → 400 CONTENT_REQUIRED; mẫu thiếu id → 400 TEMPLATE_REQUIRED; mode lạ → 400 INVALID_CONTENT', async () => {
    await expect(buildSimpleDraft({ body: zaloBody({ content: { mode: 'custom', body: '  ' } }), authUser: user }))
      .rejects.toMatchObject({ code: 'CONTENT_REQUIRED' });
    await expect(buildSimpleDraft({ body: zaloBody({ content: { mode: 'template' } }), authUser: user }))
      .rejects.toMatchObject({ code: 'TEMPLATE_REQUIRED' });
    await expect(buildSimpleDraft({ body: zaloBody({ content: { mode: 'ai' } }), authUser: user }))
      .rejects.toMatchObject({ code: 'INVALID_CONTENT' });
  });
});

describe('kiểm body (400)', () => {
  it('zalo_groups rỗng / thiếu → 400 ZALO_GROUPS_REQUIRED (rỗng = gửi MỌI nhóm của tài khoản)', async () => {
    await expect(buildSimpleDraft({ body: groupBody({ audience: { type: 'zalo_groups', groupIds: [] } }), authUser: user }))
      .rejects.toMatchObject({ statusCode: 400, code: 'ZALO_GROUPS_REQUIRED' });
    await expect(buildSimpleDraft({ body: groupBody({ audience: { type: 'zalo_groups' } }), authUser: user }))
      .rejects.toMatchObject({ statusCode: 400, code: 'ZALO_GROUPS_REQUIRED' });
    await expect(buildSimpleDraft({ body: groupBody({ audience: { type: 'zalo_groups', groupIds: ['', '  '] } }), authUser: user }))
      .rejects.toMatchObject({ code: 'ZALO_GROUPS_REQUIRED' });
    expect(mockPrepareScript).not.toHaveBeenCalled();
  });

  it('customers KHÔNG còn bị chặn CUSTOMERS_OVER_LIMIT / CUSTOMERS_EMPTY khi tạo (khối động, đếm ở preview)', async () => {
    mockCountWorkspaceCustomers.mockResolvedValue(10_000_000);
    await expect(buildSimpleDraft({ body: emailBody({ audience: { type: 'customers' } }), authUser: user })).resolves.toBeDefined();
    expect(mockCountWorkspaceCustomers).not.toHaveBeenCalled();
  });

  it('nguồn không hợp kênh → 400 INVALID_AUDIENCE (zalo_groups cho email, customers cho nhóm, zalo_friends cho email)', async () => {
    await expect(buildSimpleDraft({ body: emailBody({ audience: { type: 'zalo_groups', groupIds: ['1'] } }), authUser: user }))
      .rejects.toMatchObject({ code: 'INVALID_AUDIENCE' });
    await expect(buildSimpleDraft({ body: groupBody({ audience: { type: 'customers' } }), authUser: user }))
      .rejects.toMatchObject({ code: 'INVALID_AUDIENCE' });
    await expect(buildSimpleDraft({ body: emailBody({ audience: { type: 'zalo_friends', uids: ['1234567'] } }), authUser: user }))
      .rejects.toMatchObject({ code: 'INVALID_AUDIENCE' });
    await expect(buildSimpleDraft({ body: emailBody({ audience: { type: 'db' } }), authUser: user }))
      .rejects.toMatchObject({ code: 'INVALID_AUDIENCE' });
  });

  it('biểu mẫu không thuộc workspace → 400 FORM_NOT_FOUND; không chọn → 400 FORM_REQUIRED', async () => {
    mockGetFormIdsOwnedBy.mockResolvedValue([7]);
    await expect(buildSimpleDraft({ body: emailBody({ audience: { type: 'form', formIds: [7, 999] } }), authUser: user }))
      .rejects.toMatchObject({ code: 'FORM_NOT_FOUND' });
    expect(mockGetFormIdsOwnedBy).toHaveBeenCalledWith(7, [7, 999]);
    await expect(buildSimpleDraft({ body: emailBody({ audience: { type: 'form', formIds: [] } }), authUser: user }))
      .rejects.toMatchObject({ code: 'FORM_REQUIRED' });
  });

  it('sheet: link không phải Google Sheet → 400 SHEET_URL_INVALID; landing rỗng → 400 LANDING_REQUIRED', async () => {
    await expect(buildSimpleDraft({ body: emailBody({ audience: { type: 'sheet', sheetUrl: 'https://example.com/x' } }), authUser: user }))
      .rejects.toMatchObject({ code: 'SHEET_URL_INVALID' });
    await expect(buildSimpleDraft({ body: emailBody({ audience: { type: 'landing', slugs: [] } }), authUser: user }))
      .rejects.toMatchObject({ code: 'LANDING_REQUIRED' });
  });

  it('nhập tay: email hỏng → 400 INVALID_MANUAL_RECIPIENTS; rỗng → 400 MANUAL_RECIPIENTS_REQUIRED; vượt trần → 400 MANUAL_RECIPIENTS_LIMIT', async () => {
    await expect(normalizeSimpleBody(emailBody({ audience: { type: 'manual', emails: ['khong-phai-email'] } }), { ownerId: 7 }))
      .rejects.toMatchObject({ statusCode: 400, code: 'INVALID_MANUAL_RECIPIENTS' });
    await expect(normalizeSimpleBody(emailBody({ audience: { type: 'manual', emails: [] } }), { ownerId: 7 }))
      .rejects.toMatchObject({ statusCode: 400, code: 'MANUAL_RECIPIENTS_REQUIRED' });
    await expect(normalizeSimpleBody(emailBody({ audience: { type: 'manual', emails: ['a@x.com', 'b@x.com', 'c@x.com', 'd@x.com'] } }), { ownerId: 7 }))
      .rejects.toMatchObject({ statusCode: 400, code: 'MANUAL_RECIPIENTS_LIMIT' });
  });
});

describe('chốt chặn theo gói', () => {
  it('gói không có kênh Zalo (ngữ cảnh do channelEntitlementContext đặt): Zalo cá nhân + nhóm → 403 CHANNEL_NOT_IN_PLAN; email vẫn qua', async () => {
    await runWithChannelEntitlements({ telegram: true, whatsapp: true, zalo: false }, async () => {
      await expect(buildSimpleDraft({ body: zaloBody(), authUser: user }))
        .rejects.toMatchObject({ statusCode: 403, code: 'CHANNEL_NOT_IN_PLAN' });
      await expect(buildSimpleDraft({ body: groupBody(), authUser: user }))
        .rejects.toMatchObject({ statusCode: 403, code: 'CHANNEL_NOT_IN_PLAN' });
      await expect(buildSimpleDraft({ body: emailBody(), authUser: user })).resolves.toBeDefined();
    });
  });

  it('không có ngữ cảnh quyền kênh (không đi qua middleware) → Zalo biên dịch như bình thường (đây là lý do route BẮT BUỘC gắn middleware)', async () => {
    await expect(buildSimpleDraft({ body: zaloBody(), authUser: user })).resolves.toBeDefined();
  });

  it('nhân viên chưa được giao tài khoản Zalo (prepareScript gỡ id) → issue missing_sender dù thẻ xác nhận không báo; tạo → 400', async () => {
    mockPrepareScript.mockImplementation(async (script) => {
      const clone = structuredClone(script);
      for (const node of clone.nodes) {
        if (node.config && 'zaloAccountId' in node.config) delete node.config.zaloAccountId;
      }
      return clone;
    });
    const { issues } = await buildSimpleDraft({ body: zaloBody(), authUser: user });
    expect(issues.map((issue) => issue.code)).toEqual(['missing_sender']);
    await expect(buildSimpleCreateDraft({
      body: zaloBody(), authUser: user, createdTemplates: { emailTemplateIds: [], zaloTemplateIds: [] },
    })).rejects.toMatchObject({ statusCode: 400, code: 'SENDER_NOT_AVAILABLE' });
    expect(mockAutoCreateZaloTemplates).not.toHaveBeenCalled();
  });
});

describe('previewSimpleCampaign — không ghi DB', () => {
  it('hết hạn mức chiến dịch của gói → readyToCreate=false + issue chặn campaign_limit_reached (báo TRƯỚC khi bấm gửi)', async () => {
    mockCheckUserResourceLimit.mockImplementation(async ({ resourceKey }) => (resourceKey === 'campaigns'
      ? { allowed: false, limit: 5, currentCount: 5, message: 'Tài khoản đã đạt giới hạn số chiến dịch (5).' }
      : { allowed: true, limit: null, currentCount: 0, message: null }));
    const result = await previewSimpleCampaign({ body: emailBody(), authUser: user });
    expect(mockCheckUserResourceLimit).toHaveBeenCalledWith({ userId: 7, roleCode: 'user', resourceKey: 'campaigns' });
    expect(result.readyToCreate).toBe(false);
    expect(result.issues).toEqual([expect.objectContaining({
      code: 'campaign_limit_reached', severity: 'blocking', message: 'Tài khoản đã đạt giới hạn số chiến dịch (5).',
    })]);
  });

  it('hạn mức THEO LOẠI: Zalo nhóm kiểm zaloGroupCampaigns, email kiểm emailCampaigns (cùng bảng campaignController.create)', async () => {
    mockCheckUserResourceLimit.mockImplementation(async ({ resourceKey }) => (resourceKey === 'zaloGroupCampaigns'
      ? { allowed: false, limit: 2, currentCount: 2, message: 'Đã đạt giới hạn chiến dịch Zalo nhóm (2).' }
      : { allowed: true, limit: null, currentCount: 0, message: null }));
    const group = await previewSimpleCampaign({ body: groupBody(), authUser: user });
    expect(group.readyToCreate).toBe(false);
    expect(group.issues.map((issue) => issue.code)).toEqual(['campaign_limit_reached']);
    const email = await previewSimpleCampaign({ body: emailBody(), authUser: user });
    expect(email.readyToCreate).toBe(true);
    expect(mockCheckUserResourceLimit).toHaveBeenCalledWith(expect.objectContaining({ resourceKey: 'emailCampaigns' }));
  });

  it('KHÔNG tạo mẫu tin (autoCreate*) dù là chữ tự soạn, KHÔNG dọn mẫu', async () => {
    await previewSimpleCampaign({ body: emailBody(), authUser: user });
    await previewSimpleCampaign({ body: zaloBody(), authUser: user });
    expect(mockAutoCreateEmailTemplates).not.toHaveBeenCalled();
    expect(mockAutoCreateZaloTemplates).not.toHaveBeenCalled();
    expect(mockCleanupAutoCreatedTemplates).not.toHaveBeenCalled();
  });

  it('startAt (ISO) + continuous:true của body preview được truyền xuống thẻ xác nhận để ước tính theo giờ hẹn / chế độ liên tục (PR-3)', async () => {
    await previewSimpleCampaign({
      body: emailBody({ startAt: '2026-10-20T01:30:00.000Z', continuous: true }),
      authUser: user,
    });
    const arg = mockBuildConfirmationView.mock.calls[0][0];
    expect(arg.includeEstimate).toBe(true);
    expect(arg.estimateOptions.startAt).toEqual(new Date('2026-10-20T01:30:00.000Z'));
    expect(arg.estimateOptions.continuous).toBe(true);
  });

  it('không có startAt/continuous → estimateOptions rỗng (ước tính như gửi ngay); startAt sai định dạng bị bỏ, không 400', async () => {
    await previewSimpleCampaign({ body: emailBody(), authUser: user });
    expect(mockBuildConfirmationView.mock.calls[0][0].estimateOptions).toEqual({ startAt: null, continuous: false });
    expect(resolvePreviewEstimateOptions({ startAt: 'khong-phai-ngay' })).toEqual({ startAt: null, continuous: false });
    expect(resolvePreviewEstimateOptions({ continuous: 'true' }).continuous).toBe(false);
  });

  it('xin ước tính (includeEstimate) và trả đủ hình dạng hợp đồng', async () => {
    mockBuildConfirmationView.mockResolvedValue(readyView({
      steps: [{
        sender: { id: 5, label: 'shop@abc.vn' },
        content: { templateId: 12, templateName: 'Ưu đãi tháng 10', subject: 'x', bodyText: 'y' },
        recipients: { mode: 'source', sourceLabel: 'Dữ liệu Biểu mẫu' },
      }],
    }));
    const result = await previewSimpleCampaign({
      body: emailBody({ audience: { type: 'form', formIds: [7] }, content: { mode: 'template', templateId: 12 } }),
      authUser: user,
    });
    expect(mockBuildConfirmationView).toHaveBeenCalledWith(expect.objectContaining({ includeEstimate: true, ownerUserId: 7 }));
    expect(result).toEqual({
      readyToCreate: true,
      issues: [],
      estimate: { perNode: [{ nodeId: 'n', recipients: 9 }], warnings: [] },
      recipientCount: 9,
      recipientUnit: 'person',
      summary: {
        channel: 'email',
        senderLabel: 'shop@abc.vn',
        audienceType: 'form',
        audienceLabel: 'Dữ liệu Biểu mẫu',
        contentLabel: 'Ưu đãi tháng 10',
      },
    });
  });

  it('danh sách nhập sẵn: recipientCount lấy từ danh sách (không phụ thuộc ước tính); Zalo nhóm đếm theo nhóm', async () => {
    mockBuildConfirmationView.mockResolvedValue(readyView({ estimate: null }));
    const manual = await previewSimpleCampaign({ body: emailBody(), authUser: user });
    expect(manual.recipientCount).toBe(2);
    expect(manual.estimate).toBeNull();
    const group = await previewSimpleCampaign({ body: groupBody(), authUser: user });
    expect(group.recipientCount).toBe(2);
    expect(group.recipientUnit).toBe('group');
  });

  it('Sheet không đọc được → issue cảnh báo recipient_count_unknown, recipientCount null, vẫn 200 (readyToCreate giữ nguyên)', async () => {
    mockBuildConfirmationView.mockResolvedValue(readyView({
      estimate: { perNode: [{ nodeId: 'n', recipients: 0 }], warnings: [{ code: 'recipient_count_unknown', params: { reason: 'error' } }] },
    }));
    const result = await previewSimpleCampaign({
      body: emailBody({ audience: { type: 'sheet', sheetUrl: 'https://docs.google.com/spreadsheets/d/abc123/edit' } }),
      authUser: user,
    });
    expect(result.readyToCreate).toBe(true);
    expect(result.recipientCount).toBeNull();
    expect(result.issues).toEqual([expect.objectContaining({ code: 'recipient_count_unknown', severity: 'warning' })]);
  });

  it('Zalo nhóm (đã biết số nhóm) → KHÔNG báo "chưa đếm được số người nhận" dù bộ ước tính trả cảnh báo đó', async () => {
    mockBuildConfirmationView.mockResolvedValue(readyView({
      estimate: { perNode: [{ nodeId: 'n', recipients: 0 }], warnings: [{ code: 'recipient_count_unknown', params: { reason: 'error' } }] },
    }));
    const result = await previewSimpleCampaign({ body: groupBody(), authUser: user });
    expect(result.recipientCount).toBe(2);
    expect(result.issues.map((issue) => issue.code)).not.toContain('recipient_count_unknown');
  });

  it('lỗi dữ liệu của thẻ xác nhận → readyToCreate false + issues blocking có câu tiếng Việt (không ném)', async () => {
    mockBuildConfirmationView.mockResolvedValue(readyView({
      readyToCreate: false,
      estimate: null,
      blockingIssues: [{ code: 'template_not_found', nodeId: 'node_send_email_1', stepIndex: 0 }],
    }));
    const result = await previewSimpleCampaign({
      body: emailBody({ content: { mode: 'template', templateId: 777 } }),
      authUser: user,
    });
    expect(result.readyToCreate).toBe(false);
    expect(result.issues).toEqual([expect.objectContaining({
      code: 'template_not_found',
      severity: 'blocking',
      message: expect.stringContaining('mẫu tin'),
    })]);
  });

  it('body sai hình dạng vẫn là 400 (không phải issues)', async () => {
    await expect(previewSimpleCampaign({ body: groupBody({ audience: { type: 'zalo_groups', groupIds: [] } }), authUser: user }))
      .rejects.toMatchObject({ statusCode: 400, code: 'ZALO_GROUPS_REQUIRED' });
  });
});

describe('buildDefaultCampaignName', () => {
  it('"<Kênh> – dd/MM/yyyy HH:mm" theo giờ Việt Nam (UTC+7)', () => {
    const now = new Date('2026-10-14T03:05:00Z');
    expect(buildDefaultCampaignName('email', now)).toBe('Email – 14/10/2026 10:05');
    expect(buildDefaultCampaignName('zalo', now)).toBe('Zalo cá nhân – 14/10/2026 10:05');
    expect(buildDefaultCampaignName('zalo_group', now)).toBe('Zalo nhóm – 14/10/2026 10:05');
  });

  it('qua nửa đêm UTC → sang ngày hôm sau theo giờ VN; body bỏ trống tên thì server đặt tên mặc định', async () => {
    expect(buildDefaultCampaignName('email', new Date('2026-10-14T20:30:00Z'))).toBe('Email – 15/10/2026 03:30');
    const { script } = await buildSimpleDraft({
      body: emailBody({ campaignName: '   ' }),
      authUser: user,
      now: new Date('2026-10-14T03:05:00Z'),
    });
    expect(script.campaignName).toBe('Email – 14/10/2026 10:05');
  });

  it('tên tự đặt quá 255 ký tự → 400', async () => {
    await expect(buildSimpleDraft({ body: emailBody({ campaignName: 'x'.repeat(256) }), authUser: user }))
      .rejects.toMatchObject({ statusCode: 400, code: 'CAMPAIGN_NAME_TOO_LONG' });
  });
});

describe('followUps — biên dịch chuỗi tin (PLAN_HAI_TAB_TUNG_BUOC PR-A)', () => {
  const tplContent = (templateId) => ({ mode: 'template', templateId });
  const stepsOf = (script, subtype, field) => sendNode(script, subtype).config[field];

  it('email 3 tin: độ trễ từng bước ghi đè, bước 0 = 0, bước ≥ 1 đều delayFrom=prev; sendMode=schedule', async () => {
    const { script } = await buildSimpleDraft({
      body: emailBody({
        content: { mode: 'template', templateId: 11 },
        followUps: [
          { delayValue: 2, delayUnit: 'days', content: { mode: 'template', templateId: 12 } },
          { delayValue: 5, delayUnit: 'hours', content: { mode: 'template', templateId: 13 } },
        ],
      }),
      authUser: user,
    });
    const send = sendNode(script, 'send_email').config;
    expect(send.sendMode).toBe('schedule');
    const steps = send.emailSteps;
    expect(steps).toHaveLength(3);
    expect(steps.map((step) => step.templateId)).toEqual([11, 12, 13]);
    expect(steps.map((step) => step.delayValue)).toEqual([0, 2, 5]);
    expect(steps.slice(1).map((step) => step.delayUnit)).toEqual(['days', 'hours']);
    expect(steps.slice(1).map((step) => step.delayFrom)).toEqual(['prev', 'prev']);
  });

  it('zalo cá nhân và zalo nhóm cũng ghi đè độ trễ + delayFrom=prev', async () => {
    const personal = await buildSimpleDraft({
      body: zaloBody({
        content: { mode: 'template', templateId: 1 },
        followUps: [{ delayValue: 3, delayUnit: 'days', content: { mode: 'template', templateId: 2 } }],
      }),
      authUser: user,
    });
    const pSteps = stepsOf(personal.script, 'send_zalo_personal', 'zaloPersonalTemplateSteps');
    expect(pSteps.map((step) => [step.templateId, step.delayValue, step.delayFrom ?? null])).toEqual([[1, 0, 'prev'], [2, 3, 'prev']]);
    expect(sendNode(personal.script, 'send_zalo_personal').config.zaloPersonalSendMode).toBe('schedule');

    const group = await buildSimpleDraft({
      body: groupBody({ followUps: [{ delayValue: 12, delayUnit: 'hours', content: { mode: 'template', templateId: 4 } }] }),
      authUser: user,
    });
    const gSteps = stepsOf(group.script, 'send_zalo_group', 'zaloGroupTemplateSteps');
    expect(gSteps.map((step) => [step.templateId, step.delayValue, step.delayUnit, step.delayFrom])).toEqual([
      [3, 0, 'days', 'prev'],
      [4, 12, 'hours', 'prev'],
    ]);
  });

  it('trộn mẫu + tự soạn: chữ tự soạn vào ĐÚNG bước của nó, bước dùng mẫu không dính chữ giữ chỗ', async () => {
    const { script } = await buildSimpleDraft({
      body: emailBody({
        content: { mode: 'template', templateId: 11 },
        followUps: [
          { delayValue: 1, delayUnit: 'days', content: { mode: 'custom', subject: 'Nhắc lần 1', body: 'Nội dung nhắc một' } },
          { delayValue: 3, delayUnit: 'days', content: { mode: 'template', templateId: 13 } },
          { delayValue: 7, delayUnit: 'days', content: { mode: 'custom', subject: 'Nhắc lần 3', body: 'Nội dung nhắc ba' } },
        ],
      }),
      authUser: user,
    });
    const steps = sendNode(script, 'send_email').config.emailSteps;
    expect(steps.map((step) => step.templateId)).toEqual([11, null, 13, null]);
    expect(steps.map((step) => step.emailSubject)).toEqual(['', 'Nhắc lần 1', '', 'Nhắc lần 3']);
    expect(steps[1].emailBody).toContain('Nội dung nhắc một');
    expect(steps[3].emailBody).toContain('Nội dung nhắc ba');
    expect(JSON.stringify(steps)).not.toContain('__template__');
  });

  it('zalo trộn mẫu + tự soạn: message đúng bước, bước mẫu trả về rỗng', async () => {
    const { script } = await buildSimpleDraft({
      body: zaloBody({
        content: { mode: 'custom', body: 'Tin đầu' },
        followUps: [
          { delayValue: 1, delayUnit: 'days', content: { mode: 'template', templateId: 9 } },
          { delayValue: 2, delayUnit: 'days', content: { mode: 'custom', body: 'Tin ba' } },
        ],
      }),
      authUser: user,
    });
    const steps = stepsOf(script, 'send_zalo_personal', 'zaloPersonalTemplateSteps');
    expect(steps.map((step) => step.message)).toEqual(['Tin đầu', '', 'Tin ba']);
    expect(steps.map((step) => step.templateId)).toEqual([null, 9, null]);
  });

  it('email tự soạn thiếu tiêu đề ở tin 3 → 400 SUBJECT_REQUIRED nêu "Tin 3"', async () => {
    await expect(buildSimpleDraft({
      body: emailBody({
        followUps: [
          { delayValue: 1, delayUnit: 'days', content: { mode: 'custom', subject: 'Có tiêu đề', body: 'b' } },
          { delayValue: 1, delayUnit: 'days', content: { mode: 'custom', subject: '  ', body: 'b' } },
        ],
      }),
      authUser: user,
    })).rejects.toMatchObject({ statusCode: 400, code: 'SUBJECT_REQUIRED', message: expect.stringContaining('Tin 3') });
  });

  it('tạo thật: autoCreate chạy trên khối gửi có đủ các bước (mỗi tin tự soạn thành một mẫu)', async () => {
    const createdTemplates = { emailTemplateIds: [], zaloTemplateIds: [] };
    await buildSimpleCreateDraft({
      body: emailBody({ followUps: [{ delayValue: 1, delayUnit: 'days', content: { mode: 'custom', subject: 'S2', body: 'B2' } }] }),
      authUser: user,
      createdTemplates,
    });
    expect(mockAutoCreateEmailTemplates).toHaveBeenCalledTimes(1);
    const nodes = mockAutoCreateEmailTemplates.mock.calls[0][0];
    expect(sendNode({ nodes }, 'send_email').config.emailSteps).toHaveLength(2);
  });

  it('tạo thật: CHỈ tin trong chuỗi tự soạn (tin 1 dùng mẫu) vẫn phải tạo mẫu — nếu không bước đó lưu không có templateId và không bao giờ được gửi', async () => {
    await buildSimpleCreateDraft({
      body: emailBody({
        content: { mode: 'template', templateId: 11 },
        followUps: [{ delayValue: 1, delayUnit: 'days', content: { mode: 'custom', subject: 'S2', body: 'B2' } }],
      }),
      authUser: user,
      createdTemplates: { emailTemplateIds: [], zaloTemplateIds: [] },
    });
    expect(mockAutoCreateEmailTemplates).toHaveBeenCalledTimes(1);
    expect(mockAutoCreateZaloTemplates).toHaveBeenCalledTimes(1);
  });

  it('tạo thật: toàn bộ dùng mẫu có sẵn → KHÔNG tạo mẫu nào', async () => {
    await buildSimpleCreateDraft({
      body: emailBody({ content: tplContent(11), followUps: [{ delayValue: 1, delayUnit: 'days', content: tplContent(12) }] }),
      authUser: user,
      createdTemplates: { emailTemplateIds: [], zaloTemplateIds: [] },
    });
    expect(mockAutoCreateEmailTemplates).not.toHaveBeenCalled();
    expect(mockAutoCreateZaloTemplates).not.toHaveBeenCalled();
  });

  it('kiểm đầu vào: > 9 tin, delayValue ≤ 0 / thập phân / chữ, đơn vị lạ, followUps không phải mảng → 400', async () => {
    const one = { delayValue: 1, delayUnit: 'days', content: { mode: 'template', templateId: 2 } };
    const run = (followUps) => buildSimpleDraft({ body: emailBody({ followUps }), authUser: user });
    await expect(run(Array.from({ length: 10 }, () => one))).rejects.toMatchObject({ statusCode: 400, code: 'FOLLOW_UPS_TOO_MANY' });
    await expect(run(Array.from({ length: 9 }, () => one))).resolves.toBeDefined();
    await expect(run([{ ...one, delayValue: 0 }])).rejects.toMatchObject({ code: 'INVALID_FOLLOW_UP_DELAY' });
    await expect(run([{ ...one, delayValue: -3 }])).rejects.toMatchObject({ code: 'INVALID_FOLLOW_UP_DELAY' });
    await expect(run([{ ...one, delayValue: 1.5 }])).rejects.toMatchObject({ code: 'INVALID_FOLLOW_UP_DELAY' });
    await expect(run([{ ...one, delayValue: 'abc' }])).rejects.toMatchObject({ code: 'INVALID_FOLLOW_UP_DELAY' });
    await expect(run([{ ...one, delayUnit: 'minutes' }])).rejects.toMatchObject({ code: 'INVALID_FOLLOW_UP_DELAY' });
    await expect(run('nhieu-tin')).rejects.toMatchObject({ code: 'INVALID_FOLLOW_UPS' });
    await expect(run([{ ...one, delayValue: '3' }])).resolves.toBeDefined();
  });

  it('followUps: [] hoặc vắng → chiến dịch một lần như cũ (sendMode all, 1 bước)', async () => {
    const { script } = await buildSimpleDraft({ body: emailBody({ followUps: [] }), authUser: user });
    const send = sendNode(script, 'send_email').config;
    expect(send.sendMode).toBe('all');
    expect(send.emailSteps).toHaveLength(1);
  });
});

describe('previewSimpleCampaign — nguồn "khách hàng đã lưu" là khối động', () => {
  it('đếm tổng khách của CHỦ workspace; recipientCount = tổng; không báo "chưa đếm được" dù ước tính báo', async () => {
    mockCountWorkspaceCustomers.mockResolvedValue(2);
    mockBuildConfirmationView.mockResolvedValue(readyView({
      estimate: { perNode: [], warnings: [{ code: 'recipient_count_unknown' }] },
    }));
    const result = await previewSimpleCampaign({
      body: emailBody({ audience: { type: 'customers' } }),
      authUser: { id: 8, role: 'user', activeContext: { type: 'employee', ownerId: 3 } },
    });
    expect(mockCountWorkspaceCustomers).toHaveBeenCalledWith({ userId: 3 });
    expect(result.recipientCount).toBe(2);
    expect(result.issues).toEqual([]);
    expect(result.readyToCreate).toBe(true);
  });

  // Spec này đặt MAX_AI_MANUAL_RECIPIENTS=3 (đầu file) nên trần = 3; ở production là 50.000 → "Chỉ gửi cho 50.000 khách đầu tiên".
  it('tổng > trần → cảnh báo severity=warning "Chỉ gửi cho <trần> khách đầu tiên"; KHÔNG chặn; recipientCount kẹp ở trần', async () => {
    mockCountWorkspaceCustomers.mockResolvedValue(96940);
    const result = await previewSimpleCampaign({ body: emailBody({ audience: { type: 'customers' } }), authUser: user });
    expect(result.readyToCreate).toBe(true);
    expect(result.issues).toEqual([expect.objectContaining({
      code: 'customers_over_limit',
      severity: 'warning',
      message: expect.stringContaining('Chỉ gửi cho 3 khách đầu tiên'),
    })]);
    expect(result.recipientCount).toBe(3);
  });

  it('đúng bằng trần khách → không cảnh báo', async () => {
    mockCountWorkspaceCustomers.mockResolvedValue(3);
    const result = await previewSimpleCampaign({ body: emailBody({ audience: { type: 'customers' } }), authUser: user });
    expect(result.issues).toEqual([]);
  });

  it('0 khách → cảnh báo customers_empty (không chặn)', async () => {
    mockCountWorkspaceCustomers.mockResolvedValue(0);
    const result = await previewSimpleCampaign({ body: emailBody({ audience: { type: 'customers' } }), authUser: user });
    expect(result.readyToCreate).toBe(true);
    expect(result.issues.map((issue) => [issue.code, issue.severity])).toEqual([['customers_empty', 'warning']]);
  });

  it('nguồn khác không đếm khách', async () => {
    await previewSimpleCampaign({ body: emailBody(), authUser: user });
    expect(mockCountWorkspaceCustomers).not.toHaveBeenCalled();
  });
});
