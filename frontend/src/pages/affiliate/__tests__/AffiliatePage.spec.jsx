import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../../i18n';
import AffiliatePage from '../AffiliatePage';

const { mockGetOverview } = vi.hoisted(() => ({
  mockGetOverview: vi.fn(),
}));

vi.mock('../../../services/affiliate.service', () => ({
  default: {
    getOverview: mockGetOverview,
    getPrefill: vi.fn(),
    requestWithdrawal: vi.fn(),
  },
}));

describe('AffiliatePage — Frontend UI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Hiển thị mã ref, link chia sẻ, số dư ví, bậc hiện tại và MỤC ĐANG CHỜ ĐỦ ĐIỀU KIỆN', async () => {
    mockGetOverview.mockResolvedValueOnce({
      data: {
        referralCode: 'AFF888',
        referralLink: 'https://founderai.biz/register?ref=AFF888',
        currentBalance: 2500000,
        currentMonthGross: 15000000,
        currentTier: { level: 2, ratePercent: 15 },
        nextTier: { level: 3, minRevenue: 20000000, ratePercent: 20 },
        amountToNextTier: 5000000,
        estimatedCommission: 2250000,
        hasPendingWithdrawal: false,
        pendingApproval: {
          pendingRevenue: 3000000,
          pendingBuyersCount: 1,
          events: [
            {
              id: 101,
              buyerEmailMasked: 'pen***@example.com',
              amount: 3000000,
              createdAt: '2026-09-01T10:00:00.000Z',
            },
          ],
        },
        monthlyHistory: [
          {
            id: 1,
            monthKey: '2026-08',
            grossRevenue: 20000000,
            tierLevel: 3,
            ratePercent: 20,
            commissionAmount: 4000000,
            closedAt: '2026-09-02T03:00:00.000Z',
          },
        ],
        withdrawalHistory: [],
        ledgerHistory: [],
      },
    });

    render(
      <I18nProvider>
        <AffiliatePage />
      </I18nProvider>
    );

    // Chờ tải xong
    await waitFor(() => {
      expect(screen.getByText('AFF888')).toBeInTheDocument();
    });

    // Khẳng định số dư ví hiển thị
    expect(screen.getByText('2.500.000 đ')).toBeInTheDocument();

    // Khẳng định link ref
    expect(screen.getByText('https://founderai.biz/register?ref=AFF888')).toBeInTheDocument();

    // 🔴 BẮT BUỘC: Khẳng định mục "ĐANG CHỜ ĐỦ ĐIỀU KIỆN" hiển thị buyerEmailMasked
    expect(screen.getByText('pen***@example.com')).toBeInTheDocument();
    expect(screen.getAllByText('3.000.000 đ').length).toBeGreaterThanOrEqual(1);

    // Nút rút tiền enable vì số dư 2.500.000đ >= 1.000.000đ
    const withdrawBtn = screen.getByRole('button', { name: /Yêu cầu rút tiền|Request Withdrawal/i });
    expect(withdrawBtn).not.toBeDisabled();
  });

  it('Nút Yêu cầu rút tiền bị KHOÁ kèm câu giải thích khi số dư < 1.000.000đ', async () => {
    mockGetOverview.mockResolvedValueOnce({
      data: {
        referralCode: 'AFF500',
        referralLink: 'https://founderai.biz/register?ref=AFF500',
        currentBalance: 500000, // < 1.000.000đ
        currentMonthGross: 500000,
        currentTier: { level: 1, ratePercent: 10 },
        nextTier: { level: 2, minRevenue: 10000000, ratePercent: 15 },
        amountToNextTier: 9500000,
        estimatedCommission: 50000,
        hasPendingWithdrawal: false,
        pendingApproval: { pendingRevenue: 0, pendingBuyersCount: 0, events: [] },
        monthlyHistory: [],
        withdrawalHistory: [],
        ledgerHistory: [],
      },
    });

    render(
      <I18nProvider>
        <AffiliatePage />
      </I18nProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('AFF500')).toBeInTheDocument();
    });

    // Nút rút tiền bị disabled
    const withdrawBtn = screen.getByRole('button', { name: /Yêu cầu rút tiền|Request Withdrawal/i });
    expect(withdrawBtn).toBeDisabled();

    // Có câu giải thích ngưỡng 1.000.000đ
    expect(screen.getByText(/1.000.000đ/)).toBeInTheDocument();
  });
});
