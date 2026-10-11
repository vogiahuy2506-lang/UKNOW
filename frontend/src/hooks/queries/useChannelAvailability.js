import { useEffect, useMemo, useRef, useState } from 'react';
import { useChannelEntitlements } from './useChannelEntitlements';
import { useAuthStore } from '../../stores/authStore';

/**
 * PLAN_KENH_KHONG_AN_KHOA_VA_GOI_Y_MUA_2026-10-11 — một nguồn duy nhất trả lời "kênh này hiện ra không, dùng được
 * không, nếu không thì VÌ SAO" cho Email / Zalo / Telegram / WhatsApp. Trước đây mỗi trang tự ẩn thẻ kênh theo quyền gói
 * (Gửi nhanh, Tạo chiến dịch, Trình dựng, Triển khai chatbot) nên khách không biết kênh có tồn tại để mua.
 *
 * - `visible`   : có vẽ thẻ/nút/bước của kênh không. Email và Zalo luôn hiện. Telegram/WhatsApp hiện khi HỆ THỐNG bật
 *                 kênh (không lọc theo gói) — cờ hệ thống tắt thì ẩn vì không bán được.
 * - `available` : bấm vào dùng được không (= không có `reason`).
 * - `reason`    : null | 'plan_expired' | 'not_in_plan' | 'quota_exhausted' (thứ tự ưu tiên như vậy).
 * - `detail`    : 'accounts' | 'messages' | 'channel' | 'combined' | null — để modal chọn đúng nút mua (xem dưới).
 * - `used`/`limit` : số đo của đồng hồ làm kênh hết lượt (chỉ khi `quota_exhausted`).
 */

export const CHANNEL_KEYS = Object.freeze(['email', 'zalo', 'telegram', 'whatsapp']);
export const ADAPTER_CHANNEL_KEYS = Object.freeze(['telegram', 'whatsapp']);

export const CHANNEL_UNAVAILABLE_REASONS = Object.freeze({
  PLAN_EXPIRED: 'plan_expired',
  NOT_IN_PLAN: 'not_in_plan',
  QUOTA_EXHAUSTED: 'quota_exhausted',
});

// Khoá đồng hồ trong authStore.sendUsage: PLAN_SO_LIEU_DUNG_GON_KHOP — `messaging` CHỈ đếm Zalo (P10 tách Telegram/WhatsApp ra
// đồng hồ riêng); `combined` là trần tổng `messages_per_period` (chỉ có số khi gói đặt trần tổng).
const SEND_USAGE_KEY = Object.freeze({
  email: 'email',
  zalo: 'messaging',
  telegram: 'telegram',
  whatsapp: 'whatsapp',
});

// Ví mua thêm (authStore.addons, `remaining`) của từng kênh. checkSendQuota cho gửi tiếp khi hết hạn mức GÓI mà ví còn
// (userSendLimit.util.js ~811) nên KHÔNG được khoá thẻ chỉ vì used >= limit khi ví còn lượt. Trần tổng không có lối ví này.
const WALLET_ADDON_KEY = Object.freeze({
  email: 'emails',
  zalo: 'zaloMessages',
  telegram: 'telegramMessages',
  whatsapp: 'whatsappMessages',
});

const toNumberOrNull = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

/** Trần null / âm = không giới hạn (cùng quy ước isUnlimitedPlanLimit ở subscriptionStatus.util.js). */
const readMeter = (meter) => {
  const used = toNumberOrNull(meter?.used);
  const rawLimit = toNumberOrNull(meter?.limit);
  const limit = rawLimit !== null && rawLimit < 0 ? null : rawLimit;
  return { used, limit };
};

const NO_REASON = Object.freeze({ reason: null, detail: null, used: null, limit: null });

function resolveReason(channel, { entitlements, billingStatus, sendUsage, addons, isAdmin }) {
  // Super admin qua mặt mọi cổng gói/hạn mức (checkSendQuota/requireActivePlan đều bypass admin).
  if (isAdmin) return NO_REASON;

  // 1. Gói hết hạn: cùng điều kiện shouldWarnPlanExpiry nhánh 1 — hết cả ân hạn (requireActivePlan chặn /campaigns/*) hoặc
  // cron đã thu hồi gói sau khi hết hạn. Đang trong ân hạn thì VẪN dùng được -> không khoá.
  if (billingStatus?.isFullyExpired || billingStatus?.planRevokedAfterExpiry) {
    return { reason: CHANNEL_UNAVAILABLE_REASONS.PLAN_EXPIRED, detail: null, used: null, limit: null };
  }

  const own = readMeter(sendUsage?.[SEND_USAGE_KEY[channel]]);
  const combined = readMeter(sendUsage?.combined);

  // 2. Gói không có kênh. (a) trần số TÀI KHOẢN kênh = 0 (entitlement false, email không có entitlement);
  // (b) hạn mức tin/kỳ của kênh hoặc tổng = 0 -> cổng gửi trả 'disabled' dù ví còn bao nhiêu.
  // detail 'messages' = mua slot tài khoản KHÔNG mở được kênh (hạn mức tin vẫn 0) -> modal chỉ mời nâng gói.
  const noMessages = own.limit === 0 || combined.limit === 0;
  const noAccounts = channel !== 'email' && entitlements?.[channel] === false;
  if (noAccounts || noMessages) {
    return {
      reason: CHANNEL_UNAVAILABLE_REASONS.NOT_IN_PLAN,
      detail: noMessages ? 'messages' : 'accounts',
      used: null,
      limit: null,
    };
  }

  // 3. Hết lượt trong kỳ: used >= limit (cổng chặn khi used + 1 > limit) VÀ ví mua thêm của kênh hết.
  if (own.limit !== null && own.used !== null && own.used >= own.limit) {
    const wallet = toNumberOrNull(addons?.[WALLET_ADDON_KEY[channel]]?.remaining);
    if (!(wallet !== null && wallet > 0)) {
      return {
        reason: CHANNEL_UNAVAILABLE_REASONS.QUOTA_EXHAUSTED,
        detail: 'channel',
        used: own.used,
        limit: own.limit,
      };
    }
  }
  if (combined.limit !== null && combined.used !== null && combined.used >= combined.limit) {
    return {
      reason: CHANNEL_UNAVAILABLE_REASONS.QUOTA_EXHAUSTED,
      detail: 'combined',
      used: combined.used,
      limit: combined.limit,
    };
  }

  return NO_REASON;
}

/**
 * Hàm thuần (không React) — test được bảng "trạng thái × kênh".
 *
 * @param {object} input
 * @param {{telegram?: boolean, whatsapp?: boolean, zalo?: boolean}} [input.entitlements] thiếu trường = có quyền
 * @param {Array<{key: string, label?: string}>|null} [input.adapterChannels] kênh adapter hệ thống đang bật; null = chưa biết
 * @param {object|null} [input.billingStatus] authStore.billingStatus
 * @param {object|null} [input.sendUsage] authStore.sendUsage
 * @param {object|null} [input.addons] authStore.addons
 * @param {boolean} [input.isAdmin]
 * @returns {Record<'email'|'zalo'|'telegram'|'whatsapp', {visible: boolean, available: boolean, reason: string|null, detail: string|null, used: number|null, limit: number|null}>}
 */
export function resolveChannelAvailability({
  entitlements = {},
  adapterChannels = null,
  billingStatus = null,
  sendUsage = null,
  addons = null,
  isAdmin = false,
} = {}) {
  const adapterKeys = new Set((adapterChannels || []).map((c) => c?.key));
  const result = {};
  for (const channel of CHANNEL_KEYS) {
    const visible = ADAPTER_CHANNEL_KEYS.includes(channel) ? adapterKeys.has(channel) : true;
    const resolved = resolveReason(channel, { entitlements, billingStatus, sendUsage, addons, isAdmin });
    result[channel] = { visible, available: resolved.reason === null, ...resolved };
  }
  return result;
}

/**
 * @param {object} [options]
 * @param {() => Promise<any>} [options.fetchAdapterChannels] Chỉ dùng khi backend CŨ (thiếu `enabledAdapterChannels`):
 *   lấy danh sách kênh từ GET /campaigns/channels như trước. Trả về axios response `{ data: { data: { channels } } }`.
 *   Không truyền thì không có đường dự phòng (Telegram/WhatsApp không `visible` khi backend cũ) — chỗ không cần `visible`
 *   (Triển khai chatbot) bỏ qua tham số này.
 */
export function useChannelAvailability({ fetchAdapterChannels } = {}) {
  const entitlements = useChannelEntitlements();
  const sendUsage = useAuthStore((state) => state.sendUsage);
  const billingStatus = useAuthStore((state) => state.billingStatus);
  const addons = useAuthStore((state) => state.addons);
  const role = useAuthStore((state) => state.user?.role);

  const entitledAdapterChannels = entitlements.enabledAdapterChannels;
  const hasSystemList = Array.isArray(entitledAdapterChannels);
  const isLoading = Boolean(entitlements.isLoading);

  // Đường dự phòng: chỉ chạy khi đã tải xong quyền mà KHÔNG có danh sách hệ thống (backend cũ / lượt tải lỗi).
  const [fallbackChannels, setFallbackChannels] = useState(null);
  const fetchRef = useRef(fetchAdapterChannels);
  fetchRef.current = fetchAdapterChannels;
  const needsFallback = !isLoading && !hasSystemList;
  useEffect(() => {
    if (!needsFallback || typeof fetchRef.current !== 'function') return undefined;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchRef.current();
        if (cancelled) return;
        const channels = res?.data?.data?.channels;
        setFallbackChannels(
          Array.isArray(channels)
            ? channels
              .filter((c) => ADAPTER_CHANNEL_KEYS.includes(c?.key))
              .map((c) => ({ key: c.key, label: c.label || c.key }))
            : []
        );
      } catch {
        if (!cancelled) setFallbackChannels([]);
      }
    })();
    return () => { cancelled = true; };
  }, [needsFallback]);

  const adapterChannels = useMemo(() => {
    const source = hasSystemList ? entitledAdapterChannels : fallbackChannels;
    if (!Array.isArray(source)) return [];
    return source
      .filter((c) => ADAPTER_CHANNEL_KEYS.includes(c?.key))
      .map((c) => ({ key: c.key, label: c.label || c.key }));
  }, [hasSystemList, entitledAdapterChannels, fallbackChannels]);

  const entitlementTelegram = entitlements.telegram;
  const entitlementWhatsapp = entitlements.whatsapp;
  const entitlementZalo = entitlements.zalo;
  const availability = useMemo(
    () => resolveChannelAvailability({
      entitlements: { telegram: entitlementTelegram, whatsapp: entitlementWhatsapp, zalo: entitlementZalo },
      adapterChannels,
      billingStatus,
      sendUsage,
      addons,
      isAdmin: role === 'admin',
    }),
    [entitlementTelegram, entitlementWhatsapp, entitlementZalo, adapterChannels, billingStatus, sendUsage, addons, role]
  );

  return { ...availability, adapterChannels, isLoading };
}

export default useChannelAvailability;
