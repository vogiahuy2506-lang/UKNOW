import { render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../i18n';
import AdminFunnelPage from './AdminFunnelPage';

/**
 * PR-9 (PLAN_SO_LIEU_DUNG_GON_KHOP_2026-09-30) — phễu dựng từ users theo cohort: 4 bước, mỗi bước hiện
 * "% so với bước trước" và "mất ở bước này"; không còn thanh chiều rộng theo n/registered hay chú thích
 * "chủ yếu tài khoản nội bộ".
 */
const { mockGetOverview } = vi.hoisted(() => ({ mockGetOverview: vi.fn() }));

vi.mock('../../features/admin/services/adminFunnelApi.service', () => ({
  default: { getOverview: mockGetOverview },
}));

const overview = {
  since: '2025-10-01',
  steps: [
    { key: 'registered', count: 120, pctOfPrevious: null, lost: null },
    { key: 'channelConnected', count: 60, pctOfPrevious: 50, lost: 60 },
    { key: 'firstSend', count: 45, pctOfPrevious: 75, lost: 15 },
    { key: 'paid', count: 9, pctOfPrevious: 20, lost: 36 },
  ],
  paidWithoutSend: 2,
  cohorts: [
    { cohortKey: '2026-08', cohort: '08/2026', registered: 50, channelConnected: 30, firstSend: 25, paid: 5, paidWithoutSend: 1 },
    { cohortKey: '2026-09', cohort: '09/2026', registered: 70, channelConnected: 30, firstSend: 20, paid: 4, paidWithoutSend: 1 },
  ],
  timeToFirstSend: {
    totalCustomers: 120,
    sentCount: 45,
    medianMinutes: 18,
    pctUnder10: 40,
    eligibleAfter7d: 100,
    notSentAfter7d: 55,
    pctNotSentAfter7d: 55,
  },
};

const renderPage = () => render(
  <I18nProvider>
    <AdminFunnelPage />
  </I18nProvider>
);

describe('AdminFunnelPage — phễu theo cohort', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetOverview.mockResolvedValue({ data: { data: overview } });
  });

  it('4 bước Đăng ký → Nối kênh → Chạy chiến dịch đầu tiên → Trả tiền, số từ API', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId('funnel-step-registered')).toBeInTheDocument());
    const text = (key) => screen.getByTestId(`funnel-step-${key}`).textContent;
    expect(text('registered')).toContain('Đăng ký');
    expect(text('registered')).toContain('120');
    expect(text('channelConnected')).toContain('Nối kênh');
    expect(text('firstSend')).toContain('Chạy chiến dịch đầu tiên');
    expect(text('paid')).toContain('Trả tiền');
    expect(document.querySelectorAll('[data-testid^="funnel-step-"]')).toHaveLength(4);
    // Bước "Tạo chiến dịch" đã bỏ khỏi phễu.
    expect(screen.queryByTestId('funnel-step-campaignCreated')).not.toBeInTheDocument();
  });

  it('mỗi bước sau hiện "% so với bước trước" và "mất ở bước này"; bước đầu không có', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId('funnel-step-channelConnected')).toBeInTheDocument());
    const channel = within(screen.getByTestId('funnel-step-channelConnected'));
    expect(channel.getByText('50% so với bước trước')).toBeInTheDocument();
    expect(channel.getByText('Mất ở bước này: 60')).toBeInTheDocument();
    expect(within(screen.getByTestId('funnel-step-firstSend')).getByText('75% so với bước trước')).toBeInTheDocument();
    expect(within(screen.getByTestId('funnel-step-paid')).getByText('Mất ở bước này: 36')).toBeInTheDocument();
    expect(within(screen.getByTestId('funnel-step-registered')).queryByText(/so với bước trước/)).not.toBeInTheDocument();
    // Không còn cách tính cũ "n% từ đăng ký".
    expect(screen.queryByText(/từ đăng ký/)).not.toBeInTheDocument();
  });

  it('ghi rõ phạm vi (chỉ khách, từ ngày nào) và không còn chú thích "chủ yếu tài khoản nội bộ/test"', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId('funnel-scope')).toBeInTheDocument());
    expect(screen.getByTestId('funnel-scope')).toHaveTextContent('Chỉ tính khách');
    expect(screen.getByTestId('funnel-scope')).toHaveTextContent('01/10/2025');
    expect(screen.queryByText(/chủ yếu tài khoản nội bộ/)).not.toBeInTheDocument();
  });

  it('thời gian tới tin đầu: trung vị, % ≤ 10 phút, đã gửi / tổng khách, % chưa gửi sau 7 ngày', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('18 phút')).toBeInTheDocument());
    expect(screen.getByText('40%')).toBeInTheDocument();
    expect(screen.getByText('45 / 120 khách')).toBeInTheDocument();
    expect(screen.getByText('55%')).toBeInTheDocument();
    expect(screen.getByText('55 / 100 khách đăng ký từ 7 ngày trước')).toBeInTheDocument();
  });

  it('khách trả tiền mà chưa gửi tin được hiện riêng, không giấu', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId('funnel-paid-without-send')).toBeInTheDocument());
    expect(screen.getByTestId('funnel-paid-without-send')).toHaveTextContent('2 khách đã trả tiền nhưng chưa gửi tin nào');
  });

  it('bảng cohort theo tháng đăng ký, mỗi bước kèm % trên số đăng ký', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('08/2026')).toBeInTheDocument());
    const row = screen.getByText('09/2026').closest('tr');
    const cells = within(row).getAllByRole('cell').map((c) => c.textContent);
    expect(cells[0]).toBe('09/2026');
    expect(cells[1]).toBe('70');
    expect(cells[2]).toBe('30(43%)');
    expect(cells[3]).toBe('20(29%)');
    expect(cells[4]).toBe('4(6%)');
  });

  it('không có dữ liệu: bảng cohort báo trống, không lỗi', async () => {
    mockGetOverview.mockResolvedValue({
      data: {
        data: {
          since: '2025-10-01',
          steps: [
            { key: 'registered', count: 0, pctOfPrevious: null, lost: null },
            { key: 'channelConnected', count: 0, pctOfPrevious: null, lost: 0 },
            { key: 'firstSend', count: 0, pctOfPrevious: null, lost: 0 },
            { key: 'paid', count: 0, pctOfPrevious: null, lost: 0 },
          ],
          paidWithoutSend: 0,
          cohorts: [],
          timeToFirstSend: { totalCustomers: 0, sentCount: 0, medianMinutes: null, pctUnder10: null, eligibleAfter7d: 0, notSentAfter7d: 0, pctNotSentAfter7d: null },
        },
      },
    });
    renderPage();
    await waitFor(() => expect(screen.getByText('Chưa có khách trong kỳ')).toBeInTheDocument());
    expect(screen.queryByTestId('funnel-paid-without-send')).not.toBeInTheDocument();
  });

  it('lỗi tải → hiện thông báo và nút thử lại', async () => {
    mockGetOverview.mockRejectedValue({ response: { data: { message: 'Lỗi tải phễu' } } });
    renderPage();
    await waitFor(() => expect(screen.getByText('Lỗi tải phễu')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeInTheDocument();
  });
});
