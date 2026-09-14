import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { HiOutlineX, HiOutlineCode, HiOutlineUpload, HiOutlineExclamation } from 'react-icons/hi';
import { useI18n } from '../../../i18n';

const MAX_IMPORT_HTML_CHARS = 500000;

/**
 * Modal "Nhập HTML" (PLAN_LANDING_DAN_HTML_CO_SAN_2026-09-13.md, Việc 1) — dán/nhập HTML có sẵn,
 * KHÔNG qua AI, KHÔNG gọi prepareLandingHtmlOnSave ở trình duyệt (việc của backend lúc lưu).
 * Tệp .html đọc bằng FileReader phía trình duyệt, không upload lên /uploads/temp.
 *
 * Props:
 *  - isOpen: bool
 *  - onClose: () => void
 *  - currentHtml: string — nếu không rỗng, Áp dụng phải hỏi xác nhận trước khi thay toàn bộ
 *  - onApply: (html: string) => void — gọi khi đã xác nhận (hoặc không cần xác nhận vì trang rỗng)
 */
export default function ImportHtmlModal({ isOpen, onClose, currentHtml = '', onApply }) {
  const ti = useI18n('landingCanvas.importHtml');
  const [value, setValue] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setValue('');
      setConfirming(false);
      setError(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const trimmedValue = value.trim();
  const tooLarge = value.length > MAX_IMPORT_HTML_CHARS;
  const showNoFormWarning = Boolean(trimmedValue) && !/<form[\s>]/i.test(value);
  const hasExistingContent = Boolean(String(currentHtml || '').trim());

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setValue(String(reader.result || ''));
      setError(null);
    };
    reader.readAsText(file);
  };

  const handleApplyClick = () => {
    if (!trimmedValue) return;
    if (tooLarge) {
      setError(ti('tooLarge'));
      return;
    }
    setError(null);
    if (hasExistingContent) {
      setConfirming(true);
      return;
    }
    onApply?.(value);
    onClose?.();
  };

  const handleConfirmReplace = () => {
    onApply?.(value);
    onClose?.();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className="relative w-[calc(100vw-48px)] h-[calc(100vh-96px)] max-w-3xl bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-white shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-orange-50 text-orange-600 rounded-lg">
              <HiOutlineCode className="w-5 h-5" />
            </div>
            <h2 className="text-[18px] font-semibold text-gray-900">{ti('title')}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2.5 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors"
          >
            <HiOutlineX className="w-5 h-5" />
          </button>
        </div>

        {confirming ? (
          <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-5 px-8 text-center">
            <div className="p-3 bg-amber-50 text-amber-600 rounded-full">
              <HiOutlineExclamation className="w-8 h-8" />
            </div>
            <p className="text-[15px] text-gray-700 max-w-md">{ti('replaceConfirm')}</p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="inline-flex items-center justify-center h-10 px-4 rounded-lg bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 text-[14px] font-semibold transition-colors"
              >
                {ti('confirmCancel')}
              </button>
              <button
                type="button"
                onClick={handleConfirmReplace}
                className="inline-flex items-center justify-center h-10 px-4 rounded-lg bg-orange-500 text-white hover:bg-orange-600 text-[14px] font-semibold transition-colors"
              >
                {ti('confirmYes')}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex-1 min-h-0 flex flex-col gap-3 px-6 py-4 overflow-auto">
              <textarea
                value={value}
                onChange={(e) => {
                  setValue(e.target.value);
                  setError(null);
                }}
                placeholder={ti('placeholder')}
                rows={16}
                spellCheck={false}
                className="flex-1 min-h-[320px] w-full resize-none rounded-lg border border-gray-300 bg-[#1e1e1e] text-[#d4d4d4] font-mono text-[13px] leading-relaxed p-3.5 focus:outline-none focus:ring-2 focus:ring-orange-200"
              />

              {error && (
                <p className="text-[13px] text-red-600 font-medium">{error}</p>
              )}
              {!error && showNoFormWarning && (
                <p className="flex items-start gap-1.5 text-[13px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  <HiOutlineExclamation className="w-4 h-4 shrink-0 mt-0.5" />
                  {ti('noFormWarning')}
                </p>
              )}
            </div>

            <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 bg-gray-50/50 shrink-0">
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".html,.htm,text/html"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 h-10 px-4 rounded-lg bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 text-[14px] font-semibold transition-colors"
                >
                  <HiOutlineUpload className="w-4 h-4" />
                  {ti('chooseFile')}
                </button>
              </div>
              <button
                type="button"
                onClick={handleApplyClick}
                disabled={!trimmedValue}
                className="inline-flex items-center justify-center h-10 px-5 rounded-lg bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed text-[14px] font-semibold transition-colors"
              >
                {ti('apply')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
