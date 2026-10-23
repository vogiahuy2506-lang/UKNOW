/**
 * tiktokScheduledPost.repository.js
 *
 * Data access cho bộ lịch đăng bài TikTok riêng (bảng `tiktok_scheduled_posts`,
 * migration 310). Tách hẳn khỏi chiến dịch marketing (`campaignRun.service.js`).
 *
 * Vòng đời status:
 *   scheduled -> publishing (worker claim) -> processing (đã có share_id, chờ TikTok xử lý)
 *             -> published | failed
 *   scheduled -> cancelled (user huỷ)
 *   failed    -> scheduled (user bấm thử lại)
 *
 * Quy ước:
 * - Method có `userId` luôn kèm `id_user = $n` để chống IDOR (HTTP chỉ dùng các method này).
 * - Method không có `userId` (claim*, mark*, sweep*) chỉ dùng nội bộ cho worker.
 * - Mọi bước chuyển trạng thái đều có điều kiện `status = ...` nên idempotent, không ghi đè nhau.
 */

import db from '../../config/database.js';

/** Cột cho phép user sửa khi bài còn ở trạng thái `scheduled`. */
const EDITABLE_FIELDS = {
  caption: 'caption',
  videoUrl: 'video_url',
  photoUrls: 'photo_urls',
  privacyLevel: 'privacy_level',
  scheduledAt: 'scheduled_at',
};

class TiktokScheduledPostRepository {
  /**
   * Tạo bài hẹn giờ mới (status = scheduled).
   *
   * @param {object} params
   * @returns {Promise<object>}
   */
  async create({
    userId, accountId, postType, caption, videoUrl, photoUrls, privacyLevel, scheduledAt,
  }) {
    const { rows } = await db.query(
      `INSERT INTO tiktok_scheduled_posts
         (id_user, account_id, post_type, caption, video_url, photo_urls,
          privacy_level, scheduled_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
       RETURNING *`,
      [
        userId,
        accountId,
        postType,
        caption || '',
        videoUrl || null,
        JSON.stringify(Array.isArray(photoUrls) ? photoUrls : []),
        privacyLevel || 'PUBLIC_TO_EVERYONE',
        scheduledAt,
      ]
    );
    return rows[0];
  }

  /**
   * Danh sách bài của 1 user (kèm tên tài khoản để FE hiển thị).
   *
   * @param {number} userId
   * @param {object} [options]
   * @param {string} [options.status]
   * @param {number} [options.accountId]
   * @param {number} [options.limit=50]
   * @param {number} [options.offset=0]
   * @returns {Promise<{ rows: object[], total: number }>}
   */
  async listByUser(userId, {
    status, accountId, limit = 50, offset = 0,
  } = {}) {
    const where = ['p.id_user = $1'];
    const params = [userId];
    if (status) {
      params.push(status);
      where.push(`p.status = $${params.length}`);
    }
    if (accountId) {
      params.push(accountId);
      where.push(`p.account_id = $${params.length}`);
    }
    const whereSql = where.join(' AND ');

    const countRes = await db.query(
      `SELECT COUNT(*)::int AS total FROM tiktok_scheduled_posts p WHERE ${whereSql}`,
      params
    );

    params.push(limit, offset);
    const { rows } = await db.query(
      `SELECT p.*, a.display_name AS account_display_name
         FROM tiktok_scheduled_posts p
         LEFT JOIN tiktok_business_accounts a ON a.id = p.account_id
        WHERE ${whereSql}
        ORDER BY p.scheduled_at DESC, p.id DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    return { rows, total: countRes.rows[0]?.total || 0 };
  }

  /**
   * Tìm theo (id, userId) — chống IDOR.
   *
   * @param {number} id
   * @param {number} userId
   * @returns {Promise<object|null>}
   */
  async findById(id, userId) {
    const { rows } = await db.query(
      `SELECT * FROM tiktok_scheduled_posts WHERE id = $1 AND id_user = $2`,
      [id, userId]
    );
    return rows[0] || null;
  }

  /**
   * Sửa bài. CHỈ sửa được khi còn `scheduled`: điều kiện status nằm ngay trong UPDATE
   * nên không thể ghi đè bài worker vừa claim.
   *
   * @param {number} id
   * @param {number} userId
   * @param {object} fields - khoá theo EDITABLE_FIELDS (camelCase)
   * @returns {Promise<object|null>} null nếu không tồn tại / không còn ở `scheduled`
   */
  async updateScheduled(id, userId, fields) {
    const sets = [];
    const params = [id, userId];
    for (const [key, column] of Object.entries(EDITABLE_FIELDS)) {
      if (fields[key] === undefined) continue;
      if (key === 'photoUrls') {
        params.push(JSON.stringify(fields[key]));
        sets.push(`${column} = $${params.length}::jsonb`);
      } else {
        params.push(fields[key]);
        sets.push(`${column} = $${params.length}`);
      }
    }
    if (sets.length === 0) return this.findById(id, userId);
    const { rows } = await db.query(
      `UPDATE tiktok_scheduled_posts
          SET ${sets.join(', ')}, updated_at = NOW()
        WHERE id = $1 AND id_user = $2 AND status = 'scheduled'
        RETURNING *`,
      params
    );
    return rows[0] || null;
  }

  /**
   * Huỷ bài đang `scheduled`.
   *
   * @returns {Promise<object|null>} null nếu không huỷ được (đã đăng / đang đăng / không tồn tại)
   */
  async cancel(id, userId) {
    const { rows } = await db.query(
      `UPDATE tiktok_scheduled_posts
          SET status = 'cancelled', updated_at = NOW()
        WHERE id = $1 AND id_user = $2 AND status = 'scheduled'
        RETURNING *`,
      [id, userId]
    );
    return rows[0] || null;
  }

  /**
   * Đưa bài `failed` về `scheduled` để đăng lại ngay (xoá dấu vết lỗi cũ).
   *
   * @returns {Promise<object|null>}
   */
  async retryFailed(id, userId, scheduledAt = new Date()) {
    const { rows } = await db.query(
      `UPDATE tiktok_scheduled_posts
          SET status = 'scheduled',
              scheduled_at = $3,
              share_id = NULL,
              poll_count = 0,
              next_poll_at = NULL,
              processing_started_at = NULL,
              error_code = NULL,
              error_message = NULL,
              updated_at = NOW()
        WHERE id = $1 AND id_user = $2 AND status = 'failed'
        RETURNING *`,
      [id, userId, scheduledAt]
    );
    return rows[0] || null;
  }

  /**
   * Xoá bài đã kết thúc (cancelled / failed / published). Không xoá bài đang chạy.
   *
   * @returns {Promise<boolean>}
   */
  async deleteFinished(id, userId) {
    const { rows } = await db.query(
      `DELETE FROM tiktok_scheduled_posts
        WHERE id = $1 AND id_user = $2
          AND status IN ('cancelled', 'failed', 'published')
        RETURNING id`,
      [id, userId]
    );
    return rows.length > 0;
  }

  // ── Worker (nội bộ) ───────────────────────────────────────────────────────

  /**
   * Claim nguyên tử các bài đến hạn: scheduled -> publishing.
   * `FOR UPDATE SKIP LOCKED` trong subquery => nhiều instance/lượt cron chạy chồng
   * nhau cũng không bao giờ lấy trùng một bài (tránh đăng đôi).
   *
   * Chỉ lấy bài của tài khoản còn `is_active`; bài của tài khoản đã ngắt kết nối
   * được xử lý riêng ở `failInactiveAccountPosts`.
   *
   * @param {number} [limit=10]
   * @returns {Promise<object[]>}
   */
  async claimDue(limit = 10) {
    const { rows } = await db.query(
      `UPDATE tiktok_scheduled_posts p
          SET status = 'publishing',
              processing_started_at = NOW(),
              updated_at = NOW()
        WHERE p.id IN (
          SELECT s.id
            FROM tiktok_scheduled_posts s
            JOIN tiktok_business_accounts a ON a.id = s.account_id AND a.is_active = true
           WHERE s.status = 'scheduled'
             AND s.scheduled_at <= NOW()
           ORDER BY s.scheduled_at ASC
           LIMIT $1
           FOR UPDATE OF s SKIP LOCKED
        )
        RETURNING p.*`,
      [limit]
    );
    return rows;
  }

  /**
   * Đánh lỗi các bài đến hạn nhưng tài khoản đã bị ngắt kết nối / deactivate,
   * để user thấy lý do thay vì bài nằm im mãi ở `scheduled`.
   *
   * @returns {Promise<number>} số bài bị đánh lỗi
   */
  async failInactiveAccountPosts() {
    const { rowCount } = await db.query(
      `UPDATE tiktok_scheduled_posts p
          SET status = 'failed',
              error_code = 'account_inactive',
              error_message = 'Tài khoản TikTok đã ngắt kết nối. Kết nối lại rồi bấm thử lại.',
              updated_at = NOW()
        WHERE p.status = 'scheduled'
          AND p.scheduled_at <= NOW()
          AND NOT EXISTS (
            SELECT 1 FROM tiktok_business_accounts a
             WHERE a.id = p.account_id AND a.is_active = true
          )`
    );
    return rowCount || 0;
  }

  /**
   * publishing -> processing sau khi TikTok trả share_id.
   *
   * @param {number} id
   * @param {string} shareId
   * @param {Date} nextPollAt
   */
  async markProcessing(id, shareId, nextPollAt) {
    const { rows } = await db.query(
      `UPDATE tiktok_scheduled_posts
          SET status = 'processing',
              share_id = $2,
              next_poll_at = $3,
              poll_count = 0,
              updated_at = NOW()
        WHERE id = $1 AND status = 'publishing'
        RETURNING id`,
      [id, shareId, nextPollAt]
    );
    return rows.length > 0;
  }

  /**
   * Claim các bài `processing` đến lượt hỏi trạng thái. Đẩy `next_poll_at` lên
   * `leaseSeconds` để lượt cron chồng không poll trùng cùng một bài.
   *
   * @param {number} [limit=20]
   * @param {number} [leaseSeconds=60]
   * @returns {Promise<object[]>}
   */
  async claimPollDue(limit = 20, leaseSeconds = 60) {
    const { rows } = await db.query(
      `UPDATE tiktok_scheduled_posts p
          SET next_poll_at = NOW() + make_interval(secs => $2),
              updated_at = NOW()
        WHERE p.id IN (
          SELECT s.id
            FROM tiktok_scheduled_posts s
           WHERE s.status = 'processing'
             AND s.next_poll_at IS NOT NULL
             AND s.next_poll_at <= NOW()
           ORDER BY s.next_poll_at ASC
           LIMIT $1
           FOR UPDATE SKIP LOCKED
        )
        RETURNING p.*`,
      [limit, leaseSeconds]
    );
    return rows;
  }

  /**
   * Hẹn lần poll kế tiếp (TikTok vẫn đang xử lý).
   */
  async reschedulePoll(id, nextPollAt) {
    await db.query(
      `UPDATE tiktok_scheduled_posts
          SET next_poll_at = $2,
              poll_count = poll_count + 1,
              updated_at = NOW()
        WHERE id = $1 AND status = 'processing'`,
      [id, nextPollAt]
    );
  }

  /**
   * processing -> published.
   *
   * @param {number} id
   * @param {Array<string>} postIds
   */
  async markPublished(id, postIds) {
    const { rows } = await db.query(
      `UPDATE tiktok_scheduled_posts
          SET status = 'published',
              tiktok_post_ids = $2::jsonb,
              published_at = NOW(),
              next_poll_at = NULL,
              error_code = NULL,
              error_message = NULL,
              updated_at = NOW()
        WHERE id = $1 AND status IN ('publishing', 'processing')
        RETURNING id`,
      [id, JSON.stringify(Array.isArray(postIds) ? postIds : [])]
    );
    return rows.length > 0;
  }

  /**
   * publishing | processing -> failed.
   */
  async markFailed(id, errorCode, errorMessage) {
    const { rows } = await db.query(
      `UPDATE tiktok_scheduled_posts
          SET status = 'failed',
              error_code = $2,
              error_message = $3,
              next_poll_at = NULL,
              updated_at = NOW()
        WHERE id = $1 AND status IN ('publishing', 'processing')
        RETURNING id`,
      [id, String(errorCode || 'unknown').slice(0, 100), String(errorMessage || '').slice(0, 1000)]
    );
    return rows.length > 0;
  }

  /**
   * Quét bài kẹt `publishing` (worker crash giữa chừng). KHÔNG tự đưa về `scheduled`
   * vì không biết lệnh publish đã tới TikTok chưa => tự đăng lại có thể đăng đôi.
   * Đánh `failed` để user kiểm tra trên TikTok rồi quyết định thử lại.
   *
   * @param {number} [staleMinutes=10]
   * @returns {Promise<number>}
   */
  async failStalePublishing(staleMinutes = 10) {
    const { rowCount } = await db.query(
      `UPDATE tiktok_scheduled_posts
          SET status = 'failed',
              error_code = 'publish_uncertain',
              error_message = 'Không xác định được bài đã lên TikTok chưa (hệ thống bị gián đoạn). Hãy kiểm tra trên TikTok trước khi thử lại để tránh đăng trùng.',
              updated_at = NOW()
        WHERE status = 'publishing'
          AND processing_started_at < NOW() - make_interval(mins => $1)`,
      [staleMinutes]
    );
    return rowCount || 0;
  }

  /**
   * Quét bài `processing` poll quá lâu mà TikTok vẫn chưa trả kết quả cuối.
   *
   * @param {number} [maxHours=2]
   * @returns {Promise<number>}
   */
  async failStaleProcessing(maxHours = 2) {
    const { rowCount } = await db.query(
      `UPDATE tiktok_scheduled_posts
          SET status = 'failed',
              error_code = 'processing_timeout',
              error_message = 'TikTok xử lý quá lâu, chưa có kết quả cuối. Hãy kiểm tra trên TikTok trước khi thử lại.',
              next_poll_at = NULL,
              updated_at = NOW()
        WHERE status = 'processing'
          AND processing_started_at < NOW() - make_interval(hours => $1)`,
      [maxHours]
    );
    return rowCount || 0;
  }
}

export default new TiktokScheduledPostRepository();
