import { jest } from '@jest/globals';

/**
 * notifyCampaignScheduleSkipped — email chủ khi lịch bị bỏ qua vì lượt trước còn chạy.
 * Mock ở ranh giới: claimRunFailureNotification trả boolean (campaignRun.repository.js:102),
 * findOwnerContact trả `{ email, full_name }` hoặc null (aiUnavailableNotice.repository.js), findCampaignById trả dòng campaign.
 */
const claimMock = jest.fn();
const findOwnerContactMock = jest.fn();
const findCampaignByIdMock = jest.fn();
const sendSystemEmailMock = jest.fn();

jest.unstable_mockModule('../../repositories/campaign/campaignRun.repository.js', () => ({
  default: { claimRunFailureNotification: claimMock },
}));
jest.unstable_mockModule('../../repositories/chatbot/aiUnavailableNotice.repository.js', () => ({
  default: { findOwnerContact: findOwnerContactMock },
}));
jest.unstable_mockModule('../../repositories/campaign/campaignCrud.repository.js', () => ({
  default: { findCampaignById: findCampaignByIdMock },
}));
// Builder THẬT (không mock) để kiểm nội dung email; chỉ chặn đường SMTP.
const realSystemEmail = await import('../systemEmail.util.js');
jest.unstable_mockModule('../systemEmail.util.js', () => ({
  ...realSystemEmail,
  sendSystemEmail: sendSystemEmailMock,
}));

const { notifyCampaignScheduleSkipped } = await import('../campaignScheduleSkipNotify.util.js');

const input = (over = {}) => ({
  runId: 700, campaignId: 437, ownerId: 246, scheduleName: 'Gửi sáng hằng ngày',
  blockingRunId: 425, blockingStartedAt: '05:00 04/10', scheduleDisabled: false, ...over,
});

describe('notifyCampaignScheduleSkipped', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    claimMock.mockResolvedValue(true);
    findOwnerContactMock.mockResolvedValue({ email: 'chu@shop.vn', full_name: 'Chủ Shop' });
    findCampaignByIdMock.mockResolvedValue({ id: 437, campaign_name: 'Nhắc lịch <b>hội thảo</b>' });
    sendSystemEmailMock.mockResolvedValue({});
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('gửi ĐÚNG MỘT email cho chủ, nói rõ lượt nào bị bỏ, vì sao, và gợi ý (chuỗi nhiều bước / thêm nick / giãn lịch)', async () => {
    const result = await notifyCampaignScheduleSkipped(input());

    expect(result).toEqual({ sent: true });
    expect(claimMock).toHaveBeenCalledWith(700);
    expect(findOwnerContactMock).toHaveBeenCalledWith(246);
    expect(sendSystemEmailMock).toHaveBeenCalledTimes(1);
    const { to, subject, html } = sendSystemEmailMock.mock.calls[0][0];
    expect(to).toBe('chu@shop.vn');
    expect(subject).toContain('bị bỏ qua vì lượt trước chưa xong');
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

  it('lịch once đã tắt → email nói lịch đã được tắt', async () => {
    await notifyCampaignScheduleSkipped(input({ scheduleDisabled: true }));
    expect(sendSystemEmailMock.mock.calls[0][0].html).toContain('lịch chạy một lần nên lịch đã được tắt');
  });

  it('đã báo cho dòng này rồi (claim thua) → KHÔNG gửi lần hai', async () => {
    claimMock.mockResolvedValueOnce(false);
    await expect(notifyCampaignScheduleSkipped(input())).resolves.toEqual({ skipped: true, reason: 'already_notified' });
    expect(sendSystemEmailMock).not.toHaveBeenCalled();
    expect(findOwnerContactMock).not.toHaveBeenCalled();
  });

  it('chủ không có email / không hoạt động → bỏ qua, không ném', async () => {
    findOwnerContactMock.mockResolvedValueOnce(null);
    await expect(notifyCampaignScheduleSkipped(input())).resolves.toEqual({ skipped: true, reason: 'no_owner_email' });
    expect(sendSystemEmailMock).not.toHaveBeenCalled();
  });
});
