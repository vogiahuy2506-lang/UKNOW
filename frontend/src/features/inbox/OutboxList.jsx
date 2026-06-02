import { HiCheck } from 'react-icons/hi';
import { useI18n } from '../../i18n';

const CHANNEL_LABELS = (t) => ({
  web: { label: t('inbox.webChat'), icon: '💬', color: 'bg-blue-500' },
  zalo_oa: { label: t('inbox.zaloOA'), icon: '📱', color: 'bg-red-500' },
  facebook: { label: t('inbox.facebook'), icon: '📘', color: 'bg-blue-600' },
  zalo_personal: { label: t('inbox.zaloPersonal'), icon: '👤', color: 'bg-orange-500' },
});

const formatTime = (dateString, t) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return t('time.justNow');
  if (diffMins < 60) return `${diffMins} ${t('time.minutesAgo', { n: diffMins })}`;
  if (diffHours < 24) return `${diffHours} ${t('time.hoursAgo', { n: diffHours })}`;
  if (diffDays < 7) return `${diffDays} ${t('time.daysAgo', { n: diffDays })}`;
  return date.toLocaleDateString('vi-VN');
};

const formatDate = (dateString) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const truncateMessage = (message, maxLength = 60) => {
  if (!message) return '';
  if (message.length <= maxLength) return message;
  return message.slice(0, maxLength) + '...';
};

const OutboxList = ({ messages, isLoading, selectedId, onSelect, onLoadMore, hasMore }) => {
  const { t } = useI18n();

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900">{t('outbox.outbox')}</h2>
      </div>

      {/* Loading skeleton */}
      {isLoading && messages.length === 0 && (
        <div className="flex-1 overflow-y-auto p-2 space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="p-3 rounded-lg animate-pulse">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-gray-200"></div>
                <div className="flex-1">
                  <div className="h-4 bg-gray-200 rounded w-24 mb-2"></div>
                  <div className="h-3 bg-gray-200 rounded w-full mb-1"></div>
                  <div className="h-3 bg-gray-200 rounded w-3/4"></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && messages.length === 0 && (
        <div className="flex-1 flex items-center justify-center text-gray-500">
          <div className="text-center p-4">
            <div className="text-4xl mb-2">📤</div>
            <p>{t('outbox.noMessages')}</p>
          </div>
        </div>
      )}

      {/* Message list */}
      {messages.length > 0 && (
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {messages.map((msg) => {
            const channel = CHANNEL_LABELS(t)[msg.channel] || CHANNEL_LABELS(t).web;
            const isSelected = selectedId === msg.id;

            return (
              <button
                key={msg.id}
                onClick={() => onSelect(msg)}
                className={`w-full p-3 rounded-lg text-left transition-all duration-200 ${
                  isSelected
                    ? 'bg-primary-50 border border-primary-200'
                    : 'hover:bg-gray-50 border border-transparent'
                }`}
              >
                <div className="flex items-start gap-3">
                  {/* Avatar with channel icon */}
                  <div className={`w-10 h-10 rounded-full ${channel.color} flex items-center justify-center text-white text-sm font-medium flex-shrink-0`}>
                    {msg.visitorName?.[0]?.toUpperCase() || '?'}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-gray-900 truncate">
                        {msg.visitorName}
                      </span>
                      <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                        {msg.isRead ? (
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

                    {/* Channel and time */}
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${channel.color} text-white`}>
                        {channel.icon} {channel.label}
                      </span>
                      <span className="text-xs text-gray-500">
                        {formatTime(msg.sentAt, t)}
                      </span>
                    </div>

                    {/* Message preview */}
                    <p className="text-sm text-gray-600 mt-1 truncate">
                      {truncateMessage(msg.content)}
                    </p>

                    {/* Last reply indicator */}
                    {msg.lastReply && (
                      <p className="text-xs text-gray-400 mt-1 italic truncate">
                        ↩ {truncateMessage(msg.lastReply, 40)}
                      </p>
                    )}
                  </div>
                </div>
              </button>
            );
          })}

          {/* Load more button */}
          {hasMore && (
            <button
              onClick={onLoadMore}
              disabled={isLoading}
              className="w-full p-2 text-sm text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
            >
              {isLoading ? t('common.loading') : t('outbox.loadMore')}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export { formatDate };
export default OutboxList;
