import { useState, useRef, useCallback } from 'react';
import { HiOutlinePaperAirplane } from 'react-icons/hi';
import { useI18n } from '../../../i18n';

/**
 * Composer input cho chat panel.
 * - Enter để gửi, Shift+Enter để xuống dòng
 * - Disabled khi isStreaming
 */
export default function ChatComposer({ onSend, disabled = false }) {
  const tc = useI18n('landingCanvas.chat');
  const [value, setValue] = useState('');
  const textareaRef = useRef(null);

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend?.({ prompt: trimmed });
    setValue('');
    textareaRef.current?.focus();
  }, [value, disabled, onSend]);

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  return (
    <div className="border-t border-gray-200 p-4 shrink-0 bg-white">
      <div className="flex items-end gap-2.5">
        <textarea
          ref={textareaRef}
          rows={2}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={tc('placeholder')}
          disabled={disabled}
          className="flex-1 resize-none border border-gray-300 rounded-lg px-4 py-2.5 text-[15px] focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 disabled:bg-gray-50 disabled:cursor-not-allowed"
          style={{ maxHeight: 140 }}
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={disabled || !value.trim()}
          className="inline-flex items-center justify-center w-11 h-11 rounded-lg bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
          title={tc('send')}
        >
          <HiOutlinePaperAirplane className="w-5 h-5 -rotate-45" />
        </button>
      </div>
    </div>
  );
}
