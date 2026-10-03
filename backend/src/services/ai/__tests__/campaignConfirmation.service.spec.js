import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const draftRepo = {
  findDefaultEmailSettingId: jest.fn(),
  findDefaultZaloSettingId: jest.fn(),
};
const emailTemplates = { findById: jest.fn() };
const zaloTemplates = { findById: jest.fn() };
const emailSenders = { findEmailSettingsById: jest.fn() };
const zaloSenders = { findCampaignZaloAccount: jest.fn() };
const aiResources = { getCourses: jest.fn() };

jest.unstable_mockModule('../../../repositories/ai/aiCampaignDraft.repository.js', () => ({ default: draftRepo }));
jest.unstable_mockModule('../../../repositories/email/emailTemplate.repository.js', () => ({ default: emailTemplates }));
jest.unstable_mockModule('../../../repositories/zalo/zaloTemplate.repository.js', () => ({ default: zaloTemplates }));
jest.unstable_mockModule('../../../repositories/campaign/campaignEmailSender.repository.js', () => ({ default: emailSenders }));
jest.unstable_mockModule('../../../repositories/campaign/campaignZaloSender.repository.js', () => ({ default: zaloSenders }));
// Tra TÊN khoá học của bộ lọc người nhận (F2.2): service import động aiPromptResources — mock đúng ranh giới DB.
jest.unstable_mockModule('../aiPromptResources.service.js', () => ({ default: aiResources }));

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
