import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import MainLayout from '../MainLayout';

/**
 * PR-2 (xác thực SĐT) — _internal/PLAN_XAC_THUC_SDT_OTP_2026-09-11.md mục 4 PR-2 việc 9.
 * Chỉ kiểm phoneRequired/PhoneRequiredModal — mock hết phần vỏ layout (Sidebar/Header/
 * AiChatbot/...) và các modal khác để cô lập đúng thứ cần test.
 */
const stableT = (key) => key;
vi.mock('../../i18n', () => ({ useI18n: () => ({ t: stableT }) }));

const m = vi.hoisted(() => ({
  user: null,
  phoneOtpEnabled: false,
  updateUser: vi.fn(),
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
vi.mock('../../features/auth/components/ConsentRequiredModal', () => ({ default: () => null }));
vi.mock('../../features/auth/components/TrialWelcomeModal', () => ({ default: () => null }));

// Stub PhoneRequiredModal — chỉ quan tâm prop isOpen có đúng giá trị hay không, không cần
// hành vi hai bước thật (đã có test riêng ở PhoneRequiredModal.spec.jsx).
vi.mock('../../features/auth/components/PhoneRequiredModal', () => ({
  default: ({ isOpen }) => (isOpen ? <div data-testid="phone-required-modal-open" /> : null),
}));

const renderLayout = () =>
  render(
    <MemoryRouter>
      <MainLayout />
    </MemoryRouter>
  );

describe('MainLayout — phoneRequired theo phoneOtpEnabled + phoneVerifiedAt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('cờ tắt + user có phone → KHÔNG hiện modal (hành vi hôm nay)', () => {
    m.phoneOtpEnabled = false;
    m.user = { id: 1, phone: '0912345678', phoneVerifiedAt: null, role: 'user', mustChangePassword: false, hasConsented: true };

    renderLayout();

    expect(screen.queryByTestId('phone-required-modal-open')).not.toBeInTheDocument();
  });

  it('cờ bật + có phone nhưng phoneVerifiedAt null → HIỆN modal', () => {
    m.phoneOtpEnabled = true;
    m.user = { id: 1, phone: '0912345678', phoneVerifiedAt: null, role: 'user', mustChangePassword: false, hasConsented: true };

    renderLayout();

    expect(screen.getAllByTestId('phone-required-modal-open').length).toBeGreaterThan(0);
  });

  it('cờ bật + phoneVerifiedAt có giá trị → KHÔNG hiện modal', () => {
    m.phoneOtpEnabled = true;
    m.user = {
      id: 1,
      phone: '0912345678',
      phoneVerifiedAt: '2026-09-11T10:00:00.000Z',
      role: 'user',
      mustChangePassword: false,
      hasConsented: true,
    };

    renderLayout();

    expect(screen.queryByTestId('phone-required-modal-open')).not.toBeInTheDocument();
  });

  it('user chưa có phone (bất kể cờ) → vẫn hiện modal như luật cũ', () => {
    m.phoneOtpEnabled = false;
    m.user = { id: 1, phone: null, phoneVerifiedAt: null, role: 'user', mustChangePassword: false, hasConsented: true };

    renderLayout();

    expect(screen.getAllByTestId('phone-required-modal-open').length).toBeGreaterThan(0);
  });

  it('mustChangePassword=true → KHÔNG hiện modal SĐT dù thiếu số (đổi mật khẩu trước)', () => {
    m.phoneOtpEnabled = true;
    m.user = { id: 1, phone: null, phoneVerifiedAt: null, role: 'user', mustChangePassword: true, hasConsented: true };

    renderLayout();

    expect(screen.queryByTestId('phone-required-modal-open')).not.toBeInTheDocument();
  });

  it('role=admin → không hiện modal dù thiếu số/chưa xác thực (bypass superadmin)', () => {
    m.phoneOtpEnabled = true;
    m.user = { id: 1, phone: null, phoneVerifiedAt: null, role: 'admin', mustChangePassword: false, hasConsented: true };

    renderLayout();

    expect(screen.queryByTestId('phone-required-modal-open')).not.toBeInTheDocument();
  });
});
