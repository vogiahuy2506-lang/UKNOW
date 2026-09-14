import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { I18nProvider } from '../../../i18n';
import FormSubmissionsPage from '../pages/FormSubmissionsPage';
import * as formAdminApi from '../services/formAdminApi.service';

vi.mock('../services/formAdminApi.service', () => ({
  fetchFormById: vi.fn(),
  fetchFormSubmissions: vi.fn(),
  cancelSubmission: vi.fn(),
}));

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('FormSubmissionsPage component', () => {
  const mockForm = {
    id: 'form-sub-123',
    title: 'Biểu mẫu thu thập thông tin sự kiện',
    fields: [
      { key: 'f_name', label: 'Tên hiện tại (đã đổi)', type: 'short_text' },
      { key: 'f_new_field', label: 'Trường mới thêm sau này', type: 'short_text' },
    ],
  };

  const mockSubmissionsPage1 = {
    submissions: [
      {
        id: 'sub-001',
        respondentName: 'Trần Văn Snapshot',
        respondentEmail: 'snapshot@example.com',
        respondentPhone: '0987654321',
        marketingConsent: true,
        createdAt: '2026-09-14T08:00:00.000Z',
        // answers được lưu dưới dạng snapshot { [key]: { label, type, value } }
        answers: {
          f_name: {
            label: 'Họ tên lúc nộp (nhãn cũ)',
            type: 'short_text',
            value: 'Trần Văn Snapshot',
          },
          f_deleted_field: {
            label: 'Trường cũ đã bị chủ form xoá khỏi form sau đó',
            type: 'short_text',
            value: 'Dữ liệu của trường đã xoá',
          },
        },
      },
      {
        id: 'sub-002',
        respondentName: 'Nguyễn Không Đồng Ý',
        respondentEmail: 'no-consent@example.com',
        respondentPhone: null,
        marketingConsent: false,
        createdAt: '2026-09-14T08:15:00.000Z',
        answers: {
          f_name: {
            label: 'Họ tên lúc nộp (nhãn cũ)',
            type: 'short_text',
            value: 'Nguyễn Không Đồng Ý',
          },
        },
      },
      {
        id: 'sub-003',
        respondentName: 'Lê Chưa Chọn',
        respondentEmail: null,
        respondentPhone: null,
        marketingConsent: null, // Form không bật consent
        createdAt: '2026-09-14T08:30:00.000Z',
        answers: {},
      },
    ],
    total: 25,
    page: 1,
    pageSize: 20,
    totalPages: 2,
  };

  const mockSubmissionsPage2 = {
    submissions: [
      {
        id: 'sub-004',
        respondentName: 'Phạm Trang Hai',
        respondentEmail: 'page2@example.com',
        marketingConsent: true,
        createdAt: '2026-09-14T09:00:00.000Z',
        answers: {
          f_name: {
            label: 'Họ tên lúc nộp (nhãn cũ)',
            type: 'short_text',
            value: 'Phạm Trang Hai',
          },
        },
      },
    ],
    total: 25,
    page: 2,
    pageSize: 20,
    totalPages: 2,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('hiển thị nhãn câu trả lời theo snapshot label trong bài nộp thay vì form definition hiện tại', async () => {
    formAdminApi.fetchFormById.mockResolvedValue(mockForm);
    formAdminApi.fetchFormSubmissions.mockResolvedValue(mockSubmissionsPage1);

    render(
      <MemoryRouter initialEntries={['/app/forms/form-sub-123/submissions']}>
        <I18nProvider>
          <Routes>
            <Route path="/app/forms/:id/submissions" element={<FormSubmissionsPage />} />
          </Routes>
        </I18nProvider>
      </MemoryRouter>
    );

    // Chờ dữ liệu load xong
    await waitFor(() => {
      expect(screen.getByText('snapshot@example.com')).toBeInTheDocument();
    });

    // Nhãn được hiển thị phải là nhãn snapshot được lưu lúc nộp:
    // "Họ tên lúc nộp (nhãn cũ)" chứ KHÔNG phải "Tên hiện tại (đã đổi)"
    expect(screen.getAllByText(/Họ tên lúc nộp \(nhãn cũ\):/i)).toHaveLength(2);
    expect(screen.queryByText(/Tên hiện tại \(đã đổi\):/i)).not.toBeInTheDocument();

    // Trường đã bị chủ form xoá sau này vẫn hiển thị đúng nhãn và giá trị đã lưu trong snapshot
    expect(screen.getByText(/Trường cũ đã bị chủ form xoá khỏi form sau đó:/i)).toBeInTheDocument();
    expect(screen.getByText('Dữ liệu của trường đã xoá')).toBeInTheDocument();
  });

  it('hiển thị đúng trạng thái cột đồng ý tiếp thị: true -> Có, false -> Không, null/undefined -> —', async () => {
    formAdminApi.fetchFormById.mockResolvedValue(mockForm);
    formAdminApi.fetchFormSubmissions.mockResolvedValue(mockSubmissionsPage1);

    render(
      <MemoryRouter initialEntries={['/app/forms/form-sub-123/submissions']}>
        <I18nProvider>
          <Routes>
            <Route path="/app/forms/:id/submissions" element={<FormSubmissionsPage />} />
          </Routes>
        </I18nProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('snapshot@example.com')).toBeInTheDocument();
    });

    // Có (marketingConsent = true)
    expect(screen.getByText('Có')).toBeInTheDocument();

    // Không (marketingConsent = false)
    expect(screen.getByText('Không')).toBeInTheDocument();

    // — (marketingConsent = null/undefined)
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThanOrEqual(1);
  });

  it('phân trang theo totalPages và chuyển trang thành công', async () => {
    formAdminApi.fetchFormById.mockResolvedValue(mockForm);
    formAdminApi.fetchFormSubmissions
      .mockResolvedValueOnce(mockSubmissionsPage1)
      .mockResolvedValueOnce(mockSubmissionsPage2);

    render(
      <MemoryRouter initialEntries={['/app/forms/form-sub-123/submissions']}>
        <I18nProvider>
          <Routes>
            <Route path="/app/forms/:id/submissions" element={<FormSubmissionsPage />} />
          </Routes>
        </I18nProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('snapshot@example.com')).toBeInTheDocument();
    });

    // Bấm nút chuyển trang tiếp theo
    const nextBtn = screen.getByRole('button', { name: /Trang sau/i });
    fireEvent.click(nextBtn);

    await waitFor(() => {
      expect(formAdminApi.fetchFormSubmissions).toHaveBeenCalledWith('form-sub-123', {
        page: 2,
        pageSize: 20,
      });
      expect(screen.getByText('page2@example.com')).toBeInTheDocument();
    });
  });

  it('xếp câu trả lời theo thứ tự fields của form hiện tại, trường đã xoá xếp sau cùng (Postgres JSONB lộn khoá)', async () => {
    const customForm = {
      id: 'form-order-test',
      title: 'Form kiểm tra thứ tự',
      fields: [
        { key: 'f_c9a1', label: 'Họ và tên' },
        { key: 'f_2b7e', label: 'Email' },
        { key: 'f_71d0', label: 'Dịch vụ' },
      ],
    };

    // Mô phỏng Postgres JSONB trả khoá bị lộn xộn: f_2b7e -> f_deleted -> f_71d0 -> f_c9a1
    const unorderedSubmissions = {
      submissions: [
        {
          id: 'sub-order-1',
          respondentName: 'Test Order',
          respondentEmail: 'test@example.com',
          marketingConsent: true,
          createdAt: '2026-09-14T08:00:00.000Z',
          answers: {
            f_2b7e: { label: 'Email', type: 'email', value: 'test@example.com' },
            f_deleted: { label: 'Trường đã xoá', type: 'short_text', value: 'Giá trị cũ' },
            f_71d0: { label: 'Dịch vụ', type: 'select', value: 'VIP' },
            f_c9a1: { label: 'Họ và tên', type: 'short_text', value: 'Test Order' },
          },
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
      totalPages: 1,
    };

    formAdminApi.fetchFormById.mockResolvedValue(customForm);
    formAdminApi.fetchFormSubmissions.mockResolvedValue(unorderedSubmissions);

    const { container } = render(
      <MemoryRouter initialEntries={['/app/forms/form-order-test/submissions']}>
        <I18nProvider>
          <Routes>
            <Route path="/app/forms/:id/submissions" element={<FormSubmissionsPage />} />
          </Routes>
        </I18nProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getAllByText('Test Order').length).toBeGreaterThanOrEqual(1);
    });

    // Lấy các label hiển thị trong cột câu trả lời theo đúng thứ tự xuất hiện trong DOM
    const renderedLabels = Array.from(
      container.querySelectorAll('tbody tr td:nth-child(4) span.font-semibold')
    ).map((el) => el.textContent.replace(':', '').trim());

    // Phải đúng thứ tự fields: f_c9a1 (Họ và tên) -> f_2b7e (Email) -> f_71d0 (Dịch vụ)
    // Và f_deleted (Trường đã xoá) nằm ở sau cùng
    expect(renderedLabels).toEqual(['Họ và tên', 'Email', 'Dịch vụ', 'Trường đã xoá']);
  });

  describe('Đặt lịch hẹn (PR-2b)', () => {
    // API chủ form (GET /api/forms/:id) trả khoá `bookingConfig` đầy đủ 6 khoá (khoá `booking`
    // rút gọn chỉ có ở API công khai getPublicForm) — form.repository.js findFormByIdAndOwner.
    const bookingForm = {
      id: 'form-booking-789',
      title: 'Form đặt lịch tư vấn',
      bookingConfig: {
        enabled: true,
        weeklySlots: { '0': [], '1': ['09:00'], '2': [], '3': [], '4': [], '5': [], '6': [] },
        slotCapacity: 1,
        daysAhead: 30,
        minNoticeMinutes: 60,
        closedDates: [],
      },
      fields: [{ key: 'f_name', label: 'Họ tên', type: 'short_text' }],
    };

    const bookingSubmissionsPage1 = {
      submissions: [
        {
          id: 'sub-appt-1',
          respondentName: 'Khách hẹn 1',
          respondentEmail: 'hen1@example.com',
          marketingConsent: true,
          status: 'submitted',
          // 2026-09-19T17:30:00Z = 00:30 20/09/2026 giờ VN (GMT+7)
          appointmentAt: '2026-09-19T17:30:00.000Z',
          createdAt: '2026-09-14T08:00:00.000Z',
          answers: {},
        },
        {
          id: 'sub-appt-2',
          respondentName: 'Khách đã huỷ',
          respondentEmail: 'huy@example.com',
          marketingConsent: false,
          status: 'cancelled',
          appointmentAt: '2026-09-20T02:00:00.000Z',
          createdAt: '2026-09-14T08:10:00.000Z',
          answers: {},
        },
      ],
      total: 2,
      page: 1,
      pageSize: 20,
      totalPages: 1,
    };

    it('hiển thị cột Giờ hẹn theo giờ VN (không theo múi giờ trình duyệt) và cột Trạng thái', async () => {
      formAdminApi.fetchFormById.mockResolvedValue(bookingForm);
      formAdminApi.fetchFormSubmissions.mockResolvedValue(bookingSubmissionsPage1);

      render(
        <MemoryRouter initialEntries={['/app/forms/form-booking-789/submissions']}>
          <I18nProvider>
            <Routes>
              <Route path="/app/forms/:id/submissions" element={<FormSubmissionsPage />} />
            </Routes>
          </I18nProvider>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('hen1@example.com')).toBeInTheDocument();
      });

      // Giờ hẹn tuyệt đối luôn theo Asia/Ho_Chi_Minh — đột biến #4 (chạy dưới TZ=America/New_York)
      expect(screen.getByText('00:30 20/09/2026')).toBeInTheDocument();

      // Trạng thái
      expect(screen.getByText('Đã đặt')).toBeInTheDocument();
      expect(screen.getByText('Đã huỷ')).toBeInTheDocument();

      // Bài đã huỷ không còn nút Huỷ lịch
      expect(screen.queryAllByRole('button', { name: /Huỷ lịch/i })).toHaveLength(1);
    });

    it('bộ lọc theo ngày: bấm "Hôm nay" gửi date=hôm nay giờ VN; xoá bộ lọc gọi lại không có date', async () => {
      formAdminApi.fetchFormById.mockResolvedValue(bookingForm);
      formAdminApi.fetchFormSubmissions.mockResolvedValue(bookingSubmissionsPage1);

      render(
        <MemoryRouter initialEntries={['/app/forms/form-booking-789/submissions']}>
          <I18nProvider>
            <Routes>
              <Route path="/app/forms/:id/submissions" element={<FormSubmissionsPage />} />
            </Routes>
          </I18nProvider>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('hen1@example.com')).toBeInTheDocument();
      });

      formAdminApi.fetchFormSubmissions.mockClear();
      fireEvent.click(screen.getByRole('button', { name: 'Hôm nay' }));

      await waitFor(() => {
        expect(formAdminApi.fetchFormSubmissions).toHaveBeenCalledTimes(1);
      });
      const [, callArgs] = formAdminApi.fetchFormSubmissions.mock.calls[0];
      expect(callArgs.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);

      formAdminApi.fetchFormSubmissions.mockClear();
      fireEvent.click(screen.getByRole('button', { name: /Xoá bộ lọc/i }));

      await waitFor(() => {
        expect(formAdminApi.fetchFormSubmissions).toHaveBeenCalledTimes(1);
      });
      const [, clearedArgs] = formAdminApi.fetchFormSubmissions.mock.calls[0];
      expect(clearedArgs.date).toBeUndefined();
    });

    it('Huỷ lịch: xác nhận rồi gọi cancelSubmission đúng id, cập nhật dòng thành Đã huỷ và ẩn nút', async () => {
      formAdminApi.fetchFormById.mockResolvedValue(bookingForm);
      formAdminApi.fetchFormSubmissions.mockResolvedValue(bookingSubmissionsPage1);
      formAdminApi.cancelSubmission.mockResolvedValue({ id: 'sub-appt-1', status: 'cancelled' });

      render(
        <MemoryRouter initialEntries={['/app/forms/form-booking-789/submissions']}>
          <I18nProvider>
            <Routes>
              <Route path="/app/forms/:id/submissions" element={<FormSubmissionsPage />} />
            </Routes>
          </I18nProvider>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('hen1@example.com')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Huỷ lịch' }));
      fireEvent.click(screen.getByRole('button', { name: 'Có, huỷ' }));

      await waitFor(() => {
        expect(formAdminApi.cancelSubmission).toHaveBeenCalledWith('form-booking-789', 'sub-appt-1');
      });

      // Dòng cập nhật thành Đã huỷ, nút Huỷ lịch biến mất khỏi dòng đó
      await waitFor(() => {
        expect(screen.getAllByText('Đã huỷ')).toHaveLength(2);
      });
      expect(screen.queryAllByRole('button', { name: /Huỷ lịch/i })).toHaveLength(0);
    });

    it('Huỷ lịch thất bại 409: hiện thông báo lỗi và tải lại trang hiện tại', async () => {
      formAdminApi.fetchFormById.mockResolvedValue(bookingForm);
      formAdminApi.fetchFormSubmissions.mockResolvedValue(bookingSubmissionsPage1);
      formAdminApi.cancelSubmission.mockRejectedValue({
        response: { status: 409, data: { code: 'SUBMISSION_ALREADY_CANCELLED', message: 'Bài nộp này đã bị huỷ trước đó' } },
      });

      render(
        <MemoryRouter initialEntries={['/app/forms/form-booking-789/submissions']}>
          <I18nProvider>
            <Routes>
              <Route path="/app/forms/:id/submissions" element={<FormSubmissionsPage />} />
            </Routes>
          </I18nProvider>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('hen1@example.com')).toBeInTheDocument();
      });

      formAdminApi.fetchFormSubmissions.mockClear();
      fireEvent.click(screen.getByRole('button', { name: 'Huỷ lịch' }));
      fireEvent.click(screen.getByRole('button', { name: 'Có, huỷ' }));

      await waitFor(() => {
        expect(formAdminApi.fetchFormSubmissions).toHaveBeenCalledTimes(1);
      });
    });

    it('form đã tắt đặt lịch (bookingConfig: null) nhưng còn bài nộp mang appointmentAt: vẫn hiện cột Giờ hẹn và nút Huỷ lịch', async () => {
      const formBookingTurnedOff = {
        id: 'form-booking-off-1',
        title: 'Form đã tắt đặt lịch',
        bookingConfig: null,
        fields: [{ key: 'f_name', label: 'Họ tên', type: 'short_text' }],
      };
      formAdminApi.fetchFormById.mockResolvedValue(formBookingTurnedOff);
      formAdminApi.fetchFormSubmissions.mockResolvedValue(bookingSubmissionsPage1);

      render(
        <MemoryRouter initialEntries={['/app/forms/form-booking-off-1/submissions']}>
          <I18nProvider>
            <Routes>
              <Route path="/app/forms/:id/submissions" element={<FormSubmissionsPage />} />
            </Routes>
          </I18nProvider>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('hen1@example.com')).toBeInTheDocument();
      });

      // Lịch cũ (đặt lúc còn bật) vẫn phải xem/huỷ được dù form đã tắt đặt lịch
      expect(screen.getByText('00:30 20/09/2026')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Huỷ lịch' })).toBeInTheDocument();
    });
  });
});
