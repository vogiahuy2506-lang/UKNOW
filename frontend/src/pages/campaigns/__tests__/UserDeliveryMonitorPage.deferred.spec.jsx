import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import UserDeliveryMonitorPage from '../UserDeliveryMonitorPage';
import userDeliveryMonitorApiService from '../../../features/campaign/services/userDeliveryMonitorApi.service';
import { asAxios, buildOverview, buildRun, mockT } from './userDeliveryMonitor.testUtils';

/**
 * PLAN_SO_LIEU_DUNG_GON_KHOP_2026-09-30, PR-4b — lượt đang chờ hợp lệ (hết hạn mức, giờ yên lặng, SMTP nhả, chờ bước
 * kế…) hiện "Đang chờ: <lý do> đến HH:mm" trong bảng lượt chạy và KHÔNG có class đỏ / vàng / cam: chờ không phải lỗi.
 * (Bản trước của file này ghim ngược lại: lượt running chưa gửi được tin nào mà không có mốc chờ bị tô đỏ như "kẹt".
 * Cách tô đó đã bỏ cùng các hàng đỏ / cam — trang không còn tô nền dòng theo tỉ lệ lỗi.)
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

const { getOverview } = userDeliveryMonitorApiService;

// generatedAt = 03:30 giờ VN ngày 30/09. Mốc chờ 23:00 UTC = 06:00 VN ngày 30/09 (cùng ngày → chỉ HH:mm).
const UNTIL_TODAY = '2026-09-29T23:00:00.000Z';
const RED_OR_YELLOW = /(?:red|amber|yellow|orange)-\d|badge-(?:error|warning)/;

beforeEach(() => {
  vi.clearAllMocks();
});

const renderWith = async (runs) => {
  getOverview.mockResolvedValue(asAxios(buildOverview({ runs })));
  render(<UserDeliveryMonitorPage />);
  await screen.findByTestId('card-sent');
};

describe('UserDeliveryMonitorPage — lượt đang chờ không tô đỏ', () => {
  it('lượt running, mốc chờ tương lai, CHƯA gửi được tin nào: hiện "Đang chờ: <lý do> đến HH:mm", nền và huy hiệu trung tính', async () => {
    await renderWith([
      buildRun({
        runId: 501, campaignName: 'Chiến dịch chờ SMTP', status: 'running', sent: 0, planned: 10,
        waitingUntil: UNTIL_TODAY, waitingReason: 'smtp_rate_limited',
      }),
    ]);

    const row = screen.getByTestId('run-row-501');
    expect(within(row).getByTestId('run-status').textContent).toBe('Đang chờ: máy chủ email tạm chặn gửi đến 06:00');
    expect(row.className).not.toMatch(RED_OR_YELLOW);
    expect(row.outerHTML).not.toMatch(RED_OR_YELLOW);
    expect(within(row).getByTestId('run-status')).toHaveClass('badge-gray');
  });

  it.each([
    ['quiet_hours', 'đang trong khung giờ yên lặng'],
    ['channel_quiet_hours', 'đang trong khung giờ yên lặng'],
    ['rate_limited', 'tài khoản đã đạt giới hạn gửi trong giờ'],
    ['inter_message_delay', 'cần giãn cách thêm giữa các tin'],
    ['phone_lookup_cooldown', 'tài khoản đang bị khoá tra số điện thoại'],
    ['channel_rate_limit', 'nhà cung cấp yêu cầu chờ (giới hạn tần suất)'],
    ['plan_quota_daily', 'đã hết lượt gửi (theo gói hoặc giới hạn bạn đặt)'],
    ['plan_quota_account_daily_telegram', 'đã hết lượt gửi (theo gói hoặc giới hạn bạn đặt)'],
    ['all_recipients_waiting_next_due', 'chờ tới bước gửi kế tiếp'],
    ['scheduled_step_email_2', 'chờ tới bước gửi kế tiếp'],
    ['smtp_transient_burst', 'máy chủ email đang lỗi kết nối'],
    ['ma_la', 'hệ thống đang bận'],
    [null, 'hệ thống đang bận'],
  ])('mã lý do %s → "%s" (không in mã thô)', async (code, text) => {
    await renderWith([
      buildRun({ runId: 1, status: 'running', waitingUntil: UNTIL_TODAY, waitingReason: code }),
    ]);
    const label = within(screen.getByTestId('run-row-1')).getByTestId('run-status').textContent;
    expect(label).toBe(`Đang chờ: ${text} đến 06:00`);
    if (code) expect(label).not.toContain(code);
  });

  it('chờ sang ngày khác: mốc hiện đủ dd/MM HH:mm', async () => {
    await renderWith([
      buildRun({ runId: 1, status: 'running', waitingUntil: '2026-10-02T02:00:00.000Z', waitingReason: 'all_recipients_waiting_next_due' }),
    ]);
    expect(within(screen.getByTestId('run-row-1')).getByTestId('run-status').textContent)
      .toBe('Đang chờ: chờ tới bước gửi kế tiếp đến 02/10 09:00');
  });

  it('lượt running KHÔNG có mốc chờ (hoặc BE đã bỏ mốc quá hạn) là "Đang gửi", huy hiệu xanh dương (không đỏ / vàng)', async () => {
    await renderWith([buildRun({ runId: 1, status: 'running', sent: 0, planned: 10, waitingUntil: null })]);
    const row = screen.getByTestId('run-row-1');
    expect(within(row).getByTestId('run-status').textContent).toBe('Đang gửi');
    expect(within(row).getByTestId('run-status')).toHaveClass('badge-info');
    expect(row.outerHTML).not.toMatch(RED_OR_YELLOW);
  });

  it('lượt đang chờ mà đã có người chưa gửi được: nền dòng vẫn trung tính (chỉ con số lỗi là chữ đỏ, bấm được)', async () => {
    await renderWith([
      buildRun({ runId: 1, status: 'running', sent: 3, failed: 2, planned: 10, waitingUntil: UNTIL_TODAY, waitingReason: 'quiet_hours' }),
    ]);
    const row = screen.getByTestId('run-row-1');
    expect(row.className).not.toMatch(RED_OR_YELLOW);
    expect(within(row).getByTestId('run-status')).toHaveClass('badge-gray');
    expect(within(row).getByRole('button', { name: /Xem 2 người chưa gửi được/ })).toBeInTheDocument();
  });

  it('huy hiệu theo trạng thái: Xong xanh lá, Lỗi đỏ, Đã dừng xám — và KHÔNG dòng nào bị tô nền theo tỉ lệ lỗi', async () => {
    await renderWith([
      buildRun({ runId: 1, status: 'completed', sent: 5, failed: 5 }),
      buildRun({ runId: 2, status: 'failed' }),
      buildRun({ runId: 3, status: 'stopped' }),
    ]);
    expect(within(screen.getByTestId('run-row-1')).getByTestId('run-status')).toHaveClass('badge-success');
    expect(within(screen.getByTestId('run-row-2')).getByTestId('run-status')).toHaveClass('badge-error');
    expect(within(screen.getByTestId('run-row-3')).getByTestId('run-status')).toHaveClass('badge-gray');
    for (const id of [1, 2, 3]) {
      expect(screen.getByTestId(`run-row-${id}`).className).not.toMatch(/bg-(?:red|orange|emerald)/);
    }
  });
});
