/**
 * G3b mục 4: trần ngân sách ngày của trợ lý tư vấn trang chủ (HERO_CONSULTATION_DAILY_CAP).
 * BE trả HTTP 200 + { success: false, code: 'BUSY', message }. Bản cũ rơi vào nhánh lỗi chung: chỉ hiện câu "để lại số điện thoại
 * hoặc email" mà KHÔNG có chỗ nào để lại. Nay: hiện câu tiếng Việt (theo ngôn ngữ trang) và MỞ form liên hệ (dùng lại form của
 * QUOTA_EXCEEDED); các mã lỗi khác giữ nguyên hành vi.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import HeroChatWidget from '../components/HeroChatWidget';
import { I18nProvider } from '../../../i18n';
import { loadEnglishDictionary } from '../../../i18n/englishDictionary';

const BUSY_BODY = {
  success: false,
  code: 'BUSY',
  // Câu BE (HERO_BUSY_MESSAGE) — widget hiện câu i18n theo ngôn ngữ trang, không hiện nguyên văn câu này.
  message: 'Tư vấn viên đang bận, bạn vui lòng để lại số điện thoại hoặc email, đội ngũ Founder AI sẽ liên hệ lại với bạn sớm nhất nhé.',
};

let originalScrollIntoView;
let consultationResponse;
let contactResponse;

const mockFetch = () => vi.fn(async (url) => {
  if (String(url).includes('/api/contact')) return { ok: true, json: async () => contactResponse };
  return { ok: true, json: async () => consultationResponse };
});

beforeEach(() => {
  localStorage.clear();
  originalScrollIntoView = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = vi.fn();
  consultationResponse = BUSY_BODY;
  contactResponse = { success: true };
  vi.stubGlobal('fetch', mockFetch());
});

afterEach(() => {
  Element.prototype.scrollIntoView = originalScrollIntoView;
  vi.unstubAllGlobals();
  localStorage.clear();
});

function renderWidget() {
  const view = render(
    <I18nProvider>
      <HeroChatWidget />
    </I18nProvider>
  );
  fireEvent.click(screen.getByLabelText('Open chat'));
  return view;
}

async function sendQuestion(container, text = 'Gói nào hợp với shop mình?') {
  const form = container.querySelector('#hero-chat-form');
  fireEvent.change(form.querySelector('input'), { target: { value: text } });
  fireEvent.submit(form);
}

describe('HeroChatWidget — BUSY (trần ngân sách ngày)', () => {
  it('hiện câu tiếng Việt + MỞ form để lại thông tin; tiêu đề là "Tư vấn viên đang bận", KHÔNG phải "Hết lượt tư vấn"', async () => {
    const { container } = renderWidget();
    await sendQuestion(container);

    expect(await screen.findByPlaceholderText('Số điện thoại')).toBeTruthy();
    expect(screen.getByPlaceholderText('Họ và tên')).toBeTruthy();
    expect(screen.getByPlaceholderText('Email')).toBeTruthy();
    // Câu trong khung chat: i18n tiếng Việt, rõ ràng mời để lại thông tin.
    expect(container.textContent).toContain('Tư vấn viên đang bận trả lời nhiều bạn cùng lúc');
    expect(container.textContent).toContain('Bạn để lại thông tin ở form bên dưới');
    // Tiêu đề form theo ngữ cảnh BUSY.
    const titles = [...container.querySelectorAll('p.text-amber-800')].map((n) => n.textContent);
    expect(titles).toEqual(['Tư vấn viên đang bận']);
    expect(container.textContent).not.toContain('Hết lượt tư vấn');
  });

  it('gửi form liên hệ từ trạng thái BUSY: POST /api/contact kèm SĐT + nội dung, rồi hiện "Đã gửi thành công!"', async () => {
    const { container } = renderWidget();
    await sendQuestion(container);

    fireEvent.change(await screen.findByPlaceholderText('Họ và tên'), { target: { value: 'Nguyễn Văn A' } });
    fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: 'a@example.com' } });
    fireEvent.change(screen.getByPlaceholderText('Số điện thoại'), { target: { value: '0912345678' } });
    fireEvent.change(screen.getByPlaceholderText('Câu hỏi của bạn'), { target: { value: 'Mình cần tư vấn gói cho shop quần áo' } });
    fireEvent.click(screen.getByText('Gửi yêu cầu'));

    expect(await screen.findByText('Đã gửi thành công!')).toBeTruthy();
    const contactCall = fetch.mock.calls.find(([url]) => String(url).includes('/api/contact'));
    expect(contactCall).toBeTruthy();
    expect(JSON.parse(contactCall[1].body)).toMatchObject({ phone: '0912345678', email: 'a@example.com', name: 'Nguyễn Văn A' });
  });

  it('BUSY là trần theo ngày: sau khi hiện form, gửi thêm tin KHÔNG gọi lại API tư vấn', async () => {
    const { container } = renderWidget();
    await sendQuestion(container);
    await screen.findByPlaceholderText('Số điện thoại');
    const consultationCalls = () => fetch.mock.calls.filter(([url]) => String(url).includes('/api/public/hero/consultation')).length;
    expect(consultationCalls()).toBe(1);

    await sendQuestion(container, 'Còn ai không?');

    expect(consultationCalls()).toBe(1);
  });

  it('ngôn ngữ trang tiếng Anh: câu + tiêu đề BUSY bằng tiếng Anh (không hiện nguyên văn câu tiếng Việt của BE)', async () => {
    localStorage.setItem('uknow_locale', 'en');
    await loadEnglishDictionary(); // từ điển en nạp lười — nạp trước khi render để I18nProvider khởi động đồng bộ
    const { container } = renderWidget();
    await sendQuestion(container, 'Which plan fits my shop?');

    expect(await screen.findByPlaceholderText('Số điện thoại')).toBeTruthy();
    expect(container.textContent).toContain('Our advisor is helping many visitors right now');
    expect(container.textContent).toContain('Our advisor is busy');
    expect(container.textContent).not.toContain('Tư vấn viên đang bận');
  });

  it('QUOTA_EXCEEDED giữ nguyên: tiêu đề "Hết lượt tư vấn" + form', async () => {
    consultationResponse = { success: false, code: 'QUOTA_EXCEEDED', message: 'Ban da het luot chat mien phi' };
    const { container } = renderWidget();
    await sendQuestion(container);

    expect(await screen.findByPlaceholderText('Số điện thoại')).toBeTruthy();
    expect([...container.querySelectorAll('p.text-amber-800')].map((n) => n.textContent)).toEqual(['Hết lượt tư vấn']);
    expect(container.textContent).not.toContain('Tư vấn viên đang bận');
  });

  it('lỗi khác (AI_ERROR): hiện câu lỗi của BE như cũ, KHÔNG mở form', async () => {
    consultationResponse = { success: false, code: 'AI_ERROR', message: 'Xin lỗi, đã xảy ra lỗi. Vui lòng thử lại.' };
    const { container } = renderWidget();
    await sendQuestion(container);

    await waitFor(() => expect(container.textContent).toContain('Xin lỗi, đã xảy ra lỗi. Vui lòng thử lại.'));
    expect(screen.queryByPlaceholderText('Số điện thoại')).toBeNull();
  });
});
