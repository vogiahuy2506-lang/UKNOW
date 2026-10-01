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
} from 'react-icons/hi';
import { useI18n } from '../../../i18n';

/**
 * Topbar 56px (h-14) bên trong main area của MainLayout.
 * Style chuẩn, thoáng đãng, các nút chính rõ ràng và dễ tương tác.
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
    <div className="h-14 bg-white border-b border-gray-200/90 flex items-center justify-between px-3.5 sm:px-5 shrink-0 select-none shadow-2xs z-20">
      {/* Left: Back + Title */}
      <div className="flex items-center gap-2.5 min-w-0 flex-1 max-w-xl">
        <button
          type="button"
          onClick={onClose}
          className="p-2 rounded-xl text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors shrink-0"
          title={tc('backTooltip')}
          ref={closeBtnRef}
        >
          <HiOutlineChevronLeft className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 bg-gray-50/90 hover:bg-gray-100/80 focus-within:bg-white border border-gray-200/90 focus-within:border-orange-500 focus-within:ring-2 focus-within:ring-orange-500/15 rounded-xl px-3 py-1.5 transition-all w-full">
          <HiOutlineDocumentText className="w-4.5 h-4.5 text-orange-500 shrink-0" />
          <input
            type="text"
            value={form.title || ''}
            onChange={handleTitleChange}
            placeholder={tc('titlePlaceholder')}
            className="text-sm font-semibold text-gray-900 bg-transparent border-none focus:outline-none min-w-0 flex-1 placeholder:text-gray-400 placeholder:font-normal"
          />
          {!form.title?.trim() && (
            <span className="text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200/70 px-2 py-0.5 rounded-md shrink-0 hidden sm:inline">
              {tc('titleRequired')}
            </span>
          )}
        </div>
      </div>

      {/* Spacer */}
      <div className="w-4 shrink-0" />

      {/* Right: Actions */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Settings button */}
        <button
          type="button"
          onClick={() => onOpenSettingTab?.('page')}
          className={`h-9.5 px-3.5 rounded-xl text-xs sm:text-sm font-semibold transition-all flex items-center gap-2 shadow-2xs ${
            activeModalTab
              ? 'bg-orange-500 text-white shadow-xs'
              : 'bg-gray-100/90 text-gray-700 hover:bg-gray-200 hover:text-gray-900 border border-gray-200/60'
          }`}
        >
          <HiOutlineCog className="w-4.5 h-4.5 shrink-0" />
          <span>{tc('settings')}</span>
        </button>

        {/* Tools Dropdown Menu (Gom 4 nút chức năng bổ trợ vào 1 dropdown gọn gàng, tránh lặp lại) */}
        <div className="relative" ref={toolsMenuRef}>
          <button
            type="button"
            onClick={() => setToolsOpen((prev) => !prev)}
            className={`h-9.5 px-3 rounded-xl text-xs sm:text-sm font-medium transition-all flex items-center gap-1.5 border shadow-2xs ${
              toolsOpen
                ? 'bg-orange-50 text-orange-700 border-orange-200 ring-2 ring-orange-500/15'
                : 'bg-white text-gray-700 border-gray-200/90 hover:bg-gray-50 hover:text-gray-900'
            }`}
            title="Công cụ bổ trợ & Mẫu"
          >
            <HiOutlineAdjustments className="w-4 h-4 text-gray-500" />
            <span className="hidden md:inline">Công cụ</span>
            <HiOutlineChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform duration-150 ${toolsOpen ? 'rotate-180 text-orange-600' : ''}`} />
          </button>

          {toolsOpen && (
            <div className="absolute right-0 mt-1.5 w-64 bg-white rounded-2xl shadow-xl border border-gray-200/90 py-1.5 z-50 animate-in fade-in slide-in-from-top-1 duration-150">
              <div className="px-3.5 py-1.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                Mẫu & Trình dựng
              </div>

              <button
                type="button"
                onClick={() => {
                  setToolsOpen(false);
                  onOpenTemplateGallery?.();
                }}
                className="w-full text-left px-3.5 py-2 text-xs sm:text-sm text-gray-700 hover:bg-orange-50 hover:text-orange-900 flex items-center gap-2.5 transition-colors"
              >
                <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                  <HiOutlineTemplate className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="font-semibold text-gray-800">{tc('templates')}</div>
                  <div className="text-[11px] text-gray-500 truncate">Chọn từ thư viện mẫu có sẵn</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setToolsOpen(false);
                  onOpenVisualEditor?.();
                }}
                className="w-full text-left px-3.5 py-2 text-xs sm:text-sm text-gray-700 hover:bg-orange-50 hover:text-orange-900 flex items-center gap-2.5 transition-colors"
              >
                <div className="w-7 h-7 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                  <HiOutlineViewGrid className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="font-semibold text-gray-800">{tc('visualEditor')}</div>
                  <div className="text-[11px] text-gray-500 truncate">Chỉnh sửa trực quan kéo thả khối</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setToolsOpen(false);
                  onOpenImportHtml?.();
                }}
                className="w-full text-left px-3.5 py-2 text-xs sm:text-sm text-gray-700 hover:bg-orange-50 hover:text-orange-900 flex items-center gap-2.5 transition-colors"
              >
                <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                  <HiOutlineCode className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="font-semibold text-gray-800">{ti('button')}</div>
                  <div className="text-[11px] text-gray-500 truncate">Nhập hoặc dán mã HTML có sẵn</div>
                </div>
              </button>

              <div className="my-1 border-t border-gray-100" />

              <div className="px-3.5 py-1.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                Lưu trữ & Lịch sử
              </div>

              <button
                type="button"
                onClick={() => {
                  setToolsOpen(false);
                  onOpenSaveTemplate?.();
                }}
                className="w-full text-left px-3.5 py-2 text-xs sm:text-sm text-gray-700 hover:bg-orange-50 hover:text-orange-900 flex items-center gap-2.5 transition-colors"
              >
                <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                  <HiOutlineBookmark className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="font-semibold text-gray-800">{tc('saveAsTemplate')}</div>
                  <div className="text-[11px] text-gray-500 truncate">Lưu trang này vào kho mẫu riêng</div>
                </div>
              </button>

              {editingId ? (
                <button
                  type="button"
                  onClick={() => {
                    setToolsOpen(false);
                    onOpenVersionHistory?.();
                  }}
                  className="w-full text-left px-3.5 py-2 text-xs sm:text-sm text-gray-700 hover:bg-orange-50 hover:text-orange-900 flex items-center gap-2.5 transition-colors"
                >
                  <div className="w-7 h-7 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
                    <HiOutlineClock className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-gray-800">{tc('history')}</div>
                    <div className="text-[11px] text-gray-500 truncate">Xem các phiên bản đã lưu</div>
                  </div>
                </button>
              ) : null}
            </div>
          )}
        </div>

        {/* PR-5b-2b mục 7 — chỉ hiện khi landing này có Biểu mẫu gắn */}
        {form.linkedFormId ? (
          <a
            href={`/app/forms/${form.linkedFormId}/edit`}
            target="_blank"
            rel="noopener noreferrer"
            title={tc('openLinkedForm')}
            className="h-9.5 px-3 rounded-xl transition-colors text-blue-700 bg-blue-50/80 hover:bg-blue-100 border border-blue-200/80 flex items-center gap-1.5 text-xs font-semibold"
          >
            <HiOutlineClipboardList className="w-4.5 h-4.5" />
            <span className="hidden lg:inline">{tc('openLinkedForm')}</span>
          </a>
        ) : null}

        <div className="w-px h-6 bg-gray-200 mx-1.5" />

        {/* 2 Nút hành động chính: Đóng & Lưu — To rõ ràng, cân đối và nổi bật */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center h-9.5 px-4.5 rounded-xl bg-white text-gray-700 border border-gray-300/90 hover:bg-gray-100 hover:border-gray-400 active:bg-gray-200 text-sm font-semibold transition-all shadow-2xs gap-1.5"
          >
            <HiOutlineX className="w-4 h-4 text-gray-500" />
            <span>{tc('close')}</span>
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={Boolean(saving)}
            className="inline-flex items-center justify-center h-9.5 px-6 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 text-white hover:from-orange-600 hover:to-amber-600 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed text-sm font-bold transition-all shadow-sm hover:shadow gap-2"
          >
            {saving ? (
              <HiOutlineRefresh className="w-4 h-4 animate-spin" />
            ) : (
              <HiOutlineCheck className="w-4 h-4" />
            )}
            <span>{saving ? tc('saving') : tc('save')}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
