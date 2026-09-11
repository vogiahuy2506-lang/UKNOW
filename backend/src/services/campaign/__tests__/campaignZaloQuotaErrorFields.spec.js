import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

/**
 * Ghim ĐƯỜNG TRUYỀN `resetAt`/`limitType` từ reserveSendQuota() qua reserveCampaignZaloQuota().
 *
 * Vì sao cần: PR-1c (ba720f35) thêm `_stopRunIfPlanQuotaBlocked()` trên CampaignRunService, và
 * toàn bộ quyết định "dừng hẳn run hay chỉ đếm thất bại rồi chạy tiếp" nằm ở đúng một dòng:
 *
 *   if (error.resetAt) return;   // có mốc reset → hạn mức ngày/tháng → giữ hành vi cũ
 *
 * `resetAt` chỉ tới được đó nhờ hai dòng trong reserveCampaignZaloQuota() chép lại từ lỗi gốc.
 * Xoá chúng đi thì `resetAt` thành undefined cho MỌI lỗi hạn mức, và chiến dịch chạm trần ngày
 * sẽ bị `failRun()` vĩnh viễn thay vì nghỉ tới 00:00 rồi chạy tiếp — hồi quy im lặng, khách chỉ
 * thấy run `failed` không rõ lý do.
 *
 * Đã kiểm bằng đột biến ngày 11/09/2026: xoá dòng `err.resetAt = quotaErr.resetAt ?? null` thì
 * campaignRunZaloQuotaReservationStop.spec.js (4/4) và campaignQuotaMatrix.test.js (30/30) đều
 * VẪN XANH — test cũ gọi thẳng `_stopRunIfPlanQuotaBlocked()` nên không đi qua đoạn này.
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

/** Lỗi đúng hình dạng evaluateReservationQuotaPolicy ném ra cho hạn mức NGÀY (tự reset được). */
const makeDailyLimitError = (resetAt) => {
  const err = new Error('Đã đạt giới hạn gửi Zalo trong ngày (50/50 tin).');
  err.status = 403;
  err.code = 'RESOURCE_LIMIT_EXCEEDED';
  err.limitType = 'daily';
  err.limit = 50;
  err.currentCount = 50;
  err.resetAt = resetAt;
  return err;
};

/** Lỗi cho gói hết hạn — KHÔNG có resetAt vì hạn mức không tự hồi. */
const makeExpiredError = () => {
  const err = new Error('Gói dịch vụ của bạn đã hết hạn. Vui lòng gia hạn để tiếp tục gửi.');
  err.status = 403;
  err.code = 'RESOURCE_LIMIT_EXCEEDED';
  err.limitType = 'subscription_expired';
  return err;
};

const basePayload = {
  userId: 7,
  runId: 1234,
  nodeId: 'node_zalo_1',
  recipient: '0900000000',
  message: 'noi dung',
};

describe('reserveCampaignZaloQuota — phải chép resetAt/limitType sang lỗi PLAN_SEND_LIMIT_EXCEEDED', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('hạn mức NGÀY (có resetAt) → lỗi mang nguyên resetAt, để tầng trên biết là tự reset được', async () => {
    const resetAt = new Date('2026-09-12T17:00:00.000Z');
    mockReserveSendQuota.mockRejectedValue(makeDailyLimitError(resetAt));

    await expect(campaignZaloSenderService.reserveCampaignZaloQuota(basePayload))
      .rejects.toMatchObject({
        code: 'PLAN_SEND_LIMIT_EXCEEDED',
        limitType: 'daily',
      });

    // Vế quyết định: thiếu resetAt thì _stopRunIfPlanQuotaBlocked() sẽ dừng hẳn run cho một
    // hạn mức vốn tự hồi lúc 00:00.
    await expect(campaignZaloSenderService.reserveCampaignZaloQuota(basePayload))
      .rejects.toHaveProperty('resetAt', resetAt);
  });

  it('gói HẾT HẠN (không resetAt) → resetAt là null, không phải undefined', async () => {
    mockReserveSendQuota.mockRejectedValue(makeExpiredError());

    await expect(campaignZaloSenderService.reserveCampaignZaloQuota(basePayload))
      .rejects.toMatchObject({
        code: 'PLAN_SEND_LIMIT_EXCEEDED',
        limitType: 'subscription_expired',
        resetAt: null,
      });
  });

  it('lỗi KHÔNG phải hạn mức gói thì ném nguyên vẹn, không đổi nhãn', async () => {
    const other = new Error('Dịch vụ kiểm tra hạn mức đang bận');
    other.status = 503;
    other.code = 'SEND_QUOTA_UNAVAILABLE';
    mockReserveSendQuota.mockRejectedValue(other);

    await expect(campaignZaloSenderService.reserveCampaignZaloQuota(basePayload))
      .rejects.toMatchObject({ code: 'SEND_QUOTA_UNAVAILABLE' });
  });

  it('không có userId → bỏ qua hoàn toàn, không gọi reserveSendQuota', async () => {
    const result = await campaignZaloSenderService.reserveCampaignZaloQuota({ ...basePayload, userId: null });

    expect(result).toEqual({ reservation: null, active: false });
    expect(mockReserveSendQuota).not.toHaveBeenCalled();
  });
});
