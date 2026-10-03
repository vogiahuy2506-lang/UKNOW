/**
 * Danh sách landing page: nhãn "Sub" / "Apex" (và màu tím) chỉ dành cho tên miền RIÊNG của khách.
 *
 * Gốc lỗi (03/10/2026): API quản trị trả `customDomainHostname` cho CẢ trang dùng link miễn phí (`<slug>.founderai.biz`, cùng
 * bảng landing_page_domains), mà trang đọc `Boolean(r.customDomainHostname)` → 60/60 trang miễn phí ở production mang nhãn
 * "Sub" như tên miền riêng. PR-0 chỉ sửa modal Cài đặt; danh sách dùng lại đúng `getCustomHostname` (landingDomain.js).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import LandingPagesAdminPage from '../LandingPagesAdminPage';
import {
  fetchLandingPagesAdminList,
  fetchLandingPagesDashboardStats,
} from '../../../features/landing-pages/services/landingPagesAdminApi.service.js';
import marketplaceService from '../../../services/marketplace.service';
import viTranslations from '../../../i18n/vi';

vi.mock('../../../features/landing-pages/services/landingPagesAdminApi.service.js', () => ({
  fetchLandingPagesAdminList: vi.fn(),
  fetchLandingPagesDashboardStats: vi.fn(),
  deleteLandingPageAdmin: vi.fn(),
}));
vi.mock('../../../services/marketplace.service', () => ({
  default: { getMyPurchases: vi.fn(), getLandingPagesSharedWithMe: vi.fn() },
}));
vi.mock('../../../components/marketplace/LandingPageShareModal', () => ({ default: () => null }));
vi.mock('../../../components/marketplace/LandingPageMarketplaceModal', () => ({ default: () => null }));

const mockT = (key, params) => {
  const raw = key.split('.').reduce((acc, part) => acc?.[part], viTranslations) ?? key;
  return typeof raw === 'string' && params
    ? raw.replace(/\{(\w+)\}/g, (_, name) => String(params[name] ?? ''))
    : raw;
};
vi.mock('../../../i18n', () => ({ useI18n: () => ({ t: mockT, locale: 'vi' }) }));

const baseRow = {
  isPublished: true,
  updatedAt: '2026-10-03T09:00:00Z',
  customDomainIsApex: false,
};

const FREE_PAGE = {
  ...baseRow, id: 1, slug: 'khoa-hoc-marketing', title: 'Trang miễn phí',
  domainType: 'system', customDomainHostname: 'khoa-hoc-marketing.founderai.biz',
};
const SUB_PAGE = {
  ...baseRow, id: 2, slug: 'dich-vu', title: 'Trang tên miền phụ',
  domainType: 'custom', customDomainHostname: 'lp.tenmien.com',
};
const APEX_PAGE = {
  ...baseRow, id: 3, slug: 'su-kien', title: 'Trang tên miền chính',
  domainType: 'custom', customDomainHostname: 'tenmien.com', customDomainIsApex: true,
};

const renderPage = () => render(
  <MemoryRouter>
    <LandingPagesAdminPage />
  </MemoryRouter>,
);

const rowOf = async (title) => (await screen.findByText(title)).closest('tr');

describe('LandingPagesAdminPage — nhãn tên miền riêng', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchLandingPagesAdminList.mockResolvedValue([FREE_PAGE, SUB_PAGE, APEX_PAGE]);
    fetchLandingPagesDashboardStats.mockResolvedValue({ filters: {}, rows: [] });
    marketplaceService.getMyPurchases.mockResolvedValue({ data: { data: [] } });
    marketplaceService.getLandingPagesSharedWithMe.mockResolvedValue({ data: { data: { items: [] } } });
  });

  it('trang dùng tên miền miễn phí <slug>.founderai.biz KHÔNG có nhãn Sub/Apex, vẫn hiện đúng link', async () => {
    renderPage();
    const row = await rowOf('Trang miễn phí');

    expect(within(row).getByText('khoa-hoc-marketing.founderai.biz')).toBeInTheDocument();
    expect(within(row).queryByText('Sub')).toBeNull();
    expect(within(row).queryByText('Apex')).toBeNull();
    // Chip tên miền không mang màu tím của tên miền riêng.
    expect(within(row).getByText('khoa-hoc-marketing.founderai.biz').className).not.toContain('purple');
    expect(within(row).getByTitle('Mở trong tab mới')).toHaveAttribute('href', 'https://khoa-hoc-marketing.founderai.biz');
  });

  it('hostname của khách vẫn có nhãn: tên miền phụ → Sub, tên miền chính → Apex', async () => {
    renderPage();
    const subRow = await rowOf('Trang tên miền phụ');
    expect(within(subRow).getByText('lp.tenmien.com')).toBeInTheDocument();
    expect(within(subRow).getByText('Sub')).toBeInTheDocument();
    expect(within(subRow).getByText('lp.tenmien.com').className).toContain('purple');
    expect(within(subRow).getByTitle('Mở trong tab mới')).toHaveAttribute('href', 'https://lp.tenmien.com');

    const apexRow = await rowOf('Trang tên miền chính');
    expect(within(apexRow).getByText('tenmien.com')).toBeInTheDocument();
    expect(within(apexRow).getByText('Apex')).toBeInTheDocument();
  });

  it('tab Được chia sẻ: hostname hệ thống hiện đúng link miễn phí, hostname khách hiện nguyên tên miền riêng', async () => {
    marketplaceService.getLandingPagesSharedWithMe.mockResolvedValue({
      data: {
        data: {
          items: [
            { id: 10, slug: 'trang-a', title: 'Chia sẻ A', isPublished: true, customDomainHostname: 'trang-a.founderai.biz', sharedBy: { email: 'a@x.vn' } },
            { id: 11, slug: 'trang-b', title: 'Chia sẻ B', isPublished: true, customDomainHostname: 'khach.tenmien.com', sharedBy: { email: 'b@x.vn' } },
          ],
        },
      },
    });
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: viTranslations.landingPagesAdmin.tabShared }));

    const rowA = await rowOf('Chia sẻ A');
    expect(within(rowA).getByText('trang-a.founderai.biz')).toBeInTheDocument();
    const rowB = await rowOf('Chia sẻ B');
    expect(within(rowB).getByText('khach.tenmien.com')).toBeInTheDocument();
  });
});
