import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { I18nProvider } from '../../../i18n';
import FormEditorPage from '../pages/FormEditorPage';
import * as formAdminApi from '../services/formAdminApi.service';
import productApiService from '../../products/services/productApi.service';
import { openSettingsTab } from './formEditorTestUtils';

/**
 * Plan 12/10/2026 — biểu mẫu gắn sản phẩm hiện thẻ sản phẩm: công tắc "Hiện thẻ sản phẩm" (settings.showProductCard,
 * mặc định bật, chỉ gửi lên khi TẮT), xem trước dựng product theo quy tắc của API công khai, chọn sản phẩm điền sẵn
 * tiêu đề trống + đổi nút gửi mặc định thành "Đặt mua ngay" (không bao giờ đè chữ đã gõ).
 */

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

const baseForm = {
  id: 'form-1',
  title: 'Biểu mẫu bán khoá học',
  description: '',
  isPublished: false,
  productId: null,
  fields: [{ key: 'f1', label: 'Họ tên', type: 'short_text', required: true, role: 'name' }],
  settings: {},
};

const PRODUCTS = [
  {
    id: 11,
    productName: 'Khoá AI thực chiến',
    price: '2tr',
    priceAmount: 2000000,
    originalPrice: '3tr',
    status: 'active',
    description: 'Học AI từ con số 0',
    usp: 'Cầm tay chỉ việc',
    thumbnailUrl: 'https://cdn.example.com/khoa-ai.png',
    productUrl: 'https://example.com/noi-bo',
    productCode: 'SP-NOI-BO',
  },
  { id: 12, productName: 'Khoá ngừng bán', price: '1tr', priceAmount: 1000000, status: 'inactive', thumbnailUrl: null },
  { id: 13, productName: 'Khoá ảnh xấu', price: '1tr', priceAmount: 1000000, status: 'active', thumbnailUrl: 'javascript:alert(1)' },
];

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

const previewPane = () => screen.getByTestId('form-preview-pane');
const showCardSwitch = () => screen.getByTestId('form-product-show-card');

async function openProductTab() {
  openSettingsTab('product');
  await waitFor(() => expect(screen.getByRole('option', { name: 'Khoá AI thực chiến' })).toBeInTheDocument());
}

async function loadForm(overrides = {}) {
  formAdminApi.fetchFormById.mockResolvedValue({ ...baseForm, ...overrides });
  formAdminApi.updateForm.mockResolvedValue({ ...baseForm, ...overrides });
  renderEditor();
  await waitFor(() => expect(screen.getByLabelText('Tiêu đề biểu mẫu')).toBeInTheDocument());
  await waitFor(() => expect(productApiService.getProducts).toHaveBeenCalled());
}

async function saveAndGetPayload() {
  fireEvent.click(screen.getByRole('button', { name: /Lưu biểu mẫu/i }));
  await waitFor(() => expect(formAdminApi.updateForm).toHaveBeenCalledTimes(1));
  return formAdminApi.updateForm.mock.calls[0][1];
}

describe('FormEditorPage — thẻ sản phẩm trên biểu mẫu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockAuthState = { user: null, activeContext: { type: 'self' } };
    productApiService.getProducts.mockResolvedValue({ data: { data: { products: PRODUCTS } } });
  });

  describe('công tắc "Hiện thẻ sản phẩm"', () => {
    it('chưa gắn sản phẩm thì không có công tắc; chọn sản phẩm xong mới hiện, mặc định BẬT', async () => {
      await loadForm();
      await openProductTab();
      expect(screen.queryByTestId('form-product-show-card')).toBeNull();

      fireEvent.change(screen.getByTestId('form-product-select'), { target: { value: '11' } });
      expect(showCardSwitch()).toBeChecked();
      expect(screen.getByText('Hiện thẻ sản phẩm trên biểu mẫu')).toBeInTheDocument();
      expect(screen.getByText(/Tắt nếu landing page chứa biểu mẫu đã giới thiệu sản phẩm/)).toBeInTheDocument();
    });

    it('để mặc định (bật) rồi lưu → payload.settings KHÔNG có khoá showProductCard', async () => {
      await loadForm({ productId: 11 });
      const payload = await saveAndGetPayload();
      expect('showProductCard' in payload.settings).toBe(false);
    });

    it('tắt công tắc rồi lưu → payload.settings.showProductCard === false', async () => {
      await loadForm({ productId: 11 });
      await openProductTab();
      fireEvent.click(showCardSwitch());
      expect(showCardSwitch()).not.toBeChecked();

      const payload = await saveAndGetPayload();
      expect(payload.settings.showProductCard).toBe(false);
    });

    it('biểu mẫu đã lưu với showProductCard=false: nạp lên thấy công tắc TẮT, lưu lại vẫn giữ false', async () => {
      await loadForm({ productId: 11, settings: { showProductCard: false } });
      await openProductTab();
      expect(showCardSwitch()).not.toBeChecked();

      const payload = await saveAndGetPayload();
      expect(payload.settings.showProductCard).toBe(false);
    });

    it('tắt rồi bật lại → lưu không còn khoá (PUT ghi đè cả khối settings, vắng khoá = hiện)', async () => {
      await loadForm({ productId: 11, settings: { showProductCard: false } });
      await openProductTab();
      fireEvent.click(showCardSwitch());
      expect(showCardSwitch()).toBeChecked();

      const payload = await saveAndGetPayload();
      expect('showProductCard' in payload.settings).toBe(false);
    });
  });

  describe('xem trước', () => {
    it('gắn sản phẩm đang bán → xem trước có thẻ sản phẩm dựng từ trang Sản phẩm', async () => {
      await loadForm({ productId: 11 });
      await waitFor(() => expect(within(previewPane()).getByTestId('product-showcase')).toBeInTheDocument());

      const card = within(previewPane()).getByTestId('product-showcase');
      expect(within(card).getByTestId('product-showcase-name')).toHaveTextContent('Khoá AI thực chiến');
      expect(within(card).getByTestId('product-showcase-price')).toHaveTextContent('2tr');
      expect(within(card).getByTestId('product-showcase-original-price')).toHaveTextContent('3tr');
      expect(within(card).getByTestId('product-showcase-image')).toHaveAttribute('src', 'https://cdn.example.com/khoa-ai.png');
      // thẻ xem trước không mang dữ liệu nội bộ
      expect(card.outerHTML).not.toContain('noi-bo');
      expect(card.outerHTML).not.toContain('SP-NOI-BO');
    });

    it('chưa gắn sản phẩm → xem trước không có thẻ', async () => {
      await loadForm();
      expect(within(previewPane()).queryByTestId('product-showcase')).toBeNull();
    });

    it('tắt công tắc → xem trước mất thẻ; bật lại → thẻ trở lại', async () => {
      await loadForm({ productId: 11 });
      await waitFor(() => expect(within(previewPane()).getByTestId('product-showcase')).toBeInTheDocument());
      await openProductTab();

      fireEvent.click(showCardSwitch());
      expect(within(previewPane()).queryByTestId('product-showcase')).toBeNull();

      fireEvent.click(showCardSwitch());
      expect(within(previewPane()).getByTestId('product-showcase')).toBeInTheDocument();
    });

    it('sản phẩm ngừng bán → xem trước không có thẻ (đúng quy tắc API công khai)', async () => {
      await loadForm({ productId: 12 });
      await openProductTab(); // đợi danh sách sản phẩm nạp xong rồi mới khẳng định "không có thẻ"
      expect(screen.getByTestId('form-product-select').value).toBe('12');
      expect(within(previewPane()).queryByTestId('product-showcase')).toBeNull();
    });

    it('ảnh sản phẩm javascript: bị bỏ, thẻ vẫn hiện phần còn lại', async () => {
      await loadForm({ productId: 13 });
      await waitFor(() => expect(within(previewPane()).getByTestId('product-showcase')).toBeInTheDocument());
      expect(within(previewPane()).queryByTestId('product-showcase-image')).toBeNull();
    });

    it('thanh toán mục đích "đơn hàng": giá chính trong xem trước là số tiền đang khai ở khối Thanh toán', async () => {
      await loadForm({
        productId: 11,
        paymentConfig: {
          enabled: true,
          methods: ['bank'],
          method: 'bank',
          bankBin: '970436',
          accountNumber: '123456789',
          accountName: 'NGUYEN VAN A',
          holdMinutes: 30,
          amount: 1500000,
          purpose: 'order',
        },
      });
      await waitFor(() => expect(within(previewPane()).getByTestId('product-showcase')).toBeInTheDocument());
      expect(within(previewPane()).getByTestId('product-showcase-price')).toHaveTextContent('1.500.000 đ');
    });
  });

  describe('chọn sản phẩm: điền sẵn tiêu đề và nút gửi', () => {
    it('tiêu đề đang trống → điền tên sản phẩm; nút gửi còn mặc định → "Đặt mua ngay" (cả trong payload)', async () => {
      await loadForm({ title: '', settings: {} });
      expect(screen.getByLabelText('Tiêu đề biểu mẫu')).toHaveValue('');
      await openProductTab();

      fireEvent.change(screen.getByTestId('form-product-select'), { target: { value: '11' } });

      expect(screen.getByLabelText('Tiêu đề biểu mẫu')).toHaveValue('Khoá AI thực chiến');
      expect(within(previewPane()).getByRole('button', { name: 'Đặt mua ngay' })).toBeInTheDocument();
      const payload = await saveAndGetPayload();
      expect(payload.title).toBe('Khoá AI thực chiến');
      expect(payload.settings.submitButtonText).toBe('Đặt mua ngay');
    });

    it('chữ nút gửi mặc định server lưu ("Gửi thông tin") cũng được coi là chưa tự đặt → đổi', async () => {
      await loadForm({ settings: { submitButtonText: 'Gửi thông tin' } });
      await openProductTab();

      fireEvent.change(screen.getByTestId('form-product-select'), { target: { value: '11' } });

      const payload = await saveAndGetPayload();
      expect(payload.settings.submitButtonText).toBe('Đặt mua ngay');
    });

    it('đã có tiêu đề riêng + chữ nút riêng → KHÔNG đè', async () => {
      await loadForm({ title: 'Đăng ký học thử', settings: { submitButtonText: 'Giữ chỗ ngay' } });
      await openProductTab();

      fireEvent.change(screen.getByTestId('form-product-select'), { target: { value: '11' } });

      expect(screen.getByLabelText('Tiêu đề biểu mẫu')).toHaveValue('Đăng ký học thử');
      const payload = await saveAndGetPayload();
      expect(payload.title).toBe('Đăng ký học thử');
      expect(payload.settings.submitButtonText).toBe('Giữ chỗ ngay');
    });

    it('chọn "Không gắn sản phẩm" không đổi tiêu đề / chữ nút', async () => {
      await loadForm({ productId: 11, title: 'Đăng ký học thử', settings: { submitButtonText: 'Giữ chỗ ngay' } });
      await openProductTab();

      fireEvent.change(screen.getByTestId('form-product-select'), { target: { value: '' } });

      expect(screen.getByLabelText('Tiêu đề biểu mẫu')).toHaveValue('Đăng ký học thử');
      const payload = await saveAndGetPayload();
      expect(payload.settings.submitButtonText).toBe('Giữ chỗ ngay');
      expect(payload.productId).toBeNull();
    });
  });
});
