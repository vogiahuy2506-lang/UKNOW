import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { HiOutlineX } from 'react-icons/hi';
import { useI18n } from '../../../i18n';

/**
 * @param {object} props
 * @param {object} [props.contentStyle] ghi đè kích thước khung (mặc định 80vw x 80vh, tối đa 1100px) —
 *   form nhỏ truyền { maxWidth: '520px', height: 'auto', maxHeight: '90vh' }.
 */
const BaseModal = ({ isOpen, onClose, title, children, contentStyle }) => {
  const { t } = useI18n();
  const closeBtnRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      requestAnimationFrame(() => closeBtnRef.current?.focus());
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="modal-content-animate relative flex flex-col bg-white dark:bg-dk-surface rounded-xl shadow-2xl border border-slate-200 dark:border-dk-border overflow-hidden"
        style={{ width: '80vw', maxWidth: '1100px', height: '80vh', ...contentStyle }}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-dk-border shrink-0 bg-white dark:bg-dk-surface">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-dk-text truncate pr-4">{title}</h2>
          <button
            ref={closeBtnRef}
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-dk-raised text-gray-500 dark:text-dk-text2 transition-colors shrink-0"
            aria-label={t('common.close')}
          >
            <HiOutlineX className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default BaseModal;
