import { useEffect, useRef, useState } from 'react';
import {
  HiOutlineAdjustments,
  HiOutlineCheck,
  HiOutlineChevronDown,
  HiOutlineChevronLeft,
  HiOutlineCog,
  HiOutlineRefresh,
  HiOutlineX,
} from 'react-icons/hi';
import { useI18n } from '../../i18n';

/**
 * Khung trình soạn thảo cho các trang soạn của quản trị (Tuỳ chỉnh Landing, Trung tâm Chiến dịch Email, Email & lịch nhắc hạn).
 *
 * 11/10/2026 — user: "làm giống thiết kế Tạo landing page trong /app, tập trung vào phần chỉnh sửa, còn cấu hình gì thì để
 * vào 1 mục Cài đặt". Kiểu dáng CHÉP từ `features/landing-canvas/components/LandingCanvasTopbar.jsx` (thanh 52px, nút 36px
 * bo rounded-xl, nút Lưu gradient cam) và `SettingsModal.jsx` (modal Cài đặt) để hai nơi nhìn như một sản phẩm.
 *
 * Bố cục: <AdminEditorShell topbar={<EditorTopbar … />}> vùng soạn chiếm trọn phần còn lại </AdminEditorShell>.
 * Route dùng khung này phải nằm trong `isAdminEditor` của `layouts/MainLayout.jsx` (bỏ đệm/bo góc quanh <main> như canvas landing).
 */
export function AdminEditorShell({ topbar, children, className = '' }) {
  return (
    <div
      className={`flex flex-col h-full min-h-0 bg-gray-50 dark:bg-dk-bg overflow-hidden ${className}`}
      data-testid="admin-editor-shell"
    >
      {topbar}
      <div className="flex-1 min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}

/**
 * Thanh trên 52px. `left` thường là tiêu đề/ô tên; `center` (ẩn dưới md) cho bộ chọn nhanh (trang, dạng email, thiết bị…);
 * `right` cho các nút (TopbarSettingsButton, TopbarToolsMenu, TopbarButton, TopbarSaveButton).
 */
export function EditorTopbar({ onBack, backTitle, icon: Icon, title, subtitle, center, right }) {
  return (
    <div className="h-[52px] bg-white dark:bg-dk-surface border-b border-gray-200/90 dark:border-dk-border flex items-center justify-between px-3 sm:px-4 shrink-0 select-none shadow-2xs z-20 gap-2">
      <div className="flex items-center gap-2 min-w-0 shrink">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            title={backTitle}
            aria-label={backTitle}
            className="p-1.5 rounded-xl text-gray-500 dark:text-dk-text2 hover:text-gray-900 dark:hover:text-dk-text hover:bg-gray-100 dark:hover:bg-dk-raised transition-colors shrink-0"
          >
            <HiOutlineChevronLeft className="w-5 h-5" />
          </button>
        )}
        {Icon && (
          <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 text-white flex items-center justify-center shrink-0 shadow-xs">
            <Icon className="w-4 h-4" />
          </span>
        )}
        <div className="min-w-0">
          <div className="text-sm font-semibold text-gray-900 dark:text-dk-text truncate">{title}</div>
          {subtitle && <div className="text-[11px] text-gray-500 dark:text-dk-text2 truncate hidden sm:block">{subtitle}</div>}
        </div>
      </div>
      {center && <div className="hidden md:flex items-center gap-2 min-w-0 shrink">{center}</div>}
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">{right}</div>
    </div>
  );
}

/** Nhóm nút chọn dạng "viên thuốc" (giống công tắc Xem trước / Mã HTML của landing). */
export function TopbarSegmented({ value, onChange, options, ariaLabel }) {
  return (
    <div role="tablist" aria-label={ariaLabel} className="flex items-center gap-0.5 p-1 bg-gray-100/90 dark:bg-dk-raised rounded-xl border border-transparent dark:border-dk-border">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            title={opt.title}
            className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all inline-flex items-center gap-1.5 whitespace-nowrap ${
              active
                ? 'bg-white dark:bg-dk-surface text-orange-600 dark:text-orange-400 shadow-xs ring-1 ring-orange-500/20'
                : 'text-gray-600 dark:text-dk-text hover:text-gray-900 dark:hover:text-dk-text hover:bg-white/60 dark:hover:bg-dk-strong/60'
            }`}
          >
            {opt.icon && <opt.icon className="w-3.5 h-3.5" />}
            <span>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Nút phụ cao 36px (Đóng, Khôi phục…). */
export function TopbarButton({ icon: Icon, children, active = false, ...rest }) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-1.5 h-[36px] px-3 rounded-xl text-xs sm:text-sm font-semibold transition-all border shadow-2xs disabled:opacity-60 disabled:cursor-not-allowed ${
        active
          ? 'bg-orange-500 text-white border-transparent'
          : 'bg-white dark:bg-dk-raised text-gray-700 dark:text-dk-text border-gray-300/90 dark:border-dk-border/80 hover:bg-gray-50 dark:hover:bg-dk-strong'
      }`}
      {...rest}
    >
      {Icon && <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />}
      {children}
    </button>
  );
}

/** Nút "Cài đặt" — mở EditorSettingsModal. */
export function TopbarSettingsButton({ onClick, active = false }) {
  const { t } = useI18n();
  return (
    <TopbarButton icon={HiOutlineCog} active={active} onClick={onClick} aria-label={t('editorShell.settings')}>
      <span className="hidden sm:inline">{t('editorShell.settings')}</span>
    </TopbarButton>
  );
}

/**
 * Menu "Công cụ". `items`: [{ key, icon, label, description, onClick, disabled, danger }].
 */
export function TopbarToolsMenu({ items }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  // Dưới sm menu rộng cả bề ngang màn hình (nút Công cụ không còn nằm sát mép phải nên `right-0 w-64` tràn ra ngoài trái) —
  // vị trí dọc lấy từ đáy nút lúc mở.
  const [menuTop, setMenuTop] = useState(0);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);
  if (!items?.length) return null;
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => {
          if (!open && ref.current) setMenuTop(Math.round(ref.current.getBoundingClientRect().bottom) + 6);
          setOpen((v) => !v);
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('editorShell.tools')}
        className={`h-[36px] px-2.5 sm:px-3 rounded-xl text-xs sm:text-sm font-medium transition-all inline-flex items-center justify-center gap-1 border shadow-2xs ${
          open
            ? 'bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800/60'
            : 'bg-white dark:bg-dk-raised text-gray-700 dark:text-dk-text border-gray-200/90 dark:border-dk-border/80 hover:bg-gray-50 dark:hover:bg-dk-strong'
        }`}
      >
        <HiOutlineAdjustments className="w-3.5 h-3.5 text-gray-500 dark:text-dk-text2" />
        <span className="hidden md:inline">{t('editorShell.tools')}</span>
        <HiOutlineChevronDown className={`w-3 h-3 text-gray-400 dark:text-dk-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div
          role="menu"
          style={{ '--tools-top': `${menuTop}px` }}
          className="fixed left-3 right-3 top-[var(--tools-top)] sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-1.5 sm:w-64 bg-white dark:bg-dk-surface rounded-2xl shadow-xl border border-gray-200/90 dark:border-dk-border py-1.5 z-50 animate-in fade-in slide-in-from-top-1 duration-150">
          {items.map((it) => (
            <button
              key={it.key}
              type="button"
              role="menuitem"
              disabled={it.disabled}
              onClick={() => { setOpen(false); it.onClick?.(); }}
              className={`w-full text-left px-3.5 py-2 text-xs sm:text-sm flex items-center gap-2.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                it.danger
                  ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30'
                  : 'text-gray-700 dark:text-dk-text hover:bg-orange-50 dark:hover:bg-orange-950/30 hover:text-orange-900 dark:hover:text-orange-300'
              }`}
            >
              {it.icon && (
                <span className="w-7 h-7 rounded-lg bg-gray-100 dark:bg-dk-raised text-gray-600 dark:text-dk-text2 flex items-center justify-center shrink-0">
                  <it.icon className="w-4 h-4" />
                </span>
              )}
              <span className="min-w-0">
                <span className="block font-semibold">{it.label}</span>
                {it.description && <span className="block text-[11px] text-gray-500 dark:text-dk-text2 truncate">{it.description}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Nút Lưu (gradient cam) — đổi nhãn/icon khi đang lưu. `label` mặc định "Lưu". */
export function TopbarSaveButton({ onClick, saving = false, disabled = false, label, title, icon: Icon = HiOutlineCheck }) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={saving || disabled}
      className="inline-flex items-center justify-center gap-1.5 h-[36px] px-3.5 sm:px-4 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 text-white border border-transparent hover:from-orange-600 hover:to-amber-600 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed text-xs sm:text-sm font-semibold shadow-xs"
    >
      {saving ? <HiOutlineRefresh className="w-3.5 h-3.5 animate-spin" /> : <Icon className="w-3.5 h-3.5" />}
      <span>{saving ? t('editorShell.saving') : (label || t('editorShell.save'))}</span>
    </button>
  );
}

/** Vạch ngăn giữa nhóm nút phụ và nút chính. */
export function TopbarDivider() {
  return <div className="w-px h-5 bg-gray-200 dark:bg-dk-border mx-0.5 sm:mx-1" aria-hidden="true" />;
}

/**
 * Modal "Cài đặt" — nơi gom MỌI cấu hình (đối tượng nhận, lịch gửi, kênh, lịch nhắc, chế độ soạn…) để vùng chính chỉ còn soạn.
 * `tabs` tuỳ chọn: [{ key, label, icon }] + `activeTab`/`onTabChange`; nội dung là `children`.
 */
export function EditorSettingsModal({ open, onClose, title, subtitle, tabs, activeTab, onTabChange, footer, children }) {
  const { t } = useI18n();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onCloseRef.current?.(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title || t('editorShell.settings')}
        className="bg-white dark:bg-dk-surface rounded-2xl shadow-2xl w-full max-w-3xl lg:max-w-4xl max-h-[90vh] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-dk-border bg-gradient-to-r from-orange-50 dark:from-orange-950/40 to-white dark:to-dk-surface">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-gray-900 dark:text-dk-text">{title || t('editorShell.settings')}</h2>
            {subtitle && <p className="text-xs text-gray-500 dark:text-dk-text2 mt-0.5">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label={t('editorShell.close')} className="p-1.5 rounded-lg text-gray-400 dark:text-dk-muted hover:text-gray-700 dark:hover:text-dk-text hover:bg-gray-100 dark:hover:bg-dk-raised">
            <HiOutlineX className="w-5 h-5" />
          </button>
        </div>
        {tabs?.length > 0 && (
          <div data-testid="editor-settings-tabs" className="shrink-0 px-6 pt-3 pb-px border-b border-gray-100 dark:border-dk-border flex gap-1 overflow-x-auto overflow-y-hidden">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => onTabChange?.(tab.key)}
                className={`px-3 py-2 text-sm font-semibold border-b-2 -mb-px inline-flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                  tab.key === activeTab
                    ? 'border-orange-500 text-orange-600 dark:text-orange-400'
                    : 'border-transparent text-gray-500 dark:text-dk-text2 hover:text-gray-800 dark:hover:text-dk-text'
                }`}
              >
                {tab.icon && <tab.icon className="w-4 h-4" />}
                {tab.label}
              </button>
            ))}
          </div>
        )}
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="shrink-0 px-6 py-3 border-t border-gray-100 dark:border-dk-border flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

export default AdminEditorShell;
