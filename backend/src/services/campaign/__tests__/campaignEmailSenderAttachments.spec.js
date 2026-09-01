import { jest, describe, it, expect, beforeEach } from '@jest/globals';

jest.unstable_mockModule('../../../utils/userSendLimit.util.js', () => ({
  checkSendQuota: jest.fn().mockResolvedValue({ allowed: true }),
  recordDirectSendUsage: jest.fn().mockResolvedValue(),
}));

const { default: campaignEmailSenderService } = await import('../campaignEmailSender.service.js');
const { default: emailSettingsController } = await import('../../../controllers/emailSettings.controller.js');
const { default: campaignEmailSenderRepository } = await import('../../../repositories/campaign/campaignEmailSender.repository.js');

describe('Finding 1: campaignEmailSenderService đọc attachments khi không dùng template', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(campaignEmailSenderRepository, 'incrementEmailSettingsSentCount').mockResolvedValue();
    jest.spyOn(emailSettingsController, 'logEmailSent').mockResolvedValue();
  });

  const dummyAttachment = {
    key: 'uploads/1/tailieu.pdf',
    name: 'tailieu.pdf',
    size: 1024,
    contentType: 'application/pdf',
  };

  it('đọc attachments từ emailSteps[0].attachments khi templateId là null', async () => {
    const actionNode = {
      id: 'node_send_email_1',
      config: {
        fromEmailId: 1,
        emailSteps: [
          {
            templateId: null,
            emailSubject: 'Tiêu đề từ compiler',
            emailBody: '<p>Nội dung từ compiler</p>',
            attachments: [dummyAttachment],
          },
        ],
      },
    };

    const customer = { email: 'customer@example.com', full_name: 'Nguyen Van A' };
    const campaign = { id: 10, id_user: 1 };
    const runId = 100;

    jest.spyOn(campaignEmailSenderService, 'resolveRetryScheduleGuard').mockReturnValue({ remainingDelayMs: 0 });
    jest.spyOn(campaignEmailSenderService, 'getTemplateByRunNodeCache').mockResolvedValue(null);
    jest.spyOn(campaignEmailSenderService, 'getEmailSettingsByRunNodeCache').mockResolvedValue({
      id: 1,
      email: 'sender@example.com',
      smtp_host: 'smtp.example.com',
    });

    const buildAttachmentsSpy = jest.spyOn(emailSettingsController, 'buildMailAttachments')
      .mockResolvedValue([{ filename: 'tailieu.pdf', content: Buffer.from('mock') }]);

    let rawEmailParams = null;
    jest.spyOn(campaignEmailSenderService, 'sendRawEmail').mockImplementation(async (params) => {
      rawEmailParams = params;
      return { info: { messageId: 'msg-123' } };
    });

    jest.spyOn(campaignEmailSenderRepository, 'findCustomerByEmail').mockResolvedValue({ id: 99, email: 'customer@example.com' });

    const result = await campaignEmailSenderService.sendEmailToCustomerDirect(
      actionNode,
      customer,
      campaign,
      runId,
      null,
      { emailStep: 1 }
    );

    expect(buildAttachmentsSpy).toHaveBeenCalledWith([dummyAttachment]);
    expect(rawEmailParams).not.toBeNull();
    expect(rawEmailParams.subject).toBe('Tiêu đề từ compiler');
    expect(rawEmailParams.attachments).toHaveLength(1);
    expect(rawEmailParams.attachments[0].filename).toBe('tailieu.pdf');
    expect(result.status).toBe('success');
  });

  it('đọc attachments từ config.attachments cấp node khi emailSteps không có attachments', async () => {
    const actionNode = {
      id: 'node_send_email_2',
      config: {
        fromEmailId: 1,
        emailSubject: 'Tiêu đề config',
        emailBody: '<p>Nội dung config</p>',
        attachments: [dummyAttachment],
      },
    };

    const customer = { email: 'customer2@example.com', full_name: 'Nguyen Van B' };
    const campaign = { id: 11, id_user: 1 };
    const runId = 101;

    jest.spyOn(campaignEmailSenderService, 'resolveRetryScheduleGuard').mockReturnValue({ remainingDelayMs: 0 });
    jest.spyOn(campaignEmailSenderService, 'getTemplateByRunNodeCache').mockResolvedValue(null);
    jest.spyOn(campaignEmailSenderService, 'getEmailSettingsByRunNodeCache').mockResolvedValue({
      id: 1,
      email: 'sender@example.com',
    });

    const buildAttachmentsSpy = jest.spyOn(emailSettingsController, 'buildMailAttachments')
      .mockResolvedValue([{ filename: 'tailieu.pdf', content: Buffer.from('mock') }]);

    let rawEmailParams = null;
    jest.spyOn(campaignEmailSenderService, 'sendRawEmail').mockImplementation(async (params) => {
      rawEmailParams = params;
      return { info: { messageId: 'msg-456' } };
    });

    jest.spyOn(campaignEmailSenderRepository, 'findCustomerByEmail').mockResolvedValue({ id: 100, email: 'customer2@example.com' });

    const result = await campaignEmailSenderService.sendEmailToCustomerDirect(
      actionNode,
      customer,
      campaign,
      runId
    );

    expect(buildAttachmentsSpy).toHaveBeenCalledWith([dummyAttachment]);
    expect(rawEmailParams.attachments).toHaveLength(1);
    expect(result.status).toBe('success');
  });
});
