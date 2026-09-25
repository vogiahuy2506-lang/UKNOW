/**
 * Nghiệm thu modal "Đăng landing page lên Marketplace".
 *
 * Đặt cạnh LandingPageMarketplaceModal.jsx, khóa 4 hành vi:
 *  - pre-fill từ landingPage
 *  - validate form rỗng
 *  - submit hợp lệ gọi đúng service
 *  - validate title > 255 ký tự
 *
 * KHÔNG test nặng về UI/animation — đó là nhiệm vụ của e2e Playwright.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { I18nProvider } from '../../../i18n';
import LandingPageMarketplaceModal from '../LandingPageMarketplaceModal';

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../../services/marketplace.service', () => ({
  default: {
    createLandingPageListing: vi.fn().mockResolvedValue({ data: { success: true } }),
  },
}));

// Portal yêu cầu document.body — jsdom có sẵn.
import marketplaceService from '../../../services/marketplace.service';

const renderModal = (props) =>
  render(
    <I18nProvider>
      <LandingPageMarketplaceModal {...props} />
    </I18nProvider>
  );

describe('LandingPageMarketplaceModal', () => {
  const landingPage = { id: 7, title: 'Landing A', slug: 'landing-a' };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('pre-fill title từ landingPage, không gọi service khi chỉ mở modal', () => {
    renderModal({
      open: true,
      landingPage,
      onClose: vi.fn(),
      onSuccess: vi.fn(),
    });

    // Title input phải có sẵn 'Landing A'
    const titleInput = screen.getByPlaceholderText(/tiêu đề hấp dẫn/i);
    expect(titleInput.value).toBe('Landing A');

    // Slug hiển thị trong preview block
    expect(screen.getByText('landing-a.founderai.biz')).toBeInTheDocument();

    // Chưa submit → service chưa được gọi
    expect(marketplaceService.createLandingPageListing).not.toHaveBeenCalled();
  });

  it('khi title rỗng → nút submit disabled và không gọi service', async () => {
    renderModal({
      open: true,
      landingPage,
      onClose: vi.fn(),
      onSuccess: vi.fn(),
    });

    const titleInput = screen.getByPlaceholderText(/tiêu đề hấp dẫn/i);
    fireEvent.change(titleInput, { target: { value: '' } });

    const submitBtn = screen.getByRole('button', { name: /đăng lên marketplace/i });
    // UX: nút bị disable để ngăn submit form rỗng
    expect(submitBtn).toBeDisabled();

    // cố tình ép click (fireEvent click vẫn không trigger handler khi disabled)
    fireEvent.click(submitBtn);

    // Đợi microtask xong để chắc chắn service không bị gọi
    await new Promise((r) => setTimeout(r, 50));
    expect(marketplaceService.createLandingPageListing).not.toHaveBeenCalled();
  });

  it('submit hợp lệ → gọi service đúng payload, gọi onSuccess và onClose', async () => {
    const onSuccess = vi.fn();
    const onClose = vi.fn();

    renderModal({
      open: true,
      landingPage,
      onClose,
      onSuccess,
    });

    // Sửa title + điền description + thêm tag + đổi giá
    const titleInput = screen.getByPlaceholderText(/tiêu đề hấp dẫn/i);
    fireEvent.change(titleInput, { target: { value: 'Landing Pro' } });

    const descInput = screen.getByPlaceholderText(/mô tả ngắn về landing page|mô tả ngắn/i) || screen.getByPlaceholderText(/mô tả ngắn/i);
    fireEvent.change(descInput, { target: { value: 'Mô tả test' } });

    const tagInput = screen.getByPlaceholderText(/vd: marketing|vd:|marketing, bán hàng|nhấn enter/i);
    fireEvent.change(tagInput, { target: { value: 'khuyenmai' } });
    fireEvent.keyDown(tagInput, { key: 'Enter' });

    // Tăng giá +10 một lần
    const incBtn = screen.getByRole('button', { name: '+' });
    fireEvent.click(incBtn);

    const submitBtn = screen.getByRole('button', { name: /đăng lên marketplace/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(marketplaceService.createLandingPageListing).toHaveBeenCalledTimes(1);
    });

    expect(marketplaceService.createLandingPageListing).toHaveBeenCalledWith({
      landingPageId: 7,
      title: 'Landing Pro',
      description: 'Mô tả test',
      tags: ['khuyenmai'],
      priceCredits: 10,
    });

    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('title > 255 ký tự → toast lỗi, không gọi service', async () => {
    const toast = (await import('react-hot-toast')).default;

    renderModal({
      open: true,
      landingPage,
      onClose: vi.fn(),
      onSuccess: vi.fn(),
    });

    const titleInput = screen.getByPlaceholderText(/tiêu đề hấp dẫn/i);
    // maxLength=255 trên input nên ta phải bypass qua fireEvent.change trực tiếp
    fireEvent.change(titleInput, {
      target: { value: 'a'.repeat(256) },
    });

    const submitBtn = screen.getByRole('button', { name: /đăng lên marketplace/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled();
    });
    expect(marketplaceService.createLandingPageListing).not.toHaveBeenCalled();
  });
});
