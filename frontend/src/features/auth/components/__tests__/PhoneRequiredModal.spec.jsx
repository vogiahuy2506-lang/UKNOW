import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import PhoneRequiredModal from '../PhoneRequiredModal';

/**
 * PR-2 (xác thực SĐT) — _internal/PLAN_XAC_THUC_SDT_OTP_2026-09-11.md mục 4 PR-2 việc 9.
 * `t` PHẢI ổn định giữa các lần render — bài học từ QuickSend.customContent.spec.jsx cùng
 * phiên này: t không ổn định làm effect phụ thuộc [t] chạy lại vô hạn. Modal này không có
 * effect như vậy, nhưng giữ khuôn ổn định cho chắc và nhất quán.
 */
const stableT = (key, params) => {
  if (params && Object.keys(params).length > 0) {
    return `${key}:${JSON.stringify(params)}`;
  }
  return key;
};
vi.mock('../../../../i18n', () => ({ useI18n: () => ({ t: stableT }) }));

const m = vi.hoisted(() => ({
  user: { id: 1, phone: '', phoneVerifiedAt: null },
  phoneOtpEnabled: false,
  updateMyPhone: vi.fn(),
  sendPhoneOtpCode: vi.fn(),
  verifyPhoneOtpCode: vi.fn(),
}));

vi.mock('../../../../stores/authStore', () => ({
  useAuthStore: (selector) => (selector ? selector(m) : m),
}));

vi.mock('../../services/authApi.service', () => ({
  updateMyPhone: m.updateMyPhone,
  sendPhoneOtpCode: m.sendPhoneOtpCode,
  verifyPhoneOtpCode: m.verifyPhoneOtpCode,
}));

const noop = () => {};

describe('PhoneRequiredModal — cờ tắt (một bước, hành vi cũ)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.user = { id: 1, phone: '', phoneVerifiedAt: null };
    m.phoneOtpEnabled = false;
  });

  it('nhập số → submit gọi updateMyPhone thẳng, không có bước OTP', async () => {
    m.updateMyPhone.mockResolvedValue({ success: true, data: { phone: '0912345678' } });
    const onChanged = vi.fn();

    render(<PhoneRequiredModal isOpen onClose={noop} onChanged={onChanged} />);

    fireEvent.change(screen.getByPlaceholderText('phoneRequired.phonePlaceholder'), {
      target: { value: '0912345678' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'phoneRequired.submit' }));
    });

    expect(m.updateMyPhone).toHaveBeenCalledWith({ phone: '0912345678' });
    expect(m.sendPhoneOtpCode).not.toHaveBeenCalled();
    expect(onChanged).toHaveBeenCalledWith('0912345678');
  });
});

describe('PhoneRequiredModal — cờ bật (hai bước: gửi mã → nhập mã)', () => {
  // KHÔNG dùng vi.useFakeTimers() ở đây — RTL findBy*/waitFor tự poll bằng setTimeout thật,
  // bật fake timers trước khi chờ các lời gọi đó làm test treo (đã tự bắt được lỗi này khi
  // viết: cả 5 ca "cờ bật" timeout 10s). Ca đếm ngược bên dưới tự bật/tắt fake timers cục bộ
  // SAU khi đã sang bước 2 bằng timers thật, tránh trộn hai cơ chế trong cùng một chờ đợi.
  beforeEach(() => {
    vi.clearAllMocks();
    m.user = { id: 1, phone: '', phoneVerifiedAt: null };
    m.phoneOtpEnabled = true;
  });

  it('gửi mã → nhập đúng mã → xác thực → onChanged(phone, phoneVerifiedAt)', async () => {
    m.sendPhoneOtpCode.mockResolvedValue({ success: true });
    m.verifyPhoneOtpCode.mockResolvedValue({
      success: true,
      data: { phone: '0912345678', phoneVerifiedAt: '2026-09-11T10:00:00.000Z' },
    });
    const onChanged = vi.fn();

    render(<PhoneRequiredModal isOpen onClose={noop} onChanged={onChanged} />);

    fireEvent.change(screen.getByPlaceholderText('phoneRequired.phonePlaceholder'), {
      target: { value: '0912345678' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'phoneRequired.sendCode' }));
    });

    expect(m.sendPhoneOtpCode).toHaveBeenCalledWith({ phone: '0912345678' });
    expect(m.updateMyPhone).not.toHaveBeenCalled();

    // Sang bước 2 — ô nhập mã hiện ra.
    const codeInput = await screen.findByLabelText('phoneRequired.codeLabel');
    fireEvent.change(codeInput, { target: { value: '123456' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'phoneRequired.verifyButton' }));
    });

    expect(m.verifyPhoneOtpCode).toHaveBeenCalledWith({ phone: '0912345678', code: '123456' });
    expect(onChanged).toHaveBeenCalledWith('0912345678', '2026-09-11T10:00:00.000Z');
  });

  it('gửi mã lỗi 429 (cooldown) → hiện message kèm retryAfterSec, không sang bước 2', async () => {
    m.sendPhoneOtpCode.mockRejectedValue({
      response: { status: 429, data: { message: 'Vui lòng đợi 42 giây trước khi gửi lại mã', retryAfterSec: 42 } },
    });

    render(<PhoneRequiredModal isOpen onClose={noop} onChanged={noop} />);

    fireEvent.change(screen.getByPlaceholderText('phoneRequired.phonePlaceholder'), {
      target: { value: '0912345678' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'phoneRequired.sendCode' }));
    });

    expect(await screen.findByText('Vui lòng đợi 42 giây trước khi gửi lại mã')).toBeInTheDocument();
    expect(screen.queryByLabelText('phoneRequired.codeLabel')).not.toBeInTheDocument();
  });

  it('xác thực sai/hết hạn → hiện message backend nguyên văn, không gọi onChanged', async () => {
    m.sendPhoneOtpCode.mockResolvedValue({ success: true });
    m.verifyPhoneOtpCode.mockRejectedValue({
      response: { status: 400, data: { message: 'Mã xác thực không đúng hoặc đã hết hạn.', code: 'PHONE_OTP_INVALID' } },
    });
    const onChanged = vi.fn();

    render(<PhoneRequiredModal isOpen onClose={noop} onChanged={onChanged} />);

    fireEvent.change(screen.getByPlaceholderText('phoneRequired.phonePlaceholder'), {
      target: { value: '0912345678' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'phoneRequired.sendCode' }));
    });
    const codeInput = await screen.findByLabelText('phoneRequired.codeLabel');
    fireEvent.change(codeInput, { target: { value: '000000' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'phoneRequired.verifyButton' }));
    });

    expect(await screen.findByText('Mã xác thực không đúng hoặc đã hết hạn.')).toBeInTheDocument();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('xác thực gặp 409 PHONE_TAKEN → hiện message backend nguyên văn', async () => {
    m.sendPhoneOtpCode.mockResolvedValue({ success: true });
    m.verifyPhoneOtpCode.mockRejectedValue({
      response: {
        status: 409,
        data: { message: 'Số điện thoại này đã được dùng và xác thực bởi một tài khoản khác.', code: 'PHONE_TAKEN' },
      },
    });

    render(<PhoneRequiredModal isOpen onClose={noop} onChanged={noop} />);

    fireEvent.change(screen.getByPlaceholderText('phoneRequired.phonePlaceholder'), {
      target: { value: '0912345678' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'phoneRequired.sendCode' }));
    });
    const codeInput = await screen.findByLabelText('phoneRequired.codeLabel');
    fireEvent.change(codeInput, { target: { value: '123456' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'phoneRequired.verifyButton' }));
    });

    expect(
      await screen.findByText('Số điện thoại này đã được dùng và xác thực bởi một tài khoản khác.')
    ).toBeInTheDocument();
  });

  it('điền sẵn số hiện có của user khi mở modal', () => {
    m.user = { id: 1, phone: '0909999999', phoneVerifiedAt: null };

    render(<PhoneRequiredModal isOpen onClose={noop} onChanged={noop} />);

    expect(screen.getByPlaceholderText('phoneRequired.phonePlaceholder')).toHaveValue('0909999999');
  });

  it('nút "Gửi lại" khoá ngay sau khi gửi mã, hiện đúng đếm ngược 60s', async () => {
    m.sendPhoneOtpCode.mockResolvedValue({ success: true });

    render(<PhoneRequiredModal isOpen onClose={noop} onChanged={noop} />);

    fireEvent.change(screen.getByPlaceholderText('phoneRequired.phonePlaceholder'), {
      target: { value: '0912345678' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'phoneRequired.sendCode' }));
    });
    await screen.findByLabelText('phoneRequired.codeLabel');

    // stableT nối params vào khoá dạng `key:{"seconds":60}` — khớp đúng chứng minh countdown
    // khởi động với 60 giây (RESEND_COOLDOWN), không phải một giá trị ngẫu nhiên/sai.
    const resendBtn = screen.getByRole('button', {
      name: 'phoneRequired.resendCountdown:{"seconds":60}',
    });
    expect(resendBtn).toBeDisabled();
  });

  it('đếm ngược chạy hết thì "Gửi lại" mở khoá lại', async () => {
    m.sendPhoneOtpCode.mockResolvedValue({ success: true });

    // Bật fake timers TRƯỚC khi setInterval của startCountdown() được tạo — vitest chỉ tua
    // nhanh được các timer tạo SAU khi fake timers đã bật; interval tạo bằng timer thật thì
    // advanceTimersByTime không đụng vào được (đã tự bắt lỗi này ở lần viết trước: đợi hết
    // 60s giả mà nút vẫn khoá vì interval là thật). Vì fake timers đang bật ngay từ đầu, MỌI
    // thao tác sau đây dùng getBy* đồng bộ — KHÔNG findBy*/waitFor (cả hai poll bằng
    // setTimeout thật, sẽ treo khi fake timers thay thế setTimeout toàn cục).
    vi.useFakeTimers();

    render(<PhoneRequiredModal isOpen onClose={noop} onChanged={noop} />);

    fireEvent.change(screen.getByPlaceholderText('phoneRequired.phonePlaceholder'), {
      target: { value: '0912345678' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'phoneRequired.sendCode' }));
    });

    expect(screen.getByLabelText('phoneRequired.codeLabel')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    expect(screen.getByRole('button', { name: 'phoneRequired.resendButton' })).not.toBeDisabled();
    vi.useRealTimers();
  });
});
