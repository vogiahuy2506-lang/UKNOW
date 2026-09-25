import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { I18nProvider } from '../../../i18n';
import FormEditorPage from '../pages/FormEditorPage';
import * as formAdminApi from '../services/formAdminApi.service';
import toast from 'react-hot-toast';

vi.mock('../services/formAdminApi.service', () => ({
  fetchFormById: vi.fn(),
  createForm: vi.fn(),
  updateForm: vi.fn(),
  uploadFormTempFile: vi.fn(),
  uploadFormAsset: vi.fn(),
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

// PR-3b phản biện điểm 3: activeContext sống trong authStore (Zustand, selector-style hook)
// — mock phải áp `selector` lên state giả lập thay vì trả nguyên object, đúng cách
// FormEditorPage.jsx đọc `useAuthStore((state) => state.activeContext)`.
let mockAuthState = { user: null, activeContext: { type: 'self' } };
vi.mock('../../../stores/authStore', () => ({
  useAuthStore: (selector) => selector(mockAuthState),
}));

describe('FormEditorPage component', () => {
  const existingForm = {
    id: 'form-existing-456',
    title: 'Biểu mẫu khảo sát',
    description: 'Mô tả biểu mẫu mẫu',
    isPublished: true,
    fields: [
      {
        key: 'field_name_001',
        label: 'Tên khách hàng',
        type: 'short_text',
        required: true,
        role: 'name',
      },
      {
        key: 'field_email_002',
        label: 'Địa chỉ Email',
        type: 'email',
        required: true,
        role: 'email',
      },
      {
        key: 'field_city_003',
        label: 'Thành phố sinh sống',
        type: 'select',
        required: false,
        role: '',
        options: ['Hà Nội', 'TP.HCM', 'Đà Nẵng'],
      },
    ],
    settings: {
      notifyOwner: true,
      consentEnabled: true,
      sendConfirmation: false,
      submitButtonText: 'Gửi khảo sát',
      successMessage: 'Cảm ơn bạn đã phản hồi!',
      redirectUrl: 'https://example.com/thanks',
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthState = { user: null, activeContext: { type: 'self' } };
  });

  it('khi sửa form (PUT): giữ nguyên key cũ của tất cả các trường hiện có', async () => {
    formAdminApi.fetchFormById.mockResolvedValue(existingForm);
    formAdminApi.updateForm.mockResolvedValue({ ...existingForm, title: 'Biểu mẫu đã đổi tên' });

    render(
      <MemoryRouter initialEntries={['/app/forms/form-existing-456/edit']}>
        <I18nProvider>
          <Routes>
            <Route path="/app/forms/:id/edit" element={<FormEditorPage />} />
          </Routes>
        </I18nProvider>
      </MemoryRouter>
    );

    // Chờ tải dữ liệu form xong
    await waitFor(() => {
      expect(screen.getByDisplayValue('Biểu mẫu khảo sát')).toBeInTheDocument();
    });

    // Thay đổi nhãn trường thứ 1
    const labelInputs = screen.getAllByPlaceholderText(/Ví dụ: Họ và tên/i);
    fireEvent.change(labelInputs[0], { target: { value: 'Họ và tên đầy đủ' } });

    // Bấm nút Lưu biểu mẫu
    const saveBtn = screen.getByRole('button', { name: /Lưu biểu mẫu/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(formAdminApi.updateForm).toHaveBeenCalledTimes(1);
    });

    const [calledId, payload] = formAdminApi.updateForm.mock.calls[0];
    expect(calledId).toBe('form-existing-456');

    // Kiểm tra các trường gửi đi vẫn giữ đúng key cũ ban đầu
    expect(payload.fields).toHaveLength(3);
    expect(payload.fields[0].key).toBe('field_name_001');
    expect(payload.fields[0].label).toBe('Họ và tên đầy đủ');
    expect(payload.fields[1].key).toBe('field_email_002');
    expect(payload.fields[2].key).toBe('field_city_003');
  });

  it('khi sửa form (PUT): luôn gửi đủ 6 khoá settings kể cả khi chỉ đổi 1 giá trị', async () => {
    formAdminApi.fetchFormById.mockResolvedValue(existingForm);
    formAdminApi.updateForm.mockResolvedValue(existingForm);

    render(
      <MemoryRouter initialEntries={['/app/forms/form-existing-456/edit']}>
        <I18nProvider>
          <Routes>
            <Route path="/app/forms/:id/edit" element={<FormEditorPage />} />
          </Routes>
        </I18nProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue('Biểu mẫu khảo sát')).toBeInTheDocument();
    });

    // Chỉ đổi 1 trường trong Cài đặt: Chữ nút gửi
    const submitTextInput = screen.getByDisplayValue('Gửi khảo sát');
    fireEvent.change(submitTextInput, { target: { value: 'Gửi phản hồi ngay' } });

    // Bấm Lưu
    const saveBtn = screen.getByRole('button', { name: /Lưu biểu mẫu/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(formAdminApi.updateForm).toHaveBeenCalledTimes(1);
    });

    const [, payload] = formAdminApi.updateForm.mock.calls[0];
    expect(payload.settings).toBeDefined();

    // Bắt buộc phải có đủ 6 khoá để không làm mất cài đặt cũ do backend PUT ghi đè cả khối
    expect(payload.settings).toEqual({
      notifyOwner: true,
      consentEnabled: true,
      sendConfirmation: false,
      submitButtonText: 'Gửi phản hồi ngay',
      successMessage: 'Cảm ơn bạn đã phản hồi!',
      redirectUrl: 'https://example.com/thanks',
    });
  });

  it('thêm trường mới không có key ban đầu để backend tự sinh', async () => {
    formAdminApi.fetchFormById.mockResolvedValue(existingForm);
    formAdminApi.updateForm.mockResolvedValue(existingForm);

    render(
      <MemoryRouter initialEntries={['/app/forms/form-existing-456/edit']}>
        <I18nProvider>
          <Routes>
            <Route path="/app/forms/:id/edit" element={<FormEditorPage />} />
          </Routes>
        </I18nProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue('Biểu mẫu khảo sát')).toBeInTheDocument();
    });

    // Bấm Thêm trường
    const addFieldBtn = screen.getByRole('button', { name: /Thêm trường/i });
    fireEvent.click(addFieldBtn);

    // Bấm Lưu
    const saveBtn = screen.getByRole('button', { name: /Lưu biểu mẫu/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(formAdminApi.updateForm).toHaveBeenCalledTimes(1);
    });

    const [, payload] = formAdminApi.updateForm.mock.calls[0];
    expect(payload.fields).toHaveLength(4);

    // 3 trường cũ có key
    expect(payload.fields[0].key).toBe('field_name_001');
    expect(payload.fields[1].key).toBe('field_email_002');
    expect(payload.fields[2].key).toBe('field_city_003');

    // Trường thứ 4 mới thêm KHÔNG có thuộc tính key (hoặc undefined) để backend tự sinh
    expect(payload.fields[3].key).toBeUndefined();
  });

  it('validate client: thông báo lỗi khi tiêu đề biểu mẫu trống hoặc nhãn trường trống', async () => {
    render(
      <MemoryRouter initialEntries={['/app/forms/new']}>
        <I18nProvider>
          <Routes>
            <Route path="/app/forms/new" element={<FormEditorPage />} />
          </Routes>
        </I18nProvider>
      </MemoryRouter>
    );

    // Tiêu đề ban đầu trống (hoặc xoá nếu có)
    const titleInput = screen.getByPlaceholderText(/Ví dụ: Đăng ký tư vấn lộ trình 1-1/i);
    fireEvent.change(titleInput, { target: { value: '' } });

    const saveBtn = screen.getByRole('button', { name: /Lưu biểu mẫu/i });
    fireEvent.click(saveBtn);

    // Không được gọi createForm
    expect(formAdminApi.createForm).not.toHaveBeenCalled();
    expect(screen.getByText('Tiêu đề biểu mẫu là bắt buộc')).toBeInTheDocument();
  });

  describe('Đặt lịch hẹn (PR-2b)', () => {
    it('bật đặt lịch, Thứ 2 09:00 + Chủ nhật 10:00, để trống sức chứa: weeklySlots đủ 7 khoá đúng "0"/"1", slotCapacity: null (đột biến #5, #6)', async () => {
      formAdminApi.createForm.mockResolvedValue({ id: 'new-form-booking-1' });

      const { container } = render(
        <MemoryRouter initialEntries={['/app/forms/new']}>
          <I18nProvider>
            <Routes>
              <Route path="/app/forms/new" element={<FormEditorPage />} />
            </Routes>
          </I18nProvider>
        </MemoryRouter>
      );

      fireEvent.change(screen.getByPlaceholderText(/Ví dụ: Đăng ký tư vấn lộ trình 1-1/i), {
        target: { value: 'Form đặt lịch mới' },
      });

      const enableCheckbox = screen.getByRole('checkbox', { name: /Bật đặt lịch hẹn/i });
      fireEvent.click(enableCheckbox);

      // 7 nút "Thêm khung giờ" theo thứ tự Thứ 2 -> Chủ nhật (WEEKDAY_UI_ORDER)
      const addButtons = screen.getAllByRole('button', { name: /Thêm khung giờ/i });
      expect(addButtons).toHaveLength(7);
      fireEvent.click(addButtons[0]); // Thứ 2
      fireEvent.click(addButtons[6]); // Chủ nhật

      const timeInputs = container.querySelectorAll('input[type="time"]');
      expect(timeInputs).toHaveLength(2);
      fireEvent.change(timeInputs[0], { target: { value: '09:00' } });
      fireEvent.change(timeInputs[1], { target: { value: '10:00' } });

      // Không đụng vào ô sức chứa -> để trống
      const saveBtn = screen.getByRole('button', { name: /Lưu biểu mẫu/i });
      fireEvent.click(saveBtn);

      await waitFor(() => expect(formAdminApi.createForm).toHaveBeenCalledTimes(1));
      const [payload] = formAdminApi.createForm.mock.calls[0];

      expect(payload.bookingConfig.enabled).toBe(true);
      expect(payload.bookingConfig.weeklySlots).toEqual({
        '0': ['10:00'],
        '1': ['09:00'],
        '2': [],
        '3': [],
        '4': [],
        '5': [],
        '6': [],
      });
      expect(payload.bookingConfig.slotCapacity).toBeNull();
      expect(payload.bookingConfig.daysAhead).toBe(30);
      expect(payload.bookingConfig.minNoticeMinutes).toBe(60);
      expect(payload.bookingConfig.closedDates).toEqual([]);
    });

    it('form mới không bật đặt lịch: payload bookingConfig: null', async () => {
      formAdminApi.createForm.mockResolvedValue({ id: 'new-form-no-booking' });

      render(
        <MemoryRouter initialEntries={['/app/forms/new']}>
          <I18nProvider>
            <Routes>
              <Route path="/app/forms/new" element={<FormEditorPage />} />
            </Routes>
          </I18nProvider>
        </MemoryRouter>
      );

      fireEvent.change(screen.getByPlaceholderText(/Ví dụ: Đăng ký tư vấn lộ trình 1-1/i), {
        target: { value: 'Form không đặt lịch' },
      });

      fireEvent.click(screen.getByRole('button', { name: /Lưu biểu mẫu/i }));

      await waitFor(() => expect(formAdminApi.createForm).toHaveBeenCalledTimes(1));
      const [payload] = formAdminApi.createForm.mock.calls[0];
      expect(payload.bookingConfig).toBeNull();
    });

    it('tắt đặt lịch trên form đã có cấu hình: cảnh báo trước khi lưu, chặn lưu tới khi tick xác nhận, payload bookingConfig: null', async () => {
      const existingFormWithBooking = {
        ...existingForm,
        bookingConfig: {
          enabled: true,
          weeklySlots: { '0': [], '1': ['09:00'], '2': [], '3': [], '4': [], '5': [], '6': [] },
          slotCapacity: 5,
          daysAhead: 14,
          minNoticeMinutes: 30,
          closedDates: [],
        },
      };
      formAdminApi.fetchFormById.mockResolvedValue(existingFormWithBooking);
      formAdminApi.updateForm.mockResolvedValue(existingFormWithBooking);

      render(
        <MemoryRouter initialEntries={['/app/forms/form-existing-456/edit']}>
          <I18nProvider>
            <Routes>
              <Route path="/app/forms/:id/edit" element={<FormEditorPage />} />
            </Routes>
          </I18nProvider>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByDisplayValue('Biểu mẫu khảo sát')).toBeInTheDocument();
      });

      const enableCheckbox = screen.getByRole('checkbox', { name: /Bật đặt lịch hẹn/i });
      expect(enableCheckbox).toBeChecked();
      fireEvent.click(enableCheckbox); // tắt đặt lịch

      // Cảnh báo mất dữ liệu hiện ra rõ ràng trước khi lưu
      expect(screen.getByText(/sẽ xoá toàn bộ khung giờ/i)).toBeInTheDocument();

      const saveBtn = screen.getByRole('button', { name: /Lưu biểu mẫu/i });
      fireEvent.click(saveBtn);

      // Chưa tick xác nhận -> chặn lưu
      expect(formAdminApi.updateForm).not.toHaveBeenCalled();

      const confirmCheckbox = screen.getByRole('checkbox', { name: /Tôi đã hiểu, vẫn lưu để tắt đặt lịch/i });
      fireEvent.click(confirmCheckbox);
      fireEvent.click(saveBtn);

      await waitFor(() => expect(formAdminApi.updateForm).toHaveBeenCalledTimes(1));
      const [, payload] = formAdminApi.updateForm.mock.calls[0];
      expect(payload.bookingConfig).toBeNull();
    });
  });

  describe('Thanh toán giữ chỗ (PR-3b)', () => {
    function fillPaymentFields(container) {
      fireEvent.change(screen.getByPlaceholderText('Vd: 150.000'), {
        target: { value: '150000' },
      });
      const bankSelect = screen.getByText('Ngân hàng').closest('div').querySelector('select');
      fireEvent.change(bankSelect, { target: { value: '970436' } });
      const accountNumberInput = screen
        .getByText('Số tài khoản')
        .closest('div')
        .querySelector('input');
      fireEvent.change(accountNumberInput, { target: { value: '0123456789' } });
      fireEvent.change(screen.getByPlaceholderText(/NGUYEN VAN A/i), {
        target: { value: 'Nguyen Van A' },
      });
      void container;
    }

    it('chủ tài khoản bật thanh toán, điền đủ thông tin hợp lệ: payload.paymentConfig đủ khoá, amount là số nguyên', async () => {
      formAdminApi.createForm.mockResolvedValue({ id: 'new-form-payment-1' });

      const { container } = render(
        <MemoryRouter initialEntries={['/app/forms/new']}>
          <I18nProvider>
            <Routes>
              <Route path="/app/forms/new" element={<FormEditorPage />} />
            </Routes>
          </I18nProvider>
        </MemoryRouter>
      );

      fireEvent.change(screen.getByPlaceholderText(/Ví dụ: Đăng ký tư vấn lộ trình 1-1/i), {
        target: { value: 'Form thu tiền giữ chỗ' },
      });

      const enableCheckbox = screen.getByRole('checkbox', { name: /Bật thanh toán/i });
      fireEvent.click(enableCheckbox);

      fillPaymentFields(container);

      fireEvent.click(screen.getByRole('button', { name: /Lưu biểu mẫu/i }));

      await waitFor(() => expect(formAdminApi.createForm).toHaveBeenCalledTimes(1));
      const [payload] = formAdminApi.createForm.mock.calls[0];

      expect(payload.paymentConfig).toEqual({
        enabled: true,
        method: 'bank',
        amount: 150000,
        bankBin: '970436',
        accountNumber: '0123456789',
        accountName: 'Nguyen Van A',
        holdMinutes: 30,
      });
      expect(typeof payload.paymentConfig.amount).toBe('number');
      expect(typeof payload.paymentConfig.holdMinutes).toBe('number');
    });

    it('chủ tài khoản KHÔNG bật thanh toán: payload.paymentConfig: null (khoá vẫn có mặt)', async () => {
      formAdminApi.createForm.mockResolvedValue({ id: 'new-form-no-payment' });

      render(
        <MemoryRouter initialEntries={['/app/forms/new']}>
          <I18nProvider>
            <Routes>
              <Route path="/app/forms/new" element={<FormEditorPage />} />
            </Routes>
          </I18nProvider>
        </MemoryRouter>
      );

      fireEvent.change(screen.getByPlaceholderText(/Ví dụ: Đăng ký tư vấn lộ trình 1-1/i), {
        target: { value: 'Form không thu tiền' },
      });

      fireEvent.click(screen.getByRole('button', { name: /Lưu biểu mẫu/i }));

      await waitFor(() => expect(formAdminApi.createForm).toHaveBeenCalledTimes(1));
      const [payload] = formAdminApi.createForm.mock.calls[0];
      expect(payload).toHaveProperty('paymentConfig');
      expect(payload.paymentConfig).toBeNull();
    });

    it('form đang bật thanh toán rồi tắt lại trước khi lưu: payload.paymentConfig: null', async () => {
      const existingFormWithPayment = {
        ...existingForm,
        paymentConfig: {
          amount: 200000,
          bankBin: '970415',
          accountNumber: '9999999999',
          accountName: 'NGUYEN VAN B',
          holdMinutes: 45,
        },
      };
      formAdminApi.fetchFormById.mockResolvedValue(existingFormWithPayment);
      formAdminApi.updateForm.mockResolvedValue(existingFormWithPayment);

      render(
        <MemoryRouter initialEntries={['/app/forms/form-existing-456/edit']}>
          <I18nProvider>
            <Routes>
              <Route path="/app/forms/:id/edit" element={<FormEditorPage />} />
            </Routes>
          </I18nProvider>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByDisplayValue('Biểu mẫu khảo sát')).toBeInTheDocument();
      });

      // Dữ liệu paymentConfig cũ được nạp đúng vào state khi mở form đã có cấu hình
      const enableCheckbox = screen.getByRole('checkbox', { name: /Bật thanh toán/i });
      expect(enableCheckbox).toBeChecked();
      expect(screen.getByDisplayValue('200.000')).toBeInTheDocument();
      expect(screen.getByDisplayValue('NGUYEN VAN B')).toBeInTheDocument();

      fireEvent.click(enableCheckbox); // tắt lại

      fireEvent.click(screen.getByRole('button', { name: /Lưu biểu mẫu/i }));

      await waitFor(() => expect(formAdminApi.updateForm).toHaveBeenCalledTimes(1));
      const [, payload] = formAdminApi.updateForm.mock.calls[0];
      expect(payload.paymentConfig).toBeNull();
    });

    it('nhân viên: checkbox bật thanh toán bị disabled, thấy câu "Chỉ chủ tài khoản đổi được", và payload KHÔNG có khoá paymentConfig (kể cả null)', async () => {
      mockAuthState = { user: { id: 1 }, activeContext: { type: 'employee' } };
      const existingFormWithPayment = {
        ...existingForm,
        paymentConfig: {
          amount: 200000,
          bankBin: '970415',
          accountNumber: '9999999999',
          accountName: 'NGUYEN VAN B',
          holdMinutes: 45,
        },
      };
      formAdminApi.fetchFormById.mockResolvedValue(existingFormWithPayment);
      formAdminApi.updateForm.mockResolvedValue(existingFormWithPayment);

      render(
        <MemoryRouter initialEntries={['/app/forms/form-existing-456/edit']}>
          <I18nProvider>
            <Routes>
              <Route path="/app/forms/:id/edit" element={<FormEditorPage />} />
            </Routes>
          </I18nProvider>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByDisplayValue('Biểu mẫu khảo sát')).toBeInTheDocument();
      });

      const enableCheckbox = screen.getByRole('checkbox', { name: /Bật thanh toán/i });
      expect(enableCheckbox).toBeChecked();
      expect(enableCheckbox).toBeDisabled();
      expect(screen.getByText(/Chỉ chủ tài khoản đổi được thông tin nhận tiền/i)).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /Lưu biểu mẫu/i }));

      await waitFor(() => expect(formAdminApi.updateForm).toHaveBeenCalledTimes(1));
      const [, payload] = formAdminApi.updateForm.mock.calls[0];
      expect(payload).not.toHaveProperty('paymentConfig');
    });

    it('validate: bật thanh toán nhưng bỏ trống các trường bắt buộc -> báo lỗi, chặn lưu', async () => {
      render(
        <MemoryRouter initialEntries={['/app/forms/new']}>
          <I18nProvider>
            <Routes>
              <Route path="/app/forms/new" element={<FormEditorPage />} />
            </Routes>
          </I18nProvider>
        </MemoryRouter>
      );

      fireEvent.change(screen.getByPlaceholderText(/Ví dụ: Đăng ký tư vấn lộ trình 1-1/i), {
        target: { value: 'Form thiếu thông tin thanh toán' },
      });

      fireEvent.click(screen.getByRole('checkbox', { name: /Bật thanh toán/i }));
      fireEvent.click(screen.getByRole('button', { name: /Lưu biểu mẫu/i }));

      expect(formAdminApi.createForm).not.toHaveBeenCalled();
      expect(screen.getByText('Số tiền phải từ 1.000 đến 100.000.000 VND')).toBeInTheDocument();
      expect(screen.getByText('Vui lòng chọn ngân hàng')).toBeInTheDocument();
      expect(screen.getByText('Số tài khoản phải gồm 6-19 chữ số')).toBeInTheDocument();
      expect(screen.getByText('Vui lòng nhập tên chủ tài khoản')).toBeInTheDocument();
    });

    it('chọn MoMo, điền đủ thông tin hợp lệ: payload.paymentConfig có method momo, không có bankBin/accountNumber', async () => {
      formAdminApi.createForm.mockResolvedValue({ id: 'new-form-momo-1' });

      render(
        <MemoryRouter initialEntries={['/app/forms/new']}>
          <I18nProvider>
            <Routes>
              <Route path="/app/forms/new" element={<FormEditorPage />} />
            </Routes>
          </I18nProvider>
        </MemoryRouter>
      );

      fireEvent.change(screen.getByPlaceholderText(/Ví dụ: Đăng ký tư vấn lộ trình 1-1/i), {
        target: { value: 'Form thu tiền MoMo' },
      });

      const enableCheckbox = screen.getByRole('checkbox', { name: /Bật thanh toán/i });
      fireEvent.click(enableCheckbox);

      const momoRadio = screen.getByRole('radio', { name: /Ví MoMo/i });
      fireEvent.click(momoRadio);

      fireEvent.change(screen.getByPlaceholderText('Vd: 150.000'), {
        target: { value: '200000' },
      });
      fireEvent.change(screen.getByPlaceholderText('Vd: 0912345678'), {
        target: { value: '0912345678' },
      });
      fireEvent.change(screen.getByPlaceholderText(/NGUYEN VAN A/i), {
        target: { value: 'Nguyen Van MoMo' },
      });
      // PR-4 + Việc 4.0 đạt (25/09): form MoMo MỚI mặc định "Dùng số điện thoại MoMo" — chỉ cần SĐT + tên
      // như PR-3c, và QR dựng từ chính SĐT (BIN 971025). Mode "Nhập STK" xem ca ngay dưới.

      fireEvent.click(screen.getByRole('button', { name: /Lưu biểu mẫu/i }));

      await waitFor(() => expect(formAdminApi.createForm).toHaveBeenCalledTimes(1));
      const [payload] = formAdminApi.createForm.mock.calls[0];

      expect(payload.paymentConfig).toEqual({
        enabled: true,
        method: 'momo',
        amount: 200000,
        momoPhone: '0912345678',
        momoName: 'Nguyen Van MoMo',
        holdMinutes: 30,
        momoQrMode: 'phone',
        momoQrBin: '971025',
        momoQrAccount: '0912345678',
      });
      expect(payload.paymentConfig.bankBin).toBeUndefined();
      expect(payload.paymentConfig.accountNumber).toBeUndefined();
    });

    it('PR-4: chọn "Nhập số tài khoản" mà bỏ trống STK thì bị chặn; chọn "Không dùng QR" thì lưu được, payload không có khoá QR', async () => {
      formAdminApi.createForm.mockResolvedValue({ id: 'new-form-momo-2' });

      render(
        <MemoryRouter initialEntries={['/app/forms/new']}>
          <I18nProvider>
            <Routes>
              <Route path="/app/forms/new" element={<FormEditorPage />} />
            </Routes>
          </I18nProvider>
        </MemoryRouter>
      );

      fireEvent.change(screen.getByPlaceholderText(/Ví dụ: Đăng ký tư vấn lộ trình 1-1/i), {
        target: { value: 'Form MoMo không QR' },
      });
      fireEvent.click(screen.getByRole('checkbox', { name: /Bật thanh toán/i }));
      fireEvent.click(screen.getByRole('radio', { name: /Ví MoMo/i }));
      fireEvent.change(screen.getByPlaceholderText('Vd: 150.000'), { target: { value: '200000' } });
      fireEvent.change(screen.getByPlaceholderText('Vd: 0912345678'), { target: { value: '0912345678' } });
      fireEvent.change(screen.getByPlaceholderText(/NGUYEN VAN A/i), { target: { value: 'Nguyen Van MoMo' } });
      fireEvent.click(screen.getByRole('radio', { name: /Nhập số tài khoản MoMo/i }));

      fireEvent.click(screen.getByRole('button', { name: /Lưu biểu mẫu/i }));
      expect(await screen.findAllByText('Vui lòng nhập số tài khoản MoMo')).not.toHaveLength(0);
      expect(formAdminApi.createForm).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole('radio', { name: /Không dùng QR/i }));
      fireEvent.click(screen.getByRole('button', { name: /Lưu biểu mẫu/i }));

      await waitFor(() => expect(formAdminApi.createForm).toHaveBeenCalledTimes(1));
      const [payload] = formAdminApi.createForm.mock.calls[0];
      expect(payload.paymentConfig.momoQrMode).toBe('none');
      expect(payload.paymentConfig).not.toHaveProperty('momoQrBin');
      expect(payload.paymentConfig).not.toHaveProperty('momoQrAccount');
    });

    it('chọn MoMo bỏ trống số điện thoại hoặc tên: báo lỗi chặn lưu', async () => {
      render(
        <MemoryRouter initialEntries={['/app/forms/new']}>
          <I18nProvider>
            <Routes>
              <Route path="/app/forms/new" element={<FormEditorPage />} />
            </Routes>
          </I18nProvider>
        </MemoryRouter>
      );

      fireEvent.change(screen.getByPlaceholderText(/Ví dụ: Đăng ký tư vấn lộ trình 1-1/i), {
        target: { value: 'Form MoMo thiếu số' },
      });

      fireEvent.click(screen.getByRole('checkbox', { name: /Bật thanh toán/i }));
      fireEvent.click(screen.getByRole('radio', { name: /Ví MoMo/i }));
      fireEvent.change(screen.getByPlaceholderText('Vd: 150.000'), {
        target: { value: '200000' },
      });
      fireEvent.click(screen.getByRole('button', { name: /Lưu biểu mẫu/i }));

      expect(formAdminApi.createForm).not.toHaveBeenCalled();
      expect(
        screen.getByText('Số điện thoại MoMo phải gồm 10 chữ số (bắt đầu bằng 03, 05, 07, 08, 09)')
      ).toBeInTheDocument();
      expect(screen.getByText('Vui lòng nhập tên chủ ví MoMo')).toBeInTheDocument();
    });
  });

  /**
   * PLAN_FORM_DAT_LICH_THANH_TOAN_2026-09-13.md, PR-4b mục 6 — Khối "Giao diện".
   */
  describe('Giao diện (PR-4b)', () => {
    const existingFormWithTheme = {
      ...existingForm,
      theme: {
        primaryColor: '#111111',
        bannerKey: 'uploads/1/forms/banner_abc.png',
        bannerUrl: 'https://cdn.example.com/banner_abc.png',
      },
    };

    it('chỉ đổi màu chủ đạo (không đụng banner) -> payload.theme giữ NGUYÊN bannerKey cũ, KHÔNG có bannerUrl', async () => {
      formAdminApi.fetchFormById.mockResolvedValue(existingFormWithTheme);
      formAdminApi.updateForm.mockResolvedValue(existingFormWithTheme);

      render(
        <MemoryRouter initialEntries={['/app/forms/form-existing-456/edit']}>
          <I18nProvider>
            <Routes>
              <Route path="/app/forms/:id/edit" element={<FormEditorPage />} />
            </Routes>
          </I18nProvider>
        </MemoryRouter>
      );

      await waitFor(() => expect(screen.getByDisplayValue('Biểu mẫu khảo sát')).toBeInTheDocument());

      const primaryHexInput = screen.getByPlaceholderText('#DF5C0E');
      fireEvent.change(primaryHexInput, { target: { value: '#222222' } });

      fireEvent.click(screen.getByRole('button', { name: /Lưu biểu mẫu/i }));

      await waitFor(() => expect(formAdminApi.updateForm).toHaveBeenCalledTimes(1));
      const [, payload] = formAdminApi.updateForm.mock.calls[0];

      expect(payload.theme.primaryColor).toBe('#222222');
      expect(payload.theme.bannerKey).toBe('uploads/1/forms/banner_abc.png');
      expect(payload.theme).not.toHaveProperty('bannerUrl');
    });

    it('bấm "Gỡ ảnh" banner rồi lưu -> payload.theme KHÔNG có khoá bannerKey', async () => {
      formAdminApi.fetchFormById.mockResolvedValue(existingFormWithTheme);
      formAdminApi.updateForm.mockResolvedValue(existingFormWithTheme);

      render(
        <MemoryRouter initialEntries={['/app/forms/form-existing-456/edit']}>
          <I18nProvider>
            <Routes>
              <Route path="/app/forms/:id/edit" element={<FormEditorPage />} />
            </Routes>
          </I18nProvider>
        </MemoryRouter>
      );

      await waitFor(() => expect(screen.getByDisplayValue('Biểu mẫu khảo sát')).toBeInTheDocument());

      fireEvent.click(screen.getByRole('button', { name: 'Gỡ ảnh' }));
      fireEvent.click(screen.getByRole('button', { name: /Lưu biểu mẫu/i }));

      await waitFor(() => expect(formAdminApi.updateForm).toHaveBeenCalledTimes(1));
      const [, payload] = formAdminApi.updateForm.mock.calls[0];

      expect(payload.theme).not.toHaveProperty('bannerKey');
    });

    it('chọn mẫu dựng sẵn khi form đang có logoKey -> payload.theme GIỮ NGUYÊN logoKey (preset không có trường ảnh)', async () => {
      const formWithLogo = {
        ...existingForm,
        theme: {
          logoKey: 'uploads/1/forms/logo_xyz.png',
          logoUrl: 'https://cdn.example.com/logo_xyz.png',
        },
      };
      formAdminApi.fetchFormById.mockResolvedValue(formWithLogo);
      formAdminApi.updateForm.mockResolvedValue(formWithLogo);

      render(
        <MemoryRouter initialEntries={['/app/forms/form-existing-456/edit']}>
          <I18nProvider>
            <Routes>
              <Route path="/app/forms/:id/edit" element={<FormEditorPage />} />
            </Routes>
          </I18nProvider>
        </MemoryRouter>
      );

      await waitFor(() => expect(screen.getByDisplayValue('Biểu mẫu khảo sát')).toBeInTheDocument());

      fireEvent.click(screen.getByRole('button', { name: /Cổ điển/i }));
      fireEvent.click(screen.getByRole('button', { name: /Lưu biểu mẫu/i }));

      await waitFor(() => expect(formAdminApi.updateForm).toHaveBeenCalledTimes(1));
      const [, payload] = formAdminApi.updateForm.mock.calls[0];

      expect(payload.theme.logoKey).toBe('uploads/1/forms/logo_xyz.png');
      expect(payload.theme.preset).toBe('classic');
      expect(payload.theme.primaryColor).toBe('#DF5C0E');
    });

    it('tải banner lên -> gọi đúng 2 API (uploads/temp rồi forms/assets), xem trước hiện ảnh trả về', async () => {
      formAdminApi.createForm.mockResolvedValue({ id: 'new-form-theme-1' });
      formAdminApi.uploadFormTempFile.mockResolvedValue({
        tempId: 'temp-1',
        originalName: 'banner.png',
        contentType: 'image/png',
        size: 12345,
      });
      formAdminApi.uploadFormAsset.mockResolvedValue({
        storageKey: 'uploads/1/forms/new_banner.png',
        url: 'https://cdn.example.com/new_banner.png',
        sizeBytes: 12345,
      });

      const { container } = render(
        <MemoryRouter initialEntries={['/app/forms/new']}>
          <I18nProvider>
            <Routes>
              <Route path="/app/forms/new" element={<FormEditorPage />} />
            </Routes>
          </I18nProvider>
        </MemoryRouter>
      );

      const bannerFileInput = container.querySelectorAll('input[type="file"]')[0];
      const file = new File(['fake'], 'banner.png', { type: 'image/png' });
      fireEvent.change(bannerFileInput, { target: { files: [file] } });

      await waitFor(() => expect(formAdminApi.uploadFormTempFile).toHaveBeenCalledTimes(1));
      expect(formAdminApi.uploadFormTempFile).toHaveBeenCalledWith(file);

      await waitFor(() => expect(formAdminApi.uploadFormAsset).toHaveBeenCalledTimes(1));
      expect(formAdminApi.uploadFormAsset).toHaveBeenCalledWith({
        tempId: 'temp-1',
        originalName: 'banner.png',
        contentType: 'image/png',
        size: 12345,
      });

      await waitFor(() => {
        const previewImg = container.querySelector('img[src="https://cdn.example.com/new_banner.png"]');
        expect(previewImg).toBeTruthy();
      });
    });

    it('upload lỗi 413/STORAGE_QUOTA_EXCEEDED -> báo hết dung lượng, KHÔNG đổi ảnh đang hiển thị', async () => {
      formAdminApi.fetchFormById.mockResolvedValue(existingFormWithTheme);
      const quotaErr = new Error('quota exceeded');
      quotaErr.response = { status: 413, data: { code: 'STORAGE_QUOTA_EXCEEDED' } };
      formAdminApi.uploadFormTempFile.mockRejectedValue(quotaErr);

      const { container } = render(
        <MemoryRouter initialEntries={['/app/forms/form-existing-456/edit']}>
          <I18nProvider>
            <Routes>
              <Route path="/app/forms/:id/edit" element={<FormEditorPage />} />
            </Routes>
          </I18nProvider>
        </MemoryRouter>
      );

      await waitFor(() => expect(screen.getByDisplayValue('Biểu mẫu khảo sát')).toBeInTheDocument());
      // Ảnh banner cũ đang hiển thị từ trước (existingFormWithTheme.theme.bannerUrl)
      expect(container.querySelector('img[src="https://cdn.example.com/banner_abc.png"]')).toBeTruthy();

      const logoFileInput = container.querySelectorAll('input[type="file"]')[1];
      const file = new File(['fake'], 'logo.png', { type: 'image/png' });
      fireEvent.change(logoFileInput, { target: { files: [file] } });

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith(
          'Đã dùng hết dung lượng lưu trữ. Hãy xoá bớt tệp cũ hoặc nâng gói.'
        )
      );
      // Banner cũ vẫn còn nguyên — lỗi upload logo không đụng tới banner
      expect(container.querySelector('img[src="https://cdn.example.com/banner_abc.png"]')).toBeTruthy();
      expect(formAdminApi.uploadFormAsset).not.toHaveBeenCalled();
    });

    it('theme {} (form mới, chưa tuỳ chỉnh gì) -> payload.theme là object rỗng', async () => {
      formAdminApi.createForm.mockResolvedValue({ id: 'new-form-theme-empty' });

      render(
        <MemoryRouter initialEntries={['/app/forms/new']}>
          <I18nProvider>
            <Routes>
              <Route path="/app/forms/new" element={<FormEditorPage />} />
            </Routes>
          </I18nProvider>
        </MemoryRouter>
      );

      fireEvent.change(screen.getByPlaceholderText(/Ví dụ: Đăng ký tư vấn lộ trình 1-1/i), {
        target: { value: 'Form không tuỳ chỉnh giao diện' },
      });

      fireEvent.click(screen.getByRole('button', { name: /Lưu biểu mẫu/i }));

      await waitFor(() => expect(formAdminApi.createForm).toHaveBeenCalledTimes(1));
      const [payload] = formAdminApi.createForm.mock.calls[0];
      expect(payload.theme).toEqual({});
    });
  });
});
