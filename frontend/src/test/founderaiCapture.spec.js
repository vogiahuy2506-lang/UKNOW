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

const { buildFounderaiCapturePayload, readFounderaiMarketingConsent, pickAutoCaptureForm, inferAutoName, autoMapFormInputsByIdOrLabel } = window.__founderaiCaptureTestHooks;

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

/**
 * PLAN_FORM_LANDING_AI_GIU_FORM_2026-09-06.md, PR-2a việc 2 (Review 08/09, lỗ mới #2).
 *
 * Trước bản vá này, auto mode (không có <form data-founderai-capture> tường minh) bắt
 * NGUYÊN VĂN form đầu tiên trong trang bất kể là gì (`document.querySelector('form')`).
 * 15/22 trang production đo được 08/09 có form đầu tiên KHÔNG phải form đăng ký (tìm kiếm,
 * khảo sát...) — auto mode chiếm submit của form đó và chặn khách với lỗi "Vui lòng nhập
 * email hợp lệ" dù khách chưa từng thấy ô email nào. pickAutoCaptureForm(forms) sửa bằng
 * cách chỉ chọn form ĐẦU TIÊN có input name thuộc {email, phone, tel, phoneNumber} — đúng
 * bộ tên buildFounderaiCapturePayload đọc ra payload.email/phone ở trên.
 */
describe('founderai-capture.js — pickAutoCaptureForm (auto mode chỉ bắt form CÓ email/phone)', () => {
  it('form tìm kiếm đứng trước form đăng ký → auto mode chọn form đăng ký, không phải form tìm kiếm', () => {
    const searchForm = makeForm('<input type="text" name="q" placeholder="Tìm kiếm sản phẩm" />');
    const registrationForm = makeForm(`
      <input type="text" name="name" />
      <input type="email" name="email" />
      <input type="tel" name="phone" />
    `);

    const picked = pickAutoCaptureForm([searchForm, registrationForm]);
    expect(picked).toBe(registrationForm);
  });

  it('không form nào có email/phone/tel/phoneNumber → trả về null (findForms() rỗng → bind() không gắn submit handler → submit native của trang không bị preventDefault)', () => {
    const searchForm = makeForm('<input type="text" name="q" />');
    const surveyForm = makeForm('<input type="text" name="rating" /><input type="text" name="comment" />');

    const picked = pickAutoCaptureForm([searchForm, surveyForm]);
    expect(picked).toBeNull();
    // Hệ quả trực tiếp đọc từ founderai-capture.js: bind() có `if (forms.length === 0) { ...; return; }`
    // trước khi gọi form.addEventListener('submit', handleSubmit, true) — không có form nào được
    // chọn thì không handler nào được gắn, nên submit gốc của trình duyệt không hề bị preventDefault.
  });

  it('form data-founderai-capture tường minh vẫn thắng auto mode dù form đó không có email/phone', () => {
    document.body.innerHTML = '';
    // Đứng TRƯỚC trong DOM và CÓ email — nếu đi qua pickAutoCaptureForm sẽ được chọn.
    const autoEligibleForm = makeForm('<input type="email" name="email" />');
    const explicitForm = document.createElement('form');
    explicitForm.setAttribute('data-founderai-capture', '');
    explicitForm.innerHTML = '<input type="text" name="q" />'; // cố tình không có email/phone
    document.body.appendChild(explicitForm);

    // Mô phỏng đúng 2 bước của findForms() (founderai-capture.js): query form[data-founderai-capture]
    // trước — có kết quả thì dùng NGAY, không bao giờ gọi tới pickAutoCaptureForm.
    const explicit = document.querySelectorAll('form[data-founderai-capture]');
    const picked = explicit.length > 0
      ? Array.prototype.slice.call(explicit)
      : (() => {
          const p = pickAutoCaptureForm(document.querySelectorAll('form'));
          return p ? [p] : [];
        })();

    expect(picked).toEqual([explicitForm]);
    expect(picked).not.toContain(autoEligibleForm);
  });
});

/**
 * PLAN_FORM_LANDING_AI_GIU_FORM_2026-09-06.md, CẬP NHẬT 08/09 17:30 — Lỗ 4 + Lỗ 5.
 *
 * Lỗ 4: inferAutoName duyệt khoá theo thứ tự name → email → phone, so khớp bằng indexOf
 * tự do — alias 'ho' (name) là substring của "phone"/"telephone", alias 'ten' (name) là
 * substring của "content"/"attendees". Form có id="phone" không có name bị tự gán
 * name="name" thay vì name="phone" → mất số điện thoại trong payload.
 * Lỗ 5: id không khớp gì tự sinh name="cf_<id>" (vd id="company" → "cf_company").
 * buildTrustedCustomFieldsSnapshot (backend) từ chối MỌI khoá cf_* không có trong cấu hình
 * form của trang → 400 cho CẢ lead, không riêng field lạ đó.
 */
describe('founderai-capture.js — inferAutoName (Lỗ 4: substring sai; Lỗ 5: tự sinh cf_<id>)', () => {
  function makeInputWithId(id) {
    const form = document.createElement('form');
    document.body.appendChild(form);
    const input = document.createElement('input');
    input.type = 'text';
    input.id = id;
    form.appendChild(input);
    return { form, input };
  }

  it.each([
    ['phone', 'phone'],
    ['telephone', 'phone'],
    ['email', 'email'],
    ['sdt', 'phone'],
    ['fullName', 'name'],
    ['content', null],
    ['company', null],
  ])('id="%s" → suy ra %s', (id, expected) => {
    const { form, input } = makeInputWithId(id);
    expect(inferAutoName(input, form)).toBe(expected);
  });
});
