import nodemailer from 'nodemailer';
import path from 'path';
import uploadController from './upload.controller.js';
import { generateFileToken } from '../utils/fileDownloadToken.js';
import trackingShortLinkService from '../services/tracking/trackingShortLink.service.js';
import emailSettingsCrudService from '../services/email/emailSettingsCrud.service.js';
import emailSettingsSmtpService from '../services/email/emailSettingsSmtp.service.js';

class EmailSettingsController {
  /**
   * Chuẩn hóa cấu hình SMTP.
   *
   * Luồng hoạt động:
   * 1. Ưu tiên sử dụng cấu hình SMTP truyền vào (từ DB).
   * 2. Nếu không có host, fallback sang biến env SendGrid.
   *
   * @param {{host?: string, port?: number|string, username?: string, password?: string}} config cấu hình SMTP thô
   * @returns {{host: string, port: number, username: string, password: string}} cấu hình SMTP đã chuẩn hóa
   */
  normalizeSmtpConfig(config = {}) {
    const rawHost = String(config.host || '').trim();
    const rawPort = Number.parseInt(config.port, 10);
    const rawUsername = String(config.username || '').trim();
    const rawPassword = String(config.password || '').trim();

    if (rawHost) {
      return {
        host: rawHost,
        port: Number.isFinite(rawPort) ? rawPort : 587,
        username: rawUsername,
        password: rawPassword,
      };
    }

    const envSendGridHost = String(process.env.SENDGRID_SMTP_HOST || '').trim() || 'smtp.sendgrid.net';
    const envSendGridPort = Number.parseInt(process.env.SENDGRID_SMTP_PORT, 10);
    const envSendGridApiKey = String(process.env.SENDGRID_API_KEY || '').trim();

    return {
      host: envSendGridHost,
      port: Number.isFinite(envSendGridPort) ? envSendGridPort : 587,
      username: 'apikey',
      password: envSendGridApiKey,
    };
  }

  isPrivateTrackingHost(hostname) {
    const host = String(hostname || '').trim().toLowerCase();
    if (!host) return true;
    if (host === 'localhost' || host === '::1' || host.endsWith('.local')) return true;

    const ipv4Match = host.match(/^(\d{1,3})(?:\.(\d{1,3})){3}$/);
    if (ipv4Match) {
      const parts = host.split('.').map((p) => Number(p));
      if (parts.some((n) => !Number.isFinite(n) || n < 0 || n > 255)) return true;
      const [a, b] = parts;
      if (
        a === 10 ||
        a === 127 ||
        a === 0 ||
        (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168)
      ) {
        return true;
      }
    }

    return false;
  }

  resolveTrackingBaseUrl(req) {
    const fromEnv = String(process.env.TRACKING_BASE_URL || '').trim();
    if (fromEnv) {
      try {
        const parsed = new URL(fromEnv);
        return {
          baseUrl: `${parsed.protocol}//${parsed.host}${parsed.pathname}`.replace(/\/+$/, ''),
          isPublic: !this.isPrivateTrackingHost(parsed.hostname),
          source: 'env',
        };
      } catch {
        // fallback to request-derived URL when TRACKING_BASE_URL is invalid
      }
    }

    const forwardedProto = String(req.get('x-forwarded-proto') || '').split(',')[0].trim();
    const forwardedHost = String(req.get('x-forwarded-host') || '').split(',')[0].trim();
    const requestHost = forwardedHost || req.get('host') || '';
    const protocol = forwardedProto || req.protocol || 'http';
    const fallbackBaseUrl = requestHost ? `${protocol}://${requestHost}` : 'http://localhost:5000';
    const hostname = requestHost.split(':')[0];

    return {
      baseUrl: String(fallbackBaseUrl).replace(/\/+$/, ''),
      isPublic: !this.isPrivateTrackingHost(hostname),
      source: 'request',
    };
  }
  createSmtpTransporter({ host, port, username, password }) {
    const normalized = this.normalizeSmtpConfig({ host, port, username, password });
    return nodemailer.createTransport({
      host: normalized.host,
      port: normalized.port,
      secure: normalized.port === 465,
      auth: { user: normalized.username, pass: normalized.password },
      tls: { rejectUnauthorized: false },
      // pool=true: tái sử dụng kết nối TCP thay vì mở mới cho mỗi email gửi đi.
      pool: true,
      maxConnections: 5,
      maxMessages: Infinity,
    });
  }

  formatUtc7() {
    /**
     * Luôn trả về timestamp ISO theo thời điểm thực tế hiện tại.
     * Không cộng tay +7 giờ để tránh tình trạng UI cộng timezone thêm lần nữa.
     */
    return new Date().toISOString();
  }

  normalizeEmailList(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value.map(v => String(v).trim()).filter(Boolean);
    return String(value).split(/[\n,;]+/g).map(v => v.trim()).filter(Boolean);
  }

  async buildTrackedHtml(
    rawHtml,
    trackingBaseUrl,
    trackingToken,
    campaignId = null,
    customerId = null,
    runId = null,
    options = {}
  ) {
    const input = String(rawHtml || '');
    if (!input.trim()) return input;

    const openUrl = `${trackingBaseUrl}/api/customers/email-tracking/open/${trackingToken}`;
    const clickBaseUrl = `${trackingBaseUrl}/api/customers/email-tracking/click/${trackingToken}`;
    const unsubscribeUrl = `${trackingBaseUrl}/api/customers/email-tracking/unsubscribe/${trackingToken}`;
    const privacyPolicyUrl = String(process.env.PRIVACY_POLICY_URL || '').trim()
      || 'https://campaign.digiso.vn/privacy-policy';

    // Helper function để thêm UTM parameters vào URL
    const addUtmToUrl = (url) => {
      // Chỉ thêm UTM nếu có campaignId
      if (!campaignId) return url;

      try {
        const parsed = new URL(url);
        // Chỉ thêm UTM cho external links (http/https)
        if (!['http:', 'https:'].includes(parsed.protocol)) return url;

        // Thêm UTM parameters nếu chưa có
        if (!parsed.searchParams.has('utm_source')) {
          parsed.searchParams.set('utm_source', 'email_campaign');
        }
        if (!parsed.searchParams.has('utm_campaign')) {
          parsed.searchParams.set('utm_campaign', String(campaignId));
        }
        if (customerId && !parsed.searchParams.has('utm_customer')) {
          parsed.searchParams.set('utm_customer', String(customerId));
        }
        if (runId && !parsed.searchParams.has('utm_id_run')) {
          parsed.searchParams.set('utm_id_run', String(runId));
        }

        return parsed.toString();
      } catch {
        // Nếu URL không hợp lệ, trả về nguyên bản
        return url;
      }
    };

    const enableClickTracking = options?.enableClickTracking !== false;
    const useShortLink = options?.useShortLinkForClickTracking !== false;
    const anchorRegex = /<a(\s[^>]*)?\shref=(["'])(https?:\/\/[^"']+)\2([^>]*)>([\s\S]*?)<\/a>/gi;

    let withClickTracking = input;
    if (enableClickTracking) {
      const matches = Array.from(input.matchAll(anchorRegex));
      if (matches.length > 0) {
        const replacementHtmlList = await Promise.all(
          matches.map(async (matched, index) => {
            const fullAnchor = String(matched[0] || '');
            const pre = matched[1] || '';
            const quote = matched[2] || '"';
            const targetUrl = String(matched[3] || '').trim();
            const post = matched[4] || '';
            const innerHtml = String(matched[5] || '');

            // Skip already-tracked attachment URLs and file viewer URLs
            if (
              targetUrl.includes('/track/attachment/')
              || targetUrl.includes('/file/')
              || targetUrl.includes('/download/')
            ) {
              return fullAnchor;
            }

            const urlWithUtm = addUtmToUrl(targetUrl);
            const textLabel = innerHtml
              .replace(/<[^>]+>/g, '')
              .replace(/&[a-z#0-9]+;/gi, ' ')
              .replace(/\s+/g, ' ')
              .trim()
              .slice(0, 80);
            const linkKey = `email-link-${index + 1}`;
            const labelParam = textLabel ? `&label=${encodeURIComponent(textLabel)}` : '';
            const trackingLongUrl = `${clickBaseUrl}?url=${encodeURIComponent(urlWithUtm)}&lk=${encodeURIComponent(linkKey)}${labelParam}`;
            const finalTrackingUrl = useShortLink
              ? await trackingShortLinkService.createShortTrackingUrl({
                trackingBaseUrl,
                destinationUrl: trackingLongUrl,
                channel: 'email',
                trackingToken,
                linkKey,
              })
              : trackingLongUrl;
            return `<a${pre} href=${quote}${finalTrackingUrl}${quote}${post}>${innerHtml}</a>`;
          })
        );

        withClickTracking = input;
        matches.forEach((matched, index) => {
          const fullAnchor = String(matched[0] || '');
          if (!fullAnchor) return;
          withClickTracking = withClickTracking.replace(fullAnchor, replacementHtmlList[index]);
        });
      }
    }

    const trackingPixel = `<img src="${openUrl}" width="1" height="1" alt="" style="width:1px;height:1px;border:0;opacity:0;display:block;" />`;

    // Footer email: unsubscribe + chính sách, sau đó khối pháp lý (tiêu đề tên công ty song ngữ, tên pháp lý + địa chỉ).
    const unsubscribeFooter = `<div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;text-align:center;font-size:12px;line-height:1.6;color:#9ca3af;font-family:Arial,sans-serif;">
  <div style="margin-bottom:4px;">
    Nếu bạn không muốn nhận email này nữa, <a href="${unsubscribeUrl}" style="color:#6b7280;text-decoration:underline;">hủy đăng ký tại đây</a>.
    &nbsp;|&nbsp;
    <a href="${privacyPolicyUrl}" style="color:#6b7280;text-decoration:underline;">Chính sách bảo mật</a>.
  </div>
  <div>
    If you no longer wish to receive these emails, <a href="${unsubscribeUrl}" style="color:#6b7280;text-decoration:underline;">unsubscribe here</a>.
    &nbsp;|&nbsp;
    <a href="${privacyPolicyUrl}" style="color:#6b7280;text-decoration:underline;">Privacy Policy</a>.
  </div>
  <div style="margin-top:16px;padding-top:14px;border-top:1px solid #e5e7eb;font-size:11px;line-height:1.65;color:#6b7280;">
    <div style="font-size:10px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px;">Tên công ty · Company name</div>
    <div style="font-weight:600;color:#374151;margin-bottom:6px;">CÔNG TY TNHH GIẢI PHÁP SỐ DIGISO</div>
    <div style="margin-bottom:2px;">DIGISO DIGITAL SOLUTION COMPANY LIMITED</div>
    <div style="margin-top:8px;margin-bottom:3px;">Địa chỉ: Đ. Võ Trường Toản, Phường Linh Trung, Linh Xuân, Hồ Chí Minh</div>
    <div>Address: Vo Truong Toan Street, Linh Trung Ward, Linh Xuan, Ho Chi Minh City, Vietnam</div>
  </div>
</div>`;

    if (/<\/body>/i.test(withClickTracking)) {
      return withClickTracking.replace(/<\/body>/i, `${unsubscribeFooter}${trackingPixel}</body>`);
    }
    return `${withClickTracking}${unsubscribeFooter}${trackingPixel}`;
  }

  // ─── File download links ───────────────────────────────────────────────────

  /**
   * Tạo HTML block chứa các link xem file (cho attachments có displayName).
   * Link trỏ tới /track/attachment/:token để ghi nhận sự kiện tải tệp.
   * @param {Array} attachments
   * @param {number|null} campaignId
   * @param {number|null} customerId
   * @param {string} trackingBaseUrl
   * @param {string|null} recipientEmail
   * @param {string|null} emailTrackingToken  - UUID tracking token của email message (để link với id_email_message)
   * @returns {string}
   */
  buildDownloadLinksHtml(attachments, campaignId, customerId, trackingBaseUrl, recipientEmail = null, emailTrackingToken = null) {
    const linkAtts = (attachments || []).filter(
      (att) => att.displayName && this.resolveAttachmentKey(att)
    );
    if (!linkAtts.length) return '';

    const linkItems = linkAtts
      .map((att) => {
        const storageKey = this.resolveAttachmentKey(att);
        const token = generateFileToken(storageKey, campaignId, customerId, recipientEmail, att.displayName, emailTrackingToken);
        // Dùng /track/attachment/:token → ghi sự kiện + redirect S3 download trực tiếp
        const url = `${trackingBaseUrl}/track/attachment/${token}`;
        const name = att.displayName;
        return `<li style="display:inline-block;margin:0 8px 8px 0;list-style:none;">
  <a href="${url}" target="_blank" rel="noopener noreferrer"
     style="display:inline-block;color:#2563eb;font-weight:600;font-size:13px;text-decoration:none;padding:7px 16px;background:#eff6ff;border:1.5px solid #bfdbfe;border-radius:20px;white-space:nowrap;">
    &#128229; ${name}
  </a>
</li>`;
      })
      .join('\n');

    return `
<div style="margin-top:24px;padding:16px 20px;background:#f8fafc;border-radius:10px;border:1px solid #e2e8f0;font-family:sans-serif;">
  <p style="font-size:11px;font-weight:700;color:#94a3b8;margin:0 0 10px 0;letter-spacing:1px;text-transform:uppercase;">&#128206; Tài liệu đính kèm</p>
  <ul style="padding:0;margin:0;line-height:2.4;">
${linkItems}
  </ul>
</div>`;
  }

  /**
   * Nhúng HTML download links vào trước </body> hoặc cuối email.
   * @param {string} html
   * @param {string} linksHtml
   * @returns {string}
   */
  injectDownloadLinks(html, linksHtml) {
    if (!linksHtml) return html;
    if (/<\/body>/i.test(html)) {
      return html.replace(/<\/body>/i, `${linksHtml}</body>`);
    }
    return `${html}${linksHtml}`;
  }

  // ───────────────────────────────────────────────────────────────────────────

  resolveAttachmentKey(att) {
    const key = uploadController.normalizeStorageKey(att);
    if (key) return key;
    if (typeof att === 'string') return String(att || '').trim();
    if (att?.key) return String(att.key || '').trim();
    return '';
  }

  async buildMailAttachments(items) {
    if (!Array.isArray(items) || items.length === 0) return [];
    const results = [];
    for (const item of items) {
      const key = this.resolveAttachmentKey(item);
      if (!key) continue;
      // Lấy nội dung tệp trực tiếp từ local uploads thay vì object storage.
      const bodyBuffer = await uploadController.readFileBufferByKey(key);
      results.push({
        filename: item.originalName || path.basename(key),
        content: bodyBuffer,
        contentType: item.contentType || 'application/octet-stream',
      });
    }
    return results;
  }

  handleSmtpError(error, res) {
    if (error.message.includes('Email address is not verified')) {
      return res.status(400).json({
        success: false,
        message: 'Email gửi chưa xác thực. Với SendGrid, hãy xác thực Sender Identity/Domain trước khi gửi.',
        errorType: 'EMAIL_NOT_VERIFIED'
      });
    }
    if (error.message.includes('Message rejected')) {
      return res.status(400).json({
        success: false,
        message: 'Email bị từ chối bởi SendGrid SMTP. Kiểm tra API key, sender identity và cấu hình SMTP.',
        errorType: 'MESSAGE_REJECTED'
      });
    }
    return res.status(400).json({
      success: false,
      message: 'Gửi email thất bại: ' + error.message
    });
  }

  async logEmailSent(payload) {
    return emailSettingsSmtpService.logEmailSent(payload);
  }

  async getAll(req, res) {
    try {
      const data = await emailSettingsCrudService.getAll({
        userId: req.user.id,
        roleCode: req.user?.role,
        page: req.query.page,
        limit: req.query.limit,
        status: req.query.status,
      });

      return res.json({
        success: true,
        data,
      });
    } catch (error) {
      console.error('Get email settings error:', error);
      return res.status(error.statusCode || 500).json({
        success: false,
        message: error.statusCode ? error.message : 'Lỗi server',
        ...(error.limitReached ? { limitReached: true } : {}),
      });
    }
  }

  async getById(req, res) {
    try {
      const data = await emailSettingsCrudService.getById({
        userId: req.user.id,
        roleCode: req.user?.role,
        id: req.params.id,
      });

      return res.json({
        success: true,
        data,
      });
    } catch (error) {
      console.error('Get email setting error:', error);
      return res.status(error.statusCode || 500).json({
        success: false,
        message: error.statusCode ? error.message : 'Lỗi server',
      });
    }
  }

  async create(req, res) {
    try {
      const data = await emailSettingsCrudService.create({
        userId: req.user.id,
        roleCode: req.user?.role,
        payload: req.body,
      });

      return res.status(201).json({
        success: true,
        message: 'Tạo cấu hình email thành công',
        data,
      });
    } catch (error) {
      console.error('Create email setting error:', error);
      return res.status(error.statusCode || 500).json({
        success: false,
        message: error.statusCode ? error.message : 'Lỗi server',
        ...(error.limitReached ? { limitReached: true } : {}),
      });
    }
  }

  async update(req, res) {
    try {
      const data = await emailSettingsCrudService.update({
        userId: req.user.id,
        roleCode: req.user?.role,
        id: req.params.id,
        payload: req.body,
      });

      return res.json({
        success: true,
        message: 'Cập nhật cấu hình email thành công',
        data,
      });
    } catch (error) {
      console.error('Update email setting error:', error);
      return res.status(error.statusCode || 500).json({
        success: false,
        message: error.statusCode ? error.message : 'Lỗi server',
      });
    }
  }

  async delete(req, res) {
    try {
      await emailSettingsCrudService.delete({
        userId: req.user.id,
        roleCode: req.user?.role,
        id: req.params.id,
      });

      return res.json({
        success: true,
        message: 'Xóa cấu hình email thành công',
      });
    } catch (error) {
      console.error('Delete email setting error:', error);
      return res.status(error.statusCode || 500).json({
        success: false,
        message: error.statusCode ? error.message : 'Lỗi server',
      });
    }
  }

  async testConnection(req, res) {
    try {
      const result = await emailSettingsSmtpService.testConnection(req.body, {
        createSmtpTransporter: (input) => this.createSmtpTransporter(input),
      });

      return res.json({
        success: true,
        message: result.message,
      });
    } catch (error) {
      console.error('Test SMTP connection error:', error);
      return res.status(error.statusCode || 400).json({
        success: false,
        message: error.message,
      });
    }
  }

  async sendTestEmail(req, res) {
    try {
      const data = await emailSettingsSmtpService.sendTestEmail({
        userId: req.user.id,
        roleCode: req.user?.role,
        id: req.params.id,
        payload: req.body,
      }, {
        createSmtpTransporter: (input) => this.createSmtpTransporter(input),
      });

      return res.json({
        success: true,
        message: 'Gửi email thành công',
        data,
      });
    } catch (error) {
      console.error('Send test email error:', error);
      if (error.statusCode) {
        return res.status(error.statusCode).json({
          success: false,
          message: error.message,
        });
      }
      return this.handleSmtpError(error, res);
    }
  }

  async getActiveSettings(req, res) {
    try {
      const data = await emailSettingsCrudService.getActiveSettings({
        userId: req.user.id,
        roleCode: req.user?.role,
      });

      return res.json({
        success: true,
        data,
      });
    } catch (error) {
      console.error('Get active email settings error:', error);
      return res.status(error.statusCode || 500).json({
        success: false,
        message: error.statusCode ? error.message : 'Lỗi server',
      });
    }
  }

  async sendCustomEmail(req, res) {
    try {
      const data = await emailSettingsSmtpService.sendCustomEmail({
        userId: req.user.id,
        roleCode: req.user?.role,
        payload: req.body,
        trackingConfig: this.resolveTrackingBaseUrl(req),
      }, {
        normalizeEmailList: (value) => this.normalizeEmailList(value),
        buildTrackedHtml: (...args) => this.buildTrackedHtml(...args),
        buildMailAttachments: (items) => this.buildMailAttachments(items),
        createSmtpTransporter: (input) => this.createSmtpTransporter(input),
        formatUtc7: () => this.formatUtc7(),
      });

      return res.json({
        success: true,
        message: 'Gửi email thành công',
        data,
      });
    } catch (error) {
      console.error('Send custom email error:', error);
      if (error.statusCode) {
        return res.status(error.statusCode).json({
          success: false,
          message: error.message,
          ...(error.data ? { data: error.data } : {}),
        });
      }
      return this.handleSmtpError(error, res);
    }
  }

  // ─── Domain verification (Hướng 2) ─────────────────────────────────────────

  async initiateDomainVerification(req, res) {
    try {
      const { default: emailDomainVerificationService } = await import('../services/email/emailDomainVerification.service.js');
      const result = await emailDomainVerificationService.initiate({
        userId: req.user.id,
        roleCode: req.user?.role,
        settingId: req.params.id,
      });

      return res.json({ success: true, data: result });
    } catch (error) {
      console.error('Initiate domain verification error:', error);
      return res.status(error.statusCode || 500).json({
        success: false,
        message: error.statusCode ? error.message : 'Lỗi server',
      });
    }
  }

  async getDomainVerificationStatus(req, res) {
    try {
      const { default: emailDomainVerificationService } = await import('../services/email/emailDomainVerification.service.js');
      const result = await emailDomainVerificationService.checkStatus({
        userId: req.user.id,
        roleCode: req.user?.role,
        settingId: req.params.id,
      });

      return res.json({ success: true, data: result });
    } catch (error) {
      console.error('Get domain verification status error:', error);
      return res.status(error.statusCode || 500).json({
        success: false,
        message: error.statusCode ? error.message : 'Lỗi server',
      });
    }
  }
}

export default new EmailSettingsController();
