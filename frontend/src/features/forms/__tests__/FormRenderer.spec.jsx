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
});
