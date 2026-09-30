import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Customers from '../Customers';
import campaignApiService from '../../../features/campaigns/services/campaignApi.service';
import viTranslations from '../../../i18n/vi';

/**
 * PR-10 (C-09) — `/app/customers` (chọn chiến dịch) mất phân trang: API cắt 20 chiến dịch/trang, trình
 * duyệt lọc bỏ nháp SAU ĐÓ rồi gán totalPages = 1 → chiến dịch thứ 21 trở đi không mở được.
 * Sửa: nhờ API loại nháp (excludeDraft) và dùng `pagination` của API.
 */
const getNestedTranslation = (obj, path) => path.split('.').reduce((acc, part) => acc?.[part], obj);
const mockT = (key, params) => {
  const val = getNestedTranslation(viTranslations, key);
  if (typeof val !== 'string') return key;
  if (!params) return val;
  return Object.entries(params).reduce((str, [k, v]) => str.replace(`{${k}}`, v), val);
};

vi.mock('../../../i18n', () => ({
  useI18n: () => ({ t: mockT }),
}));

vi.mock('../../../features/campaigns/services/campaignApi.service', () => ({
  default: { getCampaigns: vi.fn() },
}));

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

const makeItems = (from, count) =>
  Array.from({ length: count }, (_, i) => ({
    id: from + i,
    campaignName: `Chiến dịch ${from + i}`,
    campaignType: 'email',
    status: 'active',
    createdAt: '2026-09-10T10:00:00Z',
    totalSent: 3,
    createdBy: { name: 'Admin' },
  }));

const renderPage = () =>
  render(
    <MemoryRouter>
      <Customers />
    </MemoryRouter>
  );

describe('Customers (chọn chiến dịch) — phân trang theo API (C-09)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('xin API loại bản nháp (excludeDraft) thay vì lọc ở trình duyệt', async () => {
    campaignApiService.getCampaigns.mockResolvedValue({
      data: { data: { items: makeItems(1, 2), pagination: { page: 1, limit: 20, total: 2, totalPages: 1 } } },
    });
    renderPage();
    await screen.findByText('Chiến dịch 1');
    expect(campaignApiService.getCampaigns).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, limit: 20, excludeDraft: 1 })
    );
  });

  it('API báo 45 chiến dịch / 3 trang → hiện phân trang "1 / 3" và bấm sang trang 2 gọi API page=2', async () => {
    campaignApiService.getCampaigns.mockImplementation(async ({ page }) => ({
      data: {
        data: {
          items: page === 1 ? makeItems(1, 20) : makeItems(21, 20),
          pagination: { page, limit: 20, total: 45, totalPages: 3 },
        },
      },
    }));
    const { container } = renderPage();
    await screen.findByText('Chiến dịch 1');

    // Trước khi sửa: totalPages bị gán = ceil(20/20) = 1 → khối phân trang không bao giờ hiện.
    expect(screen.getByText('1 / 3')).toBeInTheDocument();
    expect(screen.getByText(/45/)).toBeInTheDocument();

    const nextButton = container.querySelectorAll('button.btn.btn-secondary.btn-sm')[1];
    fireEvent.click(nextButton);

    await waitFor(() => {
      expect(campaignApiService.getCampaigns).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 2, excludeDraft: 1 })
      );
    });
    expect(await screen.findByText('Chiến dịch 21')).toBeInTheDocument();
    expect(screen.getByText('2 / 3')).toBeInTheDocument();
  });

  it('1 trang duy nhất → không hiện khối phân trang', async () => {
    campaignApiService.getCampaigns.mockResolvedValue({
      data: { data: { items: makeItems(1, 3), pagination: { page: 1, limit: 20, total: 3, totalPages: 1 } } },
    });
    renderPage();
    await screen.findByText('Chiến dịch 1');
    expect(screen.queryByText(/ \/ \d+$/)).toBeNull();
  });
});
