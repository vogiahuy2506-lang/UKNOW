import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import MarketplaceContent from '../MarketplaceContent';

/**
 * Trang Marketplace bán 3 loại (chiến dịch, chatbot, landing page) nhưng thanh lọc "Loại" từng thiếu nút Landing page — người dùng không
 * lọc riêng được landing. Nút phải có, và bấm vào phải gọi browse với `resource_type=landing_page` (backend đọc tham số này).
 */
const browse = vi.hoisted(() => vi.fn());
const getMyListings = vi.hoisted(() => vi.fn());
const getCategories = vi.hoisted(() => vi.fn());

vi.mock('../../../services/marketplace.service', () => ({
  default: { browse, getMyListings, getCategories },
}));
vi.mock('../../../i18n', async () => (await import('../../../test/realI18n.js')).realI18nModule());
vi.mock('react-hot-toast', () => ({ default: { error: vi.fn(), success: vi.fn() } }));
vi.mock('../../../components/marketplace/ListingCard', () => ({
  default: ({ listing }) => <div data-testid="listing-card">{listing.title}</div>,
}));

const landingRow = { id: 7, title: 'Landing ban hang', resource_type: 'landing_page' };

beforeEach(() => {
  vi.clearAllMocks();
  browse.mockResolvedValue({ data: { data: [], pagination: { page: 1, total: 0, totalPages: 1 } } });
  getMyListings.mockResolvedValue({ data: { data: [], pagination: { page: 1, total: 0, totalPages: 1 } } });
  getCategories.mockResolvedValue({ data: { data: [] } });
});

const typeParamsOfBrowseCalls = () => browse.mock.calls.map(([params]) => params?.resource_type).filter((value) => value !== undefined);

describe('MarketplaceContent — bộ lọc loại', () => {
  it('có đủ 4 nút: Tất cả, Chiến dịch, Chatbot, Landing page', async () => {
    render(<MarketplaceContent />);
    for (const label of ['Tất cả', 'Chiến dịch', 'Chatbot', 'Landing page']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy();
    }
    await waitFor(() => expect(browse).toHaveBeenCalled());
  });

  it('bấm "Landing page" → gọi browse với resource_type=landing_page và hiện đúng listing landing trả về', async () => {
    render(<MarketplaceContent />);
    await waitFor(() => expect(browse).toHaveBeenCalledWith(expect.objectContaining({ page: 1, limit: 12 })));
    expect(typeParamsOfBrowseCalls()).toEqual([]); // lúc đầu chưa lọc loại

    browse.mockResolvedValue({ data: { data: [landingRow], pagination: { page: 1, total: 1, totalPages: 1 } } });
    fireEvent.click(screen.getByRole('button', { name: 'Landing page' }));

    await waitFor(() => expect(typeParamsOfBrowseCalls()).toContain('landing_page'), { timeout: 3000 });
    expect(await screen.findByText('Landing ban hang')).toBeTruthy();
  });

  it('bấm lại "Tất cả" thì bỏ tham số loại', async () => {
    render(<MarketplaceContent />);
    fireEvent.click(screen.getByRole('button', { name: 'Landing page' }));
    await waitFor(() => expect(typeParamsOfBrowseCalls()).toContain('landing_page'), { timeout: 3000 });

    browse.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Tất cả' }));
    await waitFor(() => expect(browse).toHaveBeenCalledWith(expect.objectContaining({ page: 1, limit: 12 })), { timeout: 3000 });
    expect(typeParamsOfBrowseCalls()).toEqual([]);
  });
});
