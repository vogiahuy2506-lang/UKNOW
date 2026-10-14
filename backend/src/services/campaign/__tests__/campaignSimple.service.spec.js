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
const mockGetCustomerContactValues = jest.fn();
const mockFillReadSheetFirstTabNames = jest.fn();

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
  default: { getCustomerContactValues: mockGetCustomerContactValues },
}));
jest.unstable_mockModule('../readSheetAutoName.service.js', () => ({
  fillReadSheetFirstTabNames: mockFillReadSheetFirstTabNames,
}));

const service = await import('../campaignSimple.service.js');
const { runWithChannelEntitlements } = await import('../campaignChannelFlags.util.js');
const { getNodeSubtype } = await import('../../../utils/nodeSubtype.util.js');

const {
  buildSimpleIntent,
  buildSimpleDraft,
  buildSimpleCreateDraft,
  previewSimpleCampaign,
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
  mockGetCustomerContactValues.mockResolvedValue([]);
  mockFillReadSheetFirstTabNames.mockResolvedValue(undefined);
  mockAutoCreateEmailTemplates.mockResolvedValue(undefined);
  mockAutoCreateZaloTemplates.mockResolvedValue(undefined);
  mockCleanupAutoCreatedTemplates.mockResolvedValue(undefined);
});

describe('buildSimpleIntent — bảng ánh xạ audience → CampaignIntentV1 (plan §PR-1)', () => {
  const norm = (extra) => ({ campaignName: 'x', senderId: 5, directRecipients: null, ...extra });

  it('customers (email) → manual + recipientKind email, KHÔNG dùng "db"', () => {
    const intent = buildSimpleIntent(norm({ channel: 'email', audience: { type: 'customers' } }));
    expect(intent.audience).toEqual({ type: 'manual', recipientKind: 'email' });
    expect(intent.audience.type).not.toBe('db');
  });

  it('customers (zalo) → manual + recipientKind phone', () => {
    const intent = buildSimpleIntent(norm({ channel: 'zalo', audience: { type: 'customers' } }));
    expect(intent.audience).toEqual({ type: 'manual', recipientKind: 'phone' });
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

  it('customers (email): server lấy danh sách khách, lọc email hỏng, khử trùng, đổ vào danh sách nhập sẵn — không có node db', async () => {
    mockGetCustomerContactValues.mockResolvedValue(['A@x.com', 'khong-hop-le', 'b@x.com']);
    const { script, input } = await buildSimpleDraft({
      body: emailBody({ audience: { type: 'customers' } }),
      authUser: user,
    });
    expect(subtypes(script)).toEqual(['manual', 'send_email']);
    expect(sendNode(script, 'send_email').config.recipientEmails).toEqual(['a@x.com', 'b@x.com']);
    expect(input.recipientCountHint).toBe(2);
    expect(mockGetCustomerContactValues).toHaveBeenCalledWith({ userId: 7, kind: 'email', limit: 4 });
  });

  it('customers (zalo): lấy SĐT, chuẩn hoá +84, loại số không phải di động VN', async () => {
    mockGetCustomerContactValues.mockResolvedValue(['+84912345678', '0912345678', '12345']);
    const { script } = await buildSimpleDraft({
      body: zaloBody({ audience: { type: 'customers' } }),
      authUser: user,
    });
    expect(sendNode(script, 'send_zalo_personal').config.zaloRecipientPhones).toEqual(['0912345678']);
    expect(mockGetCustomerContactValues).toHaveBeenCalledWith({ userId: 7, kind: 'phone', limit: 4 });
  });

  it('nhân viên: phạm vi lấy theo CHỦ workspace (ownerId), không phải id nhân viên', async () => {
    mockGetCustomerContactValues.mockResolvedValue(['a@x.com']);
    await buildSimpleDraft({
      body: emailBody({ audience: { type: 'customers' } }),
      authUser: { id: 8, role: 'user', activeContext: { type: 'employee', ownerId: 3 } },
    });
    expect(mockGetCustomerContactValues).toHaveBeenCalledWith(expect.objectContaining({ userId: 3 }));
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

  it('customers vượt trần MAX_AI_MANUAL_RECIPIENTS → 400 CUSTOMERS_OVER_LIMIT, nêu rõ con số trần', async () => {
    mockGetCustomerContactValues.mockResolvedValue(['a@x.com', 'b@x.com', 'c@x.com', 'd@x.com']);
    const error = await buildSimpleDraft({ body: emailBody({ audience: { type: 'customers' } }), authUser: user }).catch((e) => e);
    expect(error).toMatchObject({ statusCode: 400, code: 'CUSTOMERS_OVER_LIMIT' });
    expect(error.message).toContain('3');
    expect(error.extra).toEqual({ limit: 3 });
  });

  it('customers đúng bằng trần thì qua; không có khách hợp lệ → 400 CUSTOMERS_EMPTY', async () => {
    mockGetCustomerContactValues.mockResolvedValue(['a@x.com', 'b@x.com', 'c@x.com']);
    await expect(buildSimpleDraft({ body: emailBody({ audience: { type: 'customers' } }), authUser: user })).resolves.toBeDefined();
    mockGetCustomerContactValues.mockResolvedValue(['khong-hop-le']);
    await expect(buildSimpleDraft({ body: emailBody({ audience: { type: 'customers' } }), authUser: user }))
      .rejects.toMatchObject({ statusCode: 400, code: 'CUSTOMERS_EMPTY' });
  });

  it('kênh lạ (telegram) → 400 INVALID_CHANNEL; thiếu tài khoản gửi → 400 SENDER_REQUIRED', async () => {
    await expect(buildSimpleDraft({ body: emailBody({ channel: 'telegram' }), authUser: user }))
      .rejects.toMatchObject({ statusCode: 400, code: 'INVALID_CHANNEL' });
    await expect(buildSimpleDraft({ body: emailBody({ senderId: undefined }), authUser: user }))
      .rejects.toMatchObject({ statusCode: 400, code: 'SENDER_REQUIRED' });
    await expect(buildSimpleDraft({ body: emailBody({ senderId: 'abc' }), authUser: user }))
      .rejects.toMatchObject({ code: 'SENDER_REQUIRED' });
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
  it('KHÔNG tạo mẫu tin (autoCreate*) dù là chữ tự soạn, KHÔNG dọn mẫu', async () => {
    await previewSimpleCampaign({ body: emailBody(), authUser: user });
    await previewSimpleCampaign({ body: zaloBody(), authUser: user });
    expect(mockAutoCreateEmailTemplates).not.toHaveBeenCalled();
    expect(mockAutoCreateZaloTemplates).not.toHaveBeenCalled();
    expect(mockCleanupAutoCreatedTemplates).not.toHaveBeenCalled();
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
