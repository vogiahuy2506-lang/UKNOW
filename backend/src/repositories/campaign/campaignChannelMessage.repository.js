import db from '../../config/database.js';

/**
 * PLAN_TACH_TANG_KENH_GUI_2026-09-27, PR-2 — CRUD + dedupe cho `campaign_channel_messages`
 * (log tin nhắn dùng chung cho kênh "adapter" — Telegram/WhatsApp từ PR-6+). KHÔNG dùng cho 4
 * kênh legacy (email/zalo_personal/zalo_group/zalo_friend_request) — chúng vẫn ghi vào
 * email_messages/zalo_messages như cũ (xem campaignChannelRegistry.service.js, PR-1).
 *
 * Mọi cột giờ của bảng này là TIMESTAMPTZ ngay từ đầu (migration 255) — khác zalo_messages/
 * email_messages (từng phải vá AT TIME ZONE vì cột không phải timestamptz). Vì vậy các hàm dưới
 * đây dùng thẳng `now()`/`created_at`, KHÔNG LOCALTIMESTAMP, KHÔNG AT TIME ZONE.
 */
class CampaignChannelMessageRepository {
  /**
   * Chuẩn hoá recipient_key MỘT NƠI DUY NHẤT (repo) — mọi hàm ghi/đọc bảng này đều đi qua đây
   * nên index dedupe không cần biểu thức lower(btrim(...)) như migration 254 phải làm cho
   * email_messages.recipient_email (cột đó không được chuẩn hoá thống nhất trước khi ghi).
   *
   * @param {string} value
   * @returns {string}
   */
  normalizeRecipientKey(value) {
    return String(value || '').trim().toLowerCase();
  }

  /**
   * Ghi một dòng `queued` trước khi gọi API gửi thật — placeholder để markSent/markFailed đóng
   * sổ sau, cùng khuôn `createZaloMessageTrackingRecord` (campaignRun.service.js).
   *
   * @param {object} input
   * @param {number} input.campaignId
   * @param {number} input.runId
   * @param {number|string} input.nodeId
   * @param {string} input.channel
   * @param {string} [input.accountKey]
   * @param {string} input.recipientKey chưa cần chuẩn hoá — hàm này tự lower(trim)
   * @param {string} [input.recipientDisplay]
   * @param {number} [input.stepIndex=1]
   * @param {boolean} [input.isPreview=false]
   * @param {number} [input.workspaceOwnerId]
   * @param {number} [input.actorUserId]
   * @returns {Promise<number|null>} id dòng vừa tạo
   */
  async insertQueued({
    campaignId,
    runId,
    nodeId,
    channel,
    accountKey = null,
    recipientKey,
    recipientDisplay = null,
    stepIndex = 1,
    isPreview = false,
    workspaceOwnerId = null,
    actorUserId = null,
    quotaReservationId = null,
  }) {
    const safeStepIndex = Number.parseInt(stepIndex, 10);
    const rawOwnerId = workspaceOwnerId != null ? Number.parseInt(workspaceOwnerId, 10) : null;
    const safeWorkspaceOwnerId = Number.isFinite(rawOwnerId) ? rawOwnerId : null;
    const rawActorId = actorUserId != null ? Number.parseInt(actorUserId, 10) : null;
    const safeActorUserId = Number.isFinite(rawActorId) ? rawActorId : null;
    // PR-4 — null khi mode quota 'off' hoặc không active (reserveSendQuota trả reservation.id=null
    // trong trường hợp đó) — cùng khuôn zalo_messages.quota_reservation_id.
    const rawReservationId = quotaReservationId != null ? Number.parseInt(quotaReservationId, 10) : null;
    const safeQuotaReservationId = Number.isFinite(rawReservationId) ? rawReservationId : null;

    const result = await db.query(
      `INSERT INTO campaign_channel_messages
         (id_campaign, id_run, id_node, channel, account_key, recipient_key, recipient_display,
          step_index, status, is_preview, workspace_owner_id, actor_user_id, quota_reservation_id,
          created_at, updated_at)
       VALUES
         ($1, $2, $3, $4, $5, $6, $7, $8, 'queued', $9, $10, $11, $12, now(), now())
       RETURNING id`,
      [
        campaignId,
        runId,
        nodeId,
        channel,
        accountKey,
        this.normalizeRecipientKey(recipientKey),
        recipientDisplay,
        Number.isFinite(safeStepIndex) ? safeStepIndex : 1,
        Boolean(isPreview),
        safeWorkspaceOwnerId,
        safeActorUserId,
        safeQuotaReservationId,
      ]
    );
    return result.rows[0]?.id ?? null;
  }

  /**
   * Đóng sổ thành công — set `sent_at`/`updated_at` = now() (cột timestamptz, không cần ép giờ).
   *
   * @param {number} id
   * @param {object} [input]
   * @param {string} [input.providerMessageId]
   */
  async markSent(id, { providerMessageId = null } = {}) {
    await db.query(
      `UPDATE campaign_channel_messages
       SET status = 'sent',
           provider_message_id = $2,
           sent_at = now(),
           updated_at = now()
       WHERE id = $1`,
      [id, providerMessageId]
    );
  }

  /**
   * Đóng sổ thất bại.
   *
   * @param {number} id
   * @param {object} [input]
   * @param {string} [input.errorCategory]
   * @param {string} [input.errorMessage]
   */
  async markFailed(id, { errorCategory = null, errorMessage = null } = {}) {
    await db.query(
      `UPDATE campaign_channel_messages
       SET status = 'failed',
           error_category = $2,
           error_message = $3,
           updated_at = now()
       WHERE id = $1`,
      [id, errorCategory, errorMessage]
    );
  }

  /**
   * Tra dòng đã gửi thành công TRONG CÙNG run — dedupe resume/crash, cùng khuôn
   * `findExistingSentCampaignZaloMessage` (zaloMessage.repository.js).
   *
   * @param {object} input
   * @param {number} input.runId
   * @param {number|string} input.nodeId
   * @param {string} input.channel
   * @param {string} input.recipientKey
   * @param {number} input.stepIndex
   * @returns {Promise<{id: number, sent_at: Date|null}|null>}
   */
  async findExistingSentSameRun({ runId, nodeId, channel, recipientKey, stepIndex }) {
    const safeRun = Number.parseInt(runId, 10);
    const safeNode = Number.parseInt(nodeId, 10);
    const safeStep = Number.parseInt(stepIndex, 10);
    const safeChannel = String(channel || '').trim();
    const recipient = this.normalizeRecipientKey(recipientKey);
    if (
      !Number.isFinite(safeRun)
      || !Number.isFinite(safeNode)
      || !Number.isFinite(safeStep)
      || !safeChannel
      || !recipient
    ) {
      return null;
    }

    const result = await db.query(
      `SELECT id, sent_at
       FROM campaign_channel_messages
       WHERE id_run = $1
         AND id_node = $2
         AND channel = $3
         AND recipient_key = $4
         AND step_index = $5
         AND status = 'sent'
       ORDER BY id DESC
       LIMIT 1`,
      [safeRun, safeNode, safeChannel, recipient, safeStep]
    );
    return result.rows[0] || null;
  }

  /**
   * Tra dòng đã gửi thành công ở RUN KHÁC cho cùng id_node + kênh + người nhận + bước, trong cửa
   * sổ `windowHours` — chống gửi trùng khi dừng lượt rồi tạo lượt mới ngay, cùng khuôn
   * `findExistingSentCampaignZaloMessageCrossRun` (zaloMessage.repository.js) NHƯNG cột
   * `created_at` ở đây LÀ timestamptz thật nên so sánh thẳng bằng `now()`, không cần
   * `LOCALTIMESTAMP`/`AT TIME ZONE` như bảng cũ.
   *
   * @param {object} input
   * @param {number} input.ownRunId run hiện tại — loại trừ khỏi kết quả
   * @param {number} input.campaignId
   * @param {number|string} input.nodeId LUÔN nằm trong khoá
   * @param {string} input.channel
   * @param {string} input.recipientKey
   * @param {number} input.stepIndex
   * @param {number} input.windowHours cửa sổ tính bằng giờ
   * @returns {Promise<{id: number, id_run: number, sent_at_tz: Date}|null>}
   */
  async findExistingSentCrossRun({
    ownRunId,
    campaignId,
    nodeId,
    channel,
    recipientKey,
    stepIndex,
    windowHours,
  }) {
    const safeOwnRun = Number.parseInt(ownRunId, 10);
    const safeCampaign = Number.parseInt(campaignId, 10);
    const safeNode = Number.parseInt(nodeId, 10);
    const safeStep = Number.parseInt(stepIndex, 10);
    const safeWindowHours = Number.parseInt(windowHours, 10);
    const safeChannel = String(channel || '').trim();
    const recipient = this.normalizeRecipientKey(recipientKey);
    if (
      !Number.isFinite(safeOwnRun)
      || !Number.isFinite(safeCampaign)
      || !Number.isFinite(safeNode)
      || !Number.isFinite(safeStep)
      || !Number.isFinite(safeWindowHours)
      || safeWindowHours <= 0
      || !safeChannel
      || !recipient
    ) {
      return null;
    }

    const result = await db.query(
      `SELECT id, id_run, created_at AS sent_at_tz
       FROM campaign_channel_messages
       WHERE id_run <> $1
         AND id_campaign = $2
         AND id_node = $3
         AND channel = $4
         AND recipient_key = $5
         AND step_index = $6
         AND status = 'sent'
         AND created_at >= now() - make_interval(hours => $7::int)
       ORDER BY id DESC
       LIMIT 1`,
      [safeOwnRun, safeCampaign, safeNode, safeChannel, recipient, safeStep, safeWindowHours]
    );
    return result.rows[0] || null;
  }
}

export default new CampaignChannelMessageRepository();
