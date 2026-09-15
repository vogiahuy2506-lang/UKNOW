import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { I18nProvider } from '../../../i18n';
import FormRenderer from '../components/FormRenderer';

describe('FormRenderer component', () => {
  const baseForm = {
    id: 'form-123',
    title: 'Khảo sát khách hàng',
    description: 'Vui lòng điền thông tin bên dưới',
    fields: [
      { key: 'full_name', label: 'Họ và tên', type: 'short_text', required: true, role: 'name' },
      { key: 'user_email', label: 'Email', type: 'email', required: true, role: 'email' },
      { key: 'user_phone', label: 'Số điện thoại', type: 'phone', required: false, role: 'phone' },
    ],
    settings: {
      notifyOwner: false,
      consentEnabled: false,
      sendConfirmation: false,
      submitButtonText: 'Gửi thông tin',
      successMessage: 'Cảm ơn bạn đã gửi phản hồi!',
      redirectUrl: '',
    },
  };

  let originalLocation;

  beforeEach(() => {
    originalLocation = window.location;
    delete window.location;
    window.location = {
      href: 'http://localhost:5174/f/pub_key_123',
      origin: 'http://localhost:5174',
      pathname: '/f/pub_key_123',
      search: '',
      hash: '',
    };
  });

  afterEach(() => {
    window.location = originalLocation;
    vi.restoreAllMocks();
  });

  it('chặn bấm đúp (double submit) bằng useRef khi submit nhiều lần liên tiếp', async () => {
    let resolveSubmit;
    const slowSubmitPromise = new Promise((resolve) => {
      resolveSubmit = resolve;
    });
    const mockOnSubmit = vi.fn().mockImplementation(() => slowSubmitPromise);

    render(
      <I18nProvider>
        <FormRenderer form={baseForm} onSubmit={mockOnSubmit} />
      </I18nProvider>
    );

    // Điền các trường bắt buộc
    fireEvent.change(screen.getByLabelText(/Họ và tên/i), { target: { value: 'Nguyễn Văn A' } });
    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'vana@example.com' } });

    const submitBtn = screen.getByRole('button', { name: /Gửi thông tin/i });

    // Bấm liên tiếp 2 lần trước khi promise đầu tiên resolve
    fireEvent.click(submitBtn);
    fireEvent.click(submitBtn);

    expect(mockOnSubmit).toHaveBeenCalledTimes(1);

    // Cho promise hoàn tất
    resolveSubmit();
    await waitFor(() => {
      expect(screen.getByText('Cảm ơn bạn đã gửi phản hồi!')).toBeInTheDocument();
    });
  });

  it('phòng thủ protocol: redirectUrl dạng javascript: hoặc data: không chuyển trang và hiển thị thông báo thành công', async () => {
    const maliciousForm = {
      ...baseForm,
      settings: {
        ...baseForm.settings,
        redirectUrl: 'javascript:alert(1)',
      },
    };

    const mockOnSubmit = vi.fn().mockResolvedValue({});

    render(
      <I18nProvider>
        <FormRenderer form={maliciousForm} onSubmit={mockOnSubmit} />
      </I18nProvider>
    );

    fireEvent.change(screen.getByLabelText(/Họ và tên/i), { target: { value: 'Lê Thị B' } });
    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'lethib@example.com' } });

    const submitBtn = screen.getByRole('button', { name: /Gửi thông tin/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledTimes(1);
    });

    // window.location.href không được đổi sang URL độc hại
    expect(window.location.href).not.toBe('javascript:alert(1)');
    expect(window.location.href).toBe('http://localhost:5174/f/pub_key_123');

    // Hiển thị thông báo thành công
    await waitFor(() => {
      expect(screen.getByText('Cảm ơn bạn đã gửi phản hồi!')).toBeInTheDocument();
    });
  });

  it('chuyển hướng an toàn khi redirectUrl bắt đầu bằng http:// hoặc https://', async () => {
    const safeRedirectForm = {
      ...baseForm,
      settings: {
        ...baseForm.settings,
        redirectUrl: 'https://example.com/thank-you',
      },
    };

    const mockOnSubmit = vi.fn().mockResolvedValue({});

    render(
      <I18nProvider>
        <FormRenderer form={safeRedirectForm} onSubmit={mockOnSubmit} />
      </I18nProvider>
    );

    fireEvent.change(screen.getByLabelText(/Họ và tên/i), { target: { value: 'Lê Thị B' } });
    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'lethib@example.com' } });

    const submitBtn = screen.getByRole('button', { name: /Gửi thông tin/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledTimes(1);
    });

    expect(window.location.href).toBe('https://example.com/thank-you');
  });

  it('PR-5 embedMode: redirectUrl an toàn -> thử chuyển hướng CẢ TRANG NGOÀI qua window.top (không chỉ mỗi iframe)', async () => {
    const originalTop = window.top;
    let capturedTopHref = '';
    Object.defineProperty(window, 'top', {
      value: {
        location: {
          set href(v) {
            capturedTopHref = v;
          },
          get href() {
            return capturedTopHref;
          },
        },
      },
      configurable: true,
    });

    const safeRedirectForm = {
      ...baseForm,
      settings: { ...baseForm.settings, redirectUrl: 'https://example.com/thank-you' },
    };
    const mockOnSubmit = vi.fn().mockResolvedValue({});

    render(
      <I18nProvider>
        <FormRenderer form={safeRedirectForm} onSubmit={mockOnSubmit} embedMode />
      </I18nProvider>
    );

    fireEvent.change(screen.getByLabelText(/Họ và tên/i), { target: { value: 'Lê Thị B' } });
    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'lethib@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /Gửi thông tin/i }));

    await waitFor(() => expect(mockOnSubmit).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(capturedTopHref).toBe('https://example.com/thank-you'));

    // window.location (chỉ mỗi iframe) đứng yên — chuyển hướng phải đi qua window.top
    expect(window.location.href).toBe('http://localhost:5174/f/pub_key_123');

    Object.defineProperty(window, 'top', { value: originalTop, configurable: true });
  });

  it('PR-5 embedMode: window.top chặn (throw) -> hiện màn thành công kèm link target="_top" tới redirectUrl, KHÔNG chuyển window.location', async () => {
    const originalTop = window.top;
    Object.defineProperty(window, 'top', {
      value: {
        get location() {
          throw new Error('Blocked cross-origin top navigation');
        },
      },
      configurable: true,
    });

    const safeRedirectForm = {
      ...baseForm,
      settings: { ...baseForm.settings, redirectUrl: 'https://example.com/thank-you' },
    };
    const mockOnSubmit = vi.fn().mockResolvedValue({});

    render(
      <I18nProvider>
        <FormRenderer form={safeRedirectForm} onSubmit={mockOnSubmit} embedMode />
      </I18nProvider>
    );

    fireEvent.change(screen.getByLabelText(/Họ và tên/i), { target: { value: 'Lê Thị B' } });
    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'lethib@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /Gửi thông tin/i }));

    await waitFor(() => expect(mockOnSubmit).toHaveBeenCalledTimes(1));

    // Màn thành công hiện ra (không vỡ), kèm link dự phòng target="_top"
    await waitFor(() => {
      expect(screen.getByText('Cảm ơn bạn đã gửi phản hồi!')).toBeInTheDocument();
    });
    const fallbackLink = screen.getByRole('link');
    expect(fallbackLink).toHaveAttribute('href', 'https://example.com/thank-you');
    expect(fallbackLink).toHaveAttribute('target', '_top');
    expect(fallbackLink).toHaveAttribute('rel', 'noopener');

    // window.location của chính iframe không hề đổi
    expect(window.location.href).toBe('http://localhost:5174/f/pub_key_123');

    Object.defineProperty(window, 'top', { value: originalTop, configurable: true });
  });

  it('khi consentEnabled = false thì không render checkbox và payload không có marketingConsent', async () => {
    const mockOnSubmit = vi.fn().mockResolvedValue({});

    render(
      <I18nProvider>
        <FormRenderer form={baseForm} onSubmit={mockOnSubmit} />
      </I18nProvider>
    );

    // Không tồn tại checkbox đồng ý nhận tin tiếp thị
    expect(screen.queryByRole('checkbox', { name: /Tôi đồng ý nhận thông tin tiếp thị/i })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Họ và tên/i), { target: { value: 'Trần Văn C' } });
    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'tranc@example.com' } });

    const submitBtn = screen.getByRole('button', { name: /Gửi thông tin/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledTimes(1);
    });

    const payload = mockOnSubmit.mock.calls[0][0];
    expect(payload).toHaveProperty('answers');
    expect(payload).not.toHaveProperty('marketingConsent');
  });

  it('khi consentEnabled = true thì render checkbox và gửi đúng trạng thái marketingConsent', async () => {
    const consentForm = {
      ...baseForm,
      settings: {
        ...baseForm.settings,
        consentEnabled: true,
      },
    };

    const mockOnSubmit = vi.fn().mockResolvedValue({});

    render(
      <I18nProvider>
        <FormRenderer form={consentForm} onSubmit={mockOnSubmit} />
      </I18nProvider>
    );

    const consentCheckbox = screen.getByRole('checkbox');
    expect(consentCheckbox).toBeInTheDocument();
    expect(consentCheckbox).not.toBeChecked();

    // Điền dữ liệu và tick checkbox
    fireEvent.change(screen.getByLabelText(/Họ và tên/i), { target: { value: 'Trần Văn D' } });
    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'trand@example.com' } });
    fireEvent.click(consentCheckbox);
    expect(consentCheckbox).toBeChecked();

    const submitBtn = screen.getByRole('button', { name: /Gửi thông tin/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledTimes(1);
    });

    const payload = mockOnSubmit.mock.calls[0][0];
    expect(payload.marketingConsent).toBe(true);
  });

  it('chứa trường bẫy bot honeypot _hp_website và gửi _hp_website rỗng trong payload', async () => {
    const mockOnSubmit = vi.fn().mockResolvedValue({});

    const { container } = render(
      <I18nProvider>
        <FormRenderer form={baseForm} onSubmit={mockOnSubmit} />
      </I18nProvider>
    );

    const hpInput = container.querySelector('input[name="_hp_website"]');
    expect(hpInput).toBeInTheDocument();
    expect(hpInput).toHaveValue('');

    fireEvent.change(screen.getByLabelText(/Họ và tên/i), { target: { value: 'Phạm Văn E' } });
    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'phame@example.com' } });

    fireEvent.click(screen.getByRole('button', { name: /Gửi thông tin/i }));

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledTimes(1);
    });

    const payload = mockOnSubmit.mock.calls[0][0];
    expect(payload._hp_website).toBe('');
  });

  it('validate client: chặn submit khi thiếu trường bắt buộc hoặc email không hợp lệ', async () => {
    const mockOnSubmit = vi.fn();

    render(
      <I18nProvider>
        <FormRenderer form={baseForm} onSubmit={mockOnSubmit} />
      </I18nProvider>
    );

    const submitBtn = screen.getByRole('button', { name: /Gửi thông tin/i });

    // Submit khi form trống -> lỗi trường bắt buộc
    fireEvent.click(submitBtn);
    expect(mockOnSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/Vui lòng điền trường "Họ và tên"/i)).toBeInTheDocument();

    // Điền tên nhưng email sai định dạng
    fireEvent.change(screen.getByLabelText(/Họ và tên/i), { target: { value: 'Nguyễn Văn F' } });
    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'not-an-email' } });
    fireEvent.click(submitBtn);

    expect(mockOnSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/Email không hợp lệ/i)).toBeInTheDocument();
  });

  it('bẫy bot: khi bot tự động điền vào ô _hp_website thì payload gửi giá trị thật đó', async () => {
    const mockOnSubmit = vi.fn().mockResolvedValue({});

    const { container } = render(
      <I18nProvider>
        <FormRenderer form={baseForm} onSubmit={mockOnSubmit} />
      </I18nProvider>
    );

    const hpInput = container.querySelector('input[name="_hp_website"]');
    expect(hpInput).toBeInTheDocument();
    fireEvent.change(hpInput, { target: { value: 'https://spam-bot.example.com' } });

    fireEvent.change(screen.getByLabelText(/Họ và tên/i), { target: { value: 'Spam Bot' } });
    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'spambot@example.com' } });

    fireEvent.click(screen.getByRole('button', { name: /Gửi thông tin/i }));

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledTimes(1);
    });

    const payload = mockOnSubmit.mock.calls[0][0];
    expect(payload._hp_website).toBe('https://spam-bot.example.com');
  });

  it('chuẩn hoá SĐT: gõ 090-123-4567 gửi payload 0901234567; gõ abc lỗi tại chỗ không gọi API', async () => {
    const mockOnSubmit = vi.fn().mockResolvedValue({});

    render(
      <I18nProvider>
        <FormRenderer form={baseForm} onSubmit={mockOnSubmit} />
      </I18nProvider>
    );

    fireEvent.change(screen.getByLabelText(/Họ và tên/i), { target: { value: 'Nguyễn Văn Phone' } });
    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'phone@example.com' } });

    // 1. Nhập SĐT không hợp lệ: "abc"
    fireEvent.change(screen.getByLabelText(/Số điện thoại/i), { target: { value: 'abc' } });
    fireEvent.click(screen.getByRole('button', { name: /Gửi thông tin/i }));

    expect(mockOnSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/Số điện thoại không hợp lệ/i)).toBeInTheDocument();

    // 2. Nhập SĐT có dấu gạch: "090-123-4567"
    fireEvent.change(screen.getByLabelText(/Số điện thoại/i), { target: { value: '090-123-4567' } });
    fireEvent.click(screen.getByRole('button', { name: /Gửi thông tin/i }));

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledTimes(1);
    });

    const payload = mockOnSubmit.mock.calls[0][0];
    expect(payload.answers.user_phone).toBe('0901234567');
  });

  describe('đặt lịch hẹn (PR-2b)', () => {
    const bookingForm = {
      ...baseForm,
      booking: { enabled: true, daysAhead: 30 },
    };

    const mockSlotsResponse = {
      slots: [
        { date: '2026-09-20', time: '09:00', remaining: 3 },
        { date: '2026-09-20', time: '10:00', remaining: 0 },
        { date: '2026-09-21', time: '14:00', remaining: null },
      ],
    };

    it('form không bật đặt lịch: không hiển thị bộ chọn khung giờ, payload không có appointmentDate/appointmentTime', async () => {
      const mockOnSubmit = vi.fn().mockResolvedValue({});
      render(
        <I18nProvider>
          <FormRenderer form={baseForm} onSubmit={mockOnSubmit} />
        </I18nProvider>
      );

      expect(screen.queryByText('Chọn ngày và giờ hẹn')).not.toBeInTheDocument();

      fireEvent.change(screen.getByLabelText(/Họ và tên/i), { target: { value: 'Không đặt lịch' } });
      fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'no-booking@example.com' } });
      fireEvent.click(screen.getByRole('button', { name: /Gửi thông tin/i }));

      await waitFor(() => expect(mockOnSubmit).toHaveBeenCalledTimes(1));
      const payload = mockOnSubmit.mock.calls[0][0];
      expect(payload).not.toHaveProperty('appointmentDate');
      expect(payload).not.toHaveProperty('appointmentTime');
    });

    it('form bật đặt lịch, chưa chọn khung giờ + bấm gửi: báo lỗi tại chỗ, KHÔNG gọi onSubmit (đột biến #1)', async () => {
      const mockLoadSlots = vi.fn().mockResolvedValue(mockSlotsResponse);
      const mockOnSubmit = vi.fn();

      render(
        <I18nProvider>
          <FormRenderer form={bookingForm} onSubmit={mockOnSubmit} loadSlots={mockLoadSlots} />
        </I18nProvider>
      );

      await waitFor(() => expect(mockLoadSlots).toHaveBeenCalledTimes(1));

      fireEvent.change(screen.getByLabelText(/Họ và tên/i), { target: { value: 'Chưa chọn khung' } });
      fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'chuachon@example.com' } });
      fireEvent.click(screen.getByRole('button', { name: /Gửi thông tin/i }));

      expect(mockOnSubmit).not.toHaveBeenCalled();
      expect(await screen.findByText('Vui lòng chọn một khung giờ hẹn')).toBeInTheDocument();
    });

    it('khung remaining:0 không click được; chọn khung còn chỗ gửi đúng appointmentDate/appointmentTime; màn thành công hiện giờ đã đặt', async () => {
      const mockLoadSlots = vi.fn().mockResolvedValue(mockSlotsResponse);
      const mockOnSubmit = vi.fn().mockResolvedValue({});

      render(
        <I18nProvider>
          <FormRenderer form={bookingForm} onSubmit={mockOnSubmit} loadSlots={mockLoadSlots} />
        </I18nProvider>
      );

      const fullSlotBtn = await screen.findByRole('button', { name: /10:00.*Hết chỗ/i });
      expect(fullSlotBtn).toBeDisabled();

      const openSlotBtn = screen.getByRole('button', { name: /^09:00/ });
      fireEvent.click(openSlotBtn);

      fireEvent.change(screen.getByLabelText(/Họ và tên/i), { target: { value: 'Đã chọn khung' } });
      fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'dachon@example.com' } });
      fireEvent.click(screen.getByRole('button', { name: /Gửi thông tin/i }));

      await waitFor(() => expect(mockOnSubmit).toHaveBeenCalledTimes(1));
      const payload = mockOnSubmit.mock.calls[0][0];
      expect(payload.appointmentDate).toBe('2026-09-20');
      expect(payload.appointmentTime).toBe('09:00');

      // Màn thành công hiện giờ hẹn đã đặt
      await waitFor(() => {
        expect(screen.getByText(/Lịch hẹn của bạn/i)).toBeInTheDocument();
      });
      expect(screen.getByText(/09:00/)).toBeInTheDocument();
    });

    it('409 FORM_SLOT_FULL: hiện thông báo theo mã lỗi, tải lại slots, bỏ chọn khung cũ, giữ nguyên câu trả lời khác (đột biến #2)', async () => {
      const mockLoadSlots = vi.fn().mockResolvedValue(mockSlotsResponse);
      const slotFullError = {
        response: { status: 409, data: { code: 'FORM_SLOT_FULL', message: 'Khung giờ này vừa hết chỗ' } },
      };
      const mockOnSubmit = vi.fn().mockRejectedValue(slotFullError);

      render(
        <I18nProvider>
          <FormRenderer form={bookingForm} onSubmit={mockOnSubmit} loadSlots={mockLoadSlots} />
        </I18nProvider>
      );

      await waitFor(() => expect(mockLoadSlots).toHaveBeenCalledTimes(1));

      const openSlotBtn = await screen.findByRole('button', { name: /^09:00/ });
      fireEvent.click(openSlotBtn);

      fireEvent.change(screen.getByLabelText(/Họ và tên/i), { target: { value: 'Giữ tên này' } });
      fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'keep@example.com' } });
      fireEvent.click(screen.getByRole('button', { name: /Gửi thông tin/i }));

      await waitFor(() => expect(mockOnSubmit).toHaveBeenCalledTimes(1));

      // Tải lại slots sau lỗi khung giờ
      await waitFor(() => expect(mockLoadSlots).toHaveBeenCalledTimes(2));

      // Thông báo lỗi theo code (i18n phía client, không phải message thô từ server)
      expect(await screen.findByText('Khung giờ này vừa hết chỗ, vui lòng chọn khung khác')).toBeInTheDocument();

      // Khung cũ bị bỏ chọn: bấm gửi lại (không chọn khung mới) bị chặn tại chỗ, onSubmit không tăng thêm
      fireEvent.click(screen.getByRole('button', { name: /Gửi thông tin/i }));
      expect(mockOnSubmit).toHaveBeenCalledTimes(1);

      // Giữ nguyên các câu trả lời khác đã điền
      expect(screen.getByLabelText(/Họ và tên/i)).toHaveValue('Giữ tên này');
      expect(screen.getByLabelText(/Email/i)).toHaveValue('keep@example.com');
    });

    it('đổi tuần nhanh: phản hồi của tuần cũ về muộn hơn KHÔNG được đè lưới của tuần mới hơn (race condition)', async () => {
      let resolveWeek1;
      const week1Promise = new Promise((resolve) => {
        resolveWeek1 = resolve;
      });
      const week2Response = {
        slots: [{ date: '2026-09-27', time: '11:00', remaining: 2 }],
      };

      const mockLoadSlots = vi
        .fn()
        .mockImplementationOnce(() => week1Promise) // lần gọi đầu (mount, tuần hiện tại) — CHẬM
        .mockImplementationOnce(() => Promise.resolve(week2Response)); // "Tuần sau" — NHANH

      render(
        <I18nProvider>
          <FormRenderer form={bookingForm} onSubmit={vi.fn()} loadSlots={mockLoadSlots} />
        </I18nProvider>
      );

      await waitFor(() => expect(mockLoadSlots).toHaveBeenCalledTimes(1));

      // Bấm "Tuần sau" trước khi request đầu (tuần hiện tại) kịp trả lời
      fireEvent.click(screen.getByRole('button', { name: /Tuần sau/i }));
      await waitFor(() => expect(mockLoadSlots).toHaveBeenCalledTimes(2));

      // Request thứ 2 (nhanh hơn) render xong trước
      await screen.findByRole('button', { name: /^11:00/ });

      // Giờ mới cho request đầu (chậm, tuần cũ) trả lời — phải bị bỏ qua vì đã lỗi thời
      resolveWeek1(mockSlotsResponse);
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Vẫn phải thấy đúng lưới của tuần mới nhất (11:00), KHÔNG bị đè lại bởi khung tuần cũ (09:00)
      expect(screen.getByRole('button', { name: /^11:00/ })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^09:00/ })).not.toBeInTheDocument();
    });
  });
});
