import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const sendSystemEmail = jest.fn().mockResolvedValue(undefined);

jest.unstable_mockModule('../../utils/systemEmail.util.js', () => ({
  sendSystemEmail: (...args) => sendSystemEmail(...args),
  SENDER_NAME: 'UKNOW Campaign',
}));

const repo = {
  findFormByPublicKey: jest.fn(),
  createSubmission: jest.fn(),
  findSubmissionByAccessTokenAndForm: jest.fn(),
  countPendingHoldsForIpAndForm: jest.fn(),
  countFormRespondentEmailsLast24h: jest.fn().mockResolvedValue(0),
  countConfirmationEmailsForRecipientLast24h: jest.fn().mockResolvedValue(0),
  markConfirmationSent: jest.fn().mockResolvedValue(undefined),
};

jest.unstable_mockModule('../../repositories/form.repository.js', () => ({
  default: repo,
  MAX_FORM_RESPONDENT_EMAILS_PER_24H: 200,
  MAX_CONFIRMATION_EMAILS_PER_RECIPIENT_PER_24H: 3,
}));

const { default: formService } = await import('../form.service.js');

const basePayment = {
  enabled: true,
  methods: ['bank'],
  method: 'bank',
  amount: 150000,
  bankBin: '970422',
  accountNumber: '0123456789',
  accountName: 'NGUYEN VAN A',
  holdMinutes: 45,
};

function makeForm(paymentConfig) {
  return {
    id: 1,
    workspaceOwnerId: 10,
    publicKey: 'pub_test_123456',
    title: 'Form thu tiền',
    fields: [
      { key: 'f_name', type: 'short_text', label: 'Họ tên', required: true, role: 'name', options: [] },
      { key: 'f_email', type: 'email', label: 'Email', required: true, role: 'email', options: [] },
    ],
    settings: { sendConfirmation: true },
    isPublished: true,
    adminDisabledAt: null,
    ownerEmail: 'owner@example.com',
    ownerActivePlanId: 2,
    ownerSubscriptionExpiresAt: new Date(Date.now() + 86400000).toISOString(),
    ownerGracePeriodDays: 3,
    paymentConfig,
    bookingConfig: null,
  };
}

async function submitAndGetRespondentMail(paymentConfig) {
  repo.findFormByPublicKey.mockResolvedValue(makeForm(paymentConfig));
  const result = await formService.submitPublicForm(
    'pub_test_123456',
    { answers: { f_name: 'Khách', f_email: 'khach@example.com' } },
    '1.2.3.4'
  );
  const call = sendSystemEmail.mock.calls.find(([arg]) => arg.to === 'khach@example.com');
  return { result, mail: call?.[0] };
}

describe('form.service - chữ thanh toán theo payment_config.purpose', () => {
  beforeEach(() => {
    sendSystemEmail.mockClear();
    repo.countPendingHoldsForIpAndForm.mockReset().mockResolvedValue(0);
    repo.createSubmission.mockReset().mockImplementation(async (params) => ({
      id: 99,
      accessToken: 'tok',
      paymentCode: params.paymentCode,
      holdExpiresAt: params.holdExpiresAt,
      unsubscribeToken: 'u',
    }));
  });

  it('purpose=order -> email "hoàn tất đơn hàng" + "Hạn thanh toán", snapshot lưu purpose', async () => {
    const { result, mail } = await submitAndGetRespondentMail({ ...basePayment, purpose: 'order' });
    expect(mail.html).toContain('Vui lòng chuyển khoản để hoàn tất đơn hàng');
    expect(mail.html).toContain('Hạn thanh toán: <strong>45 phút</strong>');
    expect(mail.html).not.toContain('giữ chỗ');
    expect(repo.createSubmission.mock.calls[0][0].paymentSnapshot.purpose).toBe('order');
    expect(result.payment.purpose).toBe('order');
  });

  it('purpose=deposit -> email "đặt cọc" + "Hạn đặt cọc"', async () => {
    const { mail } = await submitAndGetRespondentMail({ ...basePayment, purpose: 'deposit' });
    expect(mail.html).toContain('Vui lòng chuyển khoản để đặt cọc');
    expect(mail.html).toContain('Hạn đặt cọc: <strong>45 phút</strong>');
  });

  it('biểu mẫu cũ không có purpose -> vẫn "giữ chỗ" (biểu mẫu cũ vẫn giữ chỗ)', async () => {
    const { result, mail } = await submitAndGetRespondentMail({ ...basePayment });
    expect(mail.html).toContain('Vui lòng chuyển khoản để giữ chỗ');
    expect(mail.html).toContain('Hạn giữ chỗ: <strong>45 phút</strong>');
    expect(repo.createSubmission.mock.calls[0][0].paymentSnapshot.purpose).toBe('hold');
    expect(result.payment.purpose).toBe('hold');
  });

  it('purpose lạ -> rơi về hold', async () => {
    const { mail } = await submitAndGetRespondentMail({ ...basePayment, purpose: '<script>' });
    expect(mail.html).toContain('giữ chỗ');
    expect(mail.html).not.toContain('<script>');
  });

  it('429 quá nhiều lượt chờ dùng chữ theo purpose', async () => {
    repo.countPendingHoldsForIpAndForm.mockResolvedValue(3);
    repo.findFormByPublicKey.mockResolvedValue(makeForm({ ...basePayment, purpose: 'order' }));
    await expect(
      formService.submitPublicForm('pub_test_123456', { answers: { f_name: 'K', f_email: 'k@example.com' } }, '1.2.3.4')
    ).rejects.toMatchObject({ statusCode: 429, message: expect.stringContaining('đơn chưa thanh toán') });
  });

  it('getPublicForm trả purpose công khai (thiếu -> hold)', async () => {
    repo.findFormByPublicKey.mockResolvedValue(makeForm({ ...basePayment, purpose: 'deposit' }));
    expect((await formService.getPublicForm('pub_test_123456')).payment.purpose).toBe('deposit');
    repo.findFormByPublicKey.mockResolvedValue(makeForm({ ...basePayment }));
    expect((await formService.getPublicForm('pub_test_123456')).payment.purpose).toBe('hold');
  });

  it('getSubmissionStatus: purpose lấy từ snapshot bài nộp, kể cả khi hết hạn; snapshot cũ -> hold', async () => {
    repo.findFormByPublicKey.mockResolvedValue(makeForm({ ...basePayment, purpose: 'hold' }));
    const future = new Date(Date.now() + 600000).toISOString();
    const past = new Date(Date.now() - 600000).toISOString();
    const sub = (snapshot, holdExpiresAt) => ({
      status: 'pending_payment',
      holdExpiresAt,
      paymentAmount: 150000,
      paymentCode: 'ABC',
      paymentSnapshot: snapshot,
    });

    repo.findSubmissionByAccessTokenAndForm.mockResolvedValue(sub({ ...basePayment, purpose: 'order' }, future));
    let st = await formService.getSubmissionStatus('pub_test_123456', 'tok');
    expect(st.paymentPurpose).toBe('order');
    expect(st.payment.purpose).toBe('order');

    repo.findSubmissionByAccessTokenAndForm.mockResolvedValue(sub({ ...basePayment, purpose: 'deposit' }, past));
    st = await formService.getSubmissionStatus('pub_test_123456', 'tok');
    expect(st.holdExpired).toBe(true);
    expect(st.paymentPurpose).toBe('deposit');

    repo.findSubmissionByAccessTokenAndForm.mockResolvedValue(sub({ ...basePayment }, future));
    st = await formService.getSubmissionStatus('pub_test_123456', 'tok');
    expect(st.paymentPurpose).toBe('hold');
  });
});
