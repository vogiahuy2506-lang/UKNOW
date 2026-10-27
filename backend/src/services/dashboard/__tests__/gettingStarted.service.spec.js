import { beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * Thẻ "3 bước bắt đầu" (PLAN_ONBOARDING_ZALO_VA_THE_3_BUOC_2026-10-27) — phần SERVICE ghép ba phép đo.
 *
 * Chỉ giả ranh giới (repository + đếm khách); logic ghép cờ là service thật. Điều kiện SQL của
 * "kênh đã nối" (Zalo needs_reauth không tính, email active có tính, nick của chủ khác không tính) KHÔNG kiểm được
 * bằng mock — nằm ở tests/integration/dashboardGettingStarted.test.js chạy trên Postgres thật.
 */
const hasConnectedChannelAccount = jest.fn();
const countWorkspaceCustomers = jest.fn();
const hasSentMessage = jest.fn();

jest.unstable_mockModule('../../../repositories/dashboard/gettingStarted.repository.js', () => ({
  default: { hasConnectedChannelAccount, hasSentMessage },
}));
jest.unstable_mockModule('../../../repositories/customer/customerRead.repository.js', () => ({
  default: { countWorkspaceCustomers },
}));

const { getGettingStarted } = await import('../gettingStarted.service.js');

beforeEach(() => {
  jest.resetAllMocks();
  hasConnectedChannelAccount.mockResolvedValue(false);
  countWorkspaceCustomers.mockResolvedValue(0);
  hasSentMessage.mockResolvedValue(false);
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

  it('repository báo đã từng gửi → hasSentMessage true; chưa → false; giá trị lạ không tính là true', async () => {
    hasSentMessage.mockResolvedValue(true);
    expect((await getGettingStarted(42)).hasSentMessage).toBe(true);
    hasSentMessage.mockResolvedValue(false);
    expect((await getGettingStarted(42)).hasSentMessage).toBe(false);
    hasSentMessage.mockResolvedValue('yes');
    expect((await getGettingStarted(42)).hasSentMessage).toBe(false);
  });
});

describe('getGettingStarted — phạm vi đo', () => {
  it('cả ba phép đo cùng nhận đúng chủ workspace', async () => {
    await getGettingStarted(42);

    expect(hasConnectedChannelAccount).toHaveBeenCalledWith(42);
    expect(countWorkspaceCustomers).toHaveBeenCalledWith({ userId: 42 });
    expect(hasSentMessage).toHaveBeenCalledWith(42);
  });

  it('một phép đo lỗi → cả lời gọi lỗi (không nuốt thành cờ false)', async () => {
    hasSentMessage.mockRejectedValue(new Error('db down'));
    await expect(getGettingStarted(42)).rejects.toThrow('db down');

    hasSentMessage.mockResolvedValue(false);
    countWorkspaceCustomers.mockRejectedValue(new Error('timeout'));
    await expect(getGettingStarted(42)).rejects.toThrow('timeout');

    countWorkspaceCustomers.mockResolvedValue(0);
    hasConnectedChannelAccount.mockRejectedValue(new Error('boom'));
    await expect(getGettingStarted(42)).rejects.toThrow('boom');
  });
});
