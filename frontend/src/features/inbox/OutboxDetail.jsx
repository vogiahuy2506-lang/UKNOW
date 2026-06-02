import { HiArrowLeft, HiCheck, HiMail, HiUser, HiClipboardCopy } from 'react-icons/hi';
import { useI18n } from '../../i18n';
import { formatDate } from './OutboxList';
import toast from 'react-hot-toast';

const CHANNEL_LABELS = (t) => ({
  web: { label: t('inbox.webChat'), icon: '💬', color: 'bg-blue-500' },
  zalo_oa: { label: t('inbox.zaloOA'), icon: '📱', color: 'bg-red-500' },
  facebook: { label: t('inbox.facebook'), icon: '📘', color: 'bg-blue-600' },
  zalo_personal: { label: t('inbox.zaloPersonal'), icon: '👤', color: 'bg-orange-500' },
});

const OutboxDetail = ({ message, onBack, onReply }) => {
  const { t } = useI18n();

  const handleCopyContent = async () => {
    if (message?.content) {
      try {
        await navigator.clipboard.writeText(message.content);
        toast.success(t('common.copied'));
      } catch (err) {
        toast.error(t('errors.copyFailed'));
      }
    }
  };

  if (!message) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <div className="text-center text-gray-500">
          <div className="text-5xl mb-3">📤</div>
          <p>{t('outbox.selectMessage')}</p>
        </div>
      </div>
    );
  }

  const channel = CHANNEL_LABELS(t)[message.channel] || CHANNEL_LABELS(t).web;

  return (
    <div className="flex-1 flex flex-col bg-white">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 flex items-center gap-3">
        <button
          onClick={onBack}
          className="md:hidden p-2 -ml-2 text-gray-500 hover:text-gray-700"
        >
          <HiArrowLeft className="w-5 h-5" />
        </button>

        {/* Avatar */}
        <div className={`w-10 h-10 rounded-full ${channel.color} flex items-center justify-center text-white font-medium`}>
          {message.visitorName?.[0]?.toUpperCase() || '?'}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold text-gray-900 truncate">
            {message.visitorName}
          </h2>
          <div className="flex items-center gap-2">
            <span className={`text-xs px-1.5 py-0.5 rounded ${channel.color} text-white`}>
              {channel.icon} {channel.label}
            </span>
            {message.isRead ? (
              <span className="text-xs text-green-600 flex items-center gap-0.5">
                <HiCheck className="w-3.5 h-3.5" />
                {t('outbox.read')}
              </span>
            ) : (
              <span className="text-xs text-gray-400">
                {t('outbox.delivered')}
              </span>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopyContent}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            title={t('common.copy')}
          >
            <HiClipboardCopy className="w-5 h-5" />
          </button>
          <button
            onClick={() => onReply && onReply(message)}
            className="px-3 py-1.5 bg-primary-500 text-white text-sm rounded-lg hover:bg-primary-600 transition-colors flex items-center gap-1"
          >
            <HiMail className="w-4 h-4" />
            {t('outbox.reply')}
          </button>
        </div>
      </div>

      {/* Message content */}
      <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
        <div className="max-w-2xl mx-auto space-y-4">
          {/* Sent message bubble */}
          <div className="flex justify-end">
            <div className="max-w-[80%]">
              {/* Sender label */}
              <div className="text-xs text-gray-500 mb-1 text-right">
                {t('outbox.you')}
              </div>

              {/* Message bubble */}
              <div className="bg-primary-500 text-white px-4 py-3 rounded-2xl rounded-tr-none">
                <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">
                  {message.content}
                </p>
              </div>

              {/* Time and status */}
              <div className="flex items-center justify-end gap-1 mt-1">
                <span className="text-[10px] text-gray-400">
                  {formatDate(message.sentAt)}
                </span>
                <HiCheck className={`w-3.5 h-3.5 ${message.isRead ? 'text-primary-500' : 'text-gray-400'}`} />
              </div>
            </div>
          </div>

          {/* Last reply from customer */}
          {message.lastReply && (
            <div className="flex justify-start">
              <div className="max-w-[80%]">
                <div className="text-xs text-gray-500 mb-1">
                  <HiUser className="w-3 h-3 inline mr-1" />
                  {message.visitorName}
                </div>

                <div className="bg-white border border-gray-200 text-gray-800 px-4 py-3 rounded-2xl rounded-tl-none shadow-sm">
                  <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">
                    {message.lastReply}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Message details */}
      <div className="px-4 py-3 bg-white border-t border-gray-200">
        <div className="flex flex-wrap gap-4 text-xs text-gray-500">
          <div className="flex items-center gap-1">
            <span className="font-medium">{t('outbox.sentAt')}:</span>
            <span>{formatDate(message.sentAt)}</span>
          </div>
          {message.readAt && (
            <div className="flex items-center gap-1">
              <span className="font-medium">{t('outbox.readAt')}:</span>
              <span>{formatDate(message.readAt)}</span>
            </div>
          )}
          {message.attachments?.length > 0 && (
            <div className="flex items-center gap-1">
              <span className="font-medium">{t('outbox.attachments')}:</span>
              <span>{message.attachments.length} {t('outbox.files')}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default OutboxDetail;
