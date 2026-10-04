import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { I18nProvider } from '../../../i18n';
import FormEditorPage from '../pages/FormEditorPage';
import * as formAdminApi from '../services/formAdminApi.service';
import productApiService from '../../products/services/productApi.service';

vi.mock('../services/formAdminApi.service', () => ({
  fetchFormById: vi.fn(),
  createForm: vi.fn(),
  updateForm: vi.fn(),
  publishForm: vi.fn(),
  uploadFormTempFile: vi.fn(),
  uploadFormAsset: vi.fn(),
}));

vi.mock('../../products/services/productApi.service', () => ({
  default: { getProducts: vi.fn() },
}));

vi.mock('../../storage/useStorageQuota', () => ({ default: () => ({ usage: null }) }));
vi.mock('../../storage/storageEvents', () => ({ notifyStorageQuotaRefresh: vi.fn() }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

let mockAuthState = { user: null, activeContext: { type: 'self' } };
vi.mock('../../../stores/authStore', () => ({
  useAuthStore: (selector) => selector(mockAuthState),
}));

const existingForm = {
  id: 'form-1',
  title: 'Biểu mẫu bán khoá học',
  description: '',
  isPublished: false,
  productId: null,
  fields: [{ key: 'f1', label: 'Họ tên', type: 'short_text', required: true, role: 'name' }],
  settings: {},
};

const PRODUCTS = [
  { id: 11, productName: 'Khoá AI thực chiến', price: '500k', priceAmount: 500000 },
  { id: 12, productName: 'Khoá Marketing', price: '1tr', priceAmount: null },
];

const PAID_CONFIG = {
  enabled: true,
  methods: ['bank'],
  method: 'bank',
  bankBin: '970436',
  accountNumber: '123456789',
  accountName: 'NGUYEN VAN A',
  holdMinutes: 30,
};

const renderEditor = () =>
  render(
    <MemoryRouter initialEntries={['/app/forms/form-1/edit']}>
      <I18nProvider>
        <Routes>
          <Route path="/app/forms/:id/edit" element={<FormEditorPage />} />
        </Routes>
      </I18nProvider>
    </MemoryRouter>
  );

describe('FormEditorPage — ô chọn sản phẩm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockAuthState = { user: null, activeContext: { type: 'self' } };
    productApiService.getProducts.mockResolvedValue({ data: { data: { products: PRODUCTS } } });
  });

  it('chọn sản phẩm rồi lưu → payload gửi productId là số', async () => {
    formAdminApi.fetchFormById.mockResolvedValue(existingForm);
    formAdminApi.updateForm.mockResolvedValue(existingForm);
    renderEditor();

    await waitFor(() => expect(screen.getByDisplayValue('Biểu mẫu bán khoá học')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole('option', { name: 'Khoá AI thực chiến' })).toBeInTheDocument());

    fireEvent.change(screen.getByTestId('form-product-select'), { target: { value: '11' } });
    fireEvent.click(screen.getByRole('button', { name: /Lưu biểu mẫu/i }));

    await waitFor(() => expect(formAdminApi.updateForm).toHaveBeenCalledTimes(1));
    expect(formAdminApi.updateForm.mock.calls[0][1].productId).toBe(11);
    expect(productApiService.getProducts).toHaveBeenCalledWith(expect.objectContaining({ status: 'active' }));
  });

  it('biểu mẫu chưa từng gắn sản phẩm và không chọn → payload KHÔNG có khoá productId', async () => {
    formAdminApi.fetchFormById.mockResolvedValue(existingForm);
    formAdminApi.updateForm.mockResolvedValue(existingForm);
    renderEditor();

    await waitFor(() => expect(screen.getByDisplayValue('Biểu mẫu bán khoá học')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Lưu biểu mẫu/i }));

    await waitFor(() => expect(formAdminApi.updateForm).toHaveBeenCalledTimes(1));
    expect('productId' in formAdminApi.updateForm.mock.calls[0][1]).toBe(false);
  });

  it('đang gắn sản phẩm → chọn "Không gắn" rồi lưu → gửi productId null', async () => {
    formAdminApi.fetchFormById.mockResolvedValue({ ...existingForm, productId: 12 });
    formAdminApi.updateForm.mockResolvedValue(existingForm);
    renderEditor();

    await waitFor(() => expect(screen.getByTestId('form-product-select').value).toBe('12'));
    fireEvent.change(screen.getByTestId('form-product-select'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /Lưu biểu mẫu/i }));

    await waitFor(() => expect(formAdminApi.updateForm).toHaveBeenCalledTimes(1));
    expect(formAdminApi.updateForm.mock.calls[0][1].productId).toBeNull();
  });

  it('không tải được danh sách sản phẩm (403) → vẫn giữ productId đang gắn khi lưu', async () => {
    productApiService.getProducts.mockRejectedValue(new Error('403'));
    formAdminApi.fetchFormById.mockResolvedValue({ ...existingForm, productId: 12 });
    formAdminApi.updateForm.mockResolvedValue(existingForm);
    renderEditor();

    await waitFor(() => expect(screen.getByTestId('form-product-select').value).toBe('12'));
    fireEvent.click(screen.getByRole('button', { name: /Lưu biểu mẫu/i }));

    await waitFor(() => expect(formAdminApi.updateForm).toHaveBeenCalledTimes(1));
    expect(formAdminApi.updateForm.mock.calls[0][1].productId).toBe(12);
  });

  it('chọn sản phẩm có priceAmount khi thanh toán bật mà ô số tiền trống → tự điền 500.000; sản phẩm không có số thì không điền', async () => {
    formAdminApi.fetchFormById.mockResolvedValue({ ...existingForm, paymentConfig: PAID_CONFIG });
    renderEditor();
    await waitFor(() => expect(screen.getByRole('option', { name: 'Khoá AI thực chiến' })).toBeInTheDocument());

    fireEvent.change(screen.getByTestId('form-product-select'), { target: { value: '12' } });
    expect(screen.queryByDisplayValue('500.000')).toBeNull();

    fireEvent.change(screen.getByTestId('form-product-select'), { target: { value: '11' } });
    expect(screen.getByDisplayValue('500.000')).toBeInTheDocument();
    expect(screen.getByTestId('form-product-price-hint')).toHaveTextContent('500.000 đ');
    // đã khớp giá sản phẩm → không có nút "Dùng giá sản phẩm"
    expect(screen.queryByTestId('form-product-use-price')).toBeNull();
  });

  it('ô số tiền đã có số khác → KHÔNG đè; hiện nút "Dùng giá sản phẩm (500.000 đ)", bấm thì đổi', async () => {
    formAdminApi.fetchFormById.mockResolvedValue({ ...existingForm, paymentConfig: { ...PAID_CONFIG, amount: 300000 } });
    renderEditor();
    await waitFor(() => expect(screen.getByRole('option', { name: 'Khoá AI thực chiến' })).toBeInTheDocument());

    fireEvent.change(screen.getByTestId('form-product-select'), { target: { value: '11' } });
    expect(screen.getByDisplayValue('300.000')).toBeInTheDocument();
    const useBtn = screen.getByTestId('form-product-use-price');
    expect(useBtn).toHaveTextContent('Dùng giá sản phẩm (500.000 đ)');
    fireEvent.click(useBtn);
    expect(screen.getByDisplayValue('500.000')).toBeInTheDocument();
    expect(screen.queryByTestId('form-product-use-price')).toBeNull();
  });
});
