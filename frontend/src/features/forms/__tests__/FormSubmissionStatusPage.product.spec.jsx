import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { I18nProvider } from '../../../i18n';
import FormSubmissionStatusPage from '../pages/FormSubmissionStatusPage';
import { fetchPublicSubmissionStatus } from '../services/formPublicApi.service';

vi.mock('../services/formPublicApi.service', () => ({
  fetchPublicSubmissionStatus: vi.fn(),
}));

vi.mock('qrcode', () => ({
  __esModule: true,
  default: {
    toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,fake'),
  },
}));

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

/**
 * Plan 12/10/2026 — trang QR ghi "Bạn đang thanh toán cho: <tên sản phẩm>" kèm ảnh thu nhỏ khi API trả `product`
 * (biểu mẫu gắn sản phẩm đang bán, chủ chưa tắt thẻ sản phẩm).
 */
function renderStatusPage() {
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={['/f/pub_1/s/tok_1']}>
        <Routes>
          <Route path="/f/:publicKey/s/:accessToken" element={<FormSubmissionStatusPage />} />
        </Routes>
      </MemoryRouter>
    </I18nProvider>
  );
}

const pendingPayment = (extra = {}) => ({
  status: 'pending_payment',
  formTitle: 'Đặt mua khoá học',
  appointmentAt: null,
  holdExpired: false,
  holdExpiresAt: new Date(Date.now() + 125000).toISOString(),
  payment: {
    code: 'ABC123',
    amount: 150000,
    bankName: 'Vietcombank',
    accountNumber: '0123456789',
    accountName: 'NGUYEN VAN A',
    qrString: '00020101021238570010A00000072701270006970436011300123456789020208QRIBFTTA53037045802VN6304ABCD',
  },
  ...extra,
});

describe('FormSubmissionStatusPage — dòng sản phẩm đang thanh toán', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('có product: hiện ảnh thu nhỏ + "Bạn đang thanh toán cho: <tên>"', async () => {
    fetchPublicSubmissionStatus.mockResolvedValue(
      pendingPayment({ product: { name: 'Khoá AI thực chiến', imageUrl: 'https://cdn.example.com/khoa-ai.png' } })
    );
    renderStatusPage();

    const line = await screen.findByTestId('status-product-line');
    expect(line).toHaveTextContent('Bạn đang thanh toán cho: Khoá AI thực chiến');
    expect(line.querySelector('img')).toHaveAttribute('src', 'https://cdn.example.com/khoa-ai.png');
  });

  it('ảnh lỗi tải thì ẩn ảnh, dòng chữ vẫn còn', async () => {
    fetchPublicSubmissionStatus.mockResolvedValue(
      pendingPayment({ product: { name: 'Khoá AI thực chiến', imageUrl: 'https://cdn.example.com/khoa-ai.png' } })
    );
    renderStatusPage();

    const line = await screen.findByTestId('status-product-line');
    fireEvent.error(line.querySelector('img'));
    expect(line.querySelector('img').style.display).toBe('none');
    expect(within(line).getByText(/Bạn đang thanh toán cho/)).toBeInTheDocument();
  });

  it('product không có ảnh: chỉ có dòng chữ', async () => {
    fetchPublicSubmissionStatus.mockResolvedValue(pendingPayment({ product: { name: 'Khoá AI thực chiến', imageUrl: null } }));
    renderStatusPage();

    const line = await screen.findByTestId('status-product-line');
    expect(line.querySelector('img')).toBeNull();
    expect(line).toHaveTextContent('Khoá AI thực chiến');
  });

  it('product null hoặc vắng (bài cũ / form không gắn sản phẩm / đã tắt thẻ): không có dòng này', async () => {
    fetchPublicSubmissionStatus.mockResolvedValue(pendingPayment({ product: null }));
    renderStatusPage();

    await waitFor(() => expect(screen.getByAltText('Mã QR chuyển khoản')).toBeInTheDocument());
    expect(screen.queryByTestId('status-product-line')).toBeNull();
  });

  it('API cũ không có khoá product: trang vẫn hiện QR bình thường', async () => {
    fetchPublicSubmissionStatus.mockResolvedValue(pendingPayment());
    renderStatusPage();

    await waitFor(() => expect(screen.getByAltText('Mã QR chuyển khoản')).toBeInTheDocument());
    expect(screen.queryByTestId('status-product-line')).toBeNull();
  });
});
