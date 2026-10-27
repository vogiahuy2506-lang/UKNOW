import gettingStartedRepository from '../../repositories/dashboard/gettingStarted.repository.js';
import customerReadRepository from '../../repositories/customer/customerRead.repository.js';

/**
 * Thẻ "3 bước bắt đầu" (PLAN_ONBOARDING_ZALO_VA_THE_3_BUOC_2026-10-27): ba cờ true/false cho CHỦ workspace.
 *
 * - channelConnected: có ít nhất một tài khoản Zalo / Email / Telegram đang dùng được (điều kiện ở repository).
 * - hasCustomers: có ít nhất một khách trong workspace — cùng phạm vi với danh sách khách (`buildCustomerListFilter`).
 * - hasSentMessage: đã từng gửi được ít nhất một tin, theo đúng định nghĩa "đã gửi" của sendStats (`firstSentAtSql`,
 *   KHÔNG đọc `campaign_runs.successful_sends`); tin gửi thử (is_preview) không tính.
 *
 * Ba phép đo chạy song song; phép nào lỗi thì cả lời gọi lỗi (không đoán một cờ "false" làm khách tưởng chưa làm gì).
 *
 * @param {number|string} ownerId chủ workspace
 * @returns {Promise<{ channelConnected: boolean, hasCustomers: boolean, hasSentMessage: boolean }>}
 */
export async function getGettingStarted(ownerId) {
  const [channelConnected, customersTotal, hasSentMessage] = await Promise.all([
    gettingStartedRepository.hasConnectedChannelAccount(ownerId),
    customerReadRepository.countWorkspaceCustomers({ userId: ownerId }),
    gettingStartedRepository.hasSentMessage(ownerId),
  ]);

  return {
    channelConnected: channelConnected === true,
    hasCustomers: Number(customersTotal) > 0,
    hasSentMessage: hasSentMessage === true,
  };
}

export default { getGettingStarted };
