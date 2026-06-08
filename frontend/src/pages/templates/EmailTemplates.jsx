import { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { useI18n } from '../../i18n';
import EmailTemplateListSection from '../../features/templates/components/EmailTemplateListSection';
import EmailTemplateEditorModal from '../../features/templates/components/EmailTemplateEditorModal';
import EmailTemplatePreviewModal from '../../features/templates/components/EmailTemplatePreviewModal';
import EmailTemplateAttachmentsModal from '../../features/templates/components/EmailTemplateAttachmentsModal';
import emailTemplateApiService from '../../features/templates/services/emailTemplateApi.service';
import zaloTemplateApiService from '../../features/templates/services/zaloTemplateApi.service';
import templateLabelApiService from '../../features/templates/services/templateLabelApi.service';
import CreateLabelModal from '../../features/templates/components/CreateLabelModal';
import emailTemplateUploadApiService from '../../features/templates/services/emailTemplateUploadApi.service';
import fetchAllTemplateListPages from '../../features/templates/utils/fetchAllTemplateListPages';
import useEmailTemplateDerivedData from '../../features/templates/hooks/useEmailTemplateDerivedData';
import FullScreenOverlay from '../../components/FullScreenOverlay';
import {
  getCaretPosition,
  getCaretPositionForInput,
  getCategoryBadge,
  resizeIframeToContent,
  resolveAttachmentKey,
  wrapEmailSrcDoc,
} from '../../features/templates/utils/emailTemplateEditor.helpers';

const EmailTemplates = ({ isZaloTemplate = false, aiDraft = null, channelTabs = null, activeChannel = null, onChannelChange = null }) => {
  const { t } = useI18n();
  const templateApiService = isZaloTemplate ? zaloTemplateApiService : emailTemplateApiService;
  const templateKindLabel = isZaloTemplate ? 'zalo' : 'email';
  const subjectLabel = isZaloTemplate ? t('templates.zaloSubject') : t('templates.emailSubject');
  const pageTitle = isZaloTemplate ? t('templates.zaloLibraryTitle') : t('templates.libraryTitle');
  const pageDescription = isZaloTemplate ? t('templates.zaloTemplateDescription') : t('templates.templateDescription');
  const emptyDescription = isZaloTemplate ? t('templates.firstZaloTemplateTip') : t('templates.firstTemplateTip');
  const [templates, setTemplates] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('');

  const [labels, setLabels] = useState([]);
  const [showLabelModal, setShowLabelModal] = useState(false);
  const [showEditorModal, setShowEditorModal] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [previewTemplate, setPreviewTemplate] = useState(null);
  const [editorTab, setEditorTab] = useState('content');
  const [contentTab, setContentTab] = useState(isZaloTemplate ? 'text' : 'html');
  const [variables, setVariables] = useState([]);
  const [showAttachmentsModal, setShowAttachmentsModal] = useState(false);
  const [newVariable, setNewVariable] = useState({ name: '', key: '' });
  const [editingVariableIndex, setEditingVariableIndex] = useState(null);
  const [editingVariable, setEditingVariable] = useState({ name: '', key: '' });
  const [showVariableSuggestions, setShowVariableSuggestions] = useState(false);
  const [variableQuery, setVariableQuery] = useState('');
  const [activeInput, setActiveInput] = useState(isZaloTemplate ? 'text' : 'html');
  const [isPreviewVisible, setIsPreviewVisible] = useState(true);
  const [editorSplit, setEditorSplit] = useState(55);
  const [isResizing, setIsResizing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [lockedTemplate, setLockedTemplate] = useState(null);
  const [isCreatingLockedTemplateCopy, setIsCreatingLockedTemplateCopy] = useState(false);
  const [suggestionPosition, setSuggestionPosition] = useState({ top: 0, left: 0 });
  const htmlTextareaRef = useRef(null);
  const textTextareaRef = useRef(null);
  const textEditorRef = useRef(null);
  const editorPreviewIframeRef = useRef(null);
  const modalPreviewIframeRef = useRef(null);
  const editorContainerRef = useRef(null);
  const fileInputRef = useRef(null);
  const textSelectionRef = useRef(null);
  const subjectInputRef = useRef(null);

  const [formData, setFormData] = useState({
    templateName: '',
    subject: '',
    bodyHtml: '',
    bodyText: '',
    attachments: [],
    category: 'marketing',
  });
  
  // Track files cần xóa khỏi S3
  const [deletedAttachments, setDeletedAttachments] = useState([]);

  useEffect(() => {
    fetchTemplates();
    fetchLabels();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ fetch 1 lần lúc mount
  }, []);

  // Auto-open editor with AI-generated draft from chatbot
  useEffect(() => {
    if (!aiDraft) return;
    setEditingTemplate(null);
    setFormData({
      templateName: aiDraft.templateName || '',
      subject: aiDraft.subject || '',
      bodyHtml: aiDraft.bodyHtml || '',
      bodyText: aiDraft.bodyText || '',
      attachments: [],
      category: aiDraft.category || 'marketing',
    });
    setVariables([]);
    setDeletedAttachments([]);
    const nextTab = isZaloTemplate ? 'text' : (aiDraft.bodyHtml ? 'html' : 'text');
    setContentTab(nextTab);
    setActiveInput(nextTab);
    setShowEditorModal(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ react khi aiDraft đổi; isZaloTemplate là route-based prop ổn định
  }, [aiDraft]);

  const {
    editorPreviewSrcDoc,
    filteredTemplates,
    previewAttachments,
  } = useEmailTemplateDerivedData({
    bodyHtml: formData.bodyHtml,
    templates,
    searchTerm,
    filterCategory,
    previewTemplate,
  });

  /**
   * Tải toàn bộ template (email hoặc Zalo): API mặc định limit nhỏ nên gom đủ trang qua util dùng chung.
   */
  const fetchTemplates = async () => {
    try {
      const aggregated = await fetchAllTemplateListPages((params) =>
        templateApiService.getTemplates(params)
      );
      setTemplates(aggregated);
    } catch (error) {
      setTemplates([]);
      toast.error(t('templates.loadFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  const fetchLabels = async () => {
    try {
      const res = await templateLabelApiService.getLabels();
      setLabels(res.data?.data ?? []);
    } catch {
      // non-critical — keep empty
    }
  };

  const handleCreateLabel = async (payload) => {
    const res = await templateLabelApiService.createLabel(payload);
    setLabels((prev) => [...prev, res.data.data].sort((a, b) => a.name.localeCompare(b.name)));
  };

  const handleDeleteLabel = async (id) => {
    await templateLabelApiService.deleteLabel(id);
    setLabels((prev) => prev.filter((l) => l.id !== id));
  };

  const fetchTemplateDetail = async (id) => {
    const response = await templateApiService.getTemplateById(id);
    return response.data?.data;
  };

  /**
   * Open editor modal with detail payload from API.
   *
   * @param {Object|null} detail template detail response
   * @param {Object|null} fallback fallback template object from list
   * @returns {void}
   */
  const openEditorWithTemplateDetail = (detail, fallback = null) => {
    const source = detail || fallback || {};
    const bodyHtml = source?.bodyHtml || '';
    const bodyText = source?.bodyText || '';
    setEditingTemplate(source);
    setFormData({
      templateName: source?.templateName || '',
      subject: source?.subject || '',
      bodyHtml,
      bodyText,
      attachments: Array.isArray(source?.attachments)
        ? source.attachments.map((att) => ({
            ...att,
            name: att?.name || att?.originalName || att?.fileName,
            displayName: att?.displayName || '',
            isTemp: false,
          }))
        : [],
      category: source?.category || 'marketing',
    });
    setVariables(Array.isArray(source?.variables) ? source.variables : []);
    setDeletedAttachments([]);
    const nextTab = isZaloTemplate ? 'text' : (bodyHtml ? 'html' : 'text');
    setContentTab(nextTab);
    setActiveInput(nextTab);
    setShowEditorModal(true);
  };

  const saveTextSelection = () => {
    const editor = textEditorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    if (editor.contains(range.commonAncestorContainer)) {
      textSelectionRef.current = range;
    }
  };

  useEffect(() => {
    if (!isPreviewVisible || contentTab !== 'html') return;
    // Wait a tick for iframe to apply srcDoc before measuring.
    const t = window.setTimeout(() => resizeIframeToContent(editorPreviewIframeRef.current), 0);
    return () => window.clearTimeout(t);
  }, [editorPreviewSrcDoc, isPreviewVisible, contentTab]);

  useEffect(() => {
    if (contentTab !== 'text') return;
    const editor = textEditorRef.current;
    if (!editor) return;
    if (editor.innerHTML !== (formData.bodyText || '')) {
      editor.innerHTML = formData.bodyText || '';
    }
  }, [contentTab, formData.bodyText]);

  useEffect(() => {
    if (!isResizing) return;
    const handleMove = (event) => {
      const container = editorContainerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const offsetX = event.clientX - rect.left;
      const percent = (offsetX / rect.width) * 100;
      const next = Math.min(75, Math.max(25, percent));
      setEditorSplit(next);
    };
    const handleUp = () => setIsResizing(false);

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [isResizing]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const allAttachments = formData.attachments || [];

      // Auto-fill displayName trống theo thứ tự toàn bộ danh sách
      const withAutoName = (att, globalIndex) => ({
        ...att,
        displayName: att.displayName?.trim() || t('templates.giftNumber', { number: globalIndex + 1 }),
      });
      const namedAll = allAttachments.map(withAutoName);
      const namedTemp = namedAll.filter(att => att.isTemp && att.tempId);
      const namedExisting = namedAll.filter(att => !att.isTemp);

      const payload = {
        ...formData,
        bodyHtml: isZaloTemplate ? '' : (contentTab === 'html' ? formData.bodyHtml : ''),
        bodyText: isZaloTemplate ? formData.bodyText : (contentTab === 'text' ? formData.bodyText : ''),
        variables,
        // Gửi temp attachments riêng để backend xử lý
        tempAttachments: namedTemp.map(att => ({
          tempId: att.tempId,
          originalName: att.originalName || att.name,
          size: att.size,
          contentType: att.contentType,
          displayName: att.displayName,
        })),
        // Existing attachments (đã có trên S3)
        attachments: namedExisting,
        // Files cần xóa khỏi S3
        deletedAttachments: deletedAttachments
      };
      
      if (editingTemplate) {
        await templateApiService.updateTemplate(editingTemplate.id, payload);
        toast.success(t('templates.updateSuccess'));
      } else {
        await templateApiService.createTemplate(payload);
        toast.success(t('templates.createSuccess'));
      }
      setShowEditorModal(false);
      setEditingTemplate(null);
      resetForm();
      fetchTemplates();
    } catch (error) {
      if (!error._upgradeToastShown) {
        toast.error(error.response?.data?.message || t('templates.error'));
      }
    }
  };

  const handleEdit = async (template) => {
    try {
      const detail = await fetchTemplateDetail(template.id);
      if (detail?.activeUsage?.isUsedInActiveCampaign) {
        setLockedTemplate(detail || template);
        return;
      }
      openEditorWithTemplateDetail(detail, template);
    } catch (error) {
      toast.error(t('templates.loadContentFailed'));
    }
  };

  const handleCreateCopyForLockedTemplate = async () => {
    if (!lockedTemplate || isCreatingLockedTemplateCopy) return;
    setIsCreatingLockedTemplateCopy(true);
    try {
      const copiedName = `${lockedTemplate.templateName || 'Template'} (${t('common.copy')})`;
      const response = await templateApiService.createTemplate({
        templateName: copiedName,
        subject: lockedTemplate.subject || '',
        bodyHtml: lockedTemplate.bodyHtml || '',
        bodyText: lockedTemplate.bodyText || '',
        attachments: Array.isArray(lockedTemplate.attachments) ? lockedTemplate.attachments : [],
        category: lockedTemplate.category || 'marketing',
        variables: Array.isArray(lockedTemplate.variables) ? lockedTemplate.variables : [],
      });
      const copiedTemplateId = response?.data?.data?.id;
      const copiedTemplateDetail = copiedTemplateId
        ? await fetchTemplateDetail(copiedTemplateId)
        : null;

      toast.success(t('templates.copyCreated'));
      setLockedTemplate(null);
      await fetchTemplates();
      if (copiedTemplateDetail) {
        openEditorWithTemplateDetail(copiedTemplateDetail, response?.data?.data || null);
      }
    } catch (error) {
      toast.error(error.response?.data?.message || t('templates.copyFailed'));
    } finally {
      setIsCreatingLockedTemplateCopy(false);
    }
  };

  const handlePreview = async (template) => {
    try {
      const detail = await fetchTemplateDetail(template.id);
      setPreviewTemplate(detail || template);
      setShowPreviewModal(true);
    } catch (error) {
      toast.error(t('templates.loadContentFailed'));
    }
  };

  const handleDuplicate = async (template) => {
    try {
      const detail = await fetchTemplateDetail(template.id);
      await templateApiService.createTemplate({
        templateName: `${detail?.templateName || template.templateName} (${t('common.copy')})`,
        subject: detail?.subject || template.subject,
        bodyHtml: detail?.bodyHtml || '',
        bodyText: detail?.bodyText || '',
        attachments: Array.isArray(detail?.attachments) ? detail.attachments : [],
        category: detail?.category || template.category,
        variables: Array.isArray(detail?.variables) ? detail.variables : [],
      });
      toast.success(t('templates.copied'));
      fetchTemplates();
    } catch (error) {
      toast.error(t('templates.copyToClipboardFailed'));
    }
  };

  const handleDelete = async (id) => {
    if (!confirm(t('templates.confirmDelete'))) return;
    try {
      await templateApiService.deleteTemplate(id);
      toast.success(t('templates.deleted'));
      fetchTemplates();
    } catch (error) {
      toast.error(t('templates.deleteFailed'));
    }
  };

  const resetForm = () => {
    setFormData({
      templateName: '',
      subject: '',
      bodyHtml: '',
      bodyText: '',
      attachments: [],
      category: 'marketing',
    });
    setVariables([]);
    setDeletedAttachments([]);
    setNewVariable({ name: '', key: '' });
    setEditingVariableIndex(null);
    setEditingVariable({ name: '', key: '' });
  };

  const handleAddVariable = () => {
    if (!newVariable.name.trim() || !newVariable.key.trim()) return;
    setVariables((prev) => [...prev, { ...newVariable }]);
    setNewVariable({ name: '', key: '' });
  };

  const handleRemoveVariable = (index) => {
    setVariables((prev) => prev.filter((_, i) => i !== index));
  };

  const handleStartEditVariable = (index) => {
    setEditingVariableIndex(index);
    setEditingVariable({
      name: variables[index]?.name || '',
      key: variables[index]?.key || '',
    });
  };

  const handleCancelEditVariable = () => {
    setEditingVariableIndex(null);
    setEditingVariable({ name: '', key: '' });
  };

  const handleSaveEditVariable = () => {
    if (editingVariableIndex === null) return;
    setVariables((prev) =>
      prev.map((item, i) =>
        i === editingVariableIndex
          ? { ...item, name: editingVariable.name, key: editingVariable.key }
          : item
      )
    );
    handleCancelEditVariable();
  };

  const updateSubjectValue = (value, selectionStart) => {
    setActiveInput('subject');
    setFormData((prev) => ({
      ...prev,
      subject: value,
    }));

    const beforeCursor = value.slice(0, selectionStart);
    const triggerIndex = beforeCursor.lastIndexOf('{{');
    if (triggerIndex !== -1) {
      const query = beforeCursor.slice(triggerIndex + 2);
      if (/^[\w.]*$/.test(query)) {
        setVariableQuery(query);
        if (subjectInputRef.current) {
          setSuggestionPosition(getCaretPositionForInput(subjectInputRef.current, selectionStart));
        }
        setShowVariableSuggestions(true);
        return;
      }
    }
    setShowVariableSuggestions(false);
  };

  const updateContentValue = (type, value, selectionStart) => {
    setActiveInput(type);
    setFormData((prev) => ({
      ...prev,
      [type === 'html' ? 'bodyHtml' : 'bodyText']: value,
    }));

    const beforeCursor = value.slice(0, selectionStart);
    const triggerIndex = beforeCursor.lastIndexOf('{{');
    if (triggerIndex !== -1) {
      const query = beforeCursor.slice(triggerIndex + 2);
      if (/^[\w.]*$/.test(query)) {
        setVariableQuery(query);
        const textareaRef = type === 'text' ? textTextareaRef.current : htmlTextareaRef.current;
        if (textareaRef) {
          setSuggestionPosition(getCaretPosition(textareaRef, selectionStart));
        }
        setShowVariableSuggestions(true);
        return;
      }
    }
    setShowVariableSuggestions(false);
  };

  // Giữ lại cho tính năng rich-text editor chưa wire up
  const _insertHtmlAtCursor = (snippet) => {
    const ref = htmlTextareaRef.current;
    if (!ref) return;
    const start = ref.selectionStart ?? 0;
    const end = ref.selectionEnd ?? 0;
    const before = formData.bodyHtml.slice(0, start);
    const after = formData.bodyHtml.slice(end);
    const nextValue = `${before}${snippet}${after}`;

    setFormData((prev) => ({
      ...prev,
      bodyHtml: nextValue,
    }));

    requestAnimationFrame(() => {
      ref.focus();
      const cursor = start + snippet.length;
      ref.setSelectionRange(cursor, cursor);
    });
  };

  const _insertHtmlToTextEditor = (snippet) => {
    const editor = textEditorRef.current;
    if (!editor) return;
    const selection = window.getSelection();
    if (selection && textSelectionRef.current) {
      selection.removeAllRanges();
      selection.addRange(textSelectionRef.current);
    }
    editor.focus();
    document.execCommand('insertHTML', false, snippet);
    setFormData((prev) => ({
      ...prev,
      bodyText: editor.innerHTML,
    }));
    saveTextSelection();
  };

  const startResize = (event) => {
    event.preventDefault();
    setIsResizing(true);
  };

  const _handleToolbarMouseDown = (event) => {
    event.preventDefault();
  };

  const _applyTextCommand = (command, value = null) => {
    const editor = textEditorRef.current;
    if (!editor) return;
    const selection = window.getSelection();
    if (selection && textSelectionRef.current) {
      selection.removeAllRanges();
      selection.addRange(textSelectionRef.current);
    }
    editor.focus();
    document.execCommand(command, false, value);
    setFormData((prev) => ({
      ...prev,
      bodyText: editor.innerHTML,
    }));
    saveTextSelection();
  };

  const _focusTextEditor = () => {
    if (textEditorRef.current) {
      textEditorRef.current.focus();
    }
  };

  const handleFileSelect = async (event) => {
    const file = event.target.files?.[0];
    if (!file || isUploading) return;
    setIsUploading(true);
    try {
      const payload = new FormData();
      payload.append('file', file);
      const response = await emailTemplateUploadApiService.uploadTempFile(payload);
      
      const tempData = response.data?.data;
      if (!tempData || !tempData.tempId) {
        throw new Error('missing-temp-id');
      }

      // Thêm temp file vào attachments với thông tin temp
      setFormData((prev) => ({
        ...prev,
        attachments: [
          ...(Array.isArray(prev.attachments) ? prev.attachments : []),
          {
            name: file.name,
            tempId: tempData.tempId,
            originalName: tempData.originalName,
            size: tempData.size,
            contentType: tempData.contentType,
            displayName: '',
            isTemp: true,
          },
        ],
      }));

      toast.success(t('templates.uploadSuccess'));
    } catch (error) {
      console.error('Upload error:', error);
      toast.error(t('templates.uploadFailed'));
    } finally {
      setIsUploading(false);
      event.target.value = '';
    }
  };

  /**
   * Mở attachment ở chế độ xem trực tiếp trên tab mới.
   *
   * Luồng hoạt động:
   * 1. Chặn file tạm vì backend chưa lưu chính thức.
   * 2. Lấy lại URL preview mới nhất từ backend theo storage key.
   * 3. Mở URL preview để trình duyệt tự render (inline viewer).
   *
   * @param {object} attachment metadata file đính kèm
   */
  const handleOpenAttachment = async (attachment) => {
    if (attachment?.isTemp) {
      toast.error(t('templates.temporaryNotViewable'));
      return;
    }

    const key = resolveAttachmentKey(attachment);
    let nextUrl = attachment?.url || attachment?.link || attachment?.attachmentUrl || null;

    if (key) {
      try {
        const response = await emailTemplateUploadApiService.getSignedUrlByKey(key, { preview: true });
        const freshUrl = response?.data?.data?.url;
        if (freshUrl) {
          nextUrl = freshUrl;
        }
      } catch (error) {
        toast.error(error?.response?.data?.message || t('templates.createLinkFailed'));
        return;
      }
    }

    if (!nextUrl) {
      toast.error(t('templates.fileNotFound'));
      return;
    }

    window.open(nextUrl, '_blank', 'noopener,noreferrer');
  };

  const insertVariableAtCursor = (variableKey) => {
    if (activeInput === 'subject') {
      const input = subjectInputRef.current;
      if (!input) return;
      const value = formData.subject || '';
      const start = input.selectionStart || 0;
      const end = input.selectionEnd || 0;
      const before = value.slice(0, start);
      const triggerIndex = before.lastIndexOf('{{');
      const insertStart = triggerIndex !== -1 ? triggerIndex : start;
      const newValue = value.slice(0, insertStart) + `{{${variableKey}}}` + value.slice(end);

      setFormData((prev) => ({ ...prev, subject: newValue }));
      setShowVariableSuggestions(false);

      requestAnimationFrame(() => {
        const cursorPos = insertStart + variableKey.length + 4;
        input.focus();
        input.setSelectionRange(cursorPos, cursorPos);
      });
      return;
    }

    const isTextInput = activeInput === 'text';
    const ref = isTextInput ? textTextareaRef.current : htmlTextareaRef.current;
    if (!ref) return;
    const value = isTextInput ? formData.bodyText : formData.bodyHtml;
    const start = ref.selectionStart || 0;
    const end = ref.selectionEnd || 0;
    const before = value.slice(0, start);
    const triggerIndex = before.lastIndexOf('{{');
    const insertStart = triggerIndex !== -1 ? triggerIndex : start;
    const newValue = value.slice(0, insertStart) + `{{${variableKey}}}` + value.slice(end);

    // Lưu scroll position trước khi setState để khôi phục sau khi focus
    const savedScrollTop = ref.scrollTop;

    setFormData((prev) => ({
      ...prev,
      [isTextInput ? 'bodyText' : 'bodyHtml']: newValue,
    }));
    setShowVariableSuggestions(false);

    requestAnimationFrame(() => {
      const cursorPos = insertStart + variableKey.length + 4;
      ref.focus();
      ref.setSelectionRange(cursorPos, cursorPos);
      ref.scrollTop = savedScrollTop;
    });
  };

  /**
   * Thêm một biến gợi ý vào danh sách biến của template.
   * Nếu biến đã tồn tại (trùng key) thì bỏ qua và thông báo.
   *
   * @param {{ name: string, key: string }} suggestedVar - Biến gợi ý cần thêm
   */
  const handleAddSuggestedVariable = (suggestedVar) => {
    const exists = variables.some((v) => v.key === suggestedVar.key);
    if (exists) {
      toast(t('templates.variableAlreadyExists'), { icon: 'ℹ️' });
      return;
    }
    setVariables((prev) => [...prev, { ...suggestedVar }]);
    toast.success(t('templates.variableAddedWithKey', { key: suggestedVar.key }));
  };

  return (
    <div className="space-y-6">
      <EmailTemplateListSection
        isLoading={isLoading}
        filteredTemplates={filteredTemplates}
        templates={templates}
        labels={labels}
        filterCategory={filterCategory}
        setFilterCategory={setFilterCategory}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        onCreateTemplate={() => {
          setEditingTemplate(null);
          resetForm();
          setShowEditorModal(true);
        }}
        onManageLabels={() => setShowLabelModal(true)}
        channelTabs={channelTabs}
        activeChannel={activeChannel}
        onChannelChange={onChannelChange}
        getCategoryBadge={(cat) => getCategoryBadge(cat, labels)}
        handlePreview={handlePreview}
        handleDuplicate={handleDuplicate}
        handleEdit={handleEdit}
        handleDelete={handleDelete}
        title={pageTitle}
        description={pageDescription}
        emptyDescription={emptyDescription}
        searchPlaceholder={isZaloTemplate ? t('templates.searchZaloPlaceholder') : t('templates.searchPlaceholder')}
      />

      <EmailTemplateEditorModal
        showEditorModal={showEditorModal}
        editingTemplate={editingTemplate}
        setShowEditorModal={setShowEditorModal}
        setEditingTemplate={setEditingTemplate}
        handleSubmit={handleSubmit}
        formData={formData}
        setFormData={setFormData}
        subjectInputRef={subjectInputRef}
        setActiveInput={setActiveInput}
        updateSubjectValue={updateSubjectValue}
        editorTab={editorTab}
        setEditorTab={setEditorTab}
        fileInputRef={fileInputRef}
        handleFileSelect={handleFileSelect}
        isUploading={isUploading}
        setShowAttachmentsModal={setShowAttachmentsModal}
        contentTab={contentTab}
        setIsPreviewVisible={setIsPreviewVisible}
        isPreviewVisible={isPreviewVisible}
        editorContainerRef={editorContainerRef}
        editorSplit={editorSplit}
        setContentTab={setContentTab}
        setShowVariableSuggestions={setShowVariableSuggestions}
        htmlTextareaRef={htmlTextareaRef}
        textTextareaRef={textTextareaRef}
        updateContentValue={updateContentValue}
        showVariableSuggestions={showVariableSuggestions}
        variables={variables}
        activeInput={activeInput}
        suggestionPosition={suggestionPosition}
        variableQuery={variableQuery}
        insertVariableAtCursor={insertVariableAtCursor}
        startResize={startResize}
        editorPreviewIframeRef={editorPreviewIframeRef}
        editorPreviewSrcDoc={editorPreviewSrcDoc}
        resizeIframeToContent={resizeIframeToContent}
        newVariable={newVariable}
        setNewVariable={setNewVariable}
        handleAddVariable={handleAddVariable}
        editingVariableIndex={editingVariableIndex}
        editingVariable={editingVariable}
        setEditingVariable={setEditingVariable}
        handleSaveEditVariable={handleSaveEditVariable}
        handleCancelEditVariable={handleCancelEditVariable}
        handleStartEditVariable={handleStartEditVariable}
        handleRemoveVariable={handleRemoveVariable}
        handleAddSuggestedVariable={handleAddSuggestedVariable}
        hideHtmlTab={isZaloTemplate}
        hideSubjectField={isZaloTemplate}
        subjectLabel={subjectLabel}
        templateKindLabel={templateKindLabel}
        labels={labels}
      />

      <FullScreenOverlay isOpen={Boolean(lockedTemplate)} className="p-4">
        <div className="w-full max-w-lg bg-white rounded-xl shadow-xl border border-gray-200 p-5 space-y-4">
          <div className="space-y-2">
            <h3 className="text-base font-semibold text-gray-900">{t('templates.lockedTitle')}</h3>
            <p className="text-sm text-gray-600">
              {t('templates.lockedDescription')}
            </p>
          </div>

          {Array.isArray(lockedTemplate?.activeUsage?.activeCampaigns) && lockedTemplate.activeUsage.activeCampaigns.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs font-medium text-amber-800 mb-1">{t('templates.activeCampaignsUsingTemplate')}:</p>
              <ul className="text-sm text-amber-900 space-y-1">
                {lockedTemplate.activeUsage.activeCampaigns.map((campaign) => (
                  <li key={campaign.id}>- {campaign.campaignName || `${t('templates.campaign')} #${campaign.id}`}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setLockedTemplate(null)}
              disabled={isCreatingLockedTemplateCopy}
              className="px-4 py-2 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-60"
            >
              {t('common.close')}
            </button>
            <button
              type="button"
              onClick={handleCreateCopyForLockedTemplate}
              disabled={isCreatingLockedTemplateCopy}
              className="px-4 py-2 text-sm rounded-lg bg-primary-500 text-white hover:bg-primary-600 disabled:opacity-60"
            >
              {isCreatingLockedTemplateCopy ? t('templates.creating') : t('templates.createCopyToEditLocked')}
            </button>
          </div>
        </div>
      </FullScreenOverlay>

      <EmailTemplatePreviewModal
        showPreviewModal={showPreviewModal}
        previewTemplate={previewTemplate}
        previewAttachments={previewAttachments}
        getCategoryBadge={(cat) => getCategoryBadge(cat, labels)}
        handleOpenAttachment={handleOpenAttachment}
        setShowPreviewModal={setShowPreviewModal}
        wrapEmailSrcDoc={wrapEmailSrcDoc}
        modalPreviewIframeRef={modalPreviewIframeRef}
        resizeIframeToContent={resizeIframeToContent}
        subjectLabel={subjectLabel}
      />

      <EmailTemplateAttachmentsModal
        showAttachmentsModal={showAttachmentsModal}
        setShowAttachmentsModal={setShowAttachmentsModal}
        formData={formData}
        handleOpenAttachment={handleOpenAttachment}
        handleDeleteTempUpload={async (tempId) => {
          try {
            await emailTemplateUploadApiService.deleteTempFile(tempId);
          } catch {
            // ignore cleanup errors for temp uploads
          }
        }}
        setDeletedAttachments={setDeletedAttachments}
        setFormData={setFormData}
      />
      <CreateLabelModal
        isOpen={showLabelModal}
        onClose={() => setShowLabelModal(false)}
        onCreated={handleCreateLabel}
        onDeleted={handleDeleteLabel}
        existingLabels={labels}
      />
    </div>
  );
};

export default EmailTemplates;
