import { useMemo, useRef, useCallback, useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import {
  HiOutlineChevronLeft,
  HiOutlineX,
  HiOutlineTemplate,
  HiOutlineViewGrid,
  HiOutlineClock,
  HiOutlineCog,
  HiOutlineDocumentText,
  HiOutlineBookmark,
  HiOutlineCode,
  HiOutlineClipboardList,
  HiOutlineChevronDown,
  HiOutlineCheck,
  HiOutlineRefresh,
  HiOutlineAdjustments,
  HiOutlineEye,
  HiOutlineArrowsExpand,
  HiOutlineSparkles,
} from 'react-icons/hi';
import DeviceFrameToggle from './DeviceFrameToggle.jsx';
import ZoomControl from './ZoomControl.jsx';
import { useI18n } from '../../../i18n';

/**
 * Topbar 52px (h-[52px]) studio chuyên nghiệp, giải phóng tối đa chiều cao.
 *
 * Gộp các điều khiển xem trước (Preview controls: Xem trước/Code, Desktop/Tablet/Mobile, Zoom, Fit)
 * lên chính giữa thanh Topbar, giúp loại bỏ hoàn toàn thanh Preview Toolbar riêng biệt (tiết kiệm ~56px).
 */
export default function LandingCanvasTopbar({
  form,
  setForm,
  editingId,
  saving,
  onClose,
  onSave,
  activeModalTab,
  onOpenSettingTab,
  onOpenTemplateGallery,
  onOpenVisualEditor,
  onOpenVersionHistory,
  onOpenSaveTemplate,
  onOpenImportHtml,
  // Preview controls (gộp lên Topbar)
  previewMode = 'view',
  onPreviewModeChange,
  viewport = 'desktop',
  onViewportChange,
  zoom = 1,
  onZoomChange,
  isFitToScreen = false,
  onToggleFitToScreen,
  fitPercent = null,
  isChatCollapsed = false,
  onToggleChat,
  showPreviewControls = false,
}) {
  const tc = useI18n('landingCanvas.topbar');
  const ti = useI18n('landingCanvas.importHtml');
  const tp = useI18n('landingCanvas.canvasPreview');
  const closeBtnRef = useRef(null);

  const [toolsOpen, setToolsOpen] = useState(false);
  const toolsMenuRef = useRef(null);

  // Đóng dropdown khi click outside hoặc nhấn phím Escape
  useEffect(() => {
    if (!toolsOpen) return;
    const handleClickOutside = (e) => {
      if (toolsMenuRef.current && !toolsMenuRef.current.contains(e.target)) {
        setToolsOpen(false);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setToolsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [toolsOpen]);

  const titleMaxLength = useMemo(() => 200, []);

  const handleTitleChange = useCallback(
    (e) => {
      const value = e.target.value.slice(0, titleMaxLength);
      setForm((p) => ({ ...p, title: value }));
    },
    [setForm, titleMaxLength]
  );

  const handleSave = useCallback(() => {
    if (!String(form.title || '').trim()) {
      toast.error(tc('titleRequiredToast'));
      return;
    }
    onSave?.();
  }, [form.title, onSave, tc]);

  return (
    <div className="h-[52px] bg-white dark:bg-dk-surface border-b border-gray-200/90 dark:border-dk-border flex items-center justify-between px-3 sm:px-4 shrink-0 select-none shadow-2xs z-20 gap-2">
      {/* Cụm Trái: Nút Quay lại + Ô nhập Tên trang */}
      <div className="flex items-center gap-2 min-w-0 flex-1 max-w-[280px] lg:max-w-xs shrink-0">
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-xl text-gray-500 dark:text-dk-text2 hover:text-gray-900 dark:hover:text-dk-text hover:bg-gray-100 dark:hover:bg-dk-raised transition-colors shrink-0"
          title={tc('backTooltip')}
          ref={closeBtnRef}
        >
          <HiOutlineChevronLeft className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 bg-gray-50/90 dark:bg-dk-raised hover:bg-gray-100/80 dark:hover:bg-dk-strong focus-within:bg-white dark:focus-within:bg-dk-raised border border-gray-200/90 dark:border-dk-border/80 focus-within:border-orange-500 dark:focus-within:border-orange-500 focus-within:ring-2 focus-within:ring-orange-500/15 rounded-xl px-2.5 h-[36px] transition-all w-full box-border">
          <HiOutlineDocumentText className="w-4 h-4 text-orange-500 shrink-0" />
          <input
            type="text"
            value={form.title || ''}
            onChange={handleTitleChange}
            placeholder={tc('titlePlaceholder')}
            className="text-xs sm:text-sm font-semibold text-gray-900 dark:text-dk-text bg-transparent border-none focus:outline-none min-w-0 flex-1 placeholder:text-gray-400 dark:placeholder:text-dk-muted placeholder:font-normal"
          />
          {!form.title?.trim() && (
            <span className="text-[10px] font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border border-amber-200/70 dark:border-amber-800/60 px-1.5 py-0.5 rounded shrink-0 hidden sm:inline">
              {tc('titleRequired')}
            </span>
          )}
        </div>
      </div>

      {/* Cụm Giữa: Preview Controls (Gộp lên Topbar khi ở chế độ docked) */}
      {showPreviewControls && (
        <div className="hidden md:flex items-center gap-2 min-w-0 shrink">
          {/* Mode Switcher: Xem trước / Mã HTML */}
          <div className="flex items-center gap-0.5 p-1 bg-gray-100/90 dark:bg-dk-raised rounded-xl border border-transparent dark:border-dk-border">
            <button
              type="button"
              onClick={() => onPreviewModeChange?.('view')}
              className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
                previewMode === 'view'
                  ? 'bg-white dark:bg-dk-surface text-orange-600 dark:text-orange-400 shadow-xs ring-1 ring-orange-500/20'
                  : 'text-gray-600 dark:text-dk-text hover:text-gray-900 dark:hover:text-dk-text hover:bg-white/60 dark:hover:bg-dk-raised/60'
              }`}
              title={tp('view')}
            >
              <HiOutlineEye className="w-3.5 h-3.5" />
              <span>{tp('view')}</span>
            </button>
            <button
              type="button"
              onClick={() => onPreviewModeChange?.('code')}
              className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
                previewMode === 'code'
                  ? 'bg-white dark:bg-dk-surface text-orange-600 dark:text-orange-400 shadow-xs ring-1 ring-orange-500/20'
                  : 'text-gray-600 dark:text-dk-text hover:text-gray-900 dark:hover:text-dk-text hover:bg-white/60 dark:hover:bg-dk-raised/60'
              }`}
              title={tp('code')}
            >
              <HiOutlineCode className="w-3.5 h-3.5" />
              <span>{tp('code')}</span>
            </button>
          </div>

          {/* Device & Zoom & Fullscreen (chỉ hiện ở mode view) */}
          {previewMode === 'view' && (
            <>
              <DeviceFrameToggle value={viewport} onChange={onViewportChange} />

              <ZoomControl
                value={zoom}
                onChange={onZoomChange}
                isFit={isFitToScreen}
                onToggleFit={onToggleFitToScreen}
                fitPercent={fitPercent}
              />

              {/* Nút Xem toàn cảnh / Thu gọn chat để mở rộng tối đa màn hình */}
              {onToggleChat && (
                <button
                  type="button"
                  onClick={onToggleChat}
                  className={`h-[34px] px-2.5 rounded-xl border text-xs font-semibold transition-all inline-flex items-center gap-1.5 ${
                    isChatCollapsed
                      ? 'bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-800/60 ring-2 ring-orange-500/15'
                      : 'bg-white dark:bg-dk-raised text-gray-600 dark:text-dk-text border-gray-200/90 dark:border-dk-border/80 hover:bg-gray-50 dark:hover:bg-dk-strong hover:text-gray-900 dark:hover:text-dk-text'
                  }`}
                  title={isChatCollapsed ? tc('expandChatTooltip') : tc('collapseChatTooltip')}
                >
                  {isChatCollapsed ? (
                    <>
                      <HiOutlineSparkles className="w-3.5 h-3.5 text-orange-600 animate-pulse" />
                      <span className="hidden xl:inline">{tc('openChatBtn')}</span>
                    </>
                  ) : (
                    <>
                      <HiOutlineArrowsExpand className="w-3.5 h-3.5 text-gray-500 dark:text-dk-text2" />
                      <span className="hidden xl:inline">{tc('fullscreenBtn')}</span>
                    </>
                  )}
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* Cụm Phải: Cài đặt, Công cụ, Đóng, Lưu */}
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        {/* Settings button */}
        <button
          type="button"
          onClick={() => onOpenSettingTab?.('page')}
          className={`h-[36px] px-3 rounded-xl text-xs sm:text-sm font-semibold transition-all inline-flex items-center justify-center gap-1.5 shadow-2xs box-border ${
            activeModalTab
              ? 'bg-orange-500 text-white shadow-xs border border-transparent'
              : 'bg-gray-100/90 dark:bg-dk-raised text-gray-700 dark:text-dk-text hover:bg-gray-200 dark:hover:bg-dk-strong hover:text-gray-900 dark:hover:text-dk-text border border-gray-200/60 dark:border-dk-border/60'
          }`}
        >
          <HiOutlineCog className="w-4 h-4 shrink-0" />
          <span className="hidden sm:inline">{tc('settings')}</span>
        </button>

        {/* Tools Dropdown Menu */}
        <div className="relative" ref={toolsMenuRef}>
          <button
            type="button"
            onClick={() => setToolsOpen((prev) => !prev)}
            className={`h-[36px] px-2.5 sm:px-3 rounded-xl text-xs sm:text-sm font-medium transition-all inline-flex items-center justify-center gap-1 border shadow-2xs box-border ${
              toolsOpen
                ? 'bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-800/60 ring-2 ring-orange-500/15'
                : 'bg-white dark:bg-dk-raised text-gray-700 dark:text-dk-text border-gray-200/90 dark:border-dk-border/80 hover:bg-gray-50 dark:hover:bg-dk-strong hover:text-gray-900 dark:hover:text-dk-text'
            }`}
            title={tc('toolsTooltip')}
          >
            <HiOutlineAdjustments className="w-3.5 h-3.5 text-gray-500 dark:text-dk-text2" />
            <span className="hidden md:inline">{tc('tools')}</span>
            <HiOutlineChevronDown className={`w-3 h-3 text-gray-400 transition-transform duration-150 ${toolsOpen ? 'rotate-180 text-orange-600' : ''}`} />
          </button>

          {toolsOpen && (
            <div className="absolute right-0 mt-1.5 w-64 bg-white dark:bg-dk-surface rounded-2xl shadow-xl border border-gray-200/90 dark:border-dk-border py-1.5 z-50 animate-in fade-in slide-in-from-top-1 duration-150">
              <div className="px-3.5 py-1.5 text-[11px] font-semibold text-gray-400 dark:text-dk-text2 uppercase tracking-wider">
                {tc('toolsSectionTemplates')}
              </div>

              <button
                type="button"
                onClick={() => {
                  setToolsOpen(false);
                  onOpenTemplateGallery?.();
                }}
                className="w-full text-left px-3.5 py-2 text-xs sm:text-sm text-gray-700 dark:text-dk-text hover:bg-orange-50 dark:hover:bg-orange-950/30 hover:text-orange-900 dark:hover:text-orange-300 flex items-center gap-2.5 transition-colors"
              >
                <div className="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                  <HiOutlineTemplate className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="font-semibold text-gray-800 dark:text-dk-text">{tc('templates')}</div>
                  <div className="text-[11px] text-gray-500 dark:text-dk-text2 truncate">{tc('toolsTemplatesDesc')}</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setToolsOpen(false);
                  onOpenVisualEditor?.();
                }}
                className="w-full text-left px-3.5 py-2 text-xs sm:text-sm text-gray-700 dark:text-dk-text hover:bg-orange-50 dark:hover:bg-orange-950/30 hover:text-orange-900 dark:hover:text-orange-300 flex items-center gap-2.5 transition-colors"
              >
                <div className="w-7 h-7 rounded-lg bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
                  <HiOutlineViewGrid className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="font-semibold text-gray-800 dark:text-dk-text">{tc('visualEditor')}</div>
                  <div className="text-[11px] text-gray-500 dark:text-dk-text2 truncate">{tc('toolsVisualEditorDesc')}</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setToolsOpen(false);
                  onOpenImportHtml?.();
                }}
                className="w-full text-left px-3.5 py-2 text-xs sm:text-sm text-gray-700 dark:text-dk-text hover:bg-orange-50 dark:hover:bg-orange-950/30 hover:text-orange-900 dark:hover:text-orange-300 flex items-center gap-2.5 transition-colors"
              >
                <div className="w-7 h-7 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                  <HiOutlineCode className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="font-semibold text-gray-800 dark:text-dk-text">{ti('button')}</div>
                  <div className="text-[11px] text-gray-500 dark:text-dk-text2 truncate">{tc('toolsImportHtmlDesc')}</div>
                </div>
              </button>

              <div className="my-1 border-t border-gray-100 dark:border-dk-border" />

              <div className="px-3.5 py-1.5 text-[11px] font-semibold text-gray-400 dark:text-dk-text2 uppercase tracking-wider">
                {tc('toolsSectionStorage')}
              </div>

              <button
                type="button"
                onClick={() => {
                  setToolsOpen(false);
                  onOpenSaveTemplate?.();
                }}
                className="w-full text-left px-3.5 py-2 text-xs sm:text-sm text-gray-700 dark:text-dk-text hover:bg-orange-50 dark:hover:bg-orange-950/30 hover:text-orange-900 dark:hover:text-orange-300 flex items-center gap-2.5 transition-colors"
              >
                <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                  <HiOutlineBookmark className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="font-semibold text-gray-800 dark:text-dk-text">{tc('saveAsTemplate')}</div>
                  <div className="text-[11px] text-gray-500 dark:text-dk-text2 truncate">{tc('toolsSaveTemplateDesc')}</div>
                </div>
              </button>

              {editingId ? (
                <button
                  type="button"
                  onClick={() => {
                    setToolsOpen(false);
                    onOpenVersionHistory?.();
                  }}
                  className="w-full text-left px-3.5 py-2 text-xs sm:text-sm text-gray-700 dark:text-dk-text hover:bg-orange-50 dark:hover:bg-orange-950/30 hover:text-orange-900 dark:hover:text-orange-300 flex items-center gap-2.5 transition-colors"
                >
                  <div className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-dk-raised text-slate-600 dark:text-dk-text flex items-center justify-center shrink-0">
                    <HiOutlineClock className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-gray-800 dark:text-dk-text">{tc('history')}</div>
                    <div className="text-[11px] text-gray-500 dark:text-dk-text2 truncate">{tc('toolsHistoryDesc')}</div>
                  </div>
                </button>
              ) : null}
            </div>
          )}
        </div>

        {/* PR-5b-2b mục 7 — chỉ hiện khi landing này có Biểu mẫu gắn */}
        {form?.linkedFormId ? (
          <a
            href={`/app/forms/${form.linkedFormId}/edit`}
            target="_blank"
            rel="noopener noreferrer"
            title={tc('openLinkedForm')}
            className="h-[36px] px-2.5 rounded-xl transition-colors text-blue-700 dark:text-blue-400 bg-blue-50/80 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/50 border border-blue-200/80 dark:border-blue-800/60 inline-flex items-center justify-center gap-1.5 text-xs font-semibold box-border"
          >
            <HiOutlineClipboardList className="w-4 h-4" />
            <span className="hidden lg:inline">{tc('openLinkedForm')}</span>
          </a>
        ) : null}

        <div className="w-px h-5 bg-gray-200 dark:bg-dk-raised mx-0.5 sm:mx-1" />

        {/* 2 Nút hành động chính: Đóng & Lưu */}
        <div className="inline-flex items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center h-[36px] px-3 sm:px-3.5 rounded-xl bg-white dark:bg-dk-raised text-gray-700 dark:text-dk-text border border-gray-300/90 dark:border-dk-border/80 hover:bg-gray-50 dark:hover:bg-dk-strong hover:border-gray-400 dark:hover:border-dk-border-strong active:bg-gray-100 dark:active:bg-dk-raised text-xs sm:text-sm font-semibold transition-all shadow-2xs gap-1 box-border"
          >
            <HiOutlineX className="w-3.5 h-3.5 text-gray-500 dark:text-dk-text2" />
            <span>{tc('close')}</span>
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={Boolean(saving)}
            className="inline-flex items-center justify-center h-[36px] px-3.5 sm:px-4 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 text-white border border-transparent hover:from-orange-600 hover:to-amber-600 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed text-xs sm:text-sm font-bold transition-all shadow-sm hover:shadow gap-1.5 box-border"
          >
            {saving ? (
              <HiOutlineRefresh className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <HiOutlineCheck className="w-3.5 h-3.5" />
            )}
            <span>{saving ? tc('saving') : tc('save')}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
