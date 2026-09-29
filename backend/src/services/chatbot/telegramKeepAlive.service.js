/**
 * Telegram Keep-Alive (P3 — PLAN_TG_WA_DAY_DU_2026-09-29 mục 5.1).
 *
 * Khuôn của `whatsappBaileysKeepAlive.service.js`: mỗi 5 phút quét tài khoản Telegram còn phiên
 * dùng được mà client KHÔNG còn nghe tin đến (rớt socket, bị dọn, đăng ký handler lỗi) và khôi phục
 * đúng đường lúc khởi động (`sessionManager.getClient` qua `ensureListening`).
 *
 * Chỉ thử tài khoản `session_ok=true` (is_active + blob còn `authKeys.permanent` — cùng tiêu chí
 * `telegramPersonal.listAccounts`). Tài khoản mất khoá đăng nhập KHÔNG được thử: đăng nhập lại liên
 * tục với phiên chết vừa vô ích vừa dễ bị Telegram coi là spam.
 *
 * Tuần tự (không song song) để không bắn cả loạt kết nối MTProto cùng lúc. Không ghi cron_job_runs:
 * keep-alive Zalo/WhatsApp cũng không ghi (288 dòng/ngày vô ích).
 */
import chatbotTelegramRepository from '../../repositories/chatbot/chatbotTelegram.repository.js';
import { hasPermanentAuthKey } from '../../utils/telegramSession.util.js';

const KEEP_ALIVE_INTERVAL_MS = 5 * 60 * 1000;

let keepAliveInterval = null;
let sweeping = false;

/**
 * Một lượt quét.
 * @returns {Promise<{ total: number, alive: number, restored: number, failed: number, skipped: number }>}
 */
export async function performKeepAlive({ repo = chatbotTelegramRepository, sessionManager = null } = {}) {
  const summary = { total: 0, alive: 0, restored: 0, failed: 0, skipped: 0 };
  let manager = sessionManager;
  if (!manager) {
    const gateway = await import('./inProcChannelGateway/index.js');
    manager = gateway.getSessionManager('telegram');
  }
  let keys;
  try {
    keys = await repo.listActiveSessionKeys();
  } catch (err) {
    console.warn('[TelegramKeepAlive] listActiveSessionKeys failed:', err.message);
    return summary;
  }
  summary.total = keys.length;
  for (const key of keys) {
    try {
      if (manager.isListening(key)) {
        summary.alive += 1;
        continue;
      }
      const blob = await repo.getSessionString(key);
      if (!hasPermanentAuthKey(blob)) {
        summary.skipped += 1; // session_ok=false → không thử
        continue;
      }
      const result = await manager.ensureListening(key);
      if (result === 'restored') summary.restored += 1;
      else if (result === 'alive') summary.alive += 1;
      else summary.failed += 1;
    } catch (err) {
      summary.failed += 1;
      console.warn(`[TelegramKeepAlive] ${key}: ${err.message}`);
    }
  }
  if (summary.restored > 0 || summary.failed > 0) {
    console.log(
      `[TelegramKeepAlive] ${summary.alive} alive, ${summary.restored} restored, ${summary.failed} failed, ${summary.skipped} skipped (of ${summary.total})`
    );
  }
  return summary;
}

async function tick() {
  if (sweeping) return; // lượt trước còn chạy (khôi phục chậm) — không chồng lượt
  sweeping = true;
  try {
    await performKeepAlive();
  } catch (err) {
    console.warn('[TelegramKeepAlive] sweep failed:', err.message);
  } finally {
    sweeping = false;
  }
}

/**
 * Idempotent. KHÔNG quét ngay lúc khởi động: `ensureGateway()` (index.js) đang khôi phục toàn bộ
 * phiên — quét chồng sẽ dựng hai client cho một tài khoản (AUTH_KEY_DUPLICATED).
 */
export function startTelegramKeepAliveScheduler() {
  if (keepAliveInterval) return;
  keepAliveInterval = setInterval(tick, KEEP_ALIVE_INTERVAL_MS);
  if (typeof keepAliveInterval.unref === 'function') keepAliveInterval.unref();
  console.log(`[TelegramKeepAlive] scheduler started (every ${KEEP_ALIVE_INTERVAL_MS / 1000}s)`);
}

export function stopTelegramKeepAliveScheduler() {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
  }
}

export const __test__ = { tick, KEEP_ALIVE_INTERVAL_MS };
