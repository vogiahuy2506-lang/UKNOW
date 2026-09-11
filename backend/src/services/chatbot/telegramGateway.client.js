/**
 * telegramGateway.client.js
 *
 * HTTP client used by the Node.js backend to talk to the standalone
 * Python `telegram-gateway` service. The Node.js backend never opens
 * an MTProto socket itself — every Telegram operation goes through here.
 *
 * Why this indirection?
 *   - Telethon is ~30% lighter than GramJS per account and runs on an
 *     async event loop so it can hold many sessions without exhausting
 *     Node.js's single-threaded heap.
 *   - Scaling concerns (proxy rotation, geo-distribution, etc.) stay
 *     in Python land; Node.js only knows about REST + the incoming webhook.
 */
import axios from 'axios';
import { logError } from '../../utils/logger.util.js';

const GATEWAY_URL = (process.env.TELEGRAM_GATEWAY_URL || '').replace(/\/+$/, '');
const GATEWAY_SECRET = process.env.TELEGRAM_GATEWAY_SECRET || '';

if (!GATEWAY_URL) {
  console.warn(
    '[TelegramGateway] TELEGRAM_GATEWAY_URL is not set — Telegram features will be disabled.'
  );
}

const client = axios.create({
  baseURL: GATEWAY_URL || 'http://localhost:8765',
  timeout: 20000,
  headers: GATEWAY_SECRET ? { 'X-Gateway-Secret': GATEWAY_SECRET } : {},
});

/**
 * Returns true when the gateway has been configured. Used to short-circuit
 * Telegram endpoints cleanly instead of failing with cryptic 500s.
 */
function isConfigured() {
  return Boolean(GATEWAY_URL && GATEWAY_SECRET);
}

function wrap(name, fn) {
  return async (...args) => {
    if (!isConfigured()) {
      throw new Error('Telegram gateway is not configured on the backend');
    }
    try {
      return await fn(...args);
    } catch (err) {
      const status = err?.response?.status;
      const detail = err?.response?.data?.detail || err?.response?.data?.message;
      logError(`[TelegramGateway] ${name} failed`, {
        status,
        detail,
        message: err.message,
      });
      const wrapped = new Error(
        detail ? `${name}: ${detail}` : `${name} failed: ${err.message}`
      );
      wrapped.status = status || 502;
      wrapped.cause = err;
      throw wrapped;
    }
  };
}

const telegramGateway = {
  isConfigured,
  baseUrl: GATEWAY_URL,

  createSession: wrap('createSession', () =>
    client.post('/sessions/create')
  ),

  getStatus: wrap('getStatus', (sessionId) =>
    client.get(`/sessions/${encodeURIComponent(sessionId)}/status`)
  ),

  cancelSession: wrap('cancelSession', (sessionId) =>
    client.delete(`/sessions/${encodeURIComponent(sessionId)}`)
  ),

  listAccounts: wrap('listAccounts', () => client.get('/sessions')),

  deleteAccount: wrap('deleteAccount', (telegramUserId) =>
    client.delete(`/sessions/by-telegram/${telegramUserId}`)
  ),

  bindAccount: wrap('bindAccount', (telegramUserId, accountId) =>
    client.post(`/sessions/by-telegram/${telegramUserId}/bind`, { account_id: accountId })
  ),

  sendMessage: wrap('sendMessage', (telegramUserId, chatId, text) =>
    client.post(`/sessions/by-telegram/${telegramUserId}/send`, {
      chat_id: chatId,
      text,
    })
  ),

  ensureHandler: wrap('ensureHandler', (telegramUserId) =>
    client.post(`/sessions/by-telegram/${telegramUserId}/ensure-handler`)
  ),
};

export default telegramGateway;
