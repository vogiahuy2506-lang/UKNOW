import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { I18nProvider } from '../../../i18n';
import FormEditorPage from '../pages/FormEditorPage';
import FormSubmissionStatusPage from '../pages/FormSubmissionStatusPage';
import ShareModal from '../components/ShareModal';
import * as formAdminApi from '../services/formAdminApi.service';
import * as formPublicApi from '../services/formPublicApi.service';
import toast from 'react-hot-toast';
import QRCode from 'qrcode';

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
}));

vi.mock('../../storage/useStorageQuota', () => ({
  default: () => ({ usage: null }),
}));

vi.mock('../../storage/storageEvents', () => ({
  notifyStorageQuotaRefresh: vi.fn(),
}));

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('qrcode', () => ({
  default: {
    toDataURL: vi.fn(),
  },
}));

let mockAuthState = { user: null, activeContext: { type: 'self' } };
vi.mock('../../../stores/authStore', () => ({
  useAuthStore: (selector) => selector(mockAuthState),
}));

describe('PR-1: Biểu mẫu đặt lịch sửa theo góp ý sếp 24/09', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthState = { user: null, activeContext: { type: 'self' } };
    QRCode.toDataURL.mockResolvedValue('data:image/png;base64,mockQrDataUrl');
  });

  describe('Việc 1.1: FormSubmissionStatusPage — Câu quét QR + Lưu ảnh QR', () => {
    it('nhánh bank: có câu hướng dẫn trên QR, QR cỡ w-60 h-60, nút lưu ảnh qr-<code>.png', async () => {
      formPublicApi.fetchPublicSubmissionStatus.mockResolvedValueOnce({
        status: 'pending_payment',
        appointmentAt: '2026-09-28T09:00:00Z',
        holdExpiresAt: new Date(Date.now() + 600000).toISOString(),
        holdExpired: false,
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
      });

      render(
        <I18nProvider>
          <MemoryRouter initialEntries={['/f/test-form/submissions/sub_token_1/status']}>
            <Routes>
              <Route path="/f/:publicKey/submissions/:accessToken/status" element={<FormSubmissionStatusPage />} />
            </Routes>
          </MemoryRouter>
        </I18nProvider>
      );

      // Chờ dữ liệu nạp
      await waitFor(() => {
        expect(screen.getByText('Hãy mở app ngân hàng và quét mã QR để chuyển khoản')).toBeInTheDocument();
      });

      // Kiểm tra QRCode được gọi với margin 4 và width 320 — trong waitFor: QR tạo ở effect SAU khi
      // câu hướng dẫn hiện, CI chậm có lúc chưa kịp gọi (26/09 đỏ "Number of calls: 0").
      await waitFor(() => {
        expect(QRCode.toDataURL).toHaveBeenCalledWith(
          expect.stringContaining('BKTEST01'),
          expect.objectContaining({ width: 320, margin: 4 })
        );
      });

      // Chờ ảnh QR hiển thị
      await waitFor(() => {
        const qrImg = screen.getByAltText('Mã QR chuyển khoản');
        expect(qrImg).toBeInTheDocument();
        expect(qrImg.className).toContain('w-60');
        expect(qrImg.className).toContain('h-60');
      });

      // Nút Lưu ảnh QR
      const saveBtn = screen.getByTestId('btn-save-qr');
      expect(saveBtn).toBeInTheDocument();
      expect(saveBtn).toHaveAttribute('href', 'data:image/png;base64,mockQrDataUrl');
      expect(saveBtn).toHaveAttribute('download', 'qr-BKTEST01.png');
      expect(screen.getByText('Đặt lịch trên điện thoại? Lưu ảnh rồi chọn ảnh QR trong app ngân hàng')).toBeInTheDocument();
    });

    it('nhánh MoMo: không có QR, không hiện nút lưu ảnh QR', async () => {
      formPublicApi.fetchPublicSubmissionStatus.mockResolvedValueOnce({
        status: 'pending_payment',
        appointmentAt: '2026-09-28T09:00:00Z',
        holdExpiresAt: new Date(Date.now() + 600000).toISOString(),
        holdExpired: false,
        payment: {
          method: 'momo',
          momoPhone: '0987654321',
          momoName: 'NGUYEN VAN A',
          amount: 200000,
          code: 'MMTEST01',
          qrString: null,
        },
      });

      render(
        <I18nProvider>
          <MemoryRouter initialEntries={['/f/test-form/submissions/sub_token_2/status']}>
            <Routes>
              <Route path="/f/:publicKey/submissions/:accessToken/status" element={<FormSubmissionStatusPage />} />
            </Routes>
          </MemoryRouter>
        </I18nProvider>
      );

      await waitFor(() => {
        expect(screen.getByText('0987654321')).toBeInTheDocument();
      });

      expect(screen.queryByTestId('btn-save-qr')).not.toBeInTheDocument();
      expect(screen.queryByText('Hãy mở app ngân hàng và quét mã QR để chuyển khoản')).not.toBeInTheDocument();
    });
  });

  describe('Việc 1.2: FormEditorPage — Thanh thao tác dính & 4 nút', () => {
    const existingForm = {
      id: 'form-existing-999',
      publicKey: 'pub-key-999',
      title: 'Biểu mẫu tư vấn',
      description: 'Mô tả',
      isPublished: false,
      submissionCount: 5,
      fields: [
        { key: 'f1', label: 'Họ và tên', type: 'short_text', required: true, role: 'name' },
      ],
      settings: {
        notifyOwner: true,
        consentEnabled: true,
        sendConfirmation: false,
        submitButtonText: 'Gửi',
        successMessage: 'Thành công',
        redirectUrl: '',
      },
      theme: {},
    };

    it('hiển thị đủ 4 nút trên thanh thao tác dính (Lưu, Công khai, Chia sẻ, Bài nộp (5))', async () => {
      formAdminApi.fetchFormById.mockResolvedValueOnce(existingForm);

      render(
        <I18nProvider>
          <MemoryRouter initialEntries={['/app/forms/form-existing-999/edit']}>
            <Routes>
              <Route path="/app/forms/:id/edit" element={<FormEditorPage />} />
            </Routes>
          </MemoryRouter>
        </I18nProvider>
      );

      await waitFor(() => {
        expect(screen.getByText('Lưu biểu mẫu')).toBeInTheDocument();
      });

      expect(screen.getByText('Xuất bản')).toBeInTheDocument();
      expect(screen.getByText(/Chia sẻ/)).toBeInTheDocument();
      expect(screen.getByText('Bài nộp (5)')).toBeInTheDocument();
    });

    it('sửa tiêu đề, bấm Công khai (không bấm Lưu trước) -> lưu tiêu đề mới rồi mới publish', async () => {
      formAdminApi.fetchFormById.mockResolvedValueOnce(existingForm);
      formAdminApi.updateForm.mockResolvedValueOnce({ ...existingForm, title: 'Tiêu đề đã sửa' });
      formAdminApi.publishForm.mockResolvedValueOnce({ id: existingForm.id, isPublished: true });

      render(
        <I18nProvider>
          <MemoryRouter initialEntries={['/app/forms/form-existing-999/edit']}>
            <Routes>
              <Route path="/app/forms/:id/edit" element={<FormEditorPage />} />
            </Routes>
          </MemoryRouter>
        </I18nProvider>
      );

      await waitFor(() => {
        expect(screen.getByDisplayValue('Biểu mẫu tư vấn')).toBeInTheDocument();
      });

      const titleInput = screen.getByDisplayValue('Biểu mẫu tư vấn');
      fireEvent.change(titleInput, { target: { value: 'Tiêu đề đã sửa' } });

      const publishBtn = screen.getByText('Xuất bản');
      fireEvent.click(publishBtn);

      await waitFor(() => {
        expect(formAdminApi.updateForm).toHaveBeenCalledWith(
          'form-existing-999',
          expect.objectContaining({ title: 'Tiêu đề đã sửa' })
        );
        expect(formAdminApi.publishForm).toHaveBeenCalledWith('form-existing-999', true);
      });
    });

    it('lưu thất bại (tiêu đề trống), bấm Công khai -> không gọi publishForm', async () => {
      formAdminApi.fetchFormById.mockResolvedValueOnce(existingForm);

      render(
        <I18nProvider>
          <MemoryRouter initialEntries={['/app/forms/form-existing-999/edit']}>
            <Routes>
              <Route path="/app/forms/:id/edit" element={<FormEditorPage />} />
            </Routes>
          </MemoryRouter>
        </I18nProvider>
      );

      await waitFor(() => {
        expect(screen.getByDisplayValue('Biểu mẫu tư vấn')).toBeInTheDocument();
      });

      const titleInput = screen.getByDisplayValue('Biểu mẫu tư vấn');
      fireEvent.change(titleInput, { target: { value: '' } });

      const publishBtn = screen.getByText('Xuất bản');
      fireEvent.click(publishBtn);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Tiêu đề biểu mẫu là bắt buộc');
        expect(formAdminApi.publishForm).not.toHaveBeenCalled();
      });
    });

    it('form mới chưa lưu: Chia sẻ và Bài nộp bị vô hiệu hoá', async () => {
      render(
        <I18nProvider>
          <MemoryRouter initialEntries={['/app/forms/new']}>
            <Routes>
              <Route path="/app/forms/new" element={<FormEditorPage />} />
            </Routes>
          </MemoryRouter>
        </I18nProvider>
      );

      await waitFor(() => {
        expect(screen.getByText('Lưu biểu mẫu')).toBeInTheDocument();
      });

      const shareBtn = screen.getByText(/Chia sẻ/).closest('button');
      const submissionsBtn = screen.getByText('Bài nộp').closest('button');

      expect(shareBtn).toBeDisabled();
      expect(submissionsBtn).toBeDisabled();
    });

    it('form ẩn -> bấm Chia sẻ -> Modal mở, có cảnh báo "Biểu mẫu đang ẩn, người khác chưa mở được link" + nút Xuất bản', async () => {
      formAdminApi.fetchFormById.mockResolvedValueOnce(existingForm);

      render(
        <I18nProvider>
          <MemoryRouter initialEntries={['/app/forms/form-existing-999/edit']}>
            <Routes>
              <Route path="/app/forms/:id/edit" element={<FormEditorPage />} />
            </Routes>
          </MemoryRouter>
        </I18nProvider>
      );

      await waitFor(() => {
        expect(screen.getByText(/Chia sẻ/)).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText(/Chia sẻ/));

      await waitFor(() => {
        expect(screen.getByText('Biểu mẫu đang ẩn, người khác chưa mở được link.')).toBeInTheDocument();
      });
    });
  });

  describe('ShareModal độc lập', () => {
    it('form isPublished = true: không hiện cảnh báo form ẩn', () => {
      render(
        <I18nProvider>
          <ShareModal
            isOpen={true}
            onClose={() => {}}
            form={{ publicKey: 'pub-test', title: 'Test Form', isPublished: true }}
          />
        </I18nProvider>
      );

      expect(screen.queryByText('Biểu mẫu đang ẩn, người khác chưa mở được link.')).not.toBeInTheDocument();
    });

    it('form isPublished = false: hiện cảnh báo + nút Xuất bản gọi onPublish', () => {
      const handlePublish = vi.fn();
      render(
        <I18nProvider>
          <ShareModal
            isOpen={true}
            onClose={() => {}}
            onPublish={handlePublish}
            form={{ publicKey: 'pub-test', title: 'Test Form', isPublished: false }}
          />
        </I18nProvider>
      );

      expect(screen.getByText('Biểu mẫu đang ẩn, người khác chưa mở được link.')).toBeInTheDocument();
      const pubBtn = screen.getByRole('button', { name: 'Xuất bản' });
      fireEvent.click(pubBtn);
      expect(handlePublish).toHaveBeenCalled();
    });
  });
});
