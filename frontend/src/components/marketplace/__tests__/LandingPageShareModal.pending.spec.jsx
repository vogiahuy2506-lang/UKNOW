/**
 * PR-1 share notification (2026-09-25) — Unit test toast messages theo nhánh:
 *   - share thành công 100% với user đã có tài khoản → toast "Đã chia sẻ và gửi email thông báo"
 *   - share thành công 100% với email ngoài → toast "Đã lưu quyền chia sẻ. Hệ thống sẽ gửi email mời người nhận đăng ký..."
 *   - share thành công 1 phần (1 existing + 1 fail) → toast có chữ "Đã chia sẻ cho 1/2"
 *
 * Cũng kiểm tra payload share được gọi đúng.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { I18nProvider } from '../../../i18n';
import LandingPageShareModal from '../LandingPageShareModal';

const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();
vi.mock('react-hot-toast', () => ({
  default: {
    success: (...args) => mockToastSuccess(...args),
    error: (...args) => mockToastError(...args),
  },
}));

const mockShareLandingPage = vi.fn();
const mockGetLandingPageShares = vi.fn().mockResolvedValue({ data: { data: [] } });
vi.mock('../../../services/marketplace.service', () => ({
  default: {
    shareLandingPage: (...args) => mockShareLandingPage(...args),
    getLandingPageShares: (...args) => mockGetLandingPageShares(...args),
    revokeLandingPageShare: vi.fn().mockResolvedValue({ data: { success: true } }),
  },
}));

function renderModal() {
  return render(
    <I18nProvider>
      <LandingPageShareModal
        landingPage={{ id: 42, title: 'Demo LP' }}
        open
        onClose={vi.fn()}
        onChanged={vi.fn()}
      />
    </I18nProvider>
  );
}

function setEmailAndSubmit(email) {
  // Nhập email vào EmailTagsInput
  const input = screen.getByPlaceholderText(/email/i);
  fireEvent.change(input, { target: { value: email } });
  fireEvent.keyDown(input, { key: 'Enter' });
  // Click submit
  const btn = screen.getByRole('button', { name: /chia sẻ|share/i });
  fireEvent.click(btn);
}

describe('LandingPageShareModal — toast theo nhánh (PR-1)', () => {
  beforeEach(() => {
    mockToastSuccess.mockClear();
    mockToastError.mockClear();
    mockShareLandingPage.mockReset();
    mockGetLandingPageShares.mockClear();
  });

  it('toast "Đã chia sẻ và gửi email thông báo" khi toàn bộ recipient là user đã có tài khoản', async () => {
    mockShareLandingPage.mockResolvedValue({
      data: {
        success: true,
        data: {
          share: { id: 1 },
          recipient: { id: 99, name: 'Existing', email: 'existing@x.com' },
          isExistingUser: true,
          notificationSent: true,
        },
      },
    });
    renderModal();
    setEmailAndSubmit('existing@x.com');
    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalled());
    const msg = mockToastSuccess.mock.calls[0][0];
    expect(msg).toMatch(/Đã chia sẻ và gửi email thông báo/i);
  });

  it('toast "Đã lưu quyền chia sẻ..." khi toàn bộ recipient ngoài hệ thống', async () => {
    mockShareLandingPage.mockResolvedValue({
      data: {
        success: true,
        data: {
          share: { id: 2, status: 'pending' },
          recipient: null,
          isExistingUser: false,
          notificationSent: true,
        },
      },
    });
    renderModal();
    setEmailAndSubmit('pending@x.com');
    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalled());
    const msg = mockToastSuccess.mock.calls[0][0];
    expect(msg).toMatch(/Hệ thống sẽ gửi email mời người nhận đăng ký/i);
  });

  it('toast mixed khi 1 share success (existing) + 1 fail', async () => {
    // 2 lần share: lần 1 success (existing), lần 2 reject
    mockShareLandingPage
      .mockResolvedValueOnce({
        data: {
          success: true,
          data: { share: { id: 1 }, recipient: { id: 1 }, isExistingUser: true, notificationSent: true },
        },
      })
      .mockRejectedValueOnce(new Error('Lỗi 500'));
    renderModal();
    // Thêm 2 email
    const input = screen.getByPlaceholderText(/email/i);
    fireEvent.change(input, { target: { value: 'a@x.com' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.change(input, { target: { value: 'b@x.com' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    const btn = screen.getByRole('button', { name: /chia sẻ|share/i });
    fireEvent.click(btn);
    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalled());
    const successMsg = mockToastSuccess.mock.calls[0][0];
    expect(successMsg).toMatch(/Đã chia sẻ cho 1\/2/);
    // Có toast error cho lần fail
    await waitFor(() => expect(mockToastError).toHaveBeenCalled());
  });

  it('shareLandingPage được gọi với payload đúng', async () => {
    mockShareLandingPage.mockResolvedValue({
      data: {
        success: true,
        data: { share: {}, recipient: null, isExistingUser: false, notificationSent: true },
      },
    });
    renderModal();
    setEmailAndSubmit('payload-check@x.com');
    await waitFor(() => expect(mockShareLandingPage).toHaveBeenCalled());
    const [lpId, payload] = mockShareLandingPage.mock.calls[0];
    expect(lpId).toBe(42);
    expect(payload.recipientEmail).toBe('payload-check@x.com');
    expect(payload.shareType).toBe('view');
  });
});
