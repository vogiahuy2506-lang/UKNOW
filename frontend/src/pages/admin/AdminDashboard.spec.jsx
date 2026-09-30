import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../i18n';
import AdminDashboard from './AdminDashboard';

/**
 * PR-9 (PLAN_SO_LIEU_DUNG_GON_KHOP_2026-09-30) — Tổng quan admin gọn còn 6 số + 1 biểu đồ + 2 bảng.
 * recharts được thay bằng phần tử dò được (jsdom không có kích thước nên thư viện thật không vẽ gì): nhờ đó khẳng định
 * được "không còn biểu đồ tròn" và "biểu đồ có đủ 6 cột".
 */
const { mockGetOverview } = vi.hoisted(() => ({ mockGetOverview: vi.fn() }));

vi.mock('../../features/admin/services/adminStatsApi.service', () => ({
  default: { getOverview: mockGetOverview },
}));

vi.mock('recharts', () => {
  const Passthrough = ({ children }) => <div>{children}</div>;
  return {
    ResponsiveContainer: Passthrough,
    BarChart: ({ data, children }) => <div data-testid="bar-chart" data-points={data.length}>{children}</div>,
    Bar: () => null,
    XAxis: () => null,
    YAxis: () => null,
    CartesianGrid: () => null,
    Tooltip: () => null,
    PieChart: () => <div data-testid="pie-chart" />,
    Pie: () => null,
    Cell: () => null,
    Legend: () => null,
  };
});

const overview = {
  kpi: {
    monthKey: '2026-09',
    monthLabel: '09/2026',
    todayLabel: '30/09',
    revenueThisMonth: 919000,
    revenueBySource: { plan: 369000, topup: 50000, manual: 500000 },
    refundedThisMonth: 299000,
    revenueMomPct: 12.5,
    paidOrdersThisMonth: 4,
    totalCustomers: 8,
    payingCustomers: 4,
    trialCustomers: 3,
    newCustomersThisMonth: 6,
    newCustomersMomPct: null,
    expiringPaid7d: 1,
    attention: {
      paidAfterCancelled: { count: 2, amount: 220000 },
      stuckEinvoices: 3,
      overdueWithdrawals: 0,
      total: 5,
    },
  },
  monthlyRevenue: ['04/2026', '05/2026', '06/2026', '07/2026', '08/2026', '09/2026'].map((month, i) => ({
    month, monthKey: `2026-0${i + 4}`, revenue: i * 1000, paidOrders: i,
  })),
  recentOrders: [
    { id: 1, orderCode: '1', amount: 299000, status: 'success', createdAt: '2026-09-20T00:00:00.000Z', userEmail: 'ok@example.com', planName: 'Pro' },
    { id: 2, orderCode: '2', amount: 299000, status: 'failed', createdAt: '2026-09-19T00:00:00.000Z', userEmail: 'bad@example.com', planName: 'Pro' },
    { id: 3, orderCode: '3', amount: 299000, status: 'refunded', createdAt: '2026-09-18T00:00:00.000Z', userEmail: 'ref@example.com', planName: 'Pro' },
  ],
  recentMembers: [
    { id: 7, username: 'nguyen', fullName: 'Nguyễn Văn A', email: 'a@example.com', planName: 'Pro', createdAt: '2026-09-20T00:00:00.000Z' },
  ],
};

const renderPage = () => render(
  <MemoryRouter>
    <I18nProvider>
      <AdminDashboard />
    </I18nProvider>
  </MemoryRouter>
);

const card = (id) => screen.getByTestId(id);

describe('AdminDashboard — 6 số, 1 biểu đồ', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetOverview.mockResolvedValue({ data: { data: overview } });
  });

  it('đúng 6 thẻ: doanh thu, đơn đã trả, khách trả tiền, đăng ký mới, sắp hết hạn, cần xử lý', async () => {
    renderPage();
    await waitFor(() => expect(card('kpi-revenue')).toBeInTheDocument());
    for (const id of ['kpi-revenue', 'kpi-paid-orders', 'kpi-paying', 'kpi-new', 'kpi-expiring', 'kpi-attention']) {
      expect(card(id)).toBeInTheDocument();
    }
    expect(document.querySelectorAll('[data-testid^="kpi-"]')).toHaveLength(6);
  });

  it('doanh thu ghi tháng, nguồn "gói · mua thêm · gán tay", số đã hoàn và % so cùng kỳ', async () => {
    renderPage();
    await waitFor(() => expect(card('kpi-revenue')).toBeInTheDocument());
    const revenue = within(card('kpi-revenue'));
    expect(revenue.getByText('Doanh thu tháng 09/2026')).toBeInTheDocument();
    expect(revenue.getByText('919.000 đ')).toBeInTheDocument();
    expect(revenue.getByText(/Gói 369\.000 đ · Mua thêm 50\.000 đ · Gán tay 500\.000 đ/)).toBeInTheDocument();
    expect(revenue.getByText(/Đã hoàn: 299\.000 đ/)).toBeInTheDocument();
    expect(revenue.getByText('+12.5% so với cùng kỳ tháng trước (đến 30/09)')).toBeInTheDocument();
  });

  it('khách trả tiền kèm "dùng thử: n"; đăng ký mới không có % khi kỳ trước = 0 (null)', async () => {
    renderPage();
    await waitFor(() => expect(card('kpi-paying')).toBeInTheDocument());
    expect(within(card('kpi-paying')).getByText('Khách trả tiền')).toBeInTheDocument();
    expect(within(card('kpi-paying')).getByText('4')).toBeInTheDocument();
    expect(within(card('kpi-paying')).getByText(/Dùng thử: 3/)).toBeInTheDocument();
    expect(within(card('kpi-new')).queryByText(/so với cùng kỳ/)).not.toBeInTheDocument();
  });

  it('"Cần xử lý": mỗi mục có việc là một liên kết; mục bằng 0 không hiện', async () => {
    renderPage();
    await waitFor(() => expect(card('kpi-attention')).toBeInTheDocument());
    const attention = within(card('kpi-attention'));
    expect(attention.getByText('5')).toBeInTheDocument();
    expect(attention.getByRole('link', { name: /Tiền đã vào nhưng đơn bị huỷ: 2 đơn \(220\.000 đ\)/ }))
      .toHaveAttribute('href', '/admin/orders?attention=paid_after_cancelled');
    expect(attention.getByRole('link', { name: 'Hoá đơn điện tử kẹt: 3' })).toHaveAttribute('href', '/admin/einvoices');
    expect(attention.queryByText(/Yêu cầu rút hoa hồng quá hạn/)).not.toBeInTheDocument();
  });

  it('không còn biểu đồ tròn, "Paying", "Kích hoạt / Rời bỏ", "Tổng nhân viên"', async () => {
    renderPage();
    await waitFor(() => expect(card('kpi-revenue')).toBeInTheDocument());
    expect(screen.queryByTestId('pie-chart')).not.toBeInTheDocument();
    expect(screen.queryByText(/Paying/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Kích hoạt/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Churn/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Tổng nhân viên/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Phân bố theo gói/)).not.toBeInTheDocument();
  });

  it('biểu đồ doanh thu vẽ đủ 6 cột dữ liệu', async () => {
    renderPage();
    await waitFor(() => expect(card('kpi-revenue')).toBeInTheDocument());
    const charts = screen.getAllByTestId('bar-chart');
    expect(charts.length).toBeGreaterThan(0);
    charts.forEach((chart) => expect(chart.getAttribute('data-points')).toBe('6'));
  });

  it('trạng thái đơn hiện chữ tiếng Việt đúng màu — không còn chữ thô "success" nền xám', async () => {
    renderPage();
    await waitFor(() => expect(screen.getAllByText('ok@example.com').length).toBeGreaterThan(0));
    // Bản in ẩn lặp lại cùng dữ liệu — lấy phần tử ĐẦU (danh sách hiển thị đứng trước bản in).
    const rowOf = (email) => screen.getAllByText(email)[0].closest('div.px-5');
    const paid = within(rowOf('ok@example.com')).getByText('Thành công');
    expect(paid.className).toContain('badge-success');
    const failed = within(rowOf('bad@example.com')).getByText('Thất bại');
    expect(failed.className).toContain('badge-error');
    const refunded = within(rowOf('ref@example.com')).getByText('Đã hoàn tiền');
    expect(refunded.className).toContain('badge-info');
    expect(screen.queryByText('success')).not.toBeInTheDocument();
    expect(screen.queryByText('failed')).not.toBeInTheDocument();
  });

  it('avatar khách mới lấy chữ đầu của fullName (API trả fullName, không phải full_name)', async () => {
    renderPage();
    await waitFor(() => expect(screen.getAllByText('a@example.com').length).toBeGreaterThan(0));
    expect(screen.getByText('N')).toBeInTheDocument();
    expect(screen.getAllByText('Nguyễn Văn A').length).toBeGreaterThan(0);
  });

  it('không hiện ghi chú kỹ thuật "migration 040" cho người dùng cuối', async () => {
    renderPage();
    await waitFor(() => expect(card('kpi-revenue')).toBeInTheDocument());
    expect(screen.queryByText(/migration 040/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Dữ liệu từ/)).not.toBeInTheDocument();
  });
});
