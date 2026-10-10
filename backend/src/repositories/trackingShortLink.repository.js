import db from '../config/database.js';

class TrackingShortLinkRepository {
  async create({ shortCode, destinationUrl, channel = null, trackingToken = null, linkKey = null }) {
    await db.query(
      `INSERT INTO tracking_short_links
         (short_code, destination_url, channel, tracking_token, link_key, created_at, updated_at)
       VALUES
         ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [shortCode, destinationUrl, channel, trackingToken, linkKey]
    );
  }

  async findDestinationUrlByCode(code) {
    const result = await db.query(
      // PLAN_RA_SOAT_DOT3 PR-Q1 việc 6 — so khớp CHÍNH XÁC (dùng được chỉ mục UNIQUE short_code). Trước đây
      // `OR LOWER(short_code) = LOWER($1)` buộc quét toàn bảng cho mỗi lượt bấm và thu hẹp không gian mã.
      `SELECT destination_url
       FROM tracking_short_links
       WHERE short_code = $1
       LIMIT 1`,
      [code]
    );
    return String(result.rows[0]?.destination_url || '').trim();
  }
}

export default new TrackingShortLinkRepository();
