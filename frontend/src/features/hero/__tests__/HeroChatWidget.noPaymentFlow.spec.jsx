/**
 * H1 mục 1 (PLAN_SUA_AI_DOT3, D-02): khung chat tư vấn ở trang chủ KHÔNG còn luồng VietQR.
 *
 * Bản cũ có `detectPaymentIntent` bắt các từ "thanh toán | pay | chuyển khoản | ck | qr | stk | tài khoản | ngân hàng ..." và
 * `return` TRƯỚC khi gửi cho AI, rồi hỏi "Bạn muốn thanh toán bao nhiêu tiền?". Production lại chưa cấu hình tài khoản nhận tiền
 * (GET /api/system/payment-account trả success:false), nên khách hỏi "Đăng ký TÀI KHOẢN ở đâu?" bị bot hỏi tiền, gõ số tiền thì nhận
 * "chưa cấu hình". Spec này gõ đúng các câu đó vào ô nhập thật và khoá: mọi câu đều đi qua AI như câu thường, không một request nào
 * tới /api/system/payment-account, không có câu hỏi số tiền.
 *
 * Mock ở ranh giới `fetch` đúng hình dạng thật của BE ({ success, reply, chatsUsed }).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import HeroChatWidget from '../components/HeroChatWidget';
import { I18nProvider } from '../../../i18n';
import vi18n from '../../../i18n/vi';
import en18n from '../../../i18n/en';

const AI_REPLY = 'Dạ bạn đăng ký tài khoản tại founderai.biz/register ạ.';

let originalScrollIntoView;

const consultationCalls = () => fetch.mock.calls.filter(([url]) => String(url).includes('/api/public/hero/consultation'));
const paymentAccountCalls = () => fetch.mock.calls.filter(([url]) => String(url).includes('/api/system/'));

beforeEach(() => {
  localStorage.clear();
  originalScrollIntoView = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ success: true, reply: AI_REPLY, chatsUsed: 1 }) })));
});

afterEach(() => {
  Element.prototype.scrollIntoView = originalScrollIntoView;
  vi.unstubAllGlobals();
  localStorage.clear();
});

function renderOpened() {
  const view = render(
    <I18nProvider>
      <HeroChatWidget />
    </I18nProvider>
  );
  fireEvent.click(screen.getByLabelText('Open chat'));
  return view;
}

function typeAndSend(text) {
  const input = screen.getByPlaceholderText('Nhập câu hỏi...');
  fireEvent.change(input, { target: { value: text } });
  fireEvent.submit(document.getElementById('hero-chat-form'));
}

describe('HeroChatWidget — câu có chữ "tài khoản" / "thanh toán" đi qua AI như mọi câu', () => {
  it.each([
    'Đăng ký tài khoản ở đâu?',
    'Gói 299k có dùng được nhiều tài khoản Zalo không?',
    'Thanh toán như thế nào?',
    'thanh toán 500k',
    'chuyển khoản 1tr được không',
    'cho mình xin QR',
    'số tài khoản ngân hàng của bên bạn là gì',
    'pay 1000000 vnd',
  ])('"%s": gọi API tư vấn đúng một lần, hiện câu trả lời của AI, không hỏi số tiền, không gọi /api/system', async (question) => {
    const { container } = renderOpened();

    typeAndSend(question);

    expect(await screen.findByText(AI_REPLY)).toBeTruthy();
    expect(consultationCalls()).toHaveLength(1);
    const [url, init] = consultationCalls()[0];
    expect(String(url)).toBe('/api/public/hero/consultation');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body).message).toBe(question);
    // Câu cũ của luồng VietQR không được hiện, dù chỉ một chữ.
    expect(container.textContent).not.toContain('Bạn muốn thanh toán bao nhiêu tiền');
    expect(container.textContent).not.toContain('Đang tạo mã QR');
    expect(container.textContent).not.toContain('chưa hiểu số tiền');
    expect(container.textContent).not.toContain('Thông tin thanh toán');
    expect(paymentAccountCalls()).toHaveLength(0);
  });

  it('gõ tiếp một con số sau câu hỏi thanh toán: vẫn là câu thường gửi cho AI (không còn bước "nhập số tiền")', async () => {
    renderOpened();

    typeAndSend('thanh toán');
    await waitFor(() => expect(consultationCalls()).toHaveLength(1));
    await screen.findByText(AI_REPLY);
    typeAndSend('100.000 đồng');

    await waitFor(() => expect(consultationCalls()).toHaveLength(2));
    expect(JSON.parse(consultationCalls()[1][1].body).message).toBe('100.000 đồng');
    expect(paymentAccountCalls()).toHaveLength(0);
  });
});

describe('luồng VietQR của khung chat đã gỡ hẳn khỏi mã nguồn và từ điển', () => {
  const pathOf = (rel) => fileURLToPath(new URL(rel, import.meta.url));

  it('các tệp của luồng (card QR, API client) không còn', () => {
    expect(existsSync(pathOf('../components/VietQrMessage.jsx'))).toBe(false);
    expect(existsSync(pathOf('../services/paymentAccountApi.js'))).toBe(false);
  });

  it('HeroChatWidget không còn tham chiếu tới luồng thanh toán', () => {
    const src = readFileSync(pathOf('../components/HeroChatWidget.jsx'), 'utf8');
    expect(src).not.toMatch(/detectPaymentIntent|paymentFlow|runPaymentFlow|parseAmountFromText|generatePaymentQr|VietQrMessage|qr-card|vietqr/i);
    expect(src).not.toContain('/api/system/');
  });

  it.each([['vi', vi18n], ['en', en18n]])('từ điển %s: heroConsultation không còn khoá payment*', (_locale, dict) => {
    const leftovers = Object.keys(dict.heroPage.heroConsultation).filter((k) => /^payment/i.test(k));
    expect(leftovers).toEqual([]);
  });
});
