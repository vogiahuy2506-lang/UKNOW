import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, fireEvent, act, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AdminDeliveryMonitorPage from '../AdminDeliveryMonitorPage';
import adminDeliveryMonitorApiService from '../../../features/admin/services/adminDeliveryMonitorApi.service';
import { mockT } from '../../campaigns/__tests__/userDeliveryMonitor.testUtils';

/**
 * PLAN_SO_LIEU_DUNG_GON_KHOP_2026-09-30, PR-6 — trang Giám sát gửi tin của ADMIN: 4 thẻ, biểu đồ, bảng nguyên nhân, bảng khách,
 * bảng lượt chạy; bộ chọn Hôm nay / 7 / 30 ngày; công tắc "Gồm tài khoản nội bộ"; lọc một chủ. Dữ liệu API giả ĐÚNG hình dạng
 * phản hồi mới của GET /admin/delivery-monitor/overview.
 */

vi.mock('../../../i18n', () => ({
  useI18n: () => ({ t: mockT }),
}));

vi.mock('../../../features/admin/services/adminDeliveryMonitorApi.service', () => ({
  default: { getOverview: vi.fn() },
}));

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }) => <div>{children}</div>,
  BarChart: ({ children, data }) => (
    <div
      data-testid="chart"
      data-points={data.length}
      data-labels={data.map((slot) => slot.label).join(',')}
      data-total={data.reduce((sum, slot) => sum + slot.total, 0)}
    >
      {children}
    </div>
  ),
  Bar: ({ dataKey }) => <div data-testid={`bar-${dataKey}`} />,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  CartesianGrid: () => null,
  Legend: () => null,
}));

const getOverviewMock = adminDeliveryMonitorApiService.getOverview;

// 03:30 giờ VN ngày 30/09/2026.
const GENERATED_AT = '2026-09-29T20:30:00.000Z';

const EMPTY_BY_CHANNEL = [
  { channel: 'email', sent: 0, failed: 0 },
  { channel: 'zalo_personal', sent: 0, failed: 0 },
  { channel: 'zalo_group', sent: 0, failed: 0 },
  { channel: 'telegram', sent: 0, failed: 0 },
  { channel: 'whatsapp', sent: 0, failed: 0 },
];

function buildOverview(overrides = {}) {
  return {
    generatedAt: GENERATED_AT,
    window: { key: 'today', fromDate: '2026-09-30', toDate: '2026-09-30' },
    filter: { ownerId: null, includeInternal: false, excludedOwnerIds: [39, 116] },
    totals: { sent: 0, failed: 0, failedPercent: null, byChannel: EMPTY_BY_CHANNEL, friendRequests: { sent: 0, failed: 0 } },
    series: { unit: 'hour', rows: [] },
    runs: { sending: 0, failed: 0, waiting: { count: 0, reasons: [], first: null } },
    failureReasons: [],
    topOwners: [],
    recentRuns: [],
    queue: { available: false },
    alerts: { open: 0 },
    signals: [],
    ...overrides,
  };
}

function buildRun(overrides = {}) {
  return {
    runId: 1,
    campaignId: 1,
    campaignName: 'Chiến dịch',
    campaignType: 'email',
    ownerId: 5,
    ownerName: 'Nguyễn Chủ',
    ownerUsername: 'chu5',
    status: 'completed',
    startedAt: '2026-09-29T11:00:00.000Z',
    waitingUntil: null,
    waitingReason: null,
    sent: 0,
    failed: 0,
    planned: null,
    ...overrides,
  };
}

const asAxios = (data) => ({ data: { data } });

function setVisibility(state) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
}

beforeEach(() => {
  vi.clearAllMocks();
  setVisibility('visible');
  getOverviewMock.mockResolvedValue(asAxios(buildOverview()));
});

afterEach(() => {
  vi.useRealTimers();
  setVisibility('visible');
});

const renderPage = async () => {
  render(<MemoryRouter><AdminDeliveryMonitorPage /></MemoryRouter>);
  await screen.findByTestId('card-sent');
};

const lastCall = () => getOverviewMock.mock.calls[getOverviewMock.mock.calls.length - 1][0];

describe('AdminDeliveryMonitorPage — bốn thẻ', () => {
  const overview = buildOverview({
    totals: {
      sent: 1234,
      failed: 56,
      failedPercent: 4.3,
      byChannel: [
        { channel: 'email', sent: 900, failed: 40 },
        { channel: 'zalo_personal', sent: 300, failed: 16 },
        { channel: 'zalo_group', sent: 0, failed: 0 },
        { channel: 'telegram', sent: 34, failed: 0 },
        { channel: 'whatsapp', sent: 0, failed: 0 },
      ],
      friendRequests: { sent: 8, failed: 3 },
    },
    runs: {
      sending: 3,
      failed: 2,
      waiting: {
        count: 5,
        reasons: [
          { reason: 'quiet_hours', count: 2 },
          { reason: 'plan_quota_daily', count: 2 },
          { reason: 'plan_quota_account_daily_email', count: 1 },
        ],
        first: { campaignName: 'A', waitingReason: 'quiet_hours', waitingUntil: '2026-09-29T23:00:00.000Z' },
      },
    },
    queue: { available: true, waiting: 40, active: 10, delayed: 7 },
    alerts: { open: 2 },
  });

  beforeEach(() => {
    getOverviewMock.mockResolvedValue(asAxios(overview));
  });

  it('thẻ đã gửi: tổng, chip theo kênh (chỉ kênh > 0), lời mời kết bạn riêng', async () => {
    await renderPage();
    const card = screen.getByTestId('card-sent');
    expect(within(card).getByTestId('card-sent-value')).toHaveTextContent('1.234');
    const chips = within(card).getAllByTestId('sent-channel-chip').map((chip) => chip.textContent.trim());
    expect(chips).toEqual(['Email 900', 'Zalo cá nhân 300', 'Telegram 34']);
    expect(within(card).getByTestId('friend-requests-sent')).toHaveTextContent('+ 8 lời mời kết bạn');
  });

  it('thẻ chưa gửi được: số, % trên (đã gửi + chưa gửi được), ghi chú đơn vị "người nhận", kết bạn lỗi riêng', async () => {
    await renderPage();
    const card = screen.getByTestId('card-failed');
    expect(within(card).getByTestId('card-failed-value')).toHaveTextContent('56');
    expect(within(card).getByTestId('failed-percent')).toHaveTextContent('4,3% trên tổng đã gửi và chưa gửi được');
    expect(card).toHaveTextContent('Tính theo người nhận, đã trừ lần gửi lại thành công.');
    expect(within(card).getByTestId('friend-requests-failed')).toHaveTextContent('+ 3 lời mời kết bạn chưa gửi được');
  });

  it('không có tin nào → không hiện %; thẻ chưa gửi được không đỏ khi = 0', async () => {
    getOverviewMock.mockResolvedValue(asAxios(buildOverview()));
    await renderPage();
    expect(screen.queryByTestId('failed-percent')).toBeNull();
    expect(screen.getByTestId('card-failed').innerHTML).toContain('bg-emerald-50');
  });

  it('thẻ lượt chạy: đang gửi / đang chờ (lý do phổ biến nhất gom theo NHÃN: 2 mã hạn mức = 3 lượt) / lỗi trong kỳ', async () => {
    await renderPage();
    const card = screen.getByTestId('card-runs');
    expect(within(card).getByTestId('card-runs-value')).toHaveTextContent('3');
    expect(card).toHaveTextContent('Lượt đang gửi');
    expect(within(card).getByTestId('runs-waiting')).toHaveTextContent('5 lượt đang chờ');
    // plan_quota_daily (2) + plan_quota_account_daily_email (1) = 3 > quiet_hours (2).
    expect(within(card).getByTestId('runs-waiting-reason')).toHaveTextContent('Hay gặp: đã hết lượt gửi (theo gói hoặc giới hạn bạn đặt) (3 lượt)');
    expect(within(card).getByTestId('runs-failed')).toHaveTextContent('2 lượt lỗi trong kỳ');
  });

  it('lượt chờ KHÔNG tô đỏ: thẻ lượt chạy trung tính, dòng "đang chờ" không đỏ; chỉ dòng "lượt lỗi" đỏ khi > 0', async () => {
    await renderPage();
    const card = screen.getByTestId('card-runs');
    expect(card.innerHTML).toContain('bg-gray-100');
    expect(card.innerHTML).not.toContain('bg-red-50');
    expect(within(card).getByTestId('runs-waiting').className).not.toMatch(/red|amber/);
    expect(within(card).getByTestId('runs-failed').className).toContain('text-red-600');
  });

  it('không có lượt chờ / lượt lỗi → dòng trung tính, không đỏ', async () => {
    getOverviewMock.mockResolvedValue(asAxios(buildOverview({ runs: { sending: 1, failed: 0, waiting: { count: 0, reasons: [], first: null } } })));
    await renderPage();
    const card = screen.getByTestId('card-runs');
    expect(within(card).getByTestId('runs-waiting')).toHaveTextContent('Không có lượt nào đang chờ.');
    expect(within(card).getByTestId('runs-failed')).toHaveTextContent('Không có lượt lỗi trong kỳ.');
    expect(within(card).getByTestId('runs-failed').className).not.toContain('red');
    expect(screen.queryByTestId('runs-waiting-reason')).toBeNull();
  });

  it('thẻ hàng đợi & cảnh báo: đang xử lý = chờ + đang gửi (KHÔNG cộng delayed), job hẹn thử lại riêng, liên kết tới /admin/alerts', async () => {
    await renderPage();
    const card = screen.getByTestId('card-system');
    expect(within(card).getByTestId('card-system-value')).toHaveTextContent('50');
    expect(within(card).getByTestId('queue-processing')).toHaveTextContent('50 job đang xử lý');
    expect(within(card).getByTestId('queue-delayed')).toHaveTextContent('7 job hẹn thử lại');
    const link = within(card).getByRole('link', { name: '2 cảnh báo đang mở' });
    expect(link.getAttribute('href')).toBe('/admin/alerts');
  });

  it('BullMQ tắt và không có cảnh báo → "—" và các dòng trung tính', async () => {
    getOverviewMock.mockResolvedValue(asAxios(buildOverview()));
    await renderPage();
    const card = screen.getByTestId('card-system');
    expect(within(card).getByTestId('card-system-value')).toHaveTextContent('—');
    expect(within(card).getByTestId('queue-processing')).toHaveTextContent('Hàng đợi BullMQ chưa bật.');
    expect(within(card).getByTestId('alerts-open')).toHaveTextContent('Không có cảnh báo đang mở.');
    expect(within(card).queryByRole('link')).toBeNull();
  });

  it('KHÔNG còn "tiếp cận %", "tỉ lệ thành công", "đang chờ retry", "chiến dịch đang chạy", nhóm lỗi node hay tốc độ/phút của trang cũ', async () => {
    await renderPage();
    const text = document.body.textContent;
    for (const removed of ['Tiếp cận', 'Tỷ lệ thành công', 'Tỉ lệ thành công', 'Đang chờ retry', 'Chiến dịch đang chạy', 'Tin lỗi', 'Hard bounce', '/min', 'Lệch lịch', 'Lỗi gần đây', 'Nhóm lỗi thường gặp']) {
      expect(text).not.toContain(removed);
    }
  });
});

describe('AdminDeliveryMonitorPage — bộ chọn cửa sổ', () => {
  it('mặc định "Hôm nay": gọi API với window=today, không gồm nội bộ, không lọc chủ', async () => {
    await renderPage();
    expect(getOverviewMock).toHaveBeenCalledTimes(1);
    expect(lastCall()).toEqual({ window: 'today', includeInternal: false, ownerId: null });
  });

  it('ba lựa chọn Hôm nay / 7 ngày / 30 ngày; bấm 7 ngày và 30 ngày gọi lại với đúng khoá; nút đang chọn được tô', async () => {
    await renderPage();
    expect(screen.getByRole('button', { name: 'Hôm nay' }).className).toContain('bg-orange-50');
    expect(screen.getByRole('button', { name: '7 ngày' }).className).not.toContain('bg-orange-50');

    fireEvent.click(screen.getByRole('button', { name: '7 ngày' }));
    await waitFor(() => expect(lastCall().window).toBe('7d'));
    expect(screen.getByRole('button', { name: '7 ngày' }).className).toContain('bg-orange-50');

    fireEvent.click(screen.getByRole('button', { name: '30 ngày' }));
    await waitFor(() => expect(lastCall().window).toBe('30d'));
    expect(getOverviewMock).toHaveBeenCalledTimes(3);
  });

  it('dòng khoảng thời gian: hôm nay = "ngày dd/MM"; 7 ngày = "từ dd/MM đến dd/MM"', async () => {
    await renderPage();
    expect(screen.getByTestId('range-info')).toHaveTextContent('Số liệu ngày 30/09 (giờ Việt Nam).');
    getOverviewMock.mockResolvedValue(asAxios(buildOverview({ window: { key: '7d', fromDate: '2026-09-24', toDate: '2026-09-30' }, series: { unit: 'day', rows: [] } })));
    fireEvent.click(screen.getByRole('button', { name: '7 ngày' }));
    await waitFor(() => expect(screen.getByTestId('range-info')).toHaveTextContent('Số liệu từ 24/09 đến 30/09 (giờ Việt Nam).'));
  });
});

describe('AdminDeliveryMonitorPage — biểu đồ', () => {
  it('hôm nay: theo GIỜ từ 00:00 tới giờ hiện tại (03:30 VN → 4 cột), tiêu đề "theo giờ"', async () => {
    getOverviewMock.mockResolvedValue(asAxios(buildOverview({
      totals: { ...buildOverview().totals, sent: 3 },
      series: { unit: 'hour', rows: [{ hour: '2026-09-29T17:00:00.000Z', channel: 'email', sent: 3, failed: 0 }] },
    })));
    await renderPage();
    const chart = screen.getByTestId('chart');
    expect(chart.getAttribute('data-points')).toBe('4');
    expect(chart.getAttribute('data-labels')).toBe('00:00,01:00,02:00,03:00');
    expect(chart.getAttribute('data-total')).toBe('3');
    expect(screen.getByTestId('chart-title')).toHaveTextContent('Tin gửi theo giờ — hôm nay');
  });

  it('7 ngày: theo NGÀY, đủ 7 cột kể cả ngày trống, tiêu đề "theo ngày — 7 ngày qua"', async () => {
    getOverviewMock.mockResolvedValue(asAxios(buildOverview({
      window: { key: '7d', fromDate: '2026-09-24', toDate: '2026-09-30' },
      series: {
        unit: 'day',
        rows: [
          { day: '2026-09-26', channel: 'email', sent: 4, failed: 0 },
          { day: '2026-09-26', channel: 'telegram', sent: 1, failed: 0 },
          { day: '2026-09-30', channel: 'zalo_personal', sent: 2, failed: 1 },
        ],
      },
    })));
    await renderPage();
    const chart = screen.getByTestId('chart');
    expect(chart.getAttribute('data-points')).toBe('7');
    expect(chart.getAttribute('data-labels')).toBe('24/09,25/09,26/09,27/09,28/09,29/09,30/09');
    expect(chart.getAttribute('data-total')).toBe('7');
    expect(screen.getByTestId('chart-title')).toHaveTextContent('Tin gửi theo ngày — 7 ngày qua');
  });

  it('30 ngày: 30 cột; không có tin → thông báo rỗng thay vì biểu đồ trống', async () => {
    getOverviewMock.mockResolvedValue(asAxios(buildOverview({
      window: { key: '30d', fromDate: '2026-09-01', toDate: '2026-09-30' },
      series: { unit: 'day', rows: [] },
    })));
    await renderPage();
    expect(screen.queryByTestId('chart')).toBeNull();
    expect(screen.getByTestId('chart-empty')).toHaveTextContent('Chưa có tin nào được gửi trong khoảng thời gian này.');
    expect(screen.getByTestId('chart-title')).toHaveTextContent('Tin gửi theo ngày — 30 ngày qua');
  });

  it('năm kênh "tin" xếp chồng, không có kênh kết bạn', async () => {
    getOverviewMock.mockResolvedValue(asAxios(buildOverview({
      totals: { ...buildOverview().totals, sent: 1 },
      series: { unit: 'hour', rows: [{ hour: '2026-09-29T17:00:00.000Z', channel: 'email', sent: 1, failed: 0 }] },
    })));
    await renderPage();
    for (const channel of ['email', 'zalo_personal', 'zalo_group', 'telegram', 'whatsapp']) {
      expect(screen.getByTestId(`bar-${channel}`)).toBeTruthy();
    }
    expect(screen.queryByTestId('bar-zalo_friend_request')).toBeNull();
  });
});

describe('AdminDeliveryMonitorPage — công tắc tài khoản nội bộ', () => {
  it('mặc định TẮT và hiện "đang loại tài khoản nội bộ (ID 39, 116)"; bật thì gọi lại với includeInternal=true và hiện "đang gồm cả nội bộ"', async () => {
    await renderPage();
    const toggle = screen.getByTestId('include-internal');
    expect(toggle.checked).toBe(false);
    expect(screen.getByTestId('internal-hint')).toHaveTextContent('Đang loại tài khoản nội bộ (ID 39, 116).');

    getOverviewMock.mockResolvedValue(asAxios(buildOverview({ filter: { ownerId: null, includeInternal: true, excludedOwnerIds: [] } })));
    fireEvent.click(toggle);
    await waitFor(() => expect(lastCall().includeInternal).toBe(true));
    await waitFor(() => expect(screen.getByTestId('internal-hint')).toHaveTextContent('Đang gồm cả tài khoản nội bộ.'));
    expect(screen.getByTestId('include-internal').checked).toBe(true);
    expect(screen.getByText('Gồm tài khoản nội bộ')).toBeTruthy();
  });

  it('công tắc giữ nguyên khi đổi cửa sổ', async () => {
    await renderPage();
    fireEvent.click(screen.getByTestId('include-internal'));
    await waitFor(() => expect(lastCall().includeInternal).toBe(true));
    fireEvent.click(screen.getByRole('button', { name: '30 ngày' }));
    await waitFor(() => expect(lastCall()).toEqual({ window: '30d', includeInternal: true, ownerId: null }));
  });
});

describe('AdminDeliveryMonitorPage — bảng nguyên nhân, bảng khách, bảng lượt chạy', () => {
  it('bảng nguyên nhân: lý do + nhãn phân loại + kênh + số; lý do null → "Không rõ lý do"; rỗng → thông báo', async () => {
    getOverviewMock.mockResolvedValue(asAxios(buildOverview({
      failureReasons: [
        { channel: 'email', reason: '550 5.1.1 <email> Mailbox not found', category: 'recipient_invalid', count: 620, lastAt: '2026-09-29T11:00:00.000Z' },
        { channel: 'zalo_personal', reason: null, category: 'unknown', count: 3, lastAt: '2026-09-29T11:05:00.000Z' },
      ],
    })));
    await renderPage();
    const rows = screen.getAllByTestId('reason-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Người nhận lỗi');
    expect(rows[0]).toHaveTextContent('550 5.1.1 <email> Mailbox not found');
    expect(rows[0]).toHaveTextContent('Email');
    expect(within(rows[0]).getByTestId('reason-count')).toHaveTextContent('620');
    expect(rows[0]).toHaveTextContent('29/09 18:00');
    expect(rows[1]).toHaveTextContent('Không rõ lý do');
    expect(rows[1]).toHaveTextContent('Zalo cá nhân');
  });

  it('bảng nguyên nhân rỗng → thông báo, không có dòng dữ liệu', async () => {
    await renderPage();
    expect(screen.queryAllByTestId('reason-row')).toHaveLength(0);
    expect(screen.getByTestId('reasons-table')).toHaveTextContent('Không có tin nào chưa gửi được trong khoảng thời gian này.');
  });

  it('bảng khách: tên + @username, đã gửi, chưa gửi được (đỏ khi > 0)', async () => {
    getOverviewMock.mockResolvedValue(asAxios(buildOverview({
      topOwners: [
        { ownerId: 5, name: 'Nguyễn Chủ', username: 'chu5', sent: 900, failed: 12 },
        { ownerId: 6, name: 'chu6', username: 'chu6', sent: 40, failed: 0 },
      ],
    })));
    await renderPage();
    const first = screen.getByTestId('owner-row-5');
    expect(first).toHaveTextContent('Nguyễn Chủ');
    expect(first).toHaveTextContent('@chu5');
    expect(within(first).getByTestId('owner-sent')).toHaveTextContent('900');
    expect(within(first).getByTestId('owner-failed').className).toContain('text-red-600');
    const second = screen.getByTestId('owner-row-6');
    expect(second).not.toHaveTextContent('@chu6'); // tên trùng username → không lặp
    expect(within(second).getByTestId('owner-failed').className).not.toContain('red');
  });

  it('bảng lượt chạy: chủ, "đã gửi / cần gửi", chưa gửi được; lượt chờ hiện "Đang chờ: lý do đến giờ" và KHÔNG tô lỗi', async () => {
    getOverviewMock.mockResolvedValue(asAxios(buildOverview({
      recentRuns: [
        buildRun({ runId: 11, campaignName: 'Đang chờ hạn mức', status: 'running', waitingUntil: '2026-09-29T23:00:00.000Z', waitingReason: 'plan_quota_daily', sent: 10, failed: 1 }),
        buildRun({ runId: 12, campaignName: 'Xong', status: 'completed', sent: 30, planned: 40, campaignType: 'zalo' }),
        buildRun({ runId: 13, campaignName: 'Lỗi', status: 'failed', ownerName: 'chu6', ownerUsername: 'chu6', ownerId: 6 }),
        buildRun({ runId: 14, campaignName: 'Đang gửi', status: 'running' }),
      ],
    })));
    await renderPage();
    const waiting = screen.getByTestId('run-row-11');
    expect(within(waiting).getByTestId('run-status')).toHaveTextContent('Đang chờ: đã hết lượt gửi (theo gói hoặc giới hạn bạn đặt) đến 06:00');
    expect(within(waiting).getByTestId('run-status').className).toContain('badge-gray');
    expect(within(waiting).getByTestId('run-status').className).not.toMatch(/error|warning/);
    expect(within(waiting).getByTestId('run-owner')).toHaveTextContent('Nguyễn Chủ');
    expect(within(waiting).getByTestId('run-owner')).toHaveTextContent('@chu5');
    expect(within(waiting).getByTestId('run-sent')).toHaveTextContent('10');
    expect(within(waiting).getByTestId('run-failed')).toHaveTextContent('1');

    const done = screen.getByTestId('run-row-12');
    expect(within(done).getByTestId('run-sent')).toHaveTextContent('30 / 40');
    expect(within(done).getByTestId('run-status')).toHaveTextContent('Xong');
    expect(within(done).getByTestId('run-failed').innerHTML).toContain('text-gray-400');

    const failed = screen.getByTestId('run-row-13');
    expect(within(failed).getByTestId('run-status')).toHaveTextContent('Lỗi');
    expect(within(failed).getByTestId('run-status').className).toContain('badge-error');
    expect(within(failed).getByTestId('run-owner')).not.toHaveTextContent('@chu6');

    expect(within(screen.getByTestId('run-row-14')).getByTestId('run-status')).toHaveTextContent('Đang gửi');
  });

  it('bảng lượt chạy: trạng thái lạ in nguyên chuỗi gốc; không có lượt → thông báo', async () => {
    getOverviewMock.mockResolvedValue(asAxios(buildOverview({ recentRuns: [buildRun({ runId: 1, status: 'paused_x' })] })));
    await renderPage();
    expect(screen.getByTestId('run-status')).toHaveTextContent('paused_x');
  });
});

describe('AdminDeliveryMonitorPage — lọc một chủ', () => {
  const overview = buildOverview({
    topOwners: [{ ownerId: 5, name: 'Nguyễn Chủ', username: 'chu5', sent: 900, failed: 12 }],
  });

  it('bấm một khách → gọi lại với ownerId, hiện chip "Chỉ xem: tên", công tắc nội bộ bị khoá; bấm ✕ → bỏ lọc', async () => {
    getOverviewMock.mockResolvedValue(asAxios(overview));
    await renderPage();
    expect(screen.queryByTestId('owner-filter')).toBeNull();

    fireEvent.click(within(screen.getByTestId('owner-row-5')).getByRole('button'));
    await waitFor(() => expect(lastCall()).toEqual({ window: 'today', includeInternal: false, ownerId: 5 }));
    expect(screen.getByTestId('owner-filter')).toHaveTextContent('Chỉ xem: Nguyễn Chủ');
    expect(screen.getByTestId('include-internal').disabled).toBe(true);
    expect(screen.queryByTestId('internal-hint')).toBeNull();

    fireEvent.click(screen.getByTestId('owner-filter-clear'));
    await waitFor(() => expect(lastCall()).toEqual({ window: 'today', includeInternal: false, ownerId: null }));
    expect(screen.queryByTestId('owner-filter')).toBeNull();
    expect(screen.getByTestId('include-internal').disabled).toBe(false);
  });

  it('bộ lọc chủ giữ nguyên khi đổi cửa sổ', async () => {
    getOverviewMock.mockResolvedValue(asAxios(overview));
    await renderPage();
    fireEvent.click(within(screen.getByTestId('owner-row-5')).getByRole('button'));
    await waitFor(() => expect(lastCall().ownerId).toBe(5));
    fireEvent.click(screen.getByRole('button', { name: '7 ngày' }));
    await waitFor(() => expect(lastCall()).toEqual({ window: '7d', includeInternal: false, ownerId: 5 }));
  });
});

describe('AdminDeliveryMonitorPage — tín hiệu', () => {
  it('hiện tín hiệu hạ tầng còn giữ (hàng đợi nghẽn, Zalo chặn người lạ, silent-drop kèm tài khoản)', async () => {
    getOverviewMock.mockResolvedValue(asAxios(buildOverview({
      signals: [
        { level: 'warning', code: 'queue_backlog', value: 120 },
        { level: 'critical', code: 'stranger_blocked_detected', value: 3 },
        { level: 'critical', code: 'zalo_silent_drop_high', value: 50, accountId: 7, accountName: 'Hot', silentDrops: 5, attempts: 10 },
      ],
    })));
    await renderPage();
    const signals = screen.getByTestId('signals');
    expect(signals).toHaveTextContent('Hàng đợi đang tồn nhiều job');
    expect(signals).toHaveTextContent('Giá trị: 120');
    expect(signals).toHaveTextContent('Zalo đang chặn nhắn người lạ');
    expect(signals).toHaveTextContent('Tài khoản: Hot');
    expect(signals).toHaveTextContent('5/10 lượt trong 1 giờ qua');
    expect(signals).toHaveTextContent('Tỷ lệ: 50%');
  });

  it('không có tín hiệu → không có khung tín hiệu', async () => {
    await renderPage();
    expect(screen.queryByTestId('signals')).toBeNull();
  });
});

describe('AdminDeliveryMonitorPage — tải dữ liệu', () => {
  it('lỗi tải → hiện thông báo của server (hoặc câu mặc định), trang vẫn dựng khung', async () => {
    getOverviewMock.mockRejectedValue({ response: { data: { message: 'Không có quyền' } } });
    render(<MemoryRouter><AdminDeliveryMonitorPage /></MemoryRouter>);
    expect(await screen.findByText('Không có quyền')).toBeTruthy();
    getOverviewMock.mockRejectedValue(new Error('mạng'));
    fireEvent.click(screen.getByRole('button', { name: /Làm mới/ }));
    expect(await screen.findByText('Không thể tải dữ liệu giám sát gửi tin')).toBeTruthy();
  });

  it('kết quả của lượt gọi CŨ bị bỏ: đổi cửa sổ lúc lượt trước chưa xong thì chỉ lượt mới nhất được hiển thị', async () => {
    await renderPage();
    let resolveSlow;
    getOverviewMock.mockImplementationOnce(() => new Promise((resolve) => { resolveSlow = resolve; }));
    getOverviewMock.mockResolvedValueOnce(asAxios(buildOverview({ totals: { ...buildOverview().totals, sent: 777 } })));
    fireEvent.click(screen.getByRole('button', { name: '7 ngày' })); // lượt chậm
    fireEvent.click(screen.getByRole('button', { name: '30 ngày' })); // lượt nhanh, mới hơn
    await waitFor(() => expect(within(screen.getByTestId('card-sent')).getByTestId('card-sent-value')).toHaveTextContent('777'));
    await act(async () => {
      resolveSlow(asAxios(buildOverview({ totals: { ...buildOverview().totals, sent: 111 } })));
    });
    expect(within(screen.getByTestId('card-sent')).getByTestId('card-sent-value')).toHaveTextContent('777');
  });

  it('nút Làm mới gọi lại API với đúng bộ lọc hiện tại', async () => {
    await renderPage();
    fireEvent.click(screen.getByRole('button', { name: '7 ngày' }));
    await waitFor(() => expect(lastCall().window).toBe('7d'));
    const before = getOverviewMock.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: /Làm mới/ }));
    await waitFor(() => expect(getOverviewMock.mock.calls.length).toBe(before + 1));
    expect(lastCall().window).toBe('7d');
  });
});

describe('AdminDeliveryMonitorPage — tự làm mới', () => {
  it('mỗi phút khi tab hiển thị; tab ẩn thì không gọi; quay lại tab sau khi dữ liệu đã cũ hơn một chu kỳ thì làm mới ngay', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    render(<MemoryRouter><AdminDeliveryMonitorPage /></MemoryRouter>);
    await act(async () => { await Promise.resolve(); });
    expect(getOverviewMock).toHaveBeenCalledTimes(1);

    await act(async () => { vi.advanceTimersByTime(60_000); });
    expect(getOverviewMock).toHaveBeenCalledTimes(2);

    setVisibility('hidden');
    await act(async () => { vi.advanceTimersByTime(60_000); });
    expect(getOverviewMock).toHaveBeenCalledTimes(2);

    setVisibility('visible');
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(getOverviewMock).toHaveBeenCalledTimes(3);
  });
});
