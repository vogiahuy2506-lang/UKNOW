import gettingStartedRepository from '../../repositories/dashboard/gettingStarted.repository.js';
import customerReadRepository from '../../repositories/customer/customerRead.repository.js';
import sendStats from '../stats/sendStats.service.js';

/**
 * Cửa sổ "đã từng gửi" của sendStats = trần 3660 ngày (`MAX_WINDOW_DAYS`): ngoài trần đó không có tin nào đáng kể.
 * Thẻ hỏi "đã bao giờ gửi chưa" chứ không hỏi "gửi bao nhiêu trong kỳ", nên lấy cửa sổ rộng nhất.
 */
const EVER_SENT_WINDOW_DAYS = 3660;

/**
 * Thẻ "3 bước bắt đầu" (PLAN_ONBOARDING_ZALO_VA_THE_3_BUOC_2026-10-27): ba cờ true/false cho CHỦ workspace.
 *
 * - channelConnected: có ít nhất một tài khoản Zalo / Email / Telegram đang dùng được (điều kiện ở repository).
 * - hasCustomers: có ít nhất một khách trong workspace — cùng phạm vi với danh sách khách (`buildCustomerListFilter`).
 * - hasSentMessage: có ít nhất một tin đã gửi, qua sendStats như mọi số gửi tin trong hệ thống (KHÔNG đọc
 *   `campaign_runs.successful_sends`); tin gửi thử (is_preview) không tính.
 *
 * Ba phép đo chạy song song; phép nào lỗi thì cả lời gọi lỗi (không đoán một cờ "false" làm khách tưởng chưa làm gì).
 *
 * @param {number|string} ownerId chủ workspace
 * @returns {Promise<{ channelConnected: boolean, hasCustomers: boolean, hasSentMessage: boolean }>}
 */
export async function getGettingStarted(ownerId) {
  const [channelConnected, customersTotal, channelTotals] = await Promise.all([
    gettingStartedRepository.hasConnectedChannelAccount(ownerId),
    customerReadRepository.countWorkspaceCustomers({ userId: ownerId }),
    sendStats.getChannelTotals({ ownerId }, { days: EVER_SENT_WINDOW_DAYS }),
  ]);

  return {
    channelConnected: channelConnected === true,
    hasCustomers: Number(customersTotal) > 0,
    hasSentMessage: Array.isArray(channelTotals) && channelTotals.some((row) => Number(row?.sent) > 0),
  };
}

export default { getGettingStarted };
