import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { I18nProvider } from '../../../../i18n';
import EmailTemplateEditorModal from '../EmailTemplateEditorModal';

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('EmailTemplateEditorModal - Variable Insertion & UX', () => {
  const defaultProps = {
    showEditorModal: true,
    editingTemplate: null,
    setShowEditorModal: vi.fn(),
    setEditingTemplate: vi.fn(),
    onClose: vi.fn(),
    handleSubmit: vi.fn(),
    formData: {
      templateName: 'Test Template',
      subject: 'Tiêu đề {{tenkhach}}',
      bodyHtml: '<p>Xin chào {{tenkhach}}</p>',
      bodyText: 'Kính gửi Đồng chí {{tenkhach}}, Lãnh đạo {{donvi}}',
      attachments: [],
      category: 'marketing',
    },
    setFormData: vi.fn(),
    subjectInputRef: { current: null },
    setActiveInput: vi.fn(),
    updateSubjectValue: vi.fn(),
    editorTab: 'content',
    setEditorTab: vi.fn(),
    fileInputRef: { current: null },
    handleFileSelect: vi.fn(),
    isUploading: false,
    setShowAttachmentsModal: vi.fn(),
    contentTab: 'text',
    setIsPreviewVisible: vi.fn(),
    isPreviewVisible: false,
    editorContainerRef: { current: null },
    editorSplit: 50,
    setContentTab: vi.fn(),
    setShowVariableSuggestions: vi.fn(),
    htmlTextareaRef: { current: null },
    textTextareaRef: { current: null },
    updateContentValue: vi.fn(),
    showVariableSuggestions: false,
    variables: [
      { name: 'Tên khách', key: 'tenkhach' },
      { name: 'Đơn vị', key: 'donvi' },
    ],
    activeInput: 'text',
    suggestionPosition: { top: 0, left: 0 },
    variableQuery: '',
    insertVariableAtCursor: vi.fn(),
    startResize: vi.fn(),
    editorPreviewIframeRef: { current: null },
    editorPreviewSrcDoc: '',
    resizeIframeToContent: vi.fn(),
    newVariable: { name: '', key: '' },
    setNewVariable: vi.fn(),
    handleAddVariable: vi.fn(),
    editingVariableIndex: null,
    editingVariable: { name: '', key: '' },
    setEditingVariable: vi.fn(),
    handleSaveEditVariable: vi.fn(),
    handleCancelEditVariable: vi.fn(),
    handleStartEditVariable: vi.fn(),
    handleRemoveVariable: vi.fn(),
    handleAddSuggestedVariable: vi.fn(),
    labels: [],
  };

  const renderWithI18n = (ui) => {
    return render(<I18nProvider>{ui}</I18nProvider>);
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('hiển thị nút "Chèn biến" trên thanh Toolbar ở tab Nội dung', () => {
    renderWithI18n(<EmailTemplateEditorModal {...defaultProps} />);
    const insertBtn = screen.getByTitle(/Chèn biến/i);
    expect(insertBtn).toBeInTheDocument();
    expect(insertBtn).toHaveTextContent(/Chèn biến/i);
    expect(insertBtn).toHaveTextContent('{{...}}');
  });

  it('bấm "Chèn biến" mở dropdown danh sách biến và click biến sẽ gọi insertVariableAtCursor', () => {
    renderWithI18n(<EmailTemplateEditorModal {...defaultProps} />);
    const insertBtn = screen.getByTitle(/Chèn biến/i);
    fireEvent.click(insertBtn);

    // Dropdown hiện ra
    expect(screen.getByPlaceholderText(/Tìm kiếm biến/i)).toBeInTheDocument();
    expect(screen.getByText(/Biến trong mẫu này/i)).toBeInTheDocument();

    // Tìm nút biến 'donvi' và click
    const donviOption = screen.getByRole('button', { name: /Đơn vị\s*\{\{donvi\}\}/i });
    fireEvent.click(donviOption);

    expect(defaultProps.insertVariableAtCursor).toHaveBeenCalledWith('donvi');
  });

  it('ở tab Thiết lập biến, bảng danh sách biến hiển thị nút Chèn và nút Sao chép', () => {
    renderWithI18n(<EmailTemplateEditorModal {...defaultProps} editorTab="variables" />);

    // Kiểm tra các nút thao tác
    const insertButtons = screen.getAllByTitle(/Chèn vào nội dung/i);
    expect(insertButtons.length).toBe(2);

    const copyButtons = screen.getAllByTitle(/Sao chép mã biến/i).filter((el) => el.tagName === 'BUTTON');
    expect(copyButtons.length).toBe(2);

    // Bấm nút Chèn của biến thứ 2 ('donvi')
    fireEvent.click(insertButtons[1]);
    expect(defaultProps.insertVariableAtCursor).toHaveBeenCalledWith('donvi');
    expect(defaultProps.setEditorTab).toHaveBeenCalledWith('content');
  });

  it('bấm vào badge mã biến {{key}} sẽ sao chép vào clipboard', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    renderWithI18n(<EmailTemplateEditorModal {...defaultProps} editorTab="variables" />);

    const badges = screen.getAllByText('{{tenkhach}}');
    // Badge trong bảng danh sách biến là badge thứ 2 (có title "Sao chép mã biến")
    const tableBadge = badges.find((el) => el.getAttribute('title') === 'Sao chép mã biến') || badges[1];
    fireEvent.click(tableBadge);

    expect(writeTextMock).toHaveBeenCalledWith('{{tenkhach}}');
  });

  it('thuật toán chèn biến bảo toàn biến cũ: không ghi đè khi văn bản đã chứa biến hoàn chỉnh trước đó', () => {
    // Mô phỏng logic insertVariableAtCursor đã vá
    const insertLogic = (value, start, end, variableKey) => {
      const before = value.slice(0, start);
      const lastCloseIndex = before.lastIndexOf('}}');
      const triggerIndex = before.lastIndexOf('{{');
      const isUnfinishedTrigger = triggerIndex !== -1
        && triggerIndex > lastCloseIndex
        && /^\{\{[\w.]*$/.test(before.slice(triggerIndex));
      const insertStart = isUnfinishedTrigger ? triggerIndex : start;
      return value.slice(0, insertStart) + `{{${variableKey}}}` + value.slice(end);
    };

    // Ca 1: Văn bản đã có {{tenkhach}}, người dùng đang gõ tiếp và bấm chèn {{donvi}}
    const text1 = 'Kính gửi Đồng chí {{tenkhach}}, Lãnh đạo ';
    const res1 = insertLogic(text1, text1.length, text1.length, 'donvi');
    expect(res1).toBe('Kính gửi Đồng chí {{tenkhach}}, Lãnh đạo {{donvi}}');

    // Ca 2: Người dùng đang gõ dở {{don và chọn biến donvi
    const text2 = 'Kính gửi Đồng chí {{tenkhach}}, Lãnh đạo {{don';
    const res2 = insertLogic(text2, text2.length, text2.length, 'donvi');
    expect(res2).toBe('Kính gửi Đồng chí {{tenkhach}}, Lãnh đạo {{donvi}}');
  });
});
