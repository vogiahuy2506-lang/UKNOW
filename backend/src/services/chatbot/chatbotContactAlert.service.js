import chatbotContactAlertRepository from '../../repositories/chatbot/chatbotContactAlert.repository.js';
import { extractContacts } from '../../utils/contactDetect.util.js';
import { normalizeVietnamesePhone } from '../../utils/vietnamesePhone.util.js';
import { sendSystemEmail, SENDER_NAME } from '../../utils/systemEmail.util.js';
import { escapeHtml } from '../../utils/htmlEscape.util.js';
import { logError } from '../../utils/logger.util.js';
import { isZaloGroupConversation } from '../../utils/zaloGroupName.util.js';

const CHATBOT_CONTACT_ALERT_ENABLED = process.env.CHATBOT_CONTACT_ALERT_ENABLED !== 'false';
const HUMAN_WINDOW_MIN = Number(process.env.CHATBOT_CONTACT_ALERT_HUMAN_WINDOW_MIN) || 120;
const COOLDOWN_MIN = Number(process.env.CHATBOT_CONTACT_ALERT_COOLDOWN_MIN) || 30;
const BATCH_SIZE = Number(process.env.CHATBOT_CONTACT_ALERT_BATCH) || 500;
const EXCERPT_CHARS = Number(process.env.CHATBOT_CONTACT_ALERT_EXCERPT_CHARS) || 200;
const MAX_CONTACTS_PER_MESSAGE = Number(process.env.CHATBOT_CONTACT_ALERT_MAX_PER_MSG) || 3;

const SOURCES = ['web', 'channel', 'zalo_personal'];

export function getFrontendInboxUrl({ source, conversationId } = {}) {
  const base = (process.env.FRONTEND_URL || 'https://founderai.vn').replace(/\/+$/, '');
  if (!conversationId) {
    return `${base}/app/settings/inbox`;
  }
  const typeMap = {
    web: 'webchat',
    channel: 'channel',
    zalo_personal: 'zalo_personal',
  };
  const type = typeMap[source] || source || 'webchat';
  return `${base}/app/settings/inbox?conversation=${encodeURIComponent(conversationId)}&type=${encodeURIComponent(type)}`;
}

function formatChannelLabel(alert) {
  if (alert.last_source === 'web') return 'Website';
  const display = alert.display_name ? ` ${alert.display_name}` : '';
  if (alert.last_source === 'zalo_personal') return `Zalo cá nhân${display}`;
  if (alert.last_source === 'channel') {
    const ch = alert.channel;
    if (ch === 'zalo_oa') return `Zalo OA${display}`;
    if (ch === 'facebook') return `Facebook${display}`;
    if (ch === 'whatsapp_baileys' || ch === 'whatsapp') return `WhatsApp${display}`;
    return `${ch || 'Kênh'}${display}`;
  }
  return 'Chatbot';
}

export function safeParseJson(raw, fallback = {}) {
  if (typeof raw !== 'string') return fallback;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export function extractZaloContactCardPhone(parsed) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const desc = parsed.description;
  if (typeof desc !== 'string' || !desc.trim().startsWith('{')) return null;
  let inner;
  try { inner = JSON.parse(desc); } catch { return null; }
  if (!inner || typeof inner !== 'object') return null;
  const phone = inner.phone;
  return typeof phone === 'string' && phone.trim() ? phone.trim() : null;
}

function buildAlertEmailHtml({ userFullName, alerts, inboxUrl }) {
  const safeInboxUrl = escapeHtml(inboxUrl);

  const itemsHtml = alerts
    .map((alert) => {
      const channelLabel = escapeHtml(formatChannelLabel(alert));
      const visitorName = escapeHtml(alert.visitor_name || 'Khách');
      const contactLabel = alert.contact_type === 'phone' ? 'Số điện thoại' : 'Email';
      const contactVal = escapeHtml(alert.contact_value);
      const excerpt = escapeHtml(alert.last_excerpt || '');
      const timeStr = alert.last_seen_at
        ? new Date(alert.last_seen_at).toLocaleString('vi-VN', {
            timeZone: 'Asia/Ho_Chi_Minh',
          })
        : '—';

      const itemUrl = getFrontendInboxUrl({
        source: alert.last_source,
        conversationId: alert.last_conversation_id,
      });
      const safeItemUrl = escapeHtml(itemUrl);

      return `
      <div style="border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px; margin-bottom: 14px; background-color: #f8fafc;">
        <div style="font-size: 14px; color: #475569; margin-bottom: 6px;">
          <strong>Kênh:</strong> ${channelLabel} &nbsp;|&nbsp; <strong>Khách:</strong> ${visitorName}
        </div>
        <div style="font-size: 13px; color: #64748b; margin-bottom: 8px;">
          <strong>Thời gian:</strong> ${timeStr}
        </div>
        <div style="font-size: 15px; color: #0f172a; margin-bottom: 8px;">
          <strong>${contactLabel}:</strong> <span style="color: #0284c7; font-weight: 600;">${contactVal}</span>
        </div>
        ${
          excerpt
            ? `<div style="font-size: 13px; color: #334155; background: #ffffff; border-left: 3px solid #0284c7; padding: 8px 12px; margin-top: 6px; font-style: italic;">
                 "${excerpt}"
               </div>`
            : ''
        }
        <div style="margin-top: 10px;">
          <a href="${safeItemUrl}" style="display: inline-block; color: #0284c7; text-decoration: none; font-size: 13px; font-weight: 600;">
            Mở hội thoại &rarr;
          </a>
        </div>
      </div>`;
    })
    .join('');

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1e293b; line-height: 1.5;">
      <h2 style="color: #0f172a; font-size: 20px; margin-bottom: 8px;">Khách để lại thông tin liên hệ mới</h2>
      <p style="font-size: 14px; color: #475569; margin-bottom: 20px;">
        Xin chào${userFullName ? ` <strong>${escapeHtml(userFullName)}</strong>` : ''}, hệ thống trợ lý AI phát hiện có <strong>${alerts.length}</strong> liên hệ mới từ khách hàng trong hội thoại tự động:
      </p>

      ${itemsHtml}

      <div style="margin-top: 28px; text-align: center;">
        <a href="${safeInboxUrl}" style="display: inline-block; background-color: #0284c7; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 14px;">
          Mở Hộp thư hợp nhất
        </a>
      </div>

      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 32px 0 16px;" />
      <p style="font-size: 12px; color: #94a3b8; text-align: center; margin: 0;">
        Email thông báo tự động từ hệ thống UKNOW Campaign.
      </p>
    </div>
  `;
}

class ChatbotContactAlertService {
  /**
   * Quét các tin nhắn khách mới và gửi email thông báo cho chủ shop
   * @param {object} [options]
   * @param {Date} [options.now=new Date()]
   * @returns {Promise<{ scanned: number, detected: number, suppressed: number, notified: number, emails: { sent: number, failed: number }, synced: number, disabled?: boolean, status?: string }>}
   */
  async scanAndNotify({ now = new Date() } = {}) {
    if (!CHATBOT_CONTACT_ALERT_ENABLED) {
      return {
        status: 'noop',
        disabled: true,
        scanned: 0,
        detected: 0,
        suppressed: 0,
        notified: 0,
        emails: { sent: 0, failed: 0 },
        synced: 0,
      };
    }

    let scanned = 0;
    let detected = 0;
    let suppressed = 0;

    // Cache thông tin chủ shop để tránh SELECT users lặp lại
    const ownerCache = new Map();
    const getOwner = async (idUser) => {
      if (!ownerCache.has(idUser)) {
        const owner = await chatbotContactAlertRepository.getOwnerContact(idUser);
        ownerCache.set(idUser, owner);
      }
      return ownerCache.get(idUser);
    };

    const humanSinceIso = new Date(now.getTime() - HUMAN_WINDOW_MIN * 60 * 1000).toISOString();

    const initializedSources = [];

    // ── Pha 1: Quét tin nhắn khách theo từng nguồn ────────────────────────────
    for (const source of SOURCES) {
      const cursor = await chatbotContactAlertRepository.getCursor(source);
      if (cursor === null) {
        const maxId = await chatbotContactAlertRepository.getMaxMessageId(source);
        await chatbotContactAlertRepository.setCursor(source, maxId);
        initializedSources.push(source);
        continue;
      }

      let lastId = cursor;

      while (true) {
        const messages = await chatbotContactAlertRepository.fetchVisitorMessagesAfter(
          source,
          lastId,
          BATCH_SIZE
        );

        if (!messages || messages.length === 0) {
          break;
        }

        scanned += messages.length;

        for (const msg of messages) {
          if (source === 'zalo_personal') {
            const info = typeof msg.visitor_info === 'string'
              ? safeParseJson(msg.visitor_info)
              : (msg.visitor_info || {});
            if (isZaloGroupConversation({ externalId: msg.external_id, conversationInfo: info })) {
              continue;
            }
          }

          let contacts;
          const trimmed = typeof msg.content === 'string' ? msg.content.trim() : '';
          if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
            let parsed;
            try {
              parsed = JSON.parse(trimmed);
            } catch {
              parsed = undefined; // Parse lỗi thì rơi xuống quét bình thường, giữ nguyên hành vi a026eddc
            }
            if (parsed !== undefined) {
              const cardPhone = extractZaloContactCardPhone(parsed);
              if (!cardPhone) continue;              // JSON khác: bỏ cả tin, như a026eddc
              contacts = extractContacts(cardPhone); // danh thiếp: CHỈ quét đúng số trên thiếp
            }
          }
          if (!contacts) contacts = extractContacts(msg.content);
          if (contacts.length === 0) continue;
          if (contacts.length >= MAX_CONTACTS_PER_MESSAGE) continue;

          detected += contacts.length;

          const owner = await getOwner(msg.id_user);
          const hasAgent = await chatbotContactAlertRepository.hasAgentReplySince(
            source,
            msg.id_conversation,
            humanSinceIso
          );

          const excerpt = String(msg.content || '').slice(0, EXCERPT_CHARS);

          for (const contact of contacts) {
            let pendingNotify = true;
            let suppressedReason = null;

            // Kiểm tra nếu là SĐT/email của chính chủ shop
            const isOwnerPhone =
              contact.type === 'phone' &&
              owner?.phone &&
              normalizeVietnamesePhone(owner.phone) === contact.value;
            const isOwnerEmail =
              contact.type === 'email' &&
              owner?.email &&
              owner.email.toLowerCase().trim() === contact.value;

            if (isOwnerPhone || isOwnerEmail) {
              pendingNotify = false;
              suppressedReason = 'owner_own_contact';
              suppressed++;
            } else if (owner?.chatbot_contact_alert_email === false) {
              pendingNotify = false;
              suppressedReason = 'owner_opted_out';
              suppressed++;
            } else if (hasAgent) {
              // Có nhân viên trả lời trong 120 phút gần nhất -> người thật đã thấy
              pendingNotify = false;
              suppressedReason = 'human_active';
              suppressed++;
            }

            await chatbotContactAlertRepository.upsertContact({
              idUser: msg.id_user,
              contactType: contact.type,
              contactValue: contact.value,
              seenAt: msg.created_at || now,
              source,
              conversationId: msg.id_conversation,
              messageId: msg.id,
              excerpt,
              pendingNotify,
              suppressedReason,
            });
          }
        }

        // Cập nhật cursor sau mỗi lô
        lastId = messages[messages.length - 1].id;
        await chatbotContactAlertRepository.setCursor(source, lastId);

        if (messages.length < BATCH_SIZE) {
          break;
        }
      }
    }

    // ── Pha 2: Gửi email gom theo user ────────────────────────────────────────
    const pendingList = await chatbotContactAlertRepository.listPendingGroupedByUser();

    const userMap = new Map();
    for (const item of pendingList) {
      if (!userMap.has(item.id_user)) {
        userMap.set(item.id_user, {
          userId: item.id_user,
          email: item.user_email,
          fullName: item.user_full_name,
          alerts: [],
        });
      }
      userMap.get(item.id_user).alerts.push(item);
    }

    let notified = 0;
    const emails = { sent: 0, failed: 0 };
    const inboxUrl = getFrontendInboxUrl();

    for (const { userId, email, fullName, alerts } of userMap.values()) {
      if (!email) {
        continue;
      }

      // Kiểm tra cooldown 30 phút theo hội thoại
      const sendableAlerts = [];
      const convCooldownMap = new Map();

      for (const alert of alerts) {
        const convKey = `${alert.last_source}:${alert.last_conversation_id}`;
        if (!convCooldownMap.has(convKey)) {
          const lastNotifiedAt = await chatbotContactAlertRepository.lastNotifiedAtForConversation(
            userId,
            alert.last_source,
            alert.last_conversation_id
          );
          convCooldownMap.set(convKey, lastNotifiedAt);
        }

        const lastNotifiedAt = convCooldownMap.get(convKey);
        if (
          lastNotifiedAt &&
          new Date(lastNotifiedAt).getTime() >= now.getTime() - COOLDOWN_MIN * 60 * 1000
        ) {
          // Hội thoại này vừa gửi thư trong 30 phút gần nhất -> giữ lại cho đợt sau
          continue;
        }

        sendableAlerts.push(alert);
      }

      if (sendableAlerts.length === 0) {
        continue;
      }

      const subject = `[${SENDER_NAME}] ${sendableAlerts.length} khách để lại liên hệ trong chatbot`;
      const primaryUrl = sendableAlerts.length === 1
        ? getFrontendInboxUrl({
            source: sendableAlerts[0].last_source,
            conversationId: sendableAlerts[0].last_conversation_id,
          })
        : getFrontendInboxUrl();
      const html = buildAlertEmailHtml({
        userFullName: fullName,
        alerts: sendableAlerts,
        inboxUrl: primaryUrl,
      });

      try {
        await sendSystemEmail({
          to: email,
          subject,
          html,
        });

        const alertIds = sendableAlerts.map((a) => a.id);
        await chatbotContactAlertRepository.markNotified(alertIds, now);

        notified += sendableAlerts.length;
        emails.sent++;
      } catch (err) {
        logError('[ChatbotContactAlert] Lỗi gửi email báo liên hệ:', err);
        emails.failed++;
      }
    }

    return {
      scanned,
      detected,
      suppressed,
      notified,
      emails,
      synced: notified,
      scannedCount: scanned,
      alertsCreatedOrUpdated: detected,
      emailsSent: emails.sent,
      initializedSources,
    };
  }
}

const chatbotContactAlertService = new ChatbotContactAlertService();

export const scanAndNotify = (opts) => chatbotContactAlertService.scanAndNotify(opts);
export { ChatbotContactAlertService };
export default chatbotContactAlertService;
