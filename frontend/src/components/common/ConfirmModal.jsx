import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { HiOutlineExclamation, HiOutlineTrash, HiOutlineInformationCircle } from 'react-icons/hi';
import { useI18n } from '../../i18n';

function useSafeI18n() {
  try {
    return useI18n();
  } catch {
    return { t: (k) => k };
  }
}

/**
 * Modal xác nhận hành động chuẩn hoá cho toàn bộ hệ thống (xóa, ngắt kết nối, thao tác nguy hiểm).
 * Thay thế cho window.confirm() mặc định của trình duyệt.
 */
export default function ConfirmModal({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
  confirmText,
  cancelText,
  variant = 'danger', // 'danger' | 'warning' | 'primary'
  isLoading = false,
}) {
  const { t } = useSafeI18n();
  const defaultCancel = (t('common.cancel') !== 'common.cancel' ? t('common.cancel') : null) || 'Hủy';
  const defaultConfirm = (t('common.confirm') !== 'common.confirm' ? t('common.confirm') : null) || 'Xác nhận';
  const modalRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      setTimeout(() => modalRef.current?.focus(), 50);
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen && !isLoading) {
        onCancel?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isLoading, onCancel]);

  if (!isOpen) return null;

  const iconConfig = {
    danger: {
      bg: 'bg-rose-50 border-rose-100 text-rose-600',
      icon: HiOutlineTrash,
      btn: 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-600/20',
    },
    warning: {
      bg: 'bg-amber-50 border-amber-100 text-amber-600',
      icon: HiOutlineExclamation,
      btn: 'bg-amber-600 hover:bg-amber-700 text-white shadow-amber-600/20',
    },
    primary: {
      bg: 'bg-primary-50 border-primary-100 text-primary-600',
      icon: HiOutlineInformationCircle,
      btn: 'bg-primary-600 hover:bg-primary-700 text-white shadow-primary-600/20',
    },
  }[variant] || {
    bg: 'bg-rose-50 border-rose-100 text-rose-600',
    icon: HiOutlineTrash,
    btn: 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-600/20',
  };

  const IconComponent = iconConfig.icon;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      data-testid="confirm-modal"
    >
      <div
        className="fixed inset-0"
        onClick={() => !isLoading && onCancel?.()}
        aria-hidden="true"
      />
      <div
        ref={modalRef}
        tabIndex={-1}
        className="relative bg-white rounded-2xl shadow-2xl border border-slate-200/90 w-full max-w-md overflow-hidden z-10 animate-in fade-in zoom-in-95 duration-150 outline-none"
      >
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div
              className={`w-12 h-12 rounded-2xl border flex items-center justify-center shrink-0 shadow-xs ${iconConfig.bg}`}
            >
              <IconComponent className="w-6 h-6" />
            </div>
            <div className="min-w-0 flex-1 pt-0.5">
              <h3 className="text-base sm:text-lg font-bold text-slate-900 leading-snug">
                {title}
              </h3>
              {message && (
                <div className="mt-2 text-sm text-slate-600 leading-relaxed whitespace-pre-line">
                  {message}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="px-6 py-4 bg-slate-50/80 border-t border-slate-100 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 transition-colors shadow-2xs disabled:opacity-50 cursor-pointer"
          >
            {cancelText || defaultCancel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className={`inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold shadow-md transition-all disabled:opacity-50 cursor-pointer ${iconConfig.btn}`}
          >
            {isLoading && (
              <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
            )}
            <span>{confirmText || defaultConfirm}</span>
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
