/**
 * Unit (mock ranh giới repo + dispatcher) cho nhắc thanh toán lại đơn bỏ dở — PLAN_NHAC_THANH_TOAN_LAI_SAU_2_GIO_2026-10-12.
 * Việc CHỌN đơn nào (cửa sổ 2–72 giờ, không `pending`/`failed`, không đơn success sau...) nằm ở SQL: tests/integration/abandonedCheckoutReminder.test.js.
 * Ở đây ghim phần điều phối: nội dung thông báo, khi nào mới đánh dấu đã nhắc, chống chạy chồng, và hợp đồng của endpoint đặt lại đơn.
 */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockFindAbandoned = jest.fn();
const mockMarkSent = jest.fn();
const mockFindReorderInfo = jest.fn();
const mockFindPlanById = jest.fn();
const mockNotifyUsers = jest.fn();
const mockLoadTemplate = jest.fn();

jest.unstable_mockModule('../../../repositories/payment/payment.repository.js', () => ({
  findAbandonedOrdersForReminder: mockFindAbandoned,
  markPaymentReminderSent: mockMarkSent,
  findReorderInfo: mockFindReorderInfo,
}));
jest.unstable_mockModule('../../../repositories/payment/plan.repository.js', () => ({
  findPlanById: mockFindPlanById,
}));
jest.unstable_mockModule('../../notification/notificationDispatch.service.js', () => ({
  notifyUsers: mockNotifyUsers,
}));
jest.unstable_mockModule('../../email/welcomeEmailTemplate.service.js', () => ({
  loadCustomSystemEmailTemplate: mockLoadTemplate,
}));

const { sendAbandonedCheckoutReminders, getReorderInfoForOwner } = await import('../abandonedCheckoutReminder.service.js');

const order = (overrides = {}) => ({
  id: 11,
  order_code: '1760000000000011',
  user_id: 7,
  plan_id: 3,
  billing_period: 'monthly',
  amount: '1299000.00',
  plan_name: 'Chuyên nghiệp',
  ...overrides,
});

const delivered = { inApp: 1, emailSent: 1, emailSkipped: 0, emailFailed: 0 };

beforeEach(() => {
  jest.resetAllMocks();
  mockLoadTemplate.mockResolvedValue(null);
  mockMarkSent.mockResolvedValue(true);
  mockNotifyUsers.mockResolvedValue(delivered);
  // Các ca lỗi cố ý làm service log console.error — im lặng cho đỡ nhiễu, không ca nào dựa vào nội dung log.
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('sendAbandonedCheckoutReminders', () => {
  it('không có đơn nào → {0,0,0,0}, không nạp mẫu thư, không gửi gì', async () => {
    mockFindAbandoned.mockResolvedValue([]);
    await expect(sendAbandonedCheckoutReminders()).resolves.toEqual({ scanned: 0, sent: 0, skipped: 0, failed: 0 });
    expect(mockLoadTemplate).not.toHaveBeenCalled();
    expect(mockNotifyUsers).not.toHaveBeenCalled();
    expect(mockMarkSent).not.toHaveBeenCalled();
  });

  it('một đơn: gửi đúng sự kiện / người nhận / link tương đối / khoá chống trùng theo id đơn, rồi mới đánh dấu đã nhắc', async () => {
    mockFindAbandoned.mockResolvedValue([order()]);
    const callOrder = [];
    mockNotifyUsers.mockImplementation(async () => { callOrder.push('notify'); return delivered; });
    mockMarkSent.mockImplementation(async () => { callOrder.push('mark'); return true; });

    const result = await sendAbandonedCheckoutReminders({ baseUrl: 'https://founderai.biz/' });

    expect(result).toEqual({ scanned: 1, sent: 1, skipped: 0, failed: 0 });
    expect(callOrder).toEqual(['notify', 'mark']);
    expect(mockMarkSent).toHaveBeenCalledWith(11);
    const input = mockNotifyUsers.mock.calls[0][0];
    expect(input).toMatchObject({
      eventType: 'order_payment_reminder',
      userIds: [7],
      title: 'Hoàn tất thanh toán gói Chuyên nghiệp',
      link: '/checkout?order=1760000000000011',
      severity: 'info',
      dedupeKey: 'order_payment_reminder:11',
    });
    expect(input.message).toContain('1760000000000011');
    expect(input.message).toContain('link mới có hiệu lực ngay');
  });

  it('thư render từ mẫu mặc định: link tuyệt đối /checkout?order=<mã>, KHÔNG có link PayOS, giá + kỳ + tên gói đúng', async () => {
    mockFindAbandoned.mockResolvedValue([order({ billing_period: 'yearly', amount: '12470400.00' })]);

    await sendAbandonedCheckoutReminders({ baseUrl: 'https://founderai.biz/' });

    const { email } = mockNotifyUsers.mock.calls[0][0];
    const { subject, html } = email({ id: 7, email: 'khach@example.com', fullName: 'Nguyễn Minh Anh' });
    expect(subject).toContain('Hoàn tất thanh toán gói Chuyên nghiệp');
    expect(html).toContain('href="https://founderai.biz/checkout?order=1760000000000011"');
    expect(html).toContain('Nguyễn Minh Anh');
    expect(html).toContain('thanh toán theo năm');
    expect(html).toContain('12.470.400');
    expect(html).not.toMatch(/pay\.payos|payos\.vn/i);
  });

  it('mẫu tuỳ chỉnh của super admin (nạp MỘT lần cho cả lượt) được dùng thay cho mẫu mặc định', async () => {
    mockFindAbandoned.mockResolvedValue([order({ id: 1, order_code: '111' }), order({ id: 2, order_code: '222' })]);
    mockLoadTemplate.mockResolvedValue({ subject: 'Tuỳ chỉnh {{plan_name}}', bodyHtml: '<p>Mã {{order_code}} → {{pay_url}}</p>' });

    await sendAbandonedCheckoutReminders({ baseUrl: 'https://x.test' });

    expect(mockLoadTemplate).toHaveBeenCalledTimes(1);
    expect(mockLoadTemplate).toHaveBeenCalledWith('order_payment_reminder');
    const rendered = mockNotifyUsers.mock.calls[1][0].email({ fullName: 'A' });
    expect(rendered.subject).toBe('Tuỳ chỉnh Chuyên nghiệp');
    expect(rendered.html).toContain('Mã 222 → https://x.test/checkout?order=222');
  });

  it('hỏng hoàn toàn (email lỗi, chuông cũng không ghi): KHÔNG đánh dấu để lượt sau thử lại; đơn kế vẫn được xử lý', async () => {
    mockFindAbandoned.mockResolvedValue([order({ id: 1 }), order({ id: 2, order_code: '222' })]);
    mockNotifyUsers
      .mockResolvedValueOnce({ inApp: 0, emailSent: 0, emailSkipped: 0, emailFailed: 1 })
      .mockResolvedValueOnce(delivered);

    const result = await sendAbandonedCheckoutReminders();

    expect(result).toEqual({ scanned: 2, sent: 1, skipped: 0, failed: 1 });
    expect(mockMarkSent).toHaveBeenCalledTimes(1);
    expect(mockMarkSent).toHaveBeenCalledWith(2);
  });

  it('chuông ghi được nhưng email lỗi → vẫn tính đã nhắc (đánh dấu), không gửi lại thư lần hai', async () => {
    mockFindAbandoned.mockResolvedValue([order()]);
    mockNotifyUsers.mockResolvedValue({ inApp: 1, emailSent: 0, emailSkipped: 0, emailFailed: 1 });

    await expect(sendAbandonedCheckoutReminders()).resolves.toEqual({ scanned: 1, sent: 1, skipped: 0, failed: 0 });
    expect(mockMarkSent).toHaveBeenCalledWith(11);
  });

  it('khách tắt email + admin tắt chuông (không kênh nào gửi, không lỗi) → đóng đơn (đánh dấu) và tính skipped, không quét lại mãi', async () => {
    mockFindAbandoned.mockResolvedValue([order()]);
    mockNotifyUsers.mockResolvedValue({ inApp: 0, emailSent: 0, emailSkipped: 1, emailFailed: 0 });

    await expect(sendAbandonedCheckoutReminders()).resolves.toEqual({ scanned: 1, sent: 0, skipped: 1, failed: 0 });
    expect(mockMarkSent).toHaveBeenCalledWith(11);
  });

  it('notifyUsers ném lỗi → failed, không đánh dấu, không làm hỏng lượt', async () => {
    mockFindAbandoned.mockResolvedValue([order({ id: 1 }), order({ id: 2, order_code: '222' })]);
    mockNotifyUsers.mockRejectedValueOnce(new Error('db down')).mockResolvedValueOnce(delivered);

    const result = await sendAbandonedCheckoutReminders();

    expect(result).toEqual({ scanned: 2, sent: 1, skipped: 0, failed: 1 });
    expect(mockMarkSent).toHaveBeenCalledTimes(1);
    expect(mockMarkSent).toHaveBeenCalledWith(2);
  });

  it('lượt cron chậm chồng lên lượt sau → lượt sau bỏ qua (không quét, không gửi đôi)', async () => {
    let releaseFirst;
    mockFindAbandoned.mockImplementationOnce(() => new Promise((resolve) => { releaseFirst = () => resolve([]); }));

    const first = sendAbandonedCheckoutReminders();
    await new Promise((resolve) => setImmediate(resolve));
    const second = await sendAbandonedCheckoutReminders();

    expect(second).toEqual({ scanned: 0, sent: 0, skipped: 0, failed: 0 });
    expect(mockFindAbandoned).toHaveBeenCalledTimes(1);
    releaseFirst();
    await first;
    // lượt đầu xong → lượt mới chạy lại bình thường
    mockFindAbandoned.mockResolvedValueOnce([]);
    await sendAbandonedCheckoutReminders();
    expect(mockFindAbandoned).toHaveBeenCalledTimes(2);
  });

  it('chuyển olderThanMinutes / newerThanHours / limit xuống truy vấn (mặc định do repository quyết)', async () => {
    mockFindAbandoned.mockResolvedValue([]);
    await sendAbandonedCheckoutReminders({ olderThanMinutes: 30, newerThanHours: 5, limit: 9 });
    expect(mockFindAbandoned).toHaveBeenCalledWith({ olderThanMinutes: 30, newerThanHours: 5, limit: 9 });
  });
});

describe('getReorderInfoForOwner', () => {
  const info = (overrides = {}) => ({
    id: 11,
    order_code: '1760000000000011',
    status: 'cancelled',
    plan_id: 3,
    billing_period: 'monthly',
    voucher_code: null,
    is_custom_plan: false,
    is_topup: false,
    ...overrides,
  });
  const plan = (overrides = {}) => ({
    id: 3, code: 'professional', name: 'Chuyên nghiệp', price: '1299000.00', price_yearly: '12470400.00', is_active: true, is_custom: false, ...overrides,
  });
  const failsWith = async (promise, status, code) => {
    await expect(promise).rejects.toMatchObject({ status, code });
  };

  it('không tìm thấy (hoặc không phải chủ đơn — repository trả null) → 404 ORDER_NOT_FOUND', async () => {
    mockFindReorderInfo.mockResolvedValue(null);
    await failsWith(getReorderInfoForOwner('1', 9), 404, 'ORDER_NOT_FOUND');
    expect(mockFindReorderInfo).toHaveBeenCalledWith('1', 9);
  });

  it('đơn đã success → 409 ORDER_ALREADY_PAID, không đọc gói', async () => {
    mockFindReorderInfo.mockResolvedValue(info({ status: 'success' }));
    await failsWith(getReorderInfoForOwner('1', 7), 409, 'ORDER_ALREADY_PAID');
    expect(mockFindPlanById).not.toHaveBeenCalled();
  });

  it.each([
    ['gói tự chọn', { is_custom_plan: true }],
    ['nạp thêm', { is_topup: true }],
    ['không có plan_id', { plan_id: null }],
  ])('đơn %s → 422 ORDER_NOT_REORDERABLE', async (_name, overrides) => {
    mockFindReorderInfo.mockResolvedValue(info(overrides));
    await failsWith(getReorderInfoForOwner('1', 7), 422, 'ORDER_NOT_REORDERABLE');
  });

  it.each([
    ['không còn dòng gói', null],
    ['gói ngừng bán', plan({ is_active: false })],
    ['gói đã thành gói riêng (is_custom)', plan({ is_custom: true })],
  ])('%s → 410 PLAN_UNAVAILABLE', async (_name, row) => {
    mockFindReorderInfo.mockResolvedValue(info());
    mockFindPlanById.mockResolvedValue(row);
    await failsWith(getReorderInfoForOwner('1', 7), 410, 'PLAN_UNAVAILABLE');
  });

  it('đơn cancelled hợp lệ → trả nguyên dòng gói + kỳ + mã giảm giá khách tự nhập + trạng thái đơn', async () => {
    mockFindReorderInfo.mockResolvedValue(info({ billing_period: 'yearly', voucher_code: 'GIAM20' }));
    mockFindPlanById.mockResolvedValue(plan());
    await expect(getReorderInfoForOwner('1760000000000011', 7)).resolves.toEqual({
      plan: plan(),
      billingPeriod: 'yearly',
      voucherCode: 'GIAM20',
      orderStatus: 'cancelled',
    });
  });

  it('đơn kỳ năm nhưng gói nay không còn giá năm → rơi về monthly (tránh createPaymentLink từ chối kỳ năm)', async () => {
    mockFindReorderInfo.mockResolvedValue(info({ billing_period: 'yearly' }));
    mockFindPlanById.mockResolvedValue(plan({ price_yearly: null }));
    await expect(getReorderInfoForOwner('1', 7)).resolves.toMatchObject({ billingPeriod: 'monthly', voucherCode: null });
  });

  it('đơn pending (khách đang dở tay) vẫn đặt lại được', async () => {
    mockFindReorderInfo.mockResolvedValue(info({ status: 'pending' }));
    mockFindPlanById.mockResolvedValue(plan());
    await expect(getReorderInfoForOwner('1', 7)).resolves.toMatchObject({ orderStatus: 'pending' });
  });
});
