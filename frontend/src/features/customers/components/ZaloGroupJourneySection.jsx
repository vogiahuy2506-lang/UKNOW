import { useState } from 'react';
import { HiOutlineEye } from 'react-icons/hi';
import { useI18n } from '../../../i18n';

const buildUniqueClickedLinks = (clickedEvents = []) => {
  const groupedByLink = new Map();
  (Array.isArray(clickedEvents) ? clickedEvents : []).forEach((event, index) => {
    const eventData = event?.eventData && typeof event.eventData === 'object' ? event.eventData : {};
    const targetUrl = String(eventData?.targetUrl || '').trim() || null;
    const rawLinkKey = String(eventData?.linkKey || '').trim();
    const fallbackKey = targetUrl || `event-${event?.id || index}`;
    const linkKey = rawLinkKey || fallbackKey;
    if (!groupedByLink.has(linkKey)) {
      groupedByLink.set(linkKey, {
        linkKey,
        targetUrl,
        clickedAt: event?.eventAt || null,
        clickCount: 0,
      });
    }
    const item = groupedByLink.get(linkKey);
    item.clickCount += 1;
    const itemTime = item.clickedAt ? new Date(item.clickedAt).getTime() : Number.POSITIVE_INFINITY;
    const nextTime = event?.eventAt ? new Date(event.eventAt).getTime() : Number.POSITIVE_INFINITY;
    if (nextTime < itemTime) item.clickedAt = event?.eventAt || item.clickedAt;
    if (!item.targetUrl && targetUrl) item.targetUrl = targetUrl;
  });

  return Array.from(groupedByLink.values()).sort((a, b) => {
    const timeA = a.clickedAt ? new Date(a.clickedAt).getTime() : Number.POSITIVE_INFINITY;
    const timeB = b.clickedAt ? new Date(b.clickedAt).getTime() : Number.POSITIVE_INFINITY;
    return timeA - timeB;
  });
};

const ZaloGroupJourneyCard = ({
  message,
  clickedEvents = [],
  orderEvents = [],
  formatDateTime,
  t,
}) => {
  const [showMessageContent, setShowMessageContent] = useState(false);
  const clickedLinks = Array.isArray(message?.clickedLinks) && message.clickedLinks.length > 0
    ? message.clickedLinks
    : buildUniqueClickedLinks(clickedEvents);
  const hasClicked = Number(message?.clickCount || 0) > 0 || clickedLinks.length > 0;
  const hasPending = orderEvents.some((event) => String(event?.eventType || '').toLowerCase() === 'order_pending');
  const hasCompleted = orderEvents.some((event) => String(event?.eventType || '').toLowerCase() === 'order_completed');

  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden">
      <div className="w-full px-5 py-4 bg-gray-50 text-left">
        <p className="font-semibold text-gray-900 text-sm leading-snug truncate">
          {t('zaloGroupJourney.sent')} #{message?.groupId || '--'}
        </p>
        <p className="text-xs text-gray-400 mt-0.5">
          {formatDateTime(message?.sentAt)}
          {message?.id != null ? ` · ID: ${message.id}` : ''}
          {message?.accountName ? ` · TK: ${message.accountName}` : ''}
        </p>
        <div className="mt-2 flex items-center gap-1 flex-wrap">
          <span className="badge badge-info">{t('zaloGroupJourney.sent')}</span>
          {hasClicked && (
            <span className="badge" style={{ background: '#fff3e0', color: '#e65100' }}>
              {t('zaloGroupJourney.clickedLink')}
            </span>
          )}
          {hasPending && !hasCompleted && (
            <span className="badge" style={{ background: '#fff8e1', color: '#b45309' }}>
              {t('zaloGroupJourney.pendingOrder')}
            </span>
          )}
          {hasCompleted && (
            <span className="badge" style={{ background: '#f0fdf4', color: '#15803d' }}>
              {t('zaloGroupJourney.completedOrder')}
            </span>
          )}
        </div>
      </div>

      <div className="px-5 py-4 border-t border-gray-100 space-y-2">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1.5 text-sm text-gray-700">
          <div>
            <span className="text-xs text-gray-400">{t('zaloGroupJourney.clickCount')}</span>
            <p>{Number(message?.clickCount || 0)}</p>
          </div>
          <div>
            <span className="text-xs text-gray-400">{t('zaloGroupJourney.clickEvents')}</span>
            <p>{clickedEvents.length}</p>
          </div>
          <div className="md:col-span-2">
            <span className="text-xs text-gray-400">{t('zaloGroupJourney.clickedLinks')} ({clickedLinks.length})</span>
            {clickedLinks.length > 0 ? (
              <div className="space-y-1 mt-1">
                {clickedLinks.map((clickedLink) => (
                  <p key={clickedLink.linkKey} className="text-xs text-gray-500 break-all">
                    - {clickedLink.targetUrl || t('zaloGroupJourney.clickedLinkItem')}
                  </p>
                ))}
              </div>
            ) : (
              <p className="text-gray-400">{t('zaloGroupJourney.noLinks')}</p>
            )}
          </div>
          <div>
            <span className="text-xs text-gray-400">{t('zaloGroupJourney.orderEvents')}</span>
            <p>{orderEvents.length}</p>
          </div>
          <div>
            <span className="text-xs text-gray-400">{t('zaloGroupJourney.channel')}</span>
            <p>{message?.channel || 'zalo_group'}</p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowMessageContent((prev) => !prev)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-600 bg-white hover:bg-gray-50 hover:border-gray-300 transition-colors"
        >
          <HiOutlineEye className="w-3.5 h-3.5" />
          {showMessageContent ? t('zaloGroupJourney.hideMessageContent') : t('zaloGroupJourney.showMessageContent')}
        </button>
        {showMessageContent && (
          <p className="text-sm text-gray-700 whitespace-pre-wrap rounded-lg bg-white border border-gray-200 p-3">
            {message?.messageText || t('zaloGroupJourney.noMessageContent')}
          </p>
        )}
      </div>
    </div>
  );
};

/**
 * Render grouped Zalo group journey cards for one campaign run.
 *
 * @param {object} props
 * @returns {JSX.Element}
 */
const ZaloGroupJourneySection = ({
  messages = [],
  orderEventsByZaloMessageId = {},
  clickEventsByZaloMessageId = {},
  formatDateTime,
}) => {
  const { t } = useI18n();

  if (!Array.isArray(messages) || messages.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-500">
        {t('zaloGroupJourney.noEvents')}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {messages.map((message) => (
        <ZaloGroupJourneyCard
          key={message.id}
          message={message}
          orderEvents={orderEventsByZaloMessageId[message.id] || []}
          clickedEvents={clickEventsByZaloMessageId[message.id] || []}
          formatDateTime={formatDateTime}
          t={t}
        />
      ))}
    </div>
  );
};

export default ZaloGroupJourneySection;
