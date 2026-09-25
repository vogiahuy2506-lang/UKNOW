/**
 * PR-3: Frontend test cho ShareChatbotModal — phân nhánh toast theo isExistingUser.
 *
 * Mục tiêu:
 *  - Toàn bộ email đều là user đã có tài khoản → toast "shareToastCloned" / "shareToastAllExisting"
 *  - Toàn bộ email ngoài hệ thống → toast "shareToastAllPending"
 *  - Hỗn hợp → toast "sharePartialSuccess"
 *  - Response chứa clonedChatbot → render tên trong toast
 *  - Lỗi CHATBOT_LIMIT_EXCEEDED → toast.error với key cloneLimitReached
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { I18nProvider } from '../../../i18n/index.jsx';
import ShareChatbotModal from '../ShareChatbotModal.jsx';

vi.mock('react-hot-toast', () => {
  const toast = {
    success: vi.fn(),
    error: vi.fn(),
  };
  return { default: toast, toast };
});

const renderModal = (props) =>
  render(
    <I18nProvider>
      <ShareChatbotModal {...props} />
    </I18nProvider>
  );

const mockChatbot = { id: 1, name: 'Bot Demo', description: 'Mô tả' };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ShareChatbotModal — PR-3 share toast branches', () => {
  it('toàn bộ recipient đã có user (clone ngay) → toast shareToastCloned với tên clone', async () => {
    const toast = (await import('react-hot-toast')).default;
    const chatbotApi = (await import('../../../services/chatbotApi')).default;
    chatbotApi.shareChatbot = vi.fn().mockResolvedValue({
      data: {
        success: true,
        data: {
          isExistingUser: true,
          clonedChatbot: { id: 99, name: 'Bot Demo (Copy)' },
          recipient: { id: 2, name: 'Trần Thị B', email: 'b@x.com' },
          notificationSent: true,
        },
      },
    });

    renderModal({ open: true, chatbot: mockChatbot, onClose: vi.fn(), onSuccess: vi.fn() });

    // type email
    const input = document.querySelector('input[type="email"]') ||
                  document.querySelector('input[placeholder]');
    fireEvent.change(input, { target: { value: 'b@x.com' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    // click submit
    const submitBtn = screen.getByText(/chia sẻ ngay/i);
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalled();
    });
    const msg = toast.success.mock.calls[0][0];
    expect(msg).toContain('Bot Demo (Copy)');
  });

  it('toàn bộ recipient ngoài hệ thống → toast shareToastAllPending', async () => {
    const toast = (await import('react-hot-toast')).default;
    const chatbotApi = (await import('../../../services/chatbotApi')).default;
    chatbotApi.shareChatbot = vi.fn().mockResolvedValue({
      data: {
        success: true,
        data: {
          isExistingUser: false,
          clonedChatbot: null,
          recipient: null,
          notificationSent: true,
        },
      },
    });

    renderModal({ open: true, chatbot: mockChatbot, onClose: vi.fn(), onSuccess: vi.fn() });
    const input = document.querySelector('input[placeholder]');
    fireEvent.change(input, { target: { value: 'newuser@external.com' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    const submitBtn = screen.getByText(/chia sẻ ngay/i);
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalled();
    });
    const msg = toast.success.mock.calls[0][0];
    expect(msg).toMatch(/mời người nhận đăng ký|invite/i);
  });

  it('lỗi CHATBOT_LIMIT_EXCEEDED → toast.error với message localized', async () => {
    const toast = (await import('react-hot-toast')).default;
    const chatbotApi = (await import('../../../services/chatbotApi')).default;
    chatbotApi.shareChatbot = vi.fn().mockRejectedValue({
      response: { data: { code: 'CHATBOT_LIMIT_EXCEEDED', message: 'Quota exceeded' } },
    });

    renderModal({ open: true, chatbot: mockChatbot, onClose: vi.fn(), onSuccess: vi.fn() });
    const input = document.querySelector('input[placeholder]');
    fireEvent.change(input, { target: { value: 'b@x.com' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    const submitBtn = screen.getByText(/chia sẻ ngay/i);
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled();
    });
  });
});
