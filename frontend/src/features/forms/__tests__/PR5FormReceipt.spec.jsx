import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { I18nProvider } from '../../../i18n';
import FormSubmissionStatusPage from '../pages/FormSubmissionStatusPage';
import FormSubmissionsPage from '../pages/FormSubmissionsPage';
import * as formPublicApi from '../services/formPublicApi.service';
import * as formAdminApi from '../services/formAdminApi.service';

vi.mock('../services/formPublicApi.service', () => ({
  fetchPublicSubmissionStatus: vi.fn(),
  reportSubmissionPaid: vi.fn(),
  uploadSubmissionReceipt: vi.fn(),
}));

vi.mock('../services/formAdminApi.service', () => ({
  fetchFormById: vi.fn(),
  fetchFormSubmissions: vi.fn(),
  cancelSubmission: vi.fn(),
  confirmPayment: vi.fn(),
  fetchSubmissionReceiptBlob: vi.fn(),
}));

vi.mock('../../../utils/receiptCompressor', () => ({
  compressReceiptImage: vi.fn((file) => Promise.resolve(file)),
}));

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('qrcode', () => ({
  default: {
    toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,mockQr'),
  },
}));

// Mock URL.createObjectURL and revokeObjectURL
if (typeof window !== 'undefined') {
  window.URL.createObjectURL = vi.fn(() => 'blob:mock-preview-url');
  window.URL.revokeObjectURL = vi.fn();
}

describe('PR-5: Ảnh chuyển khoản bắt buộc trước khi xác nhận (Frontend)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('FormSubmissionStatusPage', () => {
    const basePendingStatus = {
      status: 'pending_payment',
      formTitle: 'Biểu mẫu đặt lịch PR-5',
      appointmentAt: '2026-09-28T09:00:00Z',
      holdExpiresAt: new Date(Date.now() + 600000).toISOString(),
      holdExpired: false,
      payerReportedPaidAt: null,
      hasReceipt: false,
      receiptWaived: false,
      payment: {
        method: 'bank',
        bankBin: '970422',
        bankName: 'MBBank',
        accountNumber: '0987654321',
        accountName: 'NGUYEN VAN A',
        amount: 200000,
        code: 'BKTEST05',
        qrString: '00020101021238540010A00000072701240006970422011009876543210208QRIBFTTA530370454062000005802VN62120808BKTEST056304ABCD',
      },
    };

    it('khi chưa có ảnh biên lai: nút xác nhận bị khoá và có gợi ý nhắc nhở', async () => {
      formPublicApi.fetchPublicSubmissionStatus.mockResolvedValueOnce(basePendingStatus);

      render(
        <I18nProvider>
          <MemoryRouter initialEntries={['/f/test-pr5/submissions/token_pr5/status']}>
            <Routes>
              <Route path="/f/:publicKey/submissions/:accessToken/status" element={<FormSubmissionStatusPage />} />
            </Routes>
          </MemoryRouter>
        </I18nProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('btn-confirm-paid')).toBeInTheDocument();
      });

      const btnConfirm = screen.getByTestId('btn-confirm-paid');
      expect(btnConfirm).toBeDisabled();
      expect(screen.getByTestId('msg-receipt-required')).toBeInTheDocument();
      expect(screen.getByTestId('block-receipt-upload')).toBeInTheDocument();
      expect(screen.getByTestId('btn-upload-receipt')).toBeInTheDocument();
    });

    it('tải ảnh thành công: mở khoá nút xác nhận và hiển thị ảnh xem trước', async () => {
      formPublicApi.fetchPublicSubmissionStatus.mockResolvedValueOnce(basePendingStatus);
      formPublicApi.uploadSubmissionReceipt.mockResolvedValueOnce({
        success: true,
        receiptStored: true,
        uploadedAt: new Date().toISOString(),
      });

      render(
        <I18nProvider>
          <MemoryRouter initialEntries={['/f/test-pr5/submissions/token_pr5/status']}>
            <Routes>
              <Route path="/f/:publicKey/submissions/:accessToken/status" element={<FormSubmissionStatusPage />} />
            </Routes>
          </MemoryRouter>
        </I18nProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('btn-confirm-paid')).toBeInTheDocument();
      });

      const fileInput = screen.getByTestId('input-receipt-file');
      const testFile = new File(['dummy-image-content'], 'receipt.jpg', { type: 'image/jpeg' });

      fireEvent.change(fileInput, { target: { files: [testFile] } });

      await waitFor(() => {
        expect(formPublicApi.uploadSubmissionReceipt).toHaveBeenCalledWith(
          'test-pr5',
          'token_pr5',
          expect.any(File)
        );
        expect(screen.getByTestId('img-receipt-preview')).toBeInTheDocument();
      });

      const btnConfirm = screen.getByTestId('btn-confirm-paid');
      expect(btnConfirm).not.toBeDisabled();
      expect(screen.queryByTestId('msg-receipt-required')).not.toBeInTheDocument();
      expect(screen.getByTestId('btn-change-receipt')).toBeInTheDocument();
    });

    it('chủ form hết dung lượng: mở khoá nút xác nhận và hiển thị thông báo miễn lưu ảnh', async () => {
      formPublicApi.fetchPublicSubmissionStatus.mockResolvedValueOnce(basePendingStatus);
      formPublicApi.uploadSubmissionReceipt.mockResolvedValueOnce({
        success: true,
        receiptStored: false,
        reason: 'OWNER_STORAGE_FULL',
        receiptWaived: true,
      });

      render(
        <I18nProvider>
          <MemoryRouter initialEntries={['/f/test-pr5/submissions/token_pr5/status']}>
            <Routes>
              <Route path="/f/:publicKey/submissions/:accessToken/status" element={<FormSubmissionStatusPage />} />
            </Routes>
          </MemoryRouter>
        </I18nProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('btn-confirm-paid')).toBeInTheDocument();
      });

      const fileInput = screen.getByTestId('input-receipt-file');
      const testFile = new File(['dummy'], 'receipt.png', { type: 'image/png' });

      fireEvent.change(fileInput, { target: { files: [testFile] } });

      await waitFor(() => {
        expect(screen.getByTestId('msg-receipt-waived')).toBeInTheDocument();
      });

      const btnConfirm = screen.getByTestId('btn-confirm-paid');
      expect(btnConfirm).not.toBeDisabled();
      expect(screen.queryByTestId('msg-receipt-required')).not.toBeInTheDocument();
    });

    it('trạng thái ban đầu đã có hasReceipt=true: nút xác nhận được bật sẵn', async () => {
      formPublicApi.fetchPublicSubmissionStatus.mockResolvedValueOnce({
        ...basePendingStatus,
        hasReceipt: true,
      });

      render(
        <I18nProvider>
          <MemoryRouter initialEntries={['/f/test-pr5/submissions/token_pr5/status']}>
            <Routes>
              <Route path="/f/:publicKey/submissions/:accessToken/status" element={<FormSubmissionStatusPage />} />
            </Routes>
          </MemoryRouter>
        </I18nProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('btn-confirm-paid')).toBeInTheDocument();
      });

      expect(screen.getByTestId('btn-confirm-paid')).not.toBeDisabled();
      expect(screen.queryByTestId('msg-receipt-required')).not.toBeInTheDocument();
    });

    it('nút mở QR xem trên điện thoại hiển thị modal QR', async () => {
      formPublicApi.fetchPublicSubmissionStatus.mockResolvedValueOnce(basePendingStatus);

      render(
        <I18nProvider>
          <MemoryRouter initialEntries={['/f/test-pr5/submissions/token_pr5/status']}>
            <Routes>
              <Route path="/f/:publicKey/submissions/:accessToken/status" element={<FormSubmissionStatusPage />} />
            </Routes>
          </MemoryRouter>
        </I18nProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('btn-open-desktop-qr')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('btn-open-desktop-qr'));

      await waitFor(() => {
        expect(screen.getByTestId('img-desktop-qr')).toBeInTheDocument();
      });
    });
  });

  describe('FormSubmissionsPage', () => {
    it('hiển thị nút xem ảnh và mở modal xem ảnh biên lai khi có paymentReceiptKey', async () => {
      formAdminApi.fetchFormById.mockResolvedValueOnce({
        id: 'form-pr5',
        title: 'Form PR-5 Admin',
        paymentConfig: { enabled: true },
      });
      formAdminApi.fetchFormSubmissions.mockResolvedValueOnce({
        submissions: [
          {
            id: 201,
            paymentCode: 'BKPR5_01',
            paymentAmount: 300000,
            status: 'pending_payment',
            holdExpiresAt: new Date(Date.now() + 600000).toISOString(),
            paymentReceiptKey: 'workspaces/1/forms/receipts/rec_01.jpg',
            paymentReceiptUploadedAt: '2026-09-25T10:00:00Z',
            answers: {},
          },
        ],
        total: 1,
        page: 1,
        pageSize: 20,
        totalPages: 1,
      });
      formAdminApi.fetchSubmissionReceiptBlob.mockResolvedValueOnce(new Blob(['fake-img'], { type: 'image/jpeg' }));

      render(
        <I18nProvider>
          <MemoryRouter initialEntries={['/app/forms/form-pr5/submissions']}>
            <Routes>
              <Route path="/app/forms/:id/submissions" element={<FormSubmissionsPage />} />
            </Routes>
          </MemoryRouter>
        </I18nProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('btn-view-receipt-201')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('btn-view-receipt-201'));

      await waitFor(() => {
        expect(formAdminApi.fetchSubmissionReceiptBlob).toHaveBeenCalledWith('form-pr5', 201);
        expect(screen.getByTestId('img-receipt-modal')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('btn-close-receipt-modal'));
      expect(screen.queryByTestId('img-receipt-modal')).not.toBeInTheDocument();
    });

    it('hiển thị huy hiệu miễn gửi ảnh khi có paymentReceiptWaivedReason', async () => {
      formAdminApi.fetchFormById.mockResolvedValueOnce({
        id: 'form-pr5',
        title: 'Form PR-5 Admin',
        paymentConfig: { enabled: true },
      });
      formAdminApi.fetchFormSubmissions.mockResolvedValueOnce({
        submissions: [
          {
            id: 202,
            paymentCode: 'BKPR5_02',
            paymentAmount: 150000,
            status: 'pending_payment',
            holdExpiresAt: new Date(Date.now() + 600000).toISOString(),
            paymentReceiptWaivedReason: 'owner_storage_full',
            answers: {},
          },
        ],
        total: 1,
        page: 1,
        pageSize: 20,
        totalPages: 1,
      });

      render(
        <I18nProvider>
          <MemoryRouter initialEntries={['/app/forms/form-pr5/submissions']}>
            <Routes>
              <Route path="/app/forms/:id/submissions" element={<FormSubmissionsPage />} />
            </Routes>
          </MemoryRouter>
        </I18nProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('badge-receipt-waived-202')).toBeInTheDocument();
      });

      expect(screen.getByTestId('badge-receipt-waived-202').textContent).toContain('Miễn gửi ảnh');
    });
  });
});
