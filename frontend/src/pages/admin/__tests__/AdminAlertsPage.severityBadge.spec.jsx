import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AdminAlertsPage from '../AdminAlertsPage';

/**
 * PR-10 (C-15) — huy hiệu mức "critical" ở bảng quy tắc cảnh báo dùng class `badge-danger` KHÔNG tồn tại
 * trong index.css (chỉ có badge-success/warning/error/info/gray) nên không có màu. Lớp đúng: badge-error.
 */
const { mockGetOverview } = vi.hoisted(() => ({ mockGetOverview: vi.fn() }));

vi.mock('../../../features/admin/services/adminAlertsApi.service', () => ({
  default: {
    getOverview: mockGetOverview,
    updateRule: vi.fn(),
    resolveEvent: vi.fn(),
    evaluateNow: vi.fn(),
  },
}));

describe('AdminAlertsPage — huy hiệu mức độ', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetOverview.mockResolvedValue({
      data: {
        data: {
          rules: [
            { id: 1, code: 'r_crit', name: 'Quy tắc nghiêm trọng', description: '', severity: 'critical', channel: 'email', enabled: true },
            { id: 2, code: 'r_warn', name: 'Quy tắc cảnh báo', description: '', severity: 'warning', channel: 'email', enabled: true },
          ],
          events: [],
        },
      },
    });
  });

  it('critical → badge-error (có màu đỏ), warning → badge-warning; không còn badge-danger', async () => {
    const { container } = render(<AdminAlertsPage />);
    const critical = await screen.findByText('critical');
    expect(critical.className).toContain('badge-error');
    expect(screen.getByText('warning').className).toContain('badge-warning');
    expect(container.querySelector('.badge-danger')).toBeNull();
  });
});
