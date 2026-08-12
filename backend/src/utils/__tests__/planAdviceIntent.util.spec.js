import { describe, expect, it } from '@jest/globals';
import { isPlanAdviceQuestion } from '../planAdviceIntent.util.js';

describe('isPlanAdviceQuestion', () => {
  it.each([
    'Gói nào phù hợp cho shop nhỏ?',
    'So sánh Starter và Basic',
    'Professional giá bao nhiêu một tháng?',
    'Tôi cần 5 landing page và 2 tài khoản Zalo, nên chọn gói nào?',
    'Which plan should I choose for 10,000 emails per month?',
    'Should I upgrade from Starter to Basic?',
    'Bảng giá hiện có những gói nào?',
    'Tôi đang dùng gói nào?',
    'Tôi đang ở gói nào?',
    'Gói hiện tại của tôi là gì?',
    'What plan am I on?',
    'which plan supports 5 landing pages',
    'bảng giá có những tính năng gì',
    'giá gói professional',
    'I do not want to upgrade, but compare Starter and Basic',
    'Tôi không muốn nâng gói, nhưng hãy so sánh Starter và Basic',
    'Which billing plan should I choose?',
    'What subscription am I currently on?',
  ])('positive: %s', (q) => {
    expect(isPlanAdviceQuestion(q)).toBe(true);
  });

  it.each([
    'Lập plan campaign 5 ngày',
    'Create a campaign plan',
    'Write an email about our pricing plans',
    'Write email giới thiệu bảng giá',
    'Payment failed',
    'How do I get a refund?',
    'Tôi không muốn nâng gói',
    'Tạo landing cho gói Starter',
    'Create a Zalo campaign for Payment Pro',
    'tạo chiến dịch email Starter Pack',
    'thanh toán gói được không',
    'forgot my password',
    'mua thêm 12 tài khoản Zalo giá bao nhiêu',
    'ok',
    'plan',
  ])('negative: %s', (q) => {
    expect(isPlanAdviceQuestion(q)).toBe(false);
  });

  it('content-creation guard runs before plan-name positives', () => {
    expect(isPlanAdviceQuestion('viết email về gói Professional')).toBe(false);
    expect(isPlanAdviceQuestion('draft landing copy about Basic plan pricing')).toBe(false);
    expect(isPlanAdviceQuestion('Professional giá bao nhiêu')).toBe(true);
  });

  it('upgrade negation only drops its clause, not contrast advice', () => {
    expect(isPlanAdviceQuestion('Tôi không muốn nâng gói')).toBe(false);
    expect(isPlanAdviceQuestion('I do not want to upgrade')).toBe(false);
    expect(isPlanAdviceQuestion(
      'I do not want to upgrade, but compare Starter and Basic',
    )).toBe(true);
  });
});
