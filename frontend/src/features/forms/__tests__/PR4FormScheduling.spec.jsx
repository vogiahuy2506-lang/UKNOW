import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import QRCode from 'qrcode';
import FormEditorPage from '../pages/FormEditorPage';
import FormSubmissionStatusPage from '../pages/FormSubmissionStatusPage';
import * as formAdminApi from '../services/formAdminApi.service';
import * as formPublicApi from '../services/formPublicApi.service';
import { I18nProvider } from '../../../i18n';
import * as vietqrParser from '../../../utils/vietqrParser';

vi.mock('../services/formAdminApi.service', () => ({
  fetchFormById: vi.fn(),
  createForm: vi.fn(),
  updateForm: vi.fn(),
  publishForm: vi.fn(),
  uploadFormTempFile: vi.fn(),
  uploadFormAsset: vi.fn(),
}));

vi.mock('../services/formPublicApi.service', () => ({
  fetchPublicSubmissionStatus: vi.fn(),
  reportPaymentSent: vi.fn(),
}));

vi.mock('../../../stores/authStore', () => ({
  useAuthStore: () => ({ user: { id: 1, role: 'owner' } }),
}));

vi.mock('../../../hooks/useStorageQuota', () => ({
  useStorageQuota: () => ({ usage: { usedBytes: 0, maxBytes: 100000000 } }),
}));

vi.mock('qrcode', () => ({
  default: {
    toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,mockQrDataUrl'),
  },
}));

function renderWithProviders(ui, { route = '/' } = {}) {
  return render(
    <I18nProvider initialLocale="vi">
      <MemoryRouter initialEntries={[route]}>
        {ui}
      </MemoryRouter>
    </I18nProvider>
  );
}

describe('PR-4: QR MoMo tạo từ thông tin chủ form nhập (Frontend)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    QRCode.toDataURL.mockResolvedValue('data:image/png;base64,mockQrDataUrl');
  });

  describe('FormEditorPage — Cấu hình QR MoMo PR-4', () => {
    it('1. Form PR-3 cũ có momoQrBin+Account nhưng không có momoQrMode -> nạp lại nhận diện mode account', async () => {
      formAdminApi.fetchFormById.mockResolvedValue({
        id: 101,
        title: 'Form MoMo Cũ',
        publicKey: 'pub_momo_old',
        isPublished: true,
        fields: [{ id: 'f1', label: 'Họ tên', type: 'short_text', required: true, role: 'name' }],
        paymentConfig: {
          enabled: true,
          method: 'momo',
          amount: 50000,
          momoPhone: '0901234567',
          momoName: 'NGUYEN VAN A',
          momoQrBin: '971025',
          momoQrAccount: 'PSP2604014200000493',
          holdMinutes: 30,
        },
      });

      renderWithProviders(
        <Routes>
          <Route path="/app/forms/:id/edit" element={<FormEditorPage />} />
        </Routes>,
        { route: '/app/forms/101/edit' }
      );

      await waitFor(() => {
        const accountRadio = screen.getByLabelText(/Nhập số tài khoản MoMo/i);
        expect(accountRadio).toBeChecked();
      });

      const accountInput = screen.getByDisplayValue('PSP2604014200000493');
      expect(accountInput).toBeInTheDocument();
    });

    it('2. Chốt 1: Khi đủ dữ liệu MoMo (amount, momoName, momoQrAccount), hiển thị mã QR xem thử và câu hướng dẫn', async () => {
      formAdminApi.fetchFormById.mockResolvedValue({
        id: 102,
        title: 'Form MoMo Preview Test',
        publicKey: 'pub_momo_preview',
        isPublished: true,
        fields: [{ id: 'f1', label: 'Họ tên', type: 'short_text', required: true, role: 'name' }],
        paymentConfig: {
          enabled: true,
          method: 'momo',
          amount: 2000,
          momoPhone: '0901234567',
          momoName: 'NGUYEN VAN A',
          momoQrMode: 'account',
          momoQrAccount: 'PSP2604014200000493',
          holdMinutes: 30,
        },
      });

      renderWithProviders(
        <Routes>
          <Route path="/app/forms/:id/edit" element={<FormEditorPage />} />
        </Routes>,
        { route: '/app/forms/102/edit' }
      );

      await waitFor(() => {
        expect(screen.getByTestId('momo-preview-qr')).toBeInTheDocument();
        expect(screen.getByText(/Quét bằng app ngân hàng: thấy đúng tên NGUYEN VAN A là QR đúng\. KHÔNG cần chuyển\./i)).toBeInTheDocument();
      });
    });

    it('3. Chốt 3: Ô STK chuẩn hoá ký tự (bỏ ký tự lạ, tự động viết hoa)', async () => {
      formAdminApi.fetchFormById.mockResolvedValue({
        id: 103,
        title: 'Form Test Input STK',
        publicKey: 'pub_momo_input',
        isPublished: true,
        fields: [{ id: 'f1', label: 'Họ tên', type: 'short_text', required: true, role: 'name' }],
        paymentConfig: {
          enabled: true,
          method: 'momo',
          amount: 50000,
          momoPhone: '0901234567',
          momoName: 'NGUYEN VAN A',
          momoQrMode: 'account',
          momoQrAccount: '',
          holdMinutes: 30,
        },
      });

      renderWithProviders(
        <Routes>
          <Route path="/app/forms/:id/edit" element={<FormEditorPage />} />
        </Routes>,
        { route: '/app/forms/103/edit' }
      );

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Vd: PSP2604014200000493')).toBeInTheDocument();
      });

      const input = screen.getByPlaceholderText('Vd: PSP2604014200000493');
      fireEvent.change(input, { target: { value: 'psp2604-0142_00000493!' } });
      // Đã lọc ký tự ngoài [A-Z0-9] và chuyển thành chữ HOA
      expect(input.value).toBe('PSP2604014200000493');
    });

    it('4. Nút Điền tự động: ảnh QR ngân hàng thông thường (BIN != 971025) bị từ chối "Đây không phải mã QR ví MoMo"', async () => {
      formAdminApi.fetchFormById.mockResolvedValue({
        id: 104,
        title: 'Form Test Auto Fill Error',
        publicKey: 'pub_momo_autofill_err',
        isPublished: true,
        fields: [{ id: 'f1', label: 'Họ tên', type: 'short_text', required: true, role: 'name' }],
        paymentConfig: {
          enabled: true,
          method: 'momo',
          amount: 50000,
          momoPhone: '0901234567',
          momoName: 'NGUYEN VAN A',
          momoQrMode: 'account',
          momoQrAccount: '',
          holdMinutes: 30,
        },
      });

      vi.spyOn(vietqrParser, 'decodeQrFromImageFile').mockResolvedValue({
        success: true,
        raw: 'mock_raw_qr_bank',
      });
      vi.spyOn(vietqrParser, 'parseAndValidateMoMoQr').mockReturnValue({
        valid: true,
        momoQrBin: '970436', // Vietcombank, không phải MoMo (971025)
        momoQrAccount: '1234567890',
        error: null,
      });

      renderWithProviders(
        <Routes>
          <Route path="/app/forms/:id/edit" element={<FormEditorPage />} />
        </Routes>,
        { route: '/app/forms/104/edit' }
      );

      await waitFor(() => {
        expect(screen.getByText('Điền tự động từ ảnh QR')).toBeInTheDocument();
      });

      const fileInput = document.querySelector('input[type="file"]');
      const file = new File(['dummy'], 'vcb_qr.png', { type: 'image/png' });
      fireEvent.change(fileInput, { target: { files: [file] } });

      await waitFor(() => {
        // Ô STK vẫn rỗng vì bị từ chối
        const input = screen.getByPlaceholderText('Vd: PSP2604014200000493');
        expect(input.value).toBe('');
      });
    });

    it('5. Nút Điền tự động: ảnh QR MoMo hợp lệ điền đúng STK vào ô', async () => {
      formAdminApi.fetchFormById.mockResolvedValue({
        id: 105,
        title: 'Form Test Auto Fill Success',
        publicKey: 'pub_momo_autofill_ok',
        isPublished: true,
        fields: [{ id: 'f1', label: 'Họ tên', type: 'short_text', required: true, role: 'name' }],
        paymentConfig: {
          enabled: true,
          method: 'momo',
          amount: 50000,
          momoPhone: '0901234567',
          momoName: 'NGUYEN VAN A',
          momoQrMode: 'account',
          momoQrAccount: '',
          holdMinutes: 30,
        },
      });

      vi.spyOn(vietqrParser, 'decodeQrFromImageFile').mockResolvedValue({
        success: true,
        raw: 'mock_raw_qr_momo',
      });
      vi.spyOn(vietqrParser, 'parseAndValidateMoMoQr').mockReturnValue({
        valid: true,
        momoQrBin: '971025',
        momoQrAccount: 'PSP2604014212340493',
        momoQrRefLabel: 'MOMOW2W6128717X',
        error: null,
      });

      renderWithProviders(
        <Routes>
          <Route path="/app/forms/:id/edit" element={<FormEditorPage />} />
        </Routes>,
        { route: '/app/forms/105/edit' }
      );

      await waitFor(() => {
        expect(screen.getByText('Điền tự động từ ảnh QR')).toBeInTheDocument();
      });

      const fileInput = document.querySelector('input[type="file"]');
      const file = new File(['dummy'], 'momo_qr.png', { type: 'image/png' });
      fireEvent.change(fileInput, { target: { files: [file] } });

      await waitFor(() => {
        const input = screen.getByDisplayValue('PSP2604014212340493');
        expect(input).toBeInTheDocument();
      });
    });
  });

  describe('FormSubmissionStatusPage — Chốt 2 kiểm tra tên người nhận', () => {
    it('6. Chốt 2: Nhánh MoMo có QR hiển thị dòng nhắc "Kiểm tra tên người nhận trên app phải là <momoName> trước khi chuyển"', async () => {
      formPublicApi.fetchPublicSubmissionStatus.mockResolvedValue({
        status: 'pending_payment',
        formTitle: 'Đặt lịch tư vấn',
        appointmentAt: '2026-10-01T10:00:00Z',
        holdExpired: false,
        payment: {
          method: 'momo',
          amount: 2000,
          momoPhone: '0901234567',
          momoName: 'NGUYEN VAN A',
          code: 'PAY12345',
          qrString: '00020101021238540010A00000072701240006971025011009012345670208QRIBFTTA5303704540420005802VN62130809PAY123456304ABCD',
        },
      });

      renderWithProviders(
        <Routes>
          <Route path="/f/:publicKey/s/:accessToken" element={<FormSubmissionStatusPage />} />
        </Routes>,
        { route: '/f/pub_key/s/tok_123' }
      );

      await waitFor(() => {
        expect(
          screen.getByText(/Kiểm tra tên người nhận trên app phải là NGUYEN VAN A trước khi chuyển/i)
        ).toBeInTheDocument();
      });
    });
  });
});
