/**
 * PLAN_TG_WA_DAY_DU_2026-09-29 P4 — cấu hình gửi THEO TÀI KHOẢN Telegram/WhatsApp: trần gửi/ngày + tốc độ 3 mức
 * (khuôn `PATCH /zalo/accounts/:id/send-limit` + `/send-speed`, gộp một endpoint vì hai kênh cùng hình dạng).
 *
 * Tài khoản phải thuộc CHỦ workspace (Telegram: `telegram_accounts.id_user`; WhatsApp: session_key mang tiền tố
 * `<chủ>-`, cùng quy tắc `assertSessionOwnedBy` của adapter chiến dịch). Không thuộc -> 404, không lộ tài khoản
 * đó có tồn tại hay không.
 */
import db from '../../config/database.js';
import chatbotTelegramRepository from '../../repositories/chatbot/chatbotTelegram.repository.js';
import channelAccountSettingsRepository from '../../repositories/campaign/channelAccountSettings.repository.js';
import { countChannelSentTodayByAccount } from '../../repositories/sendQuota.repository.js';
import { getVnDayBoundaries } from '../quota/sendQuotaReservation.service.js';
import {
  CHANNEL_DAILY_LIMIT_MAX,
  CHANNEL_DAILY_WARN_THRESHOLD,
  CHANNEL_SEND_SPEED_HARD_FLOOR_MS,
  CHANNEL_SEND_SPEED_KEYS,
  getChannelSendSpeedPreset,
  isChannelWithSendSettings,
  resolveChannelSendSpeedFromRow,
} from '../../utils/channelSendSpeed.util.js';

const WHATSAPP_SESSION_KEY_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

function httpError(status, code, message) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

/**
 * Kiểm kênh + quyền sở hữu tài khoản; trả khoá tài khoản đã chuẩn hoá (Telegram: id số; WhatsApp: sessionKey).
 * @returns {Promise<{accountRef: string|number, accountKey: string}>}
 */
async function resolveOwnedAccount({ channel, accountRef, ownerUserId }) {
  if (!isChannelWithSendSettings(channel)) {
    throw httpError(404, 'CHANNEL_UNSUPPORTED', 'Kênh không được hỗ trợ.');
  }
  if (channel === 'telegram') {
    const id = Number.parseInt(accountRef, 10);
    // LUÔN truyền chủ: getAccountById BỎ lọc chủ khi userId rỗng.
    const account = Number.isInteger(id) && id > 0
      ? await chatbotTelegramRepository.getAccountById(id, { userId: ownerUserId })
      : null;
    if (!account) throw httpError(404, 'ACCOUNT_NOT_FOUND', 'Không tìm thấy tài khoản Telegram.');
    return { accountRef: account.id, accountKey: String(account.id) };
  }
  const sessionKey = String(accountRef ?? '').trim();
  if (!WHATSAPP_SESSION_KEY_PATTERN.test(sessionKey) || !sessionKey.startsWith(`${Number(ownerUserId)}-`)) {
    throw httpError(404, 'ACCOUNT_NOT_FOUND', 'Không tìm thấy tài khoản WhatsApp.');
  }
  return { accountRef: sessionKey, accountKey: sessionKey };
}

function buildView({ channel, accountKey, settings, sentToday }) {
  return {
    channel,
    accountKey,
    userDailySendLimit: settings.userDailySendLimit,
    sendSpeed: resolveChannelSendSpeedFromRow(channel, settings.delayMinMs, settings.delayMaxMs),
    delayMinMs: settings.delayMinMs,
    delayMaxMs: settings.delayMaxMs,
    sentToday,
    // Ngưỡng CẢNH BÁO (không chặn): FE hiện chữ vàng khi người dùng đặt trần cao hơn mức này.
    warnThreshold: CHANNEL_DAILY_WARN_THRESHOLD[channel],
    dailyLimitMax: CHANNEL_DAILY_LIMIT_MAX,
    hardFloorMs: CHANNEL_SEND_SPEED_HARD_FLOOR_MS[channel],
  };
}

/**
 * @param {{channel: string, accountRef: string|number, ownerUserId: number, now?: Date}} input
 */
export async function getChannelAccountSendSettings({ channel, accountRef, ownerUserId, now = new Date() }) {
  const account = await resolveOwnedAccount({ channel, accountRef, ownerUserId });
  const settings = await channelAccountSettingsRepository.getSendSettings(channel, account.accountRef, ownerUserId);
  if (!settings) throw httpError(404, 'ACCOUNT_NOT_FOUND', 'Không tìm thấy tài khoản.');
  const { vnDayStart, vnDayEnd } = getVnDayBoundaries(now);
  // Số tin CHIẾN DỊCH đã gửi hôm nay (cùng bộ đếm mà runner dùng để chặn) — gửi nhanh không tính (is_preview).
  const sentToday = await countChannelSentTodayByAccount(
    db,
    channel,
    account.accountKey,
    vnDayStart,
    vnDayEnd
  );
  return buildView({ channel, accountKey: account.accountKey, settings, sentToday });
}

/**
 * Cập nhật trần/ngày và/hoặc tốc độ. Trường vắng = giữ nguyên; `userDailySendLimit: null` = bỏ giới hạn;
 * `sendSpeed: 'safe'` = xoá ghi đè (theo env). Trả `{ previous, next }` (dạng view rút gọn) để controller ghi audit.
 *
 * @param {{channel: string, accountRef: string|number, ownerUserId: number, body: object}} input
 */
export async function updateChannelAccountSendSettings({ channel, accountRef, ownerUserId, body = {} }) {
  const account = await resolveOwnedAccount({ channel, accountRef, ownerUserId });
  const has = (key) => Object.prototype.hasOwnProperty.call(body, key);
  if (!has('sendSpeed') && !has('userDailySendLimit')) {
    throw httpError(400, 'NOTHING_TO_UPDATE', 'Thiếu sendSpeed hoặc userDailySendLimit.');
  }

  const patch = {};
  if (has('sendSpeed')) {
    const preset = getChannelSendSpeedPreset(channel, body.sendSpeed);
    if (!preset) {
      throw httpError(400, 'INVALID_SEND_SPEED', `Mức tốc độ gửi không hợp lệ (${CHANNEL_SEND_SPEED_KEYS.join(', ')}).`);
    }
    patch.delayMinMs = preset.delayMinMs;
    patch.delayMaxMs = preset.delayMaxMs;
  }
  if (has('userDailySendLimit')) {
    const raw = body.userDailySendLimit;
    if (raw === null) {
      patch.userDailySendLimit = null;
    } else {
      const value = typeof raw === 'number' ? raw : Number(raw);
      if (!Number.isInteger(value) || value < 1 || value > CHANNEL_DAILY_LIMIT_MAX) {
        throw httpError(400, 'INVALID_DAILY_LIMIT', `Giới hạn gửi/ngày phải từ 1 đến ${CHANNEL_DAILY_LIMIT_MAX} (hoặc để trống để bỏ giới hạn).`);
      }
      patch.userDailySendLimit = value;
    }
  }

  const previous = await channelAccountSettingsRepository.getSendSettings(channel, account.accountRef, ownerUserId);
  const updated = await channelAccountSettingsRepository.updateSendSettings(channel, account.accountRef, ownerUserId, patch);
  if (!updated) throw httpError(404, 'ACCOUNT_NOT_FOUND', 'Không tìm thấy tài khoản.');

  const summarize = (s) => ({
    userDailySendLimit: s?.userDailySendLimit ?? null,
    sendSpeed: resolveChannelSendSpeedFromRow(channel, s?.delayMinMs, s?.delayMaxMs),
  });
  return { account, previous: summarize(previous), next: summarize(updated), settings: updated };
}

export default {
  getChannelAccountSendSettings,
  updateChannelAccountSendSettings,
};
