import { useState, useEffect, useRef } from 'react';
import { HiPaperAirplane, HiPaperClip } from 'react-icons/hi';
import { useI18n } from '../../i18n';

const ReplyInput = ({ onSend, disabled, placeholder }) => {
  const { t } = useI18n();
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const textareaRef = useRef(null);

  const placeholderText = placeholder || t('inbox.typeMessage');

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px';
    }
  }, [message]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!message.trim() || isSending || disabled) return;

    setIsSending(true);
    try {
      await onSend(message.trim());
      setMessage('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    } catch (err) {
      console.error('Failed to send message:', err);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="border-t border-gray-200 p-3 bg-white">
      <div className="flex items-end gap-2">
        {/* Attachment button */}
        <button
          type="button"
          className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          title={t('common.attachment')}
        >
          <HiPaperClip className="w-5 h-5" />
        </button>

        {/* Text input */}
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholderText}
            disabled={disabled || isSending}
            rows={1}
            className="w-full px-4 py-2.5 pr-10 border border-gray-300 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed text-sm"
            style={{ minHeight: '42px', maxHeight: '120px' }}
          />
        </div>

        {/* Send button */}
        <button
          type="submit"
          disabled={!message.trim() || isSending || disabled}
          className={`p-2.5 rounded-xl transition-all duration-200 ${
            message.trim() && !isSending && !disabled
              ? 'bg-primary-500 text-white hover:bg-primary-600'
              : 'bg-gray-100 text-gray-400 cursor-not-allowed'
          }`}
          title={t('inbox.send')}
        >
          {isSending ? (
            <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <HiPaperAirplane className="w-5 h-5" />
          )}
        </button>
      </div>

      {/* Helper text */}
      <p className="text-xs text-gray-400 mt-2 px-1">
        {t('inbox.enterTip')}
      </p>
    </form>
  );
};

export default ReplyInput;
