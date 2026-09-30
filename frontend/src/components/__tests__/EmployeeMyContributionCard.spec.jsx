/**
 * PR-7 (PLAN_SO_LIEU_DUNG_GON_KHOP_2026-09-30) — thẻ "Tiến độ của bạn" của nhân viên: đúng 3 số cùng định nghĩa với bảng
 * "Hoạt động nhóm" của chủ; bỏ "Tỉ lệ thành công" và "Mẫu đã soạn". Từ điển vi THẬT.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

vi.mock('../../i18n', async () => (await import('../../test/realI18n.js')).realI18nModule());
vi.mock('../../features/users/services/userManagementApi.service', () => ({
  default: { getMyContribution: vi.fn() },
}));

import api from '../../features/users/services/userManagementApi.service';
import { useAuthStore } from '../../stores/authStore';
import EmployeeMyContributionCard from '../EmployeeMyContributionCard';

const mine = (overrides = {}) => ({
  id: 12,
  username: 'nv01',
  runningCampaigns: 2,
  waitingCampaigns: 1,
  sentThisMonth: 1234,
  failedThisMonth: 12,
  aiCreditsUsed: 35,
  aiCreditsLimit: 100,
  lastActiveAt: null,
  period: { fromDate: '2026-09-01', toDate: '2026-09-30' },
  aiCycle: { start: '2026-09-10T03:00:00.000Z', end: '2026-10-10T03:00:00.000Z' },
  ...overrides,
});

const asEmployee = () => useAuthStore.setState({
  isAuthenticated: true,
  user: { id: 12, role: 'user', activeContext: { type: 'employee', ownerId: 1 } },
});

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({ isAuthenticated: false, user: null });
});

describe('EmployeeMyContributionCard', () => {
  it('nhân viên thấy đúng 3 số: chiến dịch đang chạy, tin đã gửi tháng này, lượt AI kỳ này', async () => {
    asEmployee();
    api.getMyContribution.mockResolvedValue({ data: { success: true, data: mine() } });
    render(<EmployeeMyContributionCard />);

    await screen.findByText('Tiến độ của bạn');
    expect(screen.getByText('Chiến dịch đang chạy').nextSibling.textContent).toBe('2 · 1 đang chờ');
    expect(screen.getByText('Tin đã gửi tháng này').nextSibling.textContent).toBe('1.234 · 12 chưa gửi được');
    expect(screen.getByText('Lượt AI kỳ này').nextSibling.textContent).toBe('35 / 100');
    expect(screen.getByText('Tháng này · lượt AI tính theo kỳ gói (làm mới ngày 10/10)')).toBeTruthy();
  });

  it('không đặt hạn mức → "35"; bỏ "Tỉ lệ thành công", "Mẫu đã soạn" và ghi chú kỹ thuật', async () => {
    asEmployee();
    api.getMyContribution.mockResolvedValue({
      data: { success: true, data: mine({ aiCreditsLimit: null, waitingCampaigns: 0, failedThisMonth: 0 }) },
    });
    render(<EmployeeMyContributionCard />);

    await screen.findByText('Tiến độ của bạn');
    expect(screen.getByText('Lượt AI kỳ này').nextSibling.textContent).toBe('35');
    expect(screen.getByText('Chiến dịch đang chạy').nextSibling.textContent).toBe('2');
    expect(screen.getByText('Tin đã gửi tháng này').nextSibling.textContent).toBe('1.234');
    expect(screen.queryByText('Tỉ lệ thành công')).toBeNull();
    expect(screen.queryByText('Mẫu đã soạn')).toBeNull();
    expect(screen.queryByText('Tín dụng AI')).toBeNull();
    expect(screen.queryByText('Theo người tạo chiến dịch')).toBeNull();
  });

  it('không phải nhân viên → không hiện và không gọi API', async () => {
    useAuthStore.setState({ isAuthenticated: true, user: { id: 1, role: 'user', activeContext: { type: 'self' } } });
    const { container } = render(<EmployeeMyContributionCard />);
    await waitFor(() => expect(container.firstChild).toBeNull());
    expect(api.getMyContribution).not.toHaveBeenCalled();
  });

  it('thẻ trống (null) → không hiện', async () => {
    asEmployee();
    api.getMyContribution.mockResolvedValue({ data: { success: true, data: null } });
    const { container } = render(<EmployeeMyContributionCard />);
    await waitFor(() => expect(api.getMyContribution).toHaveBeenCalled());
    await waitFor(() => expect(container.firstChild).toBeNull());
  });
});
