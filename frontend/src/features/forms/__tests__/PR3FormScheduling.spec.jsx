import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { I18nProvider } from '../../../i18n';
import FormSubmissionStatusPage from '../pages/FormSubmissionStatusPage';
import FormEditorPage from '../pages/FormEditorPage';
import * as formPublicApi from '../services/formPublicApi.service';
import * as formAdminApi from '../services/formAdminApi.service';

vi.mock('../services/formPublicApi.service', () => ({
  fetchPublicSubmissionStatus: vi.fn(),
  reportSubmissionPaid: vi.fn(),
}));

vi.mock('../services/formAdminApi.service', () => ({
  fetchFormById: vi.fn(),
  createForm: vi.fn(),
  updateForm: vi.fn(),
  publishForm: vi.fn(),
  uploadFormTempFile: vi.fn(),
  uploadFormAsset: vi.fn(),
}));

vi.mock('qrcode', () => ({
  default: {
    toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,fake-qr-data-url'),
  },
  toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,fake-qr-data-url'),
}));

vi.mock('../../../stores/authStore', () => ({
  useAuthStore: () => ({
    user: { id: 1, role: 'owner' },
  }),
}));

vi.mock('../../storage/useStorageQuota', () => ({
  default: () => ({ usage: { usageBytes: 0, limitBytes: 1000000 } }),
}));

function renderWithProviders(ui, { route = '/' } = {}) {
  return render(
    <I18nProvider initialLocale="vi">
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
    </I18nProvider>
  );
}

describe('PR-3: QR MoMo từ ảnh QR Đa Năng (Frontend)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('FormSubmissionStatusPage với MoMo QR', () => {
    it('1. Form MoMo CÓ qrString: hiển thị QR, câu hướng dẫn quét app ngân hàng, nút Lưu ảnh QR, và 4 dòng sao chép', async () => {
      formPublicApi.fetchPublicSubmissionStatus.mockResolvedValue({
        status: 'pending_payment',
        holdExpired: false,
        holdExpiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        payment: {
          method: 'momo',
          amount: 2000,
          code: 'MMTEST01',
          momoPhone: '0912345678',
          momoName: 'NGUYEN VAN A',
          qrString: '00020101021238540010A000000727012400069710250110PSP12345670208QRIBFTTA5303704540420005802VN62120808MMTEST016304E1E1',
          holdExpiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        },
      });

      renderWithProviders(
        <Routes>
          <Route path="/f/:publicKey/s/:accessToken" element={<FormSubmissionStatusPage />} />
        </Routes>,
        { route: '/f/test-form-key/s/test-access-token' }
      );

      await waitFor(() => {
        expect(screen.getByText('Mở app ngân hàng và quét mã QR để chuyển vào ví MoMo')).toBeInTheDocument();
      });

      // Kiểm tra có ảnh QR
      const qrImg = await screen.findByAltText(/Mã QR/i);
      expect(qrImg).toBeInTheDocument();

      // Kiểm tra nút Lưu ảnh QR
      const saveQrBtn = screen.getByTestId('btn-save-qr');
      expect(saveQrBtn).toBeInTheDocument();
      expect(saveQrBtn.getAttribute('download')).toBe('qr-MMTEST01.png');

      // Kiểm tra câu hướng dẫn người dùng app MoMo
      expect(screen.getByText(/Dùng app MoMo\? Chuyển tới số ví bên dưới và ghi đúng mã nội dung/i)).toBeInTheDocument();

      // Kiểm tra đủ 4 dòng sao chép
      expect(screen.getByText('0912345678')).toBeInTheDocument();
      expect(screen.getByText('NGUYEN VAN A')).toBeInTheDocument();
      expect(screen.getByText('MMTEST01')).toBeInTheDocument();
      expect(screen.getByText('2.000 đ')).toBeInTheDocument();
    });

    it('2. Form MoMo KHÔNG CÓ qrString (dữ liệu cũ): không hiện QR, không hiện nút Lưu ảnh QR, hiển thị như cũ', async () => {
      formPublicApi.fetchPublicSubmissionStatus.mockResolvedValue({
        status: 'pending_payment',
        holdExpired: false,
        holdExpiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        payment: {
          method: 'momo',
          amount: 50000,
          code: 'MOLD0001',
          momoPhone: '0988888888',
          momoName: 'TRAN VAN B',
          qrString: null,
          holdExpiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        },
      });

      renderWithProviders(
        <Routes>
          <Route path="/f/:publicKey/s/:accessToken" element={<FormSubmissionStatusPage />} />
        </Routes>,
        { route: '/f/test-form-key/s/test-access-token' }
      );

      await waitFor(() => {
        expect(screen.getByText(/Mở app MoMo → Chuyển tiền/i)).toBeInTheDocument();
      });

      // Không có câu quét app ngân hàng
      expect(screen.queryByText('Mở app ngân hàng và quét mã QR để chuyển vào ví MoMo')).not.toBeInTheDocument();

      // Không có nút Lưu ảnh QR
      expect(screen.queryByTestId('btn-save-qr')).not.toBeInTheDocument();

      // Vẫn có 4 thông tin sao chép
      expect(screen.getByText('0988888888')).toBeInTheDocument();
      expect(screen.getByText('TRAN VAN B')).toBeInTheDocument();
      expect(screen.getByText('MOLD0001')).toBeInTheDocument();
    });
  });

  describe('FormEditorPage cấu hình MoMo QR', () => {
    it('3. Khi form có sẵn momoQrAccount: hiển thị badge "Đã đọc mã QR ✓" và bấm "Gỡ" thì xoá cấu hình', async () => {
      formAdminApi.fetchFormById.mockResolvedValue({
        id: 10,
        title: 'Form MoMo Có QR',
        publicKey: 'pub_momo_qr',
        isPublished: true,
        fields: [{ id: 'f1', label: 'Tên', type: 'short_text', required: true }],
        paymentConfig: {
          enabled: true,
          method: 'momo',
          amount: 20000,
          momoPhone: '0901234567',
          momoName: 'CHU VÍ MOMO',
          momoQrBin: '971025',
          momoQrAccount: 'PSP2604014212340493',
          momoQrRefLabel: 'MOMOW2W6128717X',
          holdMinutes: 30,
        },
      });

      renderWithProviders(
        <Routes>
          <Route path="/app/forms/:id/edit" element={<FormEditorPage />} />
        </Routes>,
        { route: '/app/forms/10/edit' }
      );

      await waitFor(() => {
        expect(screen.getByText(/Đã đọc mã QR ✓ — TK \*\*\*\*0493/i)).toBeInTheDocument();
      });

      const removeBtn = screen.getByText('Gỡ');
      expect(removeBtn).toBeInTheDocument();

      // Bấm nút Gỡ
      fireEvent.click(removeBtn);

      // Sau khi gỡ: hiển thị lại nút "Tải ảnh QR Đa Năng MoMo"
      expect(screen.getByText('Tải ảnh QR Đa Năng MoMo (không bắt buộc)')).toBeInTheDocument();
      expect(screen.queryByText(/Đã đọc mã QR ✓/i)).not.toBeInTheDocument();
    });
  });
});
