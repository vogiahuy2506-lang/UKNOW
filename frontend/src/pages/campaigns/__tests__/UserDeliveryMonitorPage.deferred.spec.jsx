import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import UserDeliveryMonitorPage from '../UserDeliveryMonitorPage';
import userDeliveryMonitorApiService from '../../../features/campaign/services/userDeliveryMonitorApi.service';
import viTranslations from '../../../i18n/vi';

/**
 * PR-8a (UI nói thật) Việc 4 — run đang chờ hợp lệ (deferredUntil tương lai — SMTP pause 12h,
 * quota, quiet hours Zalo...) KHÔNG được tô đỏ như run "kẹt" (totalRecipients>0, successfulSends=0,
 * status=running); phải hiện lý do chờ theo khuôn AdminDeliveryMonitorPage.jsx:360-365.
 */

const getNestedTranslation = (obj, path) => path.split('.').reduce((acc, part) => acc?.[part], obj);

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
  default: { error: vi.fn(), success: vi.fn() },
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

function buildOverview(topRuns) {
  return {
    summary: {
      sent: 0, failed: 0, opened: 0, clicked: 0, totalRuns: topRuns.length,
      runningRuns: topRuns.length, completedRuns: 0, failedRuns: 0, attempts: 0, successRate: 0,
    },
    channels: [],
    channelsRecent: [],
    timeline: [],
    topRuns,
    recentErrors: [],
    signals: [],
    health: {},
  };
}

describe('UserDeliveryMonitorPage — PR-8a run đang chờ (deferredUntil) không tô đỏ', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('run running, 0 successfulSends, deferredUntil TƯƠNG LAI → KHÔNG tô đỏ (không phải "kẹt")', async () => {
    userDeliveryMonitorApiService.getOverview.mockResolvedValue({
      data: {
        data: buildOverview([
          {
            id: 501,
            campaignName: 'Chiến dịch chờ SMTP',
            status: 'running',
            successfulSends: 0,
            failedSends: 0,
            skippedSends: 0,
            totalRecipients: 10,
            durationSeconds: 60,
            throughputPerMinute: 0,
            failureRate: 0,
            startedAt: '2026-09-27T00:00:00.000Z',
            deferredUntil: new Date(Date.now() + 12 * 3600 * 1000).toISOString(),
            deferredReason: 'smtp_rate_limited',
          },
        ]),
      },
    });

    render(<UserDeliveryMonitorPage />);

    await waitFor(() => {
      expect(screen.getByText('Chiến dịch chờ SMTP')).toBeInTheDocument();
    });

    const row = screen.getByText('Chiến dịch chờ SMTP').closest('tr');
    expect(row.className).not.toContain('bg-red-50');
    // Hiện badge "Đang chờ" + lý do chờ, theo khuôn AdminDeliveryMonitorPage.
    expect(screen.getByText('Đang chờ')).toBeInTheDocument();
    expect(screen.getByText('smtp_rate_limited')).toBeInTheDocument();
  });

  it('run running, 0 successfulSends, KHÔNG có deferredUntil → vẫn tô đỏ như "kẹt" (hành vi cũ giữ nguyên)', async () => {
    userDeliveryMonitorApiService.getOverview.mockResolvedValue({
      data: {
        data: buildOverview([
          {
            id: 502,
            campaignName: 'Chiến dịch kẹt thật',
            status: 'running',
            successfulSends: 0,
            failedSends: 0,
            skippedSends: 0,
            totalRecipients: 10,
            durationSeconds: 60,
            throughputPerMinute: 0,
            failureRate: 0,
            startedAt: '2026-09-27T00:00:00.000Z',
            deferredUntil: null,
          },
        ]),
      },
    });

    render(<UserDeliveryMonitorPage />);

    await waitFor(() => {
      expect(screen.getByText('Chiến dịch kẹt thật')).toBeInTheDocument();
    });

    const row = screen.getByText('Chiến dịch kẹt thật').closest('tr');
    expect(row.className).toContain('bg-red-50');
    expect(screen.queryByText('Đang chờ')).not.toBeInTheDocument();
  });

  it('run running, 0 successfulSends, deferredUntil ĐÃ QUA (quá khứ) → vẫn tô đỏ như "kẹt"', async () => {
    userDeliveryMonitorApiService.getOverview.mockResolvedValue({
      data: {
        data: buildOverview([
          {
            id: 503,
            campaignName: 'Chiến dịch deferred hết hạn',
            status: 'running',
            successfulSends: 0,
            failedSends: 0,
            skippedSends: 0,
            totalRecipients: 10,
            durationSeconds: 60,
            throughputPerMinute: 0,
            failureRate: 0,
            startedAt: '2026-09-27T00:00:00.000Z',
            deferredUntil: new Date(Date.now() - 60 * 1000).toISOString(),
          },
        ]),
      },
    });

    render(<UserDeliveryMonitorPage />);

    await waitFor(() => {
      expect(screen.getByText('Chiến dịch deferred hết hạn')).toBeInTheDocument();
    });

    const row = screen.getByText('Chiến dịch deferred hết hạn').closest('tr');
    expect(row.className).toContain('bg-red-50');
  });

  it('trạng thái lượt chạy in nhãn Việt hoá (không phải chuỗi status gốc)', async () => {
    userDeliveryMonitorApiService.getOverview.mockResolvedValue({
      data: {
        data: buildOverview([
          {
            id: 504,
            campaignName: 'Chiến dịch đã dừng',
            status: 'stopped',
            successfulSends: 3,
            failedSends: 0,
            skippedSends: 0,
            totalRecipients: 10,
            durationSeconds: 60,
            throughputPerMinute: 1,
            failureRate: 0,
            startedAt: '2026-09-27T00:00:00.000Z',
          },
        ]),
      },
    });

    render(<UserDeliveryMonitorPage />);

    await waitFor(() => {
      expect(screen.getByText('Đã dừng')).toBeInTheDocument();
    });
    expect(screen.queryByText('stopped')).not.toBeInTheDocument();
  });
});
