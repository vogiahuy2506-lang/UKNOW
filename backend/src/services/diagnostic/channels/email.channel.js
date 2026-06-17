import emailSettingsRepository from '../../../repositories/email/emailSettings.repository.js';
import campaignEmailSenderService from '../../campaign/campaignEmailSender.service.js';

class EmailChannel {
  getChannelKey() {
    return 'email';
  }

  async validate({ accountId, userId, roleCode }) {
    const settings = await emailSettingsRepository.getById(userId, accountId, { roleCode });
    if (!settings) {
      throw new Error('Không tìm thấy cấu hình email hoặc bạn không có quyền sử dụng cấu hình này.');
    }
    if (String(settings.status || '').trim() !== 'active') {
      throw new Error('Cấu hình email đã chọn chưa ở trạng thái active.');
    }
  }

  async getApi({ accountId, userId, roleCode }) {
    const settings = await emailSettingsRepository.getById(userId, accountId, { roleCode });
    if (!settings) {
      throw new Error('Không tìm thấy cấu hình email hoặc bạn không có quyền sử dụng cấu hình này.');
    }
    return settings;
  }

  async sendStaged({ api, recipient, message }) {
    const sendStartedAt = Date.now();
    try {
      const result = await campaignEmailSenderService.sendRawEmail({
        settings: api,
        to: recipient,
        subject: 'Diagnostic test',
        html: message,
        text: String(message || '').replace(/<[^>]*>/g, ''),
      });
      return {
        messageId: result.messageId || null,
        lookupMs: null,
        sendMs: Number.isFinite(Number(result.sendMs))
          ? Number(result.sendMs)
          : Date.now() - sendStartedAt,
      };
    } catch (error) {
      error.stage = 'send';
      error.sendMs = Date.now() - sendStartedAt;
      throw error;
    }
  }
}

export default new EmailChannel();
