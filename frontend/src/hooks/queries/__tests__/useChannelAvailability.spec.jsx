import { renderHook, waitFor, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveChannelAvailability, useChannelAvailability } from '../useChannelAvailability';
import { useAuthStore } from '../../../stores/authStore';

/**
 * PLAN_KENH_KHONG_AN_KHOA_VA_GOI_Y_MUA_2026-10-11 — useChannelAvailability: mỗi kênh (email, zalo, telegram, whatsapp)
 * trả { visible, available, reason } đúng cho 4 trạng thái (dùng được / gói hết hạn / gói không có kênh / hết lượt).
 */

const entitlementsState = {
  telegram: true,
  whatsapp: true,
  zalo: true,
  limits: {},
  enabledAdapterChannels: null,
  isLoading: false,
};
vi.mock('../useChannelEntitlements', () => ({
  useChannelEntitlements: () => entitlementsState,
}));

const CHANNELS = ['email', 'zalo', 'telegram', 'whatsapp'];
const ADAPTERS = [
  { key: 'telegram', label: 'Telegram' },
  { key: 'whatsapp', label: 'WhatsApp' },
];
const meter = (used, limit) => ({ used, limit });
const emptyUsage = () => ({
  email: meter(null, null),
  messaging: meter(null, null),
  telegram: meter(null, null),
  whatsapp: meter(null, null),
  combined: meter(null, null),
});
// Đồng hồ sendUsage của từng kênh: Zalo ánh xạ sang `messaging`.
const USAGE_KEY = { email: 'email', zalo: 'messaging', telegram: 'telegram', whatsapp: 'whatsapp' };
const WALLET_KEY = { email: 'emails', zalo: 'zaloMessages', telegram: 'telegramMessages', whatsapp: 'whatsappMessages' };

describe('resolveChannelAvailability — bảng 4 trạng thái × 4 kênh', () => {
  it('gói bình thường: cả 4 kênh dùng được, không có lý do', () => {
    const result = resolveChannelAvailability({ adapterChannels: ADAPTERS });
    for (const channel of CHANNELS) {
      expect(result[channel]).toMatchObject({ visible: true, available: true, reason: null });
    }
  });

  it.each(CHANNELS)('gói hết hạn hẳn -> %s: plan_expired, kể cả khi kênh đó cũng không có trong gói (ưu tiên cao nhất)', (channel) => {
    const result = resolveChannelAvailability({
      adapterChannels: ADAPTERS,
      entitlements: { telegram: false, whatsapp: false, zalo: false },
      billingStatus: { isFullyExpired: true },
    });
    expect(result[channel]).toMatchObject({ visible: true, available: false, reason: 'plan_expired' });
  });

  it('cron đã thu hồi gói sau hạn (planRevokedAfterExpiry) cũng là plan_expired; đang trong ân hạn thì VẪN dùng được', () => {
    const revoked = resolveChannelAvailability({ adapterChannels: ADAPTERS, billingStatus: { planRevokedAfterExpiry: true } });
    expect(revoked.email.reason).toBe('plan_expired');
    const grace = resolveChannelAvailability({
      adapterChannels: ADAPTERS,
      billingStatus: { isInGracePeriod: true, isFullyExpired: false, planRevokedAfterExpiry: false },
    });
    for (const channel of CHANNELS) expect(grace[channel].available).toBe(true);
  });

  it.each(['zalo', 'telegram', 'whatsapp'])('trần tài khoản %s = 0 (entitlement false) -> not_in_plan/accounts; Email không có entitlement nên không bị ảnh hưởng', (channel) => {
    const result = resolveChannelAvailability({
      adapterChannels: ADAPTERS,
      entitlements: { [channel]: false },
    });
    expect(result[channel]).toMatchObject({ visible: true, available: false, reason: 'not_in_plan', detail: 'accounts' });
    for (const other of CHANNELS.filter((c) => c !== channel)) {
      expect(result[other].available).toBe(true);
    }
  });

  it.each(CHANNELS)('hạn mức tin/kỳ của %s bằng 0 dù có quyền kênh -> not_in_plan/messages (mua slot không mở được)', (channel) => {
    const sendUsage = emptyUsage();
    sendUsage[USAGE_KEY[channel]] = meter(0, 0);
    const result = resolveChannelAvailability({ adapterChannels: ADAPTERS, sendUsage });
    expect(result[channel]).toMatchObject({ available: false, reason: 'not_in_plan', detail: 'messages' });
  });

  it('kênh không có quyền VÀ hạn mức tin = 0 -> detail messages (chỉ mời nâng gói, không bán slot vô ích)', () => {
    const sendUsage = emptyUsage();
    sendUsage.telegram = meter(0, 0);
    const result = resolveChannelAvailability({ adapterChannels: ADAPTERS, entitlements: { telegram: false }, sendUsage });
    expect(result.telegram).toMatchObject({ reason: 'not_in_plan', detail: 'messages' });
  });

  // Chỗ DỰNG chiến dịch (Tạo chiến dịch, Trình dựng) dùng ignoreQuota: hết lượt kỳ này vẫn dựng được, backend chặn lúc gửi.
  it.each(CHANNELS)('ignoreQuota: %s hết lượt -> VẪN dùng được; gói không có kênh/hết hạn vẫn khoá', (channel) => {
    const sendUsage = emptyUsage();
    sendUsage[USAGE_KEY[channel]] = meter(500, 500);
    const relaxed = resolveChannelAvailability({ adapterChannels: ADAPTERS, sendUsage, ignoreQuota: true });
    expect(relaxed[channel]).toMatchObject({ available: true, reason: null });
    const expired = resolveChannelAvailability({
      adapterChannels: ADAPTERS, sendUsage, ignoreQuota: true, billingStatus: { planRevokedAfterExpiry: true },
    });
    expect(expired[channel]).toMatchObject({ available: false, reason: 'plan_expired' });
    const noMessages = emptyUsage();
    noMessages[USAGE_KEY[channel]] = meter(0, 0);
    const notInPlan = resolveChannelAvailability({ adapterChannels: ADAPTERS, sendUsage: noMessages, ignoreQuota: true });
    expect(notInPlan[channel]).toMatchObject({ available: false, reason: 'not_in_plan' });
  });

  it.each(CHANNELS)('hết lượt trong kỳ -> %s: quota_exhausted kèm used/limit của ĐÚNG đồng hồ kênh đó', (channel) => {
    const sendUsage = emptyUsage();
    sendUsage[USAGE_KEY[channel]] = meter(500, 500);
    const result = resolveChannelAvailability({ adapterChannels: ADAPTERS, sendUsage });
    expect(result[channel]).toMatchObject({
      visible: true, available: false, reason: 'quota_exhausted', detail: 'channel', used: 500, limit: 500,
    });
    for (const other of CHANNELS.filter((c) => c !== channel)) {
      expect(result[other].available).toBe(true);
    }
  });

  it('used > limit cũng là hết lượt; used < limit, limit null (không giới hạn), limit âm, used null (đồng hồ lỗi) thì KHÔNG khoá', () => {
    const exhaustedOver = emptyUsage();
    exhaustedOver.messaging = meter(600, 500);
    expect(resolveChannelAvailability({ adapterChannels: ADAPTERS, sendUsage: exhaustedOver }).zalo.reason).toBe('quota_exhausted');

    for (const m of [meter(499, 500), meter(9999, null), meter(9999, -1), meter(null, 500)]) {
      const usage = emptyUsage();
      usage.messaging = m;
      expect(resolveChannelAvailability({ adapterChannels: ADAPTERS, sendUsage: usage }).zalo.available).toBe(true);
    }
  });

  it('Zalo ánh xạ sang sendUsage.messaging: hết lượt Telegram/WhatsApp KHÔNG khoá Zalo (P10 tách đồng hồ)', () => {
    const sendUsage = emptyUsage();
    sendUsage.telegram = meter(10, 10);
    sendUsage.whatsapp = meter(10, 10);
    const result = resolveChannelAvailability({ adapterChannels: ADAPTERS, sendUsage });
    expect(result.zalo.available).toBe(true);
    expect(result.email.available).toBe(true);
    expect(result.telegram.reason).toBe('quota_exhausted');
    expect(result.whatsapp.reason).toBe('quota_exhausted');
  });

  it.each(CHANNELS)('hết hạn mức gói nhưng VÍ mua thêm của %s còn lượt -> vẫn dùng được (cổng gửi vẫn cho); ví hết -> khoá', (channel) => {
    const sendUsage = emptyUsage();
    sendUsage[USAGE_KEY[channel]] = meter(300, 300);
    const withWallet = resolveChannelAvailability({
      adapterChannels: ADAPTERS,
      sendUsage,
      addons: { [WALLET_KEY[channel]]: { granted: 100, used: 40, remaining: 60 } },
    });
    expect(withWallet[channel].available).toBe(true);

    const emptyWallet = resolveChannelAvailability({
      adapterChannels: ADAPTERS,
      sendUsage,
      addons: { [WALLET_KEY[channel]]: { granted: 100, used: 100, remaining: 0 } },
    });
    expect(emptyWallet[channel]).toMatchObject({ available: false, reason: 'quota_exhausted' });
  });

  it('trần tổng messages_per_period hết -> MỌI kênh khoá (detail combined), ví không bù được trần tổng', () => {
    const sendUsage = emptyUsage();
    sendUsage.combined = meter(1000, 1000);
    const result = resolveChannelAvailability({
      adapterChannels: ADAPTERS,
      sendUsage,
      addons: {
        emails: { remaining: 50 }, zaloMessages: { remaining: 50 }, telegramMessages: { remaining: 50 }, whatsappMessages: { remaining: 50 },
      },
    });
    for (const channel of CHANNELS) {
      expect(result[channel]).toMatchObject({ available: false, reason: 'quota_exhausted', detail: 'combined', used: 1000, limit: 1000 });
    }
  });

  it('thứ tự ưu tiên: plan_expired > not_in_plan > quota_exhausted', () => {
    const sendUsage = emptyUsage();
    sendUsage.telegram = meter(5, 5);
    const notInPlanBeatsQuota = resolveChannelAvailability({
      adapterChannels: ADAPTERS, entitlements: { telegram: false }, sendUsage,
    });
    expect(notInPlanBeatsQuota.telegram.reason).toBe('not_in_plan');

    const expiredBeatsAll = resolveChannelAvailability({
      adapterChannels: ADAPTERS, entitlements: { telegram: false }, sendUsage, billingStatus: { isFullyExpired: true },
    });
    expect(expiredBeatsAll.telegram.reason).toBe('plan_expired');
  });

  it('super admin qua mặt mọi cổng gói/hạn mức', () => {
    const sendUsage = emptyUsage();
    sendUsage.messaging = meter(5, 5);
    const result = resolveChannelAvailability({
      adapterChannels: ADAPTERS,
      entitlements: { zalo: false, telegram: false },
      billingStatus: { isFullyExpired: true },
      sendUsage,
      isAdmin: true,
    });
    for (const channel of CHANNELS) expect(result[channel].available).toBe(true);
  });

  describe('visible', () => {
    it('Email và Zalo luôn hiện (kể cả gói không có / chưa biết danh sách kênh adapter)', () => {
      const result = resolveChannelAvailability({ adapterChannels: null, entitlements: { zalo: false } });
      expect(result.email.visible).toBe(true);
      expect(result.zalo.visible).toBe(true);
    });

    it('Telegram/WhatsApp hiện đúng khi hệ thống bật kênh, KHÔNG phụ thuộc gói (gói không có vẫn hiện, bị khoá)', () => {
      const result = resolveChannelAvailability({
        adapterChannels: [{ key: 'whatsapp', label: 'WhatsApp' }],
        entitlements: { telegram: false, whatsapp: false },
      });
      expect(result.telegram.visible).toBe(false);
      expect(result.whatsapp).toMatchObject({ visible: true, available: false, reason: 'not_in_plan' });
    });

    it('chưa biết danh sách (null) hoặc cờ hệ thống tắt hết ([]) -> Telegram/WhatsApp ẩn', () => {
      for (const adapterChannels of [null, []]) {
        const result = resolveChannelAvailability({ adapterChannels });
        expect(result.telegram.visible).toBe(false);
        expect(result.whatsapp.visible).toBe(false);
      }
    });
  });
});

describe('useChannelAvailability — nguồn danh sách kênh adapter', () => {
  beforeEach(() => {
    entitlementsState.telegram = true;
    entitlementsState.whatsapp = true;
    entitlementsState.zalo = true;
    entitlementsState.enabledAdapterChannels = null;
    entitlementsState.isLoading = false;
    useAuthStore.setState({
      user: { id: 1, role: 'user' },
      sendUsage: emptyUsage(),
      billingStatus: null,
      addons: null,
    });
  });

  it('backend mới có enabledAdapterChannels: dùng danh sách đó và KHÔNG gọi GET /campaigns/channels', () => {
    entitlementsState.enabledAdapterChannels = ADAPTERS;
    const fetchAdapterChannels = vi.fn();
    const { result } = renderHook(() => useChannelAvailability({ fetchAdapterChannels }));
    expect(result.current.adapterChannels).toEqual(ADAPTERS);
    expect(result.current.telegram.visible).toBe(true);
    expect(fetchAdapterChannels).not.toHaveBeenCalled();
  });

  it('gói HẾT HẠN + GET /campaigns/channels lỗi 403: thẻ Telegram/WhatsApp vẫn hiện, bị khoá plan_expired', () => {
    entitlementsState.enabledAdapterChannels = ADAPTERS;
    useAuthStore.setState({ billingStatus: { isFullyExpired: true, planRevokedAfterExpiry: false } });
    const fetchAdapterChannels = vi.fn().mockRejectedValue(new Error('403'));
    const { result } = renderHook(() => useChannelAvailability({ fetchAdapterChannels }));
    for (const channel of CHANNELS) {
      expect(result.current[channel]).toMatchObject({ visible: true, available: false, reason: 'plan_expired' });
    }
    expect(fetchAdapterChannels).not.toHaveBeenCalled();
  });

  it('backend CŨ thiếu trường: dùng kết quả GET /campaigns/channels như trước; lỗi -> ẩn', async () => {
    const fetchAdapterChannels = vi.fn().mockResolvedValue({
      data: { data: { channels: [{ key: 'telegram', sendNodeSubtype: 'send_telegram', label: 'Telegram' }, { key: 'other', label: 'X' }] } },
    });
    const { result } = renderHook(() => useChannelAvailability({ fetchAdapterChannels }));
    expect(result.current.telegram.visible).toBe(false);
    await waitFor(() => expect(result.current.telegram.visible).toBe(true));
    expect(result.current.whatsapp.visible).toBe(false);
    expect(result.current.adapterChannels).toEqual([{ key: 'telegram', label: 'Telegram' }]);
    expect(fetchAdapterChannels).toHaveBeenCalledTimes(1);

    const failing = vi.fn().mockRejectedValue(new Error('404'));
    const second = renderHook(() => useChannelAvailability({ fetchAdapterChannels: failing }));
    await waitFor(() => expect(failing).toHaveBeenCalled());
    expect(second.result.current.telegram.visible).toBe(false);
    expect(second.result.current.whatsapp.visible).toBe(false);
  });

  it('đang tải quyền thì chưa gọi đường dự phòng (không bắn thừa 1 request), tải xong mới gọi', async () => {
    entitlementsState.isLoading = true;
    const fetchAdapterChannels = vi.fn().mockResolvedValue({ data: { data: { channels: [] } } });
    const { result, rerender } = renderHook(() => useChannelAvailability({ fetchAdapterChannels }));
    expect(fetchAdapterChannels).not.toHaveBeenCalled();
    expect(result.current.isLoading).toBe(true);
    // Khi đang tải: coi như có quyền, không nhấp nháy khoá.
    expect(result.current.zalo.available).toBe(true);
    entitlementsState.isLoading = false;
    rerender();
    await waitFor(() => expect(fetchAdapterChannels).toHaveBeenCalledTimes(1));
  });

  it('phản ứng khi authStore đổi: hết lượt Zalo -> khoá; mua thêm (ví > 0) -> mở lại', () => {
    entitlementsState.enabledAdapterChannels = ADAPTERS;
    const { result } = renderHook(() => useChannelAvailability());
    expect(result.current.zalo.available).toBe(true);
    act(() => {
      useAuthStore.setState({ sendUsage: { ...emptyUsage(), messaging: meter(100, 100) } });
    });
    expect(result.current.zalo).toMatchObject({ available: false, reason: 'quota_exhausted' });
    act(() => {
      useAuthStore.setState({ addons: { zaloMessages: { granted: 50, used: 0, remaining: 50 } } });
    });
    expect(result.current.zalo.available).toBe(true);
  });

  it('store thiếu trường (spec cũ mock một phần) không làm hook vỡ', () => {
    useAuthStore.setState({ sendUsage: undefined, billingStatus: undefined, addons: undefined, user: undefined });
    entitlementsState.enabledAdapterChannels = ADAPTERS;
    const { result } = renderHook(() => useChannelAvailability());
    for (const channel of CHANNELS) expect(result.current[channel].available).toBe(true);
  });
});
