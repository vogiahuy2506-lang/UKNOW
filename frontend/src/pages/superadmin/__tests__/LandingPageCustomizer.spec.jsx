import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { I18nProvider } from '../../../i18n';
import LandingPageCustomizer from '../LandingPageCustomizer';
import { invoke } from '../../../features/landing-customizer/components/__tests__/invoke';

/**
 * Trang Tuỳ chỉnh Landing: hai chế độ soạn (Canva Editor / HTML Full) — đổi qua lại phải mở đúng trình soạn và nạp lại
 * đúng API của nó. Ở bố cục cũ nút đổi chế độ nằm ngay đầu trang; ở bố cục mới nó nằm trong modal Cài đặt (`invoke`
 * tìm cả hai chỗ).
 */

vi.mock('../../../features/landing-customizer/services/landingCustomizerApi.service', () => ({
  default: {
    getOverrides: vi.fn(),
    saveOverrides: vi.fn(),
    getHtmlMode: vi.fn(),
    saveHtmlMode: vi.fn(),
    generateHomepageHtmlWithAi: vi.fn(),
  },
}));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

import api from '../../../features/landing-customizer/services/landingCustomizerApi.service';

const renderPage = () => render(<I18nProvider><LandingPageCustomizer /></I18nProvider>);

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  api.getOverrides.mockResolvedValue({ data: { overrides: [] } });
  api.getHtmlMode.mockResolvedValue({ data: { data: { displayMode: 'default', htmlContentVi: '<p>x</p>', htmlContentEn: '', cssContent: '' } } });
  api.saveHtmlMode.mockImplementation(async (page, payload) => ({ data: { data: payload } }));
});

describe('LandingPageCustomizer — chế độ soạn', () => {
  it('mặc định là trình Canva; đổi sang HTML Full rồi quay lại vẫn nạp đúng API', async () => {
    renderPage();
    await waitFor(() => expect(api.getOverrides).toHaveBeenCalledWith('hero', 'vi'));
    expect(api.getHtmlMode).not.toHaveBeenCalledWith('hero');

    invoke(/HTML Full/);
    await waitFor(() => expect(screen.getByPlaceholderText(/Dán HTML Tiếng Việt/)).toHaveValue('<p>x</p>'));
    expect(api.getHtmlMode).toHaveBeenCalledWith('hero');

    api.getOverrides.mockClear();
    invoke(/Canva Editor/);
    await waitFor(() => expect(api.getOverrides).toHaveBeenCalledWith('hero', 'vi'));
    expect(screen.queryByPlaceholderText(/Dán HTML Tiếng Việt/)).not.toBeInTheDocument();
  });

  it('trong HTML Full vẫn bật/tắt hiển thị: "Hiển thị mặc định" lưu displayMode=default, "Lưu & bật HTML" lưu displayMode=html', async () => {
    renderPage();
    await waitFor(() => expect(api.getOverrides).toHaveBeenCalled());
    invoke(/HTML Full/);
    await waitFor(() => expect(screen.getByPlaceholderText(/Dán HTML Tiếng Việt/)).toHaveValue('<p>x</p>'));

    invoke(/Lưu\s*(&|&amp;)\s*bật HTML/);
    await waitFor(() => expect(api.saveHtmlMode).toHaveBeenCalledTimes(1));
    expect(api.saveHtmlMode).toHaveBeenLastCalledWith('hero', expect.objectContaining({ displayMode: 'html' }));
    await waitFor(() => expect(screen.getAllByRole('button', { name: /^Lưu$/ })[0]).toBeEnabled()); // lượt lưu xong mới bấm tiếp

    invoke(/Hiển thị mặc định/);
    await waitFor(() => expect(api.saveHtmlMode).toHaveBeenCalledTimes(2));
    expect(api.saveHtmlMode).toHaveBeenLastCalledWith('hero', expect.objectContaining({ displayMode: 'default' }));
  });
});
