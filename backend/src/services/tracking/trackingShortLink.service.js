import db from '../../config/database.js';

class TrackingShortLinkService {
  constructor() {
    this.base62Chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    this.defaultCodeLength = 16;
    this.maxGenerateRetry = 8;
  }

  /**
   * Tạo chuỗi Base62 ngẫu nhiên với độ dài cố định.
   *
   * @param {number} length độ dài mã ngắn
   * @returns {string}
   */
  generateBase62Code(length = this.defaultCodeLength) {
    // Chuẩn hóa độ dài mã để đảm bảo link tracking đủ dài, giảm xác suất đoán mã.
    const safeLength = Math.max(16, Math.min(24, Number.parseInt(length, 10) || this.defaultCodeLength));
    let output = '';
    for (let index = 0; index < safeLength; index += 1) {
      const randomIndex = Math.floor(Math.random() * this.base62Chars.length);
      output += this.base62Chars[randomIndex];
    }
    return output;
  }

  /**
   * Tạo link ngắn `/t/:code` và lưu ánh xạ vào DB.
   *
   * Luồng hoạt động:
   * 1. Sinh code Base62 mặc định 16 ký tự.
   * 2. Insert vào bảng `tracking_short_links` với thông tin map ngược.
   * 3. Nếu trùng code thì sinh lại trong số lần retry giới hạn.
   *
   * @param {object} input
   * @param {string} input.trackingBaseUrl domain tracking base
   * @param {string} input.destinationUrl URL đích đầy đủ (thường là URL tracking click dài)
   * @param {string|null} [input.channel]
   * @param {string|null} [input.trackingToken]
   * @param {string|null} [input.linkKey]
   * @returns {Promise<string>} URL ngắn
   */
  async createShortTrackingUrl({
    trackingBaseUrl,
    destinationUrl,
    channel = null,
    trackingToken = null,
    linkKey = null,
  }) {
    const baseUrl = String(trackingBaseUrl || '').trim().replace(/\/+$/, '');
    const targetUrl = String(destinationUrl || '').trim();
    if (!baseUrl || !targetUrl) return targetUrl;

    for (let attempt = 1; attempt <= this.maxGenerateRetry; attempt += 1) {
      const code = this.generateBase62Code(this.defaultCodeLength);
      try {
        await db.query(
          `INSERT INTO tracking_short_links
             (short_code, destination_url, channel, tracking_token, link_key, created_at, updated_at)
           VALUES
             ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
          [code, targetUrl, channel, trackingToken, linkKey]
        );
        return `${baseUrl}/t/${code}`;
      } catch (error) {
        const isUniqueViolation = String(error?.code || '') === '23505';
        if (!isUniqueViolation || attempt >= this.maxGenerateRetry) {
          // Log cảnh báo để dễ chẩn đoán khi DB schema chưa khớp (ví dụ short_code quá ngắn).
          console.warn(
            '[TrackingShortLink] Không thể tạo short-link, fallback về link đầy đủ:',
            String(error?.message || 'unknown error')
          );
          break;
        }
      }
    }

    return targetUrl;
  }

  /**
   * Resolve mã ngắn và redirect về URL đích đã lưu.
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @returns {Promise<import('express').Response>}
   */
  async redirectByCode(req, res) {
    const rawCode = String(req.params.code || '').trim();
    const code = rawCode.replace(/[^0-9a-zA-Z]/g, '');
    if (!code) {
      return res.status(404).json({
        success: false,
        message: 'Link rút gọn không hợp lệ hoặc đã hết hạn.',
      });
    }

    try {
      const result = await db.query(
        `SELECT destination_url
         FROM tracking_short_links
         WHERE short_code = $1
            OR LOWER(short_code) = LOWER($1)
         ORDER BY CASE WHEN short_code = $1 THEN 0 ELSE 1 END
         LIMIT 1`,
        [code]
      );
      const destinationUrl = String(result.rows[0]?.destination_url || '').trim();
      if (!destinationUrl) {
        return res.status(404).json({
          success: false,
          message: 'Không tìm thấy link rút gọn hoặc link đã hết hạn.',
        });
      }
      return res.redirect(302, destinationUrl);
    } catch (error) {
      console.error('Resolve tracking short code error:', error);
      return res.status(500).json({
        success: false,
        message: 'Không thể xử lý link rút gọn lúc này.',
      });
    }
  }
}

export default new TrackingShortLinkService();

