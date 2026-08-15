import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const draftRepo = {
  findDefaultEmailSettingId: jest.fn(),
  findDefaultZaloSettingId: jest.fn(),
};
const emailTemplates = { findById: jest.fn() };
const zaloTemplates = { findById: jest.fn() };
const emailSenders = { findEmailSettingsById: jest.fn() };
const zaloSenders = { findCampaignZaloAccount: jest.fn() };

jest.unstable_mockModule('../../../repositories/ai/aiCampaignDraft.repository.js', () => ({ default: draftRepo }));
jest.unstable_mockModule('../../../repositories/email/emailTemplate.repository.js', () => ({ default: emailTemplates }));
jest.unstable_mockModule('../../../repositories/zalo/zaloTemplate.repository.js', () => ({ default: zaloTemplates }));
jest.unstable_mockModule('../../../repositories/campaign/campaignEmailSender.repository.js', () => ({ default: emailSenders }));
jest.unstable_mockModule('../../../repositories/campaign/campaignZaloSender.repository.js', () => ({ default: zaloSenders }));

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
});
