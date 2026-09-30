/**
 * P10 (PLAN_TG_WA_DAY_DU mục 17) — GỬI NHANH Telegram/WhatsApp đi dưới hạn mức của CHÍNH kênh (`descriptor.quotaChannel`),
 * không còn mượn 'zalo': cổng đọc (checkSendQuota), giữ chỗ (reserveSendQuota + khoá đặt chỗ) và ghi usage_logs
 * (recordDirectSendUsage) đều nhận khoá kênh của descriptor. Descriptor test giữ `quotaChannel` khác nhau cho hai kênh.
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

const mockCheckSendQuota = jest.fn();
const mockRecordUsage = jest.fn();
const mockReserve = jest.fn();
const mockInsertQueued = jest.fn();
const mockMarkSent = jest.fn();

jest.unstable_mockModule('../channelEntitlement.service.js', () => ({
  assertChannelEntitled: jest.fn().mockResolvedValue(undefined),
}));
jest.unstable_mockModule('../zaloCampaignRecipient.service.js', () => ({
  default: { isLeadPhoneConsentRefused: jest.fn().mockResolvedValue(false) },
}));
jest.unstable_mockModule('../../../utils/userSendLimit.util.js', () => ({
  _clearQuotaCache: jest.fn(),
  checkSendQuota: mockCheckSendQuota,
  recordDirectSendUsage: mockRecordUsage,
  nextVnMidnight: jest.fn(() => new Date('2026-09-30T17:00:00.000Z')),
  nextVnMonthStart: jest.fn(() => new Date('2026-09-30T17:00:00.000Z')),
}));
jest.unstable_mockModule('../../quota/accountDailyLimit.service.js', () => ({
  checkAccountDailyLimit: jest.fn().mockResolvedValue({ allowed: true }),
}));
jest.unstable_mockModule('../../quota/sendQuotaReservation.service.js', () => ({
  reserveSendQuota: mockReserve,
  markSendQuotaSending: jest.fn(),
  consumeSendQuota: jest.fn(),
  releaseSendQuota: jest.fn(),
  markSendQuotaUncertain: jest.fn(),
}));
jest.unstable_mockModule('../../../repositories/campaign/campaignChannelMessage.repository.js', () => ({
  default: { insertQueued: mockInsertQueued, markSent: mockMarkSent, markFailed: jest.fn() },
}));

const { sendQuickAdapterMessage } = await import('../quickSendAdapter.service.js');
const { __registerChannelForTest, __resetTestChannels } = await import('../campaignChannelRegistry.service.js');
const { __resetPerHourWindowForTest } = await import('../campaignChannelRunner.service.js');

const authUser = { id: 3, role: 'user' };
const sendOne = jest.fn();

function register(key, subtype, extra = {}) {
  __registerChannelForTest({
    key,
    sendNodeSubtype: subtype,
    engine: 'adapter',
    continuousSupported: false,
    continuousReplay: false,
    quotaChannel: key, // P10: khoá hạn mức = khoá kênh
    policy: { minDelayMs: 0, maxDelayMs: 0, perHourLimit: 0, quietHours: null },
    adapter: {
      checkReadiness: async () => {},
      resolveAccount: async () => ({ accountKey: '7', accountId: 7 }),
      resolveRecipients: async () => [],
      sendOne,
      classifyError: () => 'hard',
      getAccountSendSettings: async () => ({ userDailySendLimit: null, delayMinMs: null, delayMaxMs: null }),
    },
    ...extra,
  });
}

describe('sendQuickAdapterMessage — hạn mức theo quotaChannel của kênh (P10)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetPerHourWindowForTest();
    register('telegram', 'send_telegram');
    register('whatsapp', 'send_whatsapp', { recipientIsPhone: true });
    mockCheckSendQuota.mockResolvedValue({ allowed: true, billingUserId: 55 });
    mockReserve.mockResolvedValue({ id: null, mode: 'shadow', allowed: true });
    mockInsertQueued.mockResolvedValue(901);
    mockMarkSent.mockResolvedValue(undefined);
    mockRecordUsage.mockResolvedValue({ id: 1 });
    sendOne.mockResolvedValue({ messageId: 'm-1' });
  });

  afterEach(() => {
    __resetTestChannels();
  });

  it.each([
    ['telegram', { accountId: 7, recipientKey: '123456', message: 'hi' }],
    ['whatsapp', { sessionKey: '3-abc', recipientKey: '0912345678', message: 'hi' }],
  ])('%s: checkSendQuota + reserveSendQuota + recordDirectSendUsage đều dùng kênh của chính nó', async (channel, body) => {
    const { item } = await sendQuickAdapterMessage({ channel, authUser, body });

    expect(item.status).toBe('success');
    expect(mockCheckSendQuota).toHaveBeenCalledWith(expect.objectContaining({ channel, requiredCount: 1 }));
    expect(mockReserve).toHaveBeenCalledWith(expect.objectContaining({ channel, sourceType: `${channel}_preview`, quantity: 1 }));
    // Khoá đặt chỗ mang đoạn kênh thật (regex CANONICAL_DIRECT_PREVIEW_QUICK đã mở cho kênh mới).
    expect(mockReserve.mock.calls[0][0].reservationKey).toMatch(new RegExp(`^preview:${channel}:`));
    expect(mockRecordUsage).toHaveBeenCalledWith(expect.objectContaining({
      billingUserId: 55,
      channel,
      amount: 1,
      source: `${channel}_preview`,
    }));
    // Dòng nhật ký gửi nhanh phải là xem thử để không đếm đôi với usage_logs.
    expect(mockInsertQueued).toHaveBeenCalledWith(expect.objectContaining({ isPreview: true, channel }));
  });
});
