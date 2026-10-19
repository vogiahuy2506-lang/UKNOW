import { useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../../i18n';
import viDict from '../../../i18n/vi.js';
import { useAuthStore } from '../../../stores/authStore';
import AiMessageWriter from '../AiMessageWriter';
import { CustomPanel } from '../../campaigns/simple/ContentStep';

const { mockWrite } = vi.hoisted(() => ({ mockWrite: vi.fn() }));
vi.mock('../../../services/aiApi', () => ({ default: { writeMessage: mockWrite } }));
vi.mock('react-hot-toast', () => ({ default: { error: vi.fn(), success: vi.fn() } }));

// Nhãn đọc từ vi.js: gõ tay là đỏ giả khi ai đó sửa câu chữ.
const T = viDict.aiMessageWriter;

const OK = { success: true, data: { refused: false, subject: 'Mời dự webinar', body: 'Kính mời bạn dự webinar.', warnings: [], missingVariables: [] } };

/** Ô soạn giả: giữ body trong state để Áp dụng / Hoàn tác chạy như trong trang thật. */
function Harness({ initialBody = '', initialSubject = '', channel = 'zalo', context = 'template', format = 'text', selection = null, spy }) {
  const [body, setBody] = useState(initialBody);
  const [subject, setSubject] = useState(initialSubject);
  return (
    <I18nProvider>
      <div data-testid="body">{body}</div>
      <div data-testid="subject">{subject}</div>
      <AiMessageWriter
        channel={channel}
        context={context}
        format={format}
        subject={subject}
        body={body}
        getSelection={selection ? () => selection : undefined}
        onApply={(next) => {
          spy?.(next);
          setBody(next.body);
          if (next.subject !== undefined) setSubject(next.subject);
        }}
      />
    </I18nProvider>
  );
}

const open = () => fireEvent.click(screen.getByTestId('ai-message-writer-button'));
const submit = async () => {
  await act(async () => { fireEvent.click(screen.getByTestId('ai-message-writer-write')); });
};

describe('AiMessageWriter — Viết bằng AI cho mẫu tin / chiến dịch', () => {
  beforeEach(() => {
    localStorage.clear();
    mockWrite.mockReset();
    mockWrite.mockResolvedValue(OK);
    useAuthStore.setState({ activeContext: { type: 'self' } });
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('ô soạn trống → chế độ Viết mới; ví dụ bấm điền nhanh; gửi mode create', async () => {
    render(<Harness channel="email" />);
    open();
    expect(screen.getByText(T.createLabel)).toBeTruthy();
    expect(screen.queryByTestId('ai-message-writer-quick-shorter')).toBeNull();
    fireEvent.click(screen.getByTestId('ai-message-writer-exampleEmail1'));
    expect(screen.getByTestId('ai-message-writer-instruction').value).toBe(T.exampleEmail1);
    await submit();
    expect(mockWrite).toHaveBeenCalledTimes(1);
    expect(mockWrite.mock.calls[0][0]).toMatchObject({ mode: 'create', channel: 'email', context: 'template', instruction: T.exampleEmail1, current: { format: 'text' } });
  });

  it('ô soạn trống mà chưa nhập gì → báo thiếu, KHÔNG gọi AI', async () => {
    render(<Harness />);
    open();
    await submit();
    expect(mockWrite).not.toHaveBeenCalled();
    expect(screen.getByText(T.instructionRequired)).toBeTruthy();
  });

  it('ô soạn có chữ → chế độ Sửa; chip nhanh gửi đúng quickAction và bản hiện tại', async () => {
    render(<Harness initialBody="Xin chào {{ten_khach}}" channel="zalo" />);
    open();
    expect(screen.getByTestId('ai-message-writer-quick-shorter')).toBeTruthy();
    fireEvent.click(screen.getByTestId('ai-message-writer-quick-friendlier'));
    await submit();
    expect(mockWrite.mock.calls[0][0]).toMatchObject({ mode: 'edit', quickAction: 'friendlier', current: { body: 'Xin chào {{ten_khach}}', format: 'text' } });
    expect(mockWrite.mock.calls[0][0].selection).toBeUndefined();
  });

  it('Sửa mà không chọn chip lẫn yêu cầu → báo, không gọi AI', async () => {
    render(<Harness initialBody="Nội dung" />);
    open();
    await submit();
    expect(mockWrite).not.toHaveBeenCalled();
    expect(screen.getByText(T.editNeedsInput)).toBeTruthy();
  });

  it('xem trước rồi mới áp: Áp dụng thay nội dung + tiêu đề, Hoàn tác trả lại bản cũ', async () => {
    const spy = vi.fn();
    render(<Harness channel="email" initialSubject="Cũ" initialBody="Nội dung cũ" spy={spy} />);
    open();
    fireEvent.click(screen.getByTestId('ai-message-writer-quick-shorter'));
    await submit();
    expect(screen.getByTestId('ai-message-writer-result')).toBeTruthy();
    expect(screen.getByTestId('ai-message-writer-new').textContent).toContain('Kính mời bạn dự webinar.');
    expect(screen.getByTestId('body').textContent).toBe('Nội dung cũ'); // chưa áp
    fireEvent.click(screen.getByTestId('ai-message-writer-apply'));
    expect(screen.getByTestId('body').textContent).toBe('Kính mời bạn dự webinar.');
    expect(screen.getByTestId('subject').textContent).toBe('Mời dự webinar');
    fireEvent.click(screen.getByTestId('ai-message-writer-undo'));
    expect(screen.getByTestId('body').textContent).toBe('Nội dung cũ');
    expect(screen.getByTestId('subject').textContent).toBe('Cũ');
    expect(screen.queryByTestId('ai-message-writer-undo')).toBeNull();
  });

  it('người dùng gõ tiếp sau khi áp thì Hoàn tác biến mất (không đè chữ mới)', async () => {
    function Typing() {
      const [body, setBody] = useState('Cũ');
      return (
        <I18nProvider>
          <button type="button" data-testid="type" onClick={() => setBody((b) => `${b} thêm`)}>type</button>
          <AiMessageWriter channel="zalo" body={body} onApply={(n) => setBody(n.body)} />
        </I18nProvider>
      );
    }
    render(<Typing />);
    open();
    fireEvent.click(screen.getByTestId('ai-message-writer-quick-shorter'));
    await submit();
    fireEvent.click(screen.getByTestId('ai-message-writer-apply'));
    expect(screen.getByTestId('ai-message-writer-undo')).toBeTruthy();
    fireEvent.click(screen.getByTestId('type'));
    expect(screen.queryByTestId('ai-message-writer-undo')).toBeNull();
  });

  it('bôi đen → gửi selection, chỉ thay đúng đoạn đó, giữ phần còn lại', async () => {
    mockWrite.mockResolvedValue({ success: true, data: { refused: false, body: 'Kính chào quý khách', warnings: [], missingVariables: [] } });
    render(<Harness initialBody="Mở đầu. Chào bạn nhé. Kết thúc." selection={{ start: 8, end: 21 }} />);
    open();
    expect(screen.getByText(T.onlySelection.replace('{n}', '13'))).toBeTruthy();
    fireEvent.click(screen.getByTestId('ai-message-writer-quick-formal'));
    await submit();
    expect(mockWrite.mock.calls[0][0].selection).toBe('Chào bạn nhé.');
    fireEvent.click(screen.getByTestId('ai-message-writer-apply'));
    expect(screen.getByTestId('body').textContent).toBe('Mở đầu. Kính chào quý khách Kết thúc.');
  });

  it('tắt "Chỉ sửa đoạn đã chọn" → không gửi selection', async () => {
    render(<Harness initialBody="Mở đầu. Chào bạn nhé. Kết thúc." selection={{ start: 8, end: 21 }} />);
    open();
    fireEvent.click(screen.getByTestId('ai-message-writer-only-selection'));
    fireEvent.click(screen.getByTestId('ai-message-writer-quick-formal'));
    await submit();
    expect(mockWrite.mock.calls[0][0].selection).toBeUndefined();
  });

  it('"Viết lại từ đầu" chuyển sang Viết mới, có cảnh báo sẽ thay toàn bộ', async () => {
    render(<Harness initialBody="Nội dung đang có" />);
    open();
    fireEvent.click(screen.getByTestId('ai-message-writer-rewrite'));
    expect(screen.getByTestId('ai-message-writer-rewrite-warning').textContent).toBe(T.rewriteWarning);
    fireEvent.change(screen.getByTestId('ai-message-writer-instruction'), { target: { value: 'Viết mới hoàn toàn' } });
    await submit();
    expect(mockWrite.mock.calls[0][0].mode).toBe('create');
  });

  it('bị từ chối → hiện câu của server (không phải lỗi đỏ), không có nút Áp dụng', async () => {
    mockWrite.mockResolvedValue({ success: true, data: { refused: true, message: 'Mình chỉ giúp viết tin gửi khách.' } });
    render(<Harness />);
    open();
    fireEvent.change(screen.getByTestId('ai-message-writer-instruction'), { target: { value: 'viết code python' } });
    await submit();
    const notice = screen.getByTestId('ai-message-writer-notice-refused');
    expect(notice.textContent).toContain('Mình chỉ giúp viết tin gửi khách.');
    expect(notice.getAttribute('role')).toBe('status');
    expect(screen.queryByTestId('ai-message-writer-apply')).toBeNull();
  });

  it('hết credit (402) → thông báo hạn mức kèm nút nâng cấp', async () => {
    mockWrite.mockRejectedValue({ response: { status: 402, data: { code: 'RESOURCE_LIMIT_EXCEEDED', resource: 'ai_credit', message: 'Hết lượt AI' } } });
    render(<Harness />);
    open();
    fireEvent.change(screen.getByTestId('ai-message-writer-instruction'), { target: { value: 'nhắc thanh toán' } });
    await submit();
    expect(screen.getByTestId('ai-message-writer-notice-credit').textContent).toContain('Hết lượt AI');
    expect(screen.getByText(T.upgrade)).toBeTruthy();
  });

  it('layout_changed → báo hiệu mẫu không đổi, kèm câu của server', async () => {
    mockWrite.mockRejectedValue({ response: { status: 422, data: { code: 'layout_changed', message: 'Thử chọn một đoạn chữ.' } } });
    render(<Harness channel="email" format="html" initialBody="<p>Chào</p>" />);
    open();
    fireEvent.click(screen.getByTestId('ai-message-writer-quick-shorter'));
    await submit();
    expect(screen.getByTestId('ai-message-writer-notice-layout').textContent).toContain('Thử chọn một đoạn chữ.');
  });

  it('cảnh báo mất biến hiện kèm danh sách', async () => {
    mockWrite.mockResolvedValue({ success: true, data: { refused: false, body: 'Chào bạn', warnings: ['missing_variables'], missingVariables: ['ten_khach'] } });
    render(<Harness initialBody="Chào {{ten_khach}}" />);
    open();
    fireEvent.click(screen.getByTestId('ai-message-writer-quick-shorter'));
    await submit();
    expect(screen.getByTestId('ai-message-writer-missing-variables').textContent).toContain('{{ten_khach}}');
  });

  it('nhân viên không có quyền → không thấy nút; có quyền thì thấy (khoá theo context + kênh)', () => {
    useAuthStore.setState({ activeContext: { type: 'employee', ownerId: 1, permissions: { email_templates: true } } });
    const { unmount } = render(<Harness channel="email" context="template" />);
    expect(screen.queryByTestId('ai-message-writer-button')).not.toBeNull();
    unmount();

    render(<Harness channel="zalo" context="template" />);
    expect(screen.queryByTestId('ai-message-writer-button')).toBeNull();
  });

  it('chỗ Tự soạn của chiến dịch cần campaigns_create, quyền mẫu không đủ', () => {
    useAuthStore.setState({ activeContext: { type: 'employee', ownerId: 1, permissions: { email_templates: true, zalo_templates: true } } });
    const { unmount } = render(<Harness channel="email" context="campaign" />);
    expect(screen.queryByTestId('ai-message-writer-button')).toBeNull();
    unmount();

    useAuthStore.setState({ activeContext: { type: 'employee', ownerId: 1, permissions: { campaigns_create: true } } });
    render(<Harness channel="email" context="campaign" />);
    expect(screen.queryByTestId('ai-message-writer-button')).not.toBeNull();
  });

  it('dùng được ở mục Nội dung chiến dịch (tin Tự soạn): context campaign, kênh Zalo nhóm quy về zalo, ghi vào ô nội dung', async () => {
    const patchContent = vi.fn();
    render(
      <I18nProvider>
        <CustomPanel
          isEmail={false}
          channel="zalo_group"
          content={{ mode: 'custom', subject: '', body: '' }}
          patchContent={patchContent}
          t={(key) => key}
          idPrefix="x-content"
        />
      </I18nProvider>,
    );
    fireEvent.click(screen.getByTestId('x-content-ai-writer-button'));
    fireEvent.change(screen.getByTestId('x-content-ai-writer-instruction'), { target: { value: 'nhắc thanh toán' } });
    await act(async () => { fireEvent.click(screen.getByTestId('x-content-ai-writer-write')); });
    expect(mockWrite.mock.calls[0][0]).toMatchObject({ context: 'campaign', channel: 'zalo', mode: 'create' });
    await waitFor(() => screen.getByTestId('x-content-ai-writer-apply'));
    fireEvent.click(screen.getByTestId('x-content-ai-writer-apply'));
    expect(patchContent).toHaveBeenCalledWith(expect.objectContaining({ body: 'Kính mời bạn dự webinar.' }));
  });

  it('bấm Viết hai lần sát nhau chỉ gọi AI một lần', async () => {
    let resolve;
    mockWrite.mockReturnValue(new Promise((r) => { resolve = r; }));
    render(<Harness />);
    open();
    fireEvent.change(screen.getByTestId('ai-message-writer-instruction'), { target: { value: 'nhắc thanh toán' } });
    fireEvent.click(screen.getByTestId('ai-message-writer-write'));
    fireEvent.click(screen.getByTestId('ai-message-writer-write'));
    expect(mockWrite).toHaveBeenCalledTimes(1);
    await act(async () => { resolve(OK); });
  });
});
