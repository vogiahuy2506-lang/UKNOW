import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, fireEvent, act, waitFor } from '@testing-library/react';
import UserDeliveryMonitorPage from '../UserDeliveryMonitorPage';
import userDeliveryMonitorApiService from '../../../features/campaign/services/userDeliveryMonitorApi.service';
import { asAxios, buildOverview, buildRun, mockT } from './userDeliveryMonitor.testUtils';

/**
 * PLAN_SO_LIEU_DUNG_GON_KHOP_2026-09-30, PR-4b — trang Giám sát gửi tin trả lời "hôm nay gửi tới đâu, có gì đang kẹt":
 * 3 thẻ hôm nay + biểu đồ 24 giờ + bảng 10 lượt chạy gần đây (5 cột). Dữ liệu API giả ĐÚNG hình dạng phản hồi mới.
 */

vi.mock('../../../i18n', () => ({
  useI18n: () => ({ t: mockT }),
}));

vi.mock('../../../features/campaign/services/userDeliveryMonitorApi.service', () => ({
  default: {
    getOverview: vi.fn(),
    getRunFailures: vi.fn(),
  },
}));

vi.mock('react-hot-toast', () => ({
  default: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }) => <div>{children}</div>,
  BarChart: ({ children, data }) => <div data-testid="hourly-chart" data-points={data.length}>{children}</div>,
  Bar: ({ dataKey }) => <div data-testid={`bar-${dataKey}`} />,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  CartesianGrid: () => null,
  Legend: () => null,
}));

const getOverviewMock = userDeliveryMonitorApiService.getOverview;

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
  render(<UserDeliveryMonitorPage />);
  await screen.findByTestId('card-sent');
};

describe('UserDeliveryMonitorPage — ba thẻ "hôm nay"', () => {
  const overview = buildOverview({
    today: {
      date: '2026-09-30',
      sent: 1234,
      failed: 56,
      byChannel: [
        { channel: 'email', sent: 900, failed: 40 },
        { channel: 'zalo_personal', sent: 300, failed: 16 },
        { channel: 'zalo_group', sent: 0, failed: 0 },
        { channel: 'telegram', sent: 34, failed: 0 },
        { channel: 'whatsapp', sent: 0, failed: 0 },
      ],
      friendRequests: { sent: 8, failed: 3 },
    },
    waiting: {
      count: 2,
      first: { campaignName: 'Chờ giờ yên lặng', waitingReason: 'quiet_hours', waitingUntil: '2026-09-29T23:00:00.000Z' },
    },
    running: 3,
  });

  beforeEach(() => {
    getOverviewMock.mockResolvedValue(asAxios(overview));
  });

  it('"Đã gửi hôm nay": số tổng từ API, chip từng kênh CÓ tin (bỏ kênh 0), lời mời kết bạn ở dòng riêng', async () => {
    await renderPage();
    const card = screen.getByTestId('card-sent');
    expect(within(card).getByText('Đã gửi hôm nay')).toBeInTheDocument();
    expect(within(card).getByText('1.234')).toBeInTheDocument();
    expect(within(card).getAllByTestId('sent-channel-chip').map((chip) => chip.textContent))
      .toEqual(['Email 900', 'Zalo cá nhân 300', 'Telegram 34']);
    expect(within(card).getByTestId('friend-requests-sent')).toHaveTextContent('+ 8 lời mời kết bạn');
  });

  it('"Chưa gửi được hôm nay": số từ API, ghi rõ tính theo người nhận đã trừ lần gửi lại thành công; kết bạn lỗi ở dòng riêng', async () => {
    await renderPage();
    const card = screen.getByTestId('card-failed');
    expect(within(card).getByText('Chưa gửi được hôm nay')).toBeInTheDocument();
    expect(within(card).getByText('56')).toBeInTheDocument();
    expect(within(card).getByText('Tính theo người nhận, đã trừ lần gửi lại thành công.')).toBeInTheDocument();
    expect(within(card).getByTestId('friend-requests-failed')).toHaveTextContent('+ 3 lời mời kết bạn chưa gửi được');
  });

  it('"Đang chờ": "n lượt · lý do · tự chạy lại lúc HH:mm" (giờ VN), kèm số lượt đang gửi', async () => {
    await renderPage();
    const card = screen.getByTestId('card-waiting');
    expect(within(card).getByText('Đang chờ')).toBeInTheDocument();
    expect(within(card).getByText('2')).toBeInTheDocument();
    // 23:00 UTC = 06:00 giờ VN ngày 30/09, cùng ngày VN với lúc tải (03:30 VN) → chỉ HH:mm.
    expect(within(card).getByTestId('waiting-detail')).toHaveTextContent('2 lượt · đang trong khung giờ yên lặng · tự chạy lại lúc 06:00');
    expect(within(card).getByTestId('running-count')).toHaveTextContent('3 lượt đang gửi');
  });

  it('lượt chờ tới ngày khác: mốc hiện đủ dd/MM HH:mm; lý do hết lượt gửi của gói đọc được', async () => {
    getOverviewMock.mockResolvedValue(asAxios(buildOverview({
      waiting: {
        count: 1,
        first: { campaignName: 'Hết lượt', waitingReason: 'plan_quota_daily', waitingUntil: '2026-10-02T02:00:00.000Z' },
      },
    })));
    await renderPage();
    expect(screen.getByTestId('waiting-detail'))
      .toHaveTextContent('1 lượt · đã hết lượt gửi (theo gói hoặc giới hạn bạn đặt) · tự chạy lại lúc 02/10 09:00');
  });

  it('thẻ "Đang chờ" TRUNG TÍNH: không có class đỏ / vàng / cam (chờ hạn mức, giờ yên lặng là vận hành bình thường)', async () => {
    await renderPage();
    const card = screen.getByTestId('card-waiting');
    expect(card.outerHTML).not.toMatch(/(?:red|amber|yellow|orange)-\d/);
    expect(card.outerHTML).toContain('bg-gray-100');
  });

  it('không có dữ liệu: ba thẻ = 0, không chip, không dòng kết bạn, nói rõ không có lượt nào chờ', async () => {
    getOverviewMock.mockResolvedValue(asAxios(buildOverview()));
    await renderPage();
    expect(within(screen.getByTestId('card-sent')).getByText('0')).toBeInTheDocument();
    expect(screen.queryAllByTestId('sent-channel-chip')).toHaveLength(0);
    expect(screen.queryByTestId('friend-requests-sent')).not.toBeInTheDocument();
    expect(screen.queryByTestId('friend-requests-failed')).not.toBeInTheDocument();
    expect(within(screen.getByTestId('card-failed')).getByText('0')).toBeInTheDocument();
    expect(within(screen.getByTestId('card-waiting')).getByText('Không có lượt nào đang chờ.')).toBeInTheDocument();
    expect(screen.queryByTestId('running-count')).not.toBeInTheDocument();
  });
});

describe('UserDeliveryMonitorPage — đầu trang và những thứ đã bỏ', () => {
  it('đầu trang dùng PageHeader: tiêu đề "Giám sát gửi tin", mô tả, "Cập nhật lúc HH:mm" (giờ VN của phản hồi) và nút Làm mới', async () => {
    await renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'Giám sát gửi tin' })).toBeInTheDocument();
    expect(screen.getByText('Hôm nay đã gửi tới đâu, có gì đang chờ hoặc chưa gửi được.')).toBeInTheDocument();
    expect(screen.getByTestId('updated-at')).toHaveTextContent('Cập nhật lúc 03:30');
    fireEvent.click(screen.getByRole('button', { name: /Làm mới/ }));
    await waitFor(() => expect(getOverviewMock).toHaveBeenCalledTimes(2));
  });

  it('KHÔNG còn bộ chọn 7/30/90 ngày; API được gọi không kèm khoảng thời gian', async () => {
    await renderPage();
    for (const days of ['7 ngày', '30 ngày', '90 ngày']) {
      expect(screen.queryByRole('button', { name: days })).not.toBeInTheDocument();
      expect(screen.queryByText(days)).not.toBeInTheDocument();
    }
    expect(getOverviewMock).toHaveBeenCalledWith();
  });

  it('KHÔNG còn khối sức khoẻ tài khoản, độ phủ theo kênh, lỗi gần đây, cột thời lượng / tốc độ / tỷ lệ lỗi', async () => {
    getOverviewMock.mockResolvedValue(asAxios(buildOverview({
      runs: [buildRun({ runId: 1, sent: 10, failed: 1 })],
    })));
    await renderPage();
    await screen.findByTestId('run-row-1');
    for (const gone of [
      'Tình trạng tài khoản & hàng đợi', 'Hiệu quả theo kênh', 'Lỗi gần đây', 'Thời lượng', 'Tốc độ', 'Tỷ lệ lỗi',
      'Tin lỗi', 'Tin đã gửi', 'Lượt nhấp liên kết', 'Chiến dịch đang chạy', 'Tự làm mới 15s',
    ]) {
      expect(screen.queryByText(gone, { exact: false }), `còn chữ "${gone}"`).not.toBeInTheDocument();
    }
  });

  it('lỗi tải: hiện thông báo lỗi (ưu tiên message của API), không hiện thẻ nào', async () => {
    getOverviewMock.mockRejectedValue({ response: { data: { message: 'Máy chủ bận' } } });
    render(<UserDeliveryMonitorPage />);
    expect(await screen.findByText('Máy chủ bận')).toBeInTheDocument();
    expect(screen.queryByTestId('card-sent')).not.toBeInTheDocument();
  });

  it('lỗi tải không có message: dùng câu mặc định', async () => {
    getOverviewMock.mockRejectedValue(new Error('network'));
    render(<UserDeliveryMonitorPage />);
    expect(await screen.findByText('Không thể tải dữ liệu giám sát gửi tin')).toBeInTheDocument();
  });

  it('tín hiệu Zalo "gửi mà không tới" vẫn hiện', async () => {
    getOverviewMock.mockResolvedValue(asAxios(buildOverview({
      signals: [{ level: 'critical', code: 'zalo_silent_drop_high', accountId: 11, accountName: 'Acc A', silentDrops: 5, attempts: 10, value: 50 }],
    })));
    await renderPage();
    expect(screen.getByText(/Zalo không xác nhận phát tin/)).toBeInTheDocument();
    expect(screen.getByText('Tài khoản: Acc A')).toBeInTheDocument();
    expect(screen.getByText('5/10 lượt trong 1 giờ qua')).toBeInTheDocument();
  });
});

describe('UserDeliveryMonitorPage — biểu đồ "Tin gửi theo giờ — 24 giờ qua"', () => {
  it('có tin: vẽ đúng 24 cột giờ, cột chồng đủ năm kênh "tin" (không có kênh kết bạn)', async () => {
    getOverviewMock.mockResolvedValue(asAxios(buildOverview({
      hourly: [{ hour: '2026-09-29T20:00:00.000Z', channel: 'email', sent: 5, failed: 0 }],
    })));
    await renderPage();
    expect(screen.getByText('Tin gửi theo giờ — 24 giờ qua')).toBeInTheDocument();
    expect(screen.getByTestId('hourly-chart')).toHaveAttribute('data-points', '24');
    for (const channel of ['email', 'zalo_personal', 'zalo_group', 'telegram', 'whatsapp']) {
      expect(screen.getByTestId(`bar-${channel}`)).toBeInTheDocument();
    }
    expect(screen.queryByTestId('bar-zalo_friend_request')).not.toBeInTheDocument();
  });

  it('không có tin nào trong 24 giờ: hiện câu trống thay vì biểu đồ rỗng', async () => {
    await renderPage();
    expect(screen.queryByTestId('hourly-chart')).not.toBeInTheDocument();
    expect(screen.getByText('Chưa có tin nào được gửi trong 24 giờ qua.')).toBeInTheDocument();
  });
});

describe('UserDeliveryMonitorPage — bảng "Lượt chạy gần đây" (5 cột)', () => {
  const rowOf = (runId) => screen.getByTestId(`run-row-${runId}`);

  it('đúng 5 cột theo thứ tự: Chiến dịch · Bắt đầu · Trạng thái · Đã gửi / Cần gửi · Chưa gửi được', async () => {
    getOverviewMock.mockResolvedValue(asAxios(buildOverview({ runs: [buildRun()] })));
    await renderPage();
    expect(screen.getAllByRole('columnheader').map((th) => th.textContent))
      .toEqual(['Chiến dịch', 'Bắt đầu', 'Trạng thái', 'Đã gửi / Cần gửi', 'Chưa gửi được']);
  });

  it('"480 / 500" khi biết số cần gửi; chỉ "480" khi planned = null', async () => {
    getOverviewMock.mockResolvedValue(asAxios(buildOverview({
      runs: [
        buildRun({ runId: 1, campaignName: 'Có kế hoạch', sent: 480, planned: 500 }),
        buildRun({ runId: 2, campaignName: 'Lượt cũ', sent: 480, planned: null }),
        buildRun({ runId: 3, campaignName: 'Số lớn', sent: 12345, planned: 20000 }),
      ],
    })));
    await renderPage();
    expect(within(rowOf(1)).getByTestId('run-sent').textContent).toBe('480 / 500');
    expect(within(rowOf(2)).getByTestId('run-sent').textContent).toBe('480');
    expect(within(rowOf(3)).getByTestId('run-sent').textContent).toBe('12.345 / 20.000');
  });

  it('"Bắt đầu" dd/MM HH:mm theo giờ VN: lượt 18:00 và 23:30 VN vẫn đúng ngày (không nhảy sang hôm sau)', async () => {
    getOverviewMock.mockResolvedValue(asAxios(buildOverview({
      runs: [
        buildRun({ runId: 1, startedAt: '2026-09-29T11:00:00.000Z' }), // 18:00 VN 29/09
        buildRun({ runId: 2, startedAt: '2026-09-29T16:30:00.000Z' }), // 23:30 VN 29/09
        buildRun({ runId: 3, startedAt: '2026-09-29T17:05:00.000Z' }), // 00:05 VN 30/09
      ],
    })));
    await renderPage();
    expect(within(rowOf(1)).getByText('29/09 18:00')).toBeInTheDocument();
    expect(within(rowOf(2)).getByText('29/09 23:30')).toBeInTheDocument();
    expect(within(rowOf(3)).getByText('30/09 00:05')).toBeInTheDocument();
  });

  it('trạng thái ngắn bằng chữ Việt: Đang gửi / Xong / Đã dừng / Lỗi; trạng thái lạ in nguyên chuỗi gốc', async () => {
    getOverviewMock.mockResolvedValue(asAxios(buildOverview({
      runs: [
        buildRun({ runId: 1, status: 'running' }),
        buildRun({ runId: 2, status: 'completed' }),
        buildRun({ runId: 3, status: 'stopped' }),
        buildRun({ runId: 4, status: 'failed' }),
        buildRun({ runId: 5, status: 'paused_by_admin' }),
      ],
    })));
    await renderPage();
    const status = (id) => within(rowOf(id)).getByTestId('run-status').textContent;
    expect([1, 2, 3, 4, 5].map(status)).toEqual(['Đang gửi', 'Xong', 'Đã dừng', 'Lỗi', 'paused_by_admin']);
    // Không rơi ra chuỗi status tiếng Anh của DB.
    for (const raw of ['running', 'completed', 'stopped', 'failed']) {
      expect(screen.queryByText(raw)).not.toBeInTheDocument();
    }
  });

  it('nhãn kênh của chiến dịch cạnh tên; chiến dịch thiếu tên hiện #id', async () => {
    getOverviewMock.mockResolvedValue(asAxios(buildOverview({
      runs: [
        buildRun({ runId: 1, campaignName: 'Zalo A', campaignType: 'zalo' }),
        buildRun({ runId: 2, campaignName: 'Tele B', campaignType: 'telegram' }),
        buildRun({ runId: 3, campaignName: '', campaignType: 'mixed' }),
      ],
    })));
    await renderPage();
    expect(within(rowOf(1)).getByText('Zalo cá nhân')).toBeInTheDocument();
    expect(within(rowOf(2)).getByText('Telegram')).toBeInTheDocument();
    expect(within(rowOf(3)).getByText('#3')).toBeInTheDocument();
    expect(within(rowOf(3)).getByText('Đa kênh')).toBeInTheDocument();
  });

  it('"Chưa gửi được": 0 là chữ thường không bấm được; > 0 là nút bấm', async () => {
    getOverviewMock.mockResolvedValue(asAxios(buildOverview({
      runs: [buildRun({ runId: 1, failed: 0 }), buildRun({ runId: 2, failed: 12 })],
    })));
    await renderPage();
    expect(within(rowOf(1)).queryByRole('button')).not.toBeInTheDocument();
    expect(within(rowOf(2)).getByRole('button', { name: 'Xem 12 người chưa gửi được' })).toHaveTextContent('12');
  });

  it('chưa có lượt nào: câu trống', async () => {
    await renderPage();
    expect(screen.getByText('Chưa có lượt chạy nào.')).toBeInTheDocument();
  });
});

describe('UserDeliveryMonitorPage — tự làm mới mỗi 60 giây, chỉ khi tab đang hiển thị', () => {
  it('60 giây gọi lại một lần (không phải 15 giây); tab ẩn thì bỏ qua; quay lại tab sau khi dữ liệu cũ hơn một chu kỳ thì làm mới ngay', async () => {
    vi.useFakeTimers();
    render(<UserDeliveryMonitorPage />);
    const advance = (ms) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

    await advance(0);
    expect(getOverviewMock).toHaveBeenCalledTimes(1);

    await advance(15_000);
    await advance(30_000); // 45 giây: chu kỳ cũ 15 giây sẽ đã gọi nhiều lần
    expect(getOverviewMock).toHaveBeenCalledTimes(1);

    await advance(15_000); // đủ 60 giây
    expect(getOverviewMock).toHaveBeenCalledTimes(2);

    setVisibility('hidden');
    await advance(60_000); // tab ẩn: bỏ qua lượt này
    expect(getOverviewMock).toHaveBeenCalledTimes(2);

    setVisibility('visible');
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    await advance(0); // quay lại sau 60 giây kể từ lần làm mới cuối → làm mới ngay
    expect(getOverviewMock).toHaveBeenCalledTimes(3);
  });

  it('quay lại tab nhưng dữ liệu còn mới (< 60 giây) thì không gọi thêm', async () => {
    vi.useFakeTimers();
    render(<UserDeliveryMonitorPage />);
    const advance = (ms) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
    await advance(0);
    expect(getOverviewMock).toHaveBeenCalledTimes(1);

    setVisibility('hidden');
    await advance(20_000);
    setVisibility('visible');
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    await advance(0);
    expect(getOverviewMock).toHaveBeenCalledTimes(1);
  });

  it('rời trang thì dừng hẹn giờ (không gọi API sau khi unmount)', async () => {
    vi.useFakeTimers();
    const { unmount } = render(<UserDeliveryMonitorPage />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(getOverviewMock).toHaveBeenCalledTimes(1);
    unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(180_000); });
    expect(getOverviewMock).toHaveBeenCalledTimes(1);
  });
});
