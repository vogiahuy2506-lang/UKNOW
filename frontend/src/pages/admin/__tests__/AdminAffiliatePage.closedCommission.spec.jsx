import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../../i18n';
import AdminAffiliatePage from '../AdminAffiliatePage';

/**
 * PR-10 (C-17) — tab "Doanh số theo tháng" của admin: cột hoa hồng là số ĐÃ CHỐT sổ
 * (affiliate_periods.commission_amount, có closed_at NOT NULL), không phải "ước tính".
 */
const { mockWithdrawals, mockMonths, mockPeriods } = vi.hoisted(() => ({
  mockWithdrawals: vi.fn(),
  mockMonths: vi.fn(),
  mockPeriods: vi.fn(),
}));

vi.mock('../../../services/affiliate.service', () => ({
  default: {
    getAdminWithdrawals: mockWithdrawals,
    getAdminAvailableMonths: mockMonths,
    getAdminPeriods: mockPeriods,
  },
}));

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

describe('AdminAffiliatePage — tab doanh số theo tháng', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWithdrawals.mockResolvedValue({ data: [] });
    mockMonths.mockResolvedValue({ data: ['2026-08'] });
    mockPeriods.mockResolvedValue({
      data: [
        {
          id: 1,
          monthKey: '2026-08',
          referrerUserId: 7,
          userFullName: 'Đối tác A',
          userEmail: 'a@example.com',
          referralCode: 'AFF7',
          grossRevenue: 20000000,
          tierLevel: 3,
          ratePercent: 20,
          commissionAmount: 4000000,
          closedAt: '2026-09-02T03:00:00.000Z',
        },
      ],
    });
  });

  it('cột hoa hồng ghi "Hoa hồng đã chốt", không ghi "Hoa hồng ước tính"', async () => {
    render(
      <I18nProvider>
        <AdminAffiliatePage />
      </I18nProvider>
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Doanh số theo tháng' }));

    expect(await screen.findByRole('columnheader', { name: 'Hoa hồng đã chốt' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Hoa hồng ước tính' })).not.toBeInTheDocument();
  });
});
