import { useMemo, useRef, useCallback } from 'react';
import toast from 'react-hot-toast';
import { HiOutlineChevronLeft, HiOutlineX, HiOutlineTemplate, HiOutlineViewGrid, HiOutlineClock, HiOutlineUserCircle, HiOutlineGlobeAlt, HiOutlineCog, HiOutlineDocumentText, HiOutlineBookmark } from 'react-icons/hi';
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
}) {
  const tc = useI18n('landingCanvas.topbar');
  // Debug: test the translation function
  const testResult = tc('templates');
  console.log('[Topbar] tc test:', { templates: testResult, type: typeof testResult });
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
    <div className="h-11 bg-white border-b border-gray-200 flex items-center px-3 shrink-0 text-[13px]">
      {/* Left: Back + Title */}
      <button
        type="button"
        onClick={onClose}
        className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors mr-1.5 shrink-0"
        title={tc('backTooltip')}
        ref={closeBtnRef}
      >
        <HiOutlineChevronLeft className="w-5 h-5 text-gray-500" />
      </button>

      <div className="flex items-center gap-2 min-w-0 flex-1">
        <HiOutlineDocumentText className="w-5 h-5 text-gray-400 shrink-0" />
        <input
          type="text"
          value={form.title || ''}
          onChange={handleTitleChange}
          placeholder={tc('titlePlaceholder')}
          className="text-[15px] font-semibold text-gray-900 bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-orange-200 px-2 py-1.5 rounded min-w-0 flex-1 max-w-md"
        />
        {!form.title?.trim() && (
          <span className="text-[12px] text-red-500 shrink-0 hidden md:inline">{tc('titleRequired')}</span>
        )}
      </div>

      {/* Spacer */}
      <div className="flex-1 min-w-[8px]" />

      {/* Right: Setting icons group */}
      <div className="flex items-center gap-0.5">
        <IconButton
          icon={HiOutlineUserCircle}
          onClick={() => onOpenSettingTab?.('leadForm')}
          title={tc('form')}
          active={activeModalTab === 'leadForm'}
        />
        <IconButton
          icon={HiOutlineGlobeAlt}
          onClick={() => onOpenSettingTab?.('domain')}
          title={tc('domain')}
          active={activeModalTab === 'domain'}
        />
        <IconButton
          icon={HiOutlineCog}
          onClick={() => onOpenSettingTab?.('page')}
          title={tc('pageSettings')}
          active={activeModalTab === 'page'}
        />
        <div className="w-px h-5 bg-gray-200 mx-1" />
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
      </div>

      <div className="w-px h-6 bg-gray-200 mx-2" />

      <button
        type="button"
        onClick={onClose}
        className="inline-flex items-center justify-center h-9 px-3.5 rounded-lg bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 active:bg-gray-100 text-[14px] font-semibold transition-colors"
      >
        <HiOutlineX className="w-4 h-4 mr-1.5" />
        {tc('close')}
      </button>
      <button
        type="button"
        onClick={handleSave}
        disabled={Boolean(saving)}
        className="inline-flex items-center justify-center h-9 px-3.5 rounded-lg bg-orange-500 text-white hover:bg-orange-600 active:bg-orange-700 disabled:opacity-60 disabled:cursor-not-allowed text-[14px] font-semibold transition-colors ml-2"
      >
        {saving ? tc('saving') : tc('save')}
      </button>
    </div>
  );
}

function IconButton({ icon: Icon, onClick, title, active = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`p-3 rounded-lg transition-colors ${
        active
          ? 'bg-orange-50 text-orange-600'
          : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
      }`}
    >
      <Icon className="w-6 h-6" />
    </button>
  );
}
