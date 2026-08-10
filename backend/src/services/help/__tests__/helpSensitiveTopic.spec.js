import { describe, expect, it } from '@jest/globals';
import { isSensitiveHelpTopic } from '../helpAssistant.service.js';

describe('isSensitiveHelpTopic', () => {
  it('flags billing / login topics', () => {
    expect(isSensitiveHelpTopic('làm sao xem hoá đơn tháng này')).toBe(true);
    expect(isSensitiveHelpTopic('how to get a refund')).toBe(true);
    expect(isSensitiveHelpTopic('quên mật khẩu đăng nhập')).toBe(true);
    expect(isSensitiveHelpTopic('bảng giá gói professional')).toBe(true);
  });

  it('does not flag broad words like giá trị', () => {
    expect(isSensitiveHelpTopic('làm sao tăng giá trị khách hàng')).toBe(false);
    expect(isSensitiveHelpTopic('cách tạo chiến dịch email')).toBe(false);
  });
});
