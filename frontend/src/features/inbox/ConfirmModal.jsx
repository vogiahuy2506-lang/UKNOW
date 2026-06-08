import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { HiOutlineExclamation } from 'react-icons/hi';
import { useI18n } from '../../i18n';

const ConfirmModal = ({ isOpen, title, message, onConfirm, onCancel, confirmText, cancelText, danger = false }) => {
  const { t } = useI18n();
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
      if (e.key === 'Escape' && isOpen) {
        onCancel?.();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />
      <div
        ref={modalRef}
        tabIndex={-1}
        className="relative bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
      >
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className={`flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center ${danger ? 'bg-red-100' : 'bg-primary-100'}`}>
              <HiOutlineExclamation className={`w-6 h-6 ${danger ? 'text-red-600' : 'text-primary-600'}`} />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
              {message && <p className="mt-2 text-sm text-gray-600">{message}</p>}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-3 px-6 pb-5 bg-gray-50">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-300 transition-colors"
          >
            {cancelText || t('common.cancel') || 'Hủy'}
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-sm font-medium text-white rounded-lg focus:outline-none focus:ring-2 transition-colors ${
              danger
                ? 'bg-red-600 hover:bg-red-700 focus:ring-red-300'
                : 'bg-primary-600 hover:bg-primary-700 focus:ring-primary-300'
            }`}
          >
            {confirmText || t('common.confirm') || 'Xác nhận'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ConfirmModal;
