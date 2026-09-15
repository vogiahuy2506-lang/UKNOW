import { render, screen, waitFor, fireEvent } from '@testing-library/react';
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

    // Khẳng định số dư ví hiển thị (số dư khả dụng để rút tất cả nên số tiền lặp lại ở bảng chi tiết)
    expect(screen.getAllByText('2.500.000 đ').length).toBeGreaterThanOrEqual(1);

    // Khẳng định link ref
    expect(screen.getByText('https://founderai.biz/register?ref=AFF888')).toBeInTheDocument();

    // 🔴 BẮT BUỘC: mục "ĐANG CHỜ ĐỦ ĐIỀU KIỆN" — danh sách gấp lại, bấm "Xem N đơn" mới hiện buyerEmailMasked
    fireEvent.click(screen.getByRole('button', { name: /Xem 1 đơn/i }));
    expect(screen.getByText('pen***@example.com')).toBeInTheDocument();
    expect(screen.getAllByText('3.000.000 đ').length).toBeGreaterThanOrEqual(1);

    // Nút rút tiền enable vì số dư 2.500.000đ >= 1.000.000đ
    const withdrawBtn = screen.getByRole('button', { name: /affiliate\.requestWithdrawal|Yêu cầu rút tiền|Request Withdrawal/i });
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
    const withdrawBtn = screen.getByRole('button', { name: /affiliate\.requestWithdrawal|Yêu cầu rút tiền|Request Withdrawal/i });
    expect(withdrawBtn).toBeDisabled();
  });

  // Dữ liệu mẫu thiết kế lại 15/09 (mục 4 plan): currentMonthGross 6.450.000, bậc 1,
  // amountToNextTier 3.550.000, số dư 1.240.000, 2 đơn chờ tổng 598.000.
  const TIERS_5_BAC = [
    { level: 1, minRevenue: 0, ratePercent: 10 },
    { level: 2, minRevenue: 10000000, ratePercent: 15 },
    { level: 3, minRevenue: 20000000, ratePercent: 20 },
    { level: 4, minRevenue: 50000000, ratePercent: 25 },
    { level: 5, minRevenue: 100000000, ratePercent: 30 },
  ];

  function baseOverviewData(overrides = {}) {
    return {
      referralCode: 'AFF001',
      referralLink: 'https://founderai.biz/register?ref=AFF001',
      currentBalance: 1240000,
      currentMonthKey: '2026-09',
      currentMonthGross: 6450000,
      currentTier: { level: 1, ratePercent: 10 },
      nextTier: { level: 2, minRevenue: 10000000, ratePercent: 15 },
      amountToNextTier: 3550000,
      estimatedCommission: 645000,
      hasPendingWithdrawal: false,
      pendingApproval: { pendingRevenue: 0, pendingBuyersCount: 0, events: [] },
      monthlyHistory: [],
      withdrawalHistory: [],
      ledgerHistory: [],
      tiers: TIERS_5_BAC,
      ...overrides,
    };
  }

  it('1. Tiêu đề trang là "Chương trình đối tác"', async () => {
    mockGetOverview.mockResolvedValueOnce({ data: baseOverviewData() });

    render(
      <I18nProvider>
        <AffiliatePage />
      </I18nProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Chương trình đối tác')).toBeInTheDocument();
    });
  });

  it('2. Thang 5 bậc hiển thị đủ, bậc hiện tại đánh dấu, gợi ý đúng số tiền + bậc kế', async () => {
    mockGetOverview.mockResolvedValueOnce({ data: baseOverviewData() });

    const { container } = render(
      <I18nProvider>
        <AffiliatePage />
      </I18nProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('AFF001')).toBeInTheDocument();
    });

    // 5 đoạn thang bậc — mỗi bậc có nhãn phần trăm riêng
    ['10%', '15%', '20%', '25%', '30%'].forEach((label) => {
      expect(container.textContent).toContain(label);
    });

    // Gợi ý lên bậc kế: "3.550.000 đ … Bậc 2 (15%)"
    expect(container.textContent).toContain('3.550.000 đ');
    expect(container.textContent).toContain('Bậc 2 (15%)');
  });

  it('3. Rút tiền: đủ số dư hiện thuế/thực nhận + nút bật; thiếu số dư hoặc đang chờ duyệt → nút tắt + lý do', async () => {
    // a) Số dư 1.240.000đ >= tối thiểu → thuế 124.000đ, thực nhận 1.116.000đ, nút bật
    mockGetOverview.mockResolvedValueOnce({ data: baseOverviewData({ currentBalance: 1240000 }) });
    const render1 = render(
      <I18nProvider>
        <AffiliatePage />
      </I18nProvider>
    );
    await waitFor(() => expect(render1.getByText('AFF001')).toBeInTheDocument());
    expect(render1.getByText('124.000 đ')).toBeInTheDocument();
    expect(render1.getByText('1.116.000 đ')).toBeInTheDocument();
    expect(
      render1.getByRole('button', { name: /affiliate\.requestWithdrawal|Yêu cầu rút tiền|Request Withdrawal/i })
    ).not.toBeDisabled();
    render1.unmount();

    // b) Số dư 900.000đ < tối thiểu → nút tắt + lý do thiếu số dư
    mockGetOverview.mockResolvedValueOnce({ data: baseOverviewData({ currentBalance: 900000 }) });
    const render2 = render(
      <I18nProvider>
        <AffiliatePage />
      </I18nProvider>
    );
    await waitFor(() => expect(render2.getByText('AFF001')).toBeInTheDocument());
    expect(
      render2.getByRole('button', { name: /affiliate\.requestWithdrawal|Yêu cầu rút tiền|Request Withdrawal/i })
    ).toBeDisabled();
    expect(render2.getByText('Số dư tối thiểu để rút là 1.000.000đ (hiện có: 900.000 đ)')).toBeInTheDocument();
    render2.unmount();

    // c) hasPendingWithdrawal → nút tắt + câu đang chờ xử lý
    mockGetOverview.mockResolvedValueOnce({
      data: baseOverviewData({ currentBalance: 1240000, hasPendingWithdrawal: true }),
    });
    const render3 = render(
      <I18nProvider>
        <AffiliatePage />
      </I18nProvider>
    );
    await waitFor(() => expect(render3.getByText('AFF001')).toBeInTheDocument());
    expect(
      render3.getByRole('button', { name: /affiliate\.requestWithdrawal|Yêu cầu rút tiền|Request Withdrawal/i })
    ).toBeDisabled();
    expect(render3.getByText('Bạn đang có yêu cầu rút đang chờ kế toán xử lý')).toBeInTheDocument();
    render3.unmount();
  });

  it('4. Khung cảnh báo CHỈ hiện khi pendingBuyersCount > 0; danh sách chỉ hiện email đã che, không lộ buyerEmail đầy đủ', async () => {
    // a) 0 đơn chờ → không có khung cảnh báo
    mockGetOverview.mockResolvedValueOnce({ data: baseOverviewData() });
    const render1 = render(
      <I18nProvider>
        <AffiliatePage />
      </I18nProvider>
    );
    await waitFor(() => expect(render1.getByText('AFF001')).toBeInTheDocument());
    expect(render1.queryByText(/đơn chưa được tính hoa hồng/)).not.toBeInTheDocument();
    render1.unmount();

    // b) 2 đơn chờ, tổng 598.000đ → khung hiện, bấm "Xem 2 đơn" hiện email đã che, KHÔNG có email đầy đủ
    mockGetOverview.mockResolvedValueOnce({
      data: baseOverviewData({
        pendingApproval: {
          pendingRevenue: 598000,
          pendingBuyersCount: 2,
          events: [
            { id: 201, buyerEmail: 'khachhang1@gmail.com', buyerEmailMasked: 'kha***@gmail.com', amount: 299000, createdAt: '2026-09-10T00:00:00.000Z' },
            { id: 202, buyerEmail: 'khachhang2@gmail.com', buyerEmailMasked: 'kha***@gmail.com', amount: 299000, createdAt: '2026-09-11T00:00:00.000Z' },
          ],
        },
      }),
    });
    const render2 = render(
      <I18nProvider>
        <AffiliatePage />
      </I18nProvider>
    );
    await waitFor(() => expect(render2.getByText('AFF001')).toBeInTheDocument());
    expect(render2.getByText(/2 đơn chưa được tính hoa hồng/)).toBeInTheDocument();

    fireEvent.click(render2.getByRole('button', { name: /Xem 2 đơn/i }));
    expect(render2.getAllByText('kha***@gmail.com').length).toBe(2);
    expect(render2.queryByText('khachhang1@gmail.com')).not.toBeInTheDocument();
    expect(render2.queryByText('khachhang2@gmail.com')).not.toBeInTheDocument();
    expect(render2.container.innerHTML).not.toContain('khachhang1@gmail.com');
    expect(render2.container.innerHTML).not.toContain('khachhang2@gmail.com');
    render2.unmount();
  });

  it('5. Tab Rút tiền: số tài khoản ngân hàng chỉ hiện 4 số cuối, không lộ số đầy đủ', async () => {
    mockGetOverview.mockResolvedValueOnce({
      data: baseOverviewData({
        withdrawalHistory: [
          {
            id: 301,
            requested_at: '2026-09-05T02:00:00.000Z',
            amount_gross: 1000000,
            tax_amount: 100000,
            amount_net: 900000,
            bank_name: 'Vietcombank',
            bank_account_number: '0071000123456789',
            bank_account_name: 'NGUYEN VAN A',
            status: 'paid',
          },
        ],
      }),
    });

    const { getByText, getByRole, queryByText } = render(
      <I18nProvider>
        <AffiliatePage />
      </I18nProvider>
    );

    await waitFor(() => expect(getByText('AFF001')).toBeInTheDocument());
    fireEvent.click(getByRole('button', { name: /Lịch sử rút hoa hồng/i }));

    expect(getByText('••• 6789')).toBeInTheDocument();
    expect(queryByText('0071000123456789')).not.toBeInTheDocument();
  });

  it('6. Không phần tử nào có class chứa dark:', async () => {
    mockGetOverview.mockResolvedValueOnce({
      data: baseOverviewData({
        pendingApproval: {
          pendingRevenue: 598000,
          pendingBuyersCount: 2,
          events: [{ id: 201, buyerEmailMasked: 'kha***@gmail.com', amount: 299000, createdAt: '2026-09-10T00:00:00.000Z' }],
        },
      }),
    });

    const { container, getByText } = render(
      <I18nProvider>
        <AffiliatePage />
      </I18nProvider>
    );

    await waitFor(() => expect(getByText('AFF001')).toBeInTheDocument());

    const elementsWithDarkClass = Array.from(container.querySelectorAll('[class]')).filter((el) =>
      /\bdark:[a-zA-Z0-9[]/.test(el.className)
    );
    expect(elementsWithDarkClass).toHaveLength(0);
  });
});
