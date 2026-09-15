import { describe, it, expect } from '@jest/globals';
import { buildFormUnsubscribeFooterHtml } from '../formUnsubscribeFooter.util.js';

/**
 * PLAN_FORM_DAT_LICH_THANH_TOAN_2026-09-13.md, PR-7b mục 3 — chân thư "Rút lại đồng ý" dùng
 * chung cho mọi thư gửi người nộp Biểu mẫu.
 */
describe('formUnsubscribeFooter.util — buildFormUnsubscribeFooterHtml', () => {
  it('marketingConsent=true, chưa rút, có unsubscribeToken -> có link /api/public/forms/unsubscribe/<token>', () => {
    const html = buildFormUnsubscribeFooterHtml({
      marketingConsent: true,
      consentWithdrawnAt: null,
      unsubscribeToken: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    });
    expect(html).toContain('/api/public/forms/unsubscribe/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
    expect(html).toContain('Rút lại đồng ý');
    expect(html).toContain('Withdraw consent');
  });

  it('marketingConsent=false -> trả chuỗi rỗng', () => {
    expect(
      buildFormUnsubscribeFooterHtml({
        marketingConsent: false,
        consentWithdrawnAt: null,
        unsubscribeToken: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      })
    ).toBe('');
  });

  it('marketingConsent=null (chưa từng hỏi) -> trả chuỗi rỗng', () => {
    expect(
      buildFormUnsubscribeFooterHtml({
        marketingConsent: null,
        consentWithdrawnAt: null,
        unsubscribeToken: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      })
    ).toBe('');
  });

  it('marketingConsent=true NHƯNG đã có consentWithdrawnAt -> trả chuỗi rỗng (đã rút, không chèn lại)', () => {
    expect(
      buildFormUnsubscribeFooterHtml({
        marketingConsent: true,
        consentWithdrawnAt: '2026-09-15T10:00:00.000Z',
        unsubscribeToken: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      })
    ).toBe('');
  });

  it('marketingConsent=true nhưng thiếu unsubscribeToken -> trả chuỗi rỗng (an toàn, không link vỡ)', () => {
    expect(
      buildFormUnsubscribeFooterHtml({
        marketingConsent: true,
        consentWithdrawnAt: null,
        unsubscribeToken: null,
      })
    ).toBe('');
  });

  it('token có ký tự cần escape (giả lập) -> HTML trong <a href> đã escape', () => {
    const html = buildFormUnsubscribeFooterHtml({
      marketingConsent: true,
      consentWithdrawnAt: null,
      unsubscribeToken: '"><script>alert(1)</script>',
    });
    expect(html).not.toContain('<script>alert(1)</script>');
  });
});
