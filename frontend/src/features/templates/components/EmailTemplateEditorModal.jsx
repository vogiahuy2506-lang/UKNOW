import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import {
  HiOutlineArrowLeft,
  HiOutlineEye,
  HiOutlinePaperClip,
  HiOutlinePencil,
  HiOutlinePlus,
  HiOutlineUpload,
  HiOutlineSparkles,
  HiOutlineChevronDown,
  HiOutlineLightBulb,
  HiOutlineSearch,
  HiOutlineChevronDoubleRight,
  HiOutlineUserCircle,
} from 'react-icons/hi';
import { useI18n } from '../../../i18n';
import MessageTemplateChannelLimitNotice from './MessageTemplateChannelLimitNotice';
import AiMessageWriter from '../../ai/AiMessageWriter';
import {
  CUSTOMER_FIELDS,
  buildDetectedVariables,
  extractVariableKeys,
  getVariableSource,
  normalizeCustomKey,
} from '../utils/templateVariables';
import {
  PANEL_KEY_STEP,
  PANEL_MAX_WIDTH,
  PANEL_MIN_WIDTH,
  STORAGE_KEYS,
  clampPanelWidth,
  loadBooleanPref,
  loadPanelWidth,
  saveBooleanPref,
  savePanelWidth,
} from '../utils/templateEditorLayout';

/** Nhãn mặc định lưu dạng khoá thô ("marketing"): hiển thị viết hoa chữ đầu cho dễ đọc. */
const prettifyLabelName = (value) => {
  const text = String(value || '').trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
};

const LabelPicker = ({ value, labels, onChange }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selected = labels.find((l) => l.name === value);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-3 py-1.5 bg-white dark:bg-dk-inset border border-gray-200 dark:border-dk-border rounded-xl shadow-2xs focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all text-left flex items-center gap-2"
      >
        {selected ? (
          <>
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: selected.color }} />
            <span className="text-xs sm:text-sm text-gray-800 dark:text-dk-text flex-1 truncate">{selected.name}</span>
          </>
        ) : (
          <span className="text-xs sm:text-sm text-gray-400 dark:text-dk-muted flex-1 truncate">{prettifyLabelName(value) || 'Chọn nhãn...'}</span>
        )}
        <HiOutlineChevronDown className={`w-4 h-4 text-gray-400 dark:text-dk-muted flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute z-50 top-full left-0 mt-1 w-full bg-white dark:bg-dk-surface border border-gray-200 dark:border-dk-border rounded-lg shadow-lg overflow-hidden">
          {labels.length === 0 ? (
            <div className="px-3 py-2 text-xs text-gray-400 dark:text-dk-muted">Chưa có nhãn nào</div>
          ) : (
            labels.map((label) => (
              <button
                key={label.id}
                type="button"
                onClick={() => { onChange(label.name); setOpen(false); }}
                className={`w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-dk-raised transition-colors ${value === label.name ? 'bg-primary-50 dark:bg-primary-950/40' : ''}`}
              >
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: label.color }} />
                <span className="text-sm text-gray-800 dark:text-dk-text">{label.name}</span>
                {value === label.name && <span className="ml-auto text-primary-600 dark:text-primary-400 text-xs">✓</span>}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
};

const EmailTemplateEditorModal = ({
  showEditorModal,
  editingTemplate,
  setShowEditorModal,
  setEditingTemplate,
  onClose,
  handleSubmit,
  formData,
  setFormData,
  subjectInputRef,
  setActiveInput,
  updateSubjectValue,
  fileInputRef,
  handleFileSelect,
  isUploading,
  setShowAttachmentsModal,
  contentTab,
  setIsPreviewVisible,
  isPreviewVisible,
  editorContainerRef,
  editorSplit,
  setContentTab,
  setShowVariableSuggestions,
  htmlTextareaRef,
  textTextareaRef,
  updateContentValue,
  showVariableSuggestions,
  variables,
  activeInput,
  suggestionPosition,
  variableQuery,
  insertVariableAtCursor,
  startResize,
  editorPreviewIframeRef,
  editorPreviewSrcDoc,
  resizeIframeToContent,
  hideHtmlTab = false,
  hideSubjectField = false,
  subjectLabel,
  templateKindLabel = 'email',
  labels = [],
}) => {
  const { t } = useI18n();

  /** Thông tin khách bộ chạy tự ghép được (dùng chung cho email và tin nhắn). */
  const customerFields = CUSTOMER_FIELDS.map((f) => ({ ...f, name: t(f.labelKey) }));

  /** Biến đang dùng: tự phát hiện từ tiêu đề + nội dung (`variables` chỉ giữ tên đã khai báo của mẫu cũ). */
  const detectedVariables = buildDetectedVariables(
    extractVariableKeys(formData.subject, formData.bodyHtml, formData.bodyText),
    { declared: variables, translate: (key) => t(key) },
  );

  const [showToolbarVariableMenu, setShowToolbarVariableMenu] = useState(false);
  const [toolbarVariableSearch, setToolbarVariableSearch] = useState('');
  const [customColumn, setCustomColumn] = useState('');

  // Dải "Thông tin mẫu" (mặc định đóng) + cột "Chèn thông tin khách" (mở, rộng 320px): nhớ theo trình duyệt.
  const [infoOpen, setInfoOpen] = useState(() => loadBooleanPref(STORAGE_KEYS.infoOpen, false));
  const [panelOpen, setPanelOpen] = useState(() => loadBooleanPref(STORAGE_KEYS.panelOpen, true));
  const [panelWidth, setPanelWidth] = useState(() => loadPanelWidth());
  const [isPanelResizing, setIsPanelResizing] = useState(false);
  const [pendingFocus, setPendingFocus] = useState(null);
  const nameInputRef = useRef(null);
  const panelWidthRef = useRef(panelWidth);
  const dragRef = useRef({ startX: 0, startWidth: 0 });

  const toggleInfo = () => {
    const next = !infoOpen;
    setInfoOpen(next);
    saveBooleanPref(STORAGE_KEYS.infoOpen, next);
  };

  const togglePanel = () => {
    const next = !panelOpen;
    setPanelOpen(next);
    saveBooleanPref(STORAGE_KEYS.panelOpen, next);
  };

  const applyPanelWidth = (value) => {
    const next = clampPanelWidth(value);
    panelWidthRef.current = next;
    setPanelWidth(next);
    return next;
  };

  const handlePanelResizeStart = (e) => {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startWidth: panelWidthRef.current };
    setIsPanelResizing(true);
  };

  const handlePanelResizeKeyDown = (e) => {
    let next = null;
    // Cột nằm bên phải: mũi tên trái = kéo mép trái sang trái = rộng hơn.
    if (e.key === 'ArrowLeft') next = panelWidthRef.current + PANEL_KEY_STEP;
    else if (e.key === 'ArrowRight') next = panelWidthRef.current - PANEL_KEY_STEP;
    else if (e.key === 'Home') next = PANEL_MIN_WIDTH;
    else if (e.key === 'End') next = PANEL_MAX_WIDTH;
    if (next == null) return;
    e.preventDefault();
    savePanelWidth(applyPanelWidth(next));
  };

  useEffect(() => {
    if (!isPanelResizing) return undefined;
    const handleMove = (e) => {
      applyPanelWidth(dragRef.current.startWidth + (dragRef.current.startX - e.clientX));
    };
    const handleUp = () => {
      setIsPanelResizing(false);
      savePanelWidth(panelWidthRef.current);
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [isPanelResizing]);

  // Ô tiêu đề nằm trong dải đang đóng (ẩn): con trỏ không thể ở đó, nên chip/gợi ý chèn về ô nội dung.
  useEffect(() => {
    if (!infoOpen && activeInput === 'subject') {
      setActiveInput(contentTab === 'text' ? 'text' : 'html');
    }
  }, [infoOpen, activeInput, contentTab, setActiveInput]);

  // Sau khi dải mở ra (Lưu thiếu tên / tiêu đề) mới focus được ô cần nhập.
  useEffect(() => {
    if (!pendingFocus || !infoOpen) return;
    const target = pendingFocus === 'subject' ? subjectInputRef?.current : nameInputRef.current;
    if (target) target.focus();
    setPendingFocus(null);
  }, [pendingFocus, infoOpen, subjectInputRef]);

  const subjectFieldLabel = subjectLabel || t('emailTemplateEditor.emailSubject');
  const selectedLabel = labels.find((l) => l.name === formData.category);

  /** Ô ẩn trong dải đóng không dùng được `required` HTML (trình duyệt không focus được ô ẩn) nên kiểm bằng code. */
  const handleFormSubmit = (e) => {
    const missingName = !String(formData.templateName || '').trim();
    const missingSubject = !hideSubjectField && !String(formData.subject || '').trim();
    if (missingName || missingSubject) {
      e.preventDefault();
      setInfoOpen(true);
      setPendingFocus(missingName ? 'name' : 'subject');
      toast.error(
        missingName
          ? t('emailTemplateEditor.nameRequired')
          : t('emailTemplateEditor.subjectRequired', { field: subjectFieldLabel }),
      );
      return;
    }
    handleSubmit(e);
  };

  /** Gợi ý khi gõ `{{`: biến đang dùng + thông tin khách có sẵn (không trùng khoá). */
  const typeaheadOptions = [
    ...detectedVariables,
    ...customerFields.filter((f) => !detectedVariables.some((v) => v.key === f.key)),
  ];

  const handleInsertCustomColumn = () => {
    const key = normalizeCustomKey(customColumn);
    if (!key) return;
    insertVariableAtCursor(key);
    setCustomColumn('');
  };

  // Báo MainLayout modal mở/đóng: MainLayout ẩn header toàn cục, thu sidebar khi mở và trả lại khi đóng.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('template-editor:change', { detail: { open: Boolean(showEditorModal) } }));
    return () => {
      window.dispatchEvent(new CustomEvent('template-editor:change', { detail: { open: false } }));
    };
  }, [showEditorModal]);

  const handleClose = () => {
    if (typeof onClose === 'function') {
      onClose();
    } else {
      setShowEditorModal(false);
      setEditingTemplate(null);
    }
  };

  if (!showEditorModal) return null;

  return createPortal(
    <div
      className="fixed z-[9999] bg-white dark:bg-dk-bg shadow-xl border-l border-gray-200 dark:border-dk-border flex flex-col overflow-hidden transition-all duration-300"
      style={{ left: 'var(--sidebar-w, 0px)', right: 0, top: 0, bottom: 0 }}
    >
      {/* 52px Topbar chuẩn thiết kế AdminEditorShell / LandingCanvasTopbar */}
      <div className="h-[52px] bg-white dark:bg-dk-surface border-b border-gray-200/90 dark:border-dk-border flex items-center justify-between px-3 sm:px-4 shrink-0 select-none shadow-2xs z-20 gap-2">
        {/* Trái: Nút Quay lại + Icon badge cam + Tiêu đề / Phụ đề */}
        <div className="flex items-center gap-2 min-w-0 shrink">
          <button
            type="button"
            onClick={handleClose}
            title={t('common.back')}
            aria-label={t('common.back')}
            className="p-1.5 rounded-xl border border-slate-200/80 dark:border-dk-border bg-slate-50 dark:bg-dk-raised text-slate-600 dark:text-dk-text hover:text-slate-900 dark:hover:text-dk-text transition-all shadow-2xs shrink-0"
          >
            <HiOutlineArrowLeft className="w-4 h-4" />
          </button>
          <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 text-white flex items-center justify-center shrink-0 shadow-xs">
            <HiOutlinePencil className="w-4 h-4" />
          </span>
          <div className="min-w-0">
            {/* Giữ là heading (h2): trình đọc màn hình và E2E templates.spec tìm modal theo vai trò heading. */}
            <h2 className="text-sm font-semibold text-gray-900 dark:text-dk-text truncate">
              {editingTemplate ? t('emailTemplateEditor.editTemplate') : t('emailTemplateEditor.createTemplate')}
            </h2>
            <div className="text-[11px] text-gray-500 dark:text-dk-text2 truncate hidden sm:block">
              {t('emailTemplateEditor.fillInfoAndDesign')}
            </div>
          </div>
        </div>

        {/* Phải: Nút Hủy và Nút Lưu / Tạo template */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleClose}
            className="px-3 py-1.5 rounded-xl border border-gray-200 dark:border-dk-border bg-white dark:bg-dk-raised text-xs sm:text-sm font-medium text-gray-700 dark:text-dk-text hover:bg-gray-50 dark:hover:bg-dk-surface transition-colors"
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            form="email-template-editor-form"
            className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 active:scale-95 text-white text-xs sm:text-sm font-medium shadow-xs hover:shadow transition-all flex items-center gap-1.5 cursor-pointer"
          >
            {editingTemplate ? t('emailTemplateEditor.saveChanges') : t('emailTemplateEditor.createTemplate')}
          </button>
        </div>
      </div>

      {isPanelResizing && <div className="fixed inset-0 z-[80] cursor-col-resize" />}

      <form id="email-template-editor-form" onSubmit={handleFormSubmit} noValidate className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <div
          data-testid="template-info-strip"
          className="border-b border-gray-200/80 dark:border-dk-border bg-slate-50/70 dark:bg-dk-surface/70 shrink-0"
        >
          <button
            type="button"
            onClick={toggleInfo}
            aria-expanded={infoOpen}
            aria-controls="template-info-fields"
            title={infoOpen ? t('emailTemplateEditor.templateInfoCollapse') : t('emailTemplateEditor.templateInfoExpand')}
            className="w-full flex items-center gap-2 px-4 py-2 text-left hover:bg-gray-100/60 dark:hover:bg-dk-raised/50 transition-colors"
          >
            <HiOutlineChevronDown className={`w-4 h-4 text-gray-400 dark:text-dk-muted shrink-0 transition-transform ${infoOpen ? '' : '-rotate-90'}`} />
            <span className="text-xs font-semibold text-gray-700 dark:text-dk-text shrink-0">{t('emailTemplateEditor.templateInfoTitle')}</span>
            {!infoOpen && (
              <span data-testid="template-info-summary" className="min-w-0 flex-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                <span className="text-gray-300 dark:text-dk-border">·</span>
                {String(formData.templateName || '').trim() ? (
                  <span data-testid="template-info-summary-name" className="max-w-[16rem] truncate font-medium text-gray-900 dark:text-dk-text">{formData.templateName}</span>
                ) : (
                  <span data-testid="template-info-summary-name" className="text-amber-600 dark:text-amber-400">{t('emailTemplateEditor.templateNameEmpty')}</span>
                )}
                {!hideSubjectField && (
                  <>
                    <span className="text-gray-300 dark:text-dk-border">·</span>
                    {String(formData.subject || '').trim() ? (
                      <span data-testid="template-info-summary-subject" className="max-w-[22rem] truncate text-gray-600 dark:text-dk-text2">{formData.subject}</span>
                    ) : (
                      <span data-testid="template-info-summary-subject" className="text-amber-600 dark:text-amber-400">{t('emailTemplateEditor.subjectEmpty')}</span>
                    )}
                  </>
                )}
                {formData.category && (
                  <>
                    <span className="text-gray-300 dark:text-dk-border">·</span>
                    <span data-testid="template-info-summary-label" className="inline-flex items-center gap-1 text-gray-600 dark:text-dk-text2">
                      {selectedLabel && <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: selectedLabel.color }} />}
                      <span className="truncate">{selectedLabel ? selectedLabel.name : prettifyLabelName(formData.category)}</span>
                    </span>
                  </>
                )}
              </span>
            )}
          </button>
          <div
            id="template-info-fields"
            className={`${infoOpen ? '' : 'hidden'} px-4 pb-2.5 grid grid-cols-12 gap-3 items-center`}
          >
            <div className="col-span-12 sm:col-span-4 space-y-1">
              <label htmlFor="template-name-input" className="text-xs font-medium text-gray-700 dark:text-dk-text">{t('emailTemplateEditor.templateName')}</label>
              <input
                id="template-name-input"
                ref={nameInputRef}
                type="text"
                value={formData.templateName}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    templateName: e.target.value,
                  }))
                }
                className="w-full px-3 py-1.5 bg-white dark:bg-dk-inset border border-gray-200 dark:border-dk-border text-xs sm:text-sm text-gray-900 dark:text-dk-text placeholder:text-gray-400 dark:placeholder:text-dk-muted rounded-xl shadow-2xs focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                placeholder={t('emailTemplateEditor.templateNamePlaceholder')}
                aria-required="true"
              />
            </div>
            {!hideSubjectField && (
              <div className="col-span-12 sm:col-span-5 space-y-1">
                <label htmlFor="template-subject-input" className="text-xs font-medium text-gray-700 dark:text-dk-text">{subjectFieldLabel}</label>
                <input
                  id="template-subject-input"
                  type="text"
                  value={formData.subject}
                  ref={subjectInputRef}
                  onFocus={() => setActiveInput('subject')}
                  onClick={() => setActiveInput('subject')}
                  onChange={(e) =>
                    updateSubjectValue(e.target.value, e.target.selectionStart || 0)
                  }
                  className="w-full px-3 py-1.5 bg-white dark:bg-dk-inset border border-gray-200 dark:border-dk-border text-xs sm:text-sm text-gray-900 dark:text-dk-text placeholder:text-gray-400 dark:placeholder:text-dk-muted rounded-xl shadow-2xs focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                  placeholder={t('emailTemplateEditor.subjectPlaceholder')}
                  aria-required="true"
                />
              </div>
            )}
            <div className={`space-y-1 ${hideSubjectField ? 'col-span-12 sm:col-span-8' : 'col-span-12 sm:col-span-3'}`}>
              <label className="text-xs font-medium text-gray-700 dark:text-dk-text">{t('emailTemplateEditor.category')}</label>
              <LabelPicker
                value={formData.category}
                labels={labels}
                onChange={(val) => setFormData((prev) => ({ ...prev, category: val }))}
              />
            </div>
          </div>
        </div>

        <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-y-auto lg:overflow-hidden">
          <div className="flex-1 flex flex-col min-h-[460px] lg:min-h-0 lg:h-full overflow-hidden min-w-0 lg:min-w-[360px]">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 dark:border-dk-border px-4 py-2 bg-white dark:bg-dk-surface shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 dark:text-dk-text2 font-medium">
                  {templateKindLabel === 'zalo' ? 'Nội dung tin nhắn' : 'Nội dung email'}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                  {/* "Viết bằng AI": ô soạn trống thì viết mới, có chữ thì sửa trên bản đang có (PLAN_AI_VIET_MAU_TIN_2026-10-19) */}
                  <AiMessageWriter
                    channel={templateKindLabel === 'zalo' ? 'zalo' : 'email'}
                    context="template"
                    format={contentTab === 'html' ? 'html' : 'text'}
                    subject={formData.subject || ''}
                    body={(contentTab === 'html' ? formData.bodyHtml : formData.bodyText) || ''}
                    testId="template-ai-writer"
                    getSelection={() => {
                      const ref = contentTab === 'html' ? htmlTextareaRef.current : textTextareaRef.current;
                      return ref ? { start: ref.selectionStart ?? 0, end: ref.selectionEnd ?? 0 } : null;
                    }}
                    onApply={({ subject: nextSubject, body: nextBody }) => {
                      setFormData((prev) => ({
                        ...prev,
                        [contentTab === 'html' ? 'bodyHtml' : 'bodyText']: nextBody,
                        ...(nextSubject !== undefined ? { subject: nextSubject } : {}),
                      }));
                    }}
                  />

                  {/* Nút Dropdown Chèn biến */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowToolbarVariableMenu((prev) => !prev)}
                      className="text-sm flex items-center gap-1.5 px-3 py-1.5 rounded-lg border bg-gradient-to-r from-amber-50 to-primary-50 dark:from-amber-950/40 dark:to-primary-950/30 border-primary-200 dark:border-primary-800/50 text-primary-800 dark:text-primary-300 hover:from-amber-100 dark:hover:from-amber-900/40 hover:to-primary-100 dark:hover:to-primary-900/40 font-medium transition-all shadow-sm"
                      title={t('emailTemplateEditor.insertVariable') || 'Chèn biến'}
                    >
                      <HiOutlineSparkles className="w-4 h-4 text-primary-600 dark:text-primary-400" />
                      <span>{t('emailTemplateEditor.insertVariable') || 'Chèn biến'}</span>
                      <span className="text-[11px] bg-white/80 dark:bg-dk-inset px-1 py-0.5 rounded border border-primary-200 dark:border-primary-800 text-primary-700 dark:text-primary-300 font-mono font-bold leading-none">
                        {`{{...}}`}
                      </span>
                      <HiOutlineChevronDown className={`w-3.5 h-3.5 text-primary-600 dark:text-primary-400 transition-transform ${showToolbarVariableMenu ? 'rotate-180' : ''}`} />
                    </button>

                    {showToolbarVariableMenu && (
                      <>
                        <div
                          className="fixed inset-0 z-[70]"
                          onClick={() => {
                            setShowToolbarVariableMenu(false);
                            setToolbarVariableSearch('');
                          }}
                        />
                        <div className="absolute right-0 top-full mt-1.5 w-80 bg-white dark:bg-dk-surface border border-gray-200 dark:border-dk-border rounded-xl shadow-2xl z-[75] overflow-hidden flex flex-col max-h-[380px]">
                          {/* Header & Search */}
                          <div className="p-2.5 bg-gray-50 dark:bg-dk-raised border-b border-gray-200 dark:border-dk-border">
                            <div className="relative">
                              <HiOutlineSearch className="w-4 h-4 text-gray-400 dark:text-dk-muted absolute left-2.5 top-1/2 -translate-y-1/2" />
                              <input
                                type="text"
                                value={toolbarVariableSearch}
                                onChange={(e) => setToolbarVariableSearch(e.target.value)}
                                placeholder={t('emailTemplateEditor.searchVariables') || 'Tìm kiếm biến...'}
                                className="w-full pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-dk-inset border border-gray-200 dark:border-dk-border text-gray-900 dark:text-dk-text rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
                                autoFocus
                              />
                            </div>
                          </div>

                          <div className="overflow-y-auto p-2 space-y-3 flex-1 text-xs">
                            {/* Nhóm 1: Biến trong template */}
                            {detectedVariables.length > 0 && (
                              <div>
                                <div className="px-2 py-1 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                                  {t('emailTemplateEditor.templateVariables') || 'Biến trong mẫu này'} ({detectedVariables.length})
                                </div>
                                <div className="space-y-1 mt-1">
                                  {detectedVariables
                                    .filter((v) =>
                                      !toolbarVariableSearch ||
                                      v.name?.toLowerCase().includes(toolbarVariableSearch.toLowerCase()) ||
                                      v.key?.toLowerCase().includes(toolbarVariableSearch.toLowerCase())
                                    )
                                    .map((v, i) => (
                                      <button
                                        key={`tpl-var-${v.key}-${i}`}
                                        type="button"
                                        onClick={() => {
                                          insertVariableAtCursor(v.key);
                                          setShowToolbarVariableMenu(false);
                                          setToolbarVariableSearch('');
                                          toast.success(t('emailTemplateEditor.insertedVariable', { key: `{{${v.key}}}` }) || `Đã chèn {{${v.key}}}`);
                                        }}
                                        className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-primary-50 dark:hover:bg-dk-raised hover:text-primary-800 dark:hover:text-primary-300 transition-colors flex items-center justify-between group"
                                      >
                                        <span className="font-medium text-gray-700 dark:text-dk-text group-hover:text-primary-800 dark:group-hover:text-primary-300">{v.name}</span>
                                        <code className="bg-gray-100 dark:bg-dk-raised group-hover:bg-primary-100 dark:group-hover:bg-primary-950/40 text-gray-600 dark:text-dk-text group-hover:text-primary-700 dark:group-hover:text-primary-300 px-1.5 py-0.5 rounded font-mono text-[11px]">
                                          {`{{${v.key}}}`}
                                        </code>
                                      </button>
                                    ))}
                                </div>
                              </div>
                            )}

                            {/* Nhóm 2: Biến gợi ý / hệ thống */}
                            <div>
                              <div className="px-2 py-1 text-[11px] font-semibold text-gray-400 dark:text-dk-muted uppercase tracking-wider">
                                {t('emailTemplateEditor.suggestedAndSystemVariables') || 'Biến hệ thống & gợi ý'}
                              </div>
                              <div className="space-y-1 mt-1">
                                {customerFields
                                  .filter((v) =>
                                    !toolbarVariableSearch ||
                                    v.name?.toLowerCase().includes(toolbarVariableSearch.toLowerCase()) ||
                                    v.key?.toLowerCase().includes(toolbarVariableSearch.toLowerCase())
                                  )
                                  .map((v) => {
                                    const alreadyInTemplate = detectedVariables.some((tv) => tv.key === v.key);
                                    return (
                                      <button
                                        key={`sug-var-${v.key}`}
                                        type="button"
                                        onClick={() => {
                                          insertVariableAtCursor(v.key);
                                          setShowToolbarVariableMenu(false);
                                          setToolbarVariableSearch('');
                                          toast.success(t('emailTemplateEditor.insertedVariable', { key: `{{${v.key}}}` }) || `Đã chèn {{${v.key}}}`);
                                        }}
                                        className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-primary-50 dark:hover:bg-dk-raised hover:text-primary-800 dark:hover:text-primary-300 transition-colors flex items-center justify-between group"
                                      >
                                        <div className="flex items-center gap-1.5">
                                          <span className="font-medium text-gray-700 dark:text-dk-text group-hover:text-primary-800 dark:group-hover:text-primary-300">{v.name}</span>
                                          {alreadyInTemplate && (
                                            <span className="text-[10px] text-gray-400 dark:text-dk-muted">✓</span>
                                          )}
                                        </div>
                                        <code className="bg-gray-100 dark:bg-dk-raised group-hover:bg-primary-100 dark:group-hover:bg-primary-950/40 text-gray-600 dark:text-dk-text group-hover:text-primary-700 dark:group-hover:text-primary-300 px-1.5 py-0.5 rounded font-mono text-[11px]">
                                          {`{{${v.key}}}`}
                                        </code>
                                      </button>
                                    );
                                  })}
                              </div>
                            </div>
                          </div>

                          {/* Footer tip */}
                          <div className="px-3 py-2 bg-gray-50 dark:bg-dk-raised border-t border-gray-200 dark:border-dk-border text-[11px] text-gray-500 dark:text-dk-text2">
                            <span>💡 Gõ <code className="font-bold text-gray-700 dark:text-dk-text font-mono">{`{{`}</code> khi soạn thảo</span>
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className="text-sm flex items-center gap-1 px-3 py-1.5 rounded-lg border bg-white dark:bg-dk-raised text-gray-600 dark:text-dk-text border-gray-300 dark:border-dk-border hover:bg-gray-50 dark:hover:bg-dk-strong transition-all disabled:opacity-60"
                  >
                    <HiOutlineUpload className="w-4 h-4" /> {isUploading ? t('emailTemplateEditor.uploading') : t('emailTemplateEditor.uploadFile')}
                  </button>
                  {formData.attachments?.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowAttachmentsModal(true)}
                      className="text-sm flex items-center gap-1 px-3 py-1.5 rounded-lg border bg-white dark:bg-dk-raised text-gray-600 dark:text-dk-text border-gray-300 dark:border-dk-border hover:bg-gray-50 dark:hover:bg-dk-strong transition-all"
                    >
                      <HiOutlinePaperClip className="w-4 h-4" /> {t('emailTemplateEditor.files')} ({formData.attachments.length})
                    </button>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    onChange={handleFileSelect}
                  />
                  {contentTab === 'html' && (
                    <button
                      type="button"
                      onClick={() => setIsPreviewVisible(!isPreviewVisible)}
                      className={`text-sm flex items-center gap-1 px-3 py-1.5 rounded-lg border transition-all ${isPreviewVisible ? 'bg-primary-50 dark:bg-primary-950/50 text-primary-700 dark:text-primary-300 border-primary-200 dark:border-primary-800' : 'bg-white dark:bg-dk-raised text-gray-600 dark:text-dk-text border-gray-300 dark:border-dk-border hover:bg-gray-50 dark:hover:bg-dk-strong'}`}
                    >
                      <HiOutlineEye className="w-4 h-4" /> {isPreviewVisible ? t('emailTemplateEditor.hidePreview') : t('emailTemplateEditor.showPreview')}
                    </button>
                  )}
              </div>
            </div>

            {templateKindLabel === 'zalo' && (
              <MessageTemplateChannelLimitNotice attachments={formData.attachments} />
            )}

            <div className="flex-1 overflow-hidden">
              {(
                <div ref={editorContainerRef} className="flex h-full">
                  <div
                    className="flex flex-col min-w-[320px]"
                    style={{
                      width:
                        isPreviewVisible && contentTab === 'html'
                          ? `${editorSplit}%`
                          : '100%',
                    }}
                  >
                    <div className="flex border-b border-gray-200 dark:border-dk-border bg-gray-50 dark:bg-dk-surface">
                      {!hideHtmlTab && (
                        <button
                          type="button"
                          onClick={() => {
                            setContentTab('html');
                            setActiveInput('html');
                            setShowVariableSuggestions(false);
                          }}
                          className={`px-4 py-2 text-sm font-medium transition-all ${contentTab === 'html' ? 'bg-white dark:bg-dk-raised text-gray-900 dark:text-dk-text border-b-2 border-primary-500' : 'text-gray-500 dark:text-dk-text2 hover:text-gray-700 dark:hover:text-dk-text'}`}
                        >
                          {t('emailTemplateEditor.htmlEditor')}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setContentTab('text');
                          setActiveInput('text');
                          setIsPreviewVisible(false);
                          setShowVariableSuggestions(false);
                        }}
                        className={`px-4 py-2 text-sm font-medium transition-all ${contentTab === 'text' ? 'bg-white dark:bg-dk-raised text-gray-900 dark:text-dk-text border-b-2 border-primary-500' : 'text-gray-500 dark:text-dk-text2 hover:text-gray-700 dark:hover:text-dk-text'}`}
                      >
                        {t('emailTemplateEditor.textEditor')}
                      </button>
                    </div>

                    {/* Dải gợi ý chèn biến */}
                    <div className="flex items-center justify-between px-3 py-1.5 bg-gradient-to-r from-amber-50/90 to-primary-50/70 dark:from-amber-950/40 dark:to-primary-950/30 border-b border-amber-200/60 dark:border-amber-900/40 text-xs text-amber-900 dark:text-amber-200">
                      <div className="flex items-center gap-1.5">
                        <HiOutlineLightBulb className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                        <span>
                          {t('emailTemplateEditor.variableInsertionTip') || 'Gõ {{ hoặc bấm nút "Chèn biến" trên thanh công cụ để chèn biến cá nhân hóa (họ tên, đơn vị...).'}
                        </span>
                      </div>
                    </div>

                    <div className="flex-1 relative">
                      {contentTab === 'html' ? (
                        <textarea
                          ref={htmlTextareaRef}
                          value={formData.bodyHtml}
                          onChange={(e) =>
                            updateContentValue('html', e.target.value, e.target.selectionStart)
                          }
                          className="w-full h-full p-3 font-mono text-[13px] bg-gray-50 dark:bg-dk-inset focus:bg-white dark:focus:bg-dk-inset text-gray-900 dark:text-dk-text placeholder:text-gray-400 dark:placeholder:text-dk-muted resize-none outline-none border-0 focus:ring-0 focus:border-0 focus:outline-none"
                          style={{ outline: 'none', border: 'none', boxShadow: 'none' }}
                          placeholder={t('emailTemplateEditor.htmlPlaceholder')}
                        />
                      ) : (
                        <div className="flex flex-col h-full bg-white dark:bg-dk-surface">
                          <div className="flex-1 relative bg-gray-100 dark:bg-dk-bg p-4">
                            <textarea
                              ref={textTextareaRef}
                              value={formData.bodyText}
                              onFocus={() => setActiveInput('text')}
                              onClick={() => setActiveInput('text')}
                              onChange={(e) => updateContentValue('text', e.target.value, e.target.selectionStart)}
                              className="w-full h-full p-3 text-[13px] bg-white dark:bg-dk-inset text-gray-900 dark:text-dk-text placeholder:text-gray-400 dark:placeholder:text-dk-muted outline-none border border-gray-200 dark:border-dk-border rounded-md shadow-sm resize-none"
                              placeholder={t('emailTemplateEditor.textPlaceholder')}
                            />
                          </div>
                        </div>
                      )}

                      {showVariableSuggestions &&
                        typeaheadOptions.length > 0 &&
                        (activeInput === 'html' || activeInput === 'text' || activeInput === 'subject') && (
                          <>
                            {/* Backdrop trong suốt để đóng dropdown khi click ra ngoài */}
                            <div
                              className="fixed inset-0 z-[59]"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                setShowVariableSuggestions(false);
                              }}
                            />
                            <div
                              className="fixed w-64 bg-white dark:bg-dk-surface border border-gray-300 dark:border-dk-border rounded-lg shadow-xl z-[60] overflow-hidden"
                              style={{ top: suggestionPosition.top, left: suggestionPosition.left }}
                            >
                              <div className="px-3 py-2 text-xs font-semibold text-gray-500 dark:text-dk-text2 bg-gray-50 dark:bg-dk-raised border-b border-gray-200 dark:border-dk-border">
                                {t('emailTemplateEditor.selectVariableToInsert')}
                              </div>
                              <div className="max-h-48 overflow-auto py-1">
                                {typeaheadOptions
                                  .filter(
                                    (v) =>
                                      v.name?.toLowerCase().includes(variableQuery.toLowerCase()) ||
                                      v.key?.toLowerCase().includes(variableQuery.toLowerCase())
                                  )
                                  .map((variable, index) => (
                                    <button
                                      key={`${variable.key}-${index}`}
                                      type="button"
                                      onMouseDown={(e) => {
                                        // Dùng onMouseDown thay vì onClick để lấy selectionStart trước khi textarea mất focus
                                        e.preventDefault();
                                        insertVariableAtCursor(variable.key);
                                      }}
                                      className="w-full text-left px-3 py-2 hover:bg-primary-50 dark:hover:bg-dk-raised transition-colors flex items-center justify-between group"
                                    >
                                      <span className="text-sm text-gray-700 dark:text-dk-text font-medium group-hover:text-primary-700 dark:group-hover:text-primary-300">{variable.name}</span>
                                      <code className="text-xs bg-gray-100 dark:bg-dk-raised text-gray-500 dark:text-dk-text px-1.5 py-0.5 rounded group-hover:bg-primary-100 dark:group-hover:bg-primary-950/40">{`{{${variable.key}}}`}</code>
                                    </button>
                                  ))}
                              </div>
                            </div>
                          </>
                        )}
                    </div>
                  </div>

                  {isPreviewVisible && contentTab === 'html' && (
                    <>
                      <div
                        onMouseDown={startResize}
                        className="w-2 cursor-col-resize bg-gray-100 dark:bg-dk-raised hover:bg-gray-200 dark:hover:bg-dk-strong border-l border-r border-gray-200 dark:border-dk-border"
                      />
                      <div
                        className="flex flex-col min-w-[320px] bg-white dark:bg-dk-surface"
                        style={{ width: `${100 - editorSplit}%` }}
                      >
                        <div className="flex border-b border-gray-200 dark:border-dk-border bg-white dark:bg-dk-surface">
                          <div className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-dk-text">
                            {t('emailTemplateEditor.preview')}
                          </div>
                        </div>
                        <div className="flex-1 p-6 overflow-auto flex justify-center bg-gray-100 dark:bg-dk-inset">
                          <div className="w-full max-w-[760px] bg-white dark:bg-dk-surface shadow-md border border-gray-200 dark:border-dk-border min-h-full">
                            {formData.bodyHtml ? (
                              // Không có allow-scripts: HTML đang soạn không chạy được script trong
                              // origin của app; allow-same-origin để resizeIframeToContent đo chiều cao.
                              <iframe
                                ref={editorPreviewIframeRef}
                                sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
                                srcDoc={editorPreviewSrcDoc}
                                onLoad={() => resizeIframeToContent(editorPreviewIframeRef.current)}
                                className="w-full min-h-[500px] outline-none focus:outline-none"
                                title={t('emailTemplateEditor.preview')}
                                style={{ border: 'none', outline: 'none' }}
                              />
                            ) : (
                              <div className="h-full flex flex-col items-center justify-center text-gray-400 dark:text-dk-muted p-10 space-y-4">
                                <div className="w-16 h-16 bg-gray-100 dark:bg-dk-raised rounded-full flex items-center justify-center">
                                  <HiOutlineEye className="w-8 h-8 opacity-50 text-slate-400 dark:text-dk-muted" />
                                </div>
                                <p className="text-center">{t('emailTemplateEditor.enterHtmlToPreview')}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
          <aside
            data-testid="template-customer-info-panel"
            data-open={panelOpen ? 'true' : 'false'}
            style={{ '--template-panel-w': `${panelOpen ? panelWidth : 40}px` }}
            className="relative shrink-0 border-t lg:border-t-0 lg:border-l border-gray-200 dark:border-dk-border bg-gray-50/70 dark:bg-dk-surface/70 lg:w-[var(--template-panel-w)] lg:flex lg:flex-col lg:min-h-0"
          >
            {panelOpen && (
              <div
                role="separator"
                aria-orientation="vertical"
                aria-label={t('emailTemplateEditor.customerPanelResize')}
                aria-valuemin={PANEL_MIN_WIDTH}
                aria-valuemax={PANEL_MAX_WIDTH}
                aria-valuenow={panelWidth}
                tabIndex={0}
                data-testid="template-customer-info-resize"
                onMouseDown={handlePanelResizeStart}
                onKeyDown={handlePanelResizeKeyDown}
                title={t('emailTemplateEditor.customerPanelResize')}
                className="hidden lg:block absolute inset-y-0 -left-1 w-2 z-10 cursor-col-resize hover:bg-orange-400/40 focus-visible:bg-orange-400/60 focus:outline-none transition-colors"
              />
            )}
            {panelOpen ? (
              <div className="flex items-center justify-between gap-2 px-3 lg:px-4 pt-3 lg:pt-4 shrink-0">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-dk-text">{t('emailTemplateEditor.insertCustomerInfo')}</h3>
                <button
                  type="button"
                  onClick={togglePanel}
                  data-testid="template-customer-info-toggle"
                  aria-expanded="true"
                  aria-label={t('emailTemplateEditor.customerPanelCollapse')}
                  title={t('emailTemplateEditor.customerPanelCollapse')}
                  className="p-1 rounded-lg text-gray-400 dark:text-dk-muted hover:text-gray-700 dark:hover:text-dk-text hover:bg-gray-200/60 dark:hover:bg-dk-raised transition-colors"
                >
                  <HiOutlineChevronDoubleRight className="w-4 h-4 hidden lg:block" />
                  <HiOutlineChevronDown className="w-4 h-4 lg:hidden" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={togglePanel}
                data-testid="template-customer-info-toggle"
                aria-expanded="false"
                aria-label={t('emailTemplateEditor.customerPanelExpand')}
                title={t('emailTemplateEditor.customerPanelExpand')}
                className="w-full flex items-center gap-2 px-3 py-2.5 lg:flex-col lg:px-0 lg:py-3 lg:gap-3 text-gray-600 dark:text-dk-text2 hover:bg-gray-100 dark:hover:bg-dk-raised transition-colors"
              >
                <HiOutlineUserCircle className="w-5 h-5 shrink-0 text-primary-600 dark:text-primary-400" />
                <span className="text-xs font-semibold lg:[writing-mode:vertical-rl] lg:whitespace-nowrap">{t('emailTemplateEditor.insertCustomerInfo')}</span>
                <HiOutlineChevronDown className="w-4 h-4 ml-auto -rotate-90 lg:hidden" />
              </button>
            )}
            {panelOpen && (
            <div className="p-3 lg:p-4 lg:pt-3 lg:flex-1 lg:min-h-0 lg:overflow-y-auto space-y-4">
            <section>
              <p className="mt-0.5 text-xs text-gray-500 dark:text-dk-text2">{t('emailTemplateEditor.insertCustomerInfoHint')}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {customerFields.map((field) => (
                  <button
                    key={field.key}
                    type="button"
                    // Giữ con trỏ trong ô đang soạn để chip chèn đúng chỗ.
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => insertVariableAtCursor(field.key)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium bg-primary-50 dark:bg-primary-950/40 border-primary-200 dark:border-primary-800 text-primary-700 dark:text-primary-300 hover:bg-primary-100 dark:hover:bg-primary-900/50 transition-colors"
                  >
                    <HiOutlinePlus className="w-3 h-3" />
                    <span>{field.name}</span>
                  </button>
                ))}
              </div>
            </section>

            <section>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-dk-text">{t('emailTemplateEditor.usedInTemplate')}</h3>
              {detectedVariables.length === 0 ? (
                <p className="mt-1 text-xs text-gray-500 dark:text-dk-text2">{t('emailTemplateEditor.usedInTemplateEmpty')}</p>
              ) : (
                <ul className="mt-1.5 space-y-1.5">
                  {detectedVariables.map((variable) => {
                    const source = getVariableSource(variable.key);
                    const sourceText = source === 'column'
                      ? t('emailTemplateEditor.sourceColumn', { key: variable.key })
                      : t(`emailTemplateEditor.source_${source}`);
                    return (
                      <li
                        key={variable.key}
                        className="rounded-lg border border-gray-200 dark:border-dk-border bg-white dark:bg-dk-raised px-2.5 py-1.5"
                      >
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          {variable.name !== variable.key && (
                            <span className="text-xs font-medium text-gray-800 dark:text-dk-text">{variable.name}</span>
                          )}
                          <code className="text-[11px] font-mono text-gray-500 dark:text-dk-text2 break-all">{`{{${variable.key}}}`}</code>
                        </div>
                        <div className="mt-0.5 text-[11px] leading-snug text-gray-500 dark:text-dk-text2">{sourceText}</div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-dk-text">{t('emailTemplateEditor.customInfoTitle')}</h3>
              <div className="mt-1.5 flex gap-2">
                <input
                  type="text"
                  value={customColumn}
                  onChange={(e) => setCustomColumn(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleInsertCustomColumn();
                    }
                  }}
                  placeholder={t('emailTemplateEditor.customInfoPlaceholder')}
                  aria-label={t('emailTemplateEditor.customInfoTitle')}
                  className="min-w-0 flex-1 px-3 py-1.5 text-xs bg-white dark:bg-dk-inset text-gray-900 dark:text-dk-text placeholder:text-gray-400 dark:placeholder:text-dk-muted border border-gray-200 dark:border-dk-border rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                />
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={handleInsertCustomColumn}
                  disabled={!normalizeCustomKey(customColumn)}
                  className="shrink-0 px-3 py-1.5 rounded-xl text-xs font-medium bg-primary-500 hover:bg-primary-600 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {t('emailTemplateEditor.customInfoInsert')}
                </button>
              </div>
              <p className="mt-1 text-[11px] leading-snug text-gray-500 dark:text-dk-text2">{t('emailTemplateEditor.customInfoHelp')}</p>
            </section>
            </div>
            )}
          </aside>
        </div>
      </form>
    </div>,
    document.body
  );
};

export default EmailTemplateEditorModal;
