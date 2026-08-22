import { v4 as uuidv4 } from 'uuid';
import emailSettingsRepository from '../../repositories/email/emailSettings.repository.js';
import { classifyBounceType, isSmtpAuthConfigError } from '../../utils/emailBounce.utils.js';
import { decryptSmtpSecret } from '../../utils/smtpSecretCrypto.js';
import { resolveFromAddress, extractBrandDomain } from '../../utils/emailFromAddress.util.js';
import { EFFECTIVE_PLAN_ID_SQL, resolveBillingUserId } from '../../utils/billingCycle.util.js';
import { maybeDebitWalletForSend } from '../payment/topupWallet.service.js';
import { checkSendQuota, recordDirectSendUsage } from '../../utils/userSendLimit.util.js';

const EMAIL_OWNER_PREDICATE = `(c.id_user = $1 OR c.id_user IN (
   SELECT um.employee_id FROM user_members um
   WHERE um.owner_id = $1 AND um.status = 'active'))`;

function createServiceError(message, statusCode, extra = {}) {
  const error = new Error(message);
  error.statusCode = statusCode;
  Object.assign(error, extra);
  return error;
}

class EmailSettingsSmtpService {
  async assertDirectEmailQuota({ userId, roleCode, ownerContextId, recipientCount }) {
    const quota = await checkSendQuota({
      userId,
      roleCode,
      ownerContextId,
      channel: 'email',
      requiredCount: recipientCount,
    });
    if (!quota.allowed) {
      throw createServiceError(quota.message || 'Đã vượt hạn mức gửi email', 403, {
        code: 'SEND_QUOTA_EXCEEDED',
      });
    }
    return quota;
  }

  async recordDirectEmailQuota({ quota, userId, recipientCount, source }) {
    if (!quota?.billingUserId) return;
    await recordDirectSendUsage({
      billingUserId: quota.billingUserId,
      channel: 'email',
      amount: recipientCount,
      actorUserId: userId,
      source,
    });
  }

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

  async logEmailSent(payload) {
    const runIdNum = Number.isFinite(parseInt(payload?.runId, 10))
      ? parseInt(payload.runId, 10)
      : null;
    // Không có runId thì coi là gửi demo/manual, không tạo bản ghi email_messages/journey để tránh dữ liệu mồ côi.
    if (!runIdNum) return null;

    return emailSettingsRepository.withTransaction(async (client) => {
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
        idNode: payload.nodeId ?? null,
        emailStep: payload.emailStep ?? null,
        // Track actual from + reply-to used at send time
        fromAddress: payload.fromAddress || null,
        replyTo: payload.setting.reply_to || payload.setting.email || null,
        brandDomain: payload.brandDomain || null,
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

      // Trừ ví trong cùng TX khi gửi thành công / bounce (đếm vào hạn mức tháng).
      // Không debit trên đường SMTP failed (status sẽ chuyển failed, không đếm quota).
      if (payload.debitWallet && emailMessageId) {
        const billingUserId = await resolveBillingUserId(payload.userId);
        if (billingUserId) {
          const { rows: limitRows } = await client.query(
            `SELECT p.monthly_email_limit
             FROM users u
             JOIN plans p ON p.id = (${EFFECTIVE_PLAN_ID_SQL})
             WHERE u.id = $1
             LIMIT 1`,
            [billingUserId]
          );
          const planLimit = limitRows[0]?.monthly_email_limit;
          const planLimitNum = planLimit == null || planLimit === ''
            ? null
            : Number.parseInt(planLimit, 10);
          const { getBillingCycle } = await import('../../utils/billingCycle.util.js');
          const { countEmailSentThisMonth } = await import('../../utils/userSendLimit.util.js');
          const cycle = await getBillingCycle(billingUserId, {}, client);
          const usageCountAfterSend = (cycle?.hasPlan && cycle.cycleStart && cycle.cycleEnd)
            ? await countEmailSentThisMonth(
                billingUserId,
                cycle.cycleStart,
                cycle.cycleEnd,
                client
              )
            : 0;
          await maybeDebitWalletForSend(client, {
            billingUserId,
            itemKey: 'emails',
            sourceKey: `email_message:${emailMessageId}`,
            planLimit: Number.isFinite(planLimitNum) ? planLimitNum : null,
            usageCountAfterSend,
          });
        }
      }

      return emailMessageId;
    });
  }

  async testConnection(payload, deps) {
    try {
      const { smtpHost, smtpPort, smtpUsername, smtpPassword } = payload;
      const transporter = deps.createSmtpTransporter({
        host: smtpHost,
        port: smtpPort,
        username: smtpUsername,
        password: smtpPassword,
      });
      await transporter.verify();
      return { message: 'Kết nối SMTP thành công' };
    } catch (error) {
      throw createServiceError('Không thể kết nối đến SMTP server: ' + error.message, 400);
    }
  }

  async sendTestEmail({ userId, roleCode, ownerContextId, id, payload }, deps) {
    const { to, subject, content, htmlContent } = payload;
    const workspaceOwnerId = ownerContextId || userId;
    const setting = await emailSettingsRepository.getById(workspaceOwnerId, id, { roleCode });
    if (!setting) {
      throw createServiceError('Không tìm thấy cấu hình email', 404);
    }
    const quota = await this.assertDirectEmailQuota({
      userId,
      roleCode,
      ownerContextId,
      recipientCount: 1,
    });

    const transporter = deps.createSmtpTransporter({
      host: setting.smtp_host,
      port: setting.smtp_port,
      username: setting.smtp_username,
      password: decryptSmtpSecret(setting.smtp_password),
    });

    const info = await transporter.sendMail({
      from: resolveFromAddress(setting),
      to,
      replyTo: setting.reply_to || undefined,
      text: content || 'Đây là email test từ hệ thống Founder AI',
      html: htmlContent || `<p>${content || 'Đây là email test từ hệ thống Founder AI'}</p>`,
    });

    await emailSettingsRepository.incrementSentCount(id);
    await this.recordDirectEmailQuota({
      quota,
      userId,
      recipientCount: 1,
      source: 'email_test',
    });
    return {
      messageId: info.messageId,
      to,
      subject,
    };
  }

  async sendCustomEmail({ userId, roleCode, ownerContextId, payload, trackingConfig }, deps) {
    const workspaceOwnerId = ownerContextId || userId;
    const isPreviewMode = this.normalizePreviewMode(payload);
    const isBuilderMode = this.normalizeBuilderMode(payload);
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
    } = payload;
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
      const row = await emailSettingsRepository.findEmailDeliveryStatus(workspaceOwnerId, to);
      if (row) {
        if (row.email_subscribed === false) {
          throw createServiceError('Người nhận đã hủy đăng ký nhận email', 422, {
            data: { skipped: true, reason: 'unsubscribed' },
          });
        }
        if (row.email_hard_bounced === true) {
          throw createServiceError('Địa chỉ email người nhận bị hard bounce — không thể gửi', 422, {
            data: { skipped: true, reason: 'hard_bounced' },
          });
        }
      }
    }

    const ccList = deps.normalizeEmailList(cc);
    const bccList = deps.normalizeEmailList(bcc);
    const recipientCount = 1 + ccList.length + bccList.length;
    const quota = await this.assertDirectEmailQuota({
      userId,
      roleCode,
      ownerContextId,
      recipientCount,
    });
    const trackingToken = uuidv4();
    const { baseUrl: trackingBaseUrl, isPublic, source } = trackingConfig;
    const trackingWarnings = [];
    if (!shouldForcePreviewOnly && !isPublic) {
      trackingWarnings.push(
        'Tracking URL chưa public. Hãy đặt TRACKING_BASE_URL là domain HTTPS public để theo dõi mở/click từ Gmail.'
      );
    }

    const setting = await emailSettingsRepository.getActiveById(workspaceOwnerId, fromEmailId, { roleCode });
    if (!setting) {
      throw createServiceError('Không tìm thấy cấu hình email hoặc email chưa kích hoạt', 404);
    }

    const transporter = deps.createSmtpTransporter({
      host: setting.smtp_host,
      port: setting.smtp_port,
      username: setting.smtp_username,
      password: decryptSmtpSecret(setting.smtp_password),
    });

    // BUGFIX (Bug — Quick Send empty body fallback): previously this method
    // silently substituted "Đây là email từ hệ thống Founder AI" for an
    // empty `content` field. That string then went out to real recipients
    // when the user picked a template with no body. Reject empty bodies
    // up-front so the caller (QuickSend / Campaign Run) gets a clear 422
    // instead of silently shipping a placeholder email.
    const hasContent = (val) => typeof val === 'string' && val.trim().length > 0;
    if (!hasContent(content) && !hasContent(htmlContent)) {
      throw createServiceError(
        'Nội dung email đang trống. Hãy chọn template có nội dung hoặc nhập nội dung trước khi gửi.',
        422,
        { code: 'EMPTY_EMAIL_BODY' }
      );
    }
    const plainTextContent = content || '';
    // Convert plain text paragraphs (separated by \n\n) to HTML <p> tags
    const rawHtml = htmlContent
      || plainTextContent
          .split(/\n\n+/)
          .map((para) => (para.trim() ? `<p>${para.trim()}</p>` : ''))
          .join('');
    // Luôn giữ body gốc, không thêm block link tài liệu đính kèm.
    /**
     * Luôn thêm footer hủy đăng ký/chính sách bảo mật cho cả Build và Run để email nhất quán.
     * - Build/preview: chỉ thêm footer, tắt rewrite click tracking.
     * - Run thật: giữ đầy đủ tracking open/click như hiện tại.
     */
    const trackedHtmlContent = await deps.buildTrackedHtml(
      rawHtml,
      trackingBaseUrl,
      trackingToken,
      campaignId,
      customerId,
      normalizedRunId,
      { enableClickTracking: !shouldForcePreviewOnly }
    );

    const realMailAttachments = Array.isArray(attachments) && attachments.length > 0
      ? await deps.buildMailAttachments(attachments)
      : [];

    // Resolve actual from address before sending (so we can log it)
    const fromAddress = resolveFromAddress(setting);
    const brandDomain = setting.brand_domain || extractBrandDomain(setting.email);

    let info;
    try {
      info = await transporter.sendMail({
        from: fromAddress,
        replyTo: setting.reply_to || undefined,
        to,
        cc: ccList.length ? ccList : undefined,
        bcc: bccList.length ? bccList : undefined,
        subject: subject || 'Email từ Founder AI',
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
        throw createServiceError(`Lỗi cấu hình SMTP: ${bounceReason}`, 422, {
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
        await emailSettingsRepository.markCustomerHardBounced(workspaceOwnerId, to)
          .catch((e) => console.error('[sendCustomEmail] Lỗi cập nhật hard bounce:', e.message));
      }

      throw createServiceError(`${bounceType === 'hard' ? 'Hard bounce' : 'Soft bounce'}: ${bounceReason}`, 422, {
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
        await this.logEmailSent({
          userId: workspaceOwnerId,
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
          fromAddress,
          brandDomain,
        });
      } catch (logError) {
        console.error('Log email message error:', logError);
      }
    }

    // Luồng campaign đã có email_messages cho người nhận chính. CC/BCC không có
    // row riêng nên ghi phần chênh lệch vào usage_logs để quota/ví đếm đúng.
    const directUsageCount = shouldSaveMessageLog
      ? ccList.length + bccList.length
      : recipientCount;
    if (directUsageCount > 0) {
      await this.recordDirectEmailQuota({
        quota,
        userId,
        recipientCount: directUsageCount,
        source: shouldForcePreviewOnly ? 'email_preview' : 'email_direct',
      });
    }

    return {
      messageId: info.messageId,
      from: fromAddress,
      fromDomain: brandDomain,
      replyTo: setting.reply_to || null,
      to,
      cc: ccList,
      bcc: bccList,
      subject,
      sentAt: deps.formatUtc7(),
      tracking: {
        baseUrl: trackingBaseUrl,
        source,
        isPublic,
        warnings: trackingWarnings,
      },
    };
  }
}

export default new EmailSettingsSmtpService();
