import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import MainLayout from '../MainLayout';

/**
 * Dọn nợ 13/09/2026 (sau PLAN_GOP_TRANG_CHIEN_DICH_MOT_MUC_2026-09-12): `isFullLayout` so
 * `startsWith('/campaigns')` trong khi route nằm dưới `/app` từ commit đầu → cờ chưa bao giờ true,
 * trình dựng luôn bị bọc padding + banner credit như trang thường. Spec này ghim ý đồ gốc:
 * trình dựng là full-screen editor.
 */
const stableT = (key) => key;
vi.mock('../../i18n', () => ({ useI18n: () => ({ t: stableT }) }));

const m = vi.hoisted(() => ({
  user: { id: 1, phone: '0912345678', phoneVerifiedAt: '2026-01-01T00:00:00Z', role: 'user', mustChangePassword: false, hasConsented: true },
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

vi.mock('../../hooks/useIsMobile', () => ({ default: () => false }));
vi.mock('../../components/layout/admin/Sidebar', () => ({ default: () => null }));
vi.mock('../../components/layout/admin/Header', () => ({ default: () => null }));
vi.mock('../../features/ai/AiChatbot', () => ({ default: () => null }));
vi.mock('../../components/layout/CreditWarningBanner', () => ({
  default: () => <div data-testid="credit-banner" />,
}));
vi.mock('../../features/auth/components/ChangePasswordModal', () => ({ default: () => null }));
vi.mock('../../features/auth/components/ConsentRequiredModal', () => ({ default: () => null }));
vi.mock('../../features/auth/components/TrialWelcomeModal', () => ({ default: () => null }));
vi.mock('../../features/auth/components/PhoneRequiredModal', () => ({ default: () => null }));

const renderAt = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <MainLayout />
    </MemoryRouter>
  );

describe('MainLayout — trình dựng chiến dịch là full-screen editor (isFullLayout)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('/app/campaigns/123/builder → <main> không padding, không banner credit', () => {
    renderAt('/app/campaigns/123/builder');

    const main = screen.getByRole('main');
    expect(main.className.split(' ')).not.toContain('p-2');
    expect(screen.queryByTestId('credit-banner')).not.toBeInTheDocument();
  });

  it('/app/campaigns/new → cũng là trình dựng, cùng luật', () => {
    renderAt('/app/campaigns/new');

    expect(screen.getByRole('main').className.split(' ')).not.toContain('p-2');
    expect(screen.queryByTestId('credit-banner')).not.toBeInTheDocument();
  });

  it('/app/campaigns (danh sách) → trang thường: có padding và banner credit', () => {
    renderAt('/app/campaigns');

    expect(screen.getByRole('main').className.split(' ')).toContain('p-2');
    expect(screen.getByTestId('credit-banner')).toBeInTheDocument();
  });
});
