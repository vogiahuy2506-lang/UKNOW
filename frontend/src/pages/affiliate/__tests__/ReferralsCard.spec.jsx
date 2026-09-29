import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../../i18n';
import ReferralsCard from '../ReferralsCard';

const { mockGetReferrals } = vi.hoisted(() => ({
  mockGetReferrals: vi.fn(),
}));

vi.mock('../../../services/affiliate.service', () => ({
  default: {
    getReferrals: mockGetReferrals,
  },
}));

describe('ReferralsCard — thẻ "Người đã dùng mã của bạn"', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Trống: hiện câu mời chia sẻ link + nút sao chép link', async () => {
    mockGetReferrals.mockResolvedValueOnce({ data: { items: [], total: 0, totalPages: 1 } });
    const onCopyLink = vi.fn();

    render(
      <I18nProvider>
        <ReferralsCard referralLink="https://founderai.biz/register?ref=AFF001" onCopyLink={onCopyLink} />
      </I18nProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(/Chưa có ai đăng ký bằng mã của bạn/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /affiliate\.copyLink|Sao chép link|Copy Link/i }));
    expect(onCopyLink).toHaveBeenCalledTimes(1);
  });

  it('Có dữ liệu: hiển thị đúng tên, email đã che, trạng thái Đã mua/Chưa mua, doanh thu; KHÔNG lộ email đầy đủ', async () => {
    mockGetReferrals.mockResolvedValueOnce({
      data: {
        items: [
          { name: 'Nguyễn Văn C', emailMasked: 'ngu***@gmail.com', referredAt: '2026-09-20T00:00:00.000Z', hasPurchased: true, attributedRevenue: 299000 },
          { name: 'Nguyễn Văn B', emailMasked: 'ngu***@gmail.com', referredAt: '2026-09-10T00:00:00.000Z', hasPurchased: false, attributedRevenue: 0 },
        ],
        total: 2,
        totalPages: 1,
      },
    });

    render(
      <I18nProvider>
        <ReferralsCard referralLink="https://founderai.biz/register?ref=AFF001" onCopyLink={vi.fn()} />
      </I18nProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Nguyễn Văn C')).toBeInTheDocument();
    });

    expect(screen.getByText('Nguyễn Văn B')).toBeInTheDocument();
    expect(screen.getAllByText('ngu***@gmail.com')).toHaveLength(2);
    expect(screen.getByText('Đã mua')).toBeInTheDocument();
    expect(screen.getByText('Chưa mua')).toBeInTheDocument();
    expect(screen.getByText('299.000 đ')).toBeInTheDocument();

    // Tiêu đề thẻ có đúng tổng số N
    expect(screen.getByText(/Người đã dùng mã của bạn \(2\)/)).toBeInTheDocument();

    // Không có pagination khi chỉ 1 trang
    expect(screen.queryByText('1 / 1')).not.toBeInTheDocument();
  });

  it('Chip "Chờ SĐT" chỉ hiện khi hasPurchased && awaitingPhone; kèm tooltip giải thích', async () => {
    mockGetReferrals.mockResolvedValueOnce({
      data: {
        items: [
          { name: 'Mua chờ SĐT', emailMasked: 'a***@gmail.com', referredAt: '2026-09-20T00:00:00.000Z', hasPurchased: true, awaitingPhone: true, attributedRevenue: 299000 },
          { name: 'Mua đủ SĐT', emailMasked: 'b***@gmail.com', referredAt: '2026-09-19T00:00:00.000Z', hasPurchased: true, awaitingPhone: false, attributedRevenue: 199000 },
          { name: 'Người chưa mua', emailMasked: 'c***@gmail.com', referredAt: '2026-09-18T00:00:00.000Z', hasPurchased: false, awaitingPhone: false, attributedRevenue: 0 },
          // Dữ liệu bất thường: awaitingPhone=true nhưng chưa mua → vẫn KHÔNG hiện chip "Chờ SĐT"
          { name: 'Chưa mua nhưng cờ bật', emailMasked: 'd***@gmail.com', referredAt: '2026-09-17T00:00:00.000Z', hasPurchased: false, awaitingPhone: true, attributedRevenue: 0 },
        ],
        total: 4,
        totalPages: 1,
      },
    });

    render(
      <I18nProvider>
        <ReferralsCard referralLink="" onCopyLink={vi.fn()} />
      </I18nProvider>
    );

    await waitFor(() => expect(screen.getByText('Mua chờ SĐT')).toBeInTheDocument());

    const chips = screen.getAllByText('Chờ SĐT');
    expect(chips).toHaveLength(1);
    expect(chips[0]).toHaveAttribute('title', expect.stringContaining('số điện thoại'));
    expect(screen.getAllByText('Đã mua')).toHaveLength(1);
    expect(screen.getAllByText('Chưa mua')).toHaveLength(2);
  });

  it('Phân trang: totalPages > 1 → hiện nút Trước/Tiếp theo, bấm Tiếp theo gọi lại API với page=2', async () => {
    mockGetReferrals.mockResolvedValueOnce({
      data: {
        items: [{ name: 'C', emailMasked: 'c***@gmail.com', referredAt: '2026-09-20T00:00:00.000Z', hasPurchased: false, attributedRevenue: 0 }],
        total: 2,
        totalPages: 2,
      },
    });

    render(
      <I18nProvider>
        <ReferralsCard referralLink="https://founderai.biz/register?ref=AFF001" onCopyLink={vi.fn()} />
      </I18nProvider>
    );

    await waitFor(() => expect(screen.getByText('1 / 2')).toBeInTheDocument());

    const prevBtn = screen.getByRole('button', { name: /Trước|Previous/i });
    expect(prevBtn).toBeDisabled();

    mockGetReferrals.mockResolvedValueOnce({
      data: {
        items: [{ name: 'B', emailMasked: 'b***@gmail.com', referredAt: '2026-09-10T00:00:00.000Z', hasPurchased: false, attributedRevenue: 0 }],
        total: 2,
        totalPages: 2,
      },
    });

    fireEvent.click(screen.getByRole('button', { name: /Sau|Tiếp theo|Next/i }));

    await waitFor(() => {
      expect(mockGetReferrals).toHaveBeenLastCalledWith({ page: 2, limit: 20 });
    });
  });

  it('Lỗi API: hiển thị thông báo lỗi, không crash', async () => {
    mockGetReferrals.mockRejectedValueOnce(new Error('Network down'));

    render(
      <I18nProvider>
        <ReferralsCard referralLink="" onCopyLink={vi.fn()} />
      </I18nProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Network down')).toBeInTheDocument();
    });
  });
});
