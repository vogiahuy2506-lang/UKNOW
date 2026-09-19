import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import PostAuthGateModals from '../PostAuthGateModals';
import { useAuthStore } from '../../../../stores/authStore';
import { dismissReferralPromptRemote } from '../../services/authApi.service';

const stableT = (key) => key;
vi.mock('../../../../i18n', () => ({ useI18n: () => ({ t: stableT }) }));

// Migration 229: nút Bỏ qua ghi cờ ở server. Mock RIÊNG hàm này, giữ nguyên các hàm khác
// của service (authStore dùng logout/login thật trong các ca khác).
vi.mock('../../services/authApi.service', async (importOriginal) => ({
  ...(await importOriginal()),
  dismissReferralPromptRemote: vi.fn().mockResolvedValue({
    success: true,
    data: { referralPromptDismissedAt: '2026-09-19T10:00:00.000Z' },
  }),
}));

// Stub các modal để cô lập logic cổng
vi.mock('../ChangePasswordModal', () => ({
  default: ({ isOpen }) => (isOpen ? <div data-testid="change-password-modal" /> : null),
}));

vi.mock('../PhoneRequiredModal', () => ({
  default: ({ isOpen, onClose }) =>
    isOpen ? (
      <div data-testid="phone-required-modal">
        <button data-testid="phone-later-btn" onClick={onClose}>
          Để sau
        </button>
      </div>
    ) : null,
}));

vi.mock('../ConsentRequiredModal', () => ({
  default: ({ isOpen, isOutdated, onDecline }) =>
    isOpen ? (
      <div
        data-testid="consent-required-modal"
        data-is-outdated={isOutdated ? 'true' : 'false'}
      >
        <button data-testid="consent-decline-btn" onClick={onDecline}>
          Không đồng ý và đăng xuất
        </button>
      </div>
    ) : null,
}));

vi.mock('../ReferralPromptModal', () => ({
  default: ({ isOpen, onClose, onSuccess }) =>
    isOpen ? (
      <div data-testid="referral-prompt-modal">
        <button data-testid="referral-skip-btn" onClick={onClose}>
          Bỏ qua
        </button>
        <button
          data-testid="referral-submit-btn"
          onClick={() =>
            onSuccess({
              referredByUserId: 99,
              referrerCode: 'PROMO99',
              referrerName: 'User 99',
            })
          }
        >
          Xác nhận
        </button>
      </div>
    ) : null,
}));


const renderWithRouter = (initialEntries = ['/']) =>
  render(
    <MemoryRouter initialEntries={initialEntries}>
      <PostAuthGateModals />
      <Routes>
        <Route path="/login" element={<div data-testid="login-page">Login Page</div>} />
        <Route path="/" element={<div data-testid="home-page">Home Page</div>} />
        <Route path="/terms" element={<div data-testid="terms-page">Terms Page</div>} />
        <Route path="/lp/:slug" element={<div data-testid="lp-page">LP Page</div>} />
        <Route path="/termsx" element={<div data-testid="termsx-page">TermsX Page</div>} />
        <Route path="/app" element={<div data-testid="app-page">App Page</div>} />
      </Routes>
    </MemoryRouter>
  );

const originalLogout = useAuthStore.getState().logout;

describe('PostAuthGateModals (PR-B: Cổng sau đăng nhập toàn cục)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      user: null,
      isAuthenticated: false,
      phoneOtpEnabled: false,
      phoneReminderDismissed: false,
      logout: originalLogout,
    });
  });

  it('(a) user chưa đồng ý ở / → modal đồng ý hiện, modal SĐT CHƯA hiện dù thiếu số', () => {
    useAuthStore.setState({
      isAuthenticated: true,
      phoneOtpEnabled: false,
      user: {
        id: 1,
        role: 'user',
        phone: null, // thiếu số
        mustChangePassword: false,
        hasConsented: false, // chưa đồng ý
      },
    });

    renderWithRouter(['/']);

    // Modal đồng ý phải hiện
    expect(screen.getByTestId('consent-required-modal')).toBeInTheDocument();
    // Modal SĐT KHÔNG được hiện trước đồng ý (thứ tự: mật khẩu -> đồng ý -> SĐT)
    expect(screen.queryByTestId('phone-required-modal')).not.toBeInTheDocument();
    expect(screen.queryByTestId('change-password-modal')).not.toBeInTheDocument();
  });

  it('user có consentVersionOutdated = true → HIỆN modal đồng ý với isOutdated = true', () => {
    useAuthStore.setState({
      isAuthenticated: true,
      user: {
        id: 1,
        role: 'user',
        phone: '0912345678',
        phoneVerifiedAt: '2026-09-11T10:00:00.000Z',
        mustChangePassword: false,
        hasConsented: false,
        consentVersionOutdated: true,
      },
    });

    renderWithRouter(['/']);

    const modal = screen.getByTestId('consent-required-modal');
    expect(modal).toHaveAttribute('data-is-outdated', 'true');
  });

  it('(b) đã đồng ý, thiếu số ở / → modal SĐT hiện; bấm "Để sau" → tắt', () => {
    useAuthStore.setState({
      isAuthenticated: true,
      phoneOtpEnabled: false,
      phoneReminderDismissed: false,
      user: {
        id: 1,
        role: 'user',
        phone: null,
        mustChangePassword: false,
        hasConsented: true,
      },
    });

    renderWithRouter(['/']);

    expect(screen.getByTestId('phone-required-modal')).toBeInTheDocument();
    expect(screen.queryByTestId('consent-required-modal')).not.toBeInTheDocument();

    // Bấm "Để sau"
    fireEvent.click(screen.getByTestId('phone-later-btn'));

    expect(useAuthStore.getState().phoneReminderDismissed).toBe(true);
    expect(screen.queryByTestId('phone-required-modal')).not.toBeInTheDocument();
  });

  it('phoneOtp: cờ tắt + user có phone → KHÔNG hiện modal SĐT', () => {
    useAuthStore.setState({
      isAuthenticated: true,
      phoneOtpEnabled: false,
      user: { id: 1, role: 'user', phone: '0912345678', phoneVerifiedAt: null, mustChangePassword: false, hasConsented: true },
    });

    renderWithRouter(['/']);
    expect(screen.queryByTestId('phone-required-modal')).not.toBeInTheDocument();
  });

  it('phoneOtp: cờ bật + có phone nhưng phoneVerifiedAt null → HIỆN modal SĐT', () => {
    useAuthStore.setState({
      isAuthenticated: true,
      phoneOtpEnabled: true,
      user: { id: 1, role: 'user', phone: '0912345678', phoneVerifiedAt: null, mustChangePassword: false, hasConsented: true },
    });

    renderWithRouter(['/']);
    expect(screen.getByTestId('phone-required-modal')).toBeInTheDocument();
  });

  it('phoneOtp: cờ bật + số nước ngoài + phoneVerifiedAt null → KHÔNG hiện modal SĐT', () => {
    useAuthStore.setState({
      isAuthenticated: true,
      phoneOtpEnabled: true,
      user: { id: 1, role: 'user', phone: '+14155552671', phoneVerifiedAt: null, mustChangePassword: false, hasConsented: true },
    });

    renderWithRouter(['/']);
    expect(screen.queryByTestId('phone-required-modal')).not.toBeInTheDocument();
  });

  it('phoneOtp: cờ bật + số bàn VN + phoneVerifiedAt null → KHÔNG hiện modal SĐT', () => {
    useAuthStore.setState({
      isAuthenticated: true,
      phoneOtpEnabled: true,
      user: { id: 1, role: 'user', phone: '02838123456', phoneVerifiedAt: null, mustChangePassword: false, hasConsented: true },
    });

    renderWithRouter(['/']);
    expect(screen.queryByTestId('phone-required-modal')).not.toBeInTheDocument();
  });

  it('phoneOtp: cờ bật + phoneVerifiedAt có giá trị → KHÔNG hiện modal SĐT', () => {
    useAuthStore.setState({
      isAuthenticated: true,
      phoneOtpEnabled: true,
      user: {
        id: 1,
        role: 'user',
        phone: '0912345678',
        phoneVerifiedAt: '2026-09-11T10:00:00.000Z',
        mustChangePassword: false,
        hasConsented: true,
      },
    });

    renderWithRouter(['/']);
    expect(screen.queryByTestId('phone-required-modal')).not.toBeInTheDocument();
  });

  it('(c) ở /terms và /lp/abc → không modal nào', () => {
    useAuthStore.setState({
      isAuthenticated: true,
      user: {
        id: 1,
        role: 'user',
        phone: null,
        mustChangePassword: false,
        hasConsented: false,
      },
    });

    // 1. Kiểm tra /terms
    const { unmount } = renderWithRouter(['/terms']);
    expect(screen.queryByTestId('consent-required-modal')).not.toBeInTheDocument();
    expect(screen.queryByTestId('phone-required-modal')).not.toBeInTheDocument();
    expect(screen.queryByTestId('change-password-modal')).not.toBeInTheDocument();
    unmount();

    // 2. Kiểm tra /lp/abc
    renderWithRouter(['/lp/abc']);
    expect(screen.queryByTestId('consent-required-modal')).not.toBeInTheDocument();
    expect(screen.queryByTestId('phone-required-modal')).not.toBeInTheDocument();
    expect(screen.queryByTestId('change-password-modal')).not.toBeInTheDocument();
  });

  it('ranh giới tiền tố: /termsx KHÔNG bị loại trừ → modal đồng ý vẫn hiện', () => {
    useAuthStore.setState({
      isAuthenticated: true,
      user: {
        id: 1,
        role: 'user',
        phone: '0912345678',
        mustChangePassword: false,
        hasConsented: false,
      },
    });

    renderWithRouter(['/termsx']);
    expect(screen.getByTestId('consent-required-modal')).toBeInTheDocument();
  });

  it('(d) mustChangePassword → chỉ modal đổi mật khẩu', () => {
    useAuthStore.setState({
      isAuthenticated: true,
      user: {
        id: 1,
        role: 'user',
        phone: null,
        mustChangePassword: true,
        hasConsented: false,
      },
    });

    renderWithRouter(['/']);

    expect(screen.getByTestId('change-password-modal')).toBeInTheDocument();
    expect(screen.queryByTestId('consent-required-modal')).not.toBeInTheDocument();
    expect(screen.queryByTestId('phone-required-modal')).not.toBeInTheDocument();
  });

  it('(e) role admin → không modal nào', () => {
    useAuthStore.setState({
      isAuthenticated: true,
      user: {
        id: 1,
        role: 'admin',
        phone: null,
        mustChangePassword: false,
        hasConsented: false,
      },
    });

    renderWithRouter(['/']);

    expect(screen.queryByTestId('change-password-modal')).not.toBeInTheDocument();
    expect(screen.queryByTestId('consent-required-modal')).not.toBeInTheDocument();
    expect(screen.queryByTestId('phone-required-modal')).not.toBeInTheDocument();
  });

  it('(f) chưa đăng nhập (isAuthenticated = false) → không modal nào', () => {
    useAuthStore.setState({
      isAuthenticated: false,
      user: null,
    });

    renderWithRouter(['/']);

    expect(screen.queryByTestId('change-password-modal')).not.toBeInTheDocument();
    expect(screen.queryByTestId('consent-required-modal')).not.toBeInTheDocument();
    expect(screen.queryByTestId('phone-required-modal')).not.toBeInTheDocument();
  });

  it('(g) "Không đồng ý và đăng xuất" → logout gọi, về /login', async () => {
    const logoutSpy = vi.fn().mockResolvedValue(undefined);
    useAuthStore.setState({
      isAuthenticated: true,
      logout: logoutSpy,
      user: {
        id: 1,
        role: 'user',
        phone: '0912345678',
        mustChangePassword: false,
        hasConsented: false,
      },
    });

    renderWithRouter(['/']);

    const declineBtn = screen.getByTestId('consent-decline-btn');
    fireEvent.click(declineBtn);

    await waitFor(() => {
      expect(logoutSpy).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId('login-page')).toBeInTheDocument();
    });
  });

  it('đăng xuất rồi đăng nhập user khác vẫn được nhắc (phoneReminderDismissed reset khi logout)', async () => {
    // 1. User 1 đăng nhập, thiếu số -> hiện modal -> bấm "Để sau" -> tắt modal
    useAuthStore.setState({
      isAuthenticated: true,
      phoneOtpEnabled: false,
      phoneReminderDismissed: false,
      user: { id: 1, role: 'user', phone: null, mustChangePassword: false, hasConsented: true },
    });

    const { unmount } = renderWithRouter(['/']);
    expect(screen.getByTestId('phone-required-modal')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('phone-later-btn'));
    expect(useAuthStore.getState().phoneReminderDismissed).toBe(true);
    expect(screen.queryByTestId('phone-required-modal')).not.toBeInTheDocument();
    unmount();

    // 2. Logout
    await useAuthStore.getState().logout({ skipServer: true });
    expect(useAuthStore.getState().phoneReminderDismissed).toBe(false);

    // 3. User 2 đăng nhập cũng thiếu số -> PHẢI hiện lại modal
    useAuthStore.setState({
      isAuthenticated: true,
      phoneOtpEnabled: false,
      user: { id: 2, role: 'user', phone: null, mustChangePassword: false, hasConsented: true },
    });

    renderWithRouter(['/']);
    expect(screen.getByTestId('phone-required-modal')).toBeInTheDocument();
  });

  describe('Cổng nhập mã giới thiệu (ReferralPromptModal - chỉ 1 lần lúc mới đăng ký)', () => {
    beforeEach(() => {
      window.localStorage.clear();
      useAuthStore.setState({ referralPromptDismissed: false });
    });

    it('tài khoản mới tạo (<24h), đã đồng ý và đủ SĐT, chưa có người giới thiệu → HIỆN modal referral', () => {
      useAuthStore.setState({
        isAuthenticated: true,
        user: {
          id: 10,
          role: 'user',
          phone: '0912345678',
          phoneVerifiedAt: '2026-09-18T10:00:00.000Z',
          mustChangePassword: false,
          hasConsented: true,
          referredByUserId: null,
          createdAt: new Date().toISOString(),
        },
      });

      renderWithRouter(['/']);
      expect(screen.getByTestId('referral-prompt-modal')).toBeInTheDocument();
      expect(screen.queryByTestId('consent-required-modal')).not.toBeInTheDocument();
      expect(screen.queryByTestId('phone-required-modal')).not.toBeInTheDocument();
    });

    it('tài khoản đã có người giới thiệu (referredByUserId) → KHÔNG hiện modal referral', () => {
      useAuthStore.setState({
        isAuthenticated: true,
        user: {
          id: 11,
          role: 'user',
          phone: '0912345678',
          phoneVerifiedAt: '2026-09-18T10:00:00.000Z',
          mustChangePassword: false,
          hasConsented: true,
          referredByUserId: 5,
          createdAt: new Date().toISOString(),
        },
      });

      renderWithRouter(['/']);
      expect(screen.queryByTestId('referral-prompt-modal')).not.toBeInTheDocument();
    });

    it('tài khoản tạo quá 24 giờ → KHÔNG hiện modal referral', () => {
      const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
      useAuthStore.setState({
        isAuthenticated: true,
        user: {
          id: 12,
          role: 'user',
          phone: '0912345678',
          phoneVerifiedAt: '2026-09-18T10:00:00.000Z',
          mustChangePassword: false,
          hasConsented: true,
          referredByUserId: null,
          createdAt: twoDaysAgo,
        },
      });

      renderWithRouter(['/']);
      expect(screen.queryByTestId('referral-prompt-modal')).not.toBeInTheDocument();
    });

    it('bấm Bỏ qua → modal đóng và lưu localStorage vĩnh viễn không hỏi lại', () => {
      useAuthStore.setState({
        isAuthenticated: true,
        user: {
          id: 13,
          role: 'user',
          phone: '0912345678',
          phoneVerifiedAt: '2026-09-18T10:00:00.000Z',
          mustChangePassword: false,
          hasConsented: true,
          referredByUserId: null,
          createdAt: new Date().toISOString(),
        },
      });

      const { unmount } = renderWithRouter(['/']);
      expect(screen.getByTestId('referral-prompt-modal')).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('referral-skip-btn'));
      expect(window.localStorage.getItem('referral_prompt_dismissed_13')).toBe('1');
      expect(screen.queryByTestId('referral-prompt-modal')).not.toBeInTheDocument();
      unmount();

      // Mở lại trang → vẫn không hiện vì đã dismiss trong localStorage
      renderWithRouter(['/']);
      expect(screen.queryByTestId('referral-prompt-modal')).not.toBeInTheDocument();
    });

    it('migration 229: bấm Bỏ qua → gọi server ghi cờ, user trong store nhận referralPromptDismissedAt', async () => {
      dismissReferralPromptRemote.mockClear();
      useAuthStore.setState({
        isAuthenticated: true,
        user: {
          id: 15,
          role: 'user',
          phone: '0912345678',
          phoneVerifiedAt: '2026-09-18T10:00:00.000Z',
          mustChangePassword: false,
          hasConsented: true,
          referredByUserId: null,
          referralPromptDismissedAt: null,
          createdAt: new Date().toISOString(),
        },
      });

      renderWithRouter(['/']);
      fireEvent.click(screen.getByTestId('referral-skip-btn'));

      await waitFor(() => {
        expect(dismissReferralPromptRemote).toHaveBeenCalledTimes(1);
      });
      await waitFor(() => {
        expect(useAuthStore.getState().user.referralPromptDismissedAt).toBe('2026-09-19T10:00:00.000Z');
      });
    });

    it('migration 229: user đã có referralPromptDismissedAt từ server (đổi máy, localStorage trống) → KHÔNG hiện modal', () => {
      window.localStorage.clear();
      useAuthStore.setState({
        isAuthenticated: true,
        referralPromptDismissed: false,
        user: {
          id: 16,
          role: 'user',
          phone: '0912345678',
          phoneVerifiedAt: '2026-09-18T10:00:00.000Z',
          mustChangePassword: false,
          hasConsented: true,
          referredByUserId: null,
          referralPromptDismissedAt: '2026-09-19T09:00:00.000Z',
          createdAt: new Date().toISOString(),
        },
      });

      renderWithRouter(['/']);
      expect(screen.queryByTestId('referral-prompt-modal')).not.toBeInTheDocument();
    });

    it('xác nhận mã thành công → cập nhật user trong authStore và đóng modal', () => {
      useAuthStore.setState({
        isAuthenticated: true,
        user: {
          id: 14,
          role: 'user',
          phone: '0912345678',
          phoneVerifiedAt: '2026-09-18T10:00:00.000Z',
          mustChangePassword: false,
          hasConsented: true,
          referredByUserId: null,
          createdAt: new Date().toISOString(),
        },
      });

      renderWithRouter(['/']);
      expect(screen.getByTestId('referral-prompt-modal')).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('referral-submit-btn'));

      expect(window.localStorage.getItem('referral_prompt_dismissed_14')).toBe('1');
      expect(useAuthStore.getState().user.referredByUserId).toBe(99);
      expect(screen.queryByTestId('referral-prompt-modal')).not.toBeInTheDocument();
    });
  });
});

