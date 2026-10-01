import { useMemo, useRef, useCallback } from 'react';
import toast from 'react-hot-toast';
import { HiOutlineChevronLeft, HiOutlineX, HiOutlineTemplate, HiOutlineViewGrid, HiOutlineClock, HiOutlineCog, HiOutlineDocumentText, HiOutlineBookmark, HiOutlineCode, HiOutlineClipboardList } from 'react-icons/hi';
import { useI18n } from '../../../i18n';

/**
 * Topbar 64px RIÊNG bên trong main area của MainLayout.
 * Style tham chiếu từ frontend/src/components/layout/admin/Header.jsx + Sidebar.jsx.
 *
 * Nhận vào:
 *  - form, setForm     : form state của LandingCanvasEditor
 *  - editingId         : null nếu tạo mới, số nếu edit
 *  - saving            : disable nút Lưu
 *  - onClose           : navigate về list
 *  - onSave            : save handler
 *  - onOpenSettingTab  : callback(tabKey) mở Settings Modal với tab tương ứng
 *  - onOpenTemplateGallery
 *  - onOpenVisualEditor
 *  - onOpenVersionHistory
 *  - onOpenSaveTemplate
 *  - onOpenImportHtml   : mở modal "Nhập HTML" (PLAN_LANDING_DAN_HTML_CO_SAN_2026-09-13.md)
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
}) {
  const tc = useI18n('landingCanvas.topbar');
  const ti = useI18n('landingCanvas.importHtml');
  const closeBtnRef = useRef(null);

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
    <div className="h-12 bg-white border-b border-gray-200 flex items-center px-3 shrink-0 text-[13px]">
      {/* Left: Back + Title */}
      <button
        type="button"
        onClick={onClose}
        className="p-1.5 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors mr-2 shrink-0"
        title={tc('backTooltip')}
        ref={closeBtnRef}
      >
        <HiOutlineChevronLeft className="w-5 h-5" />
      </button>

      <div className="flex items-center gap-2 min-w-0 flex-1">
        <div className="flex items-center gap-2 bg-gray-50 hover:bg-gray-100/70 focus-within:bg-white border border-gray-200/80 focus-within:border-orange-500 focus-within:ring-2 focus-within:ring-orange-500/15 rounded-lg px-2.5 py-1 transition-all max-w-md w-full">
          <HiOutlineDocumentText className="w-4 h-4 text-orange-500 shrink-0" />
          <input
            type="text"
            value={form.title || ''}
            onChange={handleTitleChange}
            placeholder={tc('titlePlaceholder')}
            className="text-sm font-semibold text-gray-900 bg-transparent border-none focus:outline-none min-w-0 flex-1 placeholder:text-gray-400 placeholder:font-normal"
          />
          {!form.title?.trim() && (
            <span className="text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200/60 px-1.5 py-0.2 rounded shrink-0 hidden sm:inline">
              {tc('titleRequired')}
            </span>
          )}
        </div>
      </div>

      {/* Spacer */}
      <div className="flex-1 min-w-[8px]" />

      {/* Right: Actions */}
      <div className="flex items-center gap-1">
        {/* Settings button */}
        <button
          type="button"
          onClick={() => onOpenSettingTab?.('page')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 shadow-2xs ${
            activeModalTab
              ? 'bg-orange-500 text-white'
              : 'bg-gray-100/80 text-gray-700 hover:bg-gray-200 hover:text-gray-900'
          }`}
        >
          <HiOutlineCog className="w-4 h-4" />
          <span>{tc('settings')}</span>
        </button>
        <div className="w-px h-5 bg-gray-200 mx-1" />
        <IconButton
          icon={HiOutlineCode}
          onClick={onOpenImportHtml}
          title={ti('button')}
        />
        <IconButton
          icon={HiOutlineTemplate}
          onClick={onOpenTemplateGallery}
          title={tc('templates')}
        />
        <IconButton
          icon={HiOutlineBookmark}
          onClick={onOpenSaveTemplate}
          title={tc('saveAsTemplate')}
        />
        <IconButton
          icon={HiOutlineViewGrid}
          onClick={onOpenVisualEditor}
          title={tc('visualEditor')}
        />
        {editingId ? (
          <IconButton
            icon={HiOutlineClock}
            onClick={onOpenVersionHistory}
            title={tc('history')}
          />
        ) : null}
        {/* PR-5b-2b mục 7 — chỉ hiện khi landing này có Biểu mẫu gắn (PR-5b-2a forms.landing_page_id). */}
        {form.linkedFormId ? (
          <a
            href={`/app/forms/${form.linkedFormId}/edit`}
            target="_blank"
            rel="noopener noreferrer"
            title={tc('openLinkedForm')}
            className="p-2 rounded-lg transition-colors text-gray-500 hover:text-gray-900 hover:bg-gray-100"
          >
            <HiOutlineClipboardList className="w-4.5 h-4.5" />
          </a>
        ) : null}
      </div>

      <div className="w-px h-5 bg-gray-200 mx-2" />

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center justify-center h-8.5 px-3 rounded-lg bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 active:bg-gray-100 text-xs font-semibold transition-colors shadow-2xs"
        >
          <HiOutlineX className="w-3.5 h-3.5 mr-1 text-gray-500" />
          {tc('close')}
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={Boolean(saving)}
          className="inline-flex items-center justify-center h-8.5 px-4 rounded-lg bg-gradient-to-r from-orange-500 to-amber-500 text-white hover:from-orange-600 hover:to-amber-600 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed text-xs font-bold transition-all shadow-xs"
        >
          {saving ? tc('saving') : tc('save')}
        </button>
      </div>
    </div>
  );
}

function IconButton({ icon: Icon, onClick, title, active = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`p-2 rounded-lg transition-colors ${
        active
          ? 'bg-orange-50 text-orange-600'
          : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
      }`}
    >
      <Icon className="w-4.5 h-4.5" />
    </button>
  );
}
