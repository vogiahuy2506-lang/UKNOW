/**
 * Khi chatbot KHONG tra loi duoc khach vi het credit / het goi / cham han muc AI / AI loi (G3b, A P1-6).
 *
 * Truoc day: chu het credit toi thu Sau thi ca cuoi tuan moi khach Zalo nhan "Xin loi, hien chua the tra loi..." tu nick
 * ca nhan cua chu (toi 50 lan/khach/ngay), ban tin tuan ghi "AI tra loi: 340", con chu khong nhan duoc bat ky tin nao.
 * Ba viec o day:
 *  (a) cau xin loi mang NHAN rieng `source: 'ai_unavailable'` (+ `reason`) o moi kenh ghi tin -> ban tin tuan khong dem la AI tra loi;
 *  (b) bao CHU khi het credit / het goi / cham han muc AI: toi da 1 lan / chu / 24 gio, moc o DB (khong o bo nho -
 *      restart khong lam bao lai). Khuon: channelDisconnectAlert.service.js. Tu PR-6 (PLAN_TICKET_GOP_Y_VA_CHUONG_THONG_BAO) di qua
 *      dispatcher (`deps.notify`, mac dinh `notifyUsers`, su kien `ai_unavailable`): chuong trong app + email theo cau hinh he thong;
 *  (c) cau xin loi toi da 1 lan / khach / 6 gio (khach nhan 10 tin khong nhan 10 cau xin loi). Moc cung o DB.
 *
 * Moi ham o day KHONG BAO GIO nem loi ra duong tra loi khach: DB/SMTP hong thi hanh vi quay ve nhu cu (van gui cau xin loi).
 */
import aiUnavailableNoticeRepository, {
  NOTICE_KIND_OWNER_EMAIL,
  NOTICE_KIND_VISITOR_APOLOGY,
} from '../../repositories/chatbot/aiUnavailableNotice.repository.js';
import { buildBaseTemplate, buildRenewalUrl, SENDER_NAME } from '../../utils/systemEmail.util.js';
import { notifyUsers } from '../notification/notificationDispatch.service.js';
import { vnDayKey } from '../../utils/vnTimeFormat.util.js';
import { escapeHtml } from '../../utils/htmlEscape.util.js';
import { logError } from '../../utils/logger.util.js';
import { AI_UNAVAILABLE_SOURCE, AI_UNAVAILABLE_REASON, classifyAiFailure } from '../../utils/aiUnavailable.util.js';

export { AI_UNAVAILABLE_SOURCE, AI_UNAVAILABLE_REASON, classifyAiFailure };

/** Ly do dang CHU phai biet (can nap them / gia han). `ai_error` (Google 503...) la su co tam thoi - khong email. */
const OWNER_ALERT_REASONS = new Set([
  AI_UNAVAILABLE_REASON.CREDIT_EXHAUSTED,
  AI_UNAVAILABLE_REASON.SUBSCRIPTION_EXPIRED,
  AI_UNAVAILABLE_REASON.TOKEN_LIMIT,
]);

export const OWNER_EMAIL_COOLDOWN_MS = 24 * 60 * 60 * 1000;
export const VISITOR_APOLOGY_COOLDOWN_MS = 6 * 60 * 60 * 1000;
/** Gui email that bai (SMTP loi): lan sau thu lai sau 10 phut thay vi bi cooldown 24h nuot mat. */
export const OWNER_EMAIL_RETRY_MS = 10 * 60 * 1000;
/** Cau xin loi cu hon ngay nay bi don khi chiem duoc moc email chu. */
const VISITOR_APOLOGY_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

const REASON_TEXT = {
  [AI_UNAVAILABLE_REASON.CREDIT_EXHAUSTED]: {
    cause: 'đã dùng hết lượt AI (credit) trong kỳ hiện tại',
    action: 'Nạp thêm lượt AI hoặc nâng gói để chatbot trả lời khách trở lại ngay.',
  },
  [AI_UNAVAILABLE_REASON.SUBSCRIPTION_EXPIRED]: {
    cause: 'gói dịch vụ của bạn đã hết hạn',
    action: 'Gia hạn gói để chatbot trả lời khách trở lại ngay.',
  },
  [AI_UNAVAILABLE_REASON.TOKEN_LIMIT]: {
    cause: 'đã chạm hạn mức AI của gói hiện tại',
    action: 'Nâng gói hoặc chờ sang kỳ mới để chatbot trả lời khách trở lại.',
  },
};

export function buildAiUnavailableOwnerEmail({ fullName, reason, billingUrl }) {
  const text = REASON_TEXT[reason] || REASON_TEXT[AI_UNAVAILABLE_REASON.CREDIT_EXHAUSTED];
  const url = escapeHtml(billingUrl);
  const content = `
    <p style="margin:0 0 6px;font-size:16px;color:#374151;line-height:1.6">
      Xin chào <strong style="color:#f97316">${escapeHtml(fullName || 'bạn')}</strong>,
    </p>
    <p style="margin:0 0 20px;font-size:15px;color:#6b7280;line-height:1.6">
      Chatbot của bạn vừa không trả lời được tin nhắn của khách vì ${escapeHtml(text.cause)}.
      Thay cho câu trả lời, khách đang nhận một câu xin lỗi tự động (trên Zalo, Telegram, WhatsApp hoặc website).
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#fef2f2;border:2px solid #fecaca;border-radius:12px;margin-bottom:24px">
      <tr>
        <td style="padding:16px 20px;font-size:14px;color:#7f1d1d;line-height:1.6">
          <strong>Việc cần làm:</strong> ${escapeHtml(text.action)}
        </td>
      </tr>
    </table>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px">
      <tr>
        <td style="text-align:center">
          <a href="${url}"
             style="display:inline-block;background:linear-gradient(135deg,#f97316,#ea580c);color:#fff;font-size:15px;font-weight:600;
                    padding:14px 36px;border-radius:10px;text-decoration:none">
            Mở trang Gói &amp; thanh toán →
          </a>
        </td>
      </tr>
    </table>
    <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.6">
      Trong lúc chờ, bạn vẫn có thể tự trả lời khách trong <strong>Hộp thư</strong>. Hệ thống chỉ nhắc một lần mỗi 24 giờ.
    </p>
  `;
  return {
    subject: `[${SENDER_NAME}] Chatbot không trả lời được khách — ${text.cause}`,
    html: buildBaseTemplate({
      subtitle: 'Chatbot tạm ngưng trả lời',
      content,
      footerNote: 'Đây là email tự động từ hệ thống. Vui lòng không reply.',
    }),
  };
}

function resolveDeps(deps) {
  return {
    repo: aiUnavailableNoticeRepository,
    notify: notifyUsers,
    buildBillingUrl: buildRenewalUrl,
    ...(deps || {}),
  };
}

/**
 * Bao CHU: toi da 1 lan / chu / 24 gio, moc o DB. Chiem moc TRUOC khi gui (nguyen tu) roi lui moc neu gui that bai.
 * Chu khong co email van nhan chuong; chu khong con hoat dong thi dispatcher khong giao duoc cho ai -> `no_delivery` va GIU moc.
 * @returns {Promise<{ sent: boolean, skipped?: 'cooldown'|'no_delivery'|'send_failed' }>}
 */
export async function notifyOwnerAiUnavailable({ ownerUserId, reason, now = new Date(), deps = null }) {
  const d = resolveDeps(deps);
  const claimed = await d.repo.claim({
    idUser: ownerUserId,
    kind: NOTICE_KIND_OWNER_EMAIL,
    now,
    cooldownMs: OWNER_EMAIL_COOLDOWN_MS,
  });
  if (!claimed) return { sent: false, skipped: 'cooldown' };

  // Best-effort: don cau xin loi cu de bang khong phinh. Loi o day khong duoc anh huong email.
  Promise.resolve(
    d.repo.purgeStaleVisitorApologies({
      idUser: ownerUserId,
      olderThan: new Date(now.getTime() - VISITOR_APOLOGY_RETENTION_MS),
    })
  ).catch(() => {});

  try {
    const text = REASON_TEXT[reason] || REASON_TEXT[AI_UNAVAILABLE_REASON.CREDIT_EXHAUSTED];
    const delivery = await d.notify({
      eventType: 'ai_unavailable',
      userIds: [ownerUserId],
      title: 'Chatbot không trả lời được khách',
      titleEn: 'Your chatbot cannot reply to customers',
      message: `Chatbot vừa không trả lời được tin nhắn của khách vì ${text.cause}. ${text.action}`,
      messageEn: 'Your chatbot could not answer customer messages just now (AI credits used up, plan expired or AI quota reached). Open Plan & billing to fix it.',
      link: '/app/billing',
      severity: 'error',
      metadata: { reason },
      // Mốc cooldown 24 giờ nên mỗi lần chiếm được mốc rơi vào một ngày giờ VN khác nhau; lui mốc thử lại trong cùng ngày vẫn trùng khoá
      // đúng ý (chuông đã chèn thì không chèn lần hai, email chỉ gửi cho dòng mới chèn).
      dedupeKey: `ai_unavailable:${ownerUserId}:${reason}:${vnDayKey(now)}`,
      email: ({ fullName }) => buildAiUnavailableOwnerEmail({
        fullName: fullName ?? null,
        reason,
        billingUrl: d.buildBillingUrl(),
      }),
    });
    // Dispatcher khong nem loi: chi coi la hong khi email loi ma chuong cung khong ghi duoc -> lui moc thu lai sau 10 phut.
    if (delivery.emailFailed > 0 && delivery.inApp + delivery.emailSent === 0) {
      throw new Error(`notify_failed emailFailed=${delivery.emailFailed}`);
    }
    // Khong giao duoc cho ai (chu khong con hoat dong, hoac admin tat ca hai kenh): giu moc, khong thu lai moi lan co khach nhan tin.
    if (delivery.inApp + delivery.emailSent === 0) return { sent: false, skipped: 'no_delivery' };
    return { sent: true };
  } catch (err) {
    logError(`[AiUnavailableNotice] báo chủ ${ownerUserId} thất bại:`, err?.message || err);
    // Khong de cooldown 24h nuot mat lan gui hong: lui moc de lan sau (sau 10 phut) thu lai.
    await Promise.resolve(
      d.repo.rewind({
        idUser: ownerUserId,
        kind: NOTICE_KIND_OWNER_EMAIL,
        claimedAt: now,
        retryAt: new Date(now.getTime() - OWNER_EMAIL_COOLDOWN_MS + OWNER_EMAIL_RETRY_MS),
      })
    ).catch(() => {});
    return { sent: false, skipped: 'send_failed' };
  }
}

/**
 * Cau xin loi toi da 1 lan / khach / 6 gio. `conversationId` + `channel` dinh danh khach (1 hoi thoai = 1 khach tren 1 kenh).
 * @returns {Promise<boolean>} true = duoc gui cau xin loi lan nay
 */
export async function claimVisitorApology({ ownerUserId, channel, conversationId, now = new Date(), deps = null }) {
  const d = resolveDeps(deps);
  return d.repo.claim({
    idUser: ownerUserId,
    kind: NOTICE_KIND_VISITOR_APOLOGY,
    noticeKey: `${channel}:${conversationId}`,
    now,
    cooldownMs: VISITOR_APOLOGY_COOLDOWN_MS,
  });
}

/**
 * Diem vao DUY NHAT cua moi kenh khi sap gui cau xin loi cho khach.
 *
 * @param {object} p
 * @param {number} p.ownerUserId - chu tai khoan (nguoi tra tien, nguoi nhan email)
 * @param {string} p.reason - mot trong AI_UNAVAILABLE_REASON
 * @param {string} [p.channel] - ten kenh (khoa cooldown cau xin loi); thieu kenh/hoi thoai (widget dong bo) thi khong gioi han cau xin loi
 * @param {string|number} [p.conversationId]
 * @param {Date} [p.now]
 * @param {object} [p.deps]
 * @returns {Promise<{ send: boolean, source: string, reason: string, metadata: object, ownerNotice: Promise<object> }>}
 *   `send=false`: khach da nhan cau xin loi trong 6 gio qua - KHONG gui nua. `metadata` gan vao tin xin loi o moi kenh ghi tin.
 *   `ownerNotice`: promise (khong bao gio reject) cua viec email chu - nguoi goi KHONG can await (test thi await).
 */
export async function handleAiUnavailable({ ownerUserId, reason, channel = null, conversationId = null, now = new Date(), deps = null }) {
  const safeReason = Object.values(AI_UNAVAILABLE_REASON).includes(reason) ? reason : AI_UNAVAILABLE_REASON.AI_ERROR;

  let ownerNotice = Promise.resolve({ sent: false, skipped: 'not_applicable' });
  if (ownerUserId != null && OWNER_ALERT_REASONS.has(safeReason)) {
    ownerNotice = notifyOwnerAiUnavailable({ ownerUserId, reason: safeReason, now, deps }).catch((err) => {
      logError(`[AiUnavailableNotice] báo chủ ${ownerUserId} lỗi:`, err?.message || err);
      return { sent: false, skipped: 'error' };
    });
  }

  let send = true;
  if (ownerUserId != null && channel && conversationId != null) {
    try {
      send = await claimVisitorApology({ ownerUserId, channel, conversationId, now, deps });
    } catch (err) {
      // Khong chiem duoc moc (DB loi): giu hanh vi cu - van gui cau xin loi cho khach.
      logError(`[AiUnavailableNotice] không chiếm được mốc xin lỗi (${channel}:${conversationId}):`, err?.message || err);
      send = true;
    }
  }

  return {
    send,
    source: AI_UNAVAILABLE_SOURCE,
    reason: safeReason,
    metadata: { source: AI_UNAVAILABLE_SOURCE, reason: safeReason },
    ownerNotice,
  };
}

export default {
  handleAiUnavailable,
  notifyOwnerAiUnavailable,
  claimVisitorApology,
  classifyAiFailure,
};
