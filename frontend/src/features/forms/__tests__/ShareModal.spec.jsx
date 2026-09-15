import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { I18nProvider } from '../../../i18n';
import ShareModal from '../components/ShareModal';

vi.mock('qrcode', () => ({
  __esModule: true,
  default: {
    toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,fake'),
  },
}));

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

/**
 * PLAN_FORM_DAT_LICH_THANH_TOAN_2026-09-13.md, PR-5.
 *
 * Khối hợp đồng phải khớp Y HỆT frontend/public/form-embed.js (chọn container qua
 * [data-founderai-form], origin qua src của <script>, fallback <noscript>) — test này khoá
 * đúng contract để lệch cú pháp (vd đổi tên attribute) bị bắt ngay ở đây thay vì phát hiện
 * muộn khi landing dán mã không chạy.
 */
describe('ShareModal — mã nhúng landing (PR-5)', () => {
  const form = { id: 'form-1', title: 'Form Tư Vấn', publicKey: 'pub_xyz123' };

  beforeEach(() => {
    Object.defineProperty(window, 'location', {
      value: { ...window.location, origin: 'https://founderai.biz' },
      configurable: true,
    });
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });
  });

  it('hiện khối mã nhúng đúng hợp đồng cố định: [data-founderai-form]=publicKey, noscript link, script src=ORIGIN/form-embed.js defer', async () => {
    render(
      <I18nProvider>
        <ShareModal form={form} isOpen onClose={vi.fn()} />
      </I18nProvider>
    );

    const pre = screen.getByText((content, el) => el.tagName === 'PRE' && content.includes('data-founderai-form'));
    const code = pre.textContent;

    expect(code).toContain('<section data-founderai-form-section>');
    expect(code).toContain('<div data-founderai-form="pub_xyz123"></div>');
    expect(code).toContain('<noscript><a href="https://founderai.biz/f/pub_xyz123">');
    expect(code).toContain('<script src="https://founderai.biz/form-embed.js" defer></script>');
    expect(code).toContain('</section>');

    // Chờ effect tải QR ổn định trước khi test kết thúc — tránh cảnh báo "not wrapped in act()".
    await waitFor(() => expect(screen.getByAltText('Form QR Code')).toBeInTheDocument());
  });

  it('bấm "Sao chép mã" -> ghi ĐÚNG khối hợp đồng vào clipboard (không phải link trần)', async () => {
    render(
      <I18nProvider>
        <ShareModal form={form} isOpen onClose={vi.fn()} />
      </I18nProvider>
    );

    // Có 2 nút "Sao chép mã" (khối nhúng chính + khối iframe phụ) — nút ĐẦU là khối nhúng chính.
    const copyButtons = screen.getAllByRole('button', { name: /Sao chép mã/i });
    fireEvent.click(copyButtons[0]);

    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(1));
    const copied = navigator.clipboard.writeText.mock.calls[0][0];
    expect(copied).toContain('data-founderai-form="pub_xyz123"');
    expect(copied).toContain('form-embed.js');
  });

  it('vẫn giữ link trực tiếp + QR (không bị mã nhúng thay thế)', async () => {
    render(
      <I18nProvider>
        <ShareModal form={form} isOpen onClose={vi.fn()} />
      </I18nProvider>
    );

    const linkInput = screen.getByDisplayValue('https://founderai.biz/f/pub_xyz123');
    expect(linkInput).toBeInTheDocument();
    await waitFor(() => expect(screen.getByAltText('Form QR Code')).toBeInTheDocument());
  });

  it('có khối nhúng iframe thường phụ (không JS) trỏ tới ORIGIN/f/KEY?embed=1', async () => {
    render(
      <I18nProvider>
        <ShareModal form={form} isOpen onClose={vi.fn()} />
      </I18nProvider>
    );

    const iframePre = screen.getByText((content, el) => el.tagName === 'PRE' && content.includes('<iframe'));
    expect(iframePre.textContent).toContain('https://founderai.biz/f/pub_xyz123?embed=1');

    await waitFor(() => expect(screen.getByAltText('Form QR Code')).toBeInTheDocument());
  });
});
