import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import UserDeliveryMonitorPage from '../UserDeliveryMonitorPage';
import userDeliveryMonitorApiService from '../../../features/campaign/services/userDeliveryMonitorApi.service';
import { asAxios, buildOverview, buildRun, mockT } from './userDeliveryMonitor.testUtils';

/**
 * PLAN_UOC_TINH_THOI_GIAN_CHIEN_DICH_2026-10-04, mục 5c / PR-5 — dòng "Dự kiến xong: dd/MM HH:mm (còn khoảng N …)" dưới
 * số "Đã gửi" của lượt ĐANG CHẠY. Chỉ lượt running được gọi; chạy liên tục → "Chạy liên tục"; lỗi / null → không hiện gì;
 * mỗi lượt gọi tối đa 1 lần / 5 phút dù trang tự làm mới mỗi phút.
 */

vi.mock('../../../i18n', () => ({
  useI18n: () => ({ t: mockT }),
}));

vi.mock('../../../features/campaign/services/userDeliveryMonitorApi.service', () => ({
  default: {
    getOverview: vi.fn(),
    getRunFailures: vi.fn(),
    getRunEstimate: vi.fn(),
  },
}));

vi.mock('react-hot-toast', () => ({
  default: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }) => <div>{children}</div>,
  BarChart: () => <div data-testid="hourly-chart" />,
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  CartesianGrid: () => null,
  Legend: () => null,
}));

const { getOverview, getRunEstimate } = userDeliveryMonitorApiService;

// 03:04Z ngày 02/01/2099 = 10:04 giờ VN ngày 02/01.
const FINISH_FIXED = '2099-01-02T03:04:00.000Z';

const estimateBody = (overrides = {}) => asAxios({
  runId: 7,
  continuous: false,
  estimate: {
    startAt: '2026-10-04T03:00:00.000Z',
    finishAtEarliest: FINISH_FIXED,
    finishAtTypical: FINISH_FIXED,
    finishAtLatest: FINISH_FIXED,
    totalActions: 499,
    perNode: [],
    perDay: [],
    accounts: [],
    warnings: [],
    ...overrides,
  },
});

beforeEach(() => {
  vi.resetAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

const renderWith = async (runs) => {
  getOverview.mockResolvedValue(asAxios(buildOverview({ runs })));
  render(<UserDeliveryMonitorPage />);
  await screen.findByTestId('card-sent');
  // Cho lời gọi ước tính (async) kịp xong.
  await act(async () => { await Promise.resolve(); });
};

describe('UserDeliveryMonitorPage — dự kiến xong của lượt đang chạy', () => {
  it('lượt running: gọi ước tính đúng runId và hiện "Dự kiến xong: 02/01/2099 10:04" dưới số đã gửi', async () => {
    getRunEstimate.mockResolvedValue(estimateBody());
    await renderWith([buildRun({ runId: 7, status: 'running', sent: 300, planned: 799 })]);

    expect(getRunEstimate).toHaveBeenCalledTimes(1);
    expect(getRunEstimate).toHaveBeenCalledWith(7);
    const line = within(screen.getByTestId('run-row-7')).getByTestId('run-estimate');
    expect(line.textContent).toContain('Dự kiến xong: 02/01/2099 10:04');
    expect(line.textContent).toContain('còn khoảng');
  });

  it('còn khoảng 3 giờ: tính từ bây giờ tới finishAtLatest (3 giờ 10 phút → làm tròn 3 giờ)', async () => {
    const finish = new Date(Date.now() + (3 * 60 + 10) * 60_000).toISOString();
    getRunEstimate.mockResolvedValue(estimateBody({ finishAtLatest: finish, finishAtEarliest: finish }));
    await renderWith([buildRun({ runId: 7, status: 'running' })]);
    expect(screen.getByTestId('run-estimate').textContent).toContain('(còn khoảng 3 giờ)');
  });

  it('lượt hoàn tất / đã dừng KHÔNG gọi API và không hiện dòng dự kiến', async () => {
    getRunEstimate.mockResolvedValue(estimateBody());
    await renderWith([
      buildRun({ runId: 1, status: 'completed' }),
      buildRun({ runId: 2, status: 'stopped' }),
      buildRun({ runId: 3, status: 'failed' }),
    ]);
    expect(getRunEstimate).not.toHaveBeenCalled();
    expect(screen.queryByTestId('run-estimate')).not.toBeInTheDocument();
  });

  it('lượt chạy liên tục → "Chạy liên tục", không có ngày dự kiến', async () => {
    getRunEstimate.mockResolvedValue(asAxios({ runId: 7, continuous: true, estimate: null }));
    await renderWith([buildRun({ runId: 7, status: 'running' })]);
    expect(screen.getByTestId('run-estimate-continuous').textContent).toBe('Chạy liên tục');
    expect(screen.queryByTestId('run-estimate')).not.toBeInTheDocument();
  });

  it('estimate null hoặc lỗi mạng → không hiện gì, bảng vẫn hiện bình thường', async () => {
    getRunEstimate.mockResolvedValueOnce(asAxios({ runId: 7, continuous: false, estimate: null }));
    await renderWith([buildRun({ runId: 7, status: 'running', sent: 5 })]);
    expect(screen.queryByTestId('run-estimate')).not.toBeInTheDocument();
    expect(screen.queryByTestId('run-estimate-continuous')).not.toBeInTheDocument();
    expect(screen.getByTestId('run-sent').textContent).toBe('5');
  });

  it('API ước tính ném lỗi → không hiện gì, không vỡ trang', async () => {
    getRunEstimate.mockRejectedValue(new Error('500'));
    await renderWith([buildRun({ runId: 7, status: 'running', sent: 5 })]);
    expect(screen.queryByTestId('run-estimate')).not.toBeInTheDocument();
    expect(screen.getByTestId('run-sent').textContent).toBe('5');
  });

  it('có cảnh báo tra số Zalo / email từng bị chặn → thêm dấu "có thể lâu hơn" (tooltip); không có thì không', async () => {
    getRunEstimate.mockResolvedValueOnce(estimateBody({ warnings: [{ code: 'zalo_phone_lookup_unmodeled', params: { nodes: ['3'] } }] }));
    await renderWith([buildRun({ runId: 7, status: 'running' })]);
    const mark = screen.getByTestId('run-estimate-longer');
    expect(mark).toHaveAttribute('title', 'Có thể lâu hơn nếu Zalo khoá tra số hoặc máy chủ email chặn gửi.');
  });

  it('không có cảnh báo "không mô hình được" → không có dấu "có thể lâu hơn"', async () => {
    getRunEstimate.mockResolvedValueOnce(estimateBody({ warnings: [{ code: 'multi_day', params: { days: 2 } }] }));
    await renderWith([buildRun({ runId: 7, status: 'running' })]);
    expect(screen.getByTestId('run-estimate')).toBeInTheDocument();
    expect(screen.queryByTestId('run-estimate-longer')).not.toBeInTheDocument();
  });
});

describe('UserDeliveryMonitorPage — không gọi ước tính quá 1 lần / 5 phút / lượt', () => {
  it('trang tự làm mới mỗi 60 giây nhưng ước tính chỉ gọi lại sau 5 phút; lượt khác gọi riêng', async () => {
    vi.useFakeTimers();
    let n = 0;
    getOverview.mockImplementation(async () => {
      n += 1;
      return asAxios(buildOverview({
        generatedAt: new Date(Date.now()).toISOString(), // đổi mỗi lần làm mới, như backend thật
        runs: [buildRun({ runId: 7, status: 'running' }), buildRun({ runId: 8, status: 'running' })],
      }));
    });
    getRunEstimate.mockResolvedValue(estimateBody());
    render(<UserDeliveryMonitorPage />);
    const advance = (ms) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

    await advance(0);
    expect(getRunEstimate).toHaveBeenCalledTimes(2); // lượt 7 và lượt 8, mỗi lượt một lần

    await advance(60_000);
    await advance(60_000);
    await advance(60_000);
    await advance(60_000); // 4 phút
    expect(n).toBe(5); // overview đã làm mới 4 lần nữa
    expect(getRunEstimate).toHaveBeenCalledTimes(2);

    await advance(60_000); // 5 phút kể từ lần gọi đầu → gọi lại cho cả hai lượt
    expect(getRunEstimate).toHaveBeenCalledTimes(4);
    expect(getRunEstimate.mock.calls.map((c) => c[0]).sort()).toEqual([7, 7, 8, 8]);
  });
});
