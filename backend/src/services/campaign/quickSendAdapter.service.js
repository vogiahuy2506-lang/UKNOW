/**
 * PLAN_GUI_NHANH_TELEGRAM_2026-09-28 + PLAN_WHATSAPP_DOT3_2026-09-29 W7a — GỬI NHANH cho kênh "adapter"
 * (Telegram, WhatsApp): cùng cơ chế với gửi nhanh Zalo/email — trình duyệt lặp, MỖI REQUEST MỘT NGƯỜI —
 * nhưng dùng lại nguyên các mảnh đã kiểm kỹ của bộ chạy kênh (`campaignChannelRunner.service.js`):
 * adapter (`checkReadiness/resolveAccount/sendOne`), chính sách nhịp `descriptor.policy`, cửa sổ trần giờ
 * dùng CHUNG với chiến dịch (`evaluateAdapterSendGate`), nhật ký `campaign_channel_messages`.
 *
 * KHÔNG tạo chiến dịch tạm: trần số chiến dịch của gói đếm mọi dòng `campaigns` (mỗi lần gửi nhanh sẽ ăn một
 * suất) và `campaigns.origin` bị CHECK chỉ `self_created | marketplace_purchased`.
 *
 * Hạn mức đi dưới kênh `zalo` (chk_sqr_channel production chỉ nhận email|zalo; `checkSendQuota` ném kênh lạ),
 * `source_type` = `${channel}_preview`. Dòng ccm ghi `is_preview = true` để các vế đếm hạn mức
 * (`AND NOT ccm.is_preview`) KHÔNG đếm đôi — tin gửi nhanh chỉ được tính qua `usage_logs`, y như Zalo gửi nhanh.
 */
import campaignChannelMessageRepository from '../../repositories/campaign/campaignChannelMessage.repository.js';
import chatbotTelegramRepository from '../../repositories/chatbot/chatbotTelegram.repository.js';
import whatsappCampaignConversationRepository, {
  extractPhoneFromExternalId,
} from '../../repositories/chatbot/whatsappCampaignConversation.repository.js';
import {
  ChannelSendError,
  getAdapterDescriptorBySubtype,
} from './campaignChannelRegistry.service.js';
import { evaluateAdapterSendGate, recordAdapterSendAttempt } from './campaignChannelRunner.service.js';
import campaignShutdownGate from './campaignShutdownGate.js';
import zaloCampaignRecipientService from './zaloCampaignRecipient.service.js';
import { isWhatsAppGroupJid, normalizeWhatsAppPhone } from './channels/whatsapp.campaignChannel.js';
import { checkAccountDailyLimit } from '../quota/accountDailyLimit.service.js';
import { applyAccountDelayOverride } from '../../utils/channelSendSpeed.util.js';
import { renderTemplateText, neutralizeUnresolvedTemplateVariables } from '../../utils/templateVariableAutoMap.util.js';
import {
  reserveSendQuota,
  markSendQuotaSending,
  consumeSendQuota,
  releaseSendQuota,
  markSendQuotaUncertain,
} from '../quota/sendQuotaReservation.service.js';
import {
  buildPreviewReservationKey,
  computeRequestFingerprint,
  resolveRequestIdempotencyKey,
} from '../quota/sendQuotaKey.service.js';
import { checkSendQuota, recordDirectSendUsage } from '../../utils/userSendLimit.util.js';
import {
  TELEGRAM_PHOTO_EXTENSIONS,
  WHATSAPP_IMAGE_EXTENSIONS,
  assertAttachmentListWithinLimits,
} from '../../utils/channelMediaSend.util.js';
import { getWorkspaceContext } from '../../utils/workspaceContext.util.js';

const TELEGRAM_CHAT_ID_PATTERN = /^-?\d+$/;
const DEFAULT_RATE_LIMIT_RETRY_MS = 15 * 60 * 1000;
const MAX_RATE_LIMIT_RETRY_MS = 24 * 60 * 60 * 1000;

/**
 * Cấu hình từng kênh adapter mà gửi nhanh hỗ trợ. Thêm kênh mới = thêm một mục ở đây (+ cờ/adapter đã có).
 * `accountField`: tên trường trong body/đường dẫn chứa tài khoản gửi; `buildNodeConfig`: dựng `node.config`
 * mà adapter mong đợi; `normalizeRecipient`: chuẩn hoá người nhận (null = sai định dạng).
 */
const CHANNELS = Object.freeze({
  telegram: {
    subtype: 'send_telegram',
    accountField: 'accountId',
    maxMessageLength: 4000,
    imageExtensions: TELEGRAM_PHOTO_EXTENSIONS,
    buildNodeConfig: (accountRef) => ({ telegramAccountId: accountRef }),
    normalizeRecipient: (raw) => {
      const value = String(raw ?? '').trim();
      return TELEGRAM_CHAT_ID_PATTERN.test(value) ? value : null;
    },
  },
  whatsapp: {
    subtype: 'send_whatsapp',
    accountField: 'sessionKey',
    maxMessageLength: 4096,
    imageExtensions: WHATSAPP_IMAGE_EXTENSIONS,
    buildNodeConfig: (accountRef) => ({ whatsappSessionKey: accountRef }),
    // CÙNG hàm với adapter/chiến dịch (W4a) — không tự viết quy tắc SĐT riêng. P8b: jid nhóm `@g.us` giữ NGUYÊN
    // (không chuẩn hoá SĐT — jid 18 chữ số sẽ bị loại vì >15).
    normalizeRecipient: (raw) => (isWhatsAppGroupJid(raw) ? String(raw).trim() : normalizeWhatsAppPhone(raw)),
  },
});

export const QUICK_SEND_ADAPTER_CHANNELS = Object.freeze(Object.keys(CHANNELS));

export function isQuickSendAdapterChannel(channel) {
  return Object.prototype.hasOwnProperty.call(CHANNELS, String(channel || ''));
}

function httpError(status, code, message) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

/** Descriptor của kênh nếu cờ bật; cờ tắt -> 409 CHANNEL_DISABLED. */
function requireDescriptor(channel) {
  const cfg = CHANNELS[channel];
  const descriptor = cfg ? getAdapterDescriptorBySubtype(cfg.subtype) : null;
  if (!descriptor) {
    throw httpError(409, 'CHANNEL_DISABLED', 'Kênh này chưa được bật trên hệ thống.');
  }
  return { cfg, descriptor };
}

/**
 * P5 — dinh kem cua gui nhanh: chi giu truong can thiet, CHI nhan khoa thuoc kho cua CHU workspace
 * (`uploads/<chu>/...`, ca tep upload gui nhanh lan tep mau Zalo) va kiem gioi han so anh/tai lieu/dung luong TRUOC khi
 * cham vao hang doi gui/han muc. Khoa la/ngoai workspace -> 400 (khong lang le bo roi gui moi phan text).
 *
 * @returns {Array<{key: string, originalName?: string, displayName?: string, name?: string, size?: number}>}
 */
function sanitizeQuickSendAttachments(raw, { ownerUserId, imageExtensions }) {
  if (raw == null || (Array.isArray(raw) && raw.length === 0)) return [];
  if (!Array.isArray(raw)) {
    throw httpError(400, 'INVALID_ATTACHMENTS', 'Danh sách tệp đính kèm không hợp lệ.');
  }
  const prefix = `uploads/${Number(ownerUserId)}/`;
  const list = [];
  for (const item of raw) {
    const key = String(item?.key ?? '').trim();
    if (!key || !key.startsWith(prefix) || key.includes('..')) {
      throw httpError(400, 'INVALID_ATTACHMENTS', 'Có tệp đính kèm không hợp lệ hoặc không thuộc không gian làm việc này.');
    }
    const size = Number(item?.size);
    list.push({
      key,
      ...(item?.originalName ? { originalName: String(item.originalName).slice(0, 255) } : {}),
      ...(item?.displayName ? { displayName: String(item.displayName).slice(0, 255) } : {}),
      ...(item?.name ? { name: String(item.name).slice(0, 255) } : {}),
      ...(Number.isFinite(size) && size > 0 ? { size } : {}),
    });
  }
  try {
    assertAttachmentListWithinLimits(list, imageExtensions);
  } catch (limitErr) {
    throw httpError(400, 'ATTACHMENT_LIMIT', limitErr.message);
  }
  return list;
}

function resolveRetryAfterMs(sendError) {
  const hinted = Number.parseInt(sendError?.retryAfterMs, 10);
  const waitMs = Number.isFinite(hinted) && hinted > 0 ? hinted : DEFAULT_RATE_LIMIT_RETRY_MS;
  return Math.min(waitMs, MAX_RATE_LIMIT_RETRY_MS);
}

function isActiveQuotaMode(reservation) {
  return reservation?.mode === 'enforce' || reservation?.mode === 'test_enforce';
}

/**
 * Kiểm hạn mức gói TRƯỚC khi gửi — khuôn `zaloSettings.controller.js assertPreviewSendQuota` (chế độ enforce
 * kiểm ở reserveSendQuota nên bỏ qua ở đây). Kênh `zalo`, 1 tin.
 */
async function assertQuickSendQuota(authUser) {
  const mode = process.env.SEND_QUOTA_RESERVATION_MODE || 'off';
  if (mode === 'enforce' || mode === 'test_enforce') return { allowed: true, mode };
  const { actorUserId, workspaceOwnerId } = getWorkspaceContext(authUser);
  const quota = await checkSendQuota({
    userId: actorUserId,
    roleCode: authUser?.role,
    ownerContextId: workspaceOwnerId,
    channel: 'zalo',
    requiredCount: 1,
  });
  if (!quota.allowed) {
    throw httpError(403, 'SEND_QUOTA_EXCEEDED', quota.message || 'Đã vượt hạn mức gửi tin');
  }
  return quota;
}

/** Tên hiển thị của hội thoại MỞ khớp người nhận — chỉ dùng cho biến `{{ten}}`. '' nếu không có. */
async function lookupDisplayName({ channel, ownerUserId, account, recipientKey }) {
  if (channel === 'telegram') {
    const conversations = await chatbotTelegramRepository.listOpenConversationsForAccount(account.accountId);
    const found = conversations.find((c) => String(c.external_id ?? '').trim() === recipientKey);
    return found?.display_name || '';
  }
  const conversations = await whatsappCampaignConversationRepository
    .listOpenWhatsAppConversationsForSession(ownerUserId, account.sessionKey);
  const found = conversations.find(
    (c) => normalizeWhatsAppPhone(extractPhoneFromExternalId(c.external_id)) === recipientKey
  );
  return found?.visitor_name || '';
}

/**
 * Danh sách người ĐÃ NHẮN TỚI tài khoản (hội thoại đang mở) để chọn làm người nhận.
 * Chỉ trả `{ recipientKey, name }` — không lộ trường nào khác. Tài khoản phải thuộc CHỦ workspace (404).
 *
 * @param {{channel: 'telegram'|'whatsapp', ownerUserId: number, accountRef: string|number}} input
 * @returns {Promise<Array<{recipientKey: string, name: string}>>}
 */
export async function listQuickSendConversations({ channel, ownerUserId, accountRef }) {
  if (!isQuickSendAdapterChannel(channel)) {
    throw httpError(404, 'CHANNEL_UNSUPPORTED', 'Kênh không được hỗ trợ.');
  }
  if (channel === 'telegram') {
    // LUÔN truyền chủ: getAccountById BỎ lọc chủ khi userId rỗng.
    const account = await chatbotTelegramRepository.getAccountById(accountRef, { userId: ownerUserId });
    if (!account) throw httpError(404, 'ACCOUNT_NOT_FOUND', 'Không tìm thấy tài khoản Telegram.');
    const conversations = await chatbotTelegramRepository.listOpenConversationsForAccount(account.id);
    return conversations
      .map((c) => ({
        recipientKey: String(c.external_id ?? '').trim(),
        name: c.display_name || '',
      }))
      .filter((r) => TELEGRAM_CHAT_ID_PATTERN.test(r.recipientKey));
  }
  // WhatsApp: phiên phải mang tiền tố `<chủ>-` (assertSessionOwnedBy của adapter dùng cùng quy tắc).
  const sessionKey = String(accountRef ?? '').trim();
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(sessionKey) || !sessionKey.startsWith(`${Number(ownerUserId)}-`)) {
    throw httpError(404, 'ACCOUNT_NOT_FOUND', 'Không tìm thấy tài khoản WhatsApp.');
  }
  const conversations = await whatsappCampaignConversationRepository
    .listOpenWhatsAppConversationsForSession(Number(ownerUserId), sessionKey);
  const seen = new Set();
  const result = [];
  for (const c of conversations) {
    const phone = normalizeWhatsAppPhone(extractPhoneFromExternalId(c.external_id));
    if (!phone || seen.has(phone)) continue; // nhiều chatbot = nhiều dòng cùng khách
    seen.add(phone);
    result.push({ recipientKey: phone, name: c.visitor_name || '' });
  }
  return result;
}

/**
 * Ước tính thời gian gửi cho kênh adapter từ `descriptor.policy` (cùng hình dạng phản hồi với Zalo).
 * n người = (n-1) × trung bình(min,max) — tin đầu không phải chờ.
 *
 * @param {{channel: string, recipients: number}} input
 */
export function estimateQuickSendAdapter({ channel, recipients }) {
  const { descriptor } = requireDescriptor(channel);
  const policy = descriptor.policy || {};
  const startHour = policy.quietHours?.startHour ?? null;
  const endHour = policy.quietHours?.endHour ?? null;
  const fmt = (h) => (h == null ? null : `${String(h).padStart(2, '0')}:00`);
  const avgDelayMs = ((Number(policy.minDelayMs) || 0) + (Number(policy.maxDelayMs) || 0)) / 2;
  const count = Math.max(1, Number.parseInt(recipients, 10) || 1);
  const totalMs = count <= 1 ? 0 : (count - 1) * avgDelayMs;

  let unit = 'immediate';
  let value = 0;
  if (totalMs <= 0) {
    unit = 'immediate';
  } else if (totalMs < 60_000) {
    unit = 'seconds';
    value = Math.ceil(totalMs / 1000);
  } else if (totalMs < 3_600_000) {
    unit = 'minutes';
    value = Math.ceil(totalMs / 60_000);
  } else {
    unit = 'hours';
    value = Math.round((totalMs / 3_600_000) * 10) / 10;
  }
  return {
    estimatedMs: totalMs,
    unit,
    value,
    quietHours: {
      enabled: totalMs >= 2 * 3_600_000,
      start: startHour,
      end: endHour,
      startFormatted: fmt(startHour),
      endFormatted: fmt(endHour),
    },
  };
}

/**
 * Gửi nhanh MỘT tin cho MỘT người qua kênh adapter.
 *
 * Trả `{ item }`, `item.status` ∈ `success | failed | deferred`. Lỗi toàn cục ném lỗi có `.status`/`.code`
 * (400 dữ liệu sai, 403 hết hạn mức, 409 kênh tắt/tài khoản chưa sẵn sàng, 503 đang tắt máy).
 *
 * @param {object} input
 * @param {'telegram'|'whatsapp'} input.channel
 * @param {object} input.authUser `req.user`
 * @param {{accountId?: *, sessionKey?: string, recipientKey?: *, message?: string}} input.body
 * @param {string|null} [input.idempotencyKey]
 * @returns {Promise<{item: object}>}
 */
export async function sendQuickAdapterMessage({ channel, authUser, body = {}, idempotencyKey = null }) {
  if (!isQuickSendAdapterChannel(channel)) {
    throw httpError(404, 'CHANNEL_UNSUPPORTED', 'Kênh không được hỗ trợ.');
  }
  // 1. Cờ kênh.
  const { cfg, descriptor } = requireDescriptor(channel);

  // 2. Kiểm dữ liệu.
  const accountRef = body?.[cfg.accountField];
  if (accountRef == null || String(accountRef).trim() === '') {
    throw httpError(400, 'INVALID_ACCOUNT', 'Chưa chọn tài khoản gửi.');
  }
  const recipientKey = cfg.normalizeRecipient(body?.recipientKey);
  if (!recipientKey) {
    throw httpError(400, 'INVALID_RECIPIENT', 'Người nhận không hợp lệ.');
  }
  const message = String(body?.message ?? '').trim();
  if (!message) {
    throw httpError(400, 'INVALID_MESSAGE', 'Nội dung tin nhắn không được để trống.');
  }
  if (message.length > cfg.maxMessageLength) {
    throw httpError(400, 'INVALID_MESSAGE', `Nội dung tối đa ${cfg.maxMessageLength} ký tự.`);
  }
  const { adapter } = descriptor;
  const { actorUserId, workspaceOwnerId } = getWorkspaceContext(authUser);
  const nodeConfig = cfg.buildNodeConfig(accountRef);
  const attachments = sanitizeQuickSendAttachments(body?.attachments, {
    ownerUserId: workspaceOwnerId,
    imageExtensions: cfg.imageExtensions,
  });

  // 3. Sẵn sàng (giữ nguyên `code` của adapter: TELEGRAM_STUB_TRANSPORT, WHATSAPP_ACCOUNT_NOT_READY, ...).
  try {
    await adapter.checkReadiness({ userId: workspaceOwnerId, node: { config: nodeConfig } });
  } catch (err) {
    throw httpError(409, err?.code || 'CHANNEL_NOT_READY', err?.message || 'Kênh chưa sẵn sàng.');
  }

  // 4. Tài khoản — LUÔN kèm chủ workspace.
  let account;
  try {
    account = await adapter.resolveAccount({ workspaceOwnerId, config: nodeConfig });
  } catch (err) {
    throw httpError(409, err?.code || 'CHANNEL_NOT_READY', err?.message || 'Không xác định được tài khoản gửi.');
  }
  const accountKey = account.accountKey;

  // P2 — khách ĐÃ TỪ CHỐI nhận tin (lead mới nhất marketing_consent=false) thì không gửi, kể cả gửi nhanh. Chỉ kênh
  // có recipientKey là SĐT (`descriptor.recipientIsPhone`, WhatsApp); Telegram không có SĐT để đối chiếu nên KHÔNG áp.
  // Kiểm TRƯỚC cổng nhịp/giữ chỗ hạn mức: không đốt nhịp, không ăn hạn mức, không ghi nhật ký gửi. Trả 'failed' để
  // FE báo lỗi đúng người (hình dạng giống mọi lỗi từng người nhận khác) — errorCategory 'consent_refused'.
  // P8b — nhóm (jid @g.us) không có SĐT để đối chiếu nên không kiểm consent.
  if (descriptor.recipientIsPhone && !isWhatsAppGroupJid(recipientKey)) {
    const consentRefused = await zaloCampaignRecipientService.isLeadPhoneConsentRefused(workspaceOwnerId, recipientKey);
    if (consentRefused) {
      return {
        item: {
          recipientKey,
          status: 'failed',
          errorCategory: 'consent_refused',
          errorCode: 'CONSENT_REFUSED',
          error: 'Khách đã từ chối nhận tin nhắn (ở biểu mẫu/landing) — không gửi.',
        },
      };
    }
  }

  // P4 (PLAN_TG_WA_DAY_DU) — cấu hình gửi THEO TÀI KHOẢN: trần gửi/ngày người dùng tự đặt + ghi đè giãn cách (không dưới
  // sàn cứng). Trần đếm tin CHIẾN DỊCH đã gửi hôm nay (gửi nhanh ghi is_preview nên không tự ăn trần — như Zalo). Chạm trần
  // -> 429 (KHÔNG phải 'deferred': hoãn tới nửa đêm không phải thứ trình duyệt nên chờ). Kiểm TRƯỚC hạn mức gói/cổng nhịp.
  const accountSendSettings = typeof adapter.getAccountSendSettings === 'function'
    ? await adapter.getAccountSendSettings({ account, workspaceOwnerId })
    : null;
  const accountDailyLimit = accountSendSettings?.userDailySendLimit ?? null;
  if (accountDailyLimit != null) {
    const dailyCheck = await checkAccountDailyLimit({
      channel: descriptor.key,
      accountId: accountKey,
      limit: accountDailyLimit,
    });
    if (!dailyCheck.allowed) {
      throw httpError(
        429,
        'ACCOUNT_DAILY_LIMIT',
        `Tài khoản đã đạt giới hạn ${dailyCheck.limit} tin/ngày do bạn đặt. Thử lại từ 00:00 ngày mai hoặc tăng giới hạn trong Cài đặt kênh.`
      );
    }
  }
  const effectivePolicy = applyAccountDelayOverride(descriptor.key, descriptor.policy || {}, accountSendSettings);

  const baseRequestKey = resolveRequestIdempotencyKey(idempotencyKey ?? null);

  // Kiểm hạn mức gói (chỉ đọc) TRƯỚC cổng nhịp — hết hạn mức thì không đốt một lượt nhịp vô ích.
  const quota = await assertQuickSendQuota(authUser);

  if (campaignShutdownGate.isShuttingDown()) {
    throw httpError(503, 'SERVER_SHUTTING_DOWN', 'Hệ thống đang khởi động lại, thử lại sau ít phút.');
  }

  // 5. Cổng nhịp — TRƯỚC mọi giữ chỗ/ghi nhật ký; ghi lần thử LIỀN SAU, không `await` ở giữa.
  const gate = evaluateAdapterSendGate({ descriptor, accountKey, policy: effectivePolicy });
  if (!gate.ok) {
    return {
      item: {
        recipientKey,
        status: 'deferred',
        reason: gate.reason,
        retryAfterMs: gate.waitMs,
        resumeAt: Date.now() + gate.waitMs,
      },
    };
  }
  recordAdapterSendAttempt({ descriptor, accountKey });

  // 6. Giữ chỗ hạn mức (kênh `zalo`, nguồn `${channel}_preview`).
  const requestPayload = {
    channel,
    accountRef: String(accountRef),
    recipientKey,
    message,
    // Khoa tep dua vao chu ky idempotency: cung Idempotency-Key nhung doi tep -> KHONG phai "gui lai" cung mot yeu cau.
    attachments: attachments.map((a) => a.key),
  };
  let reservation = null;
  try {
    const reservationKey = buildPreviewReservationKey({
      channel: 'zalo',
      billingUserId: workspaceOwnerId,
      requestKey: baseRequestKey,
      recipient: `${channel}:${recipientKey}`,
    });
    reservation = await reserveSendQuota({
      userId: actorUserId,
      roleCode: authUser?.role,
      ownerContextId: workspaceOwnerId,
      channel: 'zalo',
      quantity: 1,
      reservationKey,
      requestFingerprint: computeRequestFingerprint(requestPayload),
      requestPayload,
      sourceType: `${channel}_preview`,
    });
    if (isActiveQuotaMode(reservation)) {
      if (reservation.status === 'consumed') {
        // Gửi lại đúng request đã xong (cùng Idempotency-Key + người nhận): không gửi lần hai.
        return { item: { recipientKey, status: 'success', isReplay: true } };
      }
      await markSendQuotaSending({ reservationId: reservation.id });
    }
  } catch (quotaErr) {
    const status = quotaErr.status || quotaErr.statusCode;
    if (status === 409 || status === 503
      || ['CONCURRENT_SEND_IN_PROGRESS', 'IDEMPOTENCY_KEY_REUSED', 'RESERVATION_UNCERTAIN', 'SEND_QUOTA_UNAVAILABLE'].includes(quotaErr.code)) {
      throw quotaErr;
    }
    return {
      item: {
        recipientKey,
        status: 'failed',
        error: quotaErr.message || 'Lỗi kiểm tra hạn mức gửi',
        errorCode: quotaErr.code || 'QUOTA_ERROR',
        errorCategory: (status === 403 || quotaErr.code === 'SEND_QUOTA_EXCEEDED' || quotaErr.code === 'RESOURCE_LIMIT_EXCEEDED')
          ? 'quota_exceeded'
          : 'system_error',
      },
    };
  }

  const releaseReservation = async (failureCode) => {
    if (!reservation?.id || !isActiveQuotaMode(reservation)) return;
    try {
      await releaseSendQuota({ reservationId: reservation.id, failureCode });
    } catch (releaseErr) {
      console.warn('[QuickSendAdapter] releaseSendQuota lỗi:', releaseErr?.message);
    }
  };

  // 7. Nhật ký `queued` (is_preview = true BẮT BUỘC — thiếu là đếm đôi hạn mức).
  let messageRowId = null;
  try {
    messageRowId = await campaignChannelMessageRepository.insertQueued({
      campaignId: null,
      runId: null,
      nodeId: null,
      channel: descriptor.key,
      accountKey,
      recipientKey,
      recipientDisplay: recipientKey,
      isPreview: true,
      workspaceOwnerId,
      actorUserId,
      quotaReservationId: reservation?.id ?? null,
    });
  } catch (dbErr) {
    await releaseReservation('QUICK_SEND_LOG_FAILED');
    throw dbErr;
  }

  // 8. Nội dung: {{ten}} từ hội thoại mở khớp người nhận; không có -> '' (KHÔNG còn chữ {{ten}}).
  let text;
  let sendResult;
  try {
    let displayName = '';
    if (message.includes('{{') && !isWhatsAppGroupJid(recipientKey)) {
      displayName = await lookupDisplayName({ channel, ownerUserId: workspaceOwnerId, account, recipientKey });
    }
    text = neutralizeUnresolvedTemplateVariables(
      renderTemplateText(message, { ten: displayName }),
      { campaignId: null, nodeId: null }
    );
    sendResult = await campaignShutdownGate.trackInFlight(() => adapter.sendOne({
      account,
      recipientKey,
      text,
      // Chi truyen khi co: adapter khong dinh kem giu nguyen hop dong cu (chi {account, recipientKey, text}).
      ...(attachments.length > 0 ? { attachments } : {}),
    }));
  } catch (sendError) {
    const category = sendError instanceof ChannelSendError
      ? sendError.category
      : adapter.classifyError(sendError);
    const errorMessage = sendError?.message || String(sendError);
    await campaignChannelMessageRepository.markFailed(messageRowId, {
      errorCategory: category,
      errorMessage,
    }).catch((e) => console.warn('[QuickSendAdapter] markFailed lỗi:', e?.message));
    await releaseReservation('CHANNEL_SEND_FAILED');
    if (category === 'rate_limit') {
      const retryAfterMs = resolveRetryAfterMs(sendError);
      return {
        item: {
          recipientKey,
          status: 'deferred',
          reason: 'provider_rate_limit',
          retryAfterMs,
          resumeAt: Date.now() + retryAfterMs,
        },
      };
    }
    // `auth` / `not_configured` là lỗi cả tài khoản — FE dừng cả đợt.
    return {
      item: { recipientKey, status: 'failed', errorCategory: category, error: errorMessage },
    };
  }

  // Đã gửi thật: từ đây mọi lỗi ghi sổ chỉ log, KHÔNG được báo "thất bại" (khách đã nhận tin).
  try {
    await campaignChannelMessageRepository.markSent(messageRowId, {
      providerMessageId: sendResult?.messageId || null,
    });
  } catch (e) {
    console.warn('[QuickSendAdapter] markSent lỗi:', e?.message);
  }
  if (reservation?.id && isActiveQuotaMode(reservation)) {
    try {
      await consumeSendQuota({
        reservationId: reservation.id,
        responseSnapshot: { messageId: sendResult?.messageId || null },
      });
    } catch (consumeErr) {
      console.warn('[QuickSendAdapter] consumeSendQuota lỗi:', consumeErr?.message);
      await markSendQuotaUncertain({
        reservationId: reservation.id,
        failureCode: 'CONSUME_DB_FAILED',
      }).catch(() => {});
    }
  } else if (quota?.billingUserId) {
    try {
      await recordDirectSendUsage({
        billingUserId: quota.billingUserId,
        channel: 'zalo',
        amount: 1,
        actorUserId,
        source: `${channel}_preview`,
      });
    } catch (usageErr) {
      console.warn('[QuickSendAdapter] recordDirectSendUsage lỗi:', usageErr?.message);
    }
  }

  return {
    item: {
      recipientKey,
      status: 'success',
      messageId: sendResult?.messageId || null,
      // Khach DA nhan tin dau nhung mot tep sau loi (P5): van 'success' (da toi tay khach), kem canh bao de FE hien.
      ...(sendResult?.partialError ? { partialError: String(sendResult.partialError) } : {}),
    },
  };
}

export default {
  QUICK_SEND_ADAPTER_CHANNELS,
  isQuickSendAdapterChannel,
  listQuickSendConversations,
  estimateQuickSendAdapter,
  sendQuickAdapterMessage,
};
