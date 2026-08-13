export const CHATBOT_REPLY_LIMIT_WINDOWS = Object.freeze(['minute', 'hour', 'day', 'month']);
export const CHATBOT_REPLY_LIMIT_ACTIONS = Object.freeze(['silent', 'notify']);

const MAX_LIMIT = 10_000_000;
const MAX_MESSAGE_LENGTH = 500;

export const DEFAULT_CHATBOT_REPLY_LIMIT_MESSAGE =
  'Trợ lý đang bận, chưa trả lời thêm được lúc này. Bạn cứ để lại câu hỏi, chúng tôi sẽ xem và phản hồi.';

function normalizeRule(raw, { strict }) {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    if (strict && raw != null) throw new Error('Quy tắc giới hạn chatbot không hợp lệ');
    return { limit: null, action: 'silent', message: '' };
  }

  const rawLimit = raw.limit;
  let limit = null;
  if (rawLimit !== null && rawLimit !== undefined && String(rawLimit).trim() !== '') {
    const parsed = Number(rawLimit);
    if (!Number.isInteger(parsed) || parsed <= 0 || parsed > MAX_LIMIT) {
      if (strict) throw new Error(`Giới hạn phải là số nguyên từ 1 đến ${MAX_LIMIT.toLocaleString('vi-VN')}`);
    } else {
      limit = parsed;
    }
  }

  if (strict && raw.action !== undefined && !CHATBOT_REPLY_LIMIT_ACTIONS.includes(raw.action)) {
    throw new Error('Hành vi khi hết lượt phải là silent hoặc notify');
  }
  const action = CHATBOT_REPLY_LIMIT_ACTIONS.includes(raw.action) ? raw.action : 'silent';
  const message = String(raw.message || '').trim();
  if (message.length > MAX_MESSAGE_LENGTH) {
    if (strict) throw new Error(`Thông báo không được vượt quá ${MAX_MESSAGE_LENGTH} ký tự`);
  }

  return {
    limit,
    action,
    message: action === 'notify' ? message.slice(0, MAX_MESSAGE_LENGTH) : '',
  };
}

export function normalizeChatbotReplyLimitConfig(raw, { strict = false } = {}) {
  if (strict && (raw == null || typeof raw !== 'object' || Array.isArray(raw))) {
    throw new Error('Cấu hình giới hạn chatbot không hợp lệ');
  }
  const windows = raw?.windows && typeof raw.windows === 'object' && !Array.isArray(raw.windows)
    ? raw.windows
    : {};

  return {
    version: 1,
    windows: Object.fromEntries(
      CHATBOT_REPLY_LIMIT_WINDOWS.map((window) => [
        window,
        normalizeRule(windows[window], { strict }),
      ])
    ),
  };
}

export function hasEnabledChatbotReplyLimit(config) {
  const normalized = normalizeChatbotReplyLimitConfig(config);
  return CHATBOT_REPLY_LIMIT_WINDOWS.some((window) => normalized.windows[window].limit != null);
}
