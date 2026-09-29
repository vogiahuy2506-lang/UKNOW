/**
 * P8b — GỬI NHANH tới NHÓM WhatsApp: recipientKey là jid `@g.us` — không bị `normalizeWhatsAppPhone` loại (jid 18 chữ số
 * vượt 15), không tra consent (không có SĐT), đi tới adapter.sendOne với jid NGUYÊN VẸN.
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

const mockConsentRefused = jest.fn();
const mockCheckSendQuota = jest.fn();

jest.unstable_mockModule('../zaloCampaignRecipient.service.js', () => ({
  default: { isLeadPhoneConsentRefused: mockConsentRefused },
}));

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
const GROUP = '120363012345678901@g.us';

function registerFakeWhatsApp() {
  __registerChannelForTest({
    key: 'whatsapp',
    sendNodeSubtype: 'send_whatsapp',
    engine: 'adapter',
    continuousSupported: false,
    continuousReplay: false,
    quotaChannel: 'zalo',
    recipientIsPhone: true,
    policy: { minDelayMs: 0, maxDelayMs: 0, perHourLimit: 0, quietHours: null },
    adapter: {
      checkReadiness: async () => {},
      resolveAccount: async () => ({ accountKey: '3-abc', sessionKey: '3-abc' }),
      resolveRecipients: async () => [],
      sendOne,
      classifyError: () => 'hard',
    },
  });
}

describe('sendQuickAdapterMessage — P8b nhóm WhatsApp', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Dừng ở bước hạn mức: chứng minh đã qua cổng người nhận/consent mà không cần dựng cả hệ giữ chỗ.
    mockCheckSendQuota.mockResolvedValue({ allowed: false, message: 'dừng ở bước hạn mức' });
    mockConsentRefused.mockResolvedValue(true);
    registerFakeWhatsApp();
  });

  afterEach(() => {
    __resetTestChannels();
  });

  it('jid nhóm hợp lệ: không bị loại INVALID_RECIPIENT, KHÔNG tra consent, đi tới bước hạn mức', async () => {
    await expect(sendQuickAdapterMessage({
      channel: 'whatsapp',
      authUser,
      body: { sessionKey: '3-abc', recipientKey: GROUP, message: 'hi' },
    })).rejects.toMatchObject({ status: 403, code: 'SEND_QUOTA_EXCEEDED' });
    expect(mockConsentRefused).not.toHaveBeenCalled();
    expect(mockCheckSendQuota).toHaveBeenCalledTimes(1);
  });

  it('SĐT thường vẫn qua kiểm consent (không phá hành vi cũ)', async () => {
    const { item } = await sendQuickAdapterMessage({
      channel: 'whatsapp',
      authUser,
      body: { sessionKey: '3-abc', recipientKey: '0912345678', message: 'hi' },
    });
    expect(mockConsentRefused).toHaveBeenCalledWith(3, '84912345678');
    expect(item).toMatchObject({ status: 'failed', errorCategory: 'consent_refused' });
  });

  it('chuỗi giống nhóm nhưng sai dạng (abc@g.us) -> 400 INVALID_RECIPIENT', async () => {
    await expect(sendQuickAdapterMessage({
      channel: 'whatsapp',
      authUser,
      body: { sessionKey: '3-abc', recipientKey: 'abc@g.us', message: 'hi' },
    })).rejects.toMatchObject({ status: 400, code: 'INVALID_RECIPIENT' });
  });
});
