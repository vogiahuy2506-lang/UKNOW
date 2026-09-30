/**
 * PLAN_SO_LIEU_DUNG_GON_KHOP_2026-09-30, PR-5 — trang Báo cáo gọn: 4 thẻ + 1 biểu đồ + 1 bảng; chủ thấy thêm khối đơn
 * hàng, nhân viên KHÔNG (ẩn hẳn khối, không hiện bảng rỗng); không còn 3 donut / bảng lượt chạy / bảng landing.
 * Store thật (activeContext), chỉ giả hook dữ liệu và các khối nặng không thuộc điều kiện kiểm.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../i18n', async () => (await import('../../test/realI18n.js')).realI18nModule());
vi.mock('../../services/api', () => ({
  default: { get: vi.fn(), post: vi.fn() },
  setAuthStore: vi.fn(),
}));

const hook = vi.hoisted(() => ({ useDashboardAnalytics: vi.fn() }));
vi.mock('../../features/dashboard/hooks/useDashboardAnalytics', () => hook);
vi.mock('../../features/dashboard/services/dashboardApi.service', () => ({
  default: {
    getSavedInsight: vi.fn().mockResolvedValue({ data: { data: null } }),
    generateInsights: vi.fn(),
  },
}));

// Khối nặng / có dữ liệu riêng: thay bằng dấu hiệu để kiểm "có / không có mặt".
vi.mock('../../features/dashboard/components/DashboardOrdersChart', () => ({ default: () => <div data-testid="orders-chart" /> }));
vi.mock('../../features/dashboard/components/DashboardOrdersListTable', () => ({ default: () => <div data-testid="orders-list" /> }));
vi.mock('../../features/dashboard/components/DashboardFilterPanel', () => ({ default: () => null }));
vi.mock('../../features/dashboard/components/DashboardPrintLayout', () => ({ default: () => <div data-testid="print-layout" /> }));
vi.mock('../../components/EmployeeMyContributionCard', () => ({ default: () => <div data-testid="my-contribution" /> }));
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }) => <div>{children}</div>,
  BarChart: ({ children }) => <div data-testid="sent-bar-chart">{children}</div>,
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  Legend: () => null,
  CartesianGrid: () => null,
}));

const { useAuthStore } = await import('../../stores/authStore');
const { default: Dashboard } = await import('../Dashboard');

const data = () => ({
  overview: {
    filters: {},
    sent: { total: 15, byChannel: [{ channel: 'email', sent: 8 }], friendRequests: 0 },
    failed: { total: 3 },
    email: { sent: 8, opened: 3, clicked: 1, openRate: 37.5, clickRate: 12.5 },
    clicks: { total: 1, byChannel: [] },
    orders: { completed: 1, pending: 1, byChannel: [{ channel: 'email', completed: 1, pending: 1 }] },
  },
  analytics: {
    dailySent: [{ date: '2026-09-30', total: 8, email: 8, zalo_personal: 0, zalo_group: 0, telegram: 0, whatsapp: 0 }],
    ordersTimeline: [],
  },
  campaignsData: [{ campaignId: 1, campaignName: 'CA Email', campaignType: 'email', sent: 8, failed: 1, opened: 3, clicked: 1, purchased: 2 }],
  ordersData: { items: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } },
  ordersStatusFilter: 'all',
  campaignOptions: [],
  filters: { startDate: '2026-09-01', endDate: '2026-09-30', campaignType: 'all', campaignIds: [] },
  draftFilters: { startDate: '2026-09-01', endDate: '2026-09-30', campaignType: 'all', campaignIds: [] },
  setDraftFilters: vi.fn(),
  applyFilters: vi.fn(),
  isLoading: false,
  isLoadingOrders: false,
  errorMessage: '',
  loadOrdersPage: vi.fn(),
});

const seed = (activeContext) => {
  useAuthStore.setState({
    user: { id: 7, username: 'u', role: 'user', memberships: [] },
    isAuthenticated: true,
    activeContext,
  });
};
const renderPage = () => render(<MemoryRouter><Dashboard /></MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
  hook.useDashboardAnalytics.mockReturnValue(data());
});

describe('Dashboard (Báo cáo) — chủ tài khoản', () => {
  beforeEach(() => seed({ type: 'self' }));

  it('tiêu đề "Báo cáo", 4 thẻ, MỘT biểu đồ "Đã gửi mỗi ngày", bảng "Chiến dịch trong kỳ"', () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Báo cáo');
    expect(screen.getAllByTestId(/^kpi-(sent|failed|email|customers)$/)).toHaveLength(4);
    expect(screen.getAllByTestId('sent-bar-chart')).toHaveLength(1);
    expect(screen.getByText('Đã gửi mỗi ngày')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-campaigns-table')).toHaveTextContent('CA Email');
  });

  it('chủ thấy khối đơn hàng (biểu đồ + danh sách) và hook được gọi với includeOrders = true', () => {
    renderPage();
    expect(screen.getByTestId('orders-chart')).toBeInTheDocument();
    expect(screen.getByTestId('orders-list')).toBeInTheDocument();
    expect(hook.useDashboardAnalytics).toHaveBeenCalledWith({ includeOrders: true });
  });

  it('không còn donut / top charts / bảng lượt chạy / bảng landing / tab kênh / thẻ "Tổng chiến dịch"', () => {
    renderPage();
    const text = document.body.textContent;
    for (const gone of [
      'Bảng lượt chạy',
      'Cơ cấu',
      'Top chiến dịch',
      'Top khóa học',
      'Tương tác theo kênh',
      'Tổng chiến dịch',
      'Landing pages',
      'Slug',
    ]) {
      expect(text).not.toContain(gone);
    }
    expect(screen.queryByRole('table', { name: /lượt chạy/i })).not.toBeInTheDocument();
  });

  it('thay bảng lượt chạy và bảng landing bằng hai link', () => {
    renderPage();
    expect(screen.getByRole('link', { name: /Xem lượt chạy ở Giám sát gửi tin/ })).toHaveAttribute('href', '/app/delivery-monitor');
    expect(screen.getByRole('link', { name: /Xem thống kê landing/ })).toBeInTheDocument();
  });

  it('giữ nút "In / PDF" và "Phân tích insight"', () => {
    renderPage();
    expect(screen.getByRole('button', { name: /In \/ PDF/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Phân tích insight/ })).toBeInTheDocument();
  });
});

describe('Dashboard (Báo cáo) — nhân viên', () => {
  it('KHÔNG có khối đơn hàng (ẩn hẳn, không bảng rỗng), hook không xin danh sách đơn; số công ty vẫn hiện', () => {
    seed({ type: 'employee', ownerId: 10, permissions: { reports_view: true } });
    renderPage();
    expect(screen.queryByTestId('orders-chart')).not.toBeInTheDocument();
    expect(screen.queryByTestId('orders-list')).not.toBeInTheDocument();
    expect(hook.useDashboardAnalytics).toHaveBeenCalledWith({ includeOrders: false });
    expect(screen.getAllByTestId(/^kpi-(sent|failed|email|customers)$/)).toHaveLength(4);
    expect(screen.getByTestId('dashboard-campaigns-table')).toBeInTheDocument();
    expect(screen.getByTestId('my-contribution')).toBeInTheDocument();
  });

  it('link chỉ hiện khi nhân viên có quyền mở trang đích (Giám sát gửi tin cần campaigns_view)', () => {
    seed({ type: 'employee', ownerId: 10, permissions: { reports_view: true } });
    const { unmount } = renderPage();
    expect(screen.queryByRole('link', { name: /Giám sát gửi tin/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /thống kê landing/ })).not.toBeInTheDocument();
    unmount();

    seed({ type: 'employee', ownerId: 10, permissions: { reports_view: true, campaigns_view: true } });
    renderPage();
    expect(screen.getByRole('link', { name: /Giám sát gửi tin/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /thống kê landing/ })).not.toBeInTheDocument();
  });
});
