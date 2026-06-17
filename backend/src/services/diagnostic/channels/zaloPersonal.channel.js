import campaignZaloSenderService from '../../campaign/campaignZaloSender.service.js';

class ZaloPersonalChannel {
  getChannelKey() {
    return 'zalo_personal';
  }

  async validate({ accountId }) {
    campaignZaloSenderService.getConnectedApiOrThrow(accountId);
  }

  async getApi({ accountId, userId }) {
    return campaignZaloSenderService.getConnectedApiOrSyncStatus({ accountId, userId });
  }

  async sendStaged({ api, recipient, recipientType = 'phone', message, dryRun = false }) {
    const normalizedRecipientType = String(recipientType || 'phone').trim().toLowerCase() === 'uid'
      ? 'uid'
      : 'phone';
    const normalizedRecipient = String(recipient || '').trim();

    const lookupStartedAt = Date.now();
    let resolved;
    try {
      resolved = await campaignZaloSenderService.resolveUidFromRecipient({
        api,
        recipient: normalizedRecipient,
        recipientType: normalizedRecipientType,
      });
    } catch (error) {
      error.stage = 'lookup';
      error.lookupMs = Date.now() - lookupStartedAt;
      error.attempts = Number.parseInt(error?.zaloRetry?.attempt, 10) || null;
      throw error;
    }

    const lookupMs = Date.now() - lookupStartedAt;
    if (dryRun === true) {
      return {
        uid: resolved.uid,
        zaloName: resolved.zaloName || null,
        lookupMs,
        sendMs: null,
        dryRun: true,
      };
    }

    const sendStartedAt = Date.now();
    try {
      await campaignZaloSenderService.sendResolvedPersonalMessage({
        api,
        uid: resolved.uid,
        recipient: normalizedRecipient,
        recipientType: normalizedRecipientType,
        zaloName: resolved.zaloName || null,
        message,
        attachments: [],
      });
      return {
        uid: resolved.uid,
        zaloName: resolved.zaloName || null,
        lookupMs,
        sendMs: Date.now() - sendStartedAt,
      };
    } catch (error) {
      error.stage = 'send';
      error.lookupMs = lookupMs;
      error.sendMs = Date.now() - sendStartedAt;
      error.attempts = Number.parseInt(error?.zaloRetry?.attempt, 10) || null;
      throw error;
    }
  }

  async send({ api, recipient, message }) {
    await this.sendStaged({
      api,
      recipient,
      recipientType: 'phone',
      message,
    });
  }
}

export default new ZaloPersonalChannel();
