import { v4 as uuidv4 } from 'uuid';
import emailSettingsRepository from '../../repositories/email/emailSettings.repository.js';
import {
  classifyBounceType,
  isSmtpAuthConfigError,
  isRecipientAddressNotFoundError,
  isSmtpProviderRateLimitError,
} from '../../utils/emailBounce.utils.js';
import { decryptSmtpSecret } from '../../utils/smtpSecretCrypto.js';
import { resolveFromAddress, extractBrandDomain, resolveEnvelopeFrom } from '../../utils/emailFromAddress.util.js';
import { EFFECTIVE_PLAN_ID_SQL, resolveBillingUserId } from '../../utils/billingCycle.util.js';
import { maybeDebitWalletForSend, debitDirectEmailIfNeeded } from '../payment/topupWallet.service.js';
import { checkSendQuota, recordDirectSendUsage } from '../../utils/userSendLimit.util.js';
import {
  reserveSendQuota,
  markSendQuotaSending,
  consumeSendQuota,
  releaseSendQuota,
  markSendQuotaUncertain,
} from '../quota/sendQuotaReservation.service.js';
import {
  buildDirectReservationKey,
  buildPreviewReservationKey,
  buildQuickSendReservationKey,
  computeRequestFingerprint,
  resolveRequestIdempotencyKey,
} from '../quota/sendQuotaKey.service.js';

const EMAIL_OWNER_PREDICATE = `(c.id_user = $1 OR c.id_user IN (
   SELECT um.employee_id FROM user_members um
   WHERE um.owner_id = $1 AND um.status = 'active'))`;

function createServiceError(message, statusCode, extra = {}) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.status = statusCode;
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
    try {
      await recordDirectSendUsage({
        billingUserId: quota.billingUserId,
        channel: 'email',
        amount: recipientCount,
        actorUserId: userId,
        source,
      });
    } catch (e) {
      console.warn('[EmailSettingsSmtp] recordDirectEmailQuota error:', e.message);
    }
  }

  /**
   * Chuẩn hóa cờ preview từ nhiều biến thể payload để tương thích ngược FE/BE.
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
   * @param {object} body payload request body
   * @returns {boolean} true nếu gọi từ Email Builder
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

  async testConnection(body = {}, deps) {
    const rawPort = Number.parseInt(body.smtp_port ?? body.smtpPort, 10);
    const transporter = deps.createSmtpTransporter({
      host: body.smtp_host ?? body.smtpHost,
      port: Number.isFinite(rawPort) ? rawPort : 465,
      username: body.smtp_username ?? body.smtpUsername,
      password: body.smtp_password ?? body.smtpPassword,
    });
    await transporter.verify();
    return {
      message: 'Kết nối SMTP thành công',
    };
  }

  /**
   * Logs sent email message to DB with an explicit transaction client.
   * Used by atomic persistSource callback and legacy logEmailSent.
   */
  async logEmailSentWithClient(client, payload) {
    const runIdNum = Number.isFinite(parseInt(payload?.runId, 10))
      ? parseInt(payload.runId, 10)
      : null;
    const isPreview = Boolean(payload?.isPreview) || !runIdNum;

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
      messageId: payload.info?.messageId || null,
      trackingToken: payload.trackingToken,
      recipientEmail: payload.to,
      senderEmail: payload.setting?.email,
      senderName: payload.setting?.name,
      subject: payload.subject || null,
      bodyHtml: payload.trackedHtmlContent || null,
      bodyText: payload.plainTextContent || null,
      sentAt: payload.sentAt,
      idNode: payload.nodeId ?? null,
      emailStep: payload.emailStep ?? null,
      fromAddress: payload.fromAddress || null,
      replyTo: payload.setting?.reply_to || payload.setting?.email || null,
      brandDomain: payload.brandDomain || null,
      isPreview,
      quotaReservationId: payload.quotaReservationId || payload.reservationId || null,
    });

    if (resolvedCustomerId && !isPreview) {
      await emailSettingsRepository.updateCustomerLastEmailSent(
        client,
        payload.sentAt,
        resolvedCustomerId,
        payload.userId
      );
    }

    if (campaignIdNum && resolvedCustomerId && !isPreview) {
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
          messageId: payload.info?.messageId || null,
          trackingToken: payload.trackingToken,
          description: `Đã gửi email "${payload.subject || 'Không có tiêu đề'}"`,
        }),
        sentAt: payload.sentAt,
      });
      await emailSettingsRepository.incrementCampaignSent(client, campaignIdNum);
    }

    return emailMessageId;
  }

  async logEmailSent(payload) {
    const runIdNum = Number.isFinite(parseInt(payload?.runId, 10))
      ? parseInt(payload.runId, 10)
      : null;
    const isPreview = Boolean(payload?.isPreview) || !runIdNum;

    return emailSettingsRepository.withTransaction(async (client) => {
      const emailMessageId = await this.logEmailSentWithClient(client, payload);

      if (payload.debitWallet && emailMessageId) {
        const planResult = await client.query(
          `SELECT ${EFFECTIVE_PLAN_ID_SQL} AS effective_plan_id FROM users u WHERE u.id = $1`,
          [payload.userId]
        );
        const planId = planResult.rows[0]?.effective_plan_id;
        const billingUserId = await resolveBillingUserId(payload.userId, planId, client);

        if (billingUserId) {
          await debitDirectEmailIfNeeded(client, {
            billingUserId,
            emailMessageId,
            totalRecipients: 1,
            isPreview,
          });
        }
      }

      return emailMessageId;
    });
  }

  async sendTestEmail({ userId, roleCode, ownerContextId, id, payload }, deps) {
    const workspaceOwnerId = ownerContextId || userId;
    const { to, subject, content, htmlContent } = payload;
    if (!to || typeof to !== 'string' || !to.trim()) {
      throw createServiceError('Vui lòng nhập email người nhận', 400);
    }
    const cleanTo = to.trim();

    const setting = await emailSettingsRepository.getById(workspaceOwnerId, id, { roleCode });
    if (!setting) {
      throw createServiceError('Không tìm thấy cấu hình email', 404);
    }

    const rawKey = payload.idempotencyKey || payload.clientKey || null;
    const clientKey = resolveRequestIdempotencyKey(rawKey);
    const reservationKey = buildPreviewReservationKey({
      channel: 'email',
      billingUserId: workspaceOwnerId,
      requestKey: clientKey,
      recipient: cleanTo,
    });

    const requestPayload = {
      channel: 'email',
      to: cleanTo,
      subject: subject || 'Email test',
      content: content || 'Đây là email test',
      htmlContent: htmlContent || '',
      fromEmailId: id,
    };
    const requestFingerprint = computeRequestFingerprint(requestPayload);

    // Trusted server-side option only; never trust user-supplied payload.sourceType
    const effectiveSourceType = deps?.sourceType === 'quick_send' ? 'quick_send' : 'direct_email';
    const reservation = await reserveSendQuota({
      userId,
      roleCode,
      ownerContextId: workspaceOwnerId,
      channel: 'email',
      quantity: 1,
      reservationKey,
      requestFingerprint,
      requestPayload,
      sourceType: effectiveSourceType,
    });

    if (reservation.mode === 'enforce' || reservation.mode === 'test_enforce') {
      if (reservation.status === 'consumed') {
        const snapshot = reservation.responseSnapshot || reservation.response_snapshot || reservation.responsePayload || {};
        return {
          messageId: snapshot.messageId || null,
          to: cleanTo,
          subject,
          isReplay: true,
        };
      }
      await markSendQuotaSending({ reservationId: reservation.id });
    }

    let transporter;
    try {
      transporter = deps.createSmtpTransporter({
        host: setting.smtp_host,
        port: setting.smtp_port,
        username: setting.smtp_username,
        password: decryptSmtpSecret(setting.smtp_password),
      });
    } catch (transporterErr) {
      // Reservation đã ở 'sending' nhưng provider CHƯA từng được gọi — an toàn để
      // release (không phải trạng thái mơ hồ) chứ không phải mắc kẹt vĩnh viễn.
      if (reservation?.id && (reservation.mode === 'enforce' || reservation.mode === 'test_enforce')) {
        try {
          await releaseSendQuota({
            reservationId: reservation.id,
            failureCode: 'SMTP_TRANSPORTER_INIT_FAILED',
            reason: transporterErr.message || 'Failed to create SMTP transporter',
          });
        } catch (e) {
          console.warn('[sendTestEmail] releaseSendQuota after transporter init failure:', e.message);
        }
      }
      throw transporterErr;
    }

    let info;
    try {
      info = await transporter.sendMail({
        from: resolveFromAddress(setting),
        to: cleanTo,
        replyTo: setting.reply_to || undefined,
        text: content || 'Đây là email test từ hệ thống Founder AI',
        html: htmlContent || `<p>${content || 'Đây là email test từ hệ thống Founder AI'}</p>`,
      });
    } catch (smtpError) {
      if (reservation?.id && (reservation.mode === 'enforce' || reservation.mode === 'test_enforce')) {
        try {
          const bounceType = classifyBounceType(smtpError);
          const isHardBounce = isRecipientAddressNotFoundError(smtpError)
            || bounceType === 'hard'
            || (smtpError.responseCode >= 500 && smtpError.responseCode < 600);
          const isTimeout = smtpError.code === 'ETIMEDOUT'
            || smtpError.code === 'ESOCKET'
            || smtpError.code === 'ECONNRESET'
            || String(smtpError?.message || '').toLowerCase().includes('timeout');

          if (isTimeout) {
            await markSendQuotaUncertain({
              reservationId: reservation.id,
              failureCode: 'SMTP_NETWORK_TIMEOUT',
              reason: 'SMTP connection timed out',
            });
          } else if (isSmtpAuthConfigError(smtpError)) {
            await releaseSendQuota({
              reservationId: reservation.id,
              failureCode: 'SMTP_CONFIG_ERROR',
              reason: 'smtp_config_error',
            });
          } else if (isSmtpProviderRateLimitError(smtpError)) {
            await releaseSendQuota({
              reservationId: reservation.id,
              failureCode: 'PROVIDER_RATE_LIMITED',
              reason: 'provider_rate_limited',
            });
          } else if (isHardBounce) {
            const sanitizedError = String(smtpError?.message || '')
              .replace(/[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+/g, '[REDACTED_EMAIL]')
              .slice(0, 500);
            const failureSnap = { failed: true, errorType: 'hard_bounce', error: sanitizedError };
            try {
              await consumeSendQuota({
                reservationId: reservation.id,
                responseSnapshot: failureSnap,
                responsePayload: failureSnap,
                persistSource: async () => ({ sourceKey: `email_test_hard_bounce:${reservation.id}` }),
              });
            } catch (settleErr) {
              console.warn('[sendTestEmail] consumeSendQuota for hard bounce failed:', settleErr.message);
              await markSendQuotaUncertain({
                reservationId: reservation.id,
                failureCode: 'CONSUME_DB_FAILED',
                reason: 'Failed to settle test email hard bounce',
              }).catch(() => {});
            }
          } else {
            await releaseSendQuota({
              reservationId: reservation.id,
              failureCode: 'SMTP_ERROR',
              reason: smtpError.message || 'SMTP_ERROR',
            });
          }
        } catch (e) {
          console.warn('[sendTestEmail] quota error handling failed:', e.message);
        }
      }
      throw smtpError;
    }

    if (reservation?.id && (reservation.mode === 'enforce' || reservation.mode === 'test_enforce')) {
      const respSnapshot = { messageId: info.messageId, to: cleanTo, subject };
      try {
        await consumeSendQuota({
          reservationId: reservation.id,
          responseSnapshot: respSnapshot,
          responsePayload: respSnapshot,
          persistSource: async (txClient) => {
            await emailSettingsRepository.incrementSentCount(id, txClient);
            return { sourceKey: `email_test:${reservation.id}` };
          },
        });
      } catch (consumeErr) {
        // SMTP đã gửi thật (info.messageId tồn tại) nhưng ghi nhận quota lỗi — release
        // sẽ cho phép gửi trùng, phải đánh dấu uncertain để đối soát tay.
        console.warn('[sendTestEmail] consumeSendQuota failed after successful send:', consumeErr.message);
        try {
          await markSendQuotaUncertain({
            reservationId: reservation.id,
            failureCode: 'CONSUME_DB_FAILED',
            reason: 'Failed to settle test email reservation after successful send',
          });
        } catch (_) {}
      }
    } else {
      await emailSettingsRepository.incrementSentCount(id);
      const legacyDecision = reservation.legacyDecision || reservation.legacyResult;
      const billingUserId = legacyDecision?.billingUserId || null;
      if (billingUserId) {
        await this.recordDirectEmailQuota({
          quota: { billingUserId },
          userId,
          recipientCount: 1,
          source: 'email_test',
        });
      }
    }

    return {
      messageId: info.messageId,
      to: cleanTo,
      subject,
    };
  }

  async sendCustomEmail({ userId, roleCode, ownerContextId, payload, trackingConfig, options = {} }, deps) {
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

    const shouldForcePreviewOnly = isPreviewMode || isBuilderMode || !normalizedRunId;
    const shouldSaveMessageLog = saveMessageLog !== false;

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

    const trackingToken = uuidv4();
    const { baseUrl: trackingBaseUrl, isPublic, source } = trackingConfig || {};
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

    const hasContent = (val) => typeof val === 'string' && val.trim().length > 0;
    if (!hasContent(content) && !hasContent(htmlContent)) {
      throw createServiceError(
        'Nội dung email đang trống. Hãy chọn template có nội dung hoặc nhập nội dung trước khi gửi.',
        422,
        { code: 'EMPTY_EMAIL_BODY' }
      );
    }
    const plainTextContent = content || '';
    const rawHtml = htmlContent
      || plainTextContent
          .split(/\n\n+/)
          .map((para) => (para.trim() ? `<p>${para.trim()}</p>` : ''))
          .join('');

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

    const fromAddress = resolveFromAddress(setting);
    const brandDomain = setting.brand_domain || extractBrandDomain(setting.email);
    const envelopeFrom = resolveEnvelopeFrom(setting, trackingToken);
    const allRecipients = [to, ...ccList, ...bccList].filter(Boolean);

    // 1. Reserve quota atomically
    // Trusted server-side option only; NEVER trust user-supplied payload.sourceType or trackingConfig
    const effectiveSourceType = (options?.sourceType === 'quick_send' || deps?.sourceType === 'quick_send') ? 'quick_send' : 'direct_email';
    const rawKey = payload?.idempotencyKey || payload?.clientKey || options?.idempotencyKey || deps?.idempotencyKey || null;
    const clientKey = resolveRequestIdempotencyKey(rawKey);
    let reservationKey;
    if (effectiveSourceType === 'quick_send') {
      reservationKey = buildQuickSendReservationKey({
        channel: 'email',
        billingUserId: workspaceOwnerId,
        requestKey: clientKey,
        recipient: to,
      });
    } else if (shouldForcePreviewOnly) {
      reservationKey = buildPreviewReservationKey({
        channel: 'email',
        billingUserId: workspaceOwnerId,
        requestKey: clientKey,
        recipient: to,
      });
    } else {
      reservationKey = buildDirectReservationKey({
        channel: 'email',
        billingUserId: workspaceOwnerId,
        clientKey,
        recipient: to,
      });
    }

    const requestPayload = {
      channel: 'email',
      to,
      subject: subject || 'Email từ Founder AI',
      fromEmailId,
      content: plainTextContent,
      htmlContent: rawHtml || htmlContent || '',
      cc: ccList,
      bcc: bccList,
      attachments: attachments || [],
      quantity: recipientCount,
    };
    const requestFingerprint = computeRequestFingerprint(requestPayload);

    const reserveFn = deps?.reserveSendQuota || reserveSendQuota;
    const releaseFn = deps?.releaseSendQuota || releaseSendQuota;
    const consumeFn = deps?.consumeSendQuota || consumeSendQuota;
    const markUncertainFn = deps?.markSendQuotaUncertain || markSendQuotaUncertain;
    const markSendingFn = deps?.markSendQuotaSending || markSendQuotaSending;

    const reservationInput = {
      userId,
      roleCode,
      ownerContextId: workspaceOwnerId,
      channel: 'email',
      quantity: recipientCount,
      reservationKey,
      requestFingerprint,
      requestPayload,
      sourceType: effectiveSourceType,
    };
    const reservation = options && Object.keys(options).length > 0
      ? await reserveFn(reservationInput, options)
      : await reserveFn(reservationInput);

    const optArg = options && Object.keys(options).length > 0 ? [options] : [];

    if (reservation.mode === 'enforce' || reservation.mode === 'test_enforce') {
      if (reservation.status === 'consumed') {
        const snapshot = reservation.responseSnapshot || reservation.response_snapshot || reservation.responsePayload || {};
        return {
          messageId: snapshot.messageId || null,
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
          isReplay: true,
        };
      }
      await markSendQuotaSending({ reservationId: reservation.id }, ...optArg);
    }

    let transporter;
    try {
      transporter = deps.createSmtpTransporter({
        host: setting.smtp_host,
        port: setting.smtp_port,
        username: setting.smtp_username,
        password: decryptSmtpSecret(setting.smtp_password),
      });
    } catch (transporterErr) {
      // Reservation đã ở 'sending' nhưng provider CHƯA từng được gọi — an toàn để
      // release (không phải trạng thái mơ hồ) chứ không phải mắc kẹt vĩnh viễn.
      if (reservation?.id && (reservation.mode === 'enforce' || reservation.mode === 'test_enforce')) {
        try {
          await releaseFn({
            reservationId: reservation.id,
            failureCode: 'SMTP_TRANSPORTER_INIT_FAILED',
            reason: transporterErr.message || 'Failed to create SMTP transporter',
          }, ...optArg);
        } catch (e) {
          console.warn('[sendCustomEmail] releaseSendQuota after transporter init failure:', e.message);
        }
      }
      throw transporterErr;
    }

    let info;
    try {
      info = await transporter.sendMail({
        from: fromAddress,
        to,
        cc: ccList.length > 0 ? ccList : undefined,
        bcc: bccList.length > 0 ? bccList : undefined,
        replyTo: setting.reply_to || undefined,
        envelope: {
          from: envelopeFrom,
          to: allRecipients,
        },
        subject,
        text: plainTextContent,
        html: trackedHtmlContent,
        attachments: realMailAttachments,
      });
    } catch (smtpError) {
      const isRateLimit = isSmtpProviderRateLimitError(smtpError);
      const isRecipientNotFound = isRecipientAddressNotFoundError(smtpError);
      const bounceType = classifyBounceType(smtpError);
      const isHardBounce = isRecipientNotFound || bounceType === 'hard' || (smtpError.responseCode >= 500 && smtpError.responseCode < 600);
      const bounceReason = String(smtpError?.message || '').slice(0, 500);

      const smtpConfigError = isSmtpAuthConfigError(smtpError);

      if (smtpConfigError) {
        console.warn(`[sendCustomEmail] SMTP config/auth error cho ${to}: ${bounceReason}`);
      } else {
        console.warn(`[sendCustomEmail] SMTP ${bounceType} bounce cho ${to}: ${bounceReason}`);
      }

      if (reservation?.id && (reservation.mode === 'enforce' || reservation.mode === 'test_enforce')) {
        try {
          if (smtpConfigError) {
            await releaseFn({
              reservationId: reservation.id,
              failureCode: 'SMTP_CONFIG_ERROR',
              reason: 'smtp_config_error',
            }, ...optArg);
          } else if (isRateLimit) {
            await releaseFn({
              reservationId: reservation.id,
              failureCode: 'PROVIDER_RATE_LIMITED',
              reason: 'provider_rate_limited',
            }, ...optArg);
          } else if (isHardBounce) {
            // Billable hard bounce -> consumed according to baseline audit contract
            const sanitizedError = String(bounceReason || '')
              .replace(/[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+/g, '[REDACTED_EMAIL]')
              .slice(0, 500);
            const failureSnap = { failed: true, errorType: 'hard_bounce', error: sanitizedError };
            try {
              await consumeFn({
                reservationId: reservation.id,
                responseSnapshot: failureSnap,
                responsePayload: failureSnap,
                persistSource: async (txClient) => {
                  let loggedMessageId = null;
                  if (shouldSaveMessageLog) {
                    loggedMessageId = await emailSettingsRepository.insertEmailMessage(txClient, {
                      campaignId: campaignId || null,
                      runId: normalizedRunId,
                      customerId: customerId || null,
                      templateId: emailTemplateId || null,
                      fromEmailId,
                      recipientEmail: to,
                      recipientName: null,
                      senderEmail: fromAddress,
                      senderName: setting.name || null,
                      subject,
                      bodyHtml: trackedHtmlContent,
                      bodyText: plainTextContent,
                      status: 'bounced',
                      sentAt: new Date(),
                      nodeId: null,
                      emailStep: null,
                      messageId: null,
                      trackingToken,
                      quotaReservationId: reservation.id,
                      isPreview: shouldForcePreviewOnly,
                    });
                  }

                  if (!shouldForcePreviewOnly) {
                    await emailSettingsRepository.incrementSentCount(fromEmailId, txClient);
                  }
                  if (!isPreviewMode && !isBuilderMode) {
                    await emailSettingsRepository.markCustomerHardBounced(workspaceOwnerId, to, txClient);
                  }
                  return { sourceKey: loggedMessageId ? `email_message:${loggedMessageId}` : `email_hard_bounce:${reservation.id}` };
                },
              }, ...optArg);
            } catch (settleErr) {
              console.warn('[sendCustomEmail] consumeSendQuota for hard bounce failed:', settleErr.message);
              await markUncertainFn({
                reservationId: reservation.id,
                failureCode: 'CONSUME_DB_FAILED',
                reason: 'Failed to settle hard bounce reservation',
              }, ...optArg).catch(() => {});
            }
          } else if (smtpError.code === 'ETIMEDOUT' || smtpError.code === 'ESOCKET' || smtpError.code === 'ECONNRESET' || bounceReason.includes('timeout')) {
            await markUncertainFn({
              reservationId: reservation.id,
              failureCode: 'SMTP_NETWORK_TIMEOUT',
              reason: 'SMTP connection timed out',
            }, ...optArg);
          } else {
            await releaseFn({
              reservationId: reservation.id,
              failureCode: 'SMTP_SOFT_BOUNCE',
              reason: `${bounceType}_bounce`,
            }, ...optArg);
          }
        } catch (e) {
          console.warn('[sendCustomEmail] release/uncertain error:', e.message);
        }
      }

      if (!shouldForcePreviewOnly && !isHardBounce) {
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

      if (bounceType === 'hard' && !shouldForcePreviewOnly && (!reservation?.id || (reservation.mode !== 'enforce' && reservation.mode !== 'test_enforce'))) {
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

    const sentAt = new Date();

    if (reservation?.id && (reservation.mode === 'enforce' || reservation.mode === 'test_enforce')) {
      const respSnapshot = { messageId: info.messageId, to, subject };
      try {
        await consumeSendQuota({
          reservationId: reservation.id,
          responseSnapshot: respSnapshot,
          responsePayload: respSnapshot,
          persistSource: async (txClient) => {
            let loggedMessageId = null;
            if (shouldSaveMessageLog) {
              loggedMessageId = await this.logEmailSentWithClient(txClient, {
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
                isPreview: shouldForcePreviewOnly,
                quotaReservationId: reservation.id,
              });
            }
            if (!shouldForcePreviewOnly) {
              await emailSettingsRepository.incrementSentCount(fromEmailId, txClient);
            }
            return {
              sourceKey: loggedMessageId ? `email_message:${loggedMessageId}` : `email_direct:${reservation.id}`,
            };
          },
        }, ...optArg);
      } catch (consumeErr) {
        // SMTP đã gửi thật (info.messageId tồn tại) nhưng ghi nhận quota lỗi — release
        // sẽ cho phép gửi trùng, phải đánh dấu uncertain để đối soát tay.
        console.warn('[sendCustomEmail] consumeSendQuota failed after successful send:', consumeErr.message);
        try {
          await markUncertainFn({
            reservationId: reservation.id,
            failureCode: 'CONSUME_DB_FAILED',
            reason: 'Failed to settle reservation after successful send',
          }, ...optArg);
        } catch (_) {}
      }
    } else {
      // Legacy fallback
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
            isPreview: shouldForcePreviewOnly,
            debitWallet: true,
          });
        } catch (logError) {
          console.error('Log email message error:', logError);
        }
      }

      if (!shouldForcePreviewOnly) {
        await emailSettingsRepository.incrementSentCount(fromEmailId).catch(() => {});
      }

      const legacyDecision = reservation.legacyDecision || reservation.legacyResult;
      const billingUserId = legacyDecision?.billingUserId || null;
      if (billingUserId) {
        const directUsageCount = shouldSaveMessageLog && !shouldForcePreviewOnly
          ? ccList.length + bccList.length
          : recipientCount;
        if (directUsageCount > 0) {
          await this.recordDirectEmailQuota({
            quota: { billingUserId },
            userId,
            recipientCount: directUsageCount,
            source: shouldForcePreviewOnly ? 'email_preview' : 'email_direct',
          });
        }
      }
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
