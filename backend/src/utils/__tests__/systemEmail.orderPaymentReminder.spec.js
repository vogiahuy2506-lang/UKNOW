import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import {
  buildCheckoutReorderUrl,
  buildOrderPaymentReminderEmail,
  getDefaultOrderPaymentReminderEmailTemplate,
} from '../systemEmail.util.js';

describe('buildCheckoutReorderUrl — đích nút "Thanh toán lại"', () => {
  const original = process.env.FRONTEND_URL;
  beforeEach(() => { process.env.FRONTEND_URL = 'https://founderai.biz'; });
  afterEach(() => {
    if (original === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = original;
  });

  it('URL TUYỆT ĐỐI tới /checkout?order=<mã đơn> trên FRONTEND_URL', () => {
    expect(buildCheckoutReorderUrl('1760000000000011')).toBe('https://founderai.biz/checkout?order=1760000000000011');
  });

  it('bỏ dấu / thừa ở cuối gốc URL; baseUrl truyền vào thắng FRONTEND_URL', () => {
    process.env.FRONTEND_URL = 'https://founderai.biz///';
    expect(buildCheckoutReorderUrl(5)).toBe('https://founderai.biz/checkout?order=5');
    expect(buildCheckoutReorderUrl(5, 'https://staging.test/')).toBe('https://staging.test/checkout?order=5');
  });

  it('không có FRONTEND_URL → dự phòng localhost:5174 (cùng dự phòng với buildRenewalUrl)', () => {
    delete process.env.FRONTEND_URL;
    expect(buildCheckoutReorderUrl(5)).toBe('http://localhost:5174/checkout?order=5');
  });

  it('mã đơn được mã hoá URL (không thể chèn thêm tham số)', () => {
    expect(buildCheckoutReorderUrl('1&x=2', 'https://a.test')).toBe('https://a.test/checkout?order=1%26x%3D2');
  });
});

describe('buildOrderPaymentReminderEmail', () => {
  const base = {
    fullName: 'Nguyễn Minh Anh',
    planName: 'Chuyên nghiệp',
    billingPeriodLabel: 'thanh toán theo tháng',
    amount: 1299000,
    orderCode: '1760000000000011',
    payUrl: 'https://founderai.biz/checkout?order=1760000000000011',
  };

  it('mẫu mặc định có đủ 8 biến cho phép và nút "Thanh toán lại" trỏ {{pay_url}}', () => {
    const template = getDefaultOrderPaymentReminderEmailTemplate();
    expect(template.subject).toContain('{{plan_name}}');
    for (const variable of ['user_name', 'plan_name', 'billing_period_label', 'amount', 'order_code', 'pay_url', 'support_email']) {
      expect(template.bodyHtml).toContain(`{{${variable}}}`);
    }
    expect(template.bodyHtml).toMatch(/href="\{\{pay_url\}\}"/);
    expect(template.bodyHtml).toContain('Thanh toán lại');
  });

  it('render từ mẫu mặc định: tiêu đề + nút + giá định dạng vi-VN + mã đơn; không còn dấu {{ }} nào', () => {
    const { subject, html } = buildOrderPaymentReminderEmail(base);
    expect(subject).toContain('Hoàn tất thanh toán gói Chuyên nghiệp');
    expect(html).toContain('href="https://founderai.biz/checkout?order=1760000000000011"');
    expect(html).toContain('Nguyễn Minh Anh');
    expect(html).toContain('1.299.000 đ');
    expect(html).toContain('thanh toán theo tháng');
    expect(html).toContain('1760000000000011');
    expect(html).not.toMatch(/{{\s*[a-z_]+\s*}}/i);
  });

  it('tên khách / tên gói do người dùng đặt bị escape HTML (không chèn được thẻ vào thư)', () => {
    const { html, subject } = buildOrderPaymentReminderEmail({
      ...base,
      fullName: '<script>alert(1)</script>',
      planName: 'Gói "A" & <b>B</b>',
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('Gói &quot;A&quot; &amp; &lt;b&gt;B&lt;/b&gt;');
    // tiêu đề là văn bản thuần: không xuống dòng, không escape
    expect(subject).not.toMatch(/[\r\n]/);
  });

  it('thiếu tên khách → "bạn"; thiếu payUrl → dựng lại từ mã đơn; amount rỗng → để trống, không "NaN"', () => {
    const { html } = buildOrderPaymentReminderEmail({ orderCode: '99', planName: 'X', amount: null });
    expect(html).toContain('bạn');
    expect(html).toContain('/checkout?order=99');
    expect(html).not.toContain('NaN');
  });

  it('mẫu tuỳ chỉnh của super admin thay thế mẫu mặc định (cả tiêu đề lẫn thân thư)', () => {
    const { subject, html } = buildOrderPaymentReminderEmail({
      ...base,
      template: { subject: 'Còn dang dở: {{plan_name}}', bodyHtml: '<p>{{user_name}} — đơn {{order_code}} — {{pay_url}}</p>' },
    });
    expect(subject).toBe('Còn dang dở: Chuyên nghiệp');
    expect(html).toContain('Nguyễn Minh Anh — đơn 1760000000000011 — https://founderai.biz/checkout?order=1760000000000011');
    expect(html).not.toContain('Thanh toán lại →');
  });
});
