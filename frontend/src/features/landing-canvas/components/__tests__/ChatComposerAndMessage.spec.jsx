import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ChatComposer from '../ChatComposer.jsx';
import ChatMessage from '../ChatMessage.jsx';
import toast from 'react-hot-toast';
import api from '../../../../services/api.js';

vi.mock('../../../../services/api.js');

vi.mock('react-hot-toast', () => ({
  default: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('../../../../i18n', () => ({
  useI18n: (namespace = null) => {
    const t = (key) => {
      if (namespace === 'landingCanvas.chat') {
        if (key === 'filesOnlyPrompt') return 'Dùng các tệp đính kèm cho trang này';
        if (key === 'attach') return 'Đính kèm tệp';
        if (key === 'removeFile') return 'Bỏ tệp';
      }
      return namespace ? `${namespace}.${key}` : key;
    };
    if (namespace) return t;
    return { t, locale: 'vi' };
  },
}));

vi.mock('../../../storage/useStorageQuota', () => ({
  default: () => ({ usage: null }),
}));

vi.mock('../../../storage/storageEvents', () => ({
  notifyStorageQuotaRefresh: vi.fn(),
}));

describe('ChatComposer (PR-3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.URL.createObjectURL = vi.fn(() => 'blob:http://localhost/preview');
  });

  it('đính kèm file → upload temp, hiện chip, cho gửi với prompt mặc định khi không nhập text', async () => {
    api.post.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          tempId: 'tmp_landing_1',
          originalName: 'banner.png',
          contentType: 'image/png',
          size: 2048,
        },
      },
    });

    const onSend = vi.fn();
    render(<ChatComposer onSend={onSend} />);

    const file = new File(['fake-png'], 'banner.png', { type: 'image/png' });
    const fileInput = document.querySelector('input[type="file"]');
    expect(fileInput).not.toBeNull();
    expect(fileInput.getAttribute('accept')).toContain('.gif');
    expect(fileInput.getAttribute('accept')).toContain('.heic');
    expect(fileInput.getAttribute('accept')).toContain('.txt');
    expect(fileInput.getAttribute('accept')).toContain('.csv');
    expect(fileInput.getAttribute('accept')).toContain('.xlsx');
    expect(fileInput.getAttribute('accept')).toContain('.xls');
    expect(fileInput.getAttribute('accept')).toContain('.pptx');

    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText('banner.png')).toBeInTheDocument();
    });

    expect(api.post).toHaveBeenCalledWith(
      '/uploads/temp',
      expect.any(FormData),
      expect.objectContaining({ headers: { 'Content-Type': 'multipart/form-data' } })
    );

    // Không nhập textarea, bấm nút gửi trực tiếp
    const sendBtn = screen.getByTitle('landingCanvas.chat.send');
    expect(sendBtn).not.toBeDisabled();
    fireEvent.click(sendBtn);

    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith({
      prompt: 'Dùng các tệp đính kèm cho trang này',
      files: [
        expect.objectContaining({
          tempId: 'tmp_landing_1',
          originalName: 'banner.png',
          contentType: 'image/png',
        }),
      ],
    });

    // Sau khi gửi, chip được dọn sạch
    expect(screen.queryByText('banner.png')).not.toBeInTheDocument();
  });

  it('nút xoá file loại bỏ chip khỏi composer', async () => {
    api.post.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          tempId: 'tmp_landing_2',
          originalName: 'tailieu.pdf',
          contentType: 'application/pdf',
          size: 1024,
        },
      },
    });

    render(<ChatComposer onSend={vi.fn()} />);

    const file = new File(['pdf-data'], 'tailieu.pdf', { type: 'application/pdf' });
    const fileInput = document.querySelector('input[type="file"]');
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText('tailieu.pdf')).toBeInTheDocument();
    });

    const removeBtn = screen.getByTitle('Bỏ tệp');
    fireEvent.click(removeBtn);

    expect(screen.queryByText('tailieu.pdf')).not.toBeInTheDocument();
  });

  it('server từ chối tải lên → toast hiện đúng lý do server trả, không phải câu chung chung', async () => {
    api.post.mockRejectedValueOnce({
      response: {
        status: 507,
        data: {
          success: false,
          code: 'STORAGE_CAPACITY_PROTECTED',
          message: 'Hệ thống đang tạm ngừng nhận tệp mới để bảo vệ dữ liệu. Vui lòng thử lại sau.',
        },
      },
    });

    render(<ChatComposer onSend={vi.fn()} />);

    const file = new File(['img'], 'logo.png', { type: 'image/png' });
    fireEvent.change(document.querySelector('input[type="file"]'), { target: { files: [file] } });

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'Hệ thống đang tạm ngừng nhận tệp mới để bảo vệ dữ liệu. Vui lòng thử lại sau.'
      );
    });
    expect(screen.queryByText('logo.png')).not.toBeInTheDocument();
  });

  it('lỗi mạng không có phản hồi server → vẫn hiện câu chung', async () => {
    api.post.mockRejectedValueOnce(new Error('Network Error'));

    render(<ChatComposer onSend={vi.fn()} />);

    const file = new File(['pdf'], 'tailieu.pdf', { type: 'application/pdf' });
    fireEvent.change(document.querySelector('input[type="file"]'), { target: { files: [file] } });

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('landingCanvas.chat.uploadError');
    });
  });
});

describe('ChatMessage (PR-3)', () => {
  it('tin user hiển thị chip tệp đính kèm', () => {
    const msg = {
      id: 'msg_1',
      role: 'user',
      content: 'Chèn ảnh này vào hero',
      files: [
        { tempId: 't1', originalName: 'hero.webp', contentType: 'image/webp' },
      ],
    };

    render(<ChatMessage msg={msg} />);
    expect(screen.getByText('hero.webp')).toBeInTheDocument();
    expect(screen.getByText('Chèn ảnh này vào hero')).toBeInTheDocument();
  });
});
