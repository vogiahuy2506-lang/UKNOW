import { describe, it, expect, jest } from '@jest/globals';

let sendEmailImpl = jest.fn();

jest.unstable_mockModule('../../utils/systemEmail.util.js', () => ({
  sendSystemEmail: (...args) => sendEmailImpl(...args),
  SENDER_NAME: 'UKNOW Campaign',
}));

const mockForm = {
  id: 1,
  workspaceOwnerId: 10,
  publicKey: 'pub_test_123456',
  title: 'Form Test SMTP',
  fields: [
    {
      key: 'f_name',
      type: 'short_text',
      label: 'Họ tên',
      required: true,
      role: 'name',
      options: [],
    },
  ],
  settings: {
    notifyOwner: true,
  },
  isPublished: true,
  adminDisabledAt: null,
  ownerEmail: 'owner@example.com',
  ownerActivePlanId: 2,
  ownerSubscriptionExpiresAt: new Date(Date.now() + 86400000).toISOString(),
  ownerGracePeriodDays: 3,
};

const mockCreatedSubmission = {
  id: 99,
  accessToken: 'access_token_123',
};

jest.unstable_mockModule('../../repositories/form.repository.js', () => ({
  default: {
    findFormByPublicKey: jest.fn().mockResolvedValue(mockForm),
    createSubmission: jest.fn().mockResolvedValue(mockCreatedSubmission),
  },
  // form.service.js import 2 hằng trần thư (PR-2a review 14/09) trực tiếp từ module này — phải
  // khai lại ở mock, không dùng tới trong test này (form không bật đặt lịch nên đường gửi thư
  // xác nhận có kiểm trần không chạy tới), nhưng thiếu named export sẽ vỡ import.
  MAX_FORM_RESPONDENT_EMAILS_PER_24H: 200,
  MAX_CONFIRMATION_EMAILS_PER_RECIPIENT_PER_24H: 3,
}));

const { default: formService } = await import('../form.service.js');

describe('form.service - fire-and-forget email & SMTP error resilience', () => {
  it('vẫn hoàn tất bài nộp thành công (201) khi hàm sendSystemEmail ném lỗi', async () => {
    sendEmailImpl = jest.fn().mockRejectedValue(new Error('SMTP connection failed: 554 Transaction Failed'));

    const result = await formService.submitPublicForm(
      'pub_test_123456',
      {
        answers: { f_name: 'Khách hàng test' },
      },
      '127.0.0.1'
    );

    expect(sendEmailImpl).toHaveBeenCalledTimes(1);
    expect(result).toBeDefined();
    expect(result.isBotTrap).toBe(false);
    expect(result.accessToken).toBe('access_token_123');
  });

  it('submitPublicForm trả về ngay lập tức khi hàm gửi thư trả promise không bao giờ resolve (fire-and-forget)', async () => {
    sendEmailImpl = jest.fn().mockReturnValue(new Promise(() => {}));

    const result = await Promise.race([
      formService.submitPublicForm(
        'pub_test_123456',
        {
          answers: { f_name: 'Khách hàng test 2' },
        },
        '127.0.0.1'
      ),
      new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT_EXCEEDED')), 300)),
    ]);

    expect(sendEmailImpl).toHaveBeenCalledTimes(1);
    expect(result).toBeDefined();
    expect(result.accessToken).toBe('access_token_123');
  });
});
