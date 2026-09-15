import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import MainLayout from '../MainLayout';

const stableT = (key) => key;
vi.mock('../../i18n', () => ({ useI18n: () => ({ t: stableT }) }));

const m = vi.hoisted(() => ({
  user: null,
  phoneOtpEnabled: false,
  updateUser: vi.fn(),
  logout: vi.fn().mockResolvedValue(undefined),
  fetchAiCredits: vi.fn().mockResolvedValue(undefined),
  isAuthenticated: true,
  activeContext: { type: 'self' },
}));

vi.mock('../../stores/authStore', () => ({
  useAuthStore: (selector) => (selector ? selector(m) : m),
  trialWelcomeKey: (id) => `trial-${id}`,
}));

vi.mock('../../components/layout/admin/Sidebar', () => ({ default: () => null }));
vi.mock('../../components/layout/admin/Header', () => ({ default: () => null }));
vi.mock('../../features/ai/AiChatbot', () => ({ default: () => null }));
vi.mock('../../components/layout/CreditWarningBanner', () => ({ default: () => null }));
vi.mock('../../features/auth/components/ChangePasswordModal', () => ({ default: () => null }));
vi.mock('../../features/auth/components/PhoneRequiredModal', () => ({ default: () => null }));
vi.mock('../../features/auth/components/TrialWelcomeModal', () => ({ default: () => null }));

// Stub ConsentRequiredModal để kiểm tra isOpen, isOutdated và onDecline props
vi.mock('../../features/auth/components/ConsentRequiredModal', () => ({
  default: ({ isOpen, isOutdated, onDecline }) =>
    isOpen ? (
      <div
        data-testid="consent-required-modal-open"
        data-is-outdated={isOutdated ? 'true' : 'false'}
      >
        <button data-testid="consent-decline-btn" onClick={onDecline}>
          Decline
        </button>
      </div>
    ) : null,
}));

const renderLayout = (initialEntries = ['/app']) =>
  render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/login" element={<div data-testid="login-page">login-page</div>} />
        <Route path="*" element={<MainLayout />} />
      </Routes>
    </MemoryRouter>
  );

describe('MainLayout — consentRequired theo luật bắt buộc 12/09', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('user bình thường chưa đồng ý (hasConsented = false) → HIỆN modal', () => {
    m.phoneOtpEnabled = false;
    m.user = {
      id: 1,
      role: 'user',
      phone: '0912345678',
      phoneVerifiedAt: '2026-09-11T10:00:00.000Z',
      mustChangePassword: false,
      hasConsented: false,
      consentVersionOutdated: false,
    };

    renderLayout();

    const modals = screen.getAllByTestId('consent-required-modal-open');
    expect(modals.length).toBeGreaterThan(0);
    expect(modals[0]).toHaveAttribute('data-is-outdated', 'false');
  });

  it('user có consentVersionOutdated = true (hasConsented = false) → HIỆN modal với isOutdated=true', () => {
    m.phoneOtpEnabled = false;
    m.user = {
      id: 1,
      role: 'user',
      phone: '0912345678',
      phoneVerifiedAt: '2026-09-11T10:00:00.000Z',
      mustChangePassword: false,
      hasConsented: false,
      consentVersionOutdated: true,
    };

    renderLayout();

    const modals = screen.getAllByTestId('consent-required-modal-open');
    expect(modals.length).toBeGreaterThan(0);
    expect(modals[0]).toHaveAttribute('data-is-outdated', 'true');
  });

  it('user đã đồng ý (hasConsented = true) → KHÔNG hiện modal', () => {
    m.phoneOtpEnabled = false;
    m.user = {
      id: 1,
      role: 'user',
      phone: '0912345678',
      phoneVerifiedAt: '2026-09-11T10:00:00.000Z',
      mustChangePassword: false,
      hasConsented: true,
      consentVersionOutdated: false,
    };

    renderLayout();

    expect(screen.queryByTestId('consent-required-modal-open')).not.toBeInTheDocument();
  });

  it('admin (role = admin) → KHÔNG hiện modal kể cả hasConsented = false', () => {
    m.phoneOtpEnabled = false;
    m.user = {
      id: 1,
      role: 'admin',
      phone: '0912345678',
      phoneVerifiedAt: '2026-09-11T10:00:00.000Z',
      mustChangePassword: false,
      hasConsented: false,
    };

    renderLayout();

    expect(screen.queryByTestId('consent-required-modal-open')).not.toBeInTheDocument();
  });

  it('đang yêu cầu đổi mật khẩu (mustChangePassword = true) → KHÔNG hiện modal consent (ưu tiên mật khẩu)', () => {
    m.phoneOtpEnabled = false;
    m.user = {
      id: 1,
      role: 'user',
      phone: '0912345678',
      phoneVerifiedAt: '2026-09-11T10:00:00.000Z',
      mustChangePassword: true,
      hasConsented: false,
    };

    renderLayout();

    expect(screen.queryByTestId('consent-required-modal-open')).not.toBeInTheDocument();
  });

  it('đang yêu cầu nhập SĐT (phoneRequired = true do thiếu số) → KHÔNG hiện modal consent (ưu tiên SĐT)', () => {
    m.phoneOtpEnabled = false;
    m.user = {
      id: 1,
      role: 'user',
      phone: null,
      phoneVerifiedAt: null,
      mustChangePassword: false,
      hasConsented: false,
    };

    renderLayout();

    expect(screen.queryByTestId('consent-required-modal-open')).not.toBeInTheDocument();
  });

  it('bấm Không đồng ý và đăng xuất (desktop) → gọi logout và điều hướng tới /login', async () => {
    m.phoneOtpEnabled = false;
    m.user = {
      id: 1,
      role: 'user',
      phone: '0912345678',
      phoneVerifiedAt: '2026-09-11T10:00:00.000Z',
      mustChangePassword: false,
      hasConsented: false,
      consentVersionOutdated: false,
    };

    renderLayout();

    const declineBtns = screen.getAllByTestId('consent-decline-btn');
    expect(declineBtns.length).toBeGreaterThan(0);

    fireEvent.click(declineBtns[0]);

    await waitFor(() => {
      expect(m.logout).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId('login-page')).toBeInTheDocument();
    });
  });

  it('bấm Không đồng ý và đăng xuất (mobile) → gọi logout và điều hướng tới /login', async () => {
    const originalWidth = window.innerWidth;
    window.innerWidth = 500;
    try {
      m.phoneOtpEnabled = false;
      m.user = {
        id: 1,
        role: 'user',
        phone: '0912345678',
        phoneVerifiedAt: '2026-09-11T10:00:00.000Z',
        mustChangePassword: false,
        hasConsented: false,
        consentVersionOutdated: false,
      };

      renderLayout();

      const declineBtns = screen.getAllByTestId('consent-decline-btn');
      expect(declineBtns.length).toBeGreaterThan(0);

      fireEvent.click(declineBtns[0]);

      await waitFor(() => {
        expect(m.logout).toHaveBeenCalledTimes(1);
        expect(screen.getByTestId('login-page')).toBeInTheDocument();
      });
    } finally {
      window.innerWidth = originalWidth;
    }
  });
});
