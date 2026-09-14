import chatbotDigestRepository from '../../repositories/chatbot/chatbotDigest.repository.js';
import { getVietnamWeekRange, getVietnamMonthRange } from '../../utils/vnTimeFormat.util.js';
import { sendSystemEmail, SENDER_NAME } from '../../utils/systemEmail.util.js';
import { escapeHtml } from '../../utils/htmlEscape.util.js';
import { logError } from '../../utils/logger.util.js';
import { getFrontendInboxUrl } from './chatbotContactAlert.service.js';

function formatChannelLabel(ch) {
  const map = {
    web: 'Website',
    zalo_personal: 'Zalo cá nhân',
    zalo_oa: 'Zalo OA',
    facebook: 'Facebook',
    whatsapp: 'WhatsApp',
    whatsapp_baileys: 'WhatsApp',
  };
  return map[ch] || ch || 'Khác';
}

export function buildDigestEmailHtml({ userFullName, stats, range, frequency }) {
  const base = (process.env.FRONTEND_URL || 'https://founderai.vn').replace(/\/+$/, '');
  const inboxSettingsUrl = escapeHtml(`${base}/app/settings/inbox`);

  // 4 ô số thống kê
  const statCardsHtml = `
    <div style="display: flex; flex-wrap: wrap; gap: 12px; margin: 20px 0;">
      <div style="flex: 1; min-width: 120px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; text-align: center;">
        <div style="font-size: 24px; font-weight: 700; color: #0284c7;">${stats.conversations}</div>
        <div style="font-size: 13px; color: #64748b; margin-top: 4px;">Hội thoại</div>
      </div>
      <div style="flex: 1; min-width: 120px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; text-align: center;">
        <div style="font-size: 24px; font-weight: 700; color: #0f172a;">${stats.visitorMessages}</div>
        <div style="font-size: 13px; color: #64748b; margin-top: 4px;">Tin khách</div>
      </div>
      <div style="flex: 1; min-width: 120px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; text-align: center;">
        <div style="font-size: 24px; font-weight: 700; color: #16a34a;">${stats.aiReplies}</div>
        <div style="font-size: 13px; color: #64748b; margin-top: 4px;">AI trả lời</div>
      </div>
      <div style="flex: 1; min-width: 120px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; text-align: center;">
        <div style="font-size: 24px; font-weight: 700; color: #9333ea;">${stats.humanReplies}</div>
        <div style="font-size: 13px; color: #64748b; margin-top: 4px;">Người trả lời</div>
      </div>
    </div>
  `;

  // Bảng theo kênh
  let channelTableHtml = '';
  if (Array.isArray(stats.byChannel) && stats.byChannel.length > 0) {
    const rows = stats.byChannel
      .map(
        (c) => `
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 10px 12px; font-size: 13px; color: #1e293b; font-weight: 500;">${escapeHtml(c.channelLabel || formatChannelLabel(c.channel))}</td>
        <td style="padding: 10px 12px; font-size: 13px; color: #475569; text-align: center;">${c.conversations}</td>
        <td style="padding: 10px 12px; font-size: 13px; color: #475569; text-align: center;">${c.visitorMessages}</td>
        <td style="padding: 10px 12px; font-size: 13px; color: #16a34a; text-align: center;">${c.aiReplies}</td>
        <td style="padding: 10px 12px; font-size: 13px; color: #9333ea; text-align: center;">${c.humanReplies}</td>
      </tr>`
      )
      .join('');

    channelTableHtml = `
      <div style="margin: 24px 0 20px;">
        <h3 style="font-size: 15px; color: #0f172a; margin-bottom: 10px;">Chi tiết theo kênh</h3>
        <table style="width: 100%; border-collapse: collapse; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
          <thead>
            <tr style="background-color: #f1f5f9; border-bottom: 1px solid #e2e8f0;">
              <th style="padding: 8px 12px; font-size: 12px; color: #64748b; text-align: left;">Kênh</th>
              <th style="padding: 8px 12px; font-size: 12px; color: #64748b; text-align: center;">Hội thoại</th>
              <th style="padding: 8px 12px; font-size: 12px; color: #64748b; text-align: center;">Tin khách</th>
              <th style="padding: 8px 12px; font-size: 12px; color: #64748b; text-align: center;">AI</th>
              <th style="padding: 8px 12px; font-size: 12px; color: #64748b; text-align: center;">Người</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    `;
  }

  // Khách để lại thông tin liên hệ
  const contactSectionHtml = `
    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 16px; margin: 20px 0;">
      <div style="font-size: 14px; color: #0f172a;">
        Khách để lại liên hệ: <strong>${stats.contactsLeft}</strong> &nbsp;|&nbsp;
        Chưa xử lý: <strong style="color: ${stats.contactsOpen > 0 ? '#dc2626' : '#16a34a'};">${stats.contactsOpen}</strong>
      </div>
      <div style="margin-top: 8px;">
        <a href="${inboxSettingsUrl}" style="color: #0284c7; font-size: 13px; font-weight: 600; text-decoration: none;">
          Xem danh sách khách để lại liên hệ &rarr;
        </a>
      </div>
    </div>
  `;

  // Cảnh báo hội thoại tạm dừng quá 24h
  let staleAlertHtml = '';
  if (stats.stalePaused > 0) {
    staleAlertHtml = `
      <div style="background-color: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 12px 16px; margin: 20px 0; color: #92400e; font-size: 13px;">
        ⚠️ Có <strong>${stats.stalePaused}</strong> cuộc hội thoại đang tạm dừng AI (chờ nhân viên trả lời) quá 24 giờ. Vui lòng kiểm tra hộp thư để hỗ trợ khách kịp thời.
      </div>
    `;
  }

  // Top hội thoại nhiều tin khách nhất
  let topConvHtml = '';
  if (Array.isArray(stats.topConversations) && stats.topConversations.length > 0) {
    const items = stats.topConversations
      .map((conv) => {
        const url = escapeHtml(
          getFrontendInboxUrl({
            source: conv.source,
            conversationId: conv.conversationId,
          })
        );
        const vName = escapeHtml(conv.visitorName || 'Khách');
        const chLabel = escapeHtml(formatChannelLabel(conv.channel));

        return `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid #f1f5f9;">
          <div>
            <div style="font-size: 13px; font-weight: 600; color: #1e293b;">${vName} <span style="font-size: 12px; font-weight: normal; color: #64748b;">(${chLabel})</span></div>
            <div style="font-size: 12px; color: #64748b; margin-top: 2px;">${conv.visitorMessages} tin nhắn từ khách</div>
          </div>
          <div>
            <a href="${url}" style="color: #0284c7; font-size: 12px; font-weight: 600; text-decoration: none;">Mở &rarr;</a>
          </div>
        </div>`;
      })
      .join('');

    topConvHtml = `
      <div style="margin: 24px 0 20px;">
        <h3 style="font-size: 15px; color: #0f172a; margin-bottom: 10px;">Hội thoại nổi bật</h3>
        <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 6px 16px;">
          ${items}
        </div>
      </div>
    `;
  }

  const greetingPeriod =
    frequency === 'monthly'
      ? `tháng vừa qua (${escapeHtml(range.label)})`
      : `tuần vừa qua (${escapeHtml(range.label)})`;

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1e293b; line-height: 1.5;">
      <h2 style="color: #0f172a; font-size: 20px; margin-bottom: 8px;">Tổng hợp hoạt động chatbot</h2>
      <p style="font-size: 14px; color: #475569; margin-bottom: 16px;">
        Xin chào${userFullName ? ` <strong>${escapeHtml(userFullName)}</strong>` : ''}, dưới đây là tổng kết số liệu trợ lý AI ${greetingPeriod}:
      </p>

      ${statCardsHtml}
      ${staleAlertHtml}
      ${channelTableHtml}
      ${contactSectionHtml}
      ${topConvHtml}

      <div style="margin-top: 28px; text-align: center;">
        <a href="${inboxSettingsUrl}" style="display: inline-block; background-color: #0284c7; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 14px;">
          Mở Cài đặt Hộp thư
        </a>
      </div>

      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 32px 0 16px;" />
      <p style="font-size: 12px; color: #94a3b8; text-align: center; margin: 0;">
        Email tổng hợp tự động từ hệ thống UKNOW Campaign. Bạn có thể thay đổi tần suất nhận thư tại Cài đặt Hộp thư.
      </p>
    </div>
  `;
}

class ChatbotDigestService {
  /**
   * Gửi thư tổng hợp hoạt động chatbot cho người dùng có cài đặt phù hợp
   * @param {object} [options]
   * @param {'weekly'|'monthly'} [options.frequency='weekly']
   * @param {Date} [options.now=new Date()]
   * @param {Array<number|string>|null} [options.onlyUserIds=null]
   * @returns {Promise<{ frequency: string, periodKey: string, recipients: number, sent: number, skipped: number, failed: number, synced: number, onlyUserIds: Array<number>|null }>}
   */
  async sendDigests({
    frequency = 'weekly',
    now = new Date(),
    onlyUserIds = null,
  } = {}) {
    const range =
      frequency === 'monthly'
        ? getVietnamMonthRange(now)
        : getVietnamWeekRange(now);

    const targetUserIds =
      Array.isArray(onlyUserIds) && onlyUserIds.length > 0
        ? onlyUserIds.map(Number)
        : null;

    const recipients = await chatbotDigestRepository.listDigestRecipients(
      frequency,
      { startIso: range.startIso, endIso: range.endIso },
      { onlyUserIds: targetUserIds }
    );

    let sent = 0;
    let skipped = 0;
    let failed = 0;

    for (const user of recipients) {
      try {
        const stats = await chatbotDigestRepository.getDigestStats(user.id, {
          startIso: range.startIso,
          endIso: range.endIso,
        });

        const logEntry = await chatbotDigestRepository.insertDigestLog({
          idUser: user.id,
          periodKey: range.periodKey,
          periodStart: range.startIso,
          periodEnd: range.endIso,
          stats,
        });

        if (!logEntry) {
          // Đã gửi trong kỳ này (idempotent ON CONFLICT DO NOTHING)
          skipped++;
          continue;
        }

        const subject = `[${SENDER_NAME}] Tổng hợp chatbot ${range.label}`;
        const html = buildDigestEmailHtml({
          userFullName: user.full_name,
          stats,
          range,
          frequency,
        });

        await sendSystemEmail({
          to: user.email,
          subject,
          html,
        });

        sent++;
      } catch (err) {
        logError('chatbot_digest_send_error', {
          userId: user.id,
          email: user.email,
          error: err?.message,
        });
        // Nếu gửi thư lỗi thì xoá dòng log vừa chèn để lượt sau gửi lại
        await chatbotDigestRepository.deleteDigestLog(user.id, range.periodKey);
        failed++;
      }
    }

    return {
      frequency,
      periodKey: range.periodKey,
      recipients: recipients.length,
      sent,
      skipped,
      failed,
      synced: sent,
      onlyUserIds: targetUserIds,
    };
  }
}

export default new ChatbotDigestService();
