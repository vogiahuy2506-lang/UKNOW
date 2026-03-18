import { v4 as uuidv4 } from 'uuid';
import db from '../../config/database.js';
import emailSettingsRepository from '../../repositories/email/emailSettings.repository.js';
import { classifyBounceType, isSmtpAuthConfigError } from '../../utils/emailBounce.utils.js';
import { decryptSmtpSecret } from '../../utils/smtpSecretCrypto.js';

class EmailSettingsSmtpService {
  /**
   * Chuẩn hóa cờ preview từ nhiều biến thể payload để tương thích ngược FE/BE.
   *
   * Luồng hoạt động:
   * 1. Ưu tiên đọc lần lượt `previewMode`, `isPreview`, `preview`.
   * 2. Chuyển đổi các kiểu giá trị thường gặp (boolean/string/number) về boolean.
   * 3. Mặc định `false` nếu không có cờ hợp lệ.
   *
   * @param {object} body payload request body
   * @returns {boolean} true nếu là chế độ preview (không tracking/unsubscribe/log DB)
   */
  normalizePreviewMode(body = {}) {
    const rawValue = [body?.previewMode, body?.isPreview, body?.preview]
      .find((value) => value !== undefined && value !== null);

    if (typeof rawValue === 'boolean') return rawValue;
    if (typeof rawValue === 'number') return rawValue === 1;
    if (typeof rawValue === 'string') {
      const normalized = rawValue.trim().toLowerCase();
      return ['1', 'true', 'yes', 'y', 'on'].includes(normalized);
    }
    return false;
  }

  /**
   * Chuẩn hóa cờ ngữ cảnh chạy từ Builder để chặn ghi DB.
   *
   * Luồng hoạt động:
   * 1. Đọc lần lượt các cờ `builderMode`, `fromBuilder`, `isBuilder`.
   * 2. Chuyển đổi về boolean từ các kiểu giá trị phổ biến.
   * 3. Mặc định `false` nếu payload không chứa cờ hợp lệ.
   *
   * @param {object} body payload request body
   * @returns {boolean} true nếu request xuất phát từ luồng Builder demo/test
   */
  normalizeBuilderMode(body = {}) {
    const rawValue = [body?.builderMode, body?.fromBuilder, body?.isBuilder]
      .find((value) => value !== undefined && value !== null);

    if (typeof rawValue === 'boolean') return rawValue;
    if (typeof rawValue === 'number') return rawValue === 1;
    if (typeof rawValue === 'string') {
      const normalized = rawValue.trim().toLowerCase();
      return ['1', 'true', 'yes', 'y', 'on'].includes(normalized);
    }
    return false;
  }

  async logEmailSent(ctx, payload) {
    const runIdNum = Number.isFinite(parseInt(payload?.runId, 10))
      ? parseInt(payload.runId, 10)
      : null;
    // Không có runId thì coi là gửi demo/manual, không tạo bản ghi email_messages/journey để tránh dữ liệu mồ côi.
    if (!runIdNum) return null;

    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      let campaignIdNum = Number.isFinite(parseInt(payload.campaignId, 10)) ? parseInt(payload.campaignId, 10) : null;
      const templateIdNum = Number.isFinite(parseInt(payload.emailTemplateId, 10))
        ? parseInt(payload.emailTemplateId, 10)
        : null;
      let resolvedCustomerId = Number.isFinite(parseInt(payload.customerId, 10))
        ? parseInt(payload.customerId, 10)
        : null;

      if (campaignIdNum) {
        const ownership = await emailSettingsRepository.getOwnedCampaign(client, campaignIdNum, payload.userId);
        if (!ownership) campaignIdNum = null;
      }

      if (!resolvedCustomerId && payload.to) {
        const foundCustomer = await emailSettingsRepository.findCustomerByEmail(client, payload.userId, payload.to);
        resolvedCustomerId = foundCustomer?.id || null;
      }

      const emailMessageId = await emailSettingsRepository.insertEmailMessage(client, {
        campaignId: campaignIdNum,
        runId: runIdNum,
        customerId: resolvedCustomerId,
        templateId: templateIdNum,
        fromEmailId: payload.fromEmailId,
        messageId: payload.info.messageId || null,
        trackingToken: payload.trackingToken,
        recipientEmail: payload.to,
        senderEmail: payload.setting.email,
        senderName: payload.setting.name,
        subject: payload.subject || null,
        bodyHtml: payload.trackedHtmlContent || null,
        bodyText: payload.plainTextContent || null,
        sentAt: payload.sentAt,
      });

      if (resolvedCustomerId) {
        await emailSettingsRepository.updateCustomerLastEmailSent(
          client,
          payload.sentAt,
          resolvedCustomerId,
          payload.userId
        );
      }

      if (campaignIdNum && resolvedCustomerId) {
        await emailSettingsRepository.upsertCampaignCustomer(client, campaignIdNum, resolvedCustomerId, payload.sentAt);
        await emailSettingsRepository.upsertCampaignParticipation(
          client,
          resolvedCustomerId,
          campaignIdNum,
          runIdNum
        );
        await emailSettingsRepository.insertCustomerJourney(client, {
          customerId: resolvedCustomerId,
          campaignId: campaignIdNum,
          runId: runIdNum,
          emailMessageId,
          eventData: JSON.stringify({
            subject: payload.subject || null,
            messageId: payload.info.messageId || null,
            trackingToken: payload.trackingToken,
            description: `Đã gửi email "${payload.subject || 'Không có tiêu đề'}"`,
          }),
          sentAt: payload.sentAt,
        });
        await emailSettingsRepository.incrementCampaignSent(client, campaignIdNum);
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async testConnection(ctx, req, res) {
    try {
      const { smtpHost, smtpPort, smtpUsername, smtpPassword } = req.body;
      const transporter = ctx.createSmtpTransporter({
        host: smtpHost,
        port: smtpPort,
        username: smtpUsername,
        password: smtpPassword,
      });
      await transporter.verify();
      res.json({
        success: true,
        message: 'Kết nối SMTP thành công',
      });
    } catch (error) {
      console.error('Test SMTP connection error:', error);
      res.status(400).json({
        success: false,
        message: 'Không thể kết nối đến SMTP server: ' + error.message,
      });
    }
  }

  async sendTestEmail(ctx, req, res) {
    try {
      const userId = req.user.id;
      const roleCode = req.user?.role_code;
      const { id } = req.params;
      const { to, subject, content, htmlContent } = req.body;
      const setting = await emailSettingsRepository.getById(userId, id, { roleCode });
      if (!setting) {
        return res.status(404).json({
          success: false,
          message: 'Không tìm thấy cấu hình email',
        });
      }

      const transporter = ctx.createSmtpTransporter({
        host: setting.smtp_host,
        port: setting.smtp_port,
        username: setting.smtp_username,
        password: decryptSmtpSecret(setting.smtp_password),
      });

      const info = await transporter.sendMail({
        text: content || 'Đây là email test từ hệ thống UKNOW',
        html: htmlContent || `<p>${content || 'Đây là email test từ hệ thống UKNOW'}</p>`,
      });

      await emailSettingsRepository.incrementSentCount(id);
      res.json({
        success: true,
        message: 'Gửi email thành công',
        data: {
          messageId: info.messageId,
          to,
          subject,
        },
      });
    } catch (error) {
      console.error('Send test email error:', error);
      ctx.handleSmtpError(error, res);
    }
  }

  async sendCustomEmail(ctx, req, res) {
    try {
      const userId = req.user.id;
      const roleCode = req.user?.role_code;
      const isPreviewMode = this.normalizePreviewMode(req.body);
      const isBuilderMode = this.normalizeBuilderMode(req.body);
      const {
        fromEmailId,
        to,
        cc,
        bcc,
        subject,
        content,
        htmlContent,
        attachments,
        campaignId,
        emailTemplateId,
        saveMessageLog,
        customerId,
        runId = null,
      } = req.body;
      const normalizedRunId = Number.isFinite(parseInt(runId, 10))
        ? parseInt(runId, 10)
        : null;
      /**
       * Builder chỉ dùng demo/test:
       * - không tracking/unsubscribe rewrite
       * - không ghi email_messages/customer_journey/campaign_participations
       * - không update cờ bounce/subscribed ở bảng customer
       */
      const shouldForcePreviewOnly = isPreviewMode || isBuilderMode || !normalizedRunId;
      const shouldSaveMessageLog = Boolean(saveMessageLog) && !shouldForcePreviewOnly;

      // Kiểm tra unsubscribe/hard bounce chỉ cho luồng run thật.
      if (!shouldForcePreviewOnly && to) {
        const customerCheck = await db.query(
          `SELECT email_subscribed, email_hard_bounced
           FROM customers
           WHERE id_user = $1 AND LOWER(email) = $2
           LIMIT 1`,
          [userId, String(to).trim().toLowerCase()]
        );
        const row = customerCheck.rows[0];
        if (row) {
          if (row.email_subscribed === false) {
            return res.status(422).json({
              success: false,
              message: 'Người nhận đã hủy đăng ký nhận email',
              data: { skipped: true, reason: 'unsubscribed' },
            });
          }
          if (row.email_hard_bounced === true) {
            return res.status(422).json({
              success: false,
              message: 'Địa chỉ email người nhận bị hard bounce — không thể gửi',
              data: { skipped: true, reason: 'hard_bounced' },
            });
          }
        }
      }

      const ccList = ctx.normalizeEmailList(cc);
      const bccList = ctx.normalizeEmailList(bcc);
      const trackingToken = uuidv4();
      const trackingConfig = ctx.resolveTrackingBaseUrl(req);
      const { baseUrl: trackingBaseUrl, isPublic, source } = trackingConfig;
      const trackingWarnings = [];
      if (!shouldForcePreviewOnly && !isPublic) {
        trackingWarnings.push(
          'Tracking URL chưa public. Hãy đặt TRACKING_BASE_URL là domain HTTPS public để theo dõi mở/click từ Gmail.'
        );
      }

      const setting = await emailSettingsRepository.getActiveById(userId, fromEmailId, { roleCode });
      if (!setting) {
        return res.status(404).json({
          success: false,
          message: 'Không tìm thấy cấu hình email hoặc email chưa kích hoạt',
        });
      }

      const transporter = ctx.createSmtpTransporter({
        host: setting.smtp_host,
        port: setting.smtp_port,
        username: setting.smtp_username,
        password: decryptSmtpSecret(setting.smtp_password),
      });

      const plainTextContent = content || 'Đây là email từ hệ thống UKNOW';
      const rawHtml = htmlContent || `<p>${plainTextContent}</p>`;
      // Luôn giữ body gốc, không thêm block link tài liệu đính kèm.
      const trackedHtmlContent = shouldForcePreviewOnly
        ? rawHtml
        : ctx.buildTrackedHtml(rawHtml, trackingBaseUrl, trackingToken, campaignId, customerId, normalizedRunId);

      const realMailAttachments = Array.isArray(attachments) && attachments.length > 0
        ? await ctx.buildMailAttachments(attachments)
        : [];

      let info;
      try {
        info = await transporter.sendMail({
          from: `"${setting.name}" <${setting.email}>`,
          to,
          cc: ccList.length ? ccList : undefined,
          bcc: bccList.length ? bccList : undefined,
          subject: subject || 'Email từ UKNOW',
          text: plainTextContent,
          html: trackedHtmlContent || `<p>${plainTextContent}</p>`,
          attachments: realMailAttachments.length ? realMailAttachments : undefined,
        });
      } catch (smtpError) {
        // Phân loại và xử lý bounce khi SMTP từ chối
        const smtpConfigError = isSmtpAuthConfigError(smtpError);
        const bounceType = classifyBounceType(smtpError);
        const bounceReason = String(smtpError?.message || '').slice(0, 500);
        if (smtpConfigError) {
          console.warn(`[sendCustomEmail] SMTP config/auth error cho ${to}: ${bounceReason}`);
        } else {
          console.warn(`[sendCustomEmail] SMTP ${bounceType} bounce cho ${to}: ${bounceReason}`);
        }

        // Chỉ tăng thống kê gửi ở luồng chạy thật có runId hợp lệ.
        if (!shouldForcePreviewOnly) {
          await emailSettingsRepository.incrementSentCount(fromEmailId).catch(() => {});
        }

        if (smtpConfigError) {
          return res.status(422).json({
            success: false,
            message: `Lỗi cấu hình SMTP: ${bounceReason}`,
            data: {
              failed: true,
              errorType: 'smtp_config',
              error: bounceReason,
              to,
            },
          });
        }

        // Hard bounce chỉ cập nhật ở run thật, tránh làm bẩn dữ liệu khi Builder demo.
        if (bounceType === 'hard' && !shouldForcePreviewOnly) {
          await db.query(
            `UPDATE customers SET email_hard_bounced = true, updated_at = CURRENT_TIMESTAMP
             WHERE id_user = $1 AND LOWER(email) = $2`,
            [userId, String(to).trim().toLowerCase()]
          ).catch((e) => console.error('[sendCustomEmail] Lỗi cập nhật hard bounce:', e.message));
        }

        return res.status(422).json({
          success: false,
          message: `${bounceType === 'hard' ? 'Hard bounce' : 'Soft bounce'}: ${bounceReason}`,
          data: {
            bounced: true,
            bounceType,
            bounceReason,
            to,
          },
        });
      }

      // Chỉ tăng bộ đếm gửi trong DB với luồng run thật.
      if (!shouldForcePreviewOnly) {
        await emailSettingsRepository.incrementSentCount(fromEmailId);
      }

      const sentAt = new Date();
      if (shouldSaveMessageLog) {
        try {
          await this.logEmailSent(ctx, {
            userId,
            campaignId,
            customerId,
            emailTemplateId,
            fromEmailId,
            to,
            subject,
            trackedHtmlContent,
            plainTextContent,
            trackingToken,
            info,
            sentAt,
            setting,
            runId: normalizedRunId,
          });
        } catch (logError) {
          console.error('Log email message error:', logError);
        }
      }

      res.json({
        success: true,
        message: 'Gửi email thành công',
        data: {
          messageId: info.messageId,
          from: setting.email,
          to,
          cc: ccList,
          bcc: bccList,
          subject,
          sentAt: ctx.formatUtc7(),
          tracking: {
            baseUrl: trackingBaseUrl,
            source,
            isPublic,
            warnings: trackingWarnings,
          },
        },
      });
    } catch (error) {
      console.error('Send custom email error:', error);
      ctx.handleSmtpError(error, res);
    }
  }

}

export default new EmailSettingsSmtpService();
