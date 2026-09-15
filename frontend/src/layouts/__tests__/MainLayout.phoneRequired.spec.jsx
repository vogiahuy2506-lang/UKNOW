import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import MainLayout from '../MainLayout';

const stableT = (key) => key;
vi.mock('../../i18n', () => ({ useI18n: () => ({ t: stableT }) }));

const m = vi.hoisted(() => ({
  user: null,
  phoneOtpEnabled: false,
  fetchAiCredits: vi.fn().mockResolvedValue(undefined),
  isAuthenticated: true,
  activeContext: { type: 'self' },
}));

vi.mock('../../stores/authStore', () => ({
  useAuthStore: (selector) => (selector ? selector(m) : m),
  trialWelcomeKey: (id) => `trial-${id}`,
}));

vi.mock('../../features/auth/hooks/usePostAuthGates', () => ({
  usePostAuthGates: () => ({
    anyGateOpen: false,
    mustChangePassword: false,
    consentRequired: false,
    phoneRequired: false,
  }),
}));

vi.mock('../../components/layout/admin/Sidebar', () => ({ default: () => null }));
vi.mock('../../components/layout/admin/Header', () => ({ default: () => null }));
vi.mock('../../features/ai/AiChatbot', () => ({ default: () => null }));
vi.mock('../../components/layout/CreditWarningBanner', () => ({ default: () => null }));
vi.mock('../../features/auth/components/TrialWelcomeModal', () => ({ default: () => null }));
vi.mock('../../features/auth/components/PlanExpiryModal', () => ({ default: () => null }));

// Stub PhoneRequiredModal nếu bị lỡ import vào MainLayout
vi.mock('../../features/auth/components/PhoneRequiredModal', () => ({
  default: ({ isOpen }) => (isOpen ? <div data-testid="unexpected-phone-modal-open" /> : null),
}));

const renderLayout = () =>
  render(
    <MemoryRouter>
      <MainLayout />
    </MemoryRouter>
  );

describe('MainLayout — phoneRequired đã chuyển sang PostAuthGateModals (PR-B)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.user = { id: 1, phone: null, phoneVerifiedAt: null, role: 'user', mustChangePassword: false, hasConsented: true };
    m.phoneOtpEnabled = true;
  });

  it('MainLayout không tự render PhoneRequiredModal dù user thiếu số', () => {
    renderLayout();

    expect(screen.queryByTestId('unexpected-phone-modal-open')).not.toBeInTheDocument();
  });
});
