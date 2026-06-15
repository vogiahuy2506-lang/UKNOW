import { useI18n } from '../../i18n';

const TypingIndicator = ({ isTyping, senderName }) => {
  const { t } = useI18n();

  if (!isTyping) return null;

  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 border-t border-gray-200">
      <div className="flex gap-1">
        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>
      <span className="text-xs text-gray-500">
        {senderName ? `${senderName} ${t('inbox.isTyping')}` : t('inbox.customerTyping')}
      </span>
    </div>
  );
};

export default TypingIndicator;
