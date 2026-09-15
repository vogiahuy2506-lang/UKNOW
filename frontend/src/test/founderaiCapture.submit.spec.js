import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * Chạy NGUYÊN founderai-capture.js (cả IIFE gắn submit) trên DOM giống trang landing thật.
 *
 * Lỗi 15/09 (sếp thử https://checkform.founderai.biz/ — "không bấm được nút đăng ký"):
 * `771e8b7a` coi `.founderai-capture-success` là "UI thành công riêng của trang" nên sau khi
 * POST /public/leads trả 201 script KHÔNG hiện hộp thành công, trong khi nút gửi đã bị khoá
 * ở đầu handleSubmit → khách bấm xong không thấy gì, bấm lại không được. Hộp
 * `.founderai-capture-success` chính là hợp đồng prompt AI dặn đặt cạnh form
 * (aiLandingPage.service.js, mục 6 formRule), nên MỌI landing AI tạo từ 08/09 đều dính.
 */
const CAPTURE_SRC = fs.readFileSync(
  path.resolve(__dirname, '../../public/founderai-capture.js'),
  'utf8'
);

function mountLanding(bodyHtml) {
  document.body.innerHTML = bodyHtml;
  const sc = document.createElement('script');
  sc.setAttribute('src', 'https://founderai.biz/founderai-capture.js');
  sc.setAttribute('data-api-base', 'https://founderai.biz/api');
  sc.setAttribute('data-slug', 'checkform');
  document.body.appendChild(sc);
  // jsdom không tải src ngoài — chạy mã nguồn trực tiếp; IIFE tìm thẻ script theo src ở trên.
  new Function(CAPTURE_SRC)();
  return document.querySelector('form');
}

function fillAndSubmit(form) {
  form.querySelector('[name="name"]').value = 'Nguyễn Văn A';
  form.querySelector('[name="email"]').value = 'a@example.com';
  form.querySelector('[name="phone"]').value = '0912345678';
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
}

function mockFetchResponse(status, body) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
  });
  globalThis.fetch = fetchMock;
  return fetchMock;
}

const FORM_FIELDS = `
  <input type="text" name="name" required />
  <input type="email" name="email" required />
  <input type="tel" name="phone" />
  <label><input type="checkbox" name="marketingConsent" /> Đồng ý</label>
  <button type="submit">Đăng ký</button>
`;

describe('founderai-capture.js — gửi form trên trang landing', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('khuôn prompt AI (hộp .founderai-capture-success cạnh form) → gửi xong HIỆN hộp thành công và xoá form', async () => {
    const fetchMock = mockFetchResponse(201, { success: true, data: { id: 1 } });
    const form = mountLanding(`
      <section>
        <form data-founderai-capture>${FORM_FIELDS}</form>
        <div class="founderai-capture-success" style="display:none">Đăng ký thành công</div>
        <div class="founderai-capture-error" style="display:none"></div>
      </section>
    `);
    const success = document.querySelector('.founderai-capture-success');

    fillAndSubmit(form);

    await vi.waitFor(() => expect(success.style.display).toBe('block'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://founderai.biz/api/public/leads');
    expect(JSON.parse(init.body)).toMatchObject({
      name: 'Nguyễn Văn A',
      email: 'a@example.com',
      phone: '0912345678',
      landingPageSlug: 'checkform',
      marketingConsent: false,
    });
    expect(form.querySelector('[name="email"]').value).toBe('');
  });

  it('trang checkform của sếp (hộp thành công dùng class Tailwind "hidden", không style inline) → vẫn hiện', async () => {
    mockFetchResponse(201, { success: true, data: { id: 2 } });
    const form = mountLanding(`
      <div class="p-6">
        <form data-founderai-capture class="space-y-6">${FORM_FIELDS}</form>
        <div class="founderai-capture-success hidden mt-6">Đăng ký lịch hẹn thành công!</div>
        <div class="founderai-capture-error hidden mt-6">Đã có lỗi xảy ra.</div>
      </div>
    `);
    const success = document.querySelector('.founderai-capture-success');
    const error = document.querySelector('.founderai-capture-error');

    fillAndSubmit(form);

    // style inline display:block thắng class .hidden (display:none) của Tailwind trên trình duyệt thật.
    await vi.waitFor(() => expect(success.style.display).toBe('block'));
    expect(error.style.display).toBe('none');
  });

  it('trang có UI thành công riêng id="successMessage" → script không đụng tới (giữ ý định của 771e8b7a)', async () => {
    const fetchMock = mockFetchResponse(201, { success: true, data: { id: 3 } });
    const form = mountLanding(`
      <div>
        <form data-founderai-capture>${FORM_FIELDS}</form>
        <div id="successMessage" class="hidden">Cảm ơn!</div>
      </div>
    `);
    const custom = document.getElementById('successMessage');

    fillAndSubmit(form);

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(custom.classList.contains('hidden')).toBe(true);
    expect(form.querySelector('[name="email"]').value).toBe('a@example.com');
  });

  it('backend từ chối (400) → hiện đúng thông báo lỗi và mở lại nút gửi', async () => {
    mockFetchResponse(400, { success: false, message: 'Số điện thoại không hợp lệ' });
    const form = mountLanding(`
      <section>
        <form data-founderai-capture>${FORM_FIELDS}</form>
        <div class="founderai-capture-success" style="display:none">Đăng ký thành công</div>
        <div class="founderai-capture-error" style="display:none"></div>
      </section>
    `);
    const error = document.querySelector('.founderai-capture-error');
    const button = form.querySelector('button[type="submit"]');

    fillAndSubmit(form);

    await vi.waitFor(() => expect(error.style.display).toBe('block'));
    expect(error.textContent).toBe('Số điện thoại không hợp lệ');
    expect(button.disabled).toBe(false);
    expect(document.querySelector('.founderai-capture-success').style.display).toBe('none');
  });
});
