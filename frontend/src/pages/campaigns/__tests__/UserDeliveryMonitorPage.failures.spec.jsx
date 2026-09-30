import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import UserDeliveryMonitorPage from '../UserDeliveryMonitorPage';
import userDeliveryMonitorApiService from '../../../features/campaign/services/userDeliveryMonitorApi.service';
import toast from 'react-hot-toast';
import { asAxios, buildOverview, buildRun, mockT } from './userDeliveryMonitor.testUtils';

/**
 * PLAN_SO_LIEU_DUNG_GON_KHOP_2026-09-30, PR-4b — bấm số "Chưa gửi được" ở hàng lượt chạy mở danh sách người + lý do
 * (tái dùng khung chi tiết lỗi cũ: kiểm toán người nhận, bảng Người nhận / Lý do / Số lần / Lần cuối, toast khi lỗi).
 * Danh sách đến từ module đếm: mỗi người/bước MỘT dòng, đã trừ người gửi lại thành công, `aborted` không phải lỗi.
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
  BarChart: () => <div data-testid="hourly-chart" />,
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  CartesianGrid: () => null,
  Legend: () => null,
}));

const { getOverview, getRunFailures } = userDeliveryMonitorApiService;

const RUN = buildRun({
  runId: 406,
  campaignName: 'Zalo Auto Plan 12/9/2026',
  campaignType: 'zalo',
  status: 'completed',
  sent: 2,
  failed: 2,
  planned: 6,
});

const openButtonName = /Xem 2 người chưa gửi được/;

const renderAndFindButton = async () => {
  render(<UserDeliveryMonitorPage />);
  return screen.findByRole('button', { name: openButtonName });
};

beforeEach(() => {
  vi.clearAllMocks();
  getOverview.mockResolvedValue(asAxios(buildOverview({ runs: [RUN] })));
});

describe('UserDeliveryMonitorPage — danh sách người chưa gửi được của một lượt', () => {
  it('bấm số → gọi getRunFailures(runId) và hiện đúng số dòng: người nhận, lý do (nguyên văn), số lần, lần cuối (giờ VN)', async () => {
    getRunFailures.mockResolvedValue(asAxios({
      runId: 406,
      recipientAudit: null,
      failures: [
        { channel: 'zalo_personal', recipient: '0388180856', recipientDisplay: null, reason: 'Tham số không hợp lệ', attempts: 2, lastAt: '2026-09-29T11:00:00.000Z' },
        { channel: 'email', recipient: 'bounce@test.com', recipientDisplay: null, reason: '550 5.1.1 user unknown', attempts: 1, lastAt: '2026-09-29T16:30:00.000Z' },
      ],
    }));
    const button = await renderAndFindButton();
    expect(button).toHaveTextContent('2');
    expect(button).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(button);
    expect(getRunFailures).toHaveBeenCalledWith(406);

    await waitFor(() => expect(screen.getAllByTestId('failure-item-row')).toHaveLength(2));
    expect(button).toHaveAttribute('aria-expanded', 'true');
    const [zaloRow, emailRow] = screen.getAllByTestId('failure-item-row');
    expect(zaloRow).toHaveTextContent('0388180856');
    expect(within(zaloRow).getByText('Tham số không hợp lệ')).toBeInTheDocument();
    expect(zaloRow).toHaveTextContent('2 lần');
    expect(zaloRow).toHaveTextContent('29/09 18:00'); // 11:00 UTC = 18:00 VN
    expect(emailRow).toHaveTextContent('bounce@test.com');
    expect(within(emailRow).getByText('550 5.1.1 user unknown')).toBeInTheDocument();
    expect(emailRow).toHaveTextContent('29/09 23:30');

    // Đầu bảng nói đúng tên cột.
    const detail = screen.getByTestId('run-failures-row-406');
    expect(within(detail).getAllByRole('columnheader').map((th) => th.textContent))
      .toEqual(['Người nhận', 'Lý do', 'Số lần', 'Lần cuối']);
  });

  it('có recipientAudit → hiện dòng giải thích "hàng nguồn → có số → lượt gửi"', async () => {
    getRunFailures.mockResolvedValue(asAxios({
      runId: 406,
      recipientAudit: {
        sourceRows: 6, withRecipient: 3, deduped: 3, skippedNoRecipient: 3, skippedAlreadySent: 1,
        skippedNotDue: 0, skippedCompleted: 0, attempted: 4,
      },
      failures: [{ channel: 'zalo_personal', recipient: '0388180856', recipientDisplay: null, reason: 'x', attempts: 1, lastAt: null }],
    }));
    fireEvent.click(await renderAndFindButton());
    const explanation = await screen.findByTestId('recipient-audit-explanation');
    expect(explanation.textContent).toContain('6 hàng nguồn → 3 có số → 4 lượt gửi; 3 không có số, 1 đã gửi ở lượt trước');
  });

  it('không có recipientAudit → không có dòng giải thích', async () => {
    getRunFailures.mockResolvedValue(asAxios({
      runId: 406,
      recipientAudit: null,
      failures: [{ channel: 'zalo_personal', recipient: '0388180856', recipientDisplay: null, reason: 'x', attempts: 1, lastAt: null }],
    }));
    fireEvent.click(await renderAndFindButton());
    await screen.findByText('0388180856');
    expect(screen.queryByTestId('recipient-audit-explanation')).not.toBeInTheDocument();
  });

  it('bấm lại → đóng hàng con; mở lần nữa dùng dữ liệu đã tải (không gọi API lần hai)', async () => {
    getRunFailures.mockResolvedValue(asAxios({ runId: 406, recipientAudit: null, failures: [] }));
    const button = await renderAndFindButton();

    fireEvent.click(button);
    await screen.findByTestId('run-failures-row-406');
    expect(screen.getByText('Không có bản ghi lỗi chi tiết.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Ẩn danh sách 2 người chưa gửi được/ }));
    await waitFor(() => expect(screen.queryByTestId('run-failures-row-406')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: openButtonName }));
    await screen.findByTestId('run-failures-row-406');
    expect(getRunFailures).toHaveBeenCalledTimes(1);
  });

  it('kênh: mọi kênh trừ email có nhãn cạnh người nhận (kể cả lời mời kết bạn); tên hiển thị kèm mã; lý do trống → "Không rõ lý do"', async () => {
    getRunFailures.mockResolvedValue(asAxios({
      runId: 406,
      recipientAudit: null,
      failures: [
        { channel: 'zalo_personal', recipient: '0388180856', recipientDisplay: null, reason: 'x', attempts: 1, lastAt: null },
        { channel: 'zalo_friend_request', recipient: '0911000001', recipientDisplay: null, reason: 'y', attempts: 1, lastAt: null },
        { channel: 'whatsapp', recipient: '84900000001', recipientDisplay: 'Chị Lan', reason: 'hard: Số không dùng WhatsApp', attempts: 1, lastAt: null },
        { channel: 'telegram', recipient: '4001', recipientDisplay: '4001', reason: null, attempts: 3, lastAt: null },
        { channel: 'email', recipient: 'a@test.com', recipientDisplay: null, reason: 'z', attempts: 1, lastAt: null },
      ],
    }));
    fireEvent.click(await renderAndFindButton());
    await waitFor(() => expect(screen.getAllByTestId('failure-item-row')).toHaveLength(5));

    expect(screen.getAllByTestId('failure-channel-label').map((el) => el.textContent))
      .toEqual(['Zalo cá nhân', 'Lời mời kết bạn', 'WhatsApp', 'Telegram']); // email không có nhãn
    expect(screen.getByText('Chị Lan (84900000001)', { exact: false })).toBeInTheDocument();
    // Tên hiển thị trùng mã thì không lặp: chỉ "4001".
    const telegramRow = screen.getAllByTestId('failure-item-row')[3];
    expect(telegramRow).toHaveTextContent('4001');
    expect(telegramRow.textContent).not.toContain('4001 (4001)');
    expect(within(telegramRow).getByText('Không rõ lý do')).toBeInTheDocument();
    expect(telegramRow).toHaveTextContent('3 lần');
  });

  it('danh sách bị cắt ở trần: nói rõ chỉ hiện N người gần nhất trong tổng số', async () => {
    const overview = buildOverview({ runs: [{ ...RUN, failed: 250 }] });
    getOverview.mockResolvedValue(asAxios(overview));
    getRunFailures.mockResolvedValue(asAxios({
      runId: 406,
      recipientAudit: null,
      failures: Array.from({ length: 200 }, (_, i) => ({
        channel: 'email', recipient: `u${i}@t.vn`, recipientDisplay: null, reason: 'x', attempts: 1, lastAt: null,
      })),
    }));
    render(<UserDeliveryMonitorPage />);
    fireEvent.click(await screen.findByRole('button', { name: /Xem 250 người chưa gửi được/ }));
    expect(await screen.findByText('Chỉ hiện 200 người gần nhất trong 250 người chưa gửi được.')).toBeInTheDocument();
  });

  it('đang tải: hiện trạng thái tải rồi thay bằng danh sách', async () => {
    let resolve;
    getRunFailures.mockReturnValue(new Promise((r) => { resolve = r; }));
    fireEvent.click(await renderAndFindButton());
    expect(await screen.findByTestId('failures-loading')).toBeInTheDocument();
    resolve(asAxios({
      runId: 406,
      recipientAudit: null,
      failures: [{ channel: 'email', recipient: 'a@t.vn', recipientDisplay: null, reason: 'x', attempts: 1, lastAt: null }],
    }));
    await screen.findByText('a@t.vn');
    expect(screen.queryByTestId('failures-loading')).not.toBeInTheDocument();
  });

  it('API lỗi → toast.error với message của server, hàng con báo lỗi; mở lại thì thử tải lại', async () => {
    getRunFailures.mockRejectedValueOnce({ response: { data: { message: 'Lỗi server khi lấy chi tiết' } } });
    const button = await renderAndFindButton();
    fireEvent.click(button);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Lỗi server khi lấy chi tiết'));
    expect(await screen.findByText('Lỗi server khi lấy chi tiết')).toBeInTheDocument();

    // Đóng rồi mở lại: lần trước lỗi nên phải gọi lại.
    fireEvent.click(screen.getByRole('button', { name: /Ẩn danh sách 2 người chưa gửi được/ }));
    getRunFailures.mockResolvedValueOnce(asAxios({
      runId: 406,
      recipientAudit: null,
      failures: [{ channel: 'email', recipient: 'ok@t.vn', recipientDisplay: null, reason: 'x', attempts: 1, lastAt: null }],
    }));
    fireEvent.click(screen.getByRole('button', { name: openButtonName }));
    expect(await screen.findByText('ok@t.vn')).toBeInTheDocument();
    expect(getRunFailures).toHaveBeenCalledTimes(2);
  });

  it('API lỗi không có message → dùng câu mặc định', async () => {
    getRunFailures.mockRejectedValue(new Error('network'));
    fireEvent.click(await renderAndFindButton());
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Không thể tải chi tiết lỗi của chiến dịch này'));
  });
});
