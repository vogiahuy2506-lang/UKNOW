import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import {
  HiOutlineArrowLeft,
  HiOutlineEye,
  HiOutlinePaperClip,
  HiOutlinePencil,
  HiOutlinePlus,
  HiOutlineTrash,
  HiOutlineUpload,
  HiOutlineSparkles,
  HiOutlineChevronDown,
  HiOutlineClipboardCopy,
  HiOutlineDocumentText,
  HiOutlineLightBulb,
  HiOutlineSearch,
  HiOutlineCheck,
} from 'react-icons/hi';
import { useI18n } from '../../../i18n';
import MessageTemplateChannelLimitNotice from './MessageTemplateChannelLimitNotice';

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
          <span className="text-xs sm:text-sm text-gray-400 dark:text-dk-muted flex-1 truncate">{value || 'Chọn nhãn...'}</span>
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
  editorTab,
  setEditorTab,
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
  newVariable,
  setNewVariable,
  handleAddVariable,
  editingVariableIndex,
  editingVariable,
  setEditingVariable,
  handleSaveEditVariable,
  handleCancelEditVariable,
  handleStartEditVariable,
  handleRemoveVariable,
  handleAddSuggestedVariable,
  hideHtmlTab = false,
  hideSubjectField = false,
  subjectLabel,
  templateKindLabel = 'email',
  labels = [],
}) => {
  const { t } = useI18n();

  /** Danh sách biến gợi ý dùng chung cho email và zalo */
  const SUGGESTED_VARIABLES = [
    { name: 'Họ và tên khách', key: 'tenkhach' },
    { name: t('emailTemplateEditor.suggestedOrgUnit') || 'Đơn vị / Cơ quan', key: 'donvi' },
    { name: t('emailTemplateEditor.suggestedPosition') || 'Chức vụ', key: 'chucvu' },
    { name: t('emailTemplateEditor.suggestedCustomerName'), key: 'ten_khach' },
    { name: t('emailTemplateEditor.suggestedCustomerEmail'), key: 'email_khach' },
    { name: t('emailTemplateEditor.suggestedPhone'), key: 'so_dien_thoai' },
    { name: t('emailTemplateEditor.suggestedCourseName'), key: 'ten_khoa_hoc' },
    { name: t('emailTemplateEditor.suggestedCourseLink'), key: 'link_khoa_hoc' },
  ];

  const [showToolbarVariableMenu, setShowToolbarVariableMenu] = useState(false);
  const [toolbarVariableSearch, setToolbarVariableSearch] = useState('');
  const [copiedKey, setCopiedKey] = useState(null);

  const handleCopyKey = async (key) => {
    try {
      await navigator.clipboard.writeText(`{{${key}}}`);
      setCopiedKey(key);
      toast.success(t('emailTemplateEditor.copiedVariable', { key: `{{${key}}}` }) || `Đã sao chép {{${key}}}`);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      toast.error('Không thể sao chép');
    }
  };

  const handleInsertAndSwitchToContent = (key) => {
    insertVariableAtCursor(key);
    toast.success(t('emailTemplateEditor.insertedVariable', { key: `{{${key}}}` }) || `Đã chèn {{${key}}} vào nội dung`);
    setEditorTab('content');
  };

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
      className="fixed z-[9999] bg-white dark:bg-dk-bg shadow-xl border-l border-gray-200 dark:border-dk-border flex flex-col overflow-hidden"
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
            <div className="text-sm font-semibold text-gray-900 dark:text-dk-text truncate">
              {editingTemplate ? t('emailTemplateEditor.editTemplate') : t('emailTemplateEditor.createTemplate')}
            </div>
            <div className="text-[11px] text-gray-500 dark:text-dk-text2 truncate hidden sm:block">
              {t('emailTemplateEditor.fillInfoAndDesign')}
            </div>
          </div>
        </div>

        {/* Giữa: Chuyển đổi tab Nội dung / Thiết lập biến */}
        <div className="flex items-center gap-1 p-1 bg-gray-100/90 dark:bg-dk-raised rounded-xl border border-transparent dark:border-dk-border">
          <button
            type="button"
            onClick={() => setEditorTab('content')}
            className={`px-3 py-1 text-xs sm:text-sm font-medium rounded-lg transition-all ${
              editorTab === 'content'
                ? 'bg-white dark:bg-dk-bg text-gray-900 dark:text-dk-text shadow-2xs font-semibold'
                : 'text-gray-500 dark:text-dk-text2 hover:text-gray-900 dark:hover:text-dk-text'
            }`}
          >
            {t('emailTemplateEditor.content')}
          </button>
          <button
            type="button"
            onClick={() => setEditorTab('variables')}
            className={`px-3 py-1 text-xs sm:text-sm font-medium rounded-lg transition-all ${
              editorTab === 'variables'
                ? 'bg-white dark:bg-dk-bg text-gray-900 dark:text-dk-text shadow-2xs font-semibold'
                : 'text-gray-500 dark:text-dk-text2 hover:text-gray-900 dark:hover:text-dk-text'
            }`}
          >
            {t('emailTemplateEditor.setupVariables')}
          </button>
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

      <form id="email-template-editor-form" onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <div className="px-4 py-2.5 border-b border-gray-200/80 dark:border-dk-border bg-slate-50/70 dark:bg-dk-surface/70 grid grid-cols-12 gap-3 items-center shrink-0">
          <div className="col-span-12 sm:col-span-4 space-y-1">
            <label className="text-xs font-medium text-gray-700 dark:text-dk-text">{t('emailTemplateEditor.templateName')}</label>
            <input
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
              required
            />
          </div>
          {!hideSubjectField && (
            <div className="col-span-12 sm:col-span-5 space-y-1">
              <label className="text-xs font-medium text-gray-700 dark:text-dk-text">{subjectLabel || t('emailTemplateEditor.emailSubject')}</label>
              <input
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
                required
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

        <div className="flex-1 flex min-h-0 overflow-hidden">
          <div className="flex-1 flex flex-col h-full min-h-0 overflow-hidden">
            <div className="flex items-center justify-between border-b border-gray-200 dark:border-dk-border px-4 py-2 bg-white dark:bg-dk-surface shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 dark:text-dk-text2 font-medium">
                  {editorTab === 'content'
                    ? (templateKindLabel === 'zalo' ? 'Nội dung tin nhắn' : 'Nội dung email')
                    : `${t('emailTemplateEditor.setupVariables')} (${variables.length})`}
                </span>
              </div>
              {editorTab === 'content' && (
                <div className="flex items-center gap-2">
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
                            {variables.length > 0 && (
                              <div>
                                <div className="px-2 py-1 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                                  {t('emailTemplateEditor.templateVariables') || 'Biến trong mẫu này'} ({variables.length})
                                </div>
                                <div className="space-y-1 mt-1">
                                  {variables
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
                                {SUGGESTED_VARIABLES
                                  .filter((v) =>
                                    !toolbarVariableSearch ||
                                    v.name?.toLowerCase().includes(toolbarVariableSearch.toLowerCase()) ||
                                    v.key?.toLowerCase().includes(toolbarVariableSearch.toLowerCase())
                                  )
                                  .map((v) => {
                                    const alreadyInTemplate = variables.some((tv) => tv.key === v.key);
                                    return (
                                      <button
                                        key={`sug-var-${v.key}`}
                                        type="button"
                                        onClick={() => {
                                          if (!alreadyInTemplate) {
                                            handleAddSuggestedVariable(v);
                                          }
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
                          <div className="px-3 py-2 bg-gray-50 dark:bg-dk-raised border-t border-gray-200 dark:border-dk-border text-[11px] text-gray-500 dark:text-dk-text2 flex items-center justify-between">
                            <span>💡 Gõ <code className="font-bold text-gray-700 dark:text-dk-text font-mono">{`{{`}</code> khi soạn thảo</span>
                            <button
                              type="button"
                              onClick={() => {
                                setShowToolbarVariableMenu(false);
                                setEditorTab('variables');
                              }}
                              className="text-primary-600 dark:text-primary-400 hover:text-primary-700 font-medium"
                            >
                              {t('emailTemplateEditor.setupVariables')} →
                            </button>
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
              )}
            </div>

            {templateKindLabel === 'zalo' && (
              <MessageTemplateChannelLimitNotice attachments={formData.attachments} />
            )}

            <div className="flex-1 overflow-hidden">
              {editorTab === 'content' ? (
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
                      <button
                        type="button"
                        onClick={() => setEditorTab('variables')}
                        className="text-primary-700 dark:text-primary-300 hover:text-primary-900 dark:hover:text-primary-200 font-medium underline hover:no-underline ml-2 flex-shrink-0 text-[11px]"
                      >
                        {t('emailTemplateEditor.setupVariables')} →
                      </button>
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
                        variables.length > 0 &&
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
                                {variables
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
              ) : (
                <div className="h-full bg-gray-50 dark:bg-dk-bg p-4 overflow-auto">
                  <div className="max-w-4xl mx-auto space-y-4">
                    {/* Section biến gợi ý */}
                    <div className="bg-white dark:bg-dk-raised p-4 rounded-lg border border-gray-200 dark:border-dk-border">
                      <div className="flex items-center gap-2 mb-3">
                        <HiOutlineSparkles className="w-4 h-4 text-primary-500" />
                        <h4 className="text-gray-900 dark:text-dk-text font-medium">{t('emailTemplateEditor.suggestedVariables')}</h4>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-dk-text2 mb-3">
                        {t('emailTemplateEditor.clickToAddVariable')}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {SUGGESTED_VARIABLES.map((sv) => {
                          const alreadyAdded = variables.some((v) => v.key === sv.key);
                          return (
                            <button
                              key={sv.key}
                              type="button"
                              onClick={() => handleAddSuggestedVariable(sv)}
                              disabled={alreadyAdded}
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-all ${
                                alreadyAdded
                                  ? 'bg-gray-100 dark:bg-dk-raised border-gray-200 dark:border-dk-border text-gray-400 dark:text-dk-muted cursor-default'
                                  : 'bg-primary-50 dark:bg-primary-950/40 border-primary-200 dark:border-primary-800 text-primary-700 dark:text-primary-300 hover:bg-primary-100 dark:hover:bg-primary-900/50 hover:border-primary-300 cursor-pointer'
                              }`}
                            >
                              <HiOutlinePlus className={`w-3 h-3 ${alreadyAdded ? 'opacity-0' : ''}`} />
                              <span>{sv.name}</span>
                              <code className="text-[10px] opacity-60 font-mono">{`{{${sv.key}}}`}</code>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="bg-white dark:bg-dk-raised p-4 rounded-lg border border-gray-200 dark:border-dk-border">
                      <h4 className="text-gray-900 dark:text-dk-text font-medium">{t('emailTemplateEditor.variableManagement')}</h4>
                      <p className="text-xs text-gray-600 dark:text-dk-text2 mb-4">
                        {t('emailTemplateEditor.manageVariablesDescription', { templateKind: templateKindLabel })}
                      </p>

                      <div className="grid grid-cols-3 gap-3 mb-4">
                        <div>
                          <label className="text-xs font-medium text-gray-700 dark:text-dk-text mb-1 block">{t('emailTemplateEditor.variableName')}</label>
                          <input
                            type="text"
                            value={newVariable.name}
                            onChange={(e) =>
                              setNewVariable((prev) => ({
                                ...prev,
                                name: e.target.value,
                              }))
                            }
                            className="w-full px-3 py-1.5 text-sm bg-gray-50 dark:bg-dk-inset text-gray-900 dark:text-dk-text placeholder:text-gray-400 dark:placeholder:text-dk-muted border border-gray-300 dark:border-dk-border rounded-lg focus:bg-white dark:focus:bg-dk-inset focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all"
                            placeholder={t('emailTemplateEditor.variableNamePlaceholder')}
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-700 dark:text-dk-text mb-1 block">{t('emailTemplateEditor.variableKey')}</label>
                          <input
                            type="text"
                            value={newVariable.key}
                            onChange={(e) =>
                              setNewVariable((prev) => ({
                                ...prev,
                                key: e.target.value,
                              }))
                            }
                            className="w-full px-3 py-1.5 text-sm bg-gray-50 dark:bg-dk-inset text-gray-900 dark:text-dk-text placeholder:text-gray-400 dark:placeholder:text-dk-muted border border-gray-300 dark:border-dk-border rounded-lg focus:bg-white dark:focus:bg-dk-inset focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all"
                            placeholder={t('emailTemplateEditor.variableKeyPlaceholder')}
                          />
                        </div>
                        <div className="flex items-end">
                          <button
                            type="button"
                            onClick={handleAddVariable}
                            className="w-full bg-primary-500 hover:bg-primary-600 text-white px-4 py-1.5 rounded-lg font-medium transition-colors text-sm"
                          >
                            <HiOutlinePlus className="w-4 h-4 mr-2 inline" />
                            {t('emailTemplateEditor.addVariable')}
                          </button>
                        </div>
                      </div>

                      <div className="border border-gray-200 dark:border-dk-border rounded-lg overflow-hidden">
                        <div className="bg-gray-50 dark:bg-dk-surface px-4 py-2 border-b border-gray-200 dark:border-dk-border">
                          <h5 className="text-xs font-semibold text-gray-900 dark:text-dk-text">{t('emailTemplateEditor.variablesList')} ({variables.length})</h5>
                        </div>
                        {variables.length === 0 ? (
                          <div className="p-4 text-center text-gray-500 dark:text-dk-text2">
                            <div className="w-10 h-10 bg-gray-100 dark:bg-dk-raised rounded-full flex items-center justify-center mx-auto mb-2">
                              <HiOutlinePlus className="w-6 h-6 text-gray-400 dark:text-dk-muted" />
                            </div>
                            <p className="text-sm">{t('emailTemplateEditor.noVariables')}</p>
                            <p className="text-xs mt-1">{t('emailTemplateEditor.addVariableTip')}</p>
                          </div>
                        ) : (
                          <div className="overflow-auto">
                            <table className="min-w-full text-sm">
                              <thead className="bg-gray-50 dark:bg-dk-surface">
                                <tr className="text-left text-xs uppercase tracking-wide text-gray-500 dark:text-dk-text2">
                                  <th className="px-4 py-2 font-semibold">{t('emailTemplateEditor.fieldName')}</th>
                                  <th className="px-4 py-2 font-semibold">{t('emailTemplateEditor.variableKey')}</th>
                                  <th className="px-4 py-2 font-semibold w-40 text-right">{t('common.actions')}</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-200 dark:divide-dk-border">
                                {variables.map((variable, index) => (
                                  <tr key={`${variable.key}-${index}`} className="hover:bg-gray-50 dark:hover:bg-dk-raised/40 transition-colors">
                                    {editingVariableIndex === index ? (
                                      <>
                                        <td className="px-4 py-2">
                                          <input
                                            type="text"
                                            value={editingVariable.name}
                                            onChange={(e) =>
                                              setEditingVariable((prev) => ({
                                                ...prev,
                                                name: e.target.value,
                                              }))
                                            }
                                            className="w-full px-3 py-1.5 text-sm bg-white dark:bg-dk-inset text-gray-900 dark:text-dk-text border border-gray-300 dark:border-dk-border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                                          />
                                        </td>
                                        <td className="px-4 py-2">
                                          <input
                                            type="text"
                                            value={editingVariable.key}
                                            onChange={(e) =>
                                              setEditingVariable((prev) => ({
                                                ...prev,
                                                key: e.target.value,
                                              }))
                                            }
                                            className="w-full px-3 py-1.5 text-sm bg-white dark:bg-dk-inset text-gray-900 dark:text-dk-text border border-gray-300 dark:border-dk-border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                                          />
                                        </td>
                                        <td className="px-4 py-2">
                                          <div className="flex items-center justify-end gap-2">
                                            <button
                                              type="button"
                                              onClick={handleSaveEditVariable}
                                              className="px-3 py-1.5 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors text-xs"
                                            >
                                              {t('common.save')}
                                            </button>
                                            <button
                                              type="button"
                                              onClick={handleCancelEditVariable}
                                              className="px-3 py-1.5 bg-gray-200 dark:bg-dk-strong text-gray-700 dark:text-dk-text rounded-lg hover:bg-gray-300 dark:hover:bg-dk-border-strong transition-colors text-xs"
                                            >
                                              {t('common.cancel')}
                                            </button>
                                          </div>
                                        </td>
                                      </>
                                    ) : (
                                      <>
                                        <td className="px-4 py-2 font-medium text-gray-900 dark:text-dk-text">{variable.name}</td>
                                        <td className="px-4 py-2">
                                          <code
                                            onClick={() => handleCopyKey(variable.key)}
                                            title={t('emailTemplateEditor.copyVariableKey') || 'Bấm để sao chép'}
                                            className="text-xs bg-gray-100 dark:bg-dk-raised hover:bg-primary-50 dark:hover:bg-primary-950/40 text-gray-700 dark:text-dk-text hover:text-primary-800 dark:hover:text-primary-300 px-2 py-1 rounded cursor-pointer border border-transparent hover:border-primary-200 dark:hover:border-primary-800 transition-all inline-flex items-center gap-1 font-mono"
                                          >
                                            {`{{${variable.key}}}`}
                                            {copiedKey === variable.key ? (
                                              <HiOutlineCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 inline" />
                                            ) : (
                                              <HiOutlineClipboardCopy className="w-3.5 h-3.5 opacity-40 hover:opacity-100 inline" />
                                            )}
                                          </code>
                                        </td>
                                        <td className="px-4 py-2">
                                          <div className="flex items-center justify-end gap-1.5">
                                            <button
                                              type="button"
                                              onClick={() => handleInsertAndSwitchToContent(variable.key)}
                                              className="px-2 py-1 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 rounded-lg transition-colors text-xs font-medium inline-flex items-center gap-1"
                                              title={t('emailTemplateEditor.insertIntoContent') || 'Chèn vào nội dung'}
                                            >
                                              <HiOutlineDocumentText className="w-3.5 h-3.5" />
                                              <span>{t('emailTemplateEditor.insertVariable') || 'Chèn'}</span>
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => handleCopyKey(variable.key)}
                                              className="p-1.5 text-gray-500 dark:text-dk-text2 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-primary-50 dark:hover:bg-dk-raised rounded-lg transition-colors"
                                              title={t('emailTemplateEditor.copyVariableKey') || 'Sao chép mã biến'}
                                            >
                                              <HiOutlineClipboardCopy className="w-4 h-4" />
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => handleStartEditVariable(index)}
                                              className="p-1.5 text-gray-500 dark:text-dk-text2 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-primary-50 dark:hover:bg-dk-raised rounded-lg transition-colors"
                                              title={t('common.edit')}
                                            >
                                              <HiOutlinePencil className="w-4 h-4" />
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => handleRemoveVariable(index)}
                                              className="p-1.5 text-gray-500 dark:text-dk-text2 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors"
                                              title={t('common.delete')}
                                            >
                                              <HiOutlineTrash className="w-4 h-4" />
                                            </button>
                                          </div>
                                        </td>
                                      </>
                                    )}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </form>
    </div>,
    document.body
  );
};

export default EmailTemplateEditorModal;
