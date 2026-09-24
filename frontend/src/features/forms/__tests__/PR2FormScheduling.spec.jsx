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
}));

vi.mock('../services/formAdminApi.service', () => ({
  fetchFormById: vi.fn(),
  fetchFormSubmissions: vi.fn(),
  cancelSubmission: vi.fn(),
  confirmPayment: vi.fn(),
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

describe('PR-2: Nút Tôi xác nhận đã chuyển khoản (Frontend)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('FormSubmissionStatusPage', () => {
    const basePendingStatus = {
      status: 'pending_payment',
      formTitle: 'Biểu mẫu tư vấn',
      appointmentAt: '2026-09-28T09:00:00Z',
      holdExpiresAt: new Date(Date.now() + 600000).toISOString(),
      holdExpired: false,
      payerReportedPaidAt: null,
      payment: {
        method: 'bank',
        bankBin: '970422',
        bankName: 'MBBank',
        accountNumber: '0987654321',
        accountName: 'NGUYEN VAN A',
        amount: 200000,
        code: 'BKTEST01',
        qrString: '00020101021238540010A00000072701240006970422011009876543210208QRIBFTTA530370454062000005802VN62120808BKTEST016304ABCD',
      },
    };

    it('khi chưa báo chuyển khoản: hiện nút "Tôi xác nhận đã chuyển khoản"', async () => {
      formPublicApi.fetchPublicSubmissionStatus.mockResolvedValueOnce(basePendingStatus);

      render(
        <I18nProvider>
          <MemoryRouter initialEntries={['/f/test-key/submissions/token_123/status']}>
            <Routes>
              <Route path="/f/:publicKey/submissions/:accessToken/status" element={<FormSubmissionStatusPage />} />
            </Routes>
          </MemoryRouter>
        </I18nProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('btn-confirm-paid')).toBeInTheDocument();
      });
      expect(screen.queryByTestId('block-payer-reported-success')).not.toBeInTheDocument();
    });

    it('bấm nút -> hiện modal hỏi xác nhận -> xác nhận gọi reportSubmissionPaid -> chuyển sang khối đã ghi nhận', async () => {
      formPublicApi.fetchPublicSubmissionStatus.mockResolvedValueOnce(basePendingStatus);
      const reportedAt = '2026-09-25T10:15:00Z';
      const extendedHold = '2026-09-26T10:15:00Z';
      formPublicApi.reportSubmissionPaid.mockResolvedValueOnce({
        status: 'pending_payment',
        holdExpiresAt: extendedHold,
        payerReportedPaidAt: reportedAt,
      });

      render(
        <I18nProvider>
          <MemoryRouter initialEntries={['/f/test-key/submissions/token_123/status']}>
            <Routes>
              <Route path="/f/:publicKey/submissions/:accessToken/status" element={<FormSubmissionStatusPage />} />
            </Routes>
          </MemoryRouter>
        </I18nProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('btn-confirm-paid')).toBeInTheDocument();
      });

      // Bấm nút mở modal
      fireEvent.click(screen.getByTestId('btn-confirm-paid'));

      expect(screen.getByText('Xác nhận chuyển khoản')).toBeInTheDocument();
      expect(screen.getByText('Bạn đã chuyển đúng số tiền và ghi đúng mã nội dung chuyển khoản?')).toBeInTheDocument();

      // Bấm xác nhận trong modal
      fireEvent.click(screen.getByTestId('btn-confirm-paid-submit'));

      await waitFor(() => {
        expect(formPublicApi.reportSubmissionPaid).toHaveBeenCalledWith('test-key', 'token_123');
        expect(screen.getByTestId('block-payer-reported-success')).toBeInTheDocument();
      });

      // Không còn nút báo chuyển khoản nữa
      expect(screen.queryByTestId('btn-confirm-paid')).not.toBeInTheDocument();
      expect(screen.getByText(/NGUYEN VAN A sẽ kiểm tra và xác nhận/)).toBeInTheDocument();
    });

    it('khi đã có payerReportedPaidAt từ trước: hiện khối đã ghi nhận ngay, không hiện nút', async () => {
      formPublicApi.fetchPublicSubmissionStatus.mockResolvedValueOnce({
        ...basePendingStatus,
        payerReportedPaidAt: '2026-09-25T10:15:00Z',
      });

      render(
        <I18nProvider>
          <MemoryRouter initialEntries={['/f/test-key/submissions/token_123/status']}>
            <Routes>
              <Route path="/f/:publicKey/submissions/:accessToken/status" element={<FormSubmissionStatusPage />} />
            </Routes>
          </MemoryRouter>
        </I18nProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('block-payer-reported-success')).toBeInTheDocument();
      });
      expect(screen.queryByTestId('btn-confirm-paid')).not.toBeInTheDocument();
    });
  });

  describe('FormSubmissionsPage', () => {
    it('lượt chờ thanh toán có payerReportedPaidAt -> hiển thị huy hiệu "Khách báo đã chuyển"', async () => {
      formAdminApi.fetchFormById.mockResolvedValueOnce({
        id: 'form-123',
        title: 'Form có thanh toán',
        paymentConfig: { enabled: true },
      });
      formAdminApi.fetchFormSubmissions.mockResolvedValueOnce({
        submissions: [
          {
            id: 101,
            paymentCode: 'BKCODE99',
            paymentAmount: 500000,
            status: 'pending_payment',
            holdExpiresAt: new Date(Date.now() + 600000).toISOString(),
            payerReportedPaidAt: '2026-09-25T14:30:00Z',
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
          <MemoryRouter initialEntries={['/app/forms/form-123/submissions']}>
            <Routes>
              <Route path="/app/forms/:id/submissions" element={<FormSubmissionsPage />} />
            </Routes>
          </MemoryRouter>
        </I18nProvider>
      );

      await waitFor(() => {
        expect(screen.getByText('BKCODE99')).toBeInTheDocument();
      });

      const badge = screen.getByTestId('badge-payer-reported');
      expect(badge).toBeInTheDocument();
      expect(badge.textContent).toContain('Khách báo đã chuyển');
    });
  });
});
