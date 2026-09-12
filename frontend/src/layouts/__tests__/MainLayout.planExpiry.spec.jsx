import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route, Link } from 'react-router-dom';
import MainLayout from '../MainLayout';
import { planExpiryDismissKey } from '../../utils/billingProfile.util';

const stableT = (key) => key;
vi.mock('../../i18n', () => ({ useI18n: () => ({ t: stableT }) }));

const m = vi.hoisted(() => ({
  user: null,
  phoneOtpEnabled: false,
  updateUser: vi.fn(),
  fetchAiCredits: vi.fn().mockResolvedValue(undefined),
  isAuthenticated: true,
  activeContext: { type: 'self' },
  billingStatus: null,
}));

vi.mock('../../stores/authStore', () => ({
  useAuthStore: (selector) => (selector ? selector(m) : m),
  trialWelcomeKey: (id) => `trial-${id}`,
}));

vi.mock('../../components/layout/admin/Sidebar', () => ({
  default: () => (
    <aside>
      <Link to="/app/reports">Tổng quan</Link>
    </aside>
  ),
}));
vi.mock('../../components/layout/admin/Header', () => ({ default: () => null }));
vi.mock('../../features/ai/AiChatbot', () => ({ default: () => null }));
vi.mock('../../components/layout/CreditWarningBanner', () => ({ default: () => null }));
vi.mock('../../features/auth/components/ChangePasswordModal', () => ({ default: () => null }));
vi.mock('../../features/auth/components/PhoneRequiredModal', () => ({ default: () => null }));
vi.mock('../../features/auth/components/ConsentRequiredModal', () => ({ default: () => null }));
vi.mock('../../features/auth/components/TrialWelcomeModal', () => ({ default: () => null }));

// Stub PlanExpiryModal để kiểm tra trạng thái mở/đóng trong MainLayout
vi.mock('../../features/auth/components/PlanExpiryModal', () => ({
  default: ({ isOpen, onClose, billingStatus }) =>
    isOpen ? (
      <div data-testid="plan-expiry-modal-open">
        <button onClick={onClose}>Đóng popup</button>
        <span data-testid="expiry-status">{JSON.stringify(billingStatus)}</span>
      </div>
    ) : null,
}));

const renderLayout = (initialRoute = '/app') =>
  render(
    <MemoryRouter initialEntries={[initialRoute]}>
      <Routes>
        <Route path="/app" element={<MainLayout />}>
          <Route path="reports" element={<div data-testid="reports-page">Trang Báo Cáo Dashboard</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );

describe('MainLayout — PlanExpiryModal theo PR-1 mục 3 và 5', () => {
  const baseUser = {
    id: 100,
    role: 'user',
    phone: '0912345678',
    phoneVerifiedAt: '2026-09-10T00:00:00Z',
    hasConsented: true,
    mustChangePassword: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    localStorage.clear();
    m.user = { ...baseUser };
    m.activeContext = { type: 'self' };
    m.phoneOtpEnabled = false;
    m.billingStatus = null;
  });

  it('Ca 1: Chủ TK, gói còn 4 ngày (daysUntilExpiry = 4) → KHÔNG hiện modal', () => {
    m.billingStatus = {
      hasPlan: true,
      isFullyExpired: false,
      isInGracePeriod: false,
      daysUntilExpiry: 4,
    };

    renderLayout();
    expect(screen.queryByTestId('plan-expiry-modal-open')).not.toBeInTheDocument();
  });

  it('Ca 2: Chủ TK, gói còn 3 ngày (daysUntilExpiry = 3) → HIỆN modal', () => {
    m.billingStatus = {
      hasPlan: true,
      isFullyExpired: false,
      isInGracePeriod: false,
      daysUntilExpiry: 3,
    };

    renderLayout();
    expect(screen.getByTestId('plan-expiry-modal-open')).toBeInTheDocument();
  });

  it('Ca 6: Nhân viên của chủ TK sắp hết hạn (activeContext.type = "employee") → KHÔNG hiện modal', () => {
    m.activeContext = { type: 'employee', ownerId: 999 };
    m.billingStatus = {
      hasPlan: true,
      isFullyExpired: false,
      isInGracePeriod: false,
      daysUntilExpiry: 3,
    };

    renderLayout();
    expect(screen.queryByTestId('plan-expiry-modal-open')).not.toBeInTheDocument();
  });

  it('Ca 7: Superadmin (user.role = "admin") → KHÔNG hiện modal', () => {
    m.user.role = 'admin';
    m.billingStatus = {
      hasPlan: true,
      isFullyExpired: true,
    };

    renderLayout();
    expect(screen.queryByTestId('plan-expiry-modal-open')).not.toBeInTheDocument();
  });

  it('Ca 9b: Sau khi cron 08:00 thu hồi gói (planRevokedAfterExpiry = true, isFullyExpired = false) → popup VẪN HIỆN', () => {
    m.billingStatus = {
      hasPlan: false,
      activePlanId: null,
      isFullyExpired: false,
      planRevokedAfterExpiry: true,
    };

    renderLayout();
    expect(screen.getByTestId('plan-expiry-modal-open')).toBeInTheDocument();
  });

  it('Ca 9c: Tài khoản chưa từng có gói (planRevokedAfterExpiry = false, isFullyExpired = false) → KHÔNG popup', () => {
    m.billingStatus = {
      hasPlan: false,
      activePlanId: null,
      isFullyExpired: false,
      planRevokedAfterExpiry: false,
      daysUntilExpiry: null,
    };

    renderLayout();
    expect(screen.queryByTestId('plan-expiry-modal-open')).not.toBeInTheDocument();
  });

  it('Ca 3, 4, 5: Bấm tắt → lưu sessionStorage, không hiện lại trong cùng tab; xoá sessionStorage → hiện lại', () => {
    m.billingStatus = {
      hasPlan: true,
      isFullyExpired: true,
    };

    const { unmount } = renderLayout();
    expect(screen.getByTestId('plan-expiry-modal-open')).toBeInTheDocument();

    // Bấm đóng
    fireEvent.click(screen.getByText('Đóng popup'));
    expect(screen.queryByTestId('plan-expiry-modal-open')).not.toBeInTheDocument();
    expect(sessionStorage.getItem(planExpiryDismissKey(m.user.id))).toBe('true');

    unmount();

    // Render lại trong cùng tab (sessionStorage vẫn còn) → KHÔNG hiện lại (Ca 4)
    const { unmount: unmount2 } = renderLayout();
    expect(screen.queryByTestId('plan-expiry-modal-open')).not.toBeInTheDocument();

    unmount2();

    // Giả lập đóng tab mở lại (sessionStorage bị xoá) → HIỆN LẠI (Ca 5)
    sessionStorage.clear();
    renderLayout();
    expect(screen.getByTestId('plan-expiry-modal-open')).toBeInTheDocument();
  });

  it('Ca 11: Gói hết hạn, popup không chặn điều hướng — bấm menu Tổng quan vẫn vào được /app/reports', () => {
    m.billingStatus = {
      hasPlan: true,
      isFullyExpired: true,
    };

    renderLayout('/app');
    expect(screen.getByTestId('plan-expiry-modal-open')).toBeInTheDocument();

    // Bấm link menu "Tổng quan"
    const overviewLink = screen.getByText('Tổng quan');
    fireEvent.click(overviewLink);

    // Vào được trang reports
    expect(screen.getByTestId('reports-page')).toBeInTheDocument();
  });

  it('Thứ tự ưu tiên: Nhường các modal bắt buộc trước (phoneRequired, consentRequired, trial)', () => {
    m.billingStatus = { hasPlan: true, isFullyExpired: true };

    // Chưa xác thực SĐT
    m.user.phone = null;
    const { unmount: u1 } = renderLayout();
    expect(screen.queryByTestId('plan-expiry-modal-open')).not.toBeInTheDocument();
    u1();

    // Khôi phục SĐT, nhưng chưa đồng ý điều khoản
    m.user.phone = '0912345678';
    m.user.hasConsented = false;
    const { unmount: u2 } = renderLayout();
    expect(screen.queryByTestId('plan-expiry-modal-open')).not.toBeInTheDocument();
    u2();
  });
});

/**
 * MainLayout có HAI nhánh render: `if (isMobile) return (...)` thoát sớm, rồi mới tới nhánh
 * desktop. Bốn modal cũ đều được render ở CẢ HAI nhánh; PlanExpiryModal (bb6999c5) chỉ có ở
 * nhánh desktop.
 *
 * Mọi ca ở khối trên đều chạy nhánh desktop mà không ai cố ý chọn: jsdom đặt
 * window.innerWidth = 1024, còn useIsMobile là `innerWidth < 1024` → đúng false. Nên khoảng
 * trống này không thể lộ ra ở bộ test cũ.
 */
describe('MainLayout — PlanExpiryModal trên nhánh mobile', () => {
  const widthGoc = window.innerWidth;

  beforeEach(() => {
    sessionStorage.clear();
    m.user = { id: 100, role: 'user', phone: '0912345678',
      phoneVerifiedAt: '2026-09-10T00:00:00Z', hasConsented: true, mustChangePassword: false };
    m.activeContext = { type: 'self' };
    m.billingStatus = { hasPlan: true, isFullyExpired: true };
  });

  afterEach(() => {
    window.innerWidth = widthGoc;
  });

  it('màn hình hẹp (< 1024px) vẫn phải thấy popup hết hạn', () => {
    window.innerWidth = 500;
    renderLayout();
    expect(screen.getByTestId('plan-expiry-modal-open')).toBeInTheDocument();
  });

  it('ngưỡng 1024px: desktop thấy popup (chốt chặn dương — nếu ca này đỏ thì phép thử sai, không phải code sai)', () => {
    window.innerWidth = 1024;
    renderLayout();
    expect(screen.getByTestId('plan-expiry-modal-open')).toBeInTheDocument();
  });
});
