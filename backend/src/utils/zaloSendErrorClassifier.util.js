import { isZaloTimeoutError } from './zaloTimeoutRetry.util.js';
import {
  isZaloSenderBlockedError,
  isZaloUnreachableRecipientError,
} from './zaloPhoneCampaign.util.js';

const CATEGORY_LABELS = {
  PHONE_LOOKUP_RATE_LIMIT: 'Tra số quá nhiều — Zalo tạm khóa tra cứu (~3h)',
  RECIPIENT_NOT_FOUND: 'Số chưa dùng Zalo hoặc sai số',
  TIMEOUT: 'Mạng/Zalo phản hồi chậm',
  ACCOUNT_DISCONNECTED: 'Tài khoản Zalo mất kết nối / hết phiên',
  NOT_FRIEND_OR_BLOCKED: 'Người nhận chặn / chưa là bạn / hạn chế',
  QUIET_HOURS: 'Đang trong khung giờ im lặng Zalo',
  RATE_LIMITED: 'Đã đạt giới hạn gửi theo giờ',
  UNKNOWN: null,
};

function buildErrorProbe(error) {
  const parts = [];
  if (typeof error === 'string') parts.push(error);
  if (error && typeof error === 'object') {
    parts.push(
      error.message,
      error.code,
      error.cause?.message,
      error.cause?.code,
      error.response?.data?.message,
      error.failedReason,
    );
  }
  return parts
    .filter((p) => p != null && String(p).trim() !== '')
    .map((p) => String(p).trim().toLowerCase())
    .join(' ');
}

/**
 * Nhận diện lỗi Zalo khi tra số quá nhiều / vượt quota request.
 * Chỉ đọc error.message để giữ hành vi y hệt ZaloRateLimiter cũ trên production path.
 *
 * @param {unknown} error
 * @returns {boolean}
 */
export function isZaloPhoneLookupRateLimitError(error) {
  const msg = String(error?.message ?? error ?? '').trim().toLowerCase();
  if (!msg) return false;
  return msg.includes('tìm số điện thoại quá nhiều')
    || (msg.includes('quá nhiều lần trong 1 giờ') && msg.includes('bất thường'))
    || msg.includes('vượt quá số request cho phép');
}

function isAccountDisconnectedError(error) {
  const msg = buildErrorProbe(error);
  if (!msg) return false;
  return msg.includes('session')
    || msg.includes('đăng nhập')
    || msg.includes('kết nối')
    || msg.includes('login')
    || msg.includes('phiên đăng nhập')
    || msg.includes('không còn hiệu lực');
}

function isNotFriendOrBlockedError(error) {
  if (isZaloSenderBlockedError(error)) return true;
  const msg = buildErrorProbe(error);
  if (!msg) return false;
  return msg.includes('chặn')
    || msg.includes('chưa kết bạn')
    || msg.includes('hạn chế')
    || msg.includes('người lạ')
    || msg.includes('vi phạm chính sách')
    || msg.includes('không thể nhận tin nhắn');
}

function isRecipientNotFoundError(error) {
  const msg = buildErrorProbe(error);
  if (!msg) return false;
  if (msg.includes('không tìm thấy user') || msg.includes('không tìm thấy user zalo')) return true;
  if (isZaloUnreachableRecipientError(error)) return true;
  return msg.includes('không tìm thấy') && (msg.includes('số') || msg.includes('user'));
}

function formatTimeoutLabel(error) {
  const attempts = Number.parseInt(error?.zaloRetry?.attempt, 10);
  const base = CATEGORY_LABELS.TIMEOUT;
  if (Number.isFinite(attempts) && attempts > 0) {
    return `${base} — đã thử lại ${attempts} lần`;
  }
  return `${base} — đã thử lại nhiều lần`;
}

/**
 * Phân loại lỗi gửi Zalo thành nhóm dễ hiểu cho diagnostic / log.
 *
 * @param {unknown} error
 * @param {{ stage?: 'lookup'|'send'|'wait'|string }} [options]
 * @returns {{ category: string, label: string, hint: string|null }}
 */
export function classifyZaloSendError(error, { stage } = {}) {
  const rawMessage = String(
    error && typeof error === 'object' ? (error.message || error.code || '') : (error ?? '')
  ).trim();

  if (isZaloPhoneLookupRateLimitError(error)) {
    return {
      category: 'PHONE_LOOKUP_RATE_LIMIT',
      label: CATEGORY_LABELS.PHONE_LOOKUP_RATE_LIMIT,
      hint: stage === 'lookup'
        ? 'Lỗi xảy ra khi tra số điện thoại sang UID Zalo.'
        : 'Tài khoản có thể đang trong cooldown tra số ~3 giờ.',
    };
  }

  if (isZaloTimeoutError(error)) {
    return {
      category: 'TIMEOUT',
      label: formatTimeoutLabel(error),
      hint: 'Kiểm tra mạng VPS hoặc thử lại sau vài phút.',
    };
  }

  if (isAccountDisconnectedError(error)) {
    return {
      category: 'ACCOUNT_DISCONNECTED',
      label: CATEGORY_LABELS.ACCOUNT_DISCONNECTED,
      hint: 'Vào Cài đặt Zalo và đăng nhập lại tài khoản.',
    };
  }

  if (isNotFriendOrBlockedError(error)) {
    return {
      category: 'NOT_FRIEND_OR_BLOCKED',
      label: CATEGORY_LABELS.NOT_FRIEND_OR_BLOCKED,
      hint: null,
    };
  }

  if (isRecipientNotFoundError(error)) {
    return {
      category: 'RECIPIENT_NOT_FOUND',
      label: CATEGORY_LABELS.RECIPIENT_NOT_FOUND,
      hint: null,
    };
  }

  return {
    category: 'UNKNOWN',
    label: rawMessage || 'Lỗi không xác định',
    hint: null,
  };
}

export function getZaloErrorCategoryLabel(category) {
  if (!category) return null;
  if (category === 'UNKNOWN') return null;
  return CATEGORY_LABELS[category] || category;
}
