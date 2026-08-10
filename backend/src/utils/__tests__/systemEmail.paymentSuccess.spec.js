import { describe, expect, it } from '@jest/globals';
import { buildPaymentSuccessEmail } from '../systemEmail.util.js';

describe('buildPaymentSuccessEmail invoice CTA', () => {
  const base = {
    fullName: 'A',
    email: 'a@test.com',
    planName: 'Starter',
    amount: 100000,
    billingPeriod: 'monthly',
    orderCode: 123,
    paymentMethod: 'payos',
    expiresAt: new Date('2026-12-01'),
  };

  it('omits CTA when invoiceUrl missing', () => {
    const { html } = buildPaymentSuccessEmail(base);
    expect(html).not.toContain('Xem hóa đơn');
    expect(html).not.toContain('href=""');
  });

  it('includes CTA when invoiceUrl set', () => {
    const { html } = buildPaymentSuccessEmail({
      ...base,
      invoiceUrl: 'https://example.com/invoices/123',
    });
    expect(html).toContain('https://example.com/invoices/123');
    expect(html).toContain('Xem hóa đơn');
  });
});
