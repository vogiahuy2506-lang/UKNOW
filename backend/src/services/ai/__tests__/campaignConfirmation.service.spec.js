import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const draftRepo = {
  findDefaultEmailSettingId: jest.fn(),
  findDefaultZaloSettingId: jest.fn(),
};
const emailTemplates = { findById: jest.fn() };
const zaloTemplates = { findById: jest.fn() };
const emailSenders = { findEmailSettingsById: jest.fn() };
const zaloSenders = { findCampaignZaloAccount: jest.fn() };
const aiResources = { getCourses: jest.fn(), getLandingPickerOptions: jest.fn() };
const estimateForScript = jest.fn();

jest.unstable_mockModule('../../../repositories/ai/aiCampaignDraft.repository.js', () => ({ default: draftRepo }));
jest.unstable_mockModule('../../../repositories/email/emailTemplate.repository.js', () => ({ default: emailTemplates }));
jest.unstable_mockModule('../../../repositories/zalo/zaloTemplate.repository.js', () => ({ default: zaloTemplates }));
jest.unstable_mockModule('../../../repositories/campaign/campaignEmailSender.repository.js', () => ({ default: emailSenders }));
jest.unstable_mockModule('../../../repositories/campaign/campaignZaloSender.repository.js', () => ({ default: zaloSenders }));
// Tra TÊN khoá học của bộ lọc người nhận (F2.2): service import động aiPromptResources — mock đúng ranh giới DB.
jest.unstable_mockModule('../aiPromptResources.service.js', () => ({ default: aiResources }));
// Ước tính thời gian gửi (PLAN_UOC_TINH 4.2): mock đúng ranh giới — service ước tính, hình dạng đầu ra theo hợp đồng PR-1.
jest.unstable_mockModule('../../campaign/campaignEstimate.service.js', () => ({ estimateForScript }));

const service = await import('../campaignConfirmation.service.js');

describe('campaignConfirmation.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    draftRepo.findDefaultEmailSettingId.mockResolvedValue(7);
    draftRepo.findDefaultZaloSettingId.mockResolvedValue(9);
    emailSenders.findEmailSettingsById.mockResolvedValue({ id: 7, email: 'sender@example.test' });
    zaloSenders.findCampaignZaloAccount.mockResolvedValue({ id: 9, display_name: 'Zalo sender', is_active: true });
  });

  it('flattens effective multi-step templates and returns sanitized text', async () => {
    emailTemplates.findById
      .mockResolvedValueOnce({ id: 11, template_name: 'Welcome', subject: 'Hello', body_html: '<p>Welcome <strong>there</strong></p>', updated_at: '2026-08-12T00:00:00.000Z', attachments: '[]' })
      .mockResolvedValueOnce({ id: 12, template_name: 'Follow up', subject: 'Still here?', body_text: 'A plain follow-up', updated_at: '2026-08-12T00:00:00.000Z', attachments: '[]' });

    const result = await service.default.buildConfirmationView({
      userId: 1,
      script: {
        campaignName: 'Launch',
        nodes: [{
          tempId: 'email-1', nodeType: 'action', nodeSubtype: 'send_email', nodeName: 'Email sequence',
          config: { emailSteps: [{ templateId: 11 }, { templateId: 12, delayValue: 2, delayUnit: 'days' }] },
        }],
      },
    });

    expect(result.readyToCreate).toBe(true);
    expect(result.steps).toHaveLength(2);
    expect(result.steps[0].content.bodyText).toBe('Welcome there');
    expect(result.steps[1].timing).toMatchObject({ value: 2, unit: 'days' });
    expect(result.steps[0]).not.toHaveProperty('recipientEmails');
  });

  it('allows multi-step Zalo and Email actions with inline messages (without templateId)', async () => {
    const result = await service.default.buildConfirmationView({
      userId: 1,
      script: {
        campaignName: 'Zalo Group Launch',
        nodes: [
          {
            tempId: 'zalo-group-1',
            nodeType: 'action',
            nodeSubtype: 'send_zalo_group',
            nodeName: 'Zalo Nhóm',
            config: {
              zaloGroupTemplateSteps: [
                { message: 'Tin 1 chào nhóm', delayValue: 0, delayUnit: 'days' },
                { message: 'Tin 2 ưu đãi đặc biệt', delayValue: 1, delayUnit: 'days' },
              ],
            },
          },
          {
            tempId: 'email-inline-1',
            nodeType: 'action',
            nodeSubtype: 'send_email',
            nodeName: 'Email Inline',
            config: {
              emailSteps: [
                { emailSubject: 'Tiêu đề email inline', emailBody: '<p>Nội dung email inline</p>', delayValue: 0, delayUnit: 'days' },
              ],
            },
          },
        ],
      },
    });

    expect(result.readyToCreate).toBe(true);
    expect(result.blockingIssues).toHaveLength(0);
    expect(result.steps).toHaveLength(3);
    expect(result.steps[0].content.bodyText).toBe('Tin 1 chào nhóm');
    expect(result.steps[1].content.bodyText).toBe('Tin 2 ưu đãi đặc biệt');
    expect(result.steps[2].content.bodyText).toBe('Nội dung email inline');
    expect(result.steps[2].content.subject).toBe('Tiêu đề email inline');
  });

  /**
   * Sự cố 09/09 14:37 (PLAN_GUI_NHANH_MOI_KENH PR-2, Bẫy 8): wizard/compiler luôn sinh
   * zaloGroupSource 'node' + get_all_groups, nhóm đã chọn nằm ở zaloGroupIds/zaloSelectedGroupIds
   * trên node gửi. Trước đây mode luôn 'source' → cổng Gửi nhanh không bao giờ mở cho Zalo nhóm.
   */
  it('zalo_group nguồn "node" nhưng node gửi đã có zaloSelectedGroupIds → recipients.mode "manual", count đúng, không sourceLabel', async () => {
    const result = await service.default.buildConfirmationView({
      userId: 1,
      script: {
        campaignName: 'Gửi ngay nhóm',
        nodes: [
          { tempId: 'grp-1', nodeType: 'data', nodeSubtype: 'get_all_groups', nodeName: 'Lấy thông tin nhóm Zalo', config: {} },
          {
            tempId: 'send-1',
            nodeType: 'action',
            nodeSubtype: 'send_zalo_group',
            nodeName: 'Gửi tin nhắn nhóm Zalo',
            config: {
              zaloGroupSource: 'node',
              zaloGroupNodeId: 'grp-1',
              zaloGroupIds: ['g-111', 'g-222', ' g-111 '],
              zaloSelectedGroupIds: ['g-111', 'g-222', ' g-111 '],
              zaloGroupTemplateSteps: [{ message: 'Chào cả nhà', delayValue: 0, delayUnit: 'days' }],
            },
          },
        ],
      },
    });

    expect(result.readyToCreate).toBe(true);
    expect(result.blockingIssues).toHaveLength(0);
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].recipients).toMatchObject({ mode: 'manual', type: null, count: 2, sourceLabel: null });
  });

  it('zalo_group nguồn "node" KHÔNG có nhóm chọn sẵn → vẫn "source" kèm tên node nguồn (fail-closed, không mở Gửi nhanh)', async () => {
    const result = await service.default.buildConfirmationView({
      userId: 1,
      script: {
        campaignName: 'Nhóm chưa chọn',
        nodes: [
          { tempId: 'grp-1', nodeType: 'data', nodeSubtype: 'get_all_groups', nodeName: 'Lấy thông tin nhóm Zalo', config: {} },
          {
            tempId: 'send-1',
            nodeType: 'action',
            nodeSubtype: 'send_zalo_group',
            nodeName: 'Gửi tin nhắn nhóm Zalo',
            config: {
              zaloGroupSource: 'node',
              zaloGroupNodeId: 'grp-1',
              zaloGroupTemplateSteps: [{ message: 'Chào cả nhà', delayValue: 0, delayUnit: 'days' }],
            },
          },
        ],
      },
    });

    expect(result.readyToCreate).toBe(true);
    expect(result.steps[0].recipients).toMatchObject({ mode: 'source', count: null, sourceLabel: 'Lấy thông tin nhóm Zalo' });
  });

  it('zalo_group nguồn "manual" với chuỗi id → mode "manual", count theo chuỗi (hành vi cũ giữ nguyên)', async () => {
    const result = await service.default.buildConfirmationView({
      userId: 1,
      script: {
        campaignName: 'Manual cũ',
        nodes: [{
          tempId: 'send-1',
          nodeType: 'action',
          nodeSubtype: 'send_zalo_group',
          nodeName: 'Gửi nhóm',
          config: { zaloGroupSource: 'manual', zaloGroupIds: 'g-1, g-2, g-3', zaloGroupMessage: 'Hello' },
        }],
      },
    });
    expect(result.steps[0].recipients).toMatchObject({ mode: 'manual', count: 3 });
  });

  it('blocks a multi-step action with neither templateId nor message content', async () => {
    const result = await service.default.buildConfirmationView({
      userId: 1,
      script: {
        nodes: [{
          tempId: 'zalo-1', nodeType: 'action', nodeSubtype: 'send_zalo_personal',
          config: { zaloPersonalTemplateSteps: [{ templateId: null, message: '' }] },
        }],
      },
    });

    expect(result.readyToCreate).toBe(false);
    expect(result.steps).toHaveLength(0);
    expect(result.blockingIssues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'missing_message_content', nodeId: 'zalo-1', stepIndex: 0 }),
    ]));
  });

  it('blocks a multi-step action with invalid templateId string', async () => {
    const result = await service.default.buildConfirmationView({
      userId: 1,
      script: {
        nodes: [{
          tempId: 'zalo-2', nodeType: 'action', nodeSubtype: 'send_zalo_personal',
          config: { zaloPersonalTemplateSteps: [{ templateId: 'not-a-number' }] },
        }],
      },
    });

    expect(result.readyToCreate).toBe(false);
    expect(result.steps).toHaveLength(0);
    expect(result.blockingIssues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'invalid_template_step', nodeId: 'zalo-2', stepIndex: 0 }),
    ]));
  });

  /**
   * F2.2 (rà soát C P1-3): thẻ xác nhận chỉ ghi "Lấy dữ liệu khách hàng" nên người dùng không thể thấy email sắp đi tới ai.
   * Nay `recipients.filters` mang bộ lọc của node nguồn "khách trong DB" (kèm TÊN khoá học) để FE hiện lên thẻ.
   */
  describe('recipients.filters — bộ lọc người nhận của node khách DB', () => {
    const emailScript = (audienceConfig) => ({
      campaignName: 'Email khách đã mua',
      nodes: [
        { tempId: 'aud-1', nodeType: 'data', nodeSubtype: 'interested_customers', nodeName: 'Lấy dữ liệu khách hàng', config: audienceConfig },
        {
          tempId: 'email-1', nodeType: 'action', nodeSubtype: 'send_email', nodeName: 'Gửi email',
          config: {
            recipientSource: 'node', recipientNodeId: 'aud-1', recipientField: 'email',
            emailSteps: [{ emailSubject: 'Mời học tiếp', emailBody: '<p>Xin chào</p>', delayValue: 0, delayUnit: 'days' }],
          },
        },
      ],
    });

    beforeEach(() => {
      aiResources.getCourses.mockResolvedValue([
        { id: 3, name: 'Khoá Excel nâng cao' },
        { id: 4, name: 'Khoá Photoshop & Thiết kế' },
      ]);
    });

    it('"đã mua khoá 3 nhưng chưa mua khoá 4, tối đa 50 khách" → filters có loại khách, tên khoá, khoá trừ, giới hạn', async () => {
      const result = await service.default.buildConfirmationView({
        userId: 1,
        ownerUserId: 1,
        script: emailScript({ interestedCustomerType: 'purchased', interestedCourseIds: [3], notPurchasedCourseIds: [4], interestedLimit: 50 }),
      });

      expect(result.steps[0].recipients.sourceLabel).toBe('Lấy dữ liệu khách hàng');
      expect(result.steps[0].recipients.filters).toEqual({
        customerType: 'purchased',
        limit: 50,
        courses: [{ id: 3, name: 'Khoá Excel nâng cao' }],
        excludedCourses: [{ id: 4, name: 'Khoá Photoshop & Thiết kế' }],
      });
      expect(aiResources.getCourses).toHaveBeenCalledWith(1);
    });

    it('khoá không có trong danh sách của chủ (id lạ) → vẫn hiện bộ lọc theo id, name = null', async () => {
      const result = await service.default.buildConfirmationView({
        userId: 1,
        script: emailScript({ interestedCustomerType: 'both', interestedCourseIds: [999] }),
      });

      expect(result.steps[0].recipients.filters).toMatchObject({ customerType: null, courses: [{ id: 999, name: null }] });
    });

    it('tra tên khoá lỗi (DB sập) → thẻ KHÔNG vỡ, vẫn hiện bộ lọc bằng id', async () => {
      aiResources.getCourses.mockRejectedValue(new Error('db down'));
      const result = await service.default.buildConfirmationView({
        userId: 1,
        script: emailScript({ interestedCourseIds: [3] }),
      });

      expect(result.readyToCreate).toBe(true);
      expect(result.steps[0].recipients.filters.courses).toEqual([{ id: 3, name: null }]);
    });

    it('KHÔNG có bộ lọc ("both"/1000, mảng rỗng) → không có trường filters, không tra DB', async () => {
      const result = await service.default.buildConfirmationView({
        userId: 1,
        script: emailScript({ interestedCustomerType: 'both', interestedLimit: 1000, interestedCourseIds: [], notPurchasedCourseIds: [] }),
      });

      expect(result.steps[0].recipients).not.toHaveProperty('filters');
      expect(aiResources.getCourses).not.toHaveBeenCalled();
    });

    it('chuỗi nhiều bước cùng một node nguồn → chỉ tra tên khoá MỘT lần', async () => {
      const script = emailScript({ interestedCustomerType: 'purchased', interestedCourseIds: [3] });
      script.nodes[1].config.emailSteps.push({ emailSubject: 'Nhắc lại', emailBody: '<p>Nhắc</p>', delayValue: 2, delayUnit: 'days' });
      const result = await service.default.buildConfirmationView({ userId: 1, script });

      expect(result.steps).toHaveLength(2);
      expect(result.steps[1].recipients.filters.courses[0].name).toBe('Khoá Excel nâng cao');
      expect(aiResources.getCourses).toHaveBeenCalledTimes(1);
    });

    it('người nhận nhập tay → không có filters', async () => {
      const result = await service.default.buildConfirmationView({
        userId: 1,
        script: {
          campaignName: 'Nhập tay',
          nodes: [{
            tempId: 'email-1', nodeType: 'action', nodeSubtype: 'send_email',
            config: { recipientSource: 'manual', recipientEmails: 'a@x.vn', emailSteps: [{ emailSubject: 'S', emailBody: '<p>B</p>' }] },
          }],
        },
      });

      expect(result.steps[0].recipients).toMatchObject({ mode: 'manual' });
      expect(result.steps[0].recipients).not.toHaveProperty('filters');
    });
  });
});

/**
 * Rà soát C P2-7 — nguồn người nhận là node `read_landing_leads`: thẻ ghi TRANG NÀO + bao nhiêu lead; node slug rỗng (= mọi lead của
 * mọi landing) chỉ hợp lệ khi người dùng đã chọn tường minh "Tất cả landing" (`script.landingLeadsAll`).
 * Mock `getLandingPickerOptions` giữ ĐÚNG hình dạng thật của service (`{ landings: [{ slug, title, formId, leadCount, formConsentedCount }], totalLeads }`).
 */
describe('C P2-7 — recipients.landing: thẻ xác nhận nói rõ landing nào + số lead', () => {
  const PICKER = {
    totalLeads: 205,
    landings: [
      { slug: 'khoa-ielts', title: 'Khoá IELTS', isPublished: true, formId: null, leadCount: 120, formConsentedCount: 0 },
      { slug: 'khoa-toeic', title: 'Khoá TOEIC', isPublished: true, formId: null, leadCount: 80, formConsentedCount: 0 },
      { slug: 'dat-lich', title: 'Đặt lịch', isPublished: true, formId: 3, leadCount: 0, formConsentedCount: 15 },
    ],
  };
  const emailScript = (slugs, extra = {}) => ({
    campaignName: 'Email người đăng ký',
    ...extra,
    nodes: [
      { tempId: 'aud-1', nodeType: 'data', nodeSubtype: 'read_landing_leads', nodeName: 'Lead từ Landing Page', config: { landingLeadsSlugs: slugs } },
      {
        tempId: 'email-1', nodeType: 'action', nodeSubtype: 'send_email', nodeName: 'Gửi email',
        config: {
          recipientSource: 'node', recipientNodeId: 'aud-1', recipientField: 'email',
          emailSteps: [{ emailSubject: 'Mời', emailBody: '<p>Xin chào</p>' }],
        },
      },
    ],
  });

  beforeEach(() => {
    jest.clearAllMocks();
    draftRepo.findDefaultEmailSettingId.mockResolvedValue(7);
    emailSenders.findEmailSettingsById.mockResolvedValue({ id: 7, email: 'sender@example.test' });
    aiResources.getLandingPickerOptions.mockResolvedValue(PICKER);
  });

  it('chọn 2 landing → ghi tên + số lead từng trang; không có cờ "all"; thẻ sẵn sàng tạo', async () => {
    const result = await service.default.buildConfirmationView({ userId: 1, ownerUserId: 1, script: emailScript(['khoa-ielts', 'khoa-toeic']) });

    expect(result.readyToCreate).toBe(true);
    expect(result.steps[0].recipients.landing).toEqual({
      all: false,
      totalLeads: 205,
      pages: [
        { slug: 'khoa-ielts', title: 'Khoá IELTS', recipientCount: 120 },
        { slug: 'khoa-toeic', title: 'Khoá TOEIC', recipientCount: 80 },
      ],
    });
    expect(aiResources.getLandingPickerOptions).toHaveBeenCalledWith(1);
  });

  it('landing thu bằng Biểu mẫu → recipientCount là số bài nộp đã đồng ý của form, không phải bảng leads', async () => {
    const result = await service.default.buildConfirmationView({ userId: 1, script: emailScript(['dat-lich']) });

    expect(result.steps[0].recipients.landing.pages).toEqual([{ slug: 'dat-lich', title: 'Đặt lịch', recipientCount: 15 }]);
  });

  it('slug không có trong danh sách (landing đã xoá) → vẫn hiện slug, title/recipientCount = null (không ẩn)', async () => {
    const result = await service.default.buildConfirmationView({ userId: 1, script: emailScript(['da-xoa']) });

    expect(result.steps[0].recipients.landing.pages).toEqual([{ slug: 'da-xoa', title: null, recipientCount: null }]);
  });

  it('slug rỗng + người dùng ĐÃ chọn tường minh "Tất cả" (landingLeadsAll) → hợp lệ, hiện tổng lead', async () => {
    const result = await service.default.buildConfirmationView({ userId: 1, script: emailScript([], { landingLeadsAll: true }) });

    expect(result.readyToCreate).toBe(true);
    expect(result.blockingIssues).toEqual([]);
    expect(result.steps[0].recipients.landing).toEqual({ all: true, totalLeads: 205, pages: [] });
  });

  it('slug rỗng mà KHÔNG có dấu "Tất cả" (= mọi lead của mọi landing, người dùng chưa chọn) → CHẶN tạo: landing_audience_unchosen', async () => {
    const result = await service.default.buildConfirmationView({ userId: 1, script: emailScript([]) });

    expect(result.readyToCreate).toBe(false);
    expect(result.blockingIssues).toEqual([
      { code: 'landing_audience_unchosen', nodeId: 'email-1', stepIndex: null, messageKey: 'aiChatbot.confirmation.landing_audience_unchosen' },
    ]);
  });

  it('chuỗi nhiều bước cùng một node nguồn → chỉ MỘT lỗi chặn và chỉ tra danh sách landing MỘT lần', async () => {
    const script = emailScript([]);
    script.nodes[1].config.emailSteps.push({ emailSubject: 'Nhắc', emailBody: '<p>Nhắc</p>', delayValue: 2, delayUnit: 'days' });
    const result = await service.default.buildConfirmationView({ userId: 1, script });

    expect(result.steps).toHaveLength(2);
    expect(result.blockingIssues.filter((i) => i.code === 'landing_audience_unchosen')).toHaveLength(1);
    expect(aiResources.getLandingPickerOptions).toHaveBeenCalledTimes(1);
  });

  it('tra tên landing lỗi → thẻ KHÔNG vỡ; vẫn hiện slug và không bịa số lead', async () => {
    aiResources.getLandingPickerOptions.mockRejectedValue(new Error('db down'));
    const result = await service.default.buildConfirmationView({ userId: 1, script: emailScript(['khoa-ielts']) });

    expect(result.readyToCreate).toBe(true);
    expect(result.steps[0].recipients.landing).toEqual({
      all: false,
      totalLeads: null,
      pages: [{ slug: 'khoa-ielts', title: null, recipientCount: null }],
    });
  });

  it('nguồn khách DB / nhập tay → không có recipients.landing và không tra danh sách landing', async () => {
    const script = emailScript([]);
    script.nodes[0] = { tempId: 'aud-1', nodeType: 'data', nodeSubtype: 'interested_customers', nodeName: 'Khách', config: {} };
    const result = await service.default.buildConfirmationView({ userId: 1, script });

    expect(result.steps[0].recipients).not.toHaveProperty('landing');
    expect(aiResources.getLandingPickerOptions).not.toHaveBeenCalled();
  });
});

/**
 * G3a.3 (C P1-7) — thẻ xác nhận của NHÂN VIÊN. Tài khoản Email/Zalo và mẫu tin thuộc CHỦ workspace (nhân viên dùng chung):
 * các repo chỉ lọc `id_user = $x` nên phải được hỏi bằng id CHỦ. Bản cũ hỏi bằng id nhân viên → mọi tài khoản/mẫu của chủ
 * "không tồn tại" → `missing_sender` / `template_not_found` → INVALID_DRAFT_RESOURCES, nhân viên không tạo được chiến dịch
 * Email/Zalo qua trợ lý (Telegram/WhatsApp vốn đã dùng id chủ).
 *
 * Mock giữ ĐÚNG hành vi lọc chủ của repo thật (trả hàng khi hỏi bằng id chủ, null khi hỏi bằng id khác) để ca đỏ khi service
 * hỏi nhầm id — không chỉ so tham số gọi.
 */
describe('G3a.3 — nhân viên: tài khoản gửi + mẫu tin tra theo CHỦ workspace', () => {
  const EMPLOYEE = 55;
  const OWNER = 101;
  const UPDATED_AT = '2026-10-01T00:00:00.000Z';

  beforeEach(() => {
    // Mọi tài khoản/mẫu đều của OWNER: hỏi bằng id nào khác OWNER thì repo thật cũng trả rỗng.
    draftRepo.findDefaultEmailSettingId.mockImplementation(async (uid) => (uid === OWNER ? 7 : null));
    draftRepo.findDefaultZaloSettingId.mockImplementation(async (uid) => (uid === OWNER ? 9 : null));
    emailSenders.findEmailSettingsById.mockImplementation(async (id, uid) => (uid === OWNER && id === 7 ? { id: 7, email: 'chu@example.test' } : null));
    zaloSenders.findCampaignZaloAccount.mockImplementation(async (id, uid) => (
      uid === OWNER && id === 9 ? { id: 9, display_name: 'Zalo của chủ', is_active: true } : null
    ));
    emailTemplates.findById.mockImplementation(async ({ id, userId }) => (
      userId === OWNER && id === 11 ? { id: 11, template_name: 'Mẫu của chủ', subject: 'Chào', body_html: '<p>Nội dung</p>', updated_at: UPDATED_AT, attachments: '[]' } : null
    ));
    zaloTemplates.findById.mockImplementation(async ({ id, userId }) => (
      userId === OWNER && id === 21 ? { id: 21, template_name: 'Zalo của chủ', body_text: 'Chào bạn', updated_at: UPDATED_AT, attachments: '[]' } : null
    ));
  });

  const emailScript = (config = {}) => ({
    campaignName: 'Email của nhân viên',
    nodes: [{
      tempId: 'email-1', nodeType: 'action', nodeSubtype: 'send_email', nodeName: 'Gửi email',
      config: { emailSteps: [{ templateId: 11 }], ...config },
    }],
  });
  const zaloScript = (config = {}) => ({
    campaignName: 'Zalo của nhân viên',
    nodes: [{
      tempId: 'zalo-1', nodeType: 'action', nodeSubtype: 'send_zalo_personal', nodeName: 'Gửi Zalo',
      config: { zaloPersonalTemplateSteps: [{ templateId: 21 }], ...config },
    }],
  });

  it('Email: tài khoản gửi + mẫu của chủ được nhận ra khi nhân viên thao tác (không còn missing_sender / template_not_found)', async () => {
    const result = await service.default.buildConfirmationView({
      userId: EMPLOYEE,
      ownerUserId: OWNER,
      script: emailScript({ fromEmailId: 7 }),
    });

    expect(result.readyToCreate).toBe(true);
    expect(result.blockingIssues).toHaveLength(0);
    expect(emailSenders.findEmailSettingsById).toHaveBeenCalledWith(7, OWNER);
    expect(emailTemplates.findById).toHaveBeenCalledWith({ id: 11, userId: OWNER, isAdmin: false });
  });

  it('Email: node chưa chọn tài khoản → mặc định lấy của CHỦ (findDefaultEmailSettingId(chủ))', async () => {
    const result = await service.default.buildConfirmationView({
      userId: EMPLOYEE,
      ownerUserId: OWNER,
      script: emailScript(),
    });

    expect(result.readyToCreate).toBe(true);
    expect(draftRepo.findDefaultEmailSettingId).toHaveBeenCalledWith(OWNER);
    expect(draftRepo.findDefaultEmailSettingId).not.toHaveBeenCalledWith(EMPLOYEE);
    expect(emailSenders.findEmailSettingsById).toHaveBeenCalledWith(7, OWNER);
  });

  it('Zalo cá nhân: tài khoản + mẫu của chủ được nhận ra (explicit và mặc định)', async () => {
    const explicit = await service.default.buildConfirmationView({
      userId: EMPLOYEE,
      ownerUserId: OWNER,
      script: zaloScript({ zaloAccountId: 9 }),
    });
    expect(explicit.readyToCreate).toBe(true);
    expect(zaloSenders.findCampaignZaloAccount).toHaveBeenCalledWith(9, OWNER, false);
    expect(zaloTemplates.findById).toHaveBeenCalledWith({ id: 21, userId: OWNER, isAdmin: false });

    const byDefault = await service.default.buildConfirmationView({
      userId: EMPLOYEE,
      ownerUserId: OWNER,
      script: zaloScript(),
    });
    expect(byDefault.readyToCreate).toBe(true);
    expect(draftRepo.findDefaultZaloSettingId).toHaveBeenCalledWith(OWNER);
    expect(draftRepo.findDefaultZaloSettingId).not.toHaveBeenCalledWith(EMPLOYEE);
  });

  it('fail-closed: tài khoản/mẫu của workspace KHÁC vẫn bị chặn (missing_sender / template_not_found)', async () => {
    const result = await service.default.buildConfirmationView({
      userId: EMPLOYEE,
      ownerUserId: OWNER,
      script: emailScript({ fromEmailId: 8, emailSteps: [{ templateId: 99 }] }),
    });

    expect(result.readyToCreate).toBe(false);
    expect(result.blockingIssues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'missing_sender', nodeId: 'email-1' }),
      expect.objectContaining({ code: 'template_not_found', nodeId: 'email-1' }),
    ]));
  });

  it('chủ tự thao tác (không truyền ownerUserId): vẫn tra theo id của mình — hành vi cũ giữ nguyên', async () => {
    const result = await service.default.buildConfirmationView({
      userId: OWNER,
      script: emailScript({ fromEmailId: 7 }),
    });

    expect(result.readyToCreate).toBe(true);
    expect(emailSenders.findEmailSettingsById).toHaveBeenCalledWith(7, OWNER);
    expect(emailTemplates.findById).toHaveBeenCalledWith({ id: 11, userId: OWNER, isAdmin: false });
  });

  describe('assertResourceVersionsCurrent', () => {
    it('nhân viên: tra mẫu theo CHỦ — mẫu còn nguyên thì không ném PREPARE_STALE oan', async () => {
      await expect(service.default.assertResourceVersionsCurrent({
        userId: EMPLOYEE,
        ownerUserId: OWNER,
        resourceVersions: [
          { kind: 'email_template', id: 11, updatedAt: UPDATED_AT },
          { kind: 'zalo_template', id: 21, updatedAt: UPDATED_AT },
        ],
      })).resolves.toBeUndefined();

      expect(emailTemplates.findById).toHaveBeenCalledWith({ id: 11, userId: OWNER, isAdmin: false });
      expect(zaloTemplates.findById).toHaveBeenCalledWith({ id: 21, userId: OWNER, isAdmin: false });
    });

    it('mẫu đã đổi sau khi chụp phiên bản → vẫn ném 409 PREPARE_STALE (kiểm hạn không bị nới)', async () => {
      await expect(service.default.assertResourceVersionsCurrent({
        userId: EMPLOYEE,
        ownerUserId: OWNER,
        resourceVersions: [{ kind: 'email_template', id: 11, updatedAt: '2026-09-01T00:00:00.000Z' }],
      })).rejects.toMatchObject({ code: 'PREPARE_STALE', statusCode: 409 });
    });

    it('không truyền ownerUserId: tra theo userId như cũ', async () => {
      await expect(service.default.assertResourceVersionsCurrent({
        userId: OWNER,
        resourceVersions: [{ kind: 'email_template', id: 11, updatedAt: UPDATED_AT }],
      })).resolves.toBeUndefined();
    });
  });
});

describe('estimate — ước tính thời gian gửi trên thẻ xác nhận (PLAN_UOC_TINH 4.2)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    draftRepo.findDefaultEmailSettingId.mockResolvedValue(7);
    emailSenders.findEmailSettingsById.mockResolvedValue({ id: 7, email: 'sender@example.test' });
    estimateForScript.mockReset();
  });

  const OWNER = 39;
  const ESTIMATE = {
    startAt: '2026-10-05T00:00:00.000Z', finishAtEarliest: '2026-10-07T00:25:00.000Z', finishAtTypical: '2026-10-08T15:52:00.000Z',
    finishAtLatest: '2026-10-08T14:25:00.000Z', totalActions: 1596, perNode: [], perDay: [], accounts: [],
    warnings: [{ code: 'multi_day', params: { days: 4 } }],
  };
  const emailScript = () => ({
    campaignName: 'Mail',
    nodes: [{
      tempId: 'email-1', nodeType: 'action', nodeSubtype: 'send_email', nodeName: 'Email',
      config: { recipientSource: 'node', recipientNodeId: 'sheet-1', emailSteps: [{ emailSubject: 'Hi', emailBody: 'Xin chào' }] },
    }, { tempId: 'sheet-1', nodeType: 'data', nodeSubtype: 'read_sheet', config: {} }],
    connections: [{ sourceNodeId: 'sheet-1', targetNodeId: 'email-1' }],
  });

  it('không xin includeEstimate → KHÔNG có trường estimate và KHÔNG gọi bộ ước tính (nơi dựng thẻ chỉ để kiểm quyền không tốn đếm người nhận)', async () => {
    const result = await service.default.buildConfirmationView({ userId: OWNER, script: emailScript() });
    expect(result).not.toHaveProperty('estimate');
    expect(estimateForScript).not.toHaveBeenCalled();
  });

  it('includeEstimate + thẻ hợp lệ → estimate = đầu ra estimateForScript; gọi với nodes/connections của kịch bản, chủ workspace, bắt đầu = bây giờ; readyToCreate không đổi vì cảnh báo', async () => {
    estimateForScript.mockResolvedValue(ESTIMATE);
    const script = emailScript();
    const result = await service.default.buildConfirmationView({ userId: 7, ownerUserId: OWNER, script, includeEstimate: true });

    expect(result.estimate).toEqual(ESTIMATE);
    expect(result.readyToCreate).toBe(true);
    const arg = estimateForScript.mock.calls[0][0];
    expect(arg.script.nodes).toBe(script.nodes);
    expect(arg.script.connections).toBe(script.connections);
    expect(arg.ownerUserId).toBe(OWNER);
    expect(arg.startAt).toBeInstanceOf(Date);
    expect(Math.abs(arg.startAt.getTime() - Date.now())).toBeLessThan(5000);
  });

  it('ước tính NÉM lỗi → estimate: null, thẻ không vỡ, vẫn readyToCreate', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      estimateForScript.mockRejectedValue(new Error('sheet down'));
      const result = await service.default.buildConfirmationView({ userId: OWNER, script: emailScript(), includeEstimate: true });
      expect(result.estimate).toBeNull();
      expect(result.readyToCreate).toBe(true);
      expect(result.steps).toHaveLength(1);
    } finally {
      warn.mockRestore();
    }
  });

  it('ước tính treo quá hạn (Sheet chậm) → estimate: null thay vì treo thẻ', async () => {
    jest.useFakeTimers();
    try {
      estimateForScript.mockReturnValue(new Promise(() => {}));
      const pending = service.default.buildConfirmationView({ userId: OWNER, script: emailScript(), includeEstimate: true });
      await jest.advanceTimersByTimeAsync(30_000);
      const result = await pending;
      expect(result.estimate).toBeNull();
      expect(result.readyToCreate).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });

  it('thẻ còn lỗi chặn (thiếu tài khoản gửi) → estimate: null và không gọi bộ ước tính (số liệu chưa đủ để ước tính)', async () => {
    emailSenders.findEmailSettingsById.mockResolvedValue(null);
    const result = await service.default.buildConfirmationView({ userId: OWNER, script: emailScript(), includeEstimate: true });
    expect(result.readyToCreate).toBe(false);
    expect(result.estimate).toBeNull();
    expect(estimateForScript).not.toHaveBeenCalled();
  });
});
