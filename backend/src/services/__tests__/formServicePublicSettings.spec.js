import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// getPublicForm whitelist settings thủ công: lời đồng ý tuỳ chỉnh (consentText) phải tới được trang công khai,
// nếu không chữ chủ biểu mẫu nhập trong trình soạn sẽ lưu được mà khách không bao giờ thấy.
const repo = {
  findFormByPublicKey: jest.fn(),
};

jest.unstable_mockModule('../../repositories/form.repository.js', () => ({
  default: repo,
  MAX_FORM_RESPONDENT_EMAILS_PER_24H: 200,
  MAX_CONFIRMATION_EMAILS_PER_RECIPIENT_PER_24H: 3,
}));

const { default: formService } = await import('../form.service.js');

function makeForm(settings, fields) {
  return {
    id: 1,
    workspaceOwnerId: 10,
    publicKey: 'pub_test_123456',
    title: 'Form đăng ký',
    description: null,
    fields: fields || [
      { key: 'f_name', type: 'short_text', label: 'Họ tên', required: true, role: 'name', options: [], placeholder: '', helpText: '' },
    ],
    settings,
    theme: {},
    isPublished: true,
    adminDisabledAt: null,
    ownerEmail: 'owner@example.com',
    ownerActivePlanId: 2,
    ownerSubscriptionExpiresAt: new Date(Date.now() + 86400000).toISOString(),
    ownerGracePeriodDays: 3,
    paymentConfig: null,
    bookingConfig: null,
  };
}

describe('form.service.getPublicForm — settings công khai', () => {
  beforeEach(() => {
    repo.findFormByPublicKey.mockReset();
  });

  it('trả consentText khi chủ biểu mẫu có đặt', async () => {
    repo.findFormByPublicKey.mockResolvedValue(
      makeForm({ consentEnabled: true, consentText: 'Tôi đồng ý nhận ưu đãi từ Công ty A.' })
    );
    const pub = await formService.getPublicForm('pub_test_123456');
    expect(pub.settings.consentEnabled).toBe(true);
    expect(pub.settings.consentText).toBe('Tôi đồng ý nhận ưu đãi từ Công ty A.');
  });

  it('không có consentText thì KHÔNG có khoá (renderer dùng câu mặc định); khoá lạ trong settings không lọt ra', async () => {
    repo.findFormByPublicKey.mockResolvedValue(makeForm({ consentEnabled: true, notifyOwner: true, hack: 1 }));
    const pub = await formService.getPublicForm('pub_test_123456');
    expect(pub.settings).not.toHaveProperty('consentText');
    expect(pub.settings).not.toHaveProperty('notifyOwner');
    expect(pub.settings).not.toHaveProperty('hack');
    expect(Object.keys(pub.settings).sort()).toEqual(['consentEnabled', 'redirectUrl', 'submitButtonText', 'successMessage']);
  });

  it('trường trả nguyên helpText + placeholder để trang công khai hiện chữ hướng dẫn', async () => {
    repo.findFormByPublicKey.mockResolvedValue(
      makeForm({}, [
        { key: 'f_name', type: 'short_text', label: 'Họ tên', required: true, role: 'name', options: [], placeholder: 'Nguyễn Văn A', helpText: 'Ghi đúng như CMND' },
      ])
    );
    const pub = await formService.getPublicForm('pub_test_123456');
    expect(pub.fields[0]).toMatchObject({ placeholder: 'Nguyễn Văn A', helpText: 'Ghi đúng như CMND' });
  });
});
