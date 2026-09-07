import { describe, it, expect } from 'vitest';

/**
 * PLAN sửa merge fa3bc3c3 (2026-09-07), việc 3.
 *
 * founderai-capture.js là script tĩnh nạp thẳng bằng <script> (không qua bundler, không
 * export ESM — nếu thêm `export` sẽ vỡ cú pháp trên trình duyệt vì HTML nạp nó không có
 * type="module"). Để test bằng jsdom mà không phá cú pháp script cổ điển, file gắn
 * `buildFounderaiCapturePayload`/`readFounderaiMarketingConsent` vào
 * `window.__founderaiCaptureTestHooks` (vô hại trên production — chỉ 1 object nhỏ).
 * Import file ở đây chỉ để CHẠY nó (side-effect) — IIFE bên trong tự no-op vì
 * `document.currentScript` là null ngoài ngữ cảnh <script> thật.
 */
import '../../public/founderai-capture.js';

const { buildFounderaiCapturePayload, readFounderaiMarketingConsent } = window.__founderaiCaptureTestHooks;

function makeForm(innerHtml) {
  const form = document.createElement('form');
  form.innerHTML = innerHtml;
  document.body.appendChild(form);
  return form;
}

describe('founderai-capture.js — buildFounderaiCapturePayload', () => {
  it('form đúng hợp đồng → payload name/email/phone/marketingConsent đúng', () => {
    const form = makeForm(`
      <input type="text" name="name" value="Nguyễn Văn A" />
      <input type="email" name="email" value="a@b.com" />
      <input type="tel" name="phone" value="0900000000" />
      <input type="checkbox" name="marketingConsent" checked />
    `);
    const payload = buildFounderaiCapturePayload(form, { slug: 'promo' });
    expect(payload.name).toBe('Nguyễn Văn A');
    expect(payload.email).toBe('a@b.com');
    expect(payload.phone).toBe('0900000000');
    expect(payload.landingPageSlug).toBe('promo');
    expect(payload.marketingConsent).toBe(true);
  });

  it('checkbox marketingConsent KHÔNG tick → false', () => {
    const form = makeForm(`
      <input type="text" name="name" value="A" />
      <input type="email" name="email" value="a@b.com" />
      <input type="checkbox" name="marketingConsent" />
    `);
    const payload = buildFounderaiCapturePayload(form, { slug: 'promo' });
    expect(payload.marketingConsent).toBe(false);
  });

  it('form KHÔNG có checkbox marketingConsent → null (phân biệt với "đã hỏi nhưng từ chối")', () => {
    const form = makeForm(`
      <input type="text" name="name" value="A" />
      <input type="email" name="email" value="a@b.com" />
    `);
    const payload = buildFounderaiCapturePayload(form, { slug: 'promo' });
    expect(payload.marketingConsent).toBeNull();
  });

  it('customFields cf_* gom đúng, checkbox cf_* chưa tick → false', () => {
    const form = makeForm(`
      <input type="text" name="name" value="A" />
      <input type="email" name="email" value="a@b.com" />
      <input type="text" name="cf_company_text" value="Cty X" />
      <input type="checkbox" name="cf_agree_checkbox" />
    `);
    const payload = buildFounderaiCapturePayload(form, { slug: 'promo' });
    expect(payload.customFields).toEqual({ cf_company_text: 'Cty X', cf_agree_checkbox: false });
  });
});

describe('founderai-capture.js — readFounderaiMarketingConsent (đơn vị)', () => {
  it('checkbox checked → true; unchecked → false; không có field → null', () => {
    expect(readFounderaiMarketingConsent(makeForm('<input type="checkbox" name="marketingConsent" checked />'))).toBe(true);
    expect(readFounderaiMarketingConsent(makeForm('<input type="checkbox" name="marketingConsent" />'))).toBe(false);
    expect(readFounderaiMarketingConsent(makeForm('<input type="text" name="name" />'))).toBeNull();
  });
});
