/**
 * PLAN_SO_LIEU_DUNG_GON_KHOP_2026-09-30, PR-5 — trang Báo cáo gọn: 4 thẻ + 1 biểu đồ + 1 bảng; chủ thấy thêm khối đơn
 * hàng, nhân viên KHÔNG (ẩn hẳn khối, không hiện bảng rỗng); không còn 3 donut / bảng lượt chạy / bảng landing.
 * Store thật (activeContext), chỉ giả hook dữ liệu và các khối nặng không thuộc điều kiện kiểm.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../i18n', async () => (await import('../../test/realI18n.js')).realI18nModule());
vi.mock('../../services/api', () => ({
  default: { get: vi.fn(), post: vi.fn() },
  setAuthStore: vi.fn(),
}));

const hook = vi.hoisted(() => ({ useDashboardAnalytics: vi.fn() }));
vi.mock('../../features/dashboard/hooks/useDashboardAnalytics', () => hook);
const api = vi.hoisted(() => ({ getSavedInsight: vi.fn(), generateInsights: vi.fn() }));
vi.mock('../../features/dashboard/services/dashboardApi.service', () => ({ default: api }));

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

const FILTERS = { startDate: '2026-09-01', endDate: '2026-09-30', campaignType: 'all', campaignIds: [] };
const INSIGHT = {
  overview: 'Câu một. Câu hai. Câu ba. Câu bốn.',
  key_metrics_analysis: { open_rate: { value: '37,5%' } },
  insights: [{ title: 'Điểm đáng chú ý X', detail: 'chi tiết X' }],
  action_plan: [{ action: 'Việc A' }, { action: 'Việc B' }, { action: 'Việc C' }, { action: 'Việc D' }],
  risk_warning: 'Cảnh báo Y',
};
const savedResponse = (over = {}) => ({
  data: { data: { savedAt: new Date().toISOString(), filtersSnapshot: FILTERS, insights: INSIGHT, ...over } },
});
/** Có đơn trong kỳ (chờ hoặc đã mua) → khối đơn hàng hiện cho chủ tài khoản. */
const withNoOrders = () => {
  const d = data();
  d.overview.orders = { completed: 0, pending: 0, byChannel: [] };
  d.analytics.ordersTimeline = [];
  hook.useDashboardAnalytics.mockReturnValue(d);
};

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
  hook.useDashboardAnalytics.mockReturnValue(data());
  api.getSavedInsight.mockResolvedValue({ data: { data: null } });
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

  it('đầu trang: một nút chính "Phân tích bằng AI" + nút in; không còn "Xem insight đã lưu"', () => {
    renderPage();
    expect(screen.getByRole('button', { name: 'Phân tích bằng AI' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /In \/ PDF/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /insight đã lưu/i })).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain('Đang hiển thị insight đã lưu');
  });

  it('không có đơn trong kỳ → KHÔNG có biểu đồ đơn hàng và KHÔNG có danh sách đơn', () => {
    withNoOrders();
    renderPage();
    expect(screen.queryByTestId('orders-chart')).not.toBeInTheDocument();
    expect(screen.queryByTestId('orders-list')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('sent-bar-chart')).toHaveLength(1);
  });

  it('chỉ có đơn ở chuỗi thời gian (overview 0) vẫn tính là có đơn', () => {
    const d = data();
    d.overview.orders = { completed: 0, pending: 0, byChannel: [] };
    d.analytics.ordersTimeline = [{ date: '2026-09-30', pendingOrders: 1, completedOrders: 0 }];
    hook.useDashboardAnalytics.mockReturnValue(d);
    renderPage();
    expect(screen.getByTestId('orders-chart')).toBeInTheDocument();
    expect(screen.getByTestId('orders-list')).toBeInTheDocument();
  });

  it('bản in nằm trong khung fixed cao 0 (không kéo dài trang), không còn absolute -14000px', () => {
    renderPage();
    const frame = screen.getByTestId('dashboard-print-frame');
    expect(frame.className).toMatch(/\bfixed\b/);
    expect(frame.className).toMatch(/\bh-0\b/);
    expect(frame.className).toMatch(/overflow-hidden/);
    expect(frame.className).not.toMatch(/absolute/);
    expect(within(frame).getByTestId('print-layout')).toBeInTheDocument();
    expect(frame.innerHTML).not.toContain('-14000px');
  });

  it('chưa có phân tích → một dòng mời bấm nút, không có khối chữ AI dưới biểu đồ', () => {
    renderPage();
    expect(screen.getByTestId('ai-insight-card')).toHaveTextContent('Bấm "Phân tích bằng AI"');
    expect(screen.queryByText(/Insight · Đã gửi mỗi ngày/)).not.toBeInTheDocument();
  });

  it('thẻ AI mặc định: tổng quan tối đa 3 câu + tối đa 3 việc nên làm; "Xem chi tiết" mở phần đầy đủ', async () => {
    api.getSavedInsight.mockResolvedValue(savedResponse());
    renderPage();
    const card = await screen.findByTestId('ai-insight-compact');
    expect(card).toHaveTextContent('Câu một. Câu hai. Câu ba.');
    expect(card).not.toHaveTextContent('Câu bốn');
    expect(within(card).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Việc A', 'Việc B', 'Việc C']);
    expect(screen.queryByText('Điểm đáng chú ý X')).not.toBeInTheDocument();
    expect(screen.queryByText('Cảnh báo Y')).not.toBeInTheDocument();
    expect(screen.getByTestId('ai-insight-saved-at')).toHaveTextContent('Phân tích lúc');

    fireEvent.click(screen.getByRole('button', { name: 'Xem chi tiết' }));
    expect(screen.getByTestId('ai-insight-detail')).toBeInTheDocument();
    expect(screen.getByText('Điểm đáng chú ý X')).toBeInTheDocument();
    expect(screen.getByText('Việc D')).toBeInTheDocument();
    expect(screen.getByText('Cảnh báo Y')).toBeInTheDocument();
  });

  it('bản đã lưu KHÁC bộ lọc đang xem → không hiện, thẻ ở trạng thái mời phân tích', async () => {
    api.getSavedInsight.mockResolvedValue(savedResponse({ filtersSnapshot: { ...FILTERS, campaignType: 'zalo_group' } }));
    renderPage();
    await waitFor(() => expect(api.getSavedInsight).toHaveBeenCalled());
    await screen.findByTestId('ai-insight-card');
    expect(screen.getByTestId('ai-insight-card')).toHaveTextContent('Bấm "Phân tích bằng AI"');
    expect(screen.queryByTestId('ai-insight-compact')).not.toBeInTheDocument();
  });

  it('bản đã lưu không ghi bộ lọc → không hiện', async () => {
    api.getSavedInsight.mockResolvedValue(savedResponse({ filtersSnapshot: null }));
    renderPage();
    await waitFor(() => expect(api.getSavedInsight).toHaveBeenCalled());
    expect(screen.queryByTestId('ai-insight-compact')).not.toBeInTheDocument();
  });

  it('bản đã lưu TRÙNG bộ lọc → hiện kèm "Phân tích lúc"; đổi bộ lọc → ẩn', async () => {
    api.getSavedInsight.mockResolvedValue(savedResponse());
    const { rerender } = renderPage();
    expect(await screen.findByTestId('ai-insight-compact')).toBeInTheDocument();
    expect(screen.getByTestId('ai-insight-saved-at')).toHaveTextContent('Phân tích lúc');

    const changed = data();
    changed.filters = { ...FILTERS, endDate: '2026-10-03' };
    hook.useDashboardAnalytics.mockReturnValue(changed);
    rerender(<MemoryRouter><Dashboard /></MemoryRouter>);
    expect(screen.queryByTestId('ai-insight-compact')).not.toBeInTheDocument();
    expect(screen.getByTestId('ai-insight-card')).toHaveTextContent('Bấm "Phân tích bằng AI"');
  });

  it('phân tích vừa tạo gắn với bộ lọc lúc bấm: giữ khi đúng bộ lọc, ẩn khi đổi', async () => {
    api.generateInsights.mockResolvedValue({ data: { success: true, data: INSIGHT } });
    const { rerender } = renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Phân tích bằng AI' }));
    expect(await screen.findByTestId('ai-insight-compact')).toBeInTheDocument();
    expect(api.generateInsights).toHaveBeenCalledWith(expect.objectContaining({ filters: FILTERS }));

    const changed = data();
    changed.filters = { ...FILTERS, campaignType: 'email' };
    hook.useDashboardAnalytics.mockReturnValue(changed);
    rerender(<MemoryRouter><Dashboard /></MemoryRouter>);
    expect(screen.queryByTestId('ai-insight-compact')).not.toBeInTheDocument();
  });
});

describe('Dashboard (Báo cáo) — nhân viên', () => {
  it('KHÔNG có khối đơn hàng (ẩn hẳn, không bảng rỗng), hook không xin danh sách đơn; số công ty vẫn hiện', () => {
    seed({ type: 'employee', ownerId: 10, permissions: { reports_view: true } });
    renderPage();
    // Dữ liệu CÓ đơn, nhưng nhân viên không quyền xem đơn → vẫn ẩn.
    expect(data().overview.orders.completed + data().overview.orders.pending).toBeGreaterThan(0);
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
