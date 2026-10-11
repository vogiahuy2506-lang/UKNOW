import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { I18nProvider } from '../../../../i18n';
import HtmlFullPageEditor from '../HtmlFullPageEditor';
import { invoke, pickTab } from './invoke';

/**
 * HỢP ĐỒNG của trình soạn "HTML Full": nạp getHtmlMode(page) → gõ HTML (tab VI/EN) + CSS → Lưu/"Lưu & bật HTML"/
 * "Hiển thị mặc định" đều gọi saveHtmlMode(page, { displayMode, htmlContentVi, htmlContentEn, cssContent }) và đổ lại
 * form từ phản hồi; "Tạo bằng AI" gọi generateHomepageHtmlWithAi({ prompt, homepagePage, locale, title }) rồi điền vào
 * tab đang chọn. Nút nằm ở đâu (thanh trên / Công cụ / Cài đặt) không quan trọng — dùng `invoke`.
 */

vi.mock('../../services/landingCustomizerApi.service', () => ({
  default: {
    getHtmlMode: vi.fn(),
    saveHtmlMode: vi.fn(),
    generateHomepageHtmlWithAi: vi.fn(),
  },
}));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

import api from '../../services/landingCustomizerApi.service';
import toast from 'react-hot-toast';

const renderEditor = () => render(<I18nProvider><HtmlFullPageEditor /></I18nProvider>);
const viBox = () => screen.getByPlaceholderText(/Dán HTML Tiếng Việt/);
const enBox = () => screen.getByPlaceholderText(/Paste English HTML/);
const echo = (payload) => ({ data: { data: payload } });

beforeEach(() => {
  vi.clearAllMocks();
  api.getHtmlMode.mockResolvedValue(echo({ displayMode: 'default', htmlContentVi: '<p>cũ</p>', htmlContentEn: '', cssContent: '' }));
  api.saveHtmlMode.mockImplementation(async (page, payload) => echo(payload));
});

describe('HtmlFullPageEditor — hợp đồng nạp / gõ / lưu / bật HTML', () => {
  it('nạp getHtmlMode("hero") và đổ vào ô HTML Tiếng Việt', async () => {
    renderEditor();
    await waitFor(() => expect(api.getHtmlMode).toHaveBeenCalledWith('hero'));
    await waitFor(() => expect(viBox()).toHaveValue('<p>cũ</p>'));
  });

  it('Lưu: saveHtmlMode(page, form) giữ nguyên displayMode, gửi cả HTML vi/en và CSS', async () => {
    renderEditor();
    await waitFor(() => expect(viBox()).toHaveValue('<p>cũ</p>'));
    fireEvent.change(viBox(), { target: { value: '<h1>Mới</h1>' } });

    invoke(/^Lưu$/);

    await waitFor(() => expect(api.saveHtmlMode).toHaveBeenCalledTimes(1));
    expect(api.saveHtmlMode).toHaveBeenCalledWith('hero', {
      displayMode: 'default',
      htmlContentVi: '<h1>Mới</h1>',
      htmlContentEn: '',
      cssContent: '',
    });
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
  });

  it('tab English sửa htmlContentEn, không đụng bản Việt', async () => {
    renderEditor();
    await waitFor(() => expect(viBox()).toHaveValue('<p>cũ</p>'));
    pickTab('English');
    fireEvent.change(enBox(), { target: { value: '<h1>New</h1>' } });

    invoke(/^Lưu$/);

    await waitFor(() => expect(api.saveHtmlMode).toHaveBeenCalledTimes(1));
    expect(api.saveHtmlMode).toHaveBeenCalledWith('hero', expect.objectContaining({
      htmlContentVi: '<p>cũ</p>',
      htmlContentEn: '<h1>New</h1>',
    }));
  });

  it('"Lưu & bật HTML" gửi displayMode = html; "Hiển thị mặc định" gửi displayMode = default', async () => {
    renderEditor();
    await waitFor(() => expect(viBox()).toHaveValue('<p>cũ</p>'));

    invoke(/Lưu\s*(&|&amp;)\s*bật HTML/);
    await waitFor(() => expect(api.saveHtmlMode).toHaveBeenCalledTimes(1));
    expect(api.saveHtmlMode).toHaveBeenLastCalledWith('hero', expect.objectContaining({ displayMode: 'html', htmlContentVi: '<p>cũ</p>' }));
    await waitFor(() => expect(screen.getAllByRole('button', { name: /^Lưu$/ })[0]).toBeEnabled()); // lượt lưu xong mới bấm tiếp

    invoke(/Hiển thị mặc định/);
    await waitFor(() => expect(api.saveHtmlMode).toHaveBeenCalledTimes(2));
    expect(api.saveHtmlMode).toHaveBeenLastCalledWith('hero', expect.objectContaining({ displayMode: 'default', htmlContentVi: '<p>cũ</p>' }));
  });

  it('CSS bổ sung được gửi cùng khi lưu', async () => {
    renderEditor();
    await waitFor(() => expect(viBox()).toHaveValue('<p>cũ</p>'));
    fireEvent.change(screen.getByPlaceholderText(/Custom CSS injected/), { target: { value: 'body{color:red}' } });
    invoke(/^Lưu$/);
    await waitFor(() => expect(api.saveHtmlMode).toHaveBeenCalledTimes(1));
    expect(api.saveHtmlMode.mock.calls[0][1].cssContent).toBe('body{color:red}');
  });

  it('đổi trang nạp lại theo trang đó và lưu theo trang đó', async () => {
    renderEditor();
    await waitFor(() => expect(viBox()).toHaveValue('<p>cũ</p>'));
    api.getHtmlMode.mockResolvedValueOnce(echo({ displayMode: 'html', htmlContentVi: '<p>liên hệ</p>', htmlContentEn: '', cssContent: '' }));
    pickTab(/Liên h/i);
    await waitFor(() => expect(api.getHtmlMode).toHaveBeenCalledWith('contact'));
    await waitFor(() => expect(viBox()).toHaveValue('<p>liên hệ</p>'));

    invoke(/^Lưu$/);
    await waitFor(() => expect(api.saveHtmlMode).toHaveBeenCalledTimes(1));
    expect(api.saveHtmlMode).toHaveBeenCalledWith('contact', expect.objectContaining({ displayMode: 'html', htmlContentVi: '<p>liên hệ</p>' }));
  });

  it('Tạo bằng AI: gọi generateHomepageHtmlWithAi đúng tham số rồi điền HTML vào tab đang chọn', async () => {
    api.generateHomepageHtmlWithAi.mockResolvedValue({ data: { success: true, data: { html: '<main>AI</main>' } } });
    renderEditor();
    await waitFor(() => expect(viBox()).toHaveValue('<p>cũ</p>'));

    invoke(/Tạo bằng AI/);
    fireEvent.change(await screen.findByPlaceholderText(/VD: Landing trang chủ/), { target: { value: 'Trang giới thiệu' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo HTML' }));

    await waitFor(() => expect(api.generateHomepageHtmlWithAi).toHaveBeenCalledTimes(1));
    expect(api.generateHomepageHtmlWithAi).toHaveBeenCalledWith({
      prompt: 'Trang giới thiệu',
      homepagePage: 'hero',
      locale: 'vi',
      title: 'Founder AI — Trang Hero',
    });
    await waitFor(() => expect(viBox()).toHaveValue('<main>AI</main>'));
  });

  it('nạp lỗi thì báo lỗi và về form rỗng (không treo ở trạng thái đang tải)', async () => {
    api.getHtmlMode.mockRejectedValue({ response: { data: { message: 'Không có quyền' } } });
    renderEditor();
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Không có quyền'));
    await waitFor(() => expect(viBox()).toHaveValue(''));
  });
});
