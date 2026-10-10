import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * `sendNow` của "Trung tâm Chiến dịch Email" sau PR-3 (PLAN_TICKET_GOP_Y_VA_CHUONG_THONG_BAO_2026-10-10 mục 5):
 * mỗi bản tin chọn kênh `channels` ⊆ {email, in_app} lúc gửi.
 *
 * Mock ở ranh giới: 2 repository, `sendSystemEmail` (builder email dùng bản THẬT) và dispatcher (`notifyUsers`,
 * `filterEmailRecipientsByPreference`) — spec của dispatcher đã kiểm bên trong nó; ở đây kiểm ĐÚNG THAM SỐ sendNow đưa vào.
 */
const mockCreate = jest.fn();
const mockFindById = jest.fn();
const mockUpdateById = jest.fn();
const mockGetEligibleRecipients = jest.fn();
const mockMarkAsFailed = jest.fn();
const mockUpdateStats = jest.fn();
const mockMarkAsSent = jest.fn();
const mockCreateBatch = jest.fn();
const mockUpdateLogStatus = jest.fn();
const mockMarkLogFailed = jest.fn();
const mockSendSystemEmail = jest.fn();
const mockNotifyUsers = jest.fn();
const mockFilterByPreference = jest.fn();
const mockGetEffectiveSettings = jest.fn();

jest.unstable_mockModule('../../../repositories/admin/notification.repository.js', () => ({
  default: {
    create: mockCreate,
    findById: mockFindById,
    updateById: mockUpdateById,
    getEligibleRecipients: mockGetEligibleRecipients,
    markAsFailed: mockMarkAsFailed,
    updateStats: mockUpdateStats,
    markAsSent: mockMarkAsSent,
  },
}));
jest.unstable_mockModule('../../../repositories/admin/notificationEmailLog.repository.js', () => ({
  default: {
    createBatch: mockCreateBatch,
    updateStatus: mockUpdateLogStatus,
    markAsFailed: mockMarkLogFailed,
  },
}));
const realSystemEmail = await import('../../../utils/systemEmail.util.js');
jest.unstable_mockModule('../../../utils/systemEmail.util.js', () => ({
  ...realSystemEmail,
  sendSystemEmail: mockSendSystemEmail,
}));
jest.unstable_mockModule('../../notification/notificationDispatch.service.js', () => ({
  notifyUsers: mockNotifyUsers,
  filterEmailRecipientsByPreference: mockFilterByPreference,
  getEffectiveEventSettings: mockGetEffectiveSettings,
}));

const { default: notificationService } = await import('../notification.service.js');

const user = (id) => ({ id, email: `u${id}@shop.vn`, full_name: `Người ${id}`, plan: 'pro' });
const RECIPIENTS = [user(1), user(2), user(3)];

const notification = (over = {}) => ({
  id: 7,
  status: 'draft',
  type: 'announcement',
  priority: 'normal',
  title: '[Founder AI] Bảo trì {{user_name}} nhé',
  title_en: '',
  message: 'Chào {{user_name}}, tài khoản gói {{user_plan}} sắp bảo trì.',
  message_en: null,
  html_content: null,
  metadata: {},
  channels: ['email'],
  target_user_ids: [1, 2, 3],
  ...over,
});

describe('notificationService.sendNow — kênh gửi', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockFindById.mockResolvedValue(notification());
    mockCreate.mockResolvedValue({ id: 7 });
    mockGetEffectiveSettings.mockResolvedValue({ inAppEnabled: true, emailEnabled: true, userCanDisableEmail: true });
    mockUpdateById.mockResolvedValue({});
    mockGetEligibleRecipients.mockResolvedValue(RECIPIENTS);
    mockMarkAsFailed.mockResolvedValue({});
    mockUpdateStats.mockResolvedValue({});
    mockMarkAsSent.mockResolvedValue({});
    mockCreateBatch.mockImplementation(async (logs) => logs.map((_log, index) => ({ id: 100 + index })));
    mockUpdateLogStatus.mockResolvedValue({});
    mockMarkLogFailed.mockResolvedValue({});
    mockSendSystemEmail.mockResolvedValue({});
    mockNotifyUsers.mockImplementation(async ({ userIds }) => ({ inApp: userIds.length, emailSent: 0, emailSkipped: 0, emailFailed: 0 }));
    mockFilterByPreference.mockImplementation(async (_eventType, users) => ({ allowed: users, skipped: [] }));
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('{in_app}: KHÔNG gọi sendSystemEmail, không tạo log email, không tra tuỳ chọn; gọi notifyUsers đúng tham số; ghi in_app_count', async () => {
    mockFindById.mockResolvedValue(notification({
      channels: ['in_app'],
      priority: 'high',
      metadata: { link: '/app/plans' },
    }));

    const result = await notificationService.sendNow(7);

    expect(mockSendSystemEmail).not.toHaveBeenCalled();
    expect(mockCreateBatch).not.toHaveBeenCalled();
    expect(mockUpdateStats).not.toHaveBeenCalled();
    expect(mockFilterByPreference).not.toHaveBeenCalled();

    expect(mockNotifyUsers).toHaveBeenCalledTimes(1);
    expect(mockNotifyUsers).toHaveBeenCalledWith({
      eventType: 'admin_broadcast',
      userIds: [1, 2, 3],
      title: 'Bảo trì bạn nhé', // bỏ tiền tố "[Founder AI] ", biến thay bằng cách gọi trung tính
      titleEn: null,
      message: 'Chào bạn, tài khoản gói của bạn sắp bảo trì.',
      messageEn: null,
      link: '/app/plans',
      severity: 'warning', // priority high
      metadata: { broadcastType: 'announcement', priority: 'high' },
      notificationId: 7,
      dedupeKey: 'broadcast:7',
      channels: ['in_app'], // dispatcher chỉ lo chuông; email đi đường cũ
      explicitChannels: true,
    });
    expect(mockUpdateById).toHaveBeenLastCalledWith(7, { recipient_count: 3, in_app_count: 3 });
    expect(mockMarkAsSent).toHaveBeenCalledWith(7);
    expect(result).toEqual({
      sent: 0, failed: 0, total: 3, failedEmails: [], emailTotal: 0, emailSkipped: 0, inApp: 3, inAppFailed: false, channels: ['in_app'],
    });
  });

  it('{email, in_app}: cả hai — chuông qua notifyUsers (chỉ in_app), email đường cũ có log và thống kê', async () => {
    mockFindById.mockResolvedValue(notification({ channels: ['email', 'in_app'] }));

    const result = await notificationService.sendNow(7);

    expect(mockNotifyUsers).toHaveBeenCalledTimes(1);
    expect(mockNotifyUsers.mock.calls[0][0].channels).toEqual(['in_app']);
    expect(mockSendSystemEmail).toHaveBeenCalledTimes(3);
    expect(mockSendSystemEmail.mock.calls.map(([arg]) => arg.to).sort()).toEqual(['u1@shop.vn', 'u2@shop.vn', 'u3@shop.vn']);
    expect(mockCreateBatch).toHaveBeenCalledTimes(1);
    expect(mockCreateBatch.mock.calls[0][0]).toHaveLength(3);
    expect(mockUpdateStats).toHaveBeenCalledWith(7, { sent: 3, failed: 0 });
    expect(result).toMatchObject({ sent: 3, failed: 0, total: 3, emailTotal: 3, emailSkipped: 0, inApp: 3, channels: ['email', 'in_app'] });
  });

  it('{email}: KHÔNG gọi notifyUsers (hành vi cũ)', async () => {
    const result = await notificationService.sendNow(7);

    expect(mockNotifyUsers).not.toHaveBeenCalled();
    expect(mockSendSystemEmail).toHaveBeenCalledTimes(3);
    expect(mockUpdateById).toHaveBeenLastCalledWith(7, { recipient_count: 3, in_app_count: 0 });
    expect(result).toMatchObject({ sent: 3, inApp: 0, channels: ['email'] });
  });

  it('bản tin cũ channels thiếu/null → coi như {email}, không chuông', async () => {
    mockFindById.mockResolvedValue(notification({ channels: null }));

    const result = await notificationService.sendNow(7);

    expect(mockNotifyUsers).not.toHaveBeenCalled();
    expect(mockSendSystemEmail).toHaveBeenCalledTimes(3);
    expect(result.channels).toEqual(['email']);
  });

  it('email lọc theo tuỳ chọn "admin_broadcast": người đã tắt KHÔNG nhận email và KHÔNG có log; chuông vẫn tới đủ người', async () => {
    mockFindById.mockResolvedValue(notification({ channels: ['email', 'in_app'] }));
    mockFilterByPreference.mockResolvedValue({ allowed: [RECIPIENTS[0], RECIPIENTS[2]], skipped: [RECIPIENTS[1]] });

    const result = await notificationService.sendNow(7);

    expect(mockFilterByPreference).toHaveBeenCalledWith('admin_broadcast', RECIPIENTS);
    expect(mockSendSystemEmail.mock.calls.map(([arg]) => arg.to).sort()).toEqual(['u1@shop.vn', 'u3@shop.vn']);
    expect(mockCreateBatch.mock.calls[0][0].map((log) => log.user_id)).toEqual([1, 3]);
    expect(mockNotifyUsers.mock.calls[0][0].userIds).toEqual([1, 2, 3]);
    expect(result).toMatchObject({ sent: 2, total: 3, emailTotal: 2, emailSkipped: 1, inApp: 3 });
  });

  it.each([
    ['priority urgent', { priority: 'urgent', type: 'announcement' }],
    ['loại security', { priority: 'normal', type: 'security' }],
    ['loại maintenance', { priority: 'normal', type: 'maintenance' }],
  ])('%s: khoá — bỏ qua tuỳ chọn tắt email, gửi cho TẤT CẢ', async (_label, over) => {
    mockFindById.mockResolvedValue(notification({ channels: ['email'], ...over }));
    // Nếu code lỡ gọi bộ lọc thì ca này đỏ vì có người bị loại.
    mockFilterByPreference.mockResolvedValue({ allowed: [RECIPIENTS[0]], skipped: [RECIPIENTS[1], RECIPIENTS[2]] });

    const result = await notificationService.sendNow(7);

    expect(mockFilterByPreference).not.toHaveBeenCalled();
    expect(mockSendSystemEmail).toHaveBeenCalledTimes(3);
    expect(result).toMatchObject({ sent: 3, emailTotal: 3, emailSkipped: 0 });
  });

  it('loại thường (announcement/promotion/...) với priority thường → CÓ lọc tuỳ chọn', async () => {
    for (const type of ['announcement', 'promotion', 'warning', 'reminder']) {
      mockFilterByPreference.mockClear();
      mockFindById.mockResolvedValue(notification({ channels: ['email'], type, priority: 'normal' }));
      // eslint-disable-next-line no-await-in-loop
      await notificationService.sendNow(7);
      expect(mockFilterByPreference).toHaveBeenCalledTimes(1);
    }
  });

  it('mọi người đều đã tắt email → không gửi email nào, không tạo log, bản tin vẫn "sent"', async () => {
    mockFilterByPreference.mockResolvedValue({ allowed: [], skipped: RECIPIENTS });

    const result = await notificationService.sendNow(7);

    expect(mockSendSystemEmail).not.toHaveBeenCalled();
    expect(mockCreateBatch).not.toHaveBeenCalled();
    expect(mockMarkAsSent).toHaveBeenCalledWith(7);
    expect(result).toMatchObject({ sent: 0, total: 3, emailTotal: 0, emailSkipped: 3 });
  });

  it('severity theo priority: urgent → error, normal → info', async () => {
    mockFindById.mockResolvedValue(notification({ channels: ['in_app'], priority: 'urgent' }));
    await notificationService.sendNow(7);
    expect(mockNotifyUsers.mock.calls[0][0].severity).toBe('error');

    mockNotifyUsers.mockClear();
    mockFindById.mockResolvedValue(notification({ channels: ['in_app'], priority: 'normal' }));
    await notificationService.sendNow(7);
    expect(mockNotifyUsers.mock.calls[0][0].severity).toBe('info');
  });

  it('chuông lỗi (notifyUsers ném) không chặn đường email; in_app_count = 0', async () => {
    mockFindById.mockResolvedValue(notification({ channels: ['email', 'in_app'] }));
    mockNotifyUsers.mockRejectedValue(new Error('db down'));

    const result = await notificationService.sendNow(7);

    expect(mockSendSystemEmail).toHaveBeenCalledTimes(3);
    expect(mockUpdateById).toHaveBeenLastCalledWith(7, { recipient_count: 3, in_app_count: 0 });
    expect(result).toMatchObject({ sent: 3, inApp: 0, inAppFailed: true });
  });

  it('notifyUsers trả 0 dòng trong khi có người nhận → inAppFailed (admin phải thấy "chuông: lỗi"); trả đủ dòng → không lỗi', async () => {
    mockFindById.mockResolvedValue(notification({ channels: ['in_app'] }));
    mockNotifyUsers.mockResolvedValue({ inApp: 0, emailSent: 0, emailSkipped: 0, emailFailed: 0 });
    const failed = await notificationService.sendNow(7);
    expect(failed).toMatchObject({ inApp: 0, inAppFailed: true, total: 3 });

    mockNotifyUsers.mockResolvedValue({ inApp: 3, emailSent: 0, emailSkipped: 0, emailFailed: 0 });
    const ok = await notificationService.sendNow(7);
    expect(ok).toMatchObject({ inApp: 3, inAppFailed: false });
  });

  it('tra cứu tuỳ chọn lỗi → đánh dấu failed và ném, CHƯA chèn chuông, CHƯA gửi email', async () => {
    mockFindById.mockResolvedValue(notification({ channels: ['email', 'in_app'] }));
    mockFilterByPreference.mockRejectedValue(new Error('prefs down'));

    await expect(notificationService.sendNow(7)).rejects.toThrow('prefs down');

    expect(mockMarkAsFailed).toHaveBeenCalledWith(7);
    expect(mockNotifyUsers).not.toHaveBeenCalled();
    expect(mockSendSystemEmail).not.toHaveBeenCalled();
  });

  it('không có người nhận: không chèn chuông, không gửi email, vẫn sent với in_app_count 0', async () => {
    mockFindById.mockResolvedValue(notification({ channels: ['email', 'in_app'] }));
    mockGetEligibleRecipients.mockResolvedValue([]);

    const result = await notificationService.sendNow(7);

    expect(mockNotifyUsers).not.toHaveBeenCalled();
    expect(mockSendSystemEmail).not.toHaveBeenCalled();
    expect(mockUpdateById).toHaveBeenLastCalledWith(7, expect.objectContaining({ status: 'sent', recipient_count: 0, in_app_count: 0 }));
    expect(result).toMatchObject({ total: 0, emailTotal: 0, inApp: 0 });
  });

  it('đã gửi / đang gửi → 409, không đụng kênh nào', async () => {
    mockFindById.mockResolvedValue(notification({ status: 'sent', channels: ['email', 'in_app'] }));
    await expect(notificationService.sendNow(7)).rejects.toMatchObject({ status: 409 });
    mockFindById.mockResolvedValue(notification({ status: 'sending', channels: ['email', 'in_app'] }));
    await expect(notificationService.sendNow(7)).rejects.toMatchObject({ status: 409 });
    expect(mockNotifyUsers).not.toHaveBeenCalled();
    expect(mockSendSystemEmail).not.toHaveBeenCalled();
  });

  it('nội dung chuông tiếng Anh dùng cách gọi tiếng Anh, tiêu đề rỗng sau khi bỏ tiền tố thì lấy lại nguyên tiêu đề không bị mất', async () => {
    mockFindById.mockResolvedValue(notification({
      channels: ['in_app'],
      title: 'Thông báo chung',
      title_en: 'Hello {{user_name}}',
      message_en: 'Hi {{user_name}}, welcome',
    }));

    await notificationService.sendNow(7);

    const args = mockNotifyUsers.mock.calls[0][0];
    expect(args.title).toBe('Thông báo chung');
    expect(args.titleEn).toBe('Hello there');
    expect(args.messageEn).toBe('Hi there, welcome');
  });
});

describe('kênh bị TẮT trong Cấu hình kênh (admin_broadcast) → 400 "Kênh X đang tắt trong Cấu hình kênh"', () => {
  const settings = (over) => ({ inAppEnabled: true, emailEnabled: true, userCanDisableEmail: true, ...over });

  beforeEach(() => {
    jest.resetAllMocks();
    mockCreate.mockResolvedValue({ id: 7 });
    mockFindById.mockResolvedValue(notification());
    mockUpdateById.mockResolvedValue({});
    mockGetEligibleRecipients.mockResolvedValue(RECIPIENTS);
    mockGetEffectiveSettings.mockResolvedValue(settings({}));
    mockNotifyUsers.mockImplementation(async ({ userIds }) => ({ inApp: userIds.length }));
    mockFilterByPreference.mockImplementation(async (_eventType, users) => ({ allowed: users, skipped: [] }));
    mockCreateBatch.mockImplementation(async (logs) => logs.map((_log, index) => ({ id: index + 1 })));
    mockSendSystemEmail.mockResolvedValue({});
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('sendNow: chuông tắt mà bản tin chọn chuông → 400, KHÔNG đổi trạng thái, không chèn, không gửi', async () => {
    mockGetEffectiveSettings.mockResolvedValue(settings({ inAppEnabled: false }));
    mockFindById.mockResolvedValue(notification({ channels: ['email', 'in_app'] }));

    await expect(notificationService.sendNow(7)).rejects.toMatchObject({
      status: 400,
      message: 'Kênh Chuông đang tắt trong Cấu hình kênh',
    });

    expect(mockUpdateById).not.toHaveBeenCalled();
    expect(mockNotifyUsers).not.toHaveBeenCalled();
    expect(mockSendSystemEmail).not.toHaveBeenCalled();
  });

  it('sendNow: email tắt mà bản tin chọn email → 400; bản tin chỉ-chuông vẫn gửi được', async () => {
    mockGetEffectiveSettings.mockResolvedValue(settings({ emailEnabled: false }));
    mockFindById.mockResolvedValue(notification({ channels: ['email'] }));
    await expect(notificationService.sendNow(7)).rejects.toMatchObject({ status: 400, message: 'Kênh Email đang tắt trong Cấu hình kênh' });
    expect(mockSendSystemEmail).not.toHaveBeenCalled();

    mockFindById.mockResolvedValue(notification({ channels: ['in_app'] }));
    await expect(notificationService.sendNow(7)).resolves.toMatchObject({ inApp: 3 });
  });

  it('cả hai kênh đều tắt và bản tin chọn cả hai → liệt kê cả hai', async () => {
    mockGetEffectiveSettings.mockResolvedValue(settings({ inAppEnabled: false, emailEnabled: false }));
    await expect(notificationService.assertChannelsEnabled(['email', 'in_app'])).rejects.toMatchObject({
      status: 400,
      message: 'Kênh Email, Chuông đang tắt trong Cấu hình kênh',
    });
  });

  it('createNotification / updateNotification (khi có channels) / sendDirect đều chặn, không ghi DB', async () => {
    mockGetEffectiveSettings.mockResolvedValue(settings({ inAppEnabled: false }));

    await expect(notificationService.createNotification({ title: 't', channels: ['in_app'] })).rejects.toMatchObject({ status: 400 });
    await expect(notificationService.updateNotification(7, { channels: ['email', 'in_app'] })).rejects.toMatchObject({ status: 400 });
    await expect(notificationService.sendDirect({ title: 't', channels: ['in_app'] })).rejects.toMatchObject({ status: 400 });

    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockUpdateById).not.toHaveBeenCalled();
  });

  it('updateNotification không đổi channels → không tra cấu hình; kênh còn bật → ghi bình thường', async () => {
    mockGetEffectiveSettings.mockResolvedValue(settings({ inAppEnabled: false }));
    await notificationService.updateNotification(7, { title: 'Đổi tiêu đề' });
    expect(mockGetEffectiveSettings).not.toHaveBeenCalled();
    expect(mockUpdateById).toHaveBeenCalledWith(7, { title: 'Đổi tiêu đề' });

    await notificationService.updateNotification(7, { channels: ['email'] });
    expect(mockUpdateById).toHaveBeenLastCalledWith(7, { channels: ['email'] });
  });

  it('create không nói gì về kênh (client cũ) = {email}: email tắt thì cũng chặn', async () => {
    mockGetEffectiveSettings.mockResolvedValue(settings({ emailEnabled: false }));
    await expect(notificationService.createNotification({ title: 't' })).rejects.toMatchObject({ status: 400 });
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
