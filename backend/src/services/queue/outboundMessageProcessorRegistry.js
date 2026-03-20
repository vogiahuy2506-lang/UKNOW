import outboundMessageQueueService, {
  OUTBOUND_MESSAGE_JOB_TYPES,
} from './outboundMessageQueue.service.js';
import campaignEmailSenderService from '../campaign/campaignEmailSender.service.js';
import campaignZaloSenderService from '../campaign/campaignZaloSender.service.js';
import campaignNodeDataService from '../campaign/campaignNodeData.service.js';

let registered = false;

/**
 * Đăng ký toàn bộ processor xử lý job outbound cho BullMQ.
 * Hàm này chỉ chạy một lần để tránh đăng ký trùng handler.
 */
export const registerOutboundMessageProcessors = () => {
  if (registered) return;

  outboundMessageQueueService.registerProcessor(
    OUTBOUND_MESSAGE_JOB_TYPES.EMAIL_SEND,
    async (payload) => campaignEmailSenderService.sendEmailToCustomerDirect(
      payload?.actionNode,
      payload?.customer,
      payload?.campaign,
      payload?.runId,
      payload?.retryMeta
    )
  );

  outboundMessageQueueService.registerProcessor(
    OUTBOUND_MESSAGE_JOB_TYPES.ZALO_PERSONAL_SEND,
    async (payload) => campaignZaloSenderService.sendPersonalMessageByQueue(payload)
  );

  outboundMessageQueueService.registerProcessor(
    OUTBOUND_MESSAGE_JOB_TYPES.ZALO_GROUP_SEND,
    async (payload) => campaignZaloSenderService.sendGroupMessageByQueue(payload)
  );

  outboundMessageQueueService.registerProcessor(
    OUTBOUND_MESSAGE_JOB_TYPES.ZALO_FRIEND_REQUEST_SEND,
    async (payload) => campaignZaloSenderService.sendFriendRequestByQueue(payload)
  );

  outboundMessageQueueService.registerProcessor(
    OUTBOUND_MESSAGE_JOB_TYPES.CUSTOMER_SAVE,
    async (payload) => campaignNodeDataService.saveCustomersFromCampaignDirect(
      payload?.customers,
      payload?.campaignId,
      payload?.userId,
      payload?.saveNode,
      payload?.runId
    )
  );

  registered = true;
};
