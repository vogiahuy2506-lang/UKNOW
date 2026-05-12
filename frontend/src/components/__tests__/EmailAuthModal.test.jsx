import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const apiPostMock = vi.fn();
vi.mock('../../services/api', () => ({
  default: { post: (...args) => apiPostMock(...args) },
}));

const toastSuccessMock = vi.fn();
const toastErrorMock = vi.fn();
vi.mock('react-hot-toast', () => ({
  default: { success: (...a) => toastSuccessMock(...a), error: (...a) => toastErrorMock(...a) },
}));

import EmailAuthModal from '../../components/auth/EmailAuthModal';

beforeEach(() => {
  vi.clearAllMocks();
  apiPostMock.mockReset();
});

describe('<EmailAuthModal /> — isOpen guard', () => {
  it('isOpen=false → trả null (không render)', () => {
    const { container } = render(<EmailAuthModal isOpen={false} onClose={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('isOpen=true mặc định mode=login → tiêu đề "Đăng nhập với Email"', () => {
    render(<EmailAuthModal isOpen onClose={vi.fn()} />);
    expect(screen.getByText('Đăng nhập với Email')).toBeInTheDocument();
    expect(screen.getByText('Nhập email để nhận mã xác minh')).toBeInTheDocument();
  });

  it('mode="register" → tiêu đề "Đăng ký với Email"', () => {
    render(<EmailAuthModal isOpen onClose={vi.fn()} mode="register" />);
    expect(screen.getByText('Đăng ký với Email')).toBeInTheDocument();
  });

  it('click backdrop → onClose', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<EmailAuthModal isOpen onClose={onClose} />);
    const backdrop = document.querySelector('.absolute.inset-0.bg-black\\/50');
    await user.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('click nút "Đóng" footer → onClose', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<EmailAuthModal isOpen onClose={onClose} />);
    await user.click(screen.getByText('Đóng'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('<EmailAuthModal /> — step 1: send code', () => {
  it('email trống → toast.error + không call API', async () => {
    const user = userEvent.setup();
    render(<EmailAuthModal isOpen onClose={vi.fn()} />);
    await user.click(screen.getByText('Gửi mã xác minh'));
    expect(toastErrorMock).toHaveBeenCalledWith('Vui lòng nhập email hợp lệ');
    expect(apiPostMock).not.toHaveBeenCalled();
  });

  it('email không hợp lệ → toast.error', async () => {
    const user = userEvent.setup();
    render(<EmailAuthModal isOpen onClose={vi.fn()} />);
    await user.type(screen.getByPlaceholderText('example@email.com'), 'not-an-email');
    await user.click(screen.getByText('Gửi mã xác minh'));
    expect(toastErrorMock).toHaveBeenCalledWith('Vui lòng nhập email hợp lệ');
    expect(apiPostMock).not.toHaveBeenCalled();
  });

  it('email hợp lệ → POST /verification/send-code + chuyển step 2', async () => {
    apiPostMock.mockResolvedValueOnce({ data: {} });
    const user = userEvent.setup();
    render(<EmailAuthModal isOpen onClose={vi.fn()} />);
    await user.type(screen.getByPlaceholderText('example@email.com'), 'a@b.com');
    await user.click(screen.getByText('Gửi mã xác minh'));
    expect(apiPostMock).toHaveBeenCalledWith('/verification/send-code', { email: 'a@b.com' });
    await vi.waitFor(() => {
      expect(screen.getByText(/Nhập mã 6 số/)).toBeInTheDocument();
    });
    expect(toastSuccessMock).toHaveBeenCalledWith('Mã xác minh đã được gửi đến email của bạn!');
  });

  it('Enter trong input email → trigger sendCode', async () => {
    apiPostMock.mockResolvedValueOnce({ data: {} });
    const user = userEvent.setup();
    render(<EmailAuthModal isOpen onClose={vi.fn()} />);
    const input = screen.getByPlaceholderText('example@email.com');
    await user.type(input, 'a@b.com{Enter}');
    expect(apiPostMock).toHaveBeenCalledWith('/verification/send-code', { email: 'a@b.com' });
  });

  it('API lỗi → toast.error với response.data.message', async () => {
    apiPostMock.mockRejectedValueOnce({ response: { data: { message: 'Email đã tồn tại' } } });
    const user = userEvent.setup();
    render(<EmailAuthModal isOpen onClose={vi.fn()} />);
    await user.type(screen.getByPlaceholderText('example@email.com'), 'a@b.com');
    await user.click(screen.getByText('Gửi mã xác minh'));
    await vi.waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith('Email đã tồn tại');
    });
  });

  it('API lỗi không có data.message → fallback "Không thể gửi mã xác minh"', async () => {
    apiPostMock.mockRejectedValueOnce(new Error('Network'));
    const user = userEvent.setup();
    render(<EmailAuthModal isOpen onClose={vi.fn()} />);
    await user.type(screen.getByPlaceholderText('example@email.com'), 'a@b.com');
    await user.click(screen.getByText('Gửi mã xác minh'));
    await vi.waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith('Không thể gửi mã xác minh');
    });
  });
});

describe('<EmailAuthModal /> — step 2: verify OTP', () => {
  async function moveToStep2(user) {
    apiPostMock.mockResolvedValueOnce({ data: {} });
    await user.type(screen.getByPlaceholderText('example@email.com'), 'a@b.com');
    await user.click(screen.getByText('Gửi mã xác minh'));
    await vi.waitFor(() => {
      expect(screen.getByText(/Nhập mã 6 số/)).toBeInTheDocument();
    });
    apiPostMock.mockReset();
  }

  it('hiển thị email user đã nhập', async () => {
    const user = userEvent.setup();
    render(<EmailAuthModal isOpen onClose={vi.fn()} />);
    await moveToStep2(user);
    expect(screen.getByText('a@b.com')).toBeInTheDocument();
  });

  it('nhập digit → auto focus sang input kế tiếp', async () => {
    const user = userEvent.setup();
    render(<EmailAuthModal isOpen onClose={vi.fn()} />);
    await moveToStep2(user);
    const input0 = document.getElementById('modal-code-0');
    fireEvent.change(input0, { target: { value: '1' } });
    expect(input0.value).toBe('1');
    expect(document.activeElement.id).toBe('modal-code-1');
  });

  it('ký tự không phải số → bị reject (digit không đổi)', async () => {
    const user = userEvent.setup();
    render(<EmailAuthModal isOpen onClose={vi.fn()} />);
    await moveToStep2(user);
    const input0 = document.getElementById('modal-code-0');
    fireEvent.change(input0, { target: { value: 'a' } });
    expect(input0.value).toBe('');
  });

  it('Backspace tại ô trống → focus về ô trước', async () => {
    const user = userEvent.setup();
    render(<EmailAuthModal isOpen onClose={vi.fn()} />);
    await moveToStep2(user);
    const input1 = document.getElementById('modal-code-1');
    input1.focus();
    fireEvent.keyDown(input1, { key: 'Backspace' });
    expect(document.activeElement.id).toBe('modal-code-0');
  });

  it('paste 6 chữ số → fill toàn bộ input', async () => {
    const user = userEvent.setup();
    render(<EmailAuthModal isOpen onClose={vi.fn()} />);
    await moveToStep2(user);
    const container = document.getElementById('modal-code-0').parentElement;
    fireEvent.paste(container, {
      clipboardData: { getData: () => '123456' },
    });
    expect(document.getElementById('modal-code-0').value).toBe('1');
    expect(document.getElementById('modal-code-5').value).toBe('6');
    expect(screen.getByText(/Đã nhập đủ mã/)).toBeInTheDocument();
  });

  it('paste có ký tự không số → strip non-digit', async () => {
    const user = userEvent.setup();
    render(<EmailAuthModal isOpen onClose={vi.fn()} />);
    await moveToStep2(user);
    const container = document.getElementById('modal-code-0').parentElement;
    fireEvent.paste(container, {
      clipboardData: { getData: () => 'ab12c34' },
    });
    expect(document.getElementById('modal-code-0').value).toBe('1');
    expect(document.getElementById('modal-code-3').value).toBe('4');
    expect(document.getElementById('modal-code-4').value).toBe('');
  });

  it('Xác minh thiếu số (button disabled) → click không gọi API', async () => {
    const user = userEvent.setup();
    render(<EmailAuthModal isOpen onClose={vi.fn()} />);
    await moveToStep2(user);
    const verifyBtn = screen.getByText('Xác minh');
    expect(verifyBtn).toBeDisabled();
    await user.click(verifyBtn);
    expect(apiPostMock).not.toHaveBeenCalled();
  });

  it('Verify thành công → onClose + toast.success', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<EmailAuthModal isOpen onClose={onClose} />);
    await moveToStep2(user);
    fireEvent.paste(document.getElementById('modal-code-0').parentElement, {
      clipboardData: { getData: () => '123456' },
    });
    apiPostMock.mockResolvedValueOnce({ data: {} });
    await user.click(screen.getByText('Xác minh'));
    await vi.waitFor(() => {
      expect(apiPostMock).toHaveBeenCalledWith('/verification/verify-code', {
        email: 'a@b.com',
        code: '123456',
      });
      expect(toastSuccessMock).toHaveBeenCalledWith('Xác minh thành công!');
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('Verify lỗi → toast.error theo response, không onClose', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<EmailAuthModal isOpen onClose={onClose} />);
    await moveToStep2(user);
    fireEvent.paste(document.getElementById('modal-code-0').parentElement, {
      clipboardData: { getData: () => '123456' },
    });
    apiPostMock.mockRejectedValueOnce({ response: { data: { message: 'Mã sai' } } });
    await user.click(screen.getByText('Xác minh'));
    await vi.waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith('Mã sai');
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('click "Đổi email" → quay lại step 1', async () => {
    const user = userEvent.setup();
    render(<EmailAuthModal isOpen onClose={vi.fn()} />);
    await moveToStep2(user);
    await user.click(screen.getByText('Đổi email'));
    expect(screen.getByPlaceholderText('example@email.com')).toBeInTheDocument();
    expect(screen.getByText('Nhập email để nhận mã xác minh')).toBeInTheDocument();
  });

  it('click "Gửi lại mã" → call API + clear digits + toast', async () => {
    const user = userEvent.setup();
    render(<EmailAuthModal isOpen onClose={vi.fn()} />);
    await moveToStep2(user);
    fireEvent.change(document.getElementById('modal-code-0'), { target: { value: '9' } });
    apiPostMock.mockResolvedValueOnce({ data: {} });
    await user.click(screen.getByText('Gửi lại mã'));
    await vi.waitFor(() => {
      expect(apiPostMock).toHaveBeenCalledWith('/verification/send-code', { email: 'a@b.com' });
      expect(toastSuccessMock).toHaveBeenCalledWith('Mã mới đã được gửi!');
    });
    expect(document.getElementById('modal-code-0').value).toBe('');
  });

  it('"Gửi lại mã" lỗi → toast.error "Không thể gửi lại mã"', async () => {
    const user = userEvent.setup();
    render(<EmailAuthModal isOpen onClose={vi.fn()} />);
    await moveToStep2(user);
    apiPostMock.mockRejectedValueOnce(new Error('x'));
    await user.click(screen.getByText('Gửi lại mã'));
    await vi.waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith('Không thể gửi lại mã');
    });
  });
});

describe('<EmailAuthModal /> — re-open reset state', () => {
  it('đóng rồi mở lại → quay lại step 1 với email rỗng', async () => {
    apiPostMock.mockResolvedValueOnce({ data: {} });
    const user = userEvent.setup();
    const { rerender } = render(<EmailAuthModal isOpen onClose={vi.fn()} />);
    await user.type(screen.getByPlaceholderText('example@email.com'), 'a@b.com');
    await user.click(screen.getByText('Gửi mã xác minh'));
    await vi.waitFor(() => expect(screen.getByText(/Nhập mã 6 số/)).toBeInTheDocument());

    rerender(<EmailAuthModal isOpen={false} onClose={vi.fn()} />);
    rerender(<EmailAuthModal isOpen onClose={vi.fn()} />);

    expect(screen.getByPlaceholderText('example@email.com')).toHaveValue('');
    expect(screen.queryByText(/Nhập mã 6 số/)).not.toBeInTheDocument();
  });
});
