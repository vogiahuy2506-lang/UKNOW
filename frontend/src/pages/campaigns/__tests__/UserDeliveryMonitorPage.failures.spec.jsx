import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import UserDeliveryMonitorPage from '../UserDeliveryMonitorPage';
import userDeliveryMonitorApiService from '../../../features/campaign/services/userDeliveryMonitorApi.service';
import toast from 'react-hot-toast';
import viTranslations from '../../../i18n/vi';

// Helper get nested translation
const getNestedTranslation = (obj, path) =>
  path.split('.').reduce((acc, part) => acc?.[part], obj);

const mockT = (key, params) => {
  const val = getNestedTranslation(viTranslations, key);
  if (typeof val === 'string') {
    if (params) {
      let str = val;
      for (const [k, v] of Object.entries(params)) {
        str = str.replace(`{${k}}`, v);
      }
      return str;
    }
    return val;
  }
  return key;
};

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
  default: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }) => <div>{children}</div>,
  LineChart: () => <div data-testid="line-chart" />,
  Line: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  CartesianGrid: () => null,
}));

describe('UserDeliveryMonitorPage — PR-2 failure details & recipientAudit', () => {
  const baseOverview = {
    summary: {
      sent: 2,
      failed: 2,
      opened: 0,
      clicked: 0,
      totalRuns: 1,
      runningRuns: 0,
      completedRuns: 1,
      failedRuns: 0,
      attempts: 4,
      successRate: 50,
    },
    channels: [],
    channelsRecent: [],
    timeline: [],
    topRuns: [
      {
        id: 406,
        campaignName: 'Zalo Auto Plan 12/9/2026',
        status: 'completed',
        successfulSends: 2,
        failedSends: 2,
        skippedSends: 0,
        totalRecipients: 6,
        durationSeconds: 120,
        throughputPerMinute: 2,
        failureRate: 50,
        startedAt: '2026-09-12T15:00:00.000Z',
        completedAt: '2026-09-12T15:02:00.000Z',
      },
    ],
    recentErrors: [],
    signals: [],
    health: {},
  };

  beforeEach(() => {
    vi.clearAllMocks();
    userDeliveryMonitorApiService.getOverview.mockResolvedValue({
      data: { data: baseOverview },
    });
  });

  it('nhãn tổng đổi thành "lượt dự kiến" qua plannedSends', async () => {
    render(<UserDeliveryMonitorPage />);

    await waitFor(() => {
      expect(screen.getByText(/6 lượt dự kiến/)).toBeInTheDocument();
    });
  });

  it('hàng có failedSends > 0 bấm mở → gọi getRunFailures và hiện đúng số dòng', async () => {
    const mockFailuresResponse = {
      runId: 406,
      recipientAudit: {
        sourceRows: 6,
        withRecipient: 3,
        deduped: 3,
        skippedNoRecipient: 3,
        skippedAlreadySent: 1,
        skippedNotDue: 0,
        skippedCompleted: 0,
        attempted: 4,
      },
      failures: [
        {
          channel: 'zalo',
          recipient: '0388180856',
          reason: 'invalid_parameter',
          error: 'Tham số không hợp lệ',
          count: 2,
          lastAt: '2026-09-13T15:19:21.000Z',
          ledgerStep: 0,
        },
        {
          channel: 'email',
          recipient: 'bounce@test.com',
          reason: 'not_found',
          error: 'Bounce (hard)',
          count: 1,
          lastAt: '2026-09-13T15:20:00.000Z',
          ledgerStep: 0,
        },
      ],
    };

    userDeliveryMonitorApiService.getRunFailures.mockResolvedValue({
      data: { data: mockFailuresResponse },
    });

    render(<UserDeliveryMonitorPage />);

    await waitFor(() => {
      expect(screen.getByText(/Zalo Auto Plan 12\/9\/2026/)).toBeInTheDocument();
    });

    // Nút mở chi tiết lỗi: "/ 2 lỗi"
    const errorBtn = screen.getByRole('button', { name: /\/ 2 lỗi/i });
    expect(errorBtn).toBeInTheDocument();

    fireEvent.click(errorBtn);

    expect(userDeliveryMonitorApiService.getRunFailures).toHaveBeenCalledWith(406);

    await waitFor(() => {
      const rows = screen.getAllByTestId('failure-item-row');
      expect(rows).toHaveLength(2);
      expect(screen.getByText('0388180856')).toBeInTheDocument();
      expect(screen.getByText('bounce@test.com')).toBeInTheDocument();
      expect(screen.getByText('Tham số không hợp lệ')).toBeInTheDocument();
      expect(screen.getByText('Không tìm thấy tài khoản')).toBeInTheDocument();
    });

    // Kiểm tra dòng giải thích recipientAudit
    const explanation = screen.getByTestId('recipient-audit-explanation');
    expect(explanation).toBeInTheDocument();
    expect(explanation.textContent).toContain('6 hàng nguồn → 3 có số → 4 lượt gửi; 3 không có số, 1 đã gửi ở lượt trước');
  });

  it('run không có recipientAudit → không hiện dòng giải thích', async () => {
    const mockFailuresNoAudit = {
      runId: 406,
      recipientAudit: null,
      failures: [
        {
          channel: 'zalo',
          recipient: '0388180856',
          reason: 'invalid_parameter',
          error: 'Tham số không hợp lệ',
          count: 2,
          lastAt: '2026-09-13T15:19:21.000Z',
          ledgerStep: 0,
        },
      ],
    };

    userDeliveryMonitorApiService.getRunFailures.mockResolvedValue({
      data: { data: mockFailuresNoAudit },
    });

    render(<UserDeliveryMonitorPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /\/ 2 lỗi/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /\/ 2 lỗi/i }));

    await waitFor(() => {
      expect(screen.getByText('0388180856')).toBeInTheDocument();
    });

    // Không có recipientAudit → không có element explanation
    expect(screen.queryByTestId('recipient-audit-explanation')).not.toBeInTheDocument();
  });

  it('bấm lại nút lỗi → đóng hàng con', async () => {
    userDeliveryMonitorApiService.getRunFailures.mockResolvedValue({
      data: {
        data: {
          runId: 406,
          recipientAudit: null,
          failures: [],
        },
      },
    });

    render(<UserDeliveryMonitorPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /\/ 2 lỗi/i })).toBeInTheDocument();
    });

    const errorBtn = screen.getByRole('button', { name: /\/ 2 lỗi/i });
    // Mở
    fireEvent.click(errorBtn);

    await waitFor(() => {
      expect(screen.getByTestId('run-failures-row-406')).toBeInTheDocument();
    });

    // Đóng
    fireEvent.click(errorBtn);

    await waitFor(() => {
      expect(screen.queryByTestId('run-failures-row-406')).not.toBeInTheDocument();
    });
  });

  it('khi API getRunFailures lỗi → hiện toast error', async () => {
    userDeliveryMonitorApiService.getRunFailures.mockRejectedValue({
      response: { data: { message: 'Lỗi server khi lấy chi tiết' } },
    });

    render(<UserDeliveryMonitorPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /\/ 2 lỗi/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /\/ 2 lỗi/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Lỗi server khi lấy chi tiết');
    });
  });
});
