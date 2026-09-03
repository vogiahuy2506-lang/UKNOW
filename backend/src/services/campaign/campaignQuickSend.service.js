import emailSettingsSmtpService from '../email/emailSettingsSmtp.service.js';
import emailSettingsController from '../../controllers/emailSettings.controller.js';
import campaignRunService from './campaignRun.service.js';
import campaignZaloSenderService from './campaignZaloSender.service.js';
import zaloSettingsController from '../../controllers/zaloSettings.controller.js';
import zaloMessageRepository from '../../repositories/campaign/zaloMessage.repository.js';
import {
  isZaloOutboundResultSuccessful,
  describeZaloOutboundFailure,
  isZaloPartialDeliveryResult,
} from '../../utils/zaloDispatchDelivery.util.js';
import {
  reserveSendQuota,
  markSendQuotaSending,
  consumeSendQuota,
  releaseSendQuota,
  markSendQuotaUncertain,
} from '../quota/sendQuotaReservation.service.js';
import {
  buildQuickSendReservationKey,
  computeRequestFingerprint,
  resolveRequestIdempotencyKey,
} from '../quota/sendQuotaKey.service.js';
import { recordDirectSendUsage } from '../../utils/userSendLimit.util.js';
import { classifyZaloSendError } from '../../utils/zaloSendErrorClassifier.util.js';

class CampaignQuickSendService {
  /**
   * Send test / quick-send message for Email or Zalo with atomic quota reservation.
   *
   * @param {object} params
   * @param {number} params.actorUserId
   * @param {number} params.workspaceOwnerId
   * @param {string} params.roleCode
   * @param {string} params.channel - 'email' | 'zalo' | 'zalo_personal'
   * @param {string} params.recipient
   * @param {string} [params.message]
   * @param {string} [params.subject]
   * @param {string|number} [params.accountId]
   * @param {Array} [params.attachments]
   * @param {string} [params.htmlContent]
   * @param {object} [options]
   * @returns {Promise<object>}
   */
  async sendQuickTestMessage({
    actorUserId,
    workspaceOwnerId,
    roleCode,
    channel,
    recipient,
    message = '',
    subject = '',
    accountId = null,
    attachments = [],
    htmlContent = null,
  }, options = {}) {
    const cleanRecipient = String(recipient || '').trim();
    if (!cleanRecipient) {
      const err = new Error('Vui lòng nhập địa chỉ / số điện thoại người nhận thử nghiệm');
      err.status = 400;
      throw err;
    }

    const isZalo = channel.startsWith('zalo');
    const resolvedIdempotencyKey = resolveRequestIdempotencyKey(options.idempotencyKey || options.clientKey || null);

    if (!isZalo) {
      // Email Quick Send delegates to emailSettingsSmtpService with atomic quota
      return emailSettingsSmtpService.sendCustomEmail({
        userId: actorUserId,
        roleCode,
        ownerContextId: workspaceOwnerId,
        payload: {
          fromEmailId: accountId,
          to: cleanRecipient,
          subject: subject || 'Thử nghiệm email',
          content: message,
          htmlContent,
          attachments,
          saveMessageLog: false,
          previewMode: true,
          idempotencyKey: resolvedIdempotencyKey,
          sourceType: 'quick_send',
        },
        trackingConfig: {
          baseUrl: process.env.TRACKING_BASE_URL || 'http://localhost:5001',
          isPublic: false,
          source: 'quick_send',
        },
      }, {
        ...options,
        idempotencyKey: resolvedIdempotencyKey,
        sourceType: 'quick_send',
        normalizeEmailList: (v) => emailSettingsController.normalizeEmailList(v),
        buildTrackedHtml: (...args) => emailSettingsController.buildTrackedHtml(...args),
        buildMailAttachments: (items) => emailSettingsController.buildMailAttachments(items),
        createSmtpTransporter: (input) => emailSettingsController.createSmtpTransporter(input),
        formatUtc7: () => emailSettingsController.formatUtc7(),
      });
    }

    // 1. Check quiet hours before outbound Zalo send
    const limiter = campaignRunService.zaloRateLimiter;
    const nextAllowedSendAt = limiter?.computeNextAllowedSendAtByQuietHours
      ? limiter.computeNextAllowedSendAtByQuietHours(Date.now())
      : null;

    if (nextAllowedSendAt) {
      const qs = String(limiter.ZALO_OUTBOUND_QUIET_HOURS_START_SAFE || 23).padStart(2, '0');
      const qe = String(limiter.ZALO_OUTBOUND_QUIET_HOURS_END_SAFE || 6).padStart(2, '0');
      const err = new Error(`Đang trong khung giờ yên lặng (${qs}:00 – ${qe}:00). Hệ thống tạm dừng gửi tin Zalo để bảo vệ tài khoản.`);
      err.status = 400;
      err.code = 'QUIET_HOURS_ACTIVE';
      throw err;
    }

    // 2. Resolve account & API + prepare attachments
    const { account, api } = await zaloSettingsController.resolvePreviewAccountAndApi({
      userId: workspaceOwnerId,
      roleCode,
      accountId,
    });

    const preparedAttachments = await campaignZaloSenderService.prepareZaloAttachmentSources(attachments);

    // 3. Reserve quota atomically
    const requestKey = resolvedIdempotencyKey;
    const reservationKey = buildQuickSendReservationKey({
      channel: 'zalo',
      billingUserId: workspaceOwnerId,
      requestKey,
      recipient: cleanRecipient,
    });

    const requestPayload = {
      recipient: cleanRecipient,
      accountId: account.id || accountId || null,
      message,
      attachments: attachments || [],
    };
    const requestFingerprint = computeRequestFingerprint(requestPayload);

    const reservation = await reserveSendQuota(
      {
        userId: actorUserId,
        roleCode,
        ownerContextId: workspaceOwnerId,
        channel: 'zalo',
        quantity: 1,
        reservationKey,
        requestFingerprint,
        requestPayload,
        sourceType: 'quick_send',
      },
      options
    );

    if (reservation.mode === 'enforce' || reservation.mode === 'test_enforce') {
      if (reservation.status === 'consumed') {
        return {
          success: true,
          message: `Đã gửi tin Zalo thử nghiệm thành công tới ${cleanRecipient} (Replay)`,
          data: reservation.responseSnapshot || reservation.response_snapshot || {},
          isReplay: true,
        };
      }
      await markSendQuotaSending({ reservationId: reservation.id }, options);
    }

    // 4. Dispatch provider call under account mutex
    let sent;
    try {
      sent = await campaignRunService.runWithZaloAccountMutex(account.id, async () => {
        return campaignZaloSenderService.sendPersonalMessage({
          api,
          recipient: cleanRecipient,
          recipientType: 'phone',
          message,
          attachments: preparedAttachments,
        });
      });
    } catch (providerErr) {
      if (reservation?.id && (reservation.mode === 'enforce' || reservation.mode === 'test_enforce')) {
        const classified = classifyZaloSendError(providerErr);
        if (classified.isTimeout) {
          await markSendQuotaUncertain({
            reservationId: reservation.id,
            failureCode: 'TIMEOUT',
            reason: classified.label || 'Network timeout',
          }, options).catch((e) => console.warn('[CampaignQuickSend] markSendQuotaUncertain error:', e.message));
        } else {
          await releaseSendQuota({
            reservationId: reservation.id,
            failureCode: classified.failureCode || classified.category || 'PROVIDER_ERROR',
            reason: classified.label || providerErr.message || 'provider_exception',
          }, options).catch((e) => console.warn('[CampaignQuickSend] releaseSendQuota error:', e.message));
        }
      }
      const err = new Error(`Gửi tin Zalo thất bại: ${providerErr.message}`);
      err.status = 400;
      throw err;
    }

    if (!isZaloOutboundResultSuccessful(sent)) {
      const failure = describeZaloOutboundFailure(sent);
      const classified = classifyZaloSendError(sent?.error || failure.errorMessage || failure.userReason, {
        stage: failure.errorStage,
      });

      if (reservation?.id && (reservation.mode === 'enforce' || reservation.mode === 'test_enforce')) {
        // Partial: một phần nội dung (vd. một ảnh trong album) đã tới máy khách thật.
        // Release ở đây sẽ mở lại slot cho retry gửi LẠI TOÀN BỘ — khách nhận trùng
        // phần đã tới. Coi như timeout: giữ 'uncertain' để đối soát tay, không tự retry.
        if (classified.isTimeout || isZaloPartialDeliveryResult(sent)) {
          await markSendQuotaUncertain({
            reservationId: reservation.id,
            failureCode: isZaloPartialDeliveryResult(sent) ? 'PARTIAL_DELIVERY' : 'TIMEOUT',
            reason: classified.label || (isZaloPartialDeliveryResult(sent) ? 'Partial delivery' : 'Network timeout'),
          }, options).catch((e) => console.warn('[CampaignQuickSend] markSendQuotaUncertain error:', e.message));
        } else {
          await releaseSendQuota({
            reservationId: reservation.id,
            failureCode: classified.failureCode || classified.category || 'PROVIDER_FAILURE',
            reason: classified.label || failure.errorMessage || 'provider_failure',
          }, options).catch((e) => console.warn('[CampaignQuickSend] releaseSendQuota error:', e.message));
        }
      }
      const err = new Error(`Gửi tin Zalo thất bại: ${failure.userReason || failure.errorMessage || 'Lỗi không xác định'}`);
      err.status = 400;
      err.data = failure;
      throw err;
    }

    // 5. Complete quota reservation
    if (reservation?.id && (reservation.mode === 'enforce' || reservation.mode === 'test_enforce')) {
      try {
        await consumeSendQuota(
          {
            reservationId: reservation.id,
            responseSnapshot: sent,
            persistSource: async (txClient) => {
              await zaloMessageRepository.insertCampaignZaloMessage({
                campaignId: null,
                runId: null,
                customerId: null,
                nodeId: null,
                channel: 'zalo_personal',
                recipientType: 'phone',
                recipientValue: cleanRecipient,
                uid: sent.uid || null,
                groupId: null,
                accountId: account.id,
                accountName: String(account.displayName || account.zaloName || account.name || '').trim() || null,
                messageText: message,
                trackingToken: null,
                trackingBaseUrl: null,
                trackingMetadata: {
                  status: 'sent',
                  source: 'quick_send',
                  response: sent.response || null,
                },
                isPreview: false,
                quotaReservationId: reservation.id,
              }, txClient);
            },
          },
          options
        );
      } catch (consumeErr) {
        console.warn('[CampaignQuickSend] consumeSendQuota failed after successful provider send:', consumeErr.message);
        await markSendQuotaUncertain({
          reservationId: reservation.id,
          failureCode: 'CONSUME_DB_FAILED',
        }, options).catch(() => {});
      }
    } else {
      const legacyDecision = reservation.legacyDecision || reservation.legacyResult;
      const billingUserId = legacyDecision?.billingUserId || null;

      if (billingUserId) {
        try {
          await recordDirectSendUsage({
            billingUserId,
            channel: 'zalo',
            amount: 1,
            actorUserId,
            source: 'zalo_quick_send',
          });
        } catch (e) {
          console.warn('[CampaignQuickSend] recordDirectSendUsage error:', e.message);
        }
      }
    }

    return {
      success: true,
      message: `Đã gửi tin Zalo thử nghiệm thành công tới ${cleanRecipient}`,
      data: sent,
    };
  }
}

export default new CampaignQuickSendService();
