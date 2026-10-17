import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
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
vi.mock('../../components/layout/admin/Header', () => ({ default: () => <div data-testid="global-header" /> }));
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

  it('/app/campaigns/123/builder → <main> không padding, không bo góc viền, ẩn header toàn cục', () => {
    renderAt('/app/campaigns/123/builder');

    const main = screen.getByRole('main');
    expect(main.className.split(' ')).not.toContain('p-2');
    expect(main.className.split(' ')).toContain('rounded-none');
    expect(main.className.split(' ')).toContain('border-0');
    expect(screen.queryByTestId('credit-banner')).not.toBeInTheDocument();
    expect(screen.queryByTestId('global-header')).not.toBeInTheDocument();
  });

  it('/app/campaigns/new → cũng là trình dựng, cùng luật', () => {
    renderAt('/app/campaigns/new');

    const main = screen.getByRole('main');
    expect(main.className.split(' ')).not.toContain('p-2');
    expect(main.className.split(' ')).toContain('rounded-none');
    expect(main.className.split(' ')).toContain('border-0');
    expect(screen.queryByTestId('credit-banner')).not.toBeInTheDocument();
    expect(screen.queryByTestId('global-header')).not.toBeInTheDocument();
  });

  it('/app/campaigns (danh sách) → trang thường: có padding, có header và banner credit', () => {
    renderAt('/app/campaigns');

    expect(screen.getByRole('main').className.split(' ')).toContain('p-2');
    expect(screen.getByTestId('credit-banner')).toBeInTheDocument();
    expect(screen.getByTestId('global-header')).toBeInTheDocument();
  });
});

describe('MainLayout — trình soạn Biểu mẫu là trang soạn tràn màn (isFormEditor)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(['/app/forms/new', '/app/forms/12/edit', '/app/forms/12/edit/'])(
    '%s → <main> không đệm, không bo góc / viền, không banner credit',
    (path) => {
      renderAt(path);

      const classes = screen.getByRole('main').className.split(' ');
      expect(classes).not.toContain('p-2');
      expect(classes).toContain('rounded-none');
      expect(classes).toContain('border-0');
      expect(screen.queryByTestId('credit-banner')).not.toBeInTheDocument();
    }
  );

  it.each(['/app/forms', '/app/forms/12/submissions', '/app/forms/new/extra'])(
    '%s → trang thường: có đệm, bo góc và banner credit',
    (path) => {
      renderAt(path);

      const classes = screen.getByRole('main').className.split(' ');
      expect(classes).toContain('p-2');
      expect(classes).not.toContain('rounded-none');
      expect(screen.getByTestId('credit-banner')).toBeInTheDocument();
    }
  );
});

describe('MainLayout — các trang soạn quản trị là editor tràn màn (isAdminEditor)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(['/admin/landing-customizer', '/admin/welcome-email', '/admin/notification-center'])(
    '%s → <main> không đệm, tràn màn và không banner credit',
    (path) => {
      renderAt(path);

      const classes = screen.getByRole('main').className.split(' ');
      expect(classes).not.toContain('p-2');
      expect(classes).toContain('rounded-none');
      expect(classes).toContain('border-0');
      expect(screen.queryByTestId('credit-banner')).not.toBeInTheDocument();
    }
  );
});

describe('MainLayout — khi mở modal soạn template (template-editor:change)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('mở modal template → ẩn header, đóng modal → hiện lại header', () => {
    renderAt('/app/settings/templates');

    // Mặc định ở trang templates: header hiển thị
    expect(screen.getByTestId('global-header')).toBeInTheDocument();

    // Mở modal template editor
    act(() => {
      window.dispatchEvent(new CustomEvent('template-editor:change', { detail: { open: true } }));
    });
    expect(screen.queryByTestId('global-header')).not.toBeInTheDocument();

    // Đóng modal template editor
    act(() => {
      window.dispatchEvent(new CustomEvent('template-editor:change', { detail: { open: false } }));
    });
    expect(screen.getByTestId('global-header')).toBeInTheDocument();
  });

  it('sidebar đang MỞ: mở modal thu sidebar, đóng modal mở lại (không đổi hẳn lựa chọn lưu localStorage)', () => {
    localStorage.setItem('founder_ai_sidebar_open', 'true');
    renderAt('/app/settings/templates');
    const sidebarW = () => document.documentElement.style.getPropertyValue('--sidebar-w');
    expect(sidebarW()).toBe('220px');

    act(() => {
      window.dispatchEvent(new CustomEvent('template-editor:change', { detail: { open: true } }));
    });
    expect(sidebarW()).toBe('44px');

    act(() => {
      window.dispatchEvent(new CustomEvent('template-editor:change', { detail: { open: false } }));
    });
    expect(sidebarW()).toBe('220px');
    expect(localStorage.getItem('founder_ai_sidebar_open')).toBe('true');
    localStorage.removeItem('founder_ai_sidebar_open');
  });

  it('sidebar đang THU: đóng modal vẫn giữ thu', () => {
    localStorage.setItem('founder_ai_sidebar_open', 'false');
    renderAt('/app/settings/templates');

    act(() => {
      window.dispatchEvent(new CustomEvent('template-editor:change', { detail: { open: true } }));
    });
    act(() => {
      window.dispatchEvent(new CustomEvent('template-editor:change', { detail: { open: false } }));
    });
    expect(document.documentElement.style.getPropertyValue('--sidebar-w')).toBe('44px');
    expect(localStorage.getItem('founder_ai_sidebar_open')).toBe('false');
    localStorage.removeItem('founder_ai_sidebar_open');
  });
});
