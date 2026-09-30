/**
 * P9 — gửi nhanh kênh adapter: gói của chủ workspace không có kênh (trần 0) -> 403 CHANNEL_NOT_IN_PLAN, TRƯỚC khi chạm
 * adapter/tài khoản/hạn mức. Có quyền -> đi tiếp bình thường.
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

const mockCheckLimit = jest.fn();
const mockDbQuery = jest.fn();

jest.unstable_mockModule('../../../utils/userResourceLimit.util.js', () => ({
  checkUserResourceLimit: mockCheckLimit,
}));
const actualDb = await import('../../../config/database.js');
jest.unstable_mockModule('../../../config/database.js', () => ({
  ...actualDb,
  default: { query: mockDbQuery },
}));
jest.unstable_mockModule('../zaloCampaignRecipient.service.js', () => ({
  default: { isLeadPhoneConsentRefused: jest.fn().mockResolvedValue(false) },
}));
jest.unstable_mockModule('../../../utils/userSendLimit.util.js', () => ({
  _clearQuotaCache: jest.fn(),
  checkSendQuota: jest.fn().mockResolvedValue({ allowed: false, message: 'dừng ở hạn mức (chứng minh đã qua cổng quyền kênh)' }),
  recordDirectSendUsage: jest.fn(),
  nextVnMidnight: jest.fn(() => new Date('2026-09-30T17:00:00.000Z')),
  nextVnMonthStart: jest.fn(() => new Date('2026-09-30T17:00:00.000Z')),
}));
jest.unstable_mockModule('../../quota/accountDailyLimit.service.js', () => ({
  checkAccountDailyLimit: jest.fn().mockResolvedValue({ allowed: true }),
}));

const { sendQuickAdapterMessage } = await import('../quickSendAdapter.service.js');
const { __registerChannelForTest, __resetTestChannels } = await import('../campaignChannelRegistry.service.js');

const authUser = { id: 3, role: 'user' };
const checkReadiness = jest.fn();
const resolveAccount = jest.fn();

function register(key, subtype) {
  __registerChannelForTest({
    key,
    sendNodeSubtype: subtype,
    engine: 'adapter',
    continuousSupported: false,
    continuousReplay: false,
    quotaChannel: 'zalo',
    policy: { minDelayMs: 60_000, maxDelayMs: 60_000, perHourLimit: 0, quietHours: null },
    adapter: {
      checkReadiness,
      resolveAccount,
      resolveRecipients: async () => [],
      sendOne: jest.fn(),
      classifyError: () => 'hard',
    },
  });
}

describe('sendQuickAdapterMessage — P9 quyền kênh theo gói', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDbQuery.mockResolvedValue({ rows: [{ role: 'user' }] });
    resolveAccount.mockResolvedValue({ accountKey: '7', accountId: 7 });
    register('telegram', 'send_telegram');
    register('whatsapp', 'send_whatsapp');
  });

  afterEach(() => {
    __resetTestChannels();
  });

  it('Telegram: trần 0 -> 403 CHANNEL_NOT_IN_PLAN; không đụng adapter', async () => {
    mockCheckLimit.mockResolvedValue({ allowed: false, limit: 0, currentCount: 0, message: 'x' });
    await expect(sendQuickAdapterMessage({
      channel: 'telegram', authUser, body: { accountId: 7, recipientKey: '123456', message: 'hi' },
    })).rejects.toMatchObject({ status: 403, code: 'CHANNEL_NOT_IN_PLAN' });
    expect(checkReadiness).not.toHaveBeenCalled();
    expect(resolveAccount).not.toHaveBeenCalled();
  });

  it('WhatsApp: trần 0 -> 403 CHANNEL_NOT_IN_PLAN', async () => {
    mockCheckLimit.mockResolvedValue({ allowed: false, limit: 0, currentCount: 0, message: 'x' });
    await expect(sendQuickAdapterMessage({
      channel: 'whatsapp', authUser, body: { sessionKey: '3-abc', recipientKey: '84901234567', message: 'hi' },
    })).rejects.toMatchObject({ status: 403, code: 'CHANNEL_NOT_IN_PLAN' });
    expect(checkReadiness).not.toHaveBeenCalled();
  });

  it('có quyền (trần 1, đã dùng đủ) -> đi qua cổng quyền, tới bước sẵn sàng của adapter', async () => {
    mockCheckLimit.mockResolvedValue({ allowed: false, limit: 1, currentCount: 1, message: 'đủ' });
    await expect(sendQuickAdapterMessage({
      channel: 'telegram', authUser, body: { accountId: 7, recipientKey: '123456', message: 'hi' },
    })).rejects.toMatchObject({ code: 'SEND_QUOTA_EXCEEDED' });
    expect(checkReadiness).toHaveBeenCalled();
  });
});
