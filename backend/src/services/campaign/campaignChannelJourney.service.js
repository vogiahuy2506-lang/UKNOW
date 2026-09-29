/**
 * P8b (PLAN_TG_WA_DAY_DU) — ghi `customer_journey` sau khi kênh adapter GỬI THÀNH CÔNG cho một người.
 *
 * Chỉ áp cho kênh có `descriptor.journeyEventType` (WhatsApp: `whatsapp_sent`) VÀ người nhận là SĐT (không phải nhóm):
 * tra `customers` của workspace theo SĐT, CÓ khách mới ghi — không tìm thấy thì KHÔNG ghi gì (không tạo khách mới, không
 * ghi journey mồ côi). Telegram không có SĐT nên không có journey. Không có link theo dõi click (TG/WA không có cơ chế
 * redirect an toàn như email).
 *
 * Journey là ghi chú phụ: MỌI lỗi ở đây chỉ log, không bao giờ làm hỏng lượt gửi (khách đã nhận tin).
 * Dùng event_type riêng (`whatsapp_sent`), KHÔNG dùng `zalo_sent`: hạn mức Zalo đã cộng tin adapter từ
 * `campaign_channel_messages` (user.repository.js findProfileUsageCounts) — ghi `zalo_sent` sẽ đếm đôi.
 */
import customerChannelJourneyRepository from '../../repositories/customer/customerChannelJourney.repository.js';

/** `id_node` là BIGINT; id node trình dựng có thể là chuỗi không số -> null thay vì làm câu INSERT nổ. */
function toBigintOrNull(value) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/**
 * @param {object} input
 * @param {{key: string, journeyEventType?: string, recipientIsPhone?: boolean}} input.descriptor
 * @param {number|string} input.workspaceOwnerId chủ workspace (khách thuộc chủ, không thuộc nhân viên tạo chiến dịch)
 * @param {{recipientKey: string, isGroup?: boolean}} input.recipient
 * @param {number} input.campaignId
 * @param {number} input.runId
 * @param {number|string} input.nodeId
 * @param {number|null} [input.messageId] id dòng `campaign_channel_messages` vừa gửi
 * @param {{repo?: object}} [deps]
 * @returns {Promise<boolean>} true nếu đã ghi journey
 */
export async function recordAdapterSentJourney(
  { descriptor, workspaceOwnerId, recipient, campaignId, runId, nodeId, messageId = null },
  { repo = customerChannelJourneyRepository } = {}
) {
  try {
    if (!descriptor?.journeyEventType || !descriptor.recipientIsPhone) return false;
    if (recipient?.isGroup) return false;
    const owner = Number(workspaceOwnerId);
    if (!Number.isInteger(owner) || owner <= 0) return false;
    const customerId = await repo.findCustomerIdByPhone(owner, recipient?.recipientKey);
    if (customerId == null) return false;
    await repo.insertChannelSentJourney({
      customerId,
      campaignId: toBigintOrNull(campaignId),
      runId: toBigintOrNull(runId),
      nodeId: toBigintOrNull(nodeId),
      eventType: descriptor.journeyEventType,
      eventChannel: descriptor.key,
      eventData: { ccmId: messageId ?? null, nodeId: nodeId ?? null },
    });
    return true;
  } catch (error) {
    console.warn('[CampaignChannelJourney] ghi customer_journey lỗi (bỏ qua):', error?.message);
    return false;
  }
}

export default { recordAdapterSentJourney };
