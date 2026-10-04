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

// Biểu mẫu MỚI bắt đầu bằng bước chọn mẫu — mẫu "Trống" cho trình soạn giống hệt trước khi có bước đó
// (1 ô Họ và tên, cài đặt mặc định), nên các ca không liên quan tới mẫu chỉ cần bấm qua nó.
const startBlankForm = () => fireEvent.click(screen.getByTestId('form-template-blank'));

// Các khối tuỳ chọn thu gọn mặc định (biểu mẫu chưa có dữ liệu ở đó): bấm thẻ mới mở. Biểu mẫu đang
// bật tính năng nào thì khối đó mở sẵn nên ca sửa biểu mẫu có cấu hình không cần các hàm này.
const openBookingBlock = () => fireEvent.click(screen.getByRole('button', { name: /Thêm đặt lịch hẹn/ }));
const openPaymentBlock = () => fireEvent.click(screen.getByRole('button', { name: /Thu tiền khi gửi/ }));
const openThemeBlock = () => fireEvent.click(screen.getByRole('button', { name: /^Giao diện/ }));
const openAfterSubmitBlock = () => fireEvent.click(screen.getByRole('button', { name: 'Sau khi gửi' }));

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
    localStorage.clear();
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

    // Chỉ đổi 1 trường trong "Sau khi gửi" (thu gọn mặc định, bấm mở): Chữ nút gửi
    openAfterSubmitBlock();
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

    startBlankForm();

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

      startBlankForm();

      fireEvent.change(screen.getByPlaceholderText(/Ví dụ: Đăng ký tư vấn lộ trình 1-1/i), {
        target: { value: 'Form đặt lịch mới' },
      });

      openBookingBlock();
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

      startBlankForm();

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

      startBlankForm();

      fireEvent.change(screen.getByPlaceholderText(/Ví dụ: Đăng ký tư vấn lộ trình 1-1/i), {
        target: { value: 'Form thu tiền giữ chỗ' },
      });

      openPaymentBlock();
      const enableCheckbox = screen.getByRole('checkbox', { name: /Bật thanh toán/i });
      fireEvent.click(enableCheckbox);

      fillPaymentFields(container);

      fireEvent.click(screen.getByRole('button', { name: /Lưu biểu mẫu/i }));

      await waitFor(() => expect(formAdminApi.createForm).toHaveBeenCalledTimes(1));
      const [payload] = formAdminApi.createForm.mock.calls[0];

      expect(payload.paymentConfig).toEqual({
        enabled: true,
        methods: ['bank'],
        method: 'bank',
        amount: 150000,
        bankBin: '970436',
        accountNumber: '0123456789',
        accountName: 'Nguyen Van A',
        holdMinutes: 30,
        purpose: 'hold',
      });
      expect(typeof payload.paymentConfig.amount).toBe('number');
      expect(typeof payload.paymentConfig.holdMinutes).toBe('number');
    });

    it('chọn "Thanh toán đơn hàng": payload.paymentConfig.purpose = order và nhãn thời hạn đổi theo', async () => {
      formAdminApi.createForm.mockResolvedValue({ id: 'new-form-payment-order' });

      const { container } = render(
        <MemoryRouter initialEntries={['/app/forms/new']}>
          <I18nProvider>
            <Routes>
              <Route path="/app/forms/new" element={<FormEditorPage />} />
            </Routes>
          </I18nProvider>
        </MemoryRouter>
      );

      startBlankForm();
      fireEvent.change(screen.getByPlaceholderText(/Ví dụ: Đăng ký tư vấn lộ trình 1-1/i), {
        target: { value: 'Form bán khoá học' },
      });
      openPaymentBlock();
      fireEvent.click(screen.getByRole('checkbox', { name: /Bật thanh toán/i }));
      fillPaymentFields(container);

      expect(screen.getByText('Giữ chỗ trong (phút)')).toBeInTheDocument();
      fireEvent.change(screen.getByLabelText('Khách thấy khoản tiền này là'), { target: { value: 'order' } });
      expect(screen.getByText('Thời hạn thanh toán (phút)')).toBeInTheDocument();
      expect(screen.queryByText('Giữ chỗ trong (phút)')).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /Lưu biểu mẫu/i }));

      await waitFor(() => expect(formAdminApi.createForm).toHaveBeenCalledTimes(1));
      const [payload] = formAdminApi.createForm.mock.calls[0];
      expect(payload.paymentConfig.purpose).toBe('order');
    });

    it('mở biểu mẫu cũ không có purpose -> ô chọn hiện "Giữ chỗ" và lưu lại purpose hold', async () => {
      const oldForm = {
        ...existingForm,
        paymentConfig: {
          enabled: true,
          methods: ['bank'],
          method: 'bank',
          amount: 200000,
          bankBin: '970415',
          accountNumber: '9999999999',
          accountName: 'NGUYEN VAN B',
          holdMinutes: 45,
        },
      };
      formAdminApi.fetchFormById.mockResolvedValue(oldForm);
      formAdminApi.updateForm.mockResolvedValue(oldForm);

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
      expect(screen.getByLabelText('Khách thấy khoản tiền này là')).toHaveValue('hold');

      fireEvent.click(screen.getByRole('button', { name: /Lưu biểu mẫu/i }));
      await waitFor(() => expect(formAdminApi.updateForm).toHaveBeenCalledTimes(1));
      const [, payload] = formAdminApi.updateForm.mock.calls[0];
      expect(payload.paymentConfig.purpose).toBe('hold');
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

      startBlankForm();

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

      startBlankForm();

      fireEvent.change(screen.getByPlaceholderText(/Ví dụ: Đăng ký tư vấn lộ trình 1-1/i), {
        target: { value: 'Form thiếu thông tin thanh toán' },
      });

      openPaymentBlock();
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

      startBlankForm();

      fireEvent.change(screen.getByPlaceholderText(/Ví dụ: Đăng ký tư vấn lộ trình 1-1/i), {
        target: { value: 'Form thu tiền MoMo' },
      });

      openPaymentBlock();
      const enableCheckbox = screen.getByRole('checkbox', { name: /Bật thanh toán/i });
      fireEvent.click(enableCheckbox);

      const bankCheckbox = screen.getByRole('checkbox', { name: /Chuyển khoản ngân hàng/i });
      fireEvent.click(bankCheckbox);

      const momoCheckbox = screen.getByRole('checkbox', { name: /Ví MoMo/i });
      fireEvent.click(momoCheckbox);

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
        methods: ['momo'],
        method: 'momo',
        amount: 200000,
        momoPhone: '0912345678',
        momoName: 'Nguyen Van MoMo',
        holdMinutes: 30,
        purpose: 'hold',
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

      startBlankForm();

      fireEvent.change(screen.getByPlaceholderText(/Ví dụ: Đăng ký tư vấn lộ trình 1-1/i), {
        target: { value: 'Form MoMo không QR' },
      });
      openPaymentBlock();
      fireEvent.click(screen.getByRole('checkbox', { name: /Bật thanh toán/i }));
      fireEvent.click(screen.getByRole('checkbox', { name: /Chuyển khoản ngân hàng/i }));
      fireEvent.click(screen.getByRole('checkbox', { name: /Ví MoMo/i }));
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

      startBlankForm();

      fireEvent.change(screen.getByPlaceholderText(/Ví dụ: Đăng ký tư vấn lộ trình 1-1/i), {
        target: { value: 'Form MoMo thiếu số' },
      });

      openPaymentBlock();
      fireEvent.click(screen.getByRole('checkbox', { name: /Bật thanh toán/i }));
      fireEvent.click(screen.getByRole('checkbox', { name: /Chuyển khoản ngân hàng/i }));
      fireEvent.click(screen.getByRole('checkbox', { name: /Ví MoMo/i }));
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

    it('V6: chủ tài khoản chọn CẢ HAI phương thức (Bank VÀ MoMo): payload lưu đủ cả 2 nhóm trường, methods: ["bank", "momo"]', async () => {
      formAdminApi.createForm.mockResolvedValue({ id: 'new-form-dual-payment' });
      const { container } = render(
        <MemoryRouter initialEntries={['/app/forms/new']}>
          <I18nProvider>
            <Routes>
              <Route path="/app/forms/new" element={<FormEditorPage />} />
            </Routes>
          </I18nProvider>
        </MemoryRouter>
      );

      startBlankForm();

      fireEvent.change(screen.getByPlaceholderText(/Ví dụ: Đăng ký tư vấn lộ trình 1-1/i), {
        target: { value: 'Form nhận cả 2 kênh' },
      });
      openPaymentBlock();
      fireEvent.click(screen.getByRole('checkbox', { name: /Bật thanh toán/i }));
      // Điền thông tin Bank trước khi bật MoMo (để không trùng placeholder)
      fillPaymentFields(container);

      // Bank đã được tick sẵn, tick thêm MoMo
      fireEvent.click(screen.getByRole('checkbox', { name: /Ví MoMo/i }));

      // Điền thêm thông tin MoMo
      fireEvent.change(screen.getByPlaceholderText('Vd: 0912345678'), {
        target: { value: '0988888888' },
      });
      const nameInputs = screen.getAllByPlaceholderText(/NGUYEN VAN A/i);
      fireEvent.change(nameInputs[1], {
        target: { value: 'NGUYEN VAN MOMO' },
      });

      fireEvent.click(screen.getByRole('button', { name: /Lưu biểu mẫu/i }));

      await waitFor(() => expect(formAdminApi.createForm).toHaveBeenCalledTimes(1));
      const [payload] = formAdminApi.createForm.mock.calls[0];

      expect(payload.paymentConfig).toEqual({
        enabled: true,
        methods: ['bank', 'momo'],
        method: 'bank',
        amount: 150000,
        bankBin: '970436',
        accountNumber: '0123456789',
        accountName: 'Nguyen Van A',
        momoPhone: '0988888888',
        momoName: 'NGUYEN VAN MOMO',
        holdMinutes: 30,
        purpose: 'hold',
        momoQrMode: 'phone',
        momoQrBin: '971025',
        momoQrAccount: '0988888888',
      });
    });

    it('V6: bỏ chọn cả hai phương thức thanh toán: báo lỗi và chặn lưu', async () => {
      render(
        <MemoryRouter initialEntries={['/app/forms/new']}>
          <I18nProvider>
            <Routes>
              <Route path="/app/forms/new" element={<FormEditorPage />} />
            </Routes>
          </I18nProvider>
        </MemoryRouter>
      );

      startBlankForm();

      fireEvent.change(screen.getByPlaceholderText(/Ví dụ: Đăng ký tư vấn lộ trình 1-1/i), {
        target: { value: 'Form không chọn kênh nào' },
      });
      openPaymentBlock();
      fireEvent.click(screen.getByRole('checkbox', { name: /Bật thanh toán/i }));
      // Bỏ tick Bank
      fireEvent.click(screen.getByRole('checkbox', { name: /Chuyển khoản ngân hàng/i }));

      fireEvent.click(screen.getByRole('button', { name: /Lưu biểu mẫu/i }));

      expect(formAdminApi.createForm).not.toHaveBeenCalled();
      expect(
        screen.getByText('Vui lòng chọn ít nhất một phương thức thanh toán')
      ).toBeInTheDocument();
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

      startBlankForm();
      openThemeBlock();

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

      startBlankForm();

      fireEvent.change(screen.getByPlaceholderText(/Ví dụ: Đăng ký tư vấn lộ trình 1-1/i), {
        target: { value: 'Form không tuỳ chỉnh giao diện' },
      });

      fireEvent.click(screen.getByRole('button', { name: /Lưu biểu mẫu/i }));

      await waitFor(() => expect(formAdminApi.createForm).toHaveBeenCalledTimes(1));
      const [payload] = formAdminApi.createForm.mock.calls[0];
      expect(payload.theme).toEqual({});
    });
  });

  describe('Bước chọn mẫu khi tạo biểu mẫu mới', () => {
    const renderNewForm = () =>
      render(
        <MemoryRouter initialEntries={['/app/forms/new']}>
          <I18nProvider>
            <Routes>
              <Route path="/app/forms/new" element={<FormEditorPage />} />
            </Routes>
          </I18nProvider>
        </MemoryRouter>
      );

    const typeTitleAndSave = async (title) => {
      fireEvent.change(screen.getByPlaceholderText(/Ví dụ: Đăng ký tư vấn lộ trình 1-1/i), {
        target: { value: title },
      });
      fireEvent.click(screen.getByRole('button', { name: /Lưu biểu mẫu/i }));
      await waitFor(() => expect(formAdminApi.createForm).toHaveBeenCalledTimes(1));
      return formAdminApi.createForm.mock.calls[0][0];
    };

    it('biểu mẫu MỚI hiện bước chọn mẫu đủ 5 mẫu, chưa có trình soạn (không có nút Lưu biểu mẫu)', () => {
      renderNewForm();

      for (const id of ['consult', 'booking', 'payment', 'survey', 'blank']) {
        expect(screen.getByTestId(`form-template-${id}`)).toBeInTheDocument();
      }
      expect(screen.getByRole('button', { name: /Đăng ký tư vấn/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Đặt lịch hẹn/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Thu tiền \/ đặt cọc/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Khảo sát/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Trống/ })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Lưu biểu mẫu/i })).not.toBeInTheDocument();
    });

    it('SỬA biểu mẫu cũ thì KHÔNG hiện bước chọn mẫu', async () => {
      formAdminApi.fetchFormById.mockResolvedValue(existingForm);

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
      expect(screen.queryByTestId('form-template-picker')).not.toBeInTheDocument();
      expect(screen.queryByTestId('form-template-blank')).not.toBeInTheDocument();
    });

    it('"Trống": giống hệt biểu mẫu mới cũ — 1 ô Họ và tên (role name, bắt buộc), không đặt lịch, không thu tiền', async () => {
      formAdminApi.createForm.mockResolvedValue({ id: 'new-blank' });
      renderNewForm();
      startBlankForm();

      const payload = await typeTitleAndSave('Biểu mẫu trống');
      expect(payload.fields).toEqual([{ label: 'Họ và tên', type: 'short_text', required: true, role: 'name' }]);
      expect(payload.bookingConfig).toBeNull();
      expect(payload.paymentConfig).toBeNull();
      expect(payload.settings.notifyOwner).toBe(true);
      expect(payload.settings.sendConfirmation).toBe(false);
    });

    it('"Đăng ký tư vấn": Họ tên + SĐT bắt buộc, Email + Lời nhắn tuỳ chọn, đúng role; không đặt lịch, không thu tiền', async () => {
      formAdminApi.createForm.mockResolvedValue({ id: 'new-consult' });
      renderNewForm();
      fireEvent.click(screen.getByTestId('form-template-consult'));

      const payload = await typeTitleAndSave('Đăng ký tư vấn 1-1');
      expect(payload.fields).toEqual([
        { label: 'Họ và tên', type: 'short_text', required: true, role: 'name' },
        { label: 'Số điện thoại', type: 'phone', required: true, role: 'phone' },
        { label: 'Địa chỉ Email', type: 'email', required: false, role: 'email' },
        { label: 'Lời nhắn', type: 'long_text', required: false },
      ]);
      expect(payload.bookingConfig).toBeNull();
      expect(payload.paymentConfig).toBeNull();
      // Đủ 6 khoá settings; mẫu KHÔNG tự bật ô đồng ý tiếp thị.
      expect(payload.settings).toEqual({
        notifyOwner: true,
        consentEnabled: false,
        sendConfirmation: false,
        submitButtonText: 'Gửi đăng ký',
        successMessage: 'Cảm ơn bạn đã đăng ký. Chúng tôi sẽ liên hệ lại với bạn sớm.',
        redirectUrl: null,
      });
    });

    it('"Đặt lịch hẹn": bật sẵn Đặt lịch với khung giờ mẫu T2–T6 (lưu ngay được), Email bắt buộc + bật gửi xác nhận', async () => {
      formAdminApi.createForm.mockResolvedValue({ id: 'new-booking' });
      renderNewForm();
      fireEvent.click(screen.getByTestId('form-template-booking'));

      // Khối Đặt lịch hẹn đã mở và đã bật.
      expect(screen.getByRole('checkbox', { name: /Bật đặt lịch hẹn/i })).toBeChecked();

      const payload = await typeTitleAndSave('Đặt lịch tư vấn');
      expect(payload.bookingConfig).toEqual({
        enabled: true,
        weeklySlots: {
          0: [],
          1: ['09:00', '14:00'],
          2: ['09:00', '14:00'],
          3: ['09:00', '14:00'],
          4: ['09:00', '14:00'],
          5: ['09:00', '14:00'],
          6: [],
        },
        slotCapacity: null,
        daysAhead: 30,
        minNoticeMinutes: 60,
        closedDates: [],
      });
      expect(payload.paymentConfig).toBeNull();
      expect(payload.fields.map((f) => [f.type, f.role, f.required])).toEqual([
        ['short_text', 'name', true],
        ['phone', 'phone', true],
        ['email', 'email', true],
        ['long_text', undefined, false],
      ]);
      expect(payload.settings.sendConfirmation).toBe(true);
      expect(payload.settings.submitButtonText).toBe('Đặt lịch');
    });

    it('"Thu tiền / đặt cọc": bật sẵn Thanh toán, chưa có số tiền nên lưu bị chặn tới khi khai đủ rồi lưu đúng đường cũ', async () => {
      formAdminApi.createForm.mockResolvedValue({ id: 'new-payment' });
      renderNewForm();
      fireEvent.click(screen.getByTestId('form-template-payment'));

      expect(screen.getByRole('checkbox', { name: /Bật thanh toán/i })).toBeChecked();

      fireEvent.change(screen.getByPlaceholderText(/Ví dụ: Đăng ký tư vấn lộ trình 1-1/i), {
        target: { value: 'Đặt cọc khoá học' },
      });
      // Chưa khai số tiền / ngân hàng -> validate cũ chặn, không gọi API.
      fireEvent.click(screen.getByRole('button', { name: /Lưu biểu mẫu/i }));
      expect(formAdminApi.createForm).not.toHaveBeenCalled();
      expect(screen.getByText('Số tiền phải từ 1.000 đến 100.000.000 VND')).toBeInTheDocument();

      fireEvent.change(screen.getByPlaceholderText('Vd: 150.000'), { target: { value: '500000' } });
      const bankSelect = screen.getByText('Ngân hàng').closest('div').querySelector('select');
      fireEvent.change(bankSelect, { target: { value: '970436' } });
      fireEvent.change(
        screen.getByText('Số tài khoản').closest('div').querySelector('input'),
        { target: { value: '0123456789' } }
      );
      fireEvent.change(screen.getByPlaceholderText(/NGUYEN VAN A/i), { target: { value: 'Nguyen Van A' } });
      fireEvent.click(screen.getByRole('button', { name: /Lưu biểu mẫu/i }));

      await waitFor(() => expect(formAdminApi.createForm).toHaveBeenCalledTimes(1));
      const [payload] = formAdminApi.createForm.mock.calls[0];
      expect(payload.paymentConfig).toEqual({
        enabled: true,
        methods: ['bank'],
        method: 'bank',
        amount: 500000,
        bankBin: '970436',
        accountNumber: '0123456789',
        accountName: 'Nguyen Van A',
        holdMinutes: 30,
        purpose: 'hold',
      });
      expect(payload.bookingConfig).toBeNull();
      expect(payload.settings.sendConfirmation).toBe(true);
    });

    it('"Thu tiền / đặt cọc": nhân viên không chọn được (nút bị khoá, có câu giải thích) vì không gửi được paymentConfig', () => {
      mockAuthState = { user: { id: 1 }, activeContext: { type: 'employee' } };
      renderNewForm();

      const card = screen.getByTestId('form-template-payment');
      expect(card).toBeDisabled();
      expect(screen.getByText(/Chỉ chủ tài khoản đổi được thông tin nhận tiền/i)).toBeInTheDocument();
      fireEvent.click(card);
      // Vẫn ở bước chọn mẫu.
      expect(screen.getByTestId('form-template-picker')).toBeInTheDocument();
      // Các mẫu còn lại vẫn dùng được.
      expect(screen.getByTestId('form-template-booking')).not.toBeDisabled();
    });

    it('"Khảo sát": vài câu trắc nghiệm — radio/checkbox có đủ lựa chọn, câu 1-2 bắt buộc, không có role', async () => {
      formAdminApi.createForm.mockResolvedValue({ id: 'new-survey' });
      renderNewForm();
      fireEvent.click(screen.getByTestId('form-template-survey'));

      const payload = await typeTitleAndSave('Khảo sát hài lòng');
      expect(payload.fields.map((f) => [f.type, f.required])).toEqual([
        ['radio', true],
        ['radio', true],
        ['checkbox', false],
        ['long_text', false],
      ]);
      expect(payload.fields[0].options).toEqual(['Facebook', 'Zalo', 'Bạn bè giới thiệu', 'Khác']);
      expect(payload.fields[2].options).toHaveLength(4);
      expect(payload.fields.every((f) => f.role === undefined)).toBe(true);
      expect(payload.bookingConfig).toBeNull();
      expect(payload.paymentConfig).toBeNull();
    });
  });

  describe('Thu gọn mặc định các khối tuỳ chọn', () => {
    const renderEdit = (form) => {
      formAdminApi.fetchFormById.mockResolvedValue(form);
      return render(
        <MemoryRouter initialEntries={['/app/forms/form-existing-456/edit']}>
          <I18nProvider>
            <Routes>
              <Route path="/app/forms/:id/edit" element={<FormEditorPage />} />
            </Routes>
          </I18nProvider>
        </MemoryRouter>
      );
    };
    const waitLoaded = () =>
      waitFor(() => {
        expect(screen.getByDisplayValue('Biểu mẫu khảo sát')).toBeInTheDocument();
      });

    it('biểu mẫu chưa có gì ở Đặt lịch / Thanh toán / Giao diện: chỉ hiện thẻ thu gọn, chưa có ô nhập nào của các khối đó', () => {
      render(
        <MemoryRouter initialEntries={['/app/forms/new']}>
          <I18nProvider>
            <Routes>
              <Route path="/app/forms/new" element={<FormEditorPage />} />
            </Routes>
          </I18nProvider>
        </MemoryRouter>
      );
      startBlankForm();

      expect(screen.getByRole('button', { name: /Thêm đặt lịch hẹn/ })).toHaveAttribute('aria-expanded', 'false');
      expect(screen.getByRole('button', { name: /Thu tiền khi gửi/ })).toHaveAttribute('aria-expanded', 'false');
      expect(screen.getByRole('button', { name: /^Giao diện/ })).toHaveAttribute('aria-expanded', 'false');

      expect(screen.queryByRole('checkbox', { name: /Bật đặt lịch hẹn/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('checkbox', { name: /Bật thanh toán/i })).not.toBeInTheDocument();
      expect(screen.queryByText('Mẫu dựng sẵn')).not.toBeInTheDocument();
    });

    it('bấm thẻ "Thêm đặt lịch hẹn" mở khối (chưa tự bật), thẻ thu gọn biến mất', () => {
      render(
        <MemoryRouter initialEntries={['/app/forms/new']}>
          <I18nProvider>
            <Routes>
              <Route path="/app/forms/new" element={<FormEditorPage />} />
            </Routes>
          </I18nProvider>
        </MemoryRouter>
      );
      startBlankForm();

      openBookingBlock();

      expect(screen.getByRole('checkbox', { name: /Bật đặt lịch hẹn/i })).not.toBeChecked();
      expect(screen.queryByRole('button', { name: /Thêm đặt lịch hẹn/ })).not.toBeInTheDocument();
      // Các khối khác vẫn thu gọn.
      expect(screen.getByRole('button', { name: /Thu tiền khi gửi/ })).toBeInTheDocument();
    });

    it('sửa biểu mẫu CÓ thanh toán: khối Thanh toán mở sẵn; Đặt lịch + Giao diện (không dữ liệu) vẫn thu gọn', async () => {
      renderEdit({
        ...existingForm,
        paymentConfig: {
          amount: 200000,
          bankBin: '970415',
          accountNumber: '9999999999',
          accountName: 'NGUYEN VAN B',
          holdMinutes: 45,
        },
      });
      await waitLoaded();

      expect(screen.getByRole('checkbox', { name: /Bật thanh toán/i })).toBeChecked();
      expect(screen.queryByRole('button', { name: /Thu tiền khi gửi/ })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Thêm đặt lịch hẹn/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^Giao diện/ })).toBeInTheDocument();
    });

    it('sửa biểu mẫu CÓ đặt lịch: khối Đặt lịch mở sẵn, Thanh toán thu gọn', async () => {
      renderEdit({
        ...existingForm,
        bookingConfig: {
          enabled: true,
          weeklySlots: { 1: ['09:00'] },
          slotCapacity: null,
          daysAhead: 30,
          minNoticeMinutes: 60,
          closedDates: [],
        },
      });
      await waitLoaded();

      expect(screen.getByRole('checkbox', { name: /Bật đặt lịch hẹn/i })).toBeChecked();
      expect(screen.queryByRole('button', { name: /Thêm đặt lịch hẹn/ })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Thu tiền khi gửi/ })).toBeInTheDocument();
    });

    it('sửa biểu mẫu ĐÃ tuỳ chỉnh giao diện: khối Giao diện mở sẵn (thấy "Mẫu dựng sẵn")', async () => {
      renderEdit({ ...existingForm, theme: { primaryColor: '#112233' } });
      await waitLoaded();

      expect(screen.getByText('Mẫu dựng sẵn')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^Giao diện/ })).not.toBeInTheDocument();
    });

    it('"Sau khi gửi" thu gọn mặc định kèm dòng tóm tắt; bấm mở thấy các ô cài đặt, bấm lại thì thu gọn', async () => {
      renderEdit(existingForm);
      await waitLoaded();

      const toggle = screen.getByRole('button', { name: 'Sau khi gửi' });
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
      // existingForm: có redirectUrl + notifyOwner + consentEnabled, không gửi xác nhận.
      expect(screen.getByTestId('after-submit-summary')).toHaveTextContent(
        'Chuyển khách sang trang khác · báo email cho bạn · có ô đồng ý nhận tin'
      );
      expect(screen.queryByDisplayValue('Gửi khảo sát')).not.toBeInTheDocument();

      fireEvent.click(toggle);
      expect(toggle).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByDisplayValue('Gửi khảo sát')).toBeInTheDocument();
      expect(screen.queryByTestId('after-submit-summary')).not.toBeInTheDocument();

      fireEvent.click(toggle);
      expect(screen.queryByDisplayValue('Gửi khảo sát')).not.toBeInTheDocument();
    });

    it('biểu mẫu mới: dòng tóm tắt mặc định "Hiện lời cảm ơn · báo email cho bạn"', () => {
      render(
        <MemoryRouter initialEntries={['/app/forms/new']}>
          <I18nProvider>
            <Routes>
              <Route path="/app/forms/new" element={<FormEditorPage />} />
            </Routes>
          </I18nProvider>
        </MemoryRouter>
      );
      startBlankForm();

      expect(screen.getByTestId('after-submit-summary')).toHaveTextContent('Hiện lời cảm ơn · báo email cho bạn');
    });

    it('lưu lỗi vì ô nằm trong "Sau khi gửi" đang thu gọn: khối tự mở ra để thấy ô lỗi, không gọi API', async () => {
      renderEdit(existingForm);
      await waitLoaded();

      // Nhập đường dẫn sai rồi thu gọn khối lại.
      openAfterSubmitBlock();
      fireEvent.change(screen.getByDisplayValue('https://example.com/thanks'), { target: { value: 'khong-phai-url' } });
      openAfterSubmitBlock(); // thu gọn
      expect(screen.queryByDisplayValue('khong-phai-url')).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /Lưu biểu mẫu/i }));

      expect(formAdminApi.updateForm).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: 'Sau khi gửi' })).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByText('Đường dẫn không hợp lệ')).toBeInTheDocument();
    });
  });

  describe('Hàng "Thêm nhanh" trường', () => {
    const COMMON = ['Họ và tên', 'Địa chỉ Email', 'Số điện thoại', 'Văn bản ngắn'];
    const OTHERS = ['Đoạn văn dài', 'Trắc nghiệm đơn', 'Hộp kiểm', 'Menu thả xuống', 'Ngày / Thời gian'];
    const quickBtn = (name) => screen.queryByRole('button', { name });

    const renderBlankForm = () => {
      render(
        <MemoryRouter initialEntries={['/app/forms/new']}>
          <I18nProvider>
            <Routes>
              <Route path="/app/forms/new" element={<FormEditorPage />} />
            </Routes>
          </I18nProvider>
        </MemoryRouter>
      );
      startBlankForm();
    };

    it('mặc định chỉ 4 loại hay dùng + nút "Loại khác…"; 5 loại còn lại chưa hiện', () => {
      renderBlankForm();

      for (const name of COMMON) expect(quickBtn(name)).toBeInTheDocument();
      for (const name of OTHERS) expect(quickBtn(name)).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Loại khác…' })).toHaveAttribute('aria-expanded', 'false');
    });

    it('bấm "Loại khác…" mở đủ 9 loại (không bỏ loại nào); bấm "Ẩn bớt" thì thu lại còn 4', () => {
      renderBlankForm();

      fireEvent.click(screen.getByRole('button', { name: 'Loại khác…' }));
      for (const name of [...COMMON, ...OTHERS]) expect(quickBtn(name)).toBeInTheDocument();
      expect(COMMON.length + OTHERS.length).toBe(9);

      fireEvent.click(screen.getByRole('button', { name: 'Ẩn bớt' }));
      for (const name of OTHERS) expect(quickBtn(name)).not.toBeInTheDocument();
      for (const name of COMMON) expect(quickBtn(name)).toBeInTheDocument();
    });

    it('thêm một loại nằm sau "Loại khác…" (Trắc nghiệm đơn) vẫn ra đúng trường radio có 2 lựa chọn mẫu', async () => {
      formAdminApi.createForm.mockResolvedValue({ id: 'new-quick-radio' });
      renderBlankForm();

      fireEvent.click(screen.getByRole('button', { name: 'Loại khác…' }));
      fireEvent.click(screen.getByRole('button', { name: 'Trắc nghiệm đơn' }));

      fireEvent.change(screen.getByPlaceholderText(/Ví dụ: Đăng ký tư vấn lộ trình 1-1/i), {
        target: { value: 'Form có trắc nghiệm' },
      });
      fireEvent.click(screen.getByRole('button', { name: /Lưu biểu mẫu/i }));

      await waitFor(() => expect(formAdminApi.createForm).toHaveBeenCalledTimes(1));
      const [payload] = formAdminApi.createForm.mock.calls[0];
      expect(payload.fields).toHaveLength(2);
      expect(payload.fields[1]).toEqual({
        label: 'Trắc nghiệm đơn',
        type: 'radio',
        required: false,
        options: ['Lựa chọn 1', 'Lựa chọn 2'],
      });
    });
  });
});
