import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { I18nProvider } from '../../../i18n';
import QRCode from 'qrcode';
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
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

/**
 * PLAN_FORM_DAT_LICH_THANH_TOAN_2026-09-13.md, PR-3b — trang trạng thái công khai
 * /f/:publicKey/s/:accessToken (dùng chung cho "vừa nộp xong" lẫn "mở lại từ thư").
 */
function renderStatusPage(path = '/f/pub_1/s/tok_1') {
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/f/:publicKey/s/:accessToken" element={<FormSubmissionStatusPage />} />
        </Routes>
      </MemoryRouter>
    </I18nProvider>
  );
}

const pendingPayment = {
  status: 'pending_payment',
  formTitle: 'Form thu tiền giữ chỗ',
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
};

const pendingMomoPayment = {
  status: 'pending_payment',
  formTitle: 'Form thu tiền MoMo',
  appointmentAt: null,
  holdExpired: false,
  holdExpiresAt: new Date(Date.now() + 125000).toISOString(),
  payment: {
    method: 'momo',
    code: 'MOMO99',
    amount: 150000,
    momoPhone: '0912345678',
    momoName: 'NGUYEN VAN MOMO',
    // Từ lệnh giao 25/09 PR-3, QR hiện theo `qrString` chứ không theo `method` nữa: backend chỉ trả
    // qrString cho MoMo khi chủ form đã tải "QR Đa Năng" (form.service.js getSubmissionStatus). Form
    // MoMo chưa có QR thì backend trả null — bản cũ của fixture này gán qrString ngân hàng, là dữ liệu
    // backend không bao giờ trả. Ca MoMo CÓ QR nằm ở PR3FormScheduling.spec.jsx.
    qrString: null,
  },
};

describe('FormSubmissionStatusPage component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('render giao diện ban đầu khi đang tải', () => {
    fetchPublicSubmissionStatus.mockReturnValue(new Promise(() => {}));
    renderStatusPage();
    expect(screen.getByText('Đang tải trạng thái...')).toBeInTheDocument();
  });

  it('không tìm thấy bài nộp (404/lỗi) -> hiện màn "Không tìm thấy bài nộp"', async () => {
    const err = new Error('not found');
    err.response = { status: 404 };
    fetchPublicSubmissionStatus.mockRejectedValue(err);

    renderStatusPage();

    await waitFor(() => expect(screen.getByText('Không tìm thấy bài nộp')).toBeInTheDocument());
    expect(
      screen.getByText('Đường dẫn không hợp lệ hoặc bài nộp không tồn tại.')
    ).toBeInTheDocument();
  });

  it('pending_payment còn hạn + có payment -> hiện QR + 5 dòng thông tin chuyển khoản + đếm ngược', async () => {
    fetchPublicSubmissionStatus.mockResolvedValue(pendingPayment);

    renderStatusPage();

    await waitFor(() => expect(screen.getByAltText('Mã QR chuyển khoản')).toBeInTheDocument());
    expect(screen.getByAltText('Mã QR chuyển khoản')).toHaveAttribute('src', 'data:image/png;base64,fake');

    expect(screen.getByText('Vietcombank')).toBeInTheDocument();
    expect(screen.getByText('0123456789')).toBeInTheDocument();
    expect(screen.getByText('NGUYEN VAN A')).toBeInTheDocument();
    expect(screen.getByText('150.000 đ')).toBeInTheDocument();
    expect(screen.getByText('ABC123')).toBeInTheDocument();

    expect(screen.getByTestId('hold-countdown')).toBeInTheDocument();

    const reportLink = screen.getByRole('link', { name: 'Báo cáo vấn đề' });
    expect(reportLink).toHaveAttribute('href', '/contact');
    expect(reportLink).toHaveAttribute('target', '_blank');
  });

  it('pending_payment MoMo: không gọi QRCode.toDataURL, không có ô QR/"Đang tạo mã QR", hiện đúng 4 dòng thông tin + câu hướng dẫn', async () => {
    fetchPublicSubmissionStatus.mockResolvedValue(pendingMomoPayment);

    renderStatusPage();

    await waitFor(() => expect(screen.getByText('0912345678')).toBeInTheDocument());
    expect(QRCode.toDataURL).not.toHaveBeenCalled();
    expect(screen.queryByAltText('Mã QR chuyển khoản')).not.toBeInTheDocument();
    expect(screen.queryByText('Đang tạo mã QR...')).not.toBeInTheDocument();

    expect(screen.getByText('0912345678')).toBeInTheDocument();
    expect(screen.getByText('NGUYEN VAN MOMO')).toBeInTheDocument();
    expect(screen.getByText('150.000 đ')).toBeInTheDocument();
    expect(screen.getByText('MOMO99')).toBeInTheDocument();

    expect(screen.getByText(/Mở app MoMo → Chuyển tiền → nhập số ví → ghi đúng nội dung/i)).toBeInTheDocument();
    expect(screen.queryByText('Vietcombank')).not.toBeInTheDocument();
  });

  it('pending_payment đã hết hạn giữ chỗ (holdExpired: true) -> KHÔNG hiện QR, hiện màn hết hạn + link quay lại biểu mẫu', async () => {
    fetchPublicSubmissionStatus.mockResolvedValue({ ...pendingPayment, holdExpired: true });

    renderStatusPage('/f/pub_expired/s/tok_expired');

    await waitFor(() => expect(screen.getByText('Hết thời gian giữ chỗ')).toBeInTheDocument());
    expect(screen.queryByAltText('Mã QR chuyển khoản')).not.toBeInTheDocument();

    const backLink = screen.getByRole('link', { name: 'Quay lại biểu mẫu' });
    expect(backLink).toHaveAttribute('href', '/f/pub_expired');
  });

  it('confirmed -> hiện "Đã xác nhận", KHÔNG hiện QR', async () => {
    fetchPublicSubmissionStatus.mockResolvedValue({
      status: 'confirmed',
      formTitle: 'Form đã xác nhận',
      appointmentAt: null,
      holdExpired: false,
      holdExpiresAt: null,
      payment: null,
    });

    renderStatusPage();

    await waitFor(() => expect(screen.getByText('Đã xác nhận')).toBeInTheDocument());
    expect(screen.queryByAltText('Mã QR chuyển khoản')).not.toBeInTheDocument();
  });

  it('review 15/09: submitted (form không thu tiền, chỉ dùng chung trang trạng thái) -> hiện "Đã ghi nhận", KHÔNG dùng chung chữ "Đã xác nhận" với trạng thái confirmed', async () => {
    fetchPublicSubmissionStatus.mockResolvedValue({
      status: 'submitted',
      formTitle: 'Form không thu tiền',
      appointmentAt: null,
      holdExpired: false,
      holdExpiresAt: null,
      payment: null,
    });

    renderStatusPage();

    await waitFor(() => expect(screen.getByText('Đã ghi nhận')).toBeInTheDocument());
    expect(screen.queryByText('Đã xác nhận')).not.toBeInTheDocument();
    expect(screen.queryByAltText('Mã QR chuyển khoản')).not.toBeInTheDocument();
  });

  it('cancelled -> hiện "Đã huỷ", KHÔNG hiện QR', async () => {
    fetchPublicSubmissionStatus.mockResolvedValue({
      status: 'cancelled',
      formTitle: 'Form đã huỷ',
      appointmentAt: null,
      holdExpired: false,
      holdExpiresAt: null,
      payment: null,
    });

    renderStatusPage();

    await waitFor(() => expect(screen.getByText('Đã huỷ')).toBeInTheDocument());
    expect(screen.queryByAltText('Mã QR chuyển khoản')).not.toBeInTheDocument();
  });

  describe('đếm ngược + tự làm mới (PR-3b)', () => {
    function parseCountdownSeconds(text) {
      const m = text.match(/(\d{2}):(\d{2})/);
      if (!m) return null;
      return Number(m[1]) * 60 + Number(m[2]);
    }

    // React 18 flush hiệu ứng thụ động (useEffect) qua MessageChannel thật, không phải qua
    // timer bị fake hoá bởi vi.useFakeTimers() — một lần advance lớn không chắc đủ nhịp cho
    // vòng lặp sự kiện thật xen kẽ; chia nhỏ nhiều bước advance liên tiếp đáng tin cậy hơn.
    async function flushAsync(totalMs, stepMs = 50) {
      for (let elapsed = 0; elapsed < totalMs; elapsed += stepMs) {
        await vi.advanceTimersByTimeAsync(stepMs);
      }
    }

    it('đếm ngược giảm dần theo từng giây thật (setInterval 1s)', async () => {
      vi.useFakeTimers();
      const holdExpiresAt = new Date(Date.now() + 300000).toISOString();
      fetchPublicSubmissionStatus.mockResolvedValue({ ...pendingPayment, holdExpiresAt });

      renderStatusPage();
      await flushAsync(3000);

      const initial = parseCountdownSeconds(screen.getByTestId('hold-countdown').textContent);
      expect(initial).not.toBeNull();

      await flushAsync(3000);
      const later = parseCountdownSeconds(screen.getByTestId('hold-countdown').textContent);
      expect(initial - later).toBeGreaterThanOrEqual(2);
      expect(initial - later).toBeLessThanOrEqual(4);
    });

    it('review 15/09: vòng làm mới 30s gặp lỗi mạng tạm thời (không phải 404) -> GIỮ NGUYÊN QR/dữ liệu cũ, không chuyển sang màn "Không tìm thấy bài nộp"', async () => {
      vi.useFakeTimers();
      const holdExpiresAt = new Date(Date.now() + 600000).toISOString();
      fetchPublicSubmissionStatus.mockResolvedValue({ ...pendingPayment, holdExpiresAt });

      renderStatusPage();
      await flushAsync(1000);
      expect(fetchPublicSubmissionStatus).toHaveBeenCalledTimes(1);
      expect(screen.getByAltText('Mã QR chuyển khoản')).toBeInTheDocument();

      const networkErr = new Error('Network Error');
      networkErr.response = undefined; // lỗi mạng thật thường không có response (khác lỗi 404 có response)
      fetchPublicSubmissionStatus.mockRejectedValueOnce(networkErr);

      await flushAsync(30000);
      expect(fetchPublicSubmissionStatus).toHaveBeenCalledTimes(2);

      // Vẫn còn QR/dữ liệu của lần tải trước — KHÔNG bị lỗi lần này xoá mất.
      expect(screen.getByAltText('Mã QR chuyển khoản')).toBeInTheDocument();
      expect(screen.queryByText('Không tìm thấy bài nộp')).not.toBeInTheDocument();
    });

    it('review 15/09: vòng làm mới 30s trả 404 (form bị ẩn/tắt/access token hết hiệu lực sau khi khách đã mở trang) -> CHUYỂN sang màn "Không tìm thấy bài nộp" (ca đối chứng — không phải mọi lỗi đều được bỏ qua)', async () => {
      vi.useFakeTimers();
      const holdExpiresAt = new Date(Date.now() + 600000).toISOString();
      fetchPublicSubmissionStatus.mockResolvedValue({ ...pendingPayment, holdExpiresAt });

      renderStatusPage();
      await flushAsync(1000);
      expect(fetchPublicSubmissionStatus).toHaveBeenCalledTimes(1);
      expect(screen.getByAltText('Mã QR chuyển khoản')).toBeInTheDocument();

      const notFoundErr = new Error('not found');
      notFoundErr.response = { status: 404 };
      fetchPublicSubmissionStatus.mockRejectedValueOnce(notFoundErr);

      await flushAsync(30000);
      expect(fetchPublicSubmissionStatus).toHaveBeenCalledTimes(2);

      expect(screen.getByText('Không tìm thấy bài nộp')).toBeInTheDocument();
      expect(screen.queryByAltText('Mã QR chuyển khoản')).not.toBeInTheDocument();
    });

    it('tự gọi lại API mỗi 30 giây khi còn đang chờ thanh toán (còn hạn)', async () => {
      vi.useFakeTimers();
      const holdExpiresAt = new Date(Date.now() + 600000).toISOString();
      fetchPublicSubmissionStatus.mockResolvedValue({ ...pendingPayment, holdExpiresAt });

      renderStatusPage();
      await flushAsync(1000);
      expect(fetchPublicSubmissionStatus).toHaveBeenCalledTimes(1);

      await flushAsync(30000);
      expect(fetchPublicSubmissionStatus).toHaveBeenCalledTimes(2);

      await flushAsync(30000);
      expect(fetchPublicSubmissionStatus).toHaveBeenCalledTimes(3);
    });

    it('hết đếm ngược -> gọi lại API NGAY, không đợi đủ vòng 30 giây', async () => {
      vi.useFakeTimers();
      const holdExpiresAt = new Date(Date.now() + 3000).toISOString();
      fetchPublicSubmissionStatus.mockResolvedValue({ ...pendingPayment, holdExpiresAt });

      renderStatusPage();
      await flushAsync(1000);
      expect(fetchPublicSubmissionStatus).toHaveBeenCalledTimes(1);

      // Chỉ trôi thêm chưa tới 3 giây nữa (tổng kém xa mốc 30 giây) — nếu refetch xảy ra ở đây
      // thì chắc chắn đến từ nhánh "đếm ngược chạm 0", không phải vòng poll 30 giây.
      await flushAsync(2500);
      expect(fetchPublicSubmissionStatus).toHaveBeenCalledTimes(2);
    });

    it('review 15/09: poll 30 giây VẪN chạy dù đã hết hạn giữ chỗ (holdExpired: true ngay từ đầu) — status vẫn pending_payment nên khách chuyển khoản muộn vẫn thấy "Đã xác nhận" khi chủ bấm nhận tiền', async () => {
      vi.useFakeTimers();
      fetchPublicSubmissionStatus.mockResolvedValue({ ...pendingPayment, holdExpired: true });

      renderStatusPage();
      await flushAsync(1000);
      expect(fetchPublicSubmissionStatus).toHaveBeenCalledTimes(1);

      await flushAsync(30000);
      expect(fetchPublicSubmissionStatus).toHaveBeenCalledTimes(2);

      await flushAsync(30000);
      expect(fetchPublicSubmissionStatus).toHaveBeenCalledTimes(3);
    });

    it('poll 30 giây DỪNG hẳn khi trạng thái không còn pending_payment (đã confirmed) — không tự chạy mãi bất kể trạng thái', async () => {
      vi.useFakeTimers();
      fetchPublicSubmissionStatus.mockResolvedValue({
        status: 'confirmed',
        formTitle: 'Form đã xác nhận',
        appointmentAt: null,
        holdExpired: false,
        holdExpiresAt: null,
        payment: null,
      });

      renderStatusPage();
      await flushAsync(1000);
      expect(fetchPublicSubmissionStatus).toHaveBeenCalledTimes(1);

      await flushAsync(60000);
      expect(fetchPublicSubmissionStatus).toHaveBeenCalledTimes(1);
    });
  });

  /**
   * PLAN_FORM_DAT_LICH_THANH_TOAN_2026-09-13.md, PR-4b mục 5 — trang trạng thái áp
   * font + màu chủ đạo (nút "Quay lại biểu mẫu") + nền + logo từ `theme` trả về bởi API trạng
   * thái (chỉ bannerUrl/logoUrl, không có khoá — form.service.js buildPublicFormTheme).
   */
  describe('FormSubmissionStatusPage — theme', () => {
    it('theme.primaryColor -> wrapper set --form-primary, nút "Quay lại biểu mẫu" dùng class var(--form-primary,...)', async () => {
      fetchPublicSubmissionStatus.mockResolvedValue({
        status: 'pending_payment',
        formTitle: 'Form hết hạn giữ chỗ',
        appointmentAt: null,
        holdExpired: true,
        holdExpiresAt: null,
        payment: null,
        theme: { primaryColor: '#1D4ED8' },
      });

      const { container } = renderStatusPage();

      const link = await screen.findByRole('link', { name: /Quay lại biểu mẫu/i });
      expect(link.className).toMatch(/var\(--form-primary,#df5c0e\)/);

      const wrapper = container.firstChild;
      expect(wrapper.style.getPropertyValue('--form-primary')).toBe('#1D4ED8');
    });

    it('theme.backgroundColor + không nhúng -> wrapper có style backgroundColor', async () => {
      fetchPublicSubmissionStatus.mockResolvedValue({
        ...pendingPayment,
        theme: { backgroundColor: '#fdf2e9' },
      });

      const { container } = renderStatusPage('/f/pub_1/s/tok_1');

      await waitFor(() => expect(screen.getByText('Form thu tiền giữ chỗ')).toBeInTheDocument());

      const wrapper = container.firstChild;
      expect(wrapper.style.backgroundColor).toBe('rgb(253, 242, 233)');
    });

    it('theme.backgroundColor + ?embed=1 -> wrapper KHÔNG có style backgroundColor', async () => {
      fetchPublicSubmissionStatus.mockResolvedValue({
        ...pendingPayment,
        theme: { backgroundColor: '#fdf2e9' },
      });

      const { container } = renderStatusPage('/f/pub_1/s/tok_1?embed=1');

      await waitFor(() => expect(screen.getByText('Form thu tiền giữ chỗ')).toBeInTheDocument());

      const wrapper = container.firstChild;
      expect(wrapper.style.backgroundColor).toBe('');
    });

    it('theme.logoUrl -> hiện logo phía trên tiêu đề; không có logoUrl -> không hiện', async () => {
      fetchPublicSubmissionStatus.mockResolvedValue({
        ...pendingPayment,
        theme: { logoUrl: 'https://cdn.example.com/logo.png' },
      });

      renderStatusPage();

      await waitFor(() => expect(screen.getByText('Form thu tiền giữ chỗ')).toBeInTheDocument());
      const logo = screen.getByAltText('');
      expect(logo.src).toBe('https://cdn.example.com/logo.png');
    });

    it('không có theme -> giữ giao diện hiện tại (không style backgroundColor, không logo)', async () => {
      fetchPublicSubmissionStatus.mockResolvedValue(pendingPayment);

      const { container } = renderStatusPage();

      await waitFor(() => expect(screen.getByText('Form thu tiền giữ chỗ')).toBeInTheDocument());

      const wrapper = container.firstChild;
      expect(wrapper.style.backgroundColor).toBe('');
      expect(screen.queryByAltText('')).not.toBeInTheDocument();
    });
  });
});
