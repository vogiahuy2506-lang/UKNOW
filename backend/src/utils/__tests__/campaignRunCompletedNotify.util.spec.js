import { beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * Sự kiện campaign_run_completed (PLAN_TICKET_GOP_Y_VA_CHUONG_THONG_BAO PR-1). Dispatcher giả — kiểm đúng eventType + userIds + nội dung.
 */
const mockNotifyUsers = jest.fn();
jest.unstable_mockModule('../../services/notification/notificationDispatch.service.js', () => ({
  notifyUsers: mockNotifyUsers,
}));

const { shouldNotifyRunCompleted, notifyCampaignRunCompleted } = await import('../campaignRunCompletedNotify.util.js');

describe('shouldNotifyRunCompleted', () => {
  const counts = { totalRecipients: 5, successfulSends: 4, failedSends: 1, skippedSends: 0 };

  it('chỉ true khi finalizeRun vừa ghi status completed và không phải chạy liên tục', () => {
    expect(shouldNotifyRunCompleted({ finalized: { status: 'completed' }, isContinuousMode: false, ...counts })).toBe(true);
  });

  it('lượt CHƯA completed → false: finalizeRun trả running (còn người nhận chờ thử lại)', () => {
    expect(shouldNotifyRunCompleted({ finalized: { status: 'running' }, isContinuousMode: false, ...counts })).toBe(false);
  });

  it('lượt đã bị dừng/huỷ (UPDATE không chạm dòng nào → finalizeRun trả null) → false', () => {
    expect(shouldNotifyRunCompleted({ finalized: null, isContinuousMode: false, ...counts })).toBe(false);
    expect(shouldNotifyRunCompleted({ finalized: undefined, isContinuousMode: false, ...counts })).toBe(false);
  });

  it('chiến dịch chạy liên tục → false dù status là completed', () => {
    expect(shouldNotifyRunCompleted({ finalized: { status: 'completed' }, isContinuousMode: true, ...counts })).toBe(false);
  });

  it('lượt không có người nhận và không gửi/lỗi/bỏ qua gì → false (không làm phiền chuông)', () => {
    expect(shouldNotifyRunCompleted({
      finalized: { status: 'completed' }, isContinuousMode: false,
      totalRecipients: 0, successfulSends: 0, failedSends: 0, skippedSends: 0,
    })).toBe(false);
  });

  it('chỉ có bỏ qua (skipped) vẫn là một lượt có hoạt động → true', () => {
    expect(shouldNotifyRunCompleted({
      finalized: { status: 'completed' }, isContinuousMode: false,
      totalRecipients: 0, successfulSends: 0, failedSends: 0, skippedSends: 3,
    })).toBe(true);
  });
});

describe('notifyCampaignRunCompleted', () => {
  beforeEach(() => {
    mockNotifyUsers.mockReset();
    mockNotifyUsers.mockResolvedValue({ inApp: 2, emailSent: 0, emailSkipped: 0, emailFailed: 0 });
  });

  const base = {
    runId: 321, campaignId: 12, campaignName: 'Khuyến mãi tháng 10', ownerId: 10, triggeredBy: 77,
    totalRecipients: 10, successfulSends: 8, failedSends: 2, skippedSends: 0,
  };

  it('chủ workspace + người kích hoạt (khác chủ) → hai userIds, sự kiện campaign_run_completed, dedupe theo lượt', async () => {
    await notifyCampaignRunCompleted(base);

    expect(mockNotifyUsers).toHaveBeenCalledTimes(1);
    const call = mockNotifyUsers.mock.calls[0][0];
    expect(call.eventType).toBe('campaign_run_completed');
    expect(call.userIds).toEqual([10, 77]);
    expect(call.dedupeKey).toBe('run:321:completed');
    expect(call.link).toBe('/app/delivery-monitor');
    expect(call.title).toBe('Chiến dịch «Khuyến mãi tháng 10» đã chạy xong');
    expect(call.message).toBe('Đã gửi thành công 8, lỗi 2.');
    expect(call.messageEn).toBe('8 sent successfully, 2 failed.');
    expect(call.metadata).toEqual({
      runId: 321, campaignId: 12, totalRecipients: 10, successfulSends: 8, failedSends: 2, skippedSends: 0,
    });
    // Không truyền mẫu email riêng: dispatcher dùng mẫu chung và mặc định email của sự kiện này đang tắt.
    expect(call.email).toBeUndefined();
  });

  it('người kích hoạt TRÙNG chủ (hoặc thiếu) → chỉ một userId', async () => {
    await notifyCampaignRunCompleted({ ...base, triggeredBy: 10 });
    expect(mockNotifyUsers.mock.calls[0][0].userIds).toEqual([10]);

    await notifyCampaignRunCompleted({ ...base, triggeredBy: null });
    expect(mockNotifyUsers.mock.calls[1][0].userIds).toEqual([10]);

    await notifyCampaignRunCompleted({ ...base, ownerId: '10', triggeredBy: '77' });
    expect(mockNotifyUsers.mock.calls[2][0].userIds).toEqual([10, 77]);
  });

  it('có lỗi gửi → severity warning; không lỗi → success; có bỏ qua thì nói thêm số bỏ qua', async () => {
    await notifyCampaignRunCompleted(base);
    expect(mockNotifyUsers.mock.calls[0][0].severity).toBe('warning');

    await notifyCampaignRunCompleted({ ...base, failedSends: 0, skippedSends: 3 });
    const call = mockNotifyUsers.mock.calls[1][0];
    expect(call.severity).toBe('success');
    expect(call.message).toBe('Đã gửi thành công 8, lỗi 0, bỏ qua 3.');
    expect(call.messageEn).toBe('8 sent successfully, 0 failed, 3 skipped.');
  });

  it('thiếu tên chiến dịch → "Chiến dịch #<id>" (không bọc dấu ngoặc kép)', async () => {
    await notifyCampaignRunCompleted({ ...base, campaignName: null });
    expect(mockNotifyUsers.mock.calls[0][0].title).toBe('Chiến dịch #12 đã chạy xong');
    expect(mockNotifyUsers.mock.calls[0][0].titleEn).toBe('Campaign #12 has finished running');
  });
});
