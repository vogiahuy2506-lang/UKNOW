import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import MainLayout from '../MainLayout';

const stableT = (key) => key;
vi.mock('../../i18n', () => ({ useI18n: () => ({ t: stableT }) }));

const mAuth = vi.hoisted(() => ({
  user: null,
  isAuthenticated: true,
  billingStatus: null,
  activeContext: { type: 'self' },
  fetchAiCredits: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../stores/authStore', () => ({
  useAuthStore: (selector) => (selector ? selector(mAuth) : mAuth),
  trialWelcomeKey: (id) => `trial-${id}`,
}));

const mGates = vi.hoisted(() => ({
  anyGateOpen: false,
  mustChangePassword: false,
  consentRequired: false,
  phoneRequired: false,
}));

vi.mock('../../features/auth/hooks/usePostAuthGates', () => ({
  usePostAuthGates: () => mGates,
}));

vi.mock('../../components/layout/admin/Sidebar', () => ({ default: () => null }));
vi.mock('../../components/layout/admin/Header', () => ({ default: () => null }));
vi.mock('../../features/ai/AiChatbot', () => ({ default: () => null }));
vi.mock('../../components/layout/CreditWarningBanner', () => ({ default: () => null }));
vi.mock('../../features/auth/components/TrialWelcomeModal', () => ({ default: () => null }));

// Stub PlanExpiryModal để kiểm tra logic anyGateOpen
vi.mock('../../features/auth/components/PlanExpiryModal', () => ({
  default: ({ isOpen }) => (isOpen ? <div data-testid="plan-expiry-modal-open" /> : null),
}));

// Stub các modal cổng cũ (nếu có ai lỡ import lại sẽ bị phát hiện)
vi.mock('../../features/auth/components/ChangePasswordModal', () => ({
  default: () => <div data-testid="unexpected-change-password-modal" />,
}));
vi.mock('../../features/auth/components/PhoneRequiredModal', () => ({
  default: () => <div data-testid="unexpected-phone-modal" />,
}));
vi.mock('../../features/auth/components/ConsentRequiredModal', () => ({
  default: () => <div data-testid="unexpected-consent-modal" />,
}));

const renderLayout = () =>
  render(
    <MemoryRouter initialEntries={['/app']}>
      <MainLayout />
    </MemoryRouter>
  );

describe('MainLayout — cổng sau đăng nhập đã chuyển ra toàn cục (PR-B)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    mAuth.user = { id: 1, role: 'user' };
    mAuth.billingStatus = {
      hasPlan: true,
      isFullyExpired: false,
      isInGracePeriod: false,
      daysUntilExpiry: 3,
    };
    mGates.anyGateOpen = false;
  });

  it('MainLayout không tự render modal cổng (ConsentRequiredModal, PhoneRequiredModal, ChangePasswordModal)', () => {
    renderLayout();

    expect(screen.queryByTestId('unexpected-change-password-modal')).not.toBeInTheDocument();
    expect(screen.queryByTestId('unexpected-phone-modal')).not.toBeInTheDocument();
    expect(screen.queryByTestId('unexpected-consent-modal')).not.toBeInTheDocument();
  });

  it('modal hết hạn gói KHÔNG hiện khi anyGateOpen = true (cổng đang mở)', () => {
    mGates.anyGateOpen = true;

    renderLayout();

    expect(screen.queryByTestId('plan-expiry-modal-open')).not.toBeInTheDocument();
  });

  it('modal hết hạn gói HIỆN khi anyGateOpen = false và tài khoản có cảnh báo hết hạn', () => {
    mGates.anyGateOpen = false;

    renderLayout();

    expect(screen.getAllByTestId('plan-expiry-modal-open').length).toBeGreaterThan(0);
  });
});
