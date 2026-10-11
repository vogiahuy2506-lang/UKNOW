import { useState } from 'react';
import { HiOutlineEye } from 'react-icons/hi';
import { useI18n } from '../../../i18n';
import {
  decodeHtmlEntities,
  formatDateTime,
  formatMoney,
} from '../utils/customerDisplay.helpers';
import {
  buildUniqueClickedLinks,
  getFileIcon,
  sanitizeEmailHtml,
  wrapEmailPreviewHtml,
} from '../utils/campaignCustomerModal.helpers';
import {
  AttachmentEventDetail,
  ClickEventDetail,
} from './CustomerJourneyEventDetails';

export const EmailStateBadge = ({ journey, orderEvents = [], t }) => {
  if (!journey?.sent) return null;
  const inferredOpen = !journey.opened && (journey.clicked || journey.attachmentDownloaded);
  const isOpened = journey.opened || inferredOpen;
  const hasPending = orderEvents.some((e) => String(e.eventType || '').toLowerCase() === 'order_pending');
  const hasCompleted = orderEvents.some((e) => String(e.eventType || '').toLowerCase() === 'order_completed');
  return (
    <div className="flex items-center gap-1 flex-wrap justify-end">
      <span className="badge badge-info">{t('campaignCustomerModals.sent')}</span>
      {isOpened && (
        <span className="badge" style={{ background: '#fffde7', color: '#f57f17' }}>{t('campaignCustomerModals.opened')}</span>
      )}
      {journey.clicked && (
        <span className="badge" style={{ background: '#fff3e0', color: '#e65100' }}>{t('campaignCustomerModals.clicked')}</span>
      )}
      {journey.attachmentDownloaded && (
        <span className="badge" style={{ background: '#f3e8ff', color: '#7c3aed' }}>{t('campaignCustomerModals.downloaded')}</span>
      )}
      {hasPending && !hasCompleted && (
        <span className="badge" style={{ background: '#fff8e1', color: '#b45309' }}>{t('campaignCustomerModals.pendingOrder')}</span>
      )}
      {hasCompleted && (
        <span className="badge" style={{ background: '#f0fdf4', color: '#15803d' }}>{t('campaignCustomerModals.ordered')}</span>
      )}
    </div>
  );
};

export const Journey4States = ({ journey, emailSubject, orderEvents = [], t }) => {
  const inferredOpen = !journey.opened && (journey.clicked || journey.attachmentDownloaded);
  const isOpened = journey.opened || inferredOpen;
  const openedAt = journey.openedAt
    || (inferredOpen ? (journey.clickedAt || journey.attachmentDownloadedAt) : null);

  const events = [];

  if (journey.sent) {
    events.push({
      key: 'sent',
      color: 'bg-blue-400',
      sentSubject: emailSubject || null,
      at: journey.sentAt,
    });
  }
  if (isOpened) {
    events.push({ key: 'opened', color: 'bg-yellow-400', label: t('campaignCustomerModals.opened'), at: openedAt });
  }
  const clickedLinks = Array.isArray(journey.clickedLinks) && journey.clickedLinks.length > 0
    ? journey.clickedLinks
    : (
      journey.clicked
        ? [{
          linkKey: 'legacy-clicked-link',
          label: journey.clickedLabel || null,
          targetUrl: journey.clickedUrl || null,
          clickedAt: journey.clickedAt || null,
        }]
        : []
    );
  clickedLinks.forEach((clickedLink, index) => {
    events.push({
      key: `clicked_${clickedLink.linkKey || index}`,
      type: 'clicked',
      color: 'bg-orange-400',
      clickedLabel: clickedLink?.label || null,
      clickedUrl: clickedLink?.targetUrl || null,
      at: clickedLink?.clickedAt || journey.clickedAt || null,
    });
  });
  if (journey.attachmentDownloaded) {
    events.push({
      key: 'attachment',
      color: 'bg-purple-500',
      attachmentName: journey.attachmentName,
      attachmentOriginalName: journey.attachmentOriginalName || null,
      attachmentFileId: journey.attachmentFileId || null,
      attachmentDirectUrl: journey.attachmentDirectUrl || null,
      at: journey.attachmentDownloadedAt,
    });
  }

  orderEvents.forEach((orderEvent, idx) => {
    const eventType = String(orderEvent.eventType || '').toLowerCase();
    const eventData = orderEvent.eventData || {};
    const products = eventData.products || [];

    if (eventType === 'order_pending') {
      events.push({
        key: `order_pending_${orderEvent.id || idx}`,
        type: 'order_pending',
        color: 'bg-amber-500',
        label: t('campaignCustomerModals.pendingOrder'),
        orderId: eventData.order_id,
        orderNumber: eventData.order_number,
        total: eventData.total,
        currency: eventData.currency,
        products,
        at: orderEvent.eventAt,
      });
    } else if (eventType === 'order_completed') {
      events.push({
        key: `order_completed_${orderEvent.id || idx}`,
        type: 'order_completed',
        color: 'bg-green-500',
        label: t('campaignCustomerModals.orderCompleted'),
        orderId: eventData.order_id,
        orderNumber: eventData.order_number,
        total: eventData.total,
        currency: eventData.currency,
        products,
        at: orderEvent.eventAt,
      });
    }
  });

  const allEvents = [...events];
  allEvents.sort((a, b) => {
    if (!a.at && !b.at) return 0;
    if (!a.at) return 1;
    if (!b.at) return -1;
    return new Date(a.at) - new Date(b.at);
  });

  if (!allEvents.length) {
    return <p className="text-sm text-gray-400">{t('campaignCustomerModals.noActivities')}</p>;
  }

  return (
    <div className="relative">
      <div className="absolute left-[6px] top-1 bottom-1 w-px bg-gray-100" />
      <div className="space-y-4 pl-6">
        {allEvents.map((s) => (
          <div key={s.key} className="relative">
            <div className={`absolute -left-6 w-[14px] h-[14px] rounded-full border-2 border-white shadow-sm mt-0.5 ${s.color}`} />
            {s.key === 'sent'
              ? (
                <>
                  <p className="text-sm font-medium text-gray-800 leading-snug">
                    {t('campaignCustomerModals.sent')}:{s.sentSubject && <> <span className="text-blue-600">{s.sentSubject}</span></>}
                  </p>
                  {s.at && <p className="text-xs text-gray-400 mt-0.5">{formatDateTime(s.at)}</p>}
                </>
              )
              : s.type === 'clicked'
                ? <ClickEventDetail label={s.clickedLabel} url={s.clickedUrl} at={s.at} formatDateTime={formatDateTime} />
                : s.key === 'attachment'
                  ? <AttachmentEventDetail name={s.attachmentName} originalName={s.attachmentOriginalName} at={s.at} fileId={s.attachmentFileId} directUrl={s.attachmentDirectUrl} formatDateTime={formatDateTime} />
                  : s.type === 'order_pending' || s.type === 'order_completed'
                    ? (
                      <>
                        <p className="text-sm font-medium text-gray-800 leading-snug">
                          {s.label}{s.orderNumber && <> <span className="text-gray-500">#{s.orderNumber}</span></>}
                        </p>
                        {s.products && s.products.length > 0 && (
                          <div className="mt-2 space-y-1">
                            {s.products.map((product, i) => (
                              <div key={i} className="text-xs text-gray-600 bg-gray-50 rounded px-2 py-1.5">
                                <div className="font-medium">{product.product_name}</div>
                                <div className="flex items-center gap-2 mt-0.5 text-gray-500">
                                  <span>{t('campaignCustomerModals.productCode')}: {product.product_id}</span>
                                  <span>•</span>
                                  <span>{t('campaignCustomerModals.quantity')}: {product.quantity}</span>
                                  <span>•</span>
                                  <span>{formatMoney(product.total, s.currency)}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        {s.at && <p className="text-xs text-gray-400 mt-1.5">{formatDateTime(s.at)}</p>}
                      </>
                    )
                    : (
                      <>
                        <p className="text-sm font-medium text-gray-800 leading-snug">{s.label}</p>
                        {s.at && <p className="text-xs text-gray-400 mt-0.5">{formatDateTime(s.at)}</p>}
                      </>
                    )
            }
          </div>
        ))}
      </div>
    </div>
  );
};

export const EmailContentViewer = ({ email }) => {
  const { t } = useI18n();
  const senderDisplay = email.senderName
    ? `${email.senderName} <${email.senderEmail || ''}>`
    : (email.senderEmail || t('campaignCustomerModals.systemCampaign'));
  const recipientDisplay = email.recipientName
    ? `${email.recipientName} <${email.recipientEmail || ''}>`
    : (email.recipientEmail || '--');

  const rawHtml = email.bodyHtml
    || (email.bodyText ? `<pre style="white-space:pre-wrap;font-family:sans-serif;padding:1rem">${email.bodyText}</pre>` : '');
  const safeHtml = wrapEmailPreviewHtml(sanitizeEmailHtml(rawHtml));

  const attachments = [];
  if (email.emailJourney?.attachmentName) {
    attachments.push({
      name: email.emailJourney.attachmentName,
      fileId: email.emailJourney.attachmentFileId || null,
    });
  }

  return (
    <div className="mt-3 rounded-xl border border-gray-200 overflow-hidden bg-white">
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 space-y-1.5">
        <div className="flex items-start gap-2">
          <span className="text-xs text-gray-400 w-20 shrink-0 mt-0.5">{t('campaignCustomerModals.subject')}</span>
          <p className="text-sm font-semibold text-gray-900 leading-snug">
            {decodeHtmlEntities(email.subject || email.emailTemplateName || '--')}
          </p>
        </div>
        <div className="flex items-start gap-2">
          <span className="text-xs text-gray-400 w-20 shrink-0 mt-0.5">{t('campaignCustomerModals.sender')}</span>
          <p className="text-xs text-gray-600">{senderDisplay}</p>
        </div>
        <div className="flex items-start gap-2">
          <span className="text-xs text-gray-400 w-20 shrink-0 mt-0.5">{t('campaignCustomerModals.recipient')}</span>
          <p className="text-xs text-gray-600">{recipientDisplay}</p>
        </div>
      </div>

      <div style={{ height: '50vh', overflow: 'hidden' }}>
        {rawHtml ? (
          <iframe
            srcDoc={safeHtml}
            title={t('campaignCustomerModals.emailContent')}
            className="w-full h-full border-0"
            sandbox="allow-same-origin"
          />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">
            {t('campaignCustomerModals.noHtmlContent')}
          </div>
        )}
      </div>

      {attachments.length > 0 && (
        <div className="px-4 py-3 border-t border-gray-100">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
            {t('campaignCustomerModals.attachments')} ({attachments.length})
          </p>
          <div className="space-y-1.5">
            {attachments.map((att, i) => (
              <div key={i} className="flex items-center gap-2.5 py-1.5 px-3 rounded-lg bg-gray-50 border border-gray-100">
                <span className="text-base" role="img" aria-label="file">{getFileIcon(att.name)}</span>
                <span className="text-sm text-gray-700 truncate flex-1">{att.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export const EmailAccordionItem = ({ email, isExpanded, onToggle, orderEvents = [], t }) => {
  const [showContent, setShowContent] = useState(false);

  const headerLabel = decodeHtmlEntities(
    email.subject || email.emailTemplateName || `${t('campaignCustomerModals.email')} ${email.emailIndex ?? ''}`
  );
  const sentEventSubject = decodeHtmlEntities(
    email.subject || email.emailTemplateName || `${t('campaignCustomerModals.email')} ${email.emailIndex ?? ''}`
  );

  const journey = email.emailJourney || {
    sent: !!email.sentAt,
    sentAt: email.sentAt,
    opened: !!email.firstOpenedAt,
    openedAt: email.firstOpenedAt,
    clicked: !!email.firstClickedAt,
    clickedAt: email.firstClickedAt,
    clickedLabel: null,
    clickedUrl: null,
    clickedLinks: [],
    attachmentDownloaded: false,
    attachmentDownloadedAt: null,
    attachmentName: null,
    attachmentFileId: null,
  };
  const hasContent = !!(email.bodyHtml || email.bodyText);

  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
      >
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-gray-900 text-sm leading-snug truncate">{headerLabel}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {formatDateTime(email.sentAt)}
            {' · ID: '}{email.emailMessageId}
            {email.runId != null ? ` · Run #${email.runId}` : ''}
            {email.emailTemplateName ? ` · ${decodeHtmlEntities(email.emailTemplateName)}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <EmailStateBadge journey={journey} orderEvents={orderEvents} t={t} />
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {isExpanded && (
        <div className="px-5 py-4 border-t border-gray-100 space-y-4">
          <Journey4States
            journey={journey}
            emailSubject={sentEventSubject}
            orderEvents={orderEvents}
            t={t}
          />
          {hasContent && (
            <div className="pt-1">
              <button
                type="button"
                onClick={() => setShowContent((v) => !v)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-600 bg-white hover:bg-gray-50 hover:border-gray-300 transition-colors"
              >
                <HiOutlineEye className="w-3.5 h-3.5" />
                {showContent ? t('campaignCustomerModals.hideEmailContent') : t('campaignCustomerModals.viewEmailContent')}
              </button>
              {showContent && <EmailContentViewer email={email} t={t} />}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const ZaloJourneyItem = ({ message, orderEvents = [], clickedEvents = [], t }) => {
  const [showMessageContent, setShowMessageContent] = useState(false);
  const clickedLinks = Array.isArray(message?.clickedLinks) && message.clickedLinks.length > 0
    ? message.clickedLinks
    : buildUniqueClickedLinks(clickedEvents);
  const hasClicked = Number(message?.clickCount || 0) > 0 || clickedLinks.length > 0;
  const hasPending = orderEvents.some((event) => String(event?.eventType || '').toLowerCase() === 'order_pending');
  const hasCompleted = orderEvents.some((event) => String(event?.eventType || '').toLowerCase() === 'order_completed');
  const attachments = Array.isArray(message?.attachments) ? message.attachments : [];
  const runLabel = message?.runDisplayName
    || ((message?.runId != null || message?.runName)
      ? (message?.runName
        ? `${t('campaignCustomerModals.run')} #${message?.runId || '--'} · ${message.runName}`
        : `${t('campaignCustomerModals.run')} #${message?.runId || '--'}`)
      : null);
  const zaloTitle = message?.channel === 'zalo_group'
    ? `${message?.groupName || message?.groupId || '--'}`
    : (message?.recipientValue || t('campaignCustomerModals.zaloMessage'));
  const journeyStates = [];

  if (message?.sentAt) {
    journeyStates.push({
      key: `zalo_sent_${message.id}`,
      label: t('campaignCustomerModals.sentZaloMessage'),
      at: message.sentAt,
      color: 'bg-blue-400',
    });
  }
  if (hasClicked) {
    clickedLinks.forEach((clickedLink, index) => {
      journeyStates.push({
        key: `zalo_clicked_${message.id}_${clickedLink?.linkKey || index}`,
        label: clickedLink?.targetUrl ? t('campaignCustomerModals.clickedLinkInMessage') : t('campaignCustomerModals.clickedLink'),
        at: clickedLink?.clickedAt || message?.lastClickedAt || message?.firstClickedAt || null,
        color: 'bg-orange-400',
        clickedUrl: clickedLink?.targetUrl || null,
      });
    });
  }
  orderEvents.forEach((event, index) => {
    const eventType = String(event?.eventType || '').toLowerCase();
    if (eventType === 'order_pending') {
      journeyStates.push({
        key: `zalo_order_pending_${event.id || index}`,
        label: t('campaignCustomerModals.pendingOrder'),
        at: event?.eventAt || null,
        color: 'bg-amber-500',
      });
      return;
    }
    if (eventType === 'order_completed') {
      journeyStates.push({
        key: `zalo_order_completed_${event.id || index}`,
        label: t('campaignCustomerModals.orderCompleted'),
        at: event?.eventAt || null,
        color: 'bg-green-500',
      });
    }
  });
  journeyStates.sort((a, b) => new Date(a?.at || 0) - new Date(b?.at || 0));

  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden">
      <div className="w-full px-5 py-4 bg-gray-50 text-left">
        <p className="font-semibold text-gray-900 text-sm leading-snug truncate">
          {zaloTitle}
        </p>
        <p className="text-xs text-gray-400 mt-0.5">
          {formatDateTime(message?.sentAt)}
          {message?.id != null ? ` · ID: ${message.id}` : ''}
          {runLabel ? ` · ${runLabel}` : ''}
        </p>
        {message?.channel === 'zalo_group' && message?.groupId && message?.groupName && (
          <p className="text-xs text-gray-400 mt-0.5">{t('campaignCustomerModals.groupId')}: {message.groupId}</p>
        )}
        <div className="mt-2 flex items-center gap-1 flex-wrap">
          <span className="badge badge-info">{t('campaignCustomerModals.sent')}</span>
          {hasClicked && (
            <span className="badge" style={{ background: '#fff3e0', color: '#e65100' }}>{t('campaignCustomerModals.clicked')}</span>
          )}
          {hasPending && !hasCompleted && (
            <span className="badge" style={{ background: '#fff8e1', color: '#b45309' }}>{t('campaignCustomerModals.pendingOrder')}</span>
          )}
          {hasCompleted && (
            <span className="badge" style={{ background: '#f0fdf4', color: '#15803d' }}>{t('campaignCustomerModals.orderCompleted')}</span>
          )}
        </div>
      </div>
      <div className="px-5 py-4 border-t border-gray-100 space-y-2">
        {journeyStates.length > 0 && (
          <div className="relative pb-1">
            <div className="absolute left-[6px] top-1 bottom-1 w-px bg-gray-100" />
            <div className="space-y-3 pl-6">
              {journeyStates.map((state) => (
                <div key={state.key} className="relative">
                  <div className={`absolute -left-6 w-[14px] h-[14px] rounded-full border-2 border-white shadow-sm mt-0.5 ${state.color}`} />
                  <p className="text-sm font-medium text-gray-800 leading-snug">{state.label}</p>
                  {state.clickedUrl && (
                    <p className="text-xs text-gray-500 break-all mt-0.5">{state.clickedUrl}</p>
                  )}
                  {state.at && (
                    <p className="text-xs text-gray-400 mt-0.5">{formatDateTime(state.at)}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={() => setShowMessageContent((prev) => !prev)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-600 bg-white hover:bg-gray-50 hover:border-gray-300 transition-colors"
        >
          <HiOutlineEye className="w-3.5 h-3.5" />
          {showMessageContent ? t('campaignCustomerModals.hideZaloContent') : t('campaignCustomerModals.viewZaloContent')}
        </button>
        {showMessageContent && (
          <div className="space-y-2">
            <p className="text-sm text-gray-700 whitespace-pre-wrap rounded-lg bg-white border border-gray-200 p-3">
              {message?.messageText || t('campaignCustomerModals.noZaloContent')}
            </p>
            {attachments.length > 0 && (
              <div className="rounded-lg bg-white border border-gray-200 p-3">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                  {t('campaignCustomerModals.attachments')} ({attachments.length})
                </p>
                <div className="space-y-1.5">
                  {attachments.map((file, index) => (
                    <p key={`${file?.displayName || 'file'}-${index}`} className="text-sm text-gray-700">
                      - {file?.displayName || t('campaignCustomerModals.attachment')}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
