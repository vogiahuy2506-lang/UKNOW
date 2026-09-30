/**
 * P9 (PLAN_TG_WA_DAY_DU mục 16) — quyền kênh Telegram/WhatsApp theo gói: null/0/n, slot mua lẻ, nhân viên theo chủ,
 * admin, và cổng 403 CHANNEL_NOT_IN_PLAN. Mock ranh giới `checkUserResourceLimit` đúng hình dạng thật
 * ({ allowed, limit, currentCount, message }); `limit` đã cộng grant slot mua lẻ (resolveEffectiveLimit) bên trong hàm thật.
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';

const mockCheckLimit = jest.fn();
const mockDbQuery = jest.fn();

jest.unstable_mockModule('../../../utils/userResourceLimit.util.js', () => ({
  checkUserResourceLimit: mockCheckLimit,
}));
jest.unstable_mockModule('../../../config/database.js', () => ({
  default: { query: mockDbQuery },
}));

const {
  getChannelEntitlements,
  assertChannelEntitled,
  filterChannelsByEntitlement,
  limitGrantsChannel,
} = await import('../channelEntitlement.service.js');

function limitFor(map) {
  mockCheckLimit.mockImplementation(async ({ resourceKey }) => ({
    allowed: false, // cố ý false: BẪY — allowed=false cũng khi đã dùng đủ, không được dùng để suy ra quyền
    limit: map[resourceKey] ?? null,
    currentCount: 0,
    message: null,
  }));
}

describe('channelEntitlement — định nghĩa "có quyền"', () => {
  it('null (không giới hạn) và > 0 là có quyền; 0 là không', () => {
    expect(limitGrantsChannel(null)).toBe(true);
    expect(limitGrantsChannel(1)).toBe(true);
    expect(limitGrantsChannel(5)).toBe(true);
    expect(limitGrantsChannel(0)).toBe(false);
  });
});

describe('getChannelEntitlements', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDbQuery.mockResolvedValue({ rows: [{ role: 'user' }] });
  });

  it('trần 0 -> false; trần n / null -> true; trả kèm limits thật', async () => {
    limitFor({ telegramAccounts: 0, whatsappAccounts: 2 });
    await expect(getChannelEntitlements({ id: 7, role: 'user' })).resolves.toEqual({
      telegram: false,
      whatsapp: true,
      zalo: true,
      limits: { telegram: 0, whatsapp: 2, zalo: null },
    });

    limitFor({});
    await expect(getChannelEntitlements({ id: 7, role: 'user' })).resolves.toEqual({
      telegram: true,
      whatsapp: true,
      zalo: true,
      limits: { telegram: null, whatsapp: null, zalo: null },
    });
  });

  it('P12 Zalo: trần 0 -> false (kèm limits.zalo=0); limit=1 -> VẪN có quyền; null/n -> có quyền', async () => {
    limitFor({ zaloAccounts: 0 });
    const none = await getChannelEntitlements({ id: 7, role: 'user' });
    expect(none.zalo).toBe(false);
    expect(none.limits.zalo).toBe(0);
    expect(mockCheckLimit).toHaveBeenCalledWith(expect.objectContaining({ resourceKey: 'zaloAccounts' }));

    limitFor({ zaloAccounts: 1 });
    const one = await getChannelEntitlements({ id: 7, role: 'user' });
    expect(one.zalo).toBe(true);
    expect(one.limits.zalo).toBe(1);

    limitFor({ zaloAccounts: 5 });
    expect((await getChannelEntitlements({ id: 7, role: 'user' })).zalo).toBe(true);
    limitFor({});
    expect((await getChannelEntitlements({ id: 7, role: 'user' })).zalo).toBe(true);
  });

  it('P12 Zalo: đã DÙNG ĐỦ (allowed=false, limit=1) vẫn có quyền; nhân viên theo CHỦ; admin luôn có', async () => {
    mockCheckLimit.mockResolvedValue({ allowed: false, limit: 1, currentCount: 1, message: 'đủ rồi' });
    expect((await getChannelEntitlements({ id: 7, role: 'user' })).zalo).toBe(true);

    limitFor({ zaloAccounts: 0 });
    const employee = { id: 90, role: 'admin', activeContext: { type: 'employee', ownerId: 12, membershipId: 4 } };
    expect((await getChannelEntitlements(employee)).zalo).toBe(false);
    expect(mockCheckLimit).toHaveBeenCalledWith(expect.objectContaining({ userId: 12, roleCode: 'user', resourceKey: 'zaloAccounts' }));

    limitFor({});
    await getChannelEntitlements({ id: 1, role: 'admin' });
    expect(mockCheckLimit).toHaveBeenCalledWith(expect.objectContaining({ userId: 1, roleCode: 'admin', resourceKey: 'zaloAccounts' }));
  });

  it('đã DÙNG ĐỦ trần (allowed=false, limit>0) vẫn có quyền', async () => {
    mockCheckLimit.mockResolvedValue({ allowed: false, limit: 1, currentCount: 1, message: 'đủ rồi' });
    const result = await getChannelEntitlements({ id: 7, role: 'user' });
    expect(result.telegram).toBe(true);
    expect(result.whatsapp).toBe(true);
  });

  it('slot mua lẻ đã cộng trong limit: limit trả về >0 -> có quyền dù gói gốc 0', async () => {
    // resolveEffectiveLimit(base 0) trả 0 (không cộng grant khi base 0 là bảo toàn "không hỗ trợ"); còn base 1 + grant 2 = 3.
    limitFor({ telegramAccounts: 3, whatsappAccounts: 0 });
    const result = await getChannelEntitlements({ id: 7, role: 'user' });
    expect(result.telegram).toBe(true);
    expect(result.whatsapp).toBe(false);
  });

  it('nhân viên: tính theo CHỦ workspace và tra role của chủ, không dùng role nhân viên', async () => {
    limitFor({ telegramAccounts: 0, whatsappAccounts: 0 });
    mockDbQuery.mockResolvedValue({ rows: [{ role: 'user' }] });
    const employee = { id: 90, role: 'admin', activeContext: { type: 'employee', ownerId: 12, membershipId: 4 } };
    const result = await getChannelEntitlements(employee);
    expect(result.telegram).toBe(false);
    expect(mockCheckLimit).toHaveBeenCalledWith(expect.objectContaining({ userId: 12, roleCode: 'user', resourceKey: 'telegramAccounts' }));
    expect(mockCheckLimit).toHaveBeenCalledWith(expect.objectContaining({ userId: 12, resourceKey: 'whatsappAccounts' }));
    expect(mockDbQuery).toHaveBeenCalledWith(expect.stringMatching(/FROM users/), [12]);
  });

  it('chủ tự dùng: truyền role của chính mình (admin -> checkUserResourceLimit bỏ qua trần)', async () => {
    limitFor({});
    await getChannelEntitlements({ id: 1, role: 'admin' });
    expect(mockCheckLimit).toHaveBeenCalledWith(expect.objectContaining({ userId: 1, roleCode: 'admin' }));
    expect(mockDbQuery).not.toHaveBeenCalled();
  });

  it('đọc trần lỗi -> fail-open (không làm sập giao diện)', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockCheckLimit.mockRejectedValue(new Error('db down'));
    const result = await getChannelEntitlements({ id: 7, role: 'user' });
    expect(result).toEqual({
      telegram: true, whatsapp: true, zalo: true, limits: { telegram: null, whatsapp: null, zalo: null },
    });
    spy.mockRestore();
  });
});

describe('assertChannelEntitled', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDbQuery.mockResolvedValue({ rows: [{ role: 'user' }] });
  });

  it('trần 0 -> 403 CHANNEL_NOT_IN_PLAN có thông điệp mua thêm slot', async () => {
    limitFor({ whatsappAccounts: 0 });
    await expect(assertChannelEntitled({ channel: 'whatsapp', ownerUserId: 5 }))
      .rejects.toMatchObject({ status: 403, code: 'CHANNEL_NOT_IN_PLAN', message: expect.stringMatching(/WhatsApp.*mua thêm slot/) });
  });

  it('P12 Zalo: trần 0 -> 403 CHANNEL_NOT_IN_PLAN nhắc Zalo; limit=1 -> qua', async () => {
    limitFor({ zaloAccounts: 0 });
    await expect(assertChannelEntitled({ channel: 'zalo', ownerUserId: 5 }))
      .rejects.toMatchObject({ status: 403, code: 'CHANNEL_NOT_IN_PLAN', message: expect.stringMatching(/kênh Zalo.*mua thêm slot/) });
    limitFor({ zaloAccounts: 1 });
    await expect(assertChannelEntitled({ channel: 'zalo', ownerUserId: 5 })).resolves.toBeUndefined();
  });

  it('có trần > 0 hoặc null -> qua', async () => {
    limitFor({ telegramAccounts: 1 });
    await expect(assertChannelEntitled({ channel: 'telegram', ownerUserId: 5 })).resolves.toBeUndefined();
    limitFor({});
    await expect(assertChannelEntitled({ channel: 'whatsapp', ownerUserId: 5 })).resolves.toBeUndefined();
  });
});

describe('filterChannelsByEntitlement', () => {
  it('bỏ kênh không có quyền, giữ kênh còn lại', () => {
    const channels = [{ key: 'telegram' }, { key: 'whatsapp' }];
    expect(filterChannelsByEntitlement(channels, { telegram: false, whatsapp: true })).toEqual([{ key: 'whatsapp' }]);
    expect(filterChannelsByEntitlement(channels, { telegram: false, whatsapp: false })).toEqual([]);
  });
});
