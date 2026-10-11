import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../../i18n';
import AdminSystemPage from '../AdminSystemPage';

/**
 * 11/10/2026 production: DB pool 21/25 kết nối nhưng 21 rảnh, 0 chờ → thẻ vàng + cảnh báo "DB pool đang cao".
 * Kết nối rảnh pg giữ sẵn không phải áp lực: thẻ phải tô theo kết nối ĐANG BẬN.
 */
const { mockGetOverview, mockGetLogs } = vi.hoisted(() => ({
  mockGetOverview: vi.fn(),
  mockGetLogs: vi.fn(),
}));

vi.mock('../../../features/admin/services/adminSystemApi.service', () => ({
  default: { getOverview: mockGetOverview, getLogs: mockGetLogs },
}));

const overviewWith = (dbPool) => ({
  data: {
    data: {
      cpu: { percent: 10, cores: 4, loadAverage: [0.1] },
      memory: { percent: 20, used: 1024, total: 4096 },
      disk: { percent: 30, used: 1024, total: 4096, readable: true },
      host: { uptime: 3600 },
      process: { uptime: 60 },
      network: { rxRate: 0, txRate: 0, rxBytes: 0, txBytes: 0 },
      alerts: [],
      redis: { available: false },
      bullmq: null,
      dbPool,
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

const poolBar = async (connectionsText) => {
  const label = await screen.findByText(connectionsText);
  return label.closest('.card').querySelector('[style*="width"]');
};

describe('AdminSystemPage — thẻ DB pool tô theo kết nối đang bận', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetLogs.mockResolvedValue({ data: { data: { available: false, lines: [] } } });
  });

  it('21/25 mở nhưng 21 rảnh → xanh, thanh 0%, hiện "Đang dùng: 0"', async () => {
    mockGetOverview.mockResolvedValue(overviewWith({
      available: true, total: 21, idle: 21, busy: 0, waiting: 0, max: 25, percent: 84, busyPercent: 0,
    }));
    renderPage();
    const bar = await poolBar('21/25 kết nối');
    expect(bar.className).toContain('bg-emerald-500');
    expect(bar.style.width).toBe('0%');
    expect(screen.getByText('Đang dùng: 0')).toBeInTheDocument();
  });

  it('20/25 bận (80%) → vàng', async () => {
    mockGetOverview.mockResolvedValue(overviewWith({
      available: true, total: 22, idle: 2, busy: 20, waiting: 0, max: 25, percent: 88, busyPercent: 80,
    }));
    renderPage();
    expect((await poolBar('22/25 kết nối')).className).toContain('bg-amber-500');
    expect(screen.getByText('Đang dùng: 20')).toBeInTheDocument();
  });

  it('backend cũ chưa có busy/busyPercent → tự tính số đang dùng, màu theo percent như trước', async () => {
    mockGetOverview.mockResolvedValue(overviewWith({ total: 21, idle: 21, waiting: 0, max: 25, percent: 84 }));
    renderPage();
    expect((await poolBar('21/25 kết nối')).className).toContain('bg-amber-500');
    expect(screen.getByText('Đang dùng: 0')).toBeInTheDocument();
  });
});
