import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

/**
 * PLAN_RA_SOAT_DOT3 PR-Q2 việc a — job Zalo mang jobKey = ĐÚNG khoá giữ chỗ quota mà reserveCampaignZaloQuota()
 * dùng, để thêm lại / stalled không tạo bản gửi thứ hai. Hai khoá sinh từ cùng một hàm nên không thể lệch;
 * spec này ghim điều đó + logicalStep từng loại (cá nhân/nhóm theo stepIndex, kết bạn luôn 1).
 */

const mockReserveSendQuota = jest.fn();
jest.unstable_mockModule('../../quota/sendQuotaReservation.service.js', () => ({
  reserveSendQuota: mockReserveSendQuota,
  markSendQuotaSending: jest.fn(),
  consumeSendQuota: jest.fn(),
  releaseSendQuota: jest.fn(),
  markSendQuotaUncertain: jest.fn(),
}));

const { default: campaignZaloSenderService } = await import('../campaignZaloSender.service.js');
const { default: outboundMessageQueueService, OUTBOUND_MESSAGE_JOB_TYPES } = await import('../../queue/outboundMessageQueue.service.js');
const { buildCampaignReservationKey } = await import('../../quota/sendQuotaKey.service.js');

const base = {
  userId: 7,
  accountId: 3,
  runId: 4321,
  nodeId: 'node_zalo_q2',
  quotaRecipientKey: '0900111222',
  quotaContentKey: 'noi dung goc',
  message: 'noi dung',
  zaloMessageId: 55,
};
const expectedKey = (logicalStep, recipient = base.quotaRecipientKey) => buildCampaignReservationKey({
  runId: base.runId, nodeId: base.nodeId, channel: 'zalo', recipient, logicalStep,
});

describe('jobKey của job Zalo (PR-Q2 việc a)', () => {
  let enqueueSpy;
  beforeEach(() => {
    jest.clearAllMocks();
    enqueueSpy = jest.spyOn(outboundMessageQueueService, 'enqueueAndWait').mockResolvedValue({ ok: true });
  });
  afterEach(() => jest.restoreAllMocks());

  it('cá nhân: logicalStep = stepIndex, người nhận lấy theo quotaRecipientKey (không phải uid đã resolve)', async () => {
    await campaignZaloSenderService.sendPersonalMessageQueued({
      ...base, recipient: 'uid-da-resolve', recipientType: 'uid', stepIndex: 2,
    });
    const call = enqueueSpy.mock.calls[0][0];
    expect(call.type).toBe(OUTBOUND_MESSAGE_JOB_TYPES.ZALO_PERSONAL_SEND);
    expect(call.jobKey).toBe(expectedKey(2));
  });

  it('nhóm: logicalStep = stepIndex', async () => {
    await campaignZaloSenderService.sendGroupMessageQueued({
      ...base, groupId: 'g-1', quotaRecipientKey: 'g-1', stepIndex: 3,
    });
    expect(enqueueSpy.mock.calls[0][0].jobKey).toBe(expectedKey(3, 'g-1'));
  });

  it('kết bạn: logicalStep luôn 1 dù stepIndex khác', async () => {
    await campaignZaloSenderService.sendFriendRequestQueued({ ...base, phone: '0900111222', stepIndex: 5 });
    expect(enqueueSpy.mock.calls[0][0].jobKey).toBe(expectedKey(1));
  });

  it('thiếu runId / nodeId / userId (gửi lẻ ngoài chiến dịch) → không có jobKey', async () => {
    await campaignZaloSenderService.sendPersonalMessageQueued({ ...base, runId: undefined, recipient: '0900', stepIndex: 1 });
    await campaignZaloSenderService.sendPersonalMessageQueued({ ...base, nodeId: undefined, recipient: '0900', stepIndex: 1 });
    await campaignZaloSenderService.sendPersonalMessageQueued({ ...base, userId: undefined, recipient: '0900', stepIndex: 1 });
    expect(enqueueSpy.mock.calls.map((c) => c[0].jobKey)).toEqual([null, null, null]);
  });

  it('khoá job TRÙNG khoá mà reserveCampaignZaloQuota gửi cho reserveSendQuota', async () => {
    mockReserveSendQuota.mockResolvedValue({ mode: 'shadow', status: 'reserved' });
    await campaignZaloSenderService.sendPersonalMessageQueued({
      ...base, recipient: 'uid-1', recipientType: 'uid', stepIndex: 2,
    });
    const { jobKey, payload } = enqueueSpy.mock.calls[0][0];

    await campaignZaloSenderService.reserveCampaignZaloQuota(payload, { logicalStep: 2 });

    expect(mockReserveSendQuota.mock.calls[0][0].reservationKey).toBe(jobKey);
  });

  it('payload Zalo không phình: chỉ ID + nội dung, không có đối tượng chiến dịch', async () => {
    await campaignZaloSenderService.sendPersonalMessageQueued({
      ...base, recipient: 'uid-1', recipientType: 'uid', stepIndex: 1,
    });
    expect(Object.keys(enqueueSpy.mock.calls[0][0].payload).sort()).toEqual([
      'accountId', 'attachments', 'message', 'nodeId', 'quotaContentKey', 'quotaRecipientKey',
      'recipient', 'recipientType', 'runId', 'stepIndex', 'userId', 'zaloMessageId',
    ]);
  });
});
