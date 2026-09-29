/**
 * P5 buoc 3 — GUI NHANH kenh adapter (Telegram/WhatsApp) nhan `attachments`: chi khoa thuoc kho CHU workspace, kiem
 * gioi han TRUOC khi cham han muc/gate, truyen thang vao adapter.sendOne, dua khoa tep vao chu ky idempotency.
 * Ranh gioi gia: registry (kenh fake), han muc, nhat ky ccm, consent. `getWorkspaceContext` va service that.
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

const mockCheckSendQuota = jest.fn();
const mockReserve = jest.fn();
const mockInsertQueued = jest.fn();
const mockMarkSent = jest.fn();

jest.unstable_mockModule('../zaloCampaignRecipient.service.js', () => ({
  default: { isLeadPhoneConsentRefused: jest.fn(async () => false) },
}));
jest.unstable_mockModule('../../../utils/userSendLimit.util.js', () => ({
  _clearQuotaCache: jest.fn(),
  checkSendQuota: mockCheckSendQuota,
  recordDirectSendUsage: jest.fn(),
  nextVnMidnight: jest.fn(() => new Date('2026-09-30T17:00:00.000Z')),
  nextVnMonthStart: jest.fn(() => new Date('2026-09-30T17:00:00.000Z')),
}));
jest.unstable_mockModule('../../quota/sendQuotaReservation.service.js', () => ({
  reserveSendQuota: mockReserve,
  markSendQuotaSending: jest.fn(),
  consumeSendQuota: jest.fn(),
  releaseSendQuota: jest.fn(),
  markSendQuotaUncertain: jest.fn(),
  // Review P5: P4 (accountDailyLimit.service.js) import thêm getVnDayBoundaries từ module bị mock này -> thiếu là SyntaxError cả suite.
  getVnDayBoundaries: jest.fn(() => ({ vnDayStart: new Date('2026-09-29T17:00:00.000Z'), vnDayEnd: new Date('2026-09-30T17:00:00.000Z') })),
}));
jest.unstable_mockModule('../../../repositories/campaign/campaignChannelMessage.repository.js', () => ({
  default: {
    insertQueued: mockInsertQueued,
    markSent: mockMarkSent,
    markFailed: jest.fn(),
  },
}));

const { sendQuickAdapterMessage } = await import('../quickSendAdapter.service.js');
const { __registerChannelForTest, __resetTestChannels } = await import('../campaignChannelRegistry.service.js');

const authUser = { id: 3, role: 'user' };
const sendOne = jest.fn();

function registerFake(key) {
  __registerChannelForTest({
    key,
    sendNodeSubtype: `send_${key}`,
    engine: 'adapter',
    continuousSupported: false,
    continuousReplay: false,
    quotaChannel: 'zalo',
    policy: { minDelayMs: 0, maxDelayMs: 0, perHourLimit: 0, quietHours: null },
    adapter: {
      checkReadiness: async () => {},
      resolveAccount: async () => ({ accountKey: 'acc-1', accountId: 7, telegramUserId: 555, ownerUserId: 3 }),
      resolveRecipients: async () => [],
      sendOne,
      classifyError: () => 'hard',
    },
  });
}

const bodyOf = (attachments) => ({ accountId: 7, recipientKey: '123456', message: 'hi', attachments });

describe('sendQuickAdapterMessage — dinh kem (P5)', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockCheckSendQuota.mockResolvedValue({ allowed: true, billingUserId: 3 });
    mockReserve.mockResolvedValue({ mode: 'off', id: null });
    mockInsertQueued.mockResolvedValue(11);
    mockMarkSent.mockResolvedValue(undefined);
    sendOne.mockResolvedValue({ messageId: '900' });
    registerFake('telegram');
  });

  afterEach(() => {
    __resetTestChannels();
  });

  it('khoa tep KHONG thuoc kho cua chu (uploads/<chu>/...) -> 400 INVALID_ATTACHMENTS, truoc han muc/gui', async () => {
    await expect(sendQuickAdapterMessage({
      channel: 'telegram', authUser, body: bodyOf([{ key: 'uploads/99/quick-send/x.pdf' }]),
    })).rejects.toMatchObject({ status: 400, code: 'INVALID_ATTACHMENTS' });
    expect(mockCheckSendQuota).not.toHaveBeenCalled();
    expect(sendOne).not.toHaveBeenCalled();
  });

  it('khoa co ".." -> 400 (khong thoat thu muc)', async () => {
    await expect(sendQuickAdapterMessage({
      channel: 'telegram', authUser, body: bodyOf([{ key: 'uploads/3/../99/x.pdf' }]),
    })).rejects.toMatchObject({ status: 400, code: 'INVALID_ATTACHMENTS' });
  });

  it('vuot 5 anh -> 400 ATTACHMENT_LIMIT; vuot 3 tai lieu -> 400', async () => {
    const images = Array.from({ length: 6 }, (_, i) => ({ key: `uploads/3/quick-send/a${i}.jpg`, size: 10 }));
    await expect(sendQuickAdapterMessage({ channel: 'telegram', authUser, body: bodyOf(images) }))
      .rejects.toMatchObject({ status: 400, code: 'ATTACHMENT_LIMIT' });
    const docs = Array.from({ length: 4 }, (_, i) => ({ key: `uploads/3/quick-send/d${i}.pdf`, size: 10 }));
    await expect(sendQuickAdapterMessage({ channel: 'telegram', authUser, body: bodyOf(docs) }))
      .rejects.toMatchObject({ status: 400, code: 'ATTACHMENT_LIMIT' });
    expect(sendOne).not.toHaveBeenCalled();
  });

  it('tong dung luong khai bao > 20 MB -> 400 ATTACHMENT_LIMIT', async () => {
    await expect(sendQuickAdapterMessage({
      channel: 'telegram',
      authUser,
      body: bodyOf([{ key: 'uploads/3/quick-send/a.pdf', size: 21 * 1024 * 1024 }]),
    })).rejects.toMatchObject({ status: 400, code: 'ATTACHMENT_LIMIT' });
  });

  it('hop le -> adapter.sendOne nhan `attachments` (chi truong can thiet), item success', async () => {
    const { item } = await sendQuickAdapterMessage({
      channel: 'telegram',
      authUser,
      body: bodyOf([
        { key: 'uploads/3/quick-send/a.jpg', originalName: 'a.jpg', size: 10, contentType: 'image/jpeg', evil: 'x' },
        { key: 'uploads/3/zalo-templates/bao-gia.pdf', name: 'bao-gia.pdf' },
      ]),
    });
    expect(sendOne).toHaveBeenCalledTimes(1);
    expect(sendOne.mock.calls[0][0].attachments).toEqual([
      { key: 'uploads/3/quick-send/a.jpg', originalName: 'a.jpg', size: 10 },
      { key: 'uploads/3/zalo-templates/bao-gia.pdf', name: 'bao-gia.pdf' },
    ]);
    expect(item).toEqual({ recipientKey: '123456', status: 'success', messageId: '900' });
  });

  it('khong co dinh kem -> sendOne nhan dung {account, recipientKey, text} nhu cu (khong khoa attachments)', async () => {
    await sendQuickAdapterMessage({ channel: 'telegram', authUser, body: bodyOf(undefined) });
    expect(Object.keys(sendOne.mock.calls[0][0]).sort()).toEqual(['account', 'recipientKey', 'text']);
  });

  it('khoa tep nam trong chu ky idempotency (doi tep = yeu cau khac)', async () => {
    mockReserve.mockResolvedValue({ mode: 'off', id: null });
    await sendQuickAdapterMessage({
      channel: 'telegram', authUser, body: bodyOf([{ key: 'uploads/3/quick-send/a.jpg' }]),
    });
    expect(mockReserve.mock.calls[0][0].requestPayload.attachments).toEqual(['uploads/3/quick-send/a.jpg']);
  });

  it('tep sau loi (partialError) -> van success kem canh bao cho FE', async () => {
    sendOne.mockResolvedValue({ messageId: '900', sentCount: 1, partialError: 'IMAGE_PROCESS_FAILED' });
    const { item } = await sendQuickAdapterMessage({
      channel: 'telegram', authUser, body: bodyOf([{ key: 'uploads/3/quick-send/a.jpg' }]),
    });
    expect(item).toMatchObject({ status: 'success', messageId: '900', partialError: 'IMAGE_PROCESS_FAILED' });
  });
});
