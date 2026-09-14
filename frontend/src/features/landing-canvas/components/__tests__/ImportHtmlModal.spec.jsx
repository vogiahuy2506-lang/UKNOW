/**
 * PLAN_LANDING_DAN_HTML_CO_SAN_2026-09-13.md, Việc 1/4 — modal "Nhập HTML".
 * Bẫy khoá lại ở đây: KHÔNG gọi AI, KHÔNG tự nâng cấp/chuẩn hoá HTML ở trình duyệt — chỉ
 * setForm({htmlContent}) thẳng nội dung người dùng dán/tải lên.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ImportHtmlModal from '../ImportHtmlModal.jsx';

vi.mock('../../../../i18n', () => ({
  useI18n: (namespace = null) => {
    const t = (key) => (namespace ? `${namespace}.${key}` : key);
    if (namespace) return t;
    return { t, locale: 'vi' };
  },
}));

const SAMPLE_HTML = '<html><body><h1>Trang mẫu</h1></body></html>';

const renderModal = (props = {}) => {
  const onApply = props.onApply ?? vi.fn();
  const onClose = props.onClose ?? vi.fn();
  const utils = render(
    <ImportHtmlModal
      isOpen={props.isOpen ?? true}
      onClose={onClose}
      currentHtml={props.currentHtml ?? ''}
      onApply={onApply}
    />
  );
  return { onApply, onClose, ...utils };
};

describe('ImportHtmlModal', () => {
  beforeEach(() => vi.clearAllMocks());

  it('isOpen=false → không render gì', () => {
    renderModal({ isOpen: false });
    expect(screen.queryByPlaceholderText('landingCanvas.importHtml.placeholder')).not.toBeInTheDocument();
  });

  it('dán HTML vào trang RỖNG → Áp dụng gọi onApply ngay, không cần xác nhận', () => {
    const { onApply, onClose } = renderModal({ currentHtml: '' });

    const textarea = screen.getByPlaceholderText('landingCanvas.importHtml.placeholder');
    fireEvent.change(textarea, { target: { value: SAMPLE_HTML } });
    fireEvent.click(screen.getByText('landingCanvas.importHtml.apply'));

    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledWith(SAMPLE_HTML);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('trang ĐANG CÓ HTML → Áp dụng hiện bước xác nhận, CHƯA gọi onApply cho tới khi Đồng ý', () => {
    const { onApply } = renderModal({ currentHtml: '<div>Nội dung cũ</div>' });

    const textarea = screen.getByPlaceholderText('landingCanvas.importHtml.placeholder');
    fireEvent.change(textarea, { target: { value: SAMPLE_HTML } });
    fireEvent.click(screen.getByText('landingCanvas.importHtml.apply'));

    expect(onApply).not.toHaveBeenCalled();
    expect(screen.getByText('landingCanvas.importHtml.replaceConfirm')).toBeInTheDocument();

    fireEvent.click(screen.getByText('landingCanvas.importHtml.confirmYes'));
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledWith(SAMPLE_HTML);
  });

  it('bước xác nhận bấm Hủy → KHÔNG gọi onApply, quay lại form (textarea vẫn còn nội dung)', () => {
    const { onApply, onClose } = renderModal({ currentHtml: '<div>Nội dung cũ</div>' });

    fireEvent.change(screen.getByPlaceholderText('landingCanvas.importHtml.placeholder'), {
      target: { value: SAMPLE_HTML },
    });
    fireEvent.click(screen.getByText('landingCanvas.importHtml.apply'));
    fireEvent.click(screen.getByText('landingCanvas.importHtml.confirmCancel'));

    expect(onApply).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText('landingCanvas.importHtml.placeholder').value).toBe(SAMPLE_HTML);
  });

  it('chọn tệp .html → FileReader đọc đúng nội dung vào textarea, KHÔNG gọi upload API', async () => {
    renderModal();

    const file = new File([SAMPLE_HTML], 'page.html', { type: 'text/html' });
    const fileInput = document.querySelector('input[type="file"]');
    expect(fileInput).not.toBeNull();
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByPlaceholderText('landingCanvas.importHtml.placeholder').value).toBe(SAMPLE_HTML);
    });
  });

  it('> 500.000 ký tự → chặn, hiện lỗi, KHÔNG gọi onApply', () => {
    const { onApply } = renderModal();
    const tooLong = `<div>${'a'.repeat(500001)}</div>`;

    fireEvent.change(screen.getByPlaceholderText('landingCanvas.importHtml.placeholder'), {
      target: { value: tooLong },
    });
    fireEvent.click(screen.getByText('landingCanvas.importHtml.apply'));

    expect(onApply).not.toHaveBeenCalled();
    expect(screen.getByText('landingCanvas.importHtml.tooLarge')).toBeInTheDocument();
  });

  it('dán HTML không có <form> → cảnh báo vàng hiện ra nhưng KHÔNG chặn Áp dụng', () => {
    const { onApply } = renderModal({ currentHtml: '' });

    fireEvent.change(screen.getByPlaceholderText('landingCanvas.importHtml.placeholder'), {
      target: { value: '<div>Không có form nào cả</div>' },
    });

    expect(screen.getByText('landingCanvas.importHtml.noFormWarning')).toBeInTheDocument();

    fireEvent.click(screen.getByText('landingCanvas.importHtml.apply'));
    expect(onApply).toHaveBeenCalledTimes(1);
  });

  it('HTML có <form> → KHÔNG hiện cảnh báo vàng', () => {
    renderModal();
    fireEvent.change(screen.getByPlaceholderText('landingCanvas.importHtml.placeholder'), {
      target: { value: '<form><input name="email"/></form>' },
    });
    expect(screen.queryByText('landingCanvas.importHtml.noFormWarning')).not.toBeInTheDocument();
  });

  it('nút đóng (X) → gọi onClose, KHÔNG gọi onApply', () => {
    const { onApply, onClose } = renderModal();
    fireEvent.change(screen.getByPlaceholderText('landingCanvas.importHtml.placeholder'), {
      target: { value: SAMPLE_HTML },
    });

    const closeButtons = screen.getAllByRole('button');
    fireEvent.click(closeButtons[0]);

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onApply).not.toHaveBeenCalled();
  });

  it('textarea rỗng → nút Áp dụng bị disabled', () => {
    renderModal();
    expect(screen.getByText('landingCanvas.importHtml.apply')).toBeDisabled();
  });
});
