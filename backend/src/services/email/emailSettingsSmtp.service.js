import { v4 as uuidv4 } from 'uuid';
import db from '../../config/database.js';
import emailSettingsRepository from '../../repositories/email/emailSettings.repository.js';
import { classifyBounceType, isSmtpAuthConfigError } from '../../utils/emailBounce.utils.js';
import { decryptSmtpSecret } from '../../utils/smtpSecretCrypto.js';

class EmailSettingsSmtpService {
  async logEmailSent(ctx, payload) {
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
        runId: payload.runId,
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
          payload.runId
        );
        await emailSettingsRepository.insertCustomerJourney(client, {
          customerId: resolvedCustomerId,
          campaignId: campaignIdNum,
          runId: payload.runId,
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
      const { id } = req.params;
      const { to, subject, content, htmlContent } = req.body;
      const setting = await emailSettingsRepository.getById(userId, id);
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
        previewMode = false,
        runId = null,
      } = req.body;

      // Kiểm tra trạng thái unsubscribe / hard bounce trước khi gửi (chỉ khi không phải preview)
      if (!previewMode && to) {
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
      if (!previewMode && !isPublic) {
        trackingWarnings.push(
          'Tracking URL chưa public. Hãy đặt TRACKING_BASE_URL là domain HTTPS public để theo dõi mở/click từ Gmail.'
        );
      }

      const setting = await emailSettingsRepository.getActiveById(userId, fromEmailId);
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
      const trackedHtmlContent = previewMode
        ? rawHtml
        : ctx.buildTrackedHtml(rawHtml, trackingBaseUrl, trackingToken, campaignId, customerId, runId);

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

        await emailSettingsRepository.incrementSentCount(fromEmailId).catch(() => {});

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

        // Hard bounce: đánh dấu customer để bỏ qua lần sau (chỉ khi không phải preview)
        if (bounceType === 'hard' && !previewMode) {
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

      await emailSettingsRepository.incrementSentCount(fromEmailId);

      const sentAt = new Date();
      if (saveMessageLog && !previewMode) {
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
            runId,
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
