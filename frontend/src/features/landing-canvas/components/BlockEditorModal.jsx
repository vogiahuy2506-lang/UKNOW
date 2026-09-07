import { useCallback } from 'react';
import { createPortal } from 'react-dom';
import { HiOutlineX } from 'react-icons/hi';
import { useI18n } from '../../../i18n';
import VisualBlockEditor from '../../landing-pages/components/VisualBlockEditor.jsx';

/**
 * Modal overlay wrapping VisualBlockEditor — bật từ topbar icon.
 *
 * Props:
 *  - open: bool
 *  - html: current htmlContent
 *  - onApply: (html: string) => void
 *  - onClose: () => void
 */
export default function BlockEditorModal({ open, html, onApply, onClose }) {
  const tc = useI18n('landingCanvas.blockEditorModal');
  const handleSave = useCallback(
    (generatedHtml) => {
      onApply?.(generatedHtml);
      onClose?.();
    },
    [onApply, onClose]
  );

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className="relative w-[calc(100vw-48px)] h-[calc(100vh-48px)] max-w-7xl bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-white shrink-0 z-10">
          <h2 className="text-[20px] font-semibold text-gray-900">
            {tc('title')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2.5 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors"
          >
            <HiOutlineX className="w-6 h-6" />
          </button>
        </div>
        <div className="flex-1 min-h-0">
          <VisualBlockEditor
            isOpen={open}
            initialHtml={html}
            onSave={handleSave}
            onClose={onClose}
          />
        </div>
      </div>
    </div>,
    document.body
  );
}
