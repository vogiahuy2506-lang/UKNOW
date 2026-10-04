import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { I18nProvider } from '../../../i18n';
import Products from '../Products';
import productApiService from '../../../features/products/services/productApi.service';

vi.mock('../../../features/products/services/productApi.service', () => ({
  default: {
    getProducts: vi.fn(),
    getFunnel: vi.fn(),
    getCategories: vi.fn(),
  },
}));
vi.mock('../../../features/storage/useStorageQuota', () => ({ default: () => ({ usage: null }) }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

let mockAuthState = { activeContext: { type: 'self' } };
vi.mock('../../../stores/authStore', () => ({
  useAuthStore: (selector) => selector(mockAuthState),
}));

const renderPage = () =>
  render(
    <MemoryRouter>
      <I18nProvider>
        <Products />
      </I18nProvider>
    </MemoryRouter>
  );

describe('Products — cột phễu Đăng ký / Đã trả / Doanh thu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthState = { activeContext: { type: 'self' } };
    productApiService.getProducts.mockResolvedValue({
      data: {
        data: {
          products: [{ id: 11, productName: 'Khoá AI thực chiến', price: '500k', status: 'active' }],
          pagination: { total: 1, totalPages: 1 },
        },
      },
    });
    productApiService.getFunnel.mockResolvedValue({
      data: {
        data: {
          filters: {},
          rows: [
            {
              productId: 11,
              submitted: 3,
              registered: 2,
              paid: 1,
              revenue: 2000,
              awaitingConfirm: 2,
              awaitingAmount: 4000,
              formIds: [7],
              landingViews: 5,
              leads: 2,
              campaignClicks: 4,
              interested: 9,
              leftContact: 5,
            },
          ],
        },
      },
    });
  });

  it('chủ tài khoản: gọi API phễu (mặc định 30d) và hiện 3 cột với số đúng', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Khoá AI thực chiến')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByTestId('funnel-registered')).toHaveTextContent('2'));

    expect(productApiService.getFunnel).toHaveBeenCalledWith({ period: '30d' });
    expect(screen.getByTestId('funnel-interested')).toHaveTextContent('9');
    expect(screen.getByTestId('funnel-left-contact')).toHaveTextContent('5');
    expect(screen.getByRole('columnheader', { name: 'Quan tâm' })).toHaveAttribute(
      'title',
      expect.stringContaining('Telegram/WhatsApp')
    );
    expect(screen.getByRole('columnheader', { name: 'Để lại thông tin' })).toBeInTheDocument();
    expect(screen.getByTestId('funnel-paid')).toHaveTextContent('1');
    expect(screen.getByTestId('funnel-revenue').textContent.replace(/\s/g, '')).toMatch(/^2\.000đ$/);
    // Một biểu mẫu → số Đăng ký dẫn sang trang bài nộp của biểu mẫu đó
    expect(within(screen.getByTestId('funnel-registered')).getByRole('link')).toHaveAttribute(
      'href',
      '/app/forms/7/submissions'
    );
  });

  it('cột Chờ xác nhận đứng trước Đã trả: > 0 tô cảnh báo, tooltip có số tiền, bấm số dẫn sang bài nộp', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId('funnel-awaiting')).toHaveTextContent('2'));
    const cell = screen.getByTestId('funnel-awaiting');
    expect(cell.className).toContain('text-amber-600');
    expect(cell.getAttribute('title').replace(/\s/g, '')).toContain('4.000đ');
    expect(cell.getAttribute('title')).toContain('Đã nhận tiền');
    expect(within(cell).getByRole('link')).toHaveAttribute('href', '/app/forms/7/submissions');
    expect(screen.getByRole('columnheader', { name: 'Chờ xác nhận' })).toBeInTheDocument();
    expect(cell.nextElementSibling).toBe(screen.getByTestId('funnel-paid'));
  });

  it('Chờ xác nhận = 0: không tô cảnh báo, không tooltip, không liên kết', async () => {
    productApiService.getFunnel.mockResolvedValue({
      data: { data: { filters: {}, rows: [{ productId: 11, registered: 1, paid: 0, revenue: 0, awaitingConfirm: 0, awaitingAmount: 0, formIds: [7] }] } },
    });
    renderPage();
    await waitFor(() => expect(screen.getByTestId('funnel-registered')).toHaveTextContent('1'));
    const cell = screen.getByTestId('funnel-awaiting');
    expect(cell).toHaveTextContent('0');
    expect(cell.className).not.toContain('text-amber-600');
    expect(cell.getAttribute('title')).toBeNull();
    expect(within(cell).queryByRole('link')).toBeNull();
  });

  it('nhân viên không có reports_view: không gọi API phễu, không có cột', async () => {
    mockAuthState = { activeContext: { type: 'employee', permissions: { courses: true } } };
    renderPage();
    await waitFor(() => expect(screen.getByText('Khoá AI thực chiến')).toBeInTheDocument());

    expect(productApiService.getFunnel).not.toHaveBeenCalled();
    expect(screen.queryByTestId('funnel-registered')).toBeNull();
    expect(screen.queryByTestId('funnel-interested')).toBeNull();
    expect(screen.queryByTestId('funnel-left-contact')).toBeNull();
    expect(screen.queryByTestId('products-funnel-period')).toBeNull();
  });

  it('nhân viên có reports_view: thấy cột', async () => {
    mockAuthState = { activeContext: { type: 'employee', permissions: { courses: true, reports_view: true } } };
    renderPage();
    await waitFor(() => expect(screen.getByTestId('funnel-registered')).toBeInTheDocument());
    expect(productApiService.getFunnel).toHaveBeenCalledTimes(1);
  });
});
