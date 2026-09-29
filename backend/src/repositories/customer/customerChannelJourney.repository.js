/**
 * P8b (PLAN_TG_WA_DAY_DU) — hành trình khách (`customer_journey`) cho kênh adapter (WhatsApp): tra khách theo SĐT trong
 * workspace và ghi sự kiện "đã gửi". Khuôn `customerZaloTracking.repository.js#insertZaloSentJourney`.
 */
import db from '../../config/database.js';

class CustomerChannelJourneyRepository {
  /**
   * Khách của workspace có SĐT khớp `phoneDigits` (so 9 chữ số cuối — cùng cách `isLeadPhoneConsentRefused`, chịu được
   * `0912…`/`84912…`/`+84 912…` lưu lẫn lộn). Tra cả `phone` lẫn `zalo_phone`; nhiều khách trùng số -> lấy khách cũ nhất.
   *
   * @param {number|string} workspaceOwnerId
   * @param {string} phoneDigits chỉ chữ số, đã chuẩn hoá (>= 9 số)
   * @returns {Promise<number|null>} id khách hoặc null
   */
  async findCustomerIdByPhone(workspaceOwnerId, phoneDigits) {
    const digits = String(phoneDigits || '').replace(/\D/g, '');
    if (digits.length < 9) return null;
    const result = await db.query(
      `SELECT id
         FROM customers
        WHERE COALESCE(workspace_owner_id, id_user) = $1
          AND (
            RIGHT(regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g'), 9) = $2
            OR RIGHT(regexp_replace(COALESCE(zalo_phone, ''), '[^0-9]', '', 'g'), 9) = $2
          )
        ORDER BY id ASC
        LIMIT 1`,
      [workspaceOwnerId, digits.slice(-9)]
    );
    return result.rows[0]?.id ?? null;
  }

  /**
   * @param {{customerId: number, campaignId: number|null, runId: number|null, nodeId: number|null,
   *   eventType: string, eventChannel: string, eventData: object}} input
   * @returns {Promise<void>}
   */
  async insertChannelSentJourney({ customerId, campaignId, runId, nodeId, eventType, eventChannel, eventData }) {
    await db.query(
      `INSERT INTO customer_journey
         (id_customer, id_campaign, id_run, id_node, event_type, event_channel, event_data, event_at)
       VALUES
         ($1, $2, $3, $4, $5, $6, $7::jsonb, CURRENT_TIMESTAMP)`,
      [customerId, campaignId, runId, nodeId, eventType, eventChannel, JSON.stringify(eventData)]
    );
  }
}

export default new CustomerChannelJourneyRepository();
