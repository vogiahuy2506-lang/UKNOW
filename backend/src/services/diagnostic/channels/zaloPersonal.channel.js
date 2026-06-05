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

  async send({ api, recipient, message }) {
    await campaignZaloSenderService.sendPersonalMessage({
      api,
      recipient,
      recipientType: 'phone',
      message,
      attachments: [],
    });
  }
}

export default new ZaloPersonalChannel();
