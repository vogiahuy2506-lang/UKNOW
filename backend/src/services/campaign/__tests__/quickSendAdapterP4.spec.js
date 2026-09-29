/**
 * PLAN_TG_WA_DAY_DU_2026-09-29, P4 — GỬI NHANH kênh adapter: chạm trần gửi/ngày do người dùng tự đặt cho tài khoản -> 429
 * (kiểm TRƯỚC hạn mức gói/cổng nhịp); ghi đè giãn cách theo tài khoản áp cho cổng nhịp, không dưới sàn cứng.
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

const mockCheckSendQuota = jest.fn();
const mockCheckDailyLimit = jest.fn();

jest.unstable_mockModule('../zaloCampaignRecipient.service.js', () => ({
  default: { isLeadPhoneConsentRefused: jest.fn().mockResolvedValue(false) },
}));

// Hình dạng thật: checkSendQuota trả { allowed, message?, billingUserId? }.
jest.unstable_mockModule('../../../utils/userSendLimit.util.js', () => ({
  _clearQuotaCache: jest.fn(),
  checkSendQuota: mockCheckSendQuota,
  recordDirectSendUsage: jest.fn(),
  nextVnMidnight: jest.fn(() => new Date('2026-09-30T17:00:00.000Z')),
  nextVnMonthStart: jest.fn(() => new Date('2026-09-30T17:00:00.000Z')),
}));

jest.unstable_mockModule('../../quota/accountDailyLimit.service.js', () => ({
  checkAccountDailyLimit: mockCheckDailyLimit,
}));

const { sendQuickAdapterMessage } = await import('../quickSendAdapter.service.js');
const { __registerChannelForTest, __resetTestChannels } = await import('../campaignChannelRegistry.service.js');
const { __recordSendForTest, __resetPerHourWindowForTest } = await import('../campaignChannelRunner.service.js');

const authUser = { id: 3, role: 'user' };
const sendOne = jest.fn();
const getAccountSendSettings = jest.fn();

function registerTelegram() {
  __registerChannelForTest({
    key: 'telegram',
    sendNodeSubtype: 'send_telegram',
    engine: 'adapter',
    continuousSupported: false,
    continuousReplay: false,
    quotaChannel: 'zalo',
    policy: { minDelayMs: 60_000, maxDelayMs: 60_000, perHourLimit: 0, quietHours: null },
    adapter: {
      checkReadiness: async () => {},
      resolveAccount: async () => ({ accountKey: '7', accountId: 7 }),
      resolveRecipients: async () => [],
      sendOne,
      classifyError: () => 'hard',
      getAccountSendSettings,
    },
  });
}

const body = { accountId: 7, recipientKey: '123456', message: 'hi' };

describe('sendQuickAdapterMessage — P4 trần gửi/ngày + giãn cách theo tài khoản', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetPerHourWindowForTest();
    registerTelegram();
    mockCheckSendQuota.mockResolvedValue({ allowed: false, message: 'dừng ở bước hạn mức (chỉ để chứng minh đã qua cổng trần ngày)' });
    mockCheckDailyLimit.mockResolvedValue({ allowed: true });
    getAccountSendSettings.mockResolvedValue({ userDailySendLimit: null, delayMinMs: null, delayMaxMs: null });
  });

  afterEach(() => {
    __resetTestChannels();
  });

  it('chạm trần ngày -> 429 ACCOUNT_DAILY_LIMIT nêu con số đã đặt; KHÔNG gửi, KHÔNG chạm hạn mức gói', async () => {
    getAccountSendSettings.mockResolvedValue({ userDailySendLimit: 150, delayMinMs: null, delayMaxMs: null });
    mockCheckDailyLimit.mockResolvedValue({ allowed: false, limit: 150, currentCount: 150, resetAt: new Date('2026-09-30T17:00:00.000Z') });

    await expect(sendQuickAdapterMessage({ channel: 'telegram', authUser, body }))
      .rejects.toMatchObject({
        status: 429,
        code: 'ACCOUNT_DAILY_LIMIT',
        message: expect.stringMatching(/giới hạn 150 tin\/ngày do bạn đặt/),
      });
    expect(mockCheckDailyLimit).toHaveBeenCalledWith({ channel: 'telegram', accountId: '7', limit: 150 });
    expect(sendOne).not.toHaveBeenCalled();
    expect(mockCheckSendQuota).not.toHaveBeenCalled();
  });

  it('chưa đặt trần (NULL) -> KHÔNG kiểm trần ngày, đi tiếp tới bước hạn mức gói', async () => {
    await expect(sendQuickAdapterMessage({ channel: 'telegram', authUser, body }))
      .rejects.toMatchObject({ status: 403, code: 'SEND_QUOTA_EXCEEDED' });
    expect(mockCheckDailyLimit).not.toHaveBeenCalled();
  });

  it('còn dưới trần -> qua cổng trần ngày, tới bước hạn mức gói', async () => {
    getAccountSendSettings.mockResolvedValue({ userDailySendLimit: 150, delayMinMs: null, delayMaxMs: null });
    await expect(sendQuickAdapterMessage({ channel: 'telegram', authUser, body }))
      .rejects.toMatchObject({ status: 403, code: 'SEND_QUOTA_EXCEEDED' });
    expect(mockCheckDailyLimit).toHaveBeenCalledTimes(1);
  });

  it('ghi đè giãn cách (2–4s) áp cho cổng nhịp: hoãn <= 4s thay vì 60s của env', async () => {
    mockCheckSendQuota.mockResolvedValue({ allowed: true });
    getAccountSendSettings.mockResolvedValue({ userDailySendLimit: null, delayMinMs: 2_000, delayMaxMs: 4_000 });
    __recordSendForTest('telegram::7', Date.now()); // vừa có một lần gửi -> lần này phải chờ giãn cách

    const { item } = await sendQuickAdapterMessage({ channel: 'telegram', authUser, body });

    expect(item.status).toBe('deferred');
    expect(item.reason).toBe('inter_message_delay');
    expect(item.retryAfterMs).toBeLessThanOrEqual(4_000);
  });

  it('ghi đè dưới sàn (0–500ms) -> kẹp lên sàn 2s của Telegram: hoãn > 1s (không phải <= 500ms)', async () => {
    mockCheckSendQuota.mockResolvedValue({ allowed: true });
    getAccountSendSettings.mockResolvedValue({ userDailySendLimit: null, delayMinMs: 0, delayMaxMs: 500 });
    __recordSendForTest('telegram::7', Date.now());

    const { item } = await sendQuickAdapterMessage({ channel: 'telegram', authUser, body });

    expect(item.status).toBe('deferred');
    expect(item.retryAfterMs).toBeGreaterThan(1_000);
    expect(item.retryAfterMs).toBeLessThanOrEqual(2_000);
  });

  it('không ghi đè -> cổng nhịp dùng mức env (60s)', async () => {
    mockCheckSendQuota.mockResolvedValue({ allowed: true });
    __recordSendForTest('telegram::7', Date.now());

    const { item } = await sendQuickAdapterMessage({ channel: 'telegram', authUser, body });

    expect(item.status).toBe('deferred');
    expect(item.retryAfterMs).toBeGreaterThan(50_000);
  });
});
