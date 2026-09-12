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

// Dựng client ở lần gọi ĐẦU TIÊN, không phải lúc import. `axios.create` chạy ngay ở thân
// module sẽ nổ với mọi test mock axios một phần — courses/founderai/googleSheets đều mock
// `{ default: { get } }`, và vì chatbot.controller.js nằm trong cây import của createApp(),
// ba suite đó chết ngay ở bước import với "axios.create is not a function" (CI đỏ 12/09,
// kéo theo Deploy Backend hỏng). Mọi call site dưới đây đã nằm sau isConfigured() nên hoãn
// việc dựng client không đổi hành vi lúc chạy thật.
let cachedClient = null;

function getClient() {
  if (!cachedClient) {
    cachedClient = axios.create({
      baseURL: GATEWAY_URL || 'http://localhost:8765',
      timeout: 20000,
      headers: GATEWAY_SECRET ? { 'X-Gateway-Secret': GATEWAY_SECRET } : {},
    });
  }
  return cachedClient;
}

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
    getClient().post('/sessions/create')
  ),

  getStatus: wrap('getStatus', (sessionId) =>
    getClient().get(`/sessions/${encodeURIComponent(sessionId)}/status`)
  ),

  cancelSession: wrap('cancelSession', (sessionId) =>
    getClient().delete(`/sessions/${encodeURIComponent(sessionId)}`)
  ),

  listAccounts: wrap('listAccounts', () => getClient().get('/sessions')),

  deleteAccount: wrap('deleteAccount', (telegramUserId) =>
    getClient().delete(`/sessions/by-telegram/${telegramUserId}`)
  ),

  bindAccount: wrap('bindAccount', (telegramUserId, accountId) =>
    getClient().post(`/sessions/by-telegram/${telegramUserId}/bind`, { account_id: accountId })
  ),

  sendMessage: wrap('sendMessage', (telegramUserId, chatId, text) =>
    getClient().post(`/sessions/by-telegram/${telegramUserId}/send`, {
      chat_id: chatId,
      text,
    })
  ),

  ensureHandler: wrap('ensureHandler', (telegramUserId) =>
    getClient().post(`/sessions/by-telegram/${telegramUserId}/ensure-handler`)
  ),
};

export default telegramGateway;
