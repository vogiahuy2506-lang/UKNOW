import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useRef, useState } from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { I18nProvider } from '../../../../i18n';
import viDict from '../../../../i18n/vi.js';
import { useAuthStore } from '../../../../stores/authStore';
import EmailTemplateEditorModal from '../EmailTemplateEditorModal';

const { mockWrite } = vi.hoisted(() => ({ mockWrite: vi.fn() }));
vi.mock('../../../../services/aiApi', () => ({ default: { writeMessage: mockWrite } }));
vi.mock('react-hot-toast', () => ({
  default: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
}));

const T = viDict.aiMessageWriter;

// Mô phỏng phần trang cha: formData + hai textarea ref + tab nội dung.
const Harness = ({ kind = 'email', initial = {}, onForm }) => {
  const [formData, setFormData] = useState({
    templateName: '', subject: '', category: '', bodyHtml: '', bodyText: '', attachments: [], ...initial,
  });
  const [contentTab, setContentTab] = useState(kind === 'zalo' ? 'text' : 'html');
  const htmlTextareaRef = useRef(null);
  const textTextareaRef = useRef(null);
  onForm?.(formData);
  return (
    <I18nProvider>
      <EmailTemplateEditorModal
        showEditorModal
        editingTemplate={null}
        setShowEditorModal={() => {}}
        setEditingTemplate={() => {}}
        handleSubmit={() => {}}
        formData={formData}
        setFormData={setFormData}
        subjectInputRef={useRef(null)}
        setActiveInput={() => {}}
        updateSubjectValue={() => {}}
        fileInputRef={useRef(null)}
        handleFileSelect={() => {}}
        isUploading={false}
        setShowAttachmentsModal={() => {}}
        contentTab={contentTab}
        setIsPreviewVisible={() => {}}
        isPreviewVisible={false}
        editorContainerRef={useRef(null)}
        editorSplit={50}
        setContentTab={setContentTab}
        setShowVariableSuggestions={() => {}}
        htmlTextareaRef={htmlTextareaRef}
        textTextareaRef={textTextareaRef}
        updateContentValue={(type, value) => setFormData((p) => ({ ...p, [type === 'html' ? 'bodyHtml' : 'bodyText']: value }))}
        showVariableSuggestions={false}
        variables={[]}
        activeInput={contentTab}
        suggestionPosition={{ top: 0, left: 0 }}
        variableQuery=""
        insertVariableAtCursor={() => {}}
        startResize={() => {}}
        editorPreviewIframeRef={{ current: null }}
        editorPreviewSrcDoc=""
        resizeIframeToContent={() => {}}
        hideHtmlTab={kind === 'zalo'}
        hideSubjectField={kind === 'zalo'}
        templateKindLabel={kind}
        labels={[]}
      />
    </I18nProvider>
  );
};

const run = async () => {
  fireEvent.click(screen.getByTestId('template-ai-writer-button'));
  fireEvent.change(screen.getByTestId('template-ai-writer-instruction'), { target: { value: 'mời dự webinar' } });
  await act(async () => { fireEvent.click(screen.getByTestId('template-ai-writer-write')); });
  fireEvent.click(screen.getByTestId('template-ai-writer-apply'));
};

describe('EmailTemplateEditorModal — nút Viết bằng AI', () => {
  beforeEach(() => {
    mockWrite.mockReset();
    useAuthStore.setState({ activeContext: { type: 'self' } });
  });

  it('HTML Editor: viết mới gửi format html, kênh email, và ghi tiêu đề + bodyHtml', async () => {
    mockWrite.mockResolvedValue({ data: { refused: false, subject: 'Mời webinar', body: '<p>Kính mời</p>', warnings: [], missingVariables: [] } });
    let latest;
    render(<Harness onForm={(f) => { latest = f; }} />);
    expect(screen.getByText(T.button)).toBeTruthy();
    await run();
    expect(mockWrite.mock.calls[0][0]).toMatchObject({ mode: 'create', channel: 'email', context: 'template', current: { format: 'html' } });
    expect(latest.bodyHtml).toBe('<p>Kính mời</p>');
    expect(latest.subject).toBe('Mời webinar');
    expect(latest.bodyText).toBe('');
  });

  it('Định dạng Text: gửi format text và ghi vào bodyText, không đụng bodyHtml', async () => {
    mockWrite.mockResolvedValue({ data: { refused: false, subject: 'Mời', body: 'Kính mời bạn', warnings: [], missingVariables: [] } });
    let latest;
    render(<Harness initial={{ bodyHtml: '<p>Giữ nguyên</p>' }} onForm={(f) => { latest = f; }} />);
    fireEvent.click(screen.getByText(viDict.emailTemplateEditor.textEditor));
    await run();
    expect(mockWrite.mock.calls[0][0].current.format).toBe('text');
    expect(latest.bodyText).toBe('Kính mời bạn');
    expect(latest.bodyHtml).toBe('<p>Giữ nguyên</p>');
  });

  it('HTML Editor có nội dung: chế độ sửa, gửi nguyên HTML hiện tại', async () => {
    mockWrite.mockResolvedValue({ data: { refused: false, body: '<p>Ngắn</p>', warnings: [], missingVariables: [] } });
    render(<Harness initial={{ subject: 'Tiêu đề', bodyHtml: '<table><tr><td>Dài dòng</td></tr></table>' }} />);
    fireEvent.click(screen.getByTestId('template-ai-writer-button'));
    fireEvent.click(screen.getByTestId('template-ai-writer-quick-shorter'));
    await act(async () => { fireEvent.click(screen.getByTestId('template-ai-writer-write')); });
    expect(mockWrite.mock.calls[0][0]).toMatchObject({
      mode: 'edit', quickAction: 'shorter', current: { subject: 'Tiêu đề', body: '<table><tr><td>Dài dòng</td></tr></table>', format: 'html' },
    });
  });

  it('mẫu tin nhắn: kênh zalo, không có tiêu đề, ghi vào bodyText', async () => {
    mockWrite.mockResolvedValue({ data: { refused: false, body: 'Nhắc bạn thanh toán', warnings: [], missingVariables: [] } });
    let latest;
    render(<Harness kind="zalo" onForm={(f) => { latest = f; }} />);
    await run();
    expect(mockWrite.mock.calls[0][0]).toMatchObject({ channel: 'zalo', context: 'template', current: { format: 'text' } });
    expect(latest.bodyText).toBe('Nhắc bạn thanh toán');
  });
});
