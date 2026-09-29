/**
 * PLAN_TG_WA_DAY_DU_2026-09-29, P2 bước 1 — GỬI NHANH kênh adapter cũng bỏ khách TỪ CHỐI nhận tin (chỉ kênh có
 * recipientKey là SĐT). Kiểm TRƯỚC cổng nhịp/giữ chỗ hạn mức: bằng chứng là adapter.sendOne không được gọi và
 * bước hạn mức (giả trả "không cho phép") không bị chạm với người từ chối.
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

const mockConsentRefused = jest.fn();
const mockCheckSendQuota = jest.fn();

jest.unstable_mockModule('../zaloCampaignRecipient.service.js', () => ({
  default: { isLeadPhoneConsentRefused: mockConsentRefused },
}));

// Hình dạng thật: checkSendQuota trả { allowed, message?, billingUserId? }.
jest.unstable_mockModule('../../../utils/userSendLimit.util.js', () => ({
  _clearQuotaCache: jest.fn(),
  checkSendQuota: mockCheckSendQuota,
  recordDirectSendUsage: jest.fn(),
  nextVnMidnight: jest.fn(() => new Date('2026-09-30T17:00:00.000Z')),
  nextVnMonthStart: jest.fn(() => new Date('2026-09-30T17:00:00.000Z')),
}));

const { sendQuickAdapterMessage } = await import('../quickSendAdapter.service.js');
const { __registerChannelForTest, __resetTestChannels } = await import('../campaignChannelRegistry.service.js');

const authUser = { id: 3, role: 'user' };
const sendOne = jest.fn();

function registerFake(key, { recipientIsPhone }) {
  __registerChannelForTest({
    key,
    sendNodeSubtype: `send_${key}`,
    engine: 'adapter',
    continuousSupported: false,
    continuousReplay: false,
    quotaChannel: 'zalo',
    ...(recipientIsPhone ? { recipientIsPhone: true } : {}),
    policy: { minDelayMs: 0, maxDelayMs: 0, perHourLimit: 0, quietHours: null },
    adapter: {
      checkReadiness: async () => {},
      resolveAccount: async () => ({ accountKey: 'acc-1', accountId: 7, sessionKey: '3-abc' }),
      resolveRecipients: async () => [],
      sendOne,
      classifyError: () => 'hard',
    },
  });
}

describe('sendQuickAdapterMessage — P2 khách từ chối nhận tin', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCheckSendQuota.mockResolvedValue({ allowed: false, message: 'dừng ở bước hạn mức (chỉ để chứng minh đã qua cổng consent)' });
  });

  afterEach(() => {
    __resetTestChannels();
  });

  it('WhatsApp: SĐT đã từ chối -> item failed/consent_refused, KHÔNG gửi, KHÔNG chạm hạn mức', async () => {
    registerFake('whatsapp', { recipientIsPhone: true });
    mockConsentRefused.mockResolvedValue(true);

    const { item } = await sendQuickAdapterMessage({
      channel: 'whatsapp',
      authUser,
      body: { sessionKey: '3-abc', recipientKey: '0912345678', message: 'hi' },
    });

    expect(mockConsentRefused).toHaveBeenCalledWith(3, '84912345678'); // chủ workspace + SĐT chuẩn hoá 84…
    expect(item).toEqual(expect.objectContaining({
      recipientKey: '84912345678',
      status: 'failed',
      errorCategory: 'consent_refused',
      errorCode: 'CONSENT_REFUSED',
    }));
    expect(sendOne).not.toHaveBeenCalled();
    expect(mockCheckSendQuota).not.toHaveBeenCalled();
  });

  it('WhatsApp: không từ chối -> đi tiếp tới bước hạn mức (qua cổng consent)', async () => {
    registerFake('whatsapp', { recipientIsPhone: true });
    mockConsentRefused.mockResolvedValue(false);

    await expect(sendQuickAdapterMessage({
      channel: 'whatsapp',
      authUser,
      body: { sessionKey: '3-abc', recipientKey: '0912345678', message: 'hi' },
    })).rejects.toMatchObject({ status: 403, code: 'SEND_QUOTA_EXCEEDED' });
    expect(mockConsentRefused).toHaveBeenCalledTimes(1);
    expect(mockCheckSendQuota).toHaveBeenCalledTimes(1);
  });

  it('Telegram (không recipientIsPhone): KHÔNG tra consent, đi thẳng tới bước hạn mức', async () => {
    registerFake('telegram', { recipientIsPhone: false });
    mockConsentRefused.mockResolvedValue(true); // nếu bị gọi nhầm sẽ chặn người nhận

    await expect(sendQuickAdapterMessage({
      channel: 'telegram',
      authUser,
      body: { accountId: 7, recipientKey: '123456', message: 'hi' },
    })).rejects.toMatchObject({ status: 403, code: 'SEND_QUOTA_EXCEEDED' });
    expect(mockConsentRefused).not.toHaveBeenCalled();
  });
});
