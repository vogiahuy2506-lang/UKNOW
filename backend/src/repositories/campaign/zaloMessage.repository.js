import db from '../../config/database.js';

/**
 * Tra cứu zalo_messages đã gửi thành công trong campaign run (dedupe resume / crash).
 */
class ZaloMessageRepository {
  /**
   * @param {object} input
   * @param {number} input.runId
   * @param {number} input.campaignId
   * @param {string} input.channel zalo_personal | zalo_group | zalo_friend_request
   * @param {string} input.recipientKey phone, uid, hoặc group_id
   * @param {number} input.zaloStep thứ tự bước 1-based trong node
   * @returns {Promise<{id: number, sent_at: Date|null}|null>}
   */
  async findExistingSentCampaignZaloMessage({
    runId,
    campaignId,
    channel,
    recipientKey,
    zaloStep,
  }) {
    const safeRun = Number.parseInt(runId, 10);
    const safeCampaign = Number.parseInt(campaignId, 10);
    const safeStep = Number.parseInt(zaloStep, 10);
    const safeChannel = String(channel || '').trim();
    const recipient = String(recipientKey || '').trim();
    if (
      !Number.isFinite(safeRun)
      || !Number.isFinite(safeCampaign)
      || !Number.isFinite(safeStep)
      || !safeChannel
      || !recipient
    ) {
      return null;
    }

    const result = await db.query(
      `SELECT id, sent_at
       FROM zalo_messages
       WHERE id_run = $1
         AND id_campaign = $2
         AND channel = $3
         AND COALESCE(tracking_metadata->>'status', '') = 'sent'
         AND (
           LOWER(TRIM(COALESCE(recipient_value, ''))) = LOWER(TRIM($4))
           OR LOWER(TRIM(COALESCE(uid, ''))) = LOWER(TRIM($4))
           OR TRIM(COALESCE(group_id, '')) = TRIM($4)
         )
         AND COALESCE(NULLIF(tracking_metadata->>'stepIndex', '')::int, 1) = $5
       ORDER BY id DESC
       LIMIT 1`,
      [safeRun, safeCampaign, safeChannel, recipient, safeStep]
    );
    return result.rows[0] || null;
  }
}

export default new ZaloMessageRepository();
