import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../../i18n';
import AdminSystemPage from '../AdminSystemPage';

/**
 * PR-10 — trang Máy chủ: nhãn cảnh báo ổ đĩa nói "vượt 80%" nhưng ngưỡng cảnh báo thật của backend là 70%
 * (storageCapacity.util.js DEFAULT_POLICY.warningPercent), và thẻ ổ đĩa vẫn xanh ở 70–79%.
 */
const { mockGetOverview, mockGetLogs } = vi.hoisted(() => ({
  mockGetOverview: vi.fn(),
  mockGetLogs: vi.fn(),
}));

vi.mock('../../../features/admin/services/adminSystemApi.service', () => ({
  default: { getOverview: mockGetOverview, getLogs: mockGetLogs },
}));

const overviewWith = (diskPercent, alerts = []) => ({
  data: {
    data: {
      cpu: { percent: 10, cores: 4, loadAverage: [0.1] },
      memory: { percent: 20, used: 1024, total: 4096 },
      disk: { percent: diskPercent, used: 1024, total: 4096, readable: true },
      host: { uptime: 3600 },
      process: { uptime: 60 },
      network: { rxRate: 0, txRate: 0, rxBytes: 0, txBytes: 0 },
      alerts,
      redis: { available: false },
      bullmq: null,
      dbPool: { total: 1, max: 20, idle: 1, waiting: 0, percent: 5 },
      docker: { available: false, containers: [] },
    },
  },
});

const renderPage = () =>
  render(
    <I18nProvider>
      <AdminSystemPage />
    </I18nProvider>
  );

const diskBar = async (valueText) => {
  const value = await screen.findByText(valueText);
  return value.closest('.card').querySelector('[style*="width"]');
};

describe('AdminSystemPage — ngưỡng ổ đĩa khớp backend (70% cảnh báo / 90% nghiêm trọng)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetLogs.mockResolvedValue({ data: { data: { available: false, lines: [] } } });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('cảnh báo DISK_WARNING hiện "Ổ đĩa đang vượt 70%" (không còn 80%)', async () => {
    mockGetOverview.mockResolvedValue(overviewWith(75, [{ level: 'warning', code: 'DISK_WARNING' }]));
    renderPage();
    expect(await screen.findByText('Ổ đĩa đang vượt 70%')).toBeInTheDocument();
    expect(screen.queryByText('Ổ đĩa đang vượt 80%')).toBeNull();
  });

  it('ổ đĩa 75% → thẻ vàng (trước đây xanh vì ngưỡng cứng 80)', async () => {
    mockGetOverview.mockResolvedValue(overviewWith(75, [{ level: 'warning', code: 'DISK_WARNING' }]));
    renderPage();
    expect((await diskBar('75.0%')).className).toContain('bg-amber-500');
  });

  it('ổ đĩa 65% → xanh; 92% → đỏ (ngưỡng nghiêm trọng 90 giữ nguyên)', async () => {
    mockGetOverview.mockResolvedValue(overviewWith(65));
    const first = renderPage();
    expect((await diskBar('65.0%')).className).toContain('bg-emerald-500');
    first.unmount();

    mockGetOverview.mockResolvedValue(overviewWith(92, [{ level: 'critical', code: 'DISK_HIGH' }]));
    renderPage();
    expect((await diskBar('92.0%')).className).toContain('bg-red-500');
  });
});
