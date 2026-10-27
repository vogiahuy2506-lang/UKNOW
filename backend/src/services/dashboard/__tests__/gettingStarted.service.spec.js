import { beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * Thẻ "3 bước bắt đầu" (PLAN_ONBOARDING_ZALO_VA_THE_3_BUOC_2026-10-27) — phần SERVICE ghép ba phép đo.
 *
 * Chỉ giả ranh giới (repository + sendStats + đếm khách); logic ghép cờ là service thật. Điều kiện SQL của
 * "kênh đã nối" (Zalo needs_reauth không tính, email active có tính, nick của chủ khác không tính) KHÔNG kiểm được
 * bằng mock — nằm ở tests/integration/dashboardGettingStarted.test.js chạy trên Postgres thật.
 */
const hasConnectedChannelAccount = jest.fn();
const countWorkspaceCustomers = jest.fn();
const getChannelTotals = jest.fn();

jest.unstable_mockModule('../../../repositories/dashboard/gettingStarted.repository.js', () => ({
  default: { hasConnectedChannelAccount },
}));
jest.unstable_mockModule('../../../repositories/customer/customerRead.repository.js', () => ({
  default: { countWorkspaceCustomers },
}));
jest.unstable_mockModule('../../stats/sendStats.service.js', () => ({
  default: { getChannelTotals },
}));

const { getGettingStarted } = await import('../gettingStarted.service.js');

/** Một dòng theo kênh như sendStats.getChannelTotals trả về. */
const channelRow = (channel, sent) => ({ channel, sent, failed: 0, bounced: 0, opened: 0, clicked: 0 });
const ALL_ZERO = [channelRow('email', 0), channelRow('zalo_personal', 0), channelRow('telegram', 0)];

beforeEach(() => {
  jest.resetAllMocks();
  hasConnectedChannelAccount.mockResolvedValue(false);
  countWorkspaceCustomers.mockResolvedValue(0);
  getChannelTotals.mockResolvedValue(ALL_ZERO);
});

describe('getGettingStarted — ba cờ cho chủ workspace', () => {
  it('chủ chưa có gì → cả ba cờ false', async () => {
    await expect(getGettingStarted(42)).resolves.toEqual({
      channelConnected: false,
      hasCustomers: false,
      hasSentMessage: false,
    });
  });

  it('có tài khoản kênh đang dùng được → channelConnected true (hai cờ kia không đổi)', async () => {
    hasConnectedChannelAccount.mockResolvedValue(true);
    await expect(getGettingStarted(42)).resolves.toEqual({
      channelConnected: true,
      hasCustomers: false,
      hasSentMessage: false,
    });
  });

  it('có khách → hasCustomers true; số 0 → false', async () => {
    countWorkspaceCustomers.mockResolvedValue(3);
    expect((await getGettingStarted(42)).hasCustomers).toBe(true);
    countWorkspaceCustomers.mockResolvedValue(0);
    expect((await getGettingStarted(42)).hasCustomers).toBe(false);
  });

  it('sendStats có MỘT kênh sent:3 → hasSentMessage true', async () => {
    getChannelTotals.mockResolvedValue([channelRow('email', 0), channelRow('zalo_personal', 3), channelRow('telegram', 0)]);
    expect((await getGettingStarted(42)).hasSentMessage).toBe(true);
  });

  it('mọi kênh sent:0 (kể cả có tin failed) → hasSentMessage false', async () => {
    getChannelTotals.mockResolvedValue([
      { ...channelRow('email', 0), failed: 9 },
      channelRow('zalo_personal', 0),
    ]);
    expect((await getGettingStarted(42)).hasSentMessage).toBe(false);
  });

  it('sent ở dạng chuỗi (pg bigint) vẫn đếm; kênh null/thiếu số không làm hỏng', async () => {
    getChannelTotals.mockResolvedValue([{ channel: 'email', sent: '2' }, null]);
    expect((await getGettingStarted(42)).hasSentMessage).toBe(true);
    getChannelTotals.mockResolvedValue([{ channel: 'email' }]);
    expect((await getGettingStarted(42)).hasSentMessage).toBe(false);
  });
});

describe('getGettingStarted — phạm vi đo', () => {
  it('cả ba phép đo cùng nhận đúng chủ workspace; số gửi lấy cửa sổ 3660 ngày (trần của sendStats), phạm vi ownerId', async () => {
    await getGettingStarted(42);

    expect(hasConnectedChannelAccount).toHaveBeenCalledWith(42);
    expect(countWorkspaceCustomers).toHaveBeenCalledWith({ userId: 42 });
    expect(getChannelTotals).toHaveBeenCalledWith({ ownerId: 42 }, { days: 3660 });
  });

  it('một phép đo lỗi → cả lời gọi lỗi (không nuốt thành cờ false)', async () => {
    getChannelTotals.mockRejectedValue(new Error('db down'));
    await expect(getGettingStarted(42)).rejects.toThrow('db down');

    getChannelTotals.mockResolvedValue(ALL_ZERO);
    countWorkspaceCustomers.mockRejectedValue(new Error('timeout'));
    await expect(getGettingStarted(42)).rejects.toThrow('timeout');

    countWorkspaceCustomers.mockResolvedValue(0);
    hasConnectedChannelAccount.mockRejectedValue(new Error('boom'));
    await expect(getGettingStarted(42)).rejects.toThrow('boom');
  });
});
