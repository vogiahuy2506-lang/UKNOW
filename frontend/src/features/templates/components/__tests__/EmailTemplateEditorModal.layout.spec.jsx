import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useRef, useState } from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { I18nProvider } from '../../../../i18n';
import EmailTemplateEditorModal from '../EmailTemplateEditorModal';
import { STORAGE_KEYS } from '../../utils/templateEditorLayout';

vi.mock('react-hot-toast', () => ({
  default: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
}));

const submitSpy = vi.fn();

/** Mô phỏng đúng phần trang cha: activeInput, ref ô tiêu đề, insertVariableAtCursor chèn vào ô đang chọn. */
const Harness = ({ initial = {}, hideSubjectField = false }) => {
  const [formData, setFormData] = useState({
    templateName: '', subject: '', category: '', bodyHtml: '', bodyText: '', attachments: [], ...initial,
  });
  const [activeInput, setActiveInput] = useState('html');
  const [contentTab, setContentTab] = useState('html');
  const subjectInputRef = useRef(null);
  const htmlTextareaRef = useRef(null);
  const textTextareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const editorContainerRef = useRef(null);

  const insertVariableAtCursor = (key) => {
    if (activeInput === 'subject') {
      const input = subjectInputRef.current;
      if (!input) return;
      const pos = input.selectionStart || 0;
      setFormData((p) => ({ ...p, subject: `${p.subject.slice(0, pos)}{{${key}}}${p.subject.slice(pos)}` }));
      return;
    }
    setFormData((p) => ({ ...p, bodyHtml: `${p.bodyHtml}{{${key}}}` }));
  };

  return (
    <I18nProvider>
      <EmailTemplateEditorModal
        showEditorModal
        editingTemplate={null}
        setShowEditorModal={() => {}}
        setEditingTemplate={() => {}}
        handleSubmit={(e) => { e.preventDefault(); submitSpy(formData); }}
        formData={formData}
        setFormData={setFormData}
        subjectInputRef={subjectInputRef}
        setActiveInput={setActiveInput}
        updateSubjectValue={(value) => setFormData((p) => ({ ...p, subject: value }))}
        fileInputRef={fileInputRef}
        handleFileSelect={() => {}}
        isUploading={false}
        setShowAttachmentsModal={() => {}}
        contentTab={contentTab}
        setIsPreviewVisible={() => {}}
        isPreviewVisible={false}
        editorContainerRef={editorContainerRef}
        editorSplit={50}
        setContentTab={setContentTab}
        setShowVariableSuggestions={() => {}}
        htmlTextareaRef={htmlTextareaRef}
        textTextareaRef={textTextareaRef}
        updateContentValue={(type, value) => setFormData((p) => ({ ...p, [type === 'html' ? 'bodyHtml' : 'bodyText']: value }))}
        showVariableSuggestions={false}
        variables={[]}
        activeInput={activeInput}
        suggestionPosition={{ top: 0, left: 0 }}
        variableQuery=""
        insertVariableAtCursor={insertVariableAtCursor}
        startResize={() => {}}
        editorPreviewIframeRef={{ current: null }}
        editorPreviewSrcDoc=""
        resizeIframeToContent={() => {}}
        hideSubjectField={hideSubjectField}
        labels={[{ id: 1, name: 'marketing', color: '#f97316' }]}
      />
    </I18nProvider>
  );
};

const panel = () => screen.getByTestId('template-customer-info-panel');
const separator = () => screen.getByRole('separator');
const submitForm = () => fireEvent.submit(document.getElementById('email-template-editor-form'));

describe('EmailTemplateEditorModal - dải Thông tin mẫu và cột Chèn thông tin khách', () => {
  beforeEach(() => {
    window.localStorage.clear();
    submitSpy.mockClear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('mặc định dải đóng: có tóm tắt, ô nhập bị ẩn', () => {
    render(<Harness initial={{ templateName: 'Chào mừng', subject: 'Xin chào {{ten_khach}}', category: 'marketing' }} />);
    expect(screen.getByTestId('template-info-summary-name')).toHaveTextContent('Chào mừng');
    expect(screen.getByTestId('template-info-summary-subject')).toHaveTextContent('Xin chào {{ten_khach}}');
    expect(screen.getByTestId('template-info-summary-label')).toHaveTextContent('marketing');
    expect(screen.getByTestId('template-info-strip').querySelector('#template-info-fields')).toHaveClass('hidden');
    expect(screen.getByRole('button', { name: /Thông tin mẫu/ })).toHaveAttribute('aria-expanded', 'false');
  });

  it('ô trống hiện chữ mờ Chưa đặt tên / Chưa có tiêu đề', () => {
    render(<Harness />);
    expect(screen.getByTestId('template-info-summary-name')).toHaveTextContent('Chưa đặt tên');
    expect(screen.getByTestId('template-info-summary-subject')).toHaveTextContent('Chưa có tiêu đề');
  });

  it('mẫu tin nhắn (không tiêu đề): tóm tắt chỉ tên và nhãn', () => {
    render(<Harness hideSubjectField initial={{ templateName: 'Tin Zalo', category: 'marketing' }} />);
    expect(screen.getByTestId('template-info-summary-name')).toHaveTextContent('Tin Zalo');
    expect(screen.queryByTestId('template-info-summary-subject')).toBeNull();
    expect(screen.getByTestId('template-info-summary-label')).toBeInTheDocument();
  });

  it('bấm dải mở ba ô và nhớ vào localStorage', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: /Thông tin mẫu/ }));
    expect(screen.getByTestId('template-info-strip').querySelector('#template-info-fields')).not.toHaveClass('hidden');
    expect(screen.queryByTestId('template-info-summary')).toBeNull();
    expect(window.localStorage.getItem(STORAGE_KEYS.infoOpen)).toBe('1');
  });

  it('Lưu thiếu tên: tự mở dải, focus ô tên, không gọi handleSubmit', () => {
    render(<Harness initial={{ subject: 'Có tiêu đề' }} />);
    submitForm();
    expect(submitSpy).not.toHaveBeenCalled();
    expect(screen.getByTestId('template-info-strip').querySelector('#template-info-fields')).not.toHaveClass('hidden');
    expect(document.activeElement).toBe(screen.getByLabelText('Tên template'));
  });

  it('Lưu có tên nhưng thiếu tiêu đề: focus ô tiêu đề', () => {
    render(<Harness initial={{ templateName: 'Có tên' }} />);
    submitForm();
    expect(submitSpy).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByLabelText('Tiêu đề email'));
  });

  it('mẫu tin nhắn không bắt tiêu đề: có tên là lưu được khi dải đóng', () => {
    render(<Harness hideSubjectField initial={{ templateName: 'Tin' }} />);
    submitForm();
    expect(submitSpy).toHaveBeenCalledTimes(1);
  });

  it('đủ tên + tiêu đề: gọi handleSubmit, dải vẫn đóng', () => {
    render(<Harness initial={{ templateName: 'A', subject: 'B' }} />);
    submitForm();
    expect(submitSpy).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('template-info-summary')).toBeInTheDocument();
  });

  it('chip chèn vào ô tiêu đề khi con trỏ đang ở tiêu đề (dải mở)', () => {
    render(<Harness initial={{ templateName: 'A', subject: 'Chào ' }} />);
    fireEvent.click(screen.getByRole('button', { name: /Thông tin mẫu/ }));
    const subject = screen.getByLabelText('Tiêu đề email');
    subject.focus();
    fireEvent.focus(subject);
    subject.setSelectionRange(5, 5);
    fireEvent.click(screen.getByRole('button', { name: /Tên khách hàng/ }));
    expect(subject.value).toBe('Chào {{ten_khach}}');
  });

  it('dải đóng lại khi con trỏ ở tiêu đề: chip chèn về nội dung, không mất', () => {
    render(<Harness initial={{ templateName: 'A', subject: 'Chào ' }} />);
    fireEvent.click(screen.getByRole('button', { name: /Thông tin mẫu/ }));
    fireEvent.focus(screen.getByLabelText('Tiêu đề email'));
    fireEvent.click(screen.getByRole('button', { name: /Thông tin mẫu/ }));
    fireEvent.click(screen.getByRole('button', { name: /Email khách hàng/ }));
    expect(screen.getByPlaceholderText(/HTML/).value).toBe('{{email_khach}}');
  });

  it('cột Chèn thông tin khách mặc định mở, rộng 320, thu gọn / mở lại và nhớ', () => {
    render(<Harness />);
    expect(panel()).toHaveAttribute('data-open', 'true');
    expect(separator()).toHaveAttribute('aria-valuenow', '320');
    fireEvent.click(screen.getByTestId('template-customer-info-toggle'));
    expect(panel()).toHaveAttribute('data-open', 'false');
    expect(screen.queryByRole('separator')).toBeNull();
    expect(window.localStorage.getItem(STORAGE_KEYS.panelOpen)).toBe('0');
    fireEvent.click(screen.getByTestId('template-customer-info-toggle'));
    expect(panel()).toHaveAttribute('data-open', 'true');
    expect(window.localStorage.getItem(STORAGE_KEYS.panelOpen)).toBe('1');
  });

  it('phím mũi tên đổi độ rộng trong giới hạn 240-520 và nhớ', () => {
    render(<Harness />);
    const sep = separator();
    fireEvent.keyDown(sep, { key: 'ArrowLeft' });
    expect(sep).toHaveAttribute('aria-valuenow', '336');
    fireEvent.keyDown(sep, { key: 'ArrowRight' });
    fireEvent.keyDown(sep, { key: 'ArrowRight' });
    expect(sep).toHaveAttribute('aria-valuenow', '304');
    for (let i = 0; i < 30; i += 1) fireEvent.keyDown(sep, { key: 'ArrowLeft' });
    expect(sep).toHaveAttribute('aria-valuenow', '520');
    for (let i = 0; i < 40; i += 1) fireEvent.keyDown(sep, { key: 'ArrowRight' });
    expect(sep).toHaveAttribute('aria-valuenow', '240');
    expect(window.localStorage.getItem(STORAGE_KEYS.panelWidth)).toBe('240');
    expect(panel().style.getPropertyValue('--template-panel-w')).toBe('240px');
  });

  it('kéo chuột đổi độ rộng, bị chặn ở 520 và 240', () => {
    render(<Harness />);
    const sep = separator();
    fireEvent.mouseDown(sep, { clientX: 1000 });
    act(() => { window.dispatchEvent(new MouseEvent('mousemove', { clientX: 950 })); });
    expect(sep).toHaveAttribute('aria-valuenow', '370');
    act(() => { window.dispatchEvent(new MouseEvent('mousemove', { clientX: 0 })); });
    expect(sep).toHaveAttribute('aria-valuenow', '520');
    act(() => { window.dispatchEvent(new MouseEvent('mousemove', { clientX: 5000 })); });
    expect(sep).toHaveAttribute('aria-valuenow', '240');
    act(() => { window.dispatchEvent(new MouseEvent('mouseup')); });
    expect(window.localStorage.getItem(STORAGE_KEYS.panelWidth)).toBe('240');
  });

  it('đọc trạng thái đã nhớ từ localStorage (dải mở, cột thu, rộng 400; rộng ngoài giới hạn bị ép)', () => {
    window.localStorage.setItem(STORAGE_KEYS.infoOpen, '1');
    window.localStorage.setItem(STORAGE_KEYS.panelOpen, '0');
    window.localStorage.setItem(STORAGE_KEYS.panelWidth, '9999');
    render(<Harness />);
    expect(screen.queryByTestId('template-info-summary')).toBeNull();
    expect(panel()).toHaveAttribute('data-open', 'false');
    fireEvent.click(screen.getByTestId('template-customer-info-toggle'));
    expect(separator()).toHaveAttribute('aria-valuenow', '520');
  });

  it('localStorage ném lỗi vẫn chạy với mặc định', () => {
    // Chỉ chặn khoá của trang soạn mẫu; khoá khác (ngôn ngữ giao diện) vẫn đọc bình thường.
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation((key) => {
      if (String(key).startsWith('uknow.templateEditor')) throw new Error('blocked');
      return null;
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation((key) => {
      if (String(key).startsWith('uknow.templateEditor')) throw new Error('blocked');
    });
    render(<Harness />);
    expect(screen.getByTestId('template-info-summary')).toBeInTheDocument();
    expect(separator()).toHaveAttribute('aria-valuenow', '320');
    fireEvent.click(screen.getByRole('button', { name: /Thông tin mẫu/ }));
    fireEvent.click(screen.getByTestId('template-customer-info-toggle'));
    expect(panel()).toHaveAttribute('data-open', 'false');
  });
});
