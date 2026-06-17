import campaignZaloSenderService from '../../campaign/campaignZaloSender.service.js';

class ZaloGroupChannel {
  getChannelKey() {
    return 'zalo_group';
  }

  async validate({ accountId }) {
    campaignZaloSenderService.getConnectedApiOrThrow(accountId);
  }

  async getApi({ accountId, userId }) {
    return campaignZaloSenderService.getConnectedApiOrSyncStatus({ accountId, userId });
  }

  async sendStaged({ api, recipient, message }) {
    const sendStartedAt = Date.now();
    try {
      const result = await campaignZaloSenderService.sendGroupMessage({
        api,
        groupId: recipient,
        message,
        attachments: [],
      });
      return {
        groupId: result.groupId || String(recipient || '').trim(),
        lookupMs: null,
        sendMs: Date.now() - sendStartedAt,
      };
    } catch (error) {
      error.stage = 'send';
      error.sendMs = Date.now() - sendStartedAt;
      error.attempts = Number.parseInt(error?.zaloRetry?.attempt, 10) || null;
      throw error;
    }
  }
}

export default new ZaloGroupChannel();
