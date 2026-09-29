/**
 * Báo CHỦ tài khoản khi kênh Zalo cá nhân / Telegram / WhatsApp mất kết nối (P3 bước 4, "W8").
 *
 * Mỗi lượt cron (10 phút):
 *  1. QUÉT: đọc trạng thái hiện tại từng kênh → cập nhật bảng `channel_disconnect_alerts`
 *     (mốc `disconnected_since` = lúc bắt đầu mất; NULL khi đang nối).
 *  2. BÁO: tài khoản mất > 15 phút, chưa bị bỏ > 7 ngày, chưa báo trong 24h → 1 email/chủ (gộp mọi
 *     tài khoản của chủ đó), rồi ghi `last_alerted_at`.
 *
 * Bảng này cũng là nguồn của luật cảnh báo admin `telegram_disconnected`/`whatsapp_disconnected`
 * (alert.repository.metricChannelDisconnected) — nên bước QUÉT chạy kể cả khi không gửi được email.
 *
 * Không có hệ thông báo trong-app cho chủ tài khoản (bảng `notifications` là công cụ gửi email hàng
 * loạt của admin) → chỉ email.
 */
import repo from '../../repositories/chatbot/channelDisconnectAlert.repository.js';
import { sendSystemEmail, buildBaseTemplate, SENDER_NAME } from '../../utils/systemEmail.util.js';
import { escapeHtml } from '../../utils/htmlEscape.util.js';
import { logError } from '../../utils/logger.util.js';

export const DISCONNECT_AFTER_MINUTES = 15;
export const ALERT_COOLDOWN_MS = 24 * 60 * 60 * 1000;
export const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

export const CHANNEL_ZALO = 'zalo_personal';
export const CHANNEL_TELEGRAM = 'telegram';
export const CHANNEL_WHATSAPP = 'whatsapp';

const CHANNEL_LABELS = {
  [CHANNEL_ZALO]: 'Zalo cá nhân',
  [CHANNEL_TELEGRAM]: 'Telegram',
  [CHANNEL_WHATSAPP]: 'WhatsApp',
};

const CHANNEL_HASH = {
  [CHANNEL_ZALO]: 'zalo',
  [CHANNEL_TELEGRAM]: 'telegram',
  [CHANNEL_WHATSAPP]: 'whatsapp',
};

export function channelSettingsUrl(channel) {
  const base = String(process.env.FRONTEND_URL || 'https://founderai.vn').replace(/\/+$/, '');
  return `${base}/app/settings/channels#${CHANNEL_HASH[channel] || ''}`;
}

/**
 * Mốc bắt đầu mất kết nối mới cho một tài khoản (hàm thuần).
 * - Đang nối → null.
 * - Đang mất và đã có mốc → giữ mốc.
 * - Mất mà chưa có dòng nào (lần đầu thấy) → dùng gợi ý (lần cuối còn sống) nếu hợp lệ, không thì now.
 * - Mất vừa chuyển từ nối (dòng có, mốc null) → now (mốc quan sát thật, không dùng gợi ý cũ).
 */
export function nextDisconnectedSince({ down, existing, sinceHint, now }) {
  if (!down) return null;
  if (existing && existing.disconnected_since) return new Date(existing.disconnected_since);
  if (!existing && sinceHint) {
    const hint = new Date(sinceHint);
    if (!Number.isNaN(hint.getTime()) && hint.getTime() <= now.getTime()) return hint;
  }
  return now;
}

/**
 * Lọc các dòng cần báo (hàm thuần): mất > 15 phút, KHÔNG quá 7 ngày, chưa báo trong 24h.
 * @param {Array<{ disconnected_since: Date|string, last_alerted_at?: Date|string|null }>} rows
 * @param {Date} now
 */
export function selectAlertable(rows, now) {
  const t = now.getTime();
  return rows.filter((r) => {
    if (!r.disconnected_since) return false;
    const since = new Date(r.disconnected_since).getTime();
    if (since > t - DISCONNECT_AFTER_MINUTES * MINUTE_MS) return false; // mới mất, có thể chỉ chớp
    if (since < t - MAX_AGE_MS) return false; // bỏ dùng từ lâu — không báo mãi
    if (r.last_alerted_at && new Date(r.last_alerted_at).getTime() > t - ALERT_COOLDOWN_MS) return false;
    return true;
  });
}

export function buildChannelDisconnectEmail({ fullName, items }) {
  const rowsHtml = items
    .map((it) => {
      const channelLabel = CHANNEL_LABELS[it.channel] || it.channel;
      const url = escapeHtml(channelSettingsUrl(it.channel));
      return `
        <tr>
          <td style="padding:10px 14px;border-bottom:1px solid #fee2e2;font-size:14px;color:#7f1d1d">
            <strong>${escapeHtml(channelLabel)}</strong> — ${escapeHtml(it.account_label || '—')}
          </td>
          <td style="padding:10px 14px;border-bottom:1px solid #fee2e2;text-align:right">
            <a href="${url}" style="color:#ea580c;font-size:13px;font-weight:600;text-decoration:none">Quét lại / đăng nhập lại →</a>
          </td>
        </tr>`;
    })
    .join('');
  const content = `
    <p style="margin:0 0 6px;font-size:16px;color:#374151;line-height:1.6">
      Xin chào <strong style="color:#f97316">${escapeHtml(fullName || 'bạn')}</strong>,
    </p>
    <p style="margin:0 0 20px;font-size:15px;color:#6b7280;line-height:1.6">
      ${items.length === 1 ? 'Một tài khoản kênh' : `${items.length} tài khoản kênh`} của bạn đã mất kết nối hơn ${DISCONNECT_AFTER_MINUTES} phút.
      Trong lúc này trợ lý AI không nhận và không trả lời được tin khách, chiến dịch gửi qua tài khoản đó cũng không chạy.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#fef2f2;border:2px solid #fecaca;border-radius:12px;margin-bottom:24px">
      ${rowsHtml}
    </table>
    <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.6">
      Vào <strong>Cài đặt &rarr; Kênh</strong>, chọn đúng kênh rồi quét lại mã QR / đăng nhập lại. Hệ thống chỉ nhắc một lần mỗi 24 giờ cho mỗi tài khoản.
    </p>
  `;
  return {
    subject: `[${SENDER_NAME}] ${items.length === 1 ? 'Một tài khoản kênh' : `${items.length} tài khoản kênh`} mất kết nối — cần quét lại`,
    html: buildBaseTemplate({
      subtitle: 'Kênh mất kết nối',
      content,
      footerNote: 'Đây là email tự động từ hệ thống. Vui lòng không reply.',
    }),
  };
}

/** Đọc trạng thái hiện tại từng kênh. Trả null cho kênh không đọc được (không sync, không xoá dòng). */
async function collectEntries(now, deps) {
  const out = {};

  // Zalo cá nhân — trạng thái nằm trong DB.
  try {
    const rows = await deps.repo.listZaloSnapshot();
    out[CHANNEL_ZALO] = rows.map((r) => ({
      accountRef: String(r.account_ref),
      idUser: Number(r.id_user),
      label: r.label,
      down: r.down === true,
      sinceHint: r.since_hint,
    }));
  } catch (err) {
    logError('[ChannelDisconnectAlert] zalo snapshot failed:', err);
    out[CHANNEL_ZALO] = null;
  }

  // Telegram — "mất" = không còn nghe tin đến trong session manager. Gateway tắt thì bỏ kênh này
  // (không có gì để đo, tránh báo oan).
  try {
    const manager = deps.getTelegramManager();
    if (!manager) {
      out[CHANNEL_TELEGRAM] = null;
    } else {
      const rows = await deps.repo.listTelegramAccounts();
      out[CHANNEL_TELEGRAM] = rows.map((r) => ({
        accountRef: String(r.account_ref),
        idUser: Number(r.id_user),
        label: r.label,
        down: !manager.isListening(r.account_ref),
        sinceHint: r.since_hint,
      }));
    }
  } catch (err) {
    logError('[ChannelDisconnectAlert] telegram snapshot failed:', err);
    out[CHANNEL_TELEGRAM] = null;
  }

  // WhatsApp — "mất" = phiên không ở trạng thái open. Chủ = số đứng trước dấu '-' đầu tiên của sessionKey.
  try {
    const rows = await deps.repo.listWhatsappSessions();
    const entries = [];
    for (const r of rows) {
      const key = String(r.session_key);
      const idUser = Number.parseInt(key.split('-')[0], 10);
      if (!Number.isFinite(idUser)) continue;
      const rec = deps.getWhatsappSession(key);
      const phone = String(rec?.userId || '').split('@')[0].split(':')[0];
      entries.push({
        accountRef: key,
        idUser,
        label: rec?.userName || phone || key.slice(key.indexOf('-') + 1) || key,
        down: !rec || rec.status !== 'open',
        sinceHint: r.since_hint,
      });
    }
    out[CHANNEL_WHATSAPP] = entries;
  } catch (err) {
    logError('[ChannelDisconnectAlert] whatsapp snapshot failed:', err);
    out[CHANNEL_WHATSAPP] = null;
  }
  return out;
}

async function defaultDeps() {
  return {
    repo,
    sendEmail: sendSystemEmail,
    getTelegramManager: () => null,
    getWhatsappSession: () => null,
  };
}

async function loadRuntimeDeps() {
  const deps = await defaultDeps();
  if (process.env.TELEGRAM_GATEWAY_EMBEDDED !== 'false') {
    const gateway = await import('./inProcChannelGateway/index.js');
    const state = gateway.getState();
    // Chỉ đo khi gateway đã khởi động — chưa start thì mọi tài khoản "không nghe" là giả.
    deps.getTelegramManager = () => (state.telegram?.started ? gateway.getSessionManager('telegram') : null);
  }
  const wa = await import('./whatsappBaileys.service.js');
  deps.getWhatsappSession = (key) => wa.getSession(key);
  return deps;
}

/**
 * @param {{ now?: Date, deps?: object }} [opts]
 * @returns {Promise<{ tracked: number, disconnected: number, alerted: number, owners: number, emails: { sent: number, failed: number }, synced: number }>}
 */
export async function scanAndNotify({ now = new Date(), deps = null } = {}) {
  const d = deps || (await loadRuntimeDeps());
  const snapshots = await collectEntries(now, d);

  let tracked = 0;
  for (const [channel, entries] of Object.entries(snapshots)) {
    if (!entries) continue;
    const existingRows = await d.repo.listStatesByChannel(channel);
    const existingMap = new Map(existingRows.map((r) => [String(r.account_ref), r]));
    const toWrite = entries.map((e) => ({
      accountRef: e.accountRef,
      idUser: e.idUser,
      label: e.label,
      disconnectedSince: nextDisconnectedSince({
        down: e.down,
        existing: existingMap.get(e.accountRef) || null,
        sinceHint: e.sinceHint,
        now,
      }),
    }));
    await d.repo.syncChannel(channel, toWrite, now);
    tracked += toWrite.length;
  }

  const disconnectedRows = await d.repo.listDisconnectedWithOwner();
  // Chỉ báo cho kênh vừa đo được lượt này — kênh không đọc được (gateway tắt/chưa chạy) giữ nguyên
  // dòng cũ nhưng không dùng trạng thái cũ để gửi email.
  const alertable = selectAlertable(
    disconnectedRows.filter((r) => Array.isArray(snapshots[r.channel])),
    now
  );

  const byOwner = new Map();
  for (const row of alertable) {
    if (!byOwner.has(row.id_user)) {
      byOwner.set(row.id_user, { email: row.email, fullName: row.full_name, items: [] });
    }
    byOwner.get(row.id_user).items.push(row);
  }

  const emails = { sent: 0, failed: 0 };
  let alerted = 0;
  for (const owner of byOwner.values()) {
    const { subject, html } = buildChannelDisconnectEmail({ fullName: owner.fullName, items: owner.items });
    try {
      await d.sendEmail({ to: owner.email, subject, html });
      await d.repo.markAlerted(owner.items, now);
      emails.sent += 1;
      alerted += owner.items.length;
    } catch (err) {
      // Không ghi last_alerted_at → lượt sau thử lại.
      logError('[ChannelDisconnectAlert] gửi email thất bại:', err);
      emails.failed += 1;
    }
  }

  return {
    tracked,
    disconnected: disconnectedRows.length,
    alerted,
    owners: byOwner.size,
    emails,
    synced: alerted,
  };
}

export default { scanAndNotify };
