import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { I18nProvider } from '../../../i18n';
import FormEditorPage from '../pages/FormEditorPage';
import * as formAdminApi from '../services/formAdminApi.service';

vi.mock('../services/formAdminApi.service', () => ({
  fetchFormById: vi.fn(),
  createForm: vi.fn(),
  updateForm: vi.fn(),
}));

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
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
});
