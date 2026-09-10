import { beforeEach, describe, expect, it, jest } from '@jest/globals';

// PR-1c — lưới thứ hai cho kênh Zalo, nối tiếp PR-1 (273bed44, assertSendQuotaOrYield) và PR-1b
// (326e38a2, email). Cổng reservation (campaignZaloSender.service.js:2009-2019) bắt lỗi
// RESOURCE_LIMIT_EXCEEDED từ reserveSendQuota() rồi đổi nhãn thành PLAN_SEND_LIMIT_EXCEEDED —
// nhưng KHÔNG AI ĐỌC mã đó (grep -rn "PLAN_SEND_LIMIT_EXCEEDED" src/ chỉ ra đúng 1 dòng, chính
// dòng đặt nó), và new Error(...) chỉ chép message nên tầng trên mất luôn resetAt/limitType. Lỗi
// rơi vào catch chung theo từng người nhận → failedSends += 1 → chạy tiếp — cùng bug PR-1/1b,
// cơ chế thứ ba. _stopRunIfPlanQuotaBlocked() là lưới thứ hai, được gọi ở 5 catch site của kênh
// Zalo (campaignRun.service.js) ngay sau nhánh rethrow RUN_STOPPED/RUN_YIELD_SLOT.
//
// Test method này TRỰC TIẾP (không dựng lại toàn bộ executeCampaign()) — khác với
// assertSendQuotaOrYield (closure riêng, không expose ra ngoài), _stopRunIfPlanQuotaBlocked là
// method thật trên instance, gọi thẳng được. Né được toàn bộ rủi ro mock thiếu sâu trong pipeline
// gửi Zalo thật (tracking metadata, billing, template steps...） mà PR-1/1b từng vấp phải — ở đây
// không liên quan gì tới cách sửa đang kiểm.

const mockFailRun = jest.fn().mockResolvedValue(null);

jest.unstable_mockModule('../../../repositories/campaign/campaignRun.repository.js', () => ({
  default: {
    failRun: mockFailRun,
    getRunStatus: jest.fn().mockResolvedValue('running'),
  },
}));

const { default: campaignRunService } = await import('../campaignRun.service.js');

const makePlanQuotaError = (message, { resetAt = null, limitType = 'subscription_expired' } = {}) => {
  const err = new Error(`[PLAN_QUOTA] ${message}`);
  err.code = 'PLAN_SEND_LIMIT_EXCEEDED';
  err.resetAt = resetAt;
  err.limitType = limitType;
  return err;
};

describe('_stopRunIfPlanQuotaBlocked — cổng reservation Zalo phải dừng run khi hạn mức không tự reset được', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('resetAt: null (gói hết hạn) -> failRun() đúng 1 lần, ném RUN_STOPPED kèm quotaBlocked/quotaLimitType', async () => {
    const error = makePlanQuotaError('Gói đã hết hạn (đã qua thời gian ân hạn). Vui lòng gia hạn để tiếp tục gửi.');

    await expect(
      campaignRunService._stopRunIfPlanQuotaBlocked(error, { runId: 200, campaignId: 100 })
    ).rejects.toMatchObject({
      code: 'RUN_STOPPED',
      quotaBlocked: true,
      quotaLimitType: 'subscription_expired',
    });

    expect(mockFailRun).toHaveBeenCalledTimes(1);
    expect(mockFailRun).toHaveBeenCalledWith(
      200,
      '[PLAN_QUOTA] Gói đã hết hạn (đã qua thời gian ân hạn). Vui lòng gia hạn để tiếp tục gửi.'
    );
  });

  it('cùng lỗi nhưng resetAt tương lai (hạn mức ngày/tháng, tự reset được) -> return êm, KHÔNG failRun, KHÔNG ném gì', async () => {
    const error = makePlanQuotaError('Đã đạt giới hạn gửi Zalo trong ngày.', {
      resetAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      limitType: 'daily',
    });

    await expect(
      campaignRunService._stopRunIfPlanQuotaBlocked(error, { runId: 200, campaignId: 100 })
    ).resolves.toBeUndefined();

    expect(mockFailRun).not.toHaveBeenCalled();
  });

  it('lỗi SEND_QUOTA_UNAVAILABLE (503, không phải quota thật, code khác PLAN_SEND_LIMIT_EXCEEDED) -> return êm, KHÔNG failRun', async () => {
    const infraErr = new Error('Không thể xác định trạng thái hạn mức gửi. Vui lòng thử lại.');
    infraErr.code = 'SEND_QUOTA_UNAVAILABLE';
    infraErr.status = 503;

    await expect(
      campaignRunService._stopRunIfPlanQuotaBlocked(infraErr, { runId: 200, campaignId: 100 })
    ).resolves.toBeUndefined();

    expect(mockFailRun).not.toHaveBeenCalled();
  });

  it('lỗi bất kỳ không có code (vd. lỗi mạng chung) -> return êm, KHÔNG failRun', async () => {
    const genericErr = new Error('network timeout');

    await expect(
      campaignRunService._stopRunIfPlanQuotaBlocked(genericErr, { runId: 200, campaignId: 100 })
    ).resolves.toBeUndefined();

    expect(mockFailRun).not.toHaveBeenCalled();
  });
});
