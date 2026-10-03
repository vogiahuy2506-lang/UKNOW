/**
 * Chip câu hỏi nhanh của widget tư vấn trang chủ: chip hỏi SỰ KIỆN không còn hiện câu trả lời ghi cứng — bấm chip = gửi câu hỏi qua
 * ĐÚNG đường gửi tin AI của widget (POST /api/public/hero/consultation). Mock ở ranh giới `fetch` đúng hình dạng thật của BE
 * ({ success, reply, chatsUsed } / { success:false, code, message }).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import HeroChatWidget from '../components/HeroChatWidget';
import { I18nProvider } from '../../../i18n';

vi.mock('../services/paymentAccountApi', () => ({ generatePaymentQr: vi.fn() }));

const AI_REPLY = 'Dạ gói Starter hiện có giá theo bảng giá trên hệ thống ạ.';

let originalScrollIntoView;
let consultationResponse;

const consultationCalls = () => fetch.mock.calls.filter(([url]) => String(url).includes('/api/public/hero/consultation'));

beforeEach(() => {
  localStorage.clear();
  originalScrollIntoView = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = vi.fn();
  consultationResponse = { success: true, reply: AI_REPLY, chatsUsed: 1 };
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => consultationResponse })));
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

describe('HeroChatWidget — chip hỏi sự kiện đi qua AI', () => {
  it('bấm chip "Giá bao nhiêu?": gọi API chat với đúng câu hỏi + visitorId, hiện câu trả lời của AI, KHÔNG hiện chuỗi giá ghi cứng', async () => {
    const { container } = renderOpened();

    fireEvent.click(screen.getByText('Giá bao nhiêu?'));

    expect(await screen.findByText(AI_REPLY)).toBeTruthy();
    expect(consultationCalls()).toHaveLength(1);
    const [url, init] = consultationCalls()[0];
    expect(String(url)).toBe('/api/public/hero/consultation');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body);
    expect(body.message).toBe('Giá bao nhiêu?');
    expect(typeof body.visitorId).toBe('string');
    expect(body.visitorId.length).toBeGreaterThan(3);
    // Câu hỏi của khách hiện ngay trong khung chat như khi tự gõ.
    expect(container.textContent).toContain('Giá bao nhiêu?');
    // Không còn bất kỳ chuỗi giá/gói ghi cứng nào của bản cũ.
    for (const stale of ['990K', '2.490K', '3 gói dịch vụ', 'Starter** - ', '7 ngày miễn phí', 'A/B testing', 'CRM nâng cao', '24/7']) {
      expect(container.textContent).not.toContain(stale);
    }
  });

  it.each([
    ['start', 'Gói nào cho người mới?'],
    ['landing', 'Landing Page là gì?'],
    ['email', 'Email marketing là gì?'],
    ['zalo', 'Tự động hóa Zalo?'],
    ['trial', 'Có dùng thử không?'],
    ['compare', 'So sánh với đối thủ?'],
    ['support', 'Hỗ trợ tiếng Việt?'],
  ])('chip %s gửi nguyên văn câu hỏi "%s" cho AI', async (_id, text) => {
    renderOpened();

    fireEvent.click(screen.getByText(text));

    await waitFor(() => expect(consultationCalls()).toHaveLength(1));
    expect(JSON.parse(consultationCalls()[0][1].body).message).toBe(text);
    expect(await screen.findByText(AI_REPLY)).toBeTruthy();
  });

  it('ngôn ngữ trang tiếng Anh: chip "How much is it?" gửi đúng câu tiếng Anh cho AI', async () => {
    localStorage.setItem('uknow_locale', 'en');
    renderOpened();

    fireEvent.click(screen.getByText('How much is it?'));

    await waitFor(() => expect(consultationCalls()).toHaveLength(1));
    expect(JSON.parse(consultationCalls()[0][1].body).message).toBe('How much is it?');
  });

  it('chip đi đúng đường gửi tin: BUSY (trần ngân sách ngày) mở form để lại thông tin như khi tự gõ', async () => {
    consultationResponse = { success: false, code: 'BUSY', message: 'Tư vấn viên đang bận' };
    renderOpened();

    fireEvent.click(screen.getByText('Giá bao nhiêu?'));

    expect(await screen.findByPlaceholderText('Số điện thoại')).toBeTruthy();
    expect(consultationCalls()).toHaveLength(1);
  });

  it('hết lượt miễn phí (QUOTA_EXCEEDED) khi bấm chip: hiện form hết lượt; bấm thêm chip KHÔNG gọi API nữa', async () => {
    consultationResponse = { success: false, code: 'QUOTA_EXCEEDED', message: 'Ban da het luot chat mien phi' };
    const { container } = renderOpened();

    fireEvent.click(screen.getByText('Giá bao nhiêu?'));
    await screen.findByPlaceholderText('Số điện thoại');
    expect(container.textContent).toContain('Hết lượt tư vấn');

    // Gợi ý đã ẩn sau lần gửi đầu; ô nhập bị khoá — không có đường nào gọi API thêm.
    expect(consultationCalls()).toHaveLength(1);
    expect(screen.queryByText('Có dùng thử không?')).toBeNull();
  });
});

describe('HeroChatWidget — chip minh hoạ chiến dịch vẫn là câu ghi sẵn (không gọi AI)', () => {
  it('bấm "Xem chiến dịch chạy thế nào?": hiện câu ghi sẵn + mở bản mô phỏng, KHÔNG gọi API chat, và câu không còn node không có thật', async () => {
    const opened = vi.fn();
    window.addEventListener('open-campaign-flow', opened);
    const { container } = renderOpened();

    fireEvent.click(screen.getByText('🎬 Xem chiến dịch chạy thế nào?'));

    expect(await screen.findByText(/Kích hoạt thủ công/)).toBeTruthy();
    await waitFor(() => expect(opened).toHaveBeenCalledTimes(1));
    expect(opened.mock.calls[0][0].detail).toEqual({ flowKey: 'email' });
    expect(consultationCalls()).toHaveLength(0);
    for (const gone of ['Kiểm tra đã mở', 'Lọc điều kiện', 'Chờ 24 giờ', 'CRM']) {
      expect(container.textContent).not.toContain(gone);
    }
    window.removeEventListener('open-campaign-flow', opened);
  });
});
