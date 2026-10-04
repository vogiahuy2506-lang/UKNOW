import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
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
    createProduct: vi.fn(),
    updateProduct: vi.fn(),
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
    expect(screen.getByRole('columnheader', { name: /Để lại thông tin/ })).toBeInTheDocument();
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

  it('Đã trả đếm NGƯỜI: một người trả 2 đơn → tooltip "1 người · 2 đơn"; một đơn một người → không tooltip', async () => {
    productApiService.getFunnel.mockResolvedValue({
      data: { data: { filters: {}, rows: [{ productId: 11, registered: 1, paid: 1, paidOrders: 2, revenue: 4000, awaitingConfirm: 0, awaitingAmount: 0, formIds: [7] }] } },
    });
    renderPage();
    await waitFor(() => expect(screen.getByTestId('funnel-paid')).toHaveTextContent('1'));
    expect(screen.getByTestId('funnel-paid')).toHaveAttribute('title', '1 người · 2 đơn');

    productApiService.getFunnel.mockResolvedValue({
      data: { data: { filters: {}, rows: [{ productId: 11, registered: 1, paid: 2, paidOrders: 2, revenue: 4000, awaitingConfirm: 0, awaitingAmount: 0, formIds: [7] }] } },
    });
    renderPage();
    await waitFor(() => expect(screen.getAllByTestId('funnel-paid').some((n) => n.textContent === '2')).toBe(true));
    expect(screen.getAllByTestId('funnel-paid').find((n) => n.textContent === '2').getAttribute('title')).toBeNull();
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

  it('sự kiện không thu tiền: huy hiệu Sự kiện, giá trống hiện Miễn phí, Chờ xác nhận / Đã trả / Doanh thu hiện "—" (không phải 0)', async () => {
    productApiService.getProducts.mockResolvedValue({
      data: { data: { products: [{ id: 12, productName: 'Hội thảo AI', kind: 'event', price: '', status: 'active' }], pagination: { total: 1, totalPages: 1 } } },
    });
    productApiService.getFunnel.mockResolvedValue({
      data: {
        data: {
          filters: {},
          rows: [{ productId: 12, kind: 'event', registered: 3, leftContact: 2, interested: 5, paid: null, revenue: null, awaitingConfirm: null, awaitingAmount: null, formIds: [8] }],
        },
      },
    });
    renderPage();
    await waitFor(() => expect(screen.getByTestId('funnel-registered')).toHaveTextContent('3'));
    expect(screen.getByTestId('product-kind-badge')).toHaveTextContent('Sự kiện');
    expect(screen.getByText('Miễn phí')).toBeInTheDocument();
    expect(screen.getByTestId('funnel-awaiting')).toHaveTextContent('—');
    expect(screen.getByTestId('funnel-paid')).toHaveTextContent('—');
    expect(screen.getByTestId('funnel-revenue')).toHaveTextContent('—');
    // Sự kiện không "bán": trạng thái nói về đăng ký.
    expect(screen.getByText('Đang mở đăng ký')).toBeInTheDocument();
    expect(screen.queryByText('Đang bán')).toBeNull();
  });

  it('có cột phễu thì bỏ cột "Cập nhật lần cuối" để cột Hành động không bị đẩy ra ngoài màn hình', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId('funnel-registered')).toHaveTextContent('2'));
    expect(screen.queryByText('Cập nhật lần cuối')).toBeNull();
    expect(screen.getByText('Đang bán')).toBeInTheDocument();
    // Mã sản phẩm không còn là cột riêng — nằm ở dòng nhỏ dưới tên.
    expect(screen.queryByText('Mã sản phẩm')).toBeNull();
  });

  it('không có cột phễu (nhân viên không có reports_view) thì vẫn có cột "Cập nhật lần cuối"', async () => {
    mockAuthState = { activeContext: { type: 'employee', permissions: { courses: true } } };
    renderPage();
    await waitFor(() => expect(screen.getByText('Khoá AI thực chiến')).toBeInTheDocument());
    expect(screen.getByText('Cập nhật lần cuối')).toBeInTheDocument();
  });

  it('sản phẩm bán không có huy hiệu Sự kiện', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId('funnel-registered')).toHaveTextContent('2'));
    expect(screen.queryByTestId('product-kind-badge')).toBeNull();
  });

  it('modal thêm: có ô Loại (mặc định sản phẩm bán), chọn Sự kiện thì gửi kind=event và ô Giá có placeholder Miễn phí', async () => {
    productApiService.getCategories.mockResolvedValue({ data: { data: { categories: [] } } });
    productApiService.createProduct.mockResolvedValue({});
    renderPage();
    await waitFor(() => expect(screen.getByText('Khoá AI thực chiến')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Thêm sản phẩm/ }));
    const select = await screen.findByTestId('product-kind-select');
    expect(select.value).toBe('sale');
    fireEvent.change(select, { target: { value: 'event' } });
    expect(screen.getByPlaceholderText('Miễn phí')).toBeInTheDocument();
    const nameInput = document.querySelector('input[required]');
    fireEvent.change(nameInput, { target: { value: 'Buổi tư vấn' } });
    fireEvent.submit(nameInput.closest('form'));
    await waitFor(() => expect(productApiService.createProduct).toHaveBeenCalled());
    expect(productApiService.createProduct.mock.calls[0][0]).toMatchObject({ productName: 'Buổi tư vấn', kind: 'event' });
  });

  it('modal thêm: ô Giá bán (số) — gõ giá "1,5tr" thì gợi ý 1.500.000 đ, bấm Dùng số này điền vào ô, gửi priceAmount là số; giá không đọc được thì không gợi ý', async () => {
    productApiService.getCategories.mockResolvedValue({ data: { data: { categories: [] } } });
    productApiService.createProduct.mockResolvedValue({});
    renderPage();
    await waitFor(() => expect(screen.getByText('Khoá AI thực chiến')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Thêm sản phẩm/ }));
    const amountInput = await screen.findByTestId('product-price-amount');
    expect(screen.queryByTestId('product-price-amount-suggest')).toBeNull();

    fireEvent.change(screen.getByPlaceholderText('VD: 2.9tr/tháng'), { target: { value: '1,5tr' } });
    expect(screen.getByTestId('product-price-amount-suggest')).toHaveTextContent('1.500.000');
    fireEvent.click(screen.getByRole('button', { name: 'Dùng số này' }));
    expect(amountInput.value).toBe('1.500.000');
    expect(screen.queryByTestId('product-price-amount-suggest')).toBeNull();

    const nameInput = document.querySelector('input[required]');
    fireEvent.change(nameInput, { target: { value: 'Khoá A' } });
    fireEvent.submit(nameInput.closest('form'));
    await waitFor(() => expect(productApiService.createProduct).toHaveBeenCalledTimes(1));
    expect(productApiService.createProduct.mock.calls[0][0]).toMatchObject({ price: '1,5tr', priceAmount: 1500000 });
  });

  it('modal: giá "Liên hệ" và ô số trống → không gợi ý, gửi priceAmount null (server không đoán)', async () => {
    productApiService.getCategories.mockResolvedValue({ data: { data: { categories: [] } } });
    productApiService.createProduct.mockResolvedValue({});
    renderPage();
    await waitFor(() => expect(screen.getByText('Khoá AI thực chiến')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Thêm sản phẩm/ }));
    fireEvent.change(await screen.findByPlaceholderText('VD: 2.9tr/tháng'), { target: { value: 'Liên hệ' } });
    expect(screen.queryByTestId('product-price-amount-suggest')).toBeNull();
    const nameInput = document.querySelector('input[required]');
    fireEvent.change(nameInput, { target: { value: 'Khoá B' } });
    fireEvent.submit(nameInput.closest('form'));
    await waitFor(() => expect(productApiService.createProduct).toHaveBeenCalledTimes(1));
    expect(productApiService.createProduct.mock.calls[0][0].priceAmount).toBeNull();
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
