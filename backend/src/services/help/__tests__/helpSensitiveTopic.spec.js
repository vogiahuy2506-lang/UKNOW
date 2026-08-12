import { describe, expect, it } from '@jest/globals';
import {
  isSensitiveHelpQuestion,
  isSensitiveHelpTopic,
} from '../helpAssistant.service.js';

describe('isSensitiveHelpQuestion', () => {
  it('flags billing / login topics (VI + EN)', () => {
    expect(isSensitiveHelpQuestion('làm sao xem hoá đơn tháng này')).toBe(true);
    expect(isSensitiveHelpQuestion('how to get a refund')).toBe(true);
    expect(isSensitiveHelpQuestion('quên mật khẩu đăng nhập')).toBe(true);
    expect(isSensitiveHelpQuestion('bảng giá gói professional')).toBe(true);
    expect(isSensitiveHelpQuestion('payment failed')).toBe(true);
    expect(isSensitiveHelpQuestion('how do I upgrade my plan')).toBe(true);
    expect(isSensitiveHelpQuestion('forgot my password')).toBe(true);
    expect(isSensitiveHelpQuestion('cannot sign in')).toBe(true);
    expect(isSensitiveHelpQuestion('VAT invoice')).toBe(true);
  });

  it('does not flag content-creation with payment/billing keywords', () => {
    expect(isSensitiveHelpQuestion('write a payment reminder email')).toBe(false);
    expect(isSensitiveHelpQuestion('write a billing notice')).toBe(false);
    expect(isSensitiveHelpQuestion('draft an invoice email')).toBe(false);
    expect(isSensitiveHelpQuestion('upgrade this email template')).toBe(false);
    expect(isSensitiveHelpQuestion('viết email nhắc thanh toán')).toBe(false);
    expect(isSensitiveHelpQuestion('create a campaign plan')).toBe(false);
    expect(isSensitiveHelpQuestion('cách tạo chiến dịch email')).toBe(false);
    expect(isSensitiveHelpQuestion('làm sao tăng giá trị khách hàng')).toBe(false);
    expect(isSensitiveHelpQuestion('Create a Zalo campaign for Payment Pro')).toBe(false);
    expect(isSensitiveHelpQuestion('Tạo chiến dịch Zalo cho khóa Payment Pro')).toBe(false);
    expect(isSensitiveHelpQuestion('Create a landing page for Billing Academy')).toBe(false);
    expect(isSensitiveHelpQuestion('Draft landing copy about VAT services')).toBe(false);
  });

  it('account issues win over content-creation wording', () => {
    expect(isSensitiveHelpQuestion('payment failed — write me a note')).toBe(true);
    expect(isSensitiveHelpQuestion('cannot log in to draft emails')).toBe(true);
  });

  it('alias isSensitiveHelpTopic delegates to the new helper', () => {
    expect(isSensitiveHelpTopic('payment failed')).toBe(true);
    expect(isSensitiveHelpTopic('write a payment reminder email')).toBe(false);
  });
});
