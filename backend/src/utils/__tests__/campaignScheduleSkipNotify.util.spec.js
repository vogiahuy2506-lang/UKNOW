import { jest } from '@jest/globals';

/**
 * notifyCampaignScheduleSkipped — báo chủ khi lịch bị bỏ qua vì lượt trước còn chạy.
 * Mock ở ranh giới: claimRunFailureNotification trả boolean (campaignRun.repository.js:102), findCampaignById trả dòng campaign,
 * dispatcher (notifyUsers) — PLAN_TICKET_GOP_Y_VA_CHUONG_THONG_BAO PR-1: sự kiện đi qua chuông + email của dispatcher thay vì
 * gọi sendSystemEmail trực tiếp. Hành vi gửi/lọc của dispatcher có spec riêng.
 */
const claimMock = jest.fn();
const findCampaignByIdMock = jest.fn();
const notifyUsersMock = jest.fn();

jest.unstable_mockModule('../../repositories/campaign/campaignRun.repository.js', () => ({
  default: { claimRunFailureNotification: claimMock },
}));
jest.unstable_mockModule('../../repositories/campaign/campaignCrud.repository.js', () => ({
  default: { findCampaignById: findCampaignByIdMock },
}));
jest.unstable_mockModule('../../services/notification/notificationDispatch.service.js', () => ({
  notifyUsers: notifyUsersMock,
}));
// Builder email THẬT (không mock) để kiểm nội dung mẫu truyền cho dispatcher.

const { notifyCampaignScheduleSkipped } = await import('../campaignScheduleSkipNotify.util.js');

const input = (over = {}) => ({
  runId: 700, campaignId: 437, ownerId: 246, scheduleName: 'Gửi sáng hằng ngày',
  blockingRunId: 425, blockingStartedAt: '05:00 04/10', scheduleDisabled: false, ...over,
});

describe('notifyCampaignScheduleSkipped', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    claimMock.mockResolvedValue(true);
    findCampaignByIdMock.mockResolvedValue({ id: 437, campaign_name: 'Nhắc lịch <b>hội thảo</b>' });
    notifyUsersMock.mockResolvedValue({ inApp: 1, emailSent: 1, emailSkipped: 0, emailFailed: 0 });
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('phát ĐÚNG MỘT thông báo cho chủ: sự kiện campaign_schedule_skipped, dedupe theo dòng bỏ qua, nói rõ lượt nào bị bỏ và vì sao', async () => {
    const result = await notifyCampaignScheduleSkipped(input());

    expect(result).toEqual({ sent: true });
    expect(claimMock).toHaveBeenCalledWith(700);
    expect(notifyUsersMock).toHaveBeenCalledTimes(1);
    const call = notifyUsersMock.mock.calls[0][0];
    expect(call.eventType).toBe('campaign_schedule_skipped');
    expect(call.userIds).toEqual([246]);
    expect(call.dedupeKey).toBe('run:700:schedule_skipped');
    expect(call.severity).toBe('warning');
    expect(call.link).toBe('/app/campaigns');
    expect(call.title).toContain('bị bỏ qua vì lượt trước chưa xong');
    expect(call.message).toContain('lượt chạy #425');
    expect(call.message).toContain('Gửi sáng hằng ngày');
    expect(call.message).toContain('Lịch vẫn bật');
    expect(call.metadata).toEqual({
      campaignId: 437, runId: 700, blockingRunId: 425, scheduleName: 'Gửi sáng hằng ngày', scheduleDisabled: false,
    });
  });

  it('mẫu email truyền cho dispatcher giữ nội dung cũ: lượt chặn, gợi ý (chuỗi nhiều bước / thêm nick / giãn lịch), tên chiến dịch được escape', async () => {
    await notifyCampaignScheduleSkipped(input());

    const { email } = notifyUsersMock.mock.calls[0][0];
    const { subject, html } = email({ id: 246, email: 'chu@shop.vn', fullName: 'Chủ Shop' });
    expect(subject).toContain('bị bỏ qua vì lượt trước chưa xong');
    expect(html).toContain('Chủ Shop');
    expect(html).toContain('lượt chạy #425');
    expect(html).toContain('bắt đầu 05:00 04/10');
    expect(html).toContain('Gửi sáng hằng ngày');
    expect(html).toContain('chuỗi tin nhiều bước');
    expect(html).toContain('thêm tài khoản gửi');
    expect(html).toContain('giãn lịch');
    expect(html).toContain('Lịch vẫn bật');
    // Tên chiến dịch do khách đặt phải được escape trong HTML (không chèn thẻ).
    expect(html).not.toContain('<b>hội thảo</b>');
    expect(html).toContain('&lt;b&gt;hội thảo&lt;/b&gt;');
  });

  it('lịch once đã tắt → thông báo và email nói lịch đã được tắt', async () => {
    await notifyCampaignScheduleSkipped(input({ scheduleDisabled: true }));

    const call = notifyUsersMock.mock.calls[0][0];
    expect(call.message).toContain('lịch chạy một lần nên lịch đã được tắt');
    expect(call.email({ fullName: 'X' }).html).toContain('lịch chạy một lần nên lịch đã được tắt');
  });

  it('đã báo cho dòng này rồi (claim thua) → KHÔNG phát lần hai', async () => {
    claimMock.mockResolvedValueOnce(false);
    await expect(notifyCampaignScheduleSkipped(input())).resolves.toEqual({ skipped: true, reason: 'already_notified' });
    expect(notifyUsersMock).not.toHaveBeenCalled();
    expect(findCampaignByIdMock).not.toHaveBeenCalled();
  });

  it('dispatcher không giao được cho ai (chủ không hoạt động / tắt cả hai kênh) → skipped no_delivery, không ném', async () => {
    notifyUsersMock.mockResolvedValueOnce({ inApp: 0, emailSent: 0, emailSkipped: 0, emailFailed: 0 });
    await expect(notifyCampaignScheduleSkipped(input())).resolves.toEqual({ skipped: true, reason: 'no_delivery' });
  });

  it('chiến dịch không tìm thấy tên → "Chiến dịch #<id>"', async () => {
    findCampaignByIdMock.mockResolvedValueOnce(null);
    await notifyCampaignScheduleSkipped(input());
    expect(notifyUsersMock.mock.calls[0][0].title).toContain('Chiến dịch #437');
  });
});
