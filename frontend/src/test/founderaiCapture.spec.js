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

const { buildFounderaiCapturePayload, readFounderaiMarketingConsent, autoMapFormInputsByIdOrLabel } = window.__founderaiCaptureTestHooks;

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

describe('founderai-capture.js — autoMapFormInputsByIdOrLabel', () => {
  it('id="fullName" → name="name" (case nhập của workshop L\'Atelier Floral)', () => {
    const form = makeForm(`
      <input type="text" id="fullName" />
      <input type="tel" id="phone" />
      <input type="email" id="email" />
    `);
    autoMapFormInputsByIdOrLabel(form);
    expect(form.querySelector('#fullName').name).toBe('name');
    expect(form.querySelector('#phone').name).toBe('phone');
    expect(form.querySelector('#email').name).toBe('email');
  });

  it('id="phone" (chuẩn hóa → match alias phone) → name="phone"', () => {
    const form = makeForm('<input type="tel" id="phone" value="0901234567" />');
    autoMapFormInputsByIdOrLabel(form);
    expect(form.querySelector('#phone').name).toBe('phone');
  });

  it('blacklist chặn id="submit", id="workshopForm", id="sessionDate"', () => {
    const form = makeForm(`
      <input type="text" id="submit" />
      <input type="text" id="workshopForm" />
      <input type="text" id="sessionDate" />
      <input type="text" id="submitBtn" />
    `);
    autoMapFormInputsByIdOrLabel(form);
    expect(form.querySelector('#submit').name).toBe('');
    expect(form.querySelector('#workshopForm').name).toBe('');
    expect(form.querySelector('#sessionDate').name).toBe('');
    expect(form.querySelector('#submitBtn').name).toBe('');
  });

  it('id chưa khai báo (vd: company, message) → auto gắn name="cf_*"', () => {
    const form = makeForm(`
      <input type="text" id="company" />
      <textarea id="notes"></textarea>
    `);
    autoMapFormInputsByIdOrLabel(form);
    expect(form.querySelector('#company').name).toBe('cf_company');
    // notes trùng alias 'notes' → name="notes" (không phải cf_notes vì match alias trước)
    expect(form.querySelector('#notes').name).toBe('notes');
  });

  it('input đã có name → KHÔNG bị đè', () => {
    const form = makeForm('<input type="text" id="fullName" name="customName" />');
    autoMapFormInputsByIdOrLabel(form);
    expect(form.querySelector('#fullName').name).toBe('customName');
  });
});
