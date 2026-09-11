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

  async insertCampaignZaloMessage({
    campaignId,
    runId,
    customerId,
    nodeId,
    channel,
    recipientType,
    recipientValue,
    uid,
    groupId,
    accountId,
    accountName,
    messageText,
    trackingToken,
    trackingBaseUrl,
    trackingMetadata,
    isPreview = false,
    quotaReservationId = null,
  }, queryable = db) {
    const runner = queryable || db;
    const rawResId = quotaReservationId != null ? Number.parseInt(quotaReservationId, 10) : null;
    const safeQuotaReservationId = Number.isFinite(rawResId) ? rawResId : null;

    const result = await runner.query(
      `INSERT INTO zalo_messages
         (id_campaign, id_run, id_customer, id_node, channel, recipient_type, recipient_value, uid, group_id,
          account_id, account_name, message_text, tracking_token, tracking_base_url, tracking_metadata, is_preview, quota_reservation_id, sent_at, created_at, updated_at)
       VALUES
         ($1, $2, $3, $4, $5, $6, $7, $8, $9,
          $10, $11, $12, $13, $14, $15::jsonb, $16, $17, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING id`,
      [
        campaignId,
        runId,
        customerId,
        nodeId,
        channel,
        recipientType,
        recipientValue,
        uid,
        groupId,
        accountId,
        accountName,
        messageText,
        trackingToken,
        trackingBaseUrl,
        JSON.stringify(trackingMetadata),
        Boolean(isPreview),
        safeQuotaReservationId,
      ]
    );
    return result.rows[0]?.id ?? null;
  }

  /**
   * Merge vào `tracking_metadata` (JSONB) và, nếu `metadata.status` có giá trị, ghi luôn cột
   * `status` (PR-3) — trước đây cột này chỉ có DEFAULT 'pending' lúc INSERT, không câu SQL nào
   * cập nhật lại, nên 61.649 dòng production từng "pending" vĩnh viễn dù trạng thái thật (sent/
   * failed) đã nằm trong JSONB.
   *
   * `COALESCE($3, status)`: hàm này được gọi với metadata TỪNG PHẦN (vd chỉ `{ linkTargets }`,
   * không có `status`) — nếu ghi thẳng tham số thì những lần gọi đó sẽ xoá mất trạng thái đang
   * có bằng NULL.
   *
   * @param {number} zaloMessageId
   * @param {object} metadata
   * @param {object} [queryable] client/pool — truyền `client` khi cần chạy trong transaction.
   */
  async mergeZaloMessageTrackingMetadata(zaloMessageId, metadata, queryable = db) {
    const status = (metadata && typeof metadata === 'object' && metadata.status != null)
      ? String(metadata.status)
      : null;
    await queryable.query(
      `UPDATE zalo_messages
       SET tracking_metadata = COALESCE(tracking_metadata, '{}'::jsonb) || $2::jsonb,
           status = COALESCE($3, status),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [zaloMessageId, JSON.stringify(metadata || {}), status]
    );
  }

  /**
   * Đóng sổ một placeholder `zalo_messages` bị bỏ lại ở trạng thái 'queued' — dùng làm điểm
   * giải quyết DUY NHẤT cho mọi đường thoát sớm (throw/return) trong luồng gửi Zalo (PR-3),
   * thay vì vá riêng từng đường (hôm nay có 5 đường ở nhánh cá nhân, PR sau chắc chắn thêm nữa).
   *
   * Điều kiện `WHERE ... = 'queued'` nằm trong SQL, không phải một cờ trong JS — nên hàm này
   * gọi bao nhiêu lần cũng vô hại (idempotent) và không bao giờ ghi đè một trạng thái đã có
   * ('sent'/'failed'/'aborted').
   *
   * Dùng 'aborted', không dùng 'failed': tin chưa từng được gửi, không phải lỗi của người
   * nhận — đánh 'failed' sẽ thổi phồng tỉ lệ thất bại khi đọc báo cáo chiến dịch.
   *
   * @param {number} zaloMessageId
   * @returns {Promise<void>}
   */
  async markAbandonedIfStillQueued(zaloMessageId) {
    await db.query(
      `UPDATE zalo_messages
          SET tracking_metadata = COALESCE(tracking_metadata,'{}'::jsonb)
                                  || '{"status":"aborted"}'::jsonb,
              status = 'aborted',
              updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
          AND COALESCE(tracking_metadata->>'status','') = 'queued'`,
      [zaloMessageId]
    );
  }

  /**
   * Gắn quota_reservation_id vào một zalo_messages đã tồn tại (PR-Q4b).
   * Dùng sau khi consumeSendQuota() thành công cho message đã insert trước đó (placeholder 'queued').
   */
  async linkQuotaReservation(zaloMessageId, reservationId, queryable = db) {
    const rawId = Number.parseInt(zaloMessageId, 10);
    const rawResId = Number.parseInt(reservationId, 10);
    if (!Number.isFinite(rawId) || !Number.isFinite(rawResId)) return;
    await queryable.query(
      `UPDATE zalo_messages SET quota_reservation_id = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [rawId, rawResId]
    );
  }

  async withTransaction(callback) {
    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

export default new ZaloMessageRepository();
