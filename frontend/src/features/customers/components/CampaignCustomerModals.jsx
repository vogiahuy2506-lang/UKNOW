import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import {
  HiOutlineCalendar,
  HiOutlineChevronDown,
  HiOutlineEye,
  HiOutlineInformationCircle,
  HiOutlineMail,
  HiOutlinePhone,
  HiOutlineUser,
  HiOutlineX,
} from 'react-icons/hi';
import { useI18n } from '../../../i18n';
import customerApiService from '../services/customerApi.service';
import {
  decodeHtmlEntities,
  formatDateOnly,
  formatDateTime,
  formatMoney,
  getCustomerDisplayName,
} from '../utils/customerDisplay.helpers';
import {
  AttachmentEventDetail,
  ClickEventDetail,
} from './CustomerJourneyEventDetails';
import ZaloGroupJourneySection from './ZaloGroupJourneySection';

const getInitial = (customer) => {
  const name = getCustomerDisplayName(customer);
  return name ? name[0].toUpperCase() : '?';
};

const buildRunDisplayName = (runId, runName, t) => {
  const normalizedName = String(runName || '').trim();
  if (normalizedName) return normalizedName;
  if (runId != null && runId !== '') return `${t('campaignCustomerModals.run')} #${runId}`;
  return t('campaignCustomerModals.unknownRun');
};

const hasInterestedStatus = (purchase) => {
  const statuses = purchase.statuses || [];
  return (
    purchase.itemStatus === 'interested' ||
    statuses.some((statusItem) => {
      const lowered = String(statusItem).toLowerCase();
      return lowered.includes('on-hold') || lowered.includes('onhold') || lowered.includes('interest');
    })
  );
};

const hasPurchasedStatus = (purchase) => {
  const statuses = purchase.statuses || [];
  return (
    purchase.itemStatus === 'completed' ||
    statuses.some((statusItem) => {
      const lowered = String(statusItem).toLowerCase();
      return lowered.includes('completed');
    })
  );
};

/**
 * Build unique clicked-link list from journey click events.
 *
 * @param {Array<object>} clickedEvents
 * @returns {Array<{linkKey: string, targetUrl: string|null, label: string|null, clickedAt: string|null, clickCount: number}>}
 */
const buildUniqueClickedLinks = (clickedEvents = []) => {
  const groupedByLink = new Map();
  (Array.isArray(clickedEvents) ? clickedEvents : []).forEach((event, index) => {
    const eventData = event?.eventData && typeof event.eventData === 'object' ? event.eventData : {};
    const targetUrl = String(eventData?.targetUrl || '').trim() || null;
    const label = String(eventData?.label || '').trim() || null;
    const rawLinkKey = String(eventData?.linkKey || '').trim();
    const fallbackKey = targetUrl || `event-${event?.id || index}`;
    const linkKey = rawLinkKey || fallbackKey;
    if (!groupedByLink.has(linkKey)) {
      groupedByLink.set(linkKey, {
        linkKey,
        targetUrl,
        label,
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
    if (!item.label && label) item.label = label;
  });

  return Array.from(groupedByLink.values()).sort((a, b) => {
    const timeA = a.clickedAt ? new Date(a.clickedAt).getTime() : Number.POSITIVE_INFINITY;
    const timeB = b.clickedAt ? new Date(b.clickedAt).getTime() : Number.POSITIVE_INFINITY;
    return timeA - timeB;
  });
};

const CustomerStatusBadge = ({ status, t }) => {
  const statusMap = {
    completed: { label: t('campaignCustomerModals.purchased'), cls: 'badge-success' },
    purchased: { label: t('campaignCustomerModals.purchased'), cls: 'badge-success' },
    processing: { label: t('campaignCustomerModals.purchased'), cls: 'badge-success' },
    'on-hold': { label: t('campaignCustomerModals.leftInfo'), cls: 'badge-warning' },
    onhold: { label: t('campaignCustomerModals.leftInfo'), cls: 'badge-warning' },
    on_hold: { label: t('campaignCustomerModals.leftInfo'), cls: 'badge-warning' },
    lead: { label: t('campaignCustomerModals.leftInfo'), cls: 'badge-warning' },
    email_clicked: { label: t('campaignCustomerModals.clicked'), cls: 'badge-info' },
    email_opened: { label: t('campaignCustomerModals.opened'), cls: 'badge-info' },
    email_sent: { label: t('campaignCustomerModals.sent'), cls: 'badge-gray' },
  };
  if (!status) return null;
  const statusConfig = statusMap[status] || { label: status, cls: 'badge-gray' };
  return <span className={`badge ${statusConfig.cls}`}>{statusConfig.label}</span>;
};

const getFileIcon = (fileName) => {
  const ext = String(fileName || '').split('.').pop().toLowerCase();
  const map = {
    pdf: '📄', doc: '📝', docx: '📝', xls: '📊', xlsx: '📊',
    ppt: '📑', pptx: '📑', zip: '🗜', rar: '🗜', '7z': '🗜',
    jpg: '🖼', jpeg: '🖼', png: '🖼', gif: '🖼', webp: '🖼', svg: '🖼',
    mp4: '🎬', mov: '🎬', avi: '🎬', mp3: '🎵', wav: '🎵', m4a: '🎵',
    txt: '📃', csv: '📊', json: '📋', xml: '📋',
  };
  return map[ext] || '📎';
};

const BaseModal = ({ isOpen, onClose, title, children }) => {
  const { t } = useI18n();
  const closeBtnRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      requestAnimationFrame(() => closeBtnRef.current?.focus());
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="modal-content-animate relative flex flex-col bg-white rounded-xl shadow-2xl overflow-hidden"
        style={{ width: '80vw', maxWidth: '1100px', height: '80vh' }}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0 bg-white">
          <h2 className="text-lg font-semibold text-gray-900 truncate pr-4">{title}</h2>
          <button
            ref={closeBtnRef}
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors shrink-0"
            aria-label={t('common.close')}
          >
            <HiOutlineX className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
};

const CustomerDetailModal = ({ customer, campaignId, isOpen, onClose }) => {
  const { t } = useI18n();
  const [journeyData, setJourneyData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [expandedPurchaseId, setExpandedPurchaseId] = useState(null);
  const [showEmailContentByPurchase, setShowEmailContentByPurchase] = useState({});
  const [showZaloContentByPurchase, setShowZaloContentByPurchase] = useState({});

  useEffect(() => {
    if (!isOpen || !customer?.id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setJourneyData(null);
      setShowEmailContentByPurchase({});
      setShowZaloContentByPurchase({});
      try {
        const res = await customerApiService.getCustomerCampaignJourney(customer.id, campaignId);
        if (!cancelled) setJourneyData(res.data?.data || null);
      } catch {
        if (!cancelled) toast.error(t('campaignCustomerModals.cantLoadCourseData'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isOpen, customer?.id, campaignId, t]);

  const purchases = journeyData?.purchases || [];
  const emailsById = Object.fromEntries(
    (journeyData?.emails || []).map((e) => [String(e.emailMessageId), e])
  );
  const zaloMessagesById = Object.fromEntries(
    (journeyData?.zaloMessages || []).map((z) => [String(z.id), z])
  );
  const orderEventsById = {};
  const clickEventsByZaloMessageId = {};
  for (const event of journeyData?.journey || []) {
    const type = String(event.eventType || '').toLowerCase();
    if (type !== 'order_pending' && type !== 'order_completed') continue;
    const messageId = event.idEmailMessage;
    if (!messageId) continue;
    if (!orderEventsById[messageId]) orderEventsById[messageId] = [];
    orderEventsById[messageId].push(event);
  }
  for (const event of journeyData?.journey || []) {
    const type = String(event.eventType || '').toLowerCase();
    if (type !== 'zalo_clicked' || !event.idZaloMessage) continue;
    if (!clickEventsByZaloMessageId[event.idZaloMessage]) clickEventsByZaloMessageId[event.idZaloMessage] = [];
    clickEventsByZaloMessageId[event.idZaloMessage].push(event);
  }

  const displayName = getCustomerDisplayName(customer);
  const status = customer?.orderStatus || null;

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title={`${t('campaignCustomerModals.customerDetail')} — ${displayName || t('campaignCustomerModals.customer')}`}
    >
      <div className="p-6 space-y-8">
        <section>
          <div className="flex items-start gap-5">
            <div className="w-16 h-16 rounded-full bg-primary-100 flex items-center justify-center shrink-0">
              <span className="text-2xl font-bold text-primary-600">{getInitial(customer)}</span>
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-xl font-bold text-gray-900 mb-3">{displayName || '—'}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex items-center gap-2.5 text-sm text-gray-700">
                  <HiOutlineMail className="w-4 h-4 text-gray-400 shrink-0" />
                  <span className="truncate">{customer?.email || '--'}</span>
                </div>
                <div className="flex items-center gap-2.5 text-sm text-gray-700">
                  <HiOutlinePhone className="w-4 h-4 text-gray-400 shrink-0" />
                  <span>{customer?.phone || '--'}</span>
                </div>
                <div className="flex items-center gap-2.5 text-sm text-gray-700">
                  <HiOutlineCalendar className="w-4 h-4 text-gray-400 shrink-0" />
                  <span>{t('campaignCustomerModals.joined')} {formatDateOnly(customer?.createdAt)}</span>
                </div>
                <div className="flex items-center gap-2.5 text-sm">
                  <HiOutlineUser className="w-4 h-4 text-gray-400 shrink-0" />
                  <CustomerStatusBadge status={status} t={t} />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section>
          <h3 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <HiOutlineInformationCircle className="w-5 h-5 text-primary-500" />
            {t('campaignCustomerModals.coursesFromCampaign')}
          </h3>

          {loading ? (
            <div className="flex items-center justify-center py-10">
              <div className="spinner w-8 h-8" />
            </div>
          ) : purchases.length === 0 ? (
            <div className="py-8 text-center text-gray-400 bg-gray-50 rounded-xl border border-gray-100">
              {t('campaignCustomerModals.noCourseData')}
            </div>
          ) : (
            <div className="space-y-2">
              {purchases.map((p, i) => {
                const key = p.id || i;
                const isExpanded = expandedPurchaseId === key;
                const isShowingEmailContent = Boolean(showEmailContentByPurchase[key]);
                const isShowingZaloContent = Boolean(showZaloContentByPurchase[key]);
                const interested = hasInterestedStatus(p);
                const purchased = hasPurchasedStatus(p);
                const linkedEmail = p.idEmailMessage ? emailsById[String(p.idEmailMessage)] : null;
                const linkedZaloMessage = p.idZaloMessage ? zaloMessagesById[String(p.idZaloMessage)] : null;
                const linkedZaloClickEvents = p.idZaloMessage ? (clickEventsByZaloMessageId[p.idZaloMessage] || []) : [];
                const linkedZaloAttachments = Array.isArray(linkedZaloMessage?.attachments)
                  ? linkedZaloMessage.attachments
                  : [];
                const zaloClickedLinks = buildUniqueClickedLinks(linkedZaloClickEvents);
                const emailSubject = linkedEmail
                  ? decodeHtmlEntities(linkedEmail.subject || linkedEmail.emailTemplateName || '')
                  : null;
                const emailIndex = linkedEmail?.emailIndex ?? null;
                const emailJourney = linkedEmail
                  ? (linkedEmail.emailJourney || {
                    sent: !!linkedEmail.sentAt,
                    sentAt: linkedEmail.sentAt,
                    opened: !!linkedEmail.firstOpenedAt,
                    openedAt: linkedEmail.firstOpenedAt,
                    clicked: !!linkedEmail.firstClickedAt,
                    clickedAt: linkedEmail.firstClickedAt,
                    clickedLabel: linkedEmail.emailJourney?.clickedLabel ?? null,
                    clickedUrl: linkedEmail.emailJourney?.clickedUrl ?? null,
                    clickedLinks: linkedEmail.emailJourney?.clickedLinks ?? [],
                    attachmentDownloaded: linkedEmail.emailJourney?.attachmentDownloaded ?? false,
                    attachmentDownloadedAt: linkedEmail.emailJourney?.attachmentDownloadedAt ?? null,
                    attachmentName: linkedEmail.emailJourney?.attachmentName ?? null,
                    attachmentFileId: linkedEmail.emailJourney?.attachmentFileId ?? null,
                  })
                  : null;
                const linkedOrderEvents = p.idEmailMessage ? (orderEventsById[p.idEmailMessage] || []) : [];

                return (
                  <div key={key} className="rounded-xl border border-gray-200 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setExpandedPurchaseId(isExpanded ? null : key)}
                      className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-gray-900 text-sm leading-snug truncate">
                          {decodeHtmlEntities(p.courseName || p.productName || '--')}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {p.orderId ? `#${p.orderId}` : t('campaignCustomerModals.noOrderCode')}
                          {p.courseCode ? ` · ${t('campaignCustomerModals.productCode')}: ${p.courseCode}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {purchased && <span className="badge badge-success">{t('campaignCustomerModals.purchased')}</span>}
                        {interested && !purchased && <span className="badge badge-warning">{t('campaignCustomerModals.leadShort')}</span>}
                        <HiOutlineChevronDown
                          className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                        />
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="px-4 py-3 border-t border-gray-100 space-y-2 text-sm text-gray-700">
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                          <div>
                            <span className="text-xs text-gray-400">{t('campaignCustomerModals.orderCode')}</span>
                            <p className="font-mono font-medium">{p.orderId ? `#${p.orderId}` : '--'}</p>
                          </div>
                          <div>
                            <span className="text-xs text-gray-400">{t('campaignCustomerModals.productCode')}</span>
                            <p className="font-mono">{p.courseCode || '--'}</p>
                          </div>
                          <div>
                            <span className="text-xs text-gray-400">{t('campaignCustomerModals.leftInfo')}</span>
                            <p>{interested ? <span className="badge badge-warning">{t('common.yes')}</span> : <span className="text-gray-400">{t('common.no')}</span>}</p>
                          </div>
                          <div>
                            <span className="text-xs text-gray-400">{t('campaignCustomerModals.purchased')}</span>
                            <p>{purchased ? <span className="badge badge-success">{t('common.yes')}</span> : <span className="text-gray-400">{t('common.no')}</span>}</p>
                          </div>
                          <div>
                            <span className="text-xs text-gray-400">{t('campaignCustomerModals.lastActivity')}</span>
                            <p>{formatDateTime(p.purchaseDate)}</p>
                          </div>
                          {p.idEmailMessage && (
                            <div>
                              <span className="text-xs text-gray-400">{t('campaignCustomerModals.afterClick')}</span>
                              <p>
                                {(p.attributedFromClick || linkedOrderEvents.length > 0)
                                  ? <span className="badge badge-info">{t('common.yes')}</span>
                                  : <span className="text-gray-400">{t('common.unknown')}</span>}
                              </p>
                            </div>
                          )}
                        </div>

                        {(p.idEmailMessage || p.idZaloMessage) && (
                          <div className="mt-1 pt-2 border-t border-gray-100 space-y-2">
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                              {p.idEmailMessage && (
                                <div>
                                  <span className="text-xs text-gray-400">{t('campaignCustomerModals.emailId')}</span>
                                  <p>
                                    <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-mono text-blue-700 border border-blue-100">
                                      #{p.idEmailMessage}
                                    </span>
                                  </p>
                                </div>
                              )}
                              {p.idZaloMessage && (
                                <div>
                                  <span className="text-xs text-gray-400">{t('campaignCustomerModals.zaloMessageId')}</span>
                                  <p className="flex flex-wrap items-center gap-1.5">
                                    <span className="inline-flex items-center rounded-full bg-orange-50 px-2 py-0.5 text-xs font-mono text-orange-700 border border-orange-100">
                                      #{p.idZaloMessage}
                                    </span>
                                    {(linkedZaloMessage?.runId != null || linkedZaloMessage?.runName || linkedZaloMessage?.runDisplayName) && (
                                      <span className="inline-flex items-center rounded-full bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-700 border border-primary-100">
                                        {linkedZaloMessage.runDisplayName || (
                                          linkedZaloMessage.runName
                                            ? `Run #${linkedZaloMessage.runId || '--'} · ${linkedZaloMessage.runName}`
                                            : `Run #${linkedZaloMessage.runId || '--'}`
                                        )}
                                      </span>
                                    )}
                                  </p>
                                </div>
                              )}
                              {emailIndex != null && (
                                <div>
                                  <span className="text-xs text-gray-400">{t('campaignCustomerModals.emailOrder')}</span>
                                  <p className="font-medium text-gray-800">{t('customerDetail.emailIndex', { index: emailIndex })}</p>
                                </div>
                              )}
                              {(linkedEmail?.runId != null || linkedEmail?.runName) && (
                                <div className="col-span-2">
                                  <span className="text-xs text-gray-400">{t('campaignCustomerModals.campaignRun')}</span>
                                  <p className="font-medium text-gray-800">
                                    #{linkedEmail?.runId || '--'} · {buildRunDisplayName(linkedEmail?.runId, linkedEmail?.runName, t)}
                                  </p>
                                </div>
                              )}
                            </div>
                            {emailSubject && (
                              <div>
                                <span className="text-xs text-gray-400">{t('campaignCustomerModals.emailSubject')}</span>
                                <p className="font-medium text-gray-800 leading-snug">{emailSubject}</p>
                              </div>
                            )}
                              {linkedZaloMessage && (
                                <div className="space-y-1">
                                  <span className="text-xs text-gray-400">{t('campaignCustomerModals.zaloMessageLinked')}</span>
                                  <p className="text-sm text-gray-700">
                                    {linkedZaloMessage.channel === 'zalo_group'
                                      ? `${linkedZaloMessage.groupName || linkedZaloMessage.groupId || '--'}`
                                      : (linkedZaloMessage.recipientValue || t('campaignCustomerModals.zaloPersonal'))}
                                  </p>
                                  {linkedZaloMessage.channel === 'zalo_group' && linkedZaloMessage.groupId && linkedZaloMessage.groupName && (
                                    <p className="text-xs text-gray-500">{t('campaignCustomerModals.groupId')}: {linkedZaloMessage.groupId}</p>
                                  )}
                                {zaloClickedLinks.length > 0 && (
                                  <div className="space-y-1">
                                    <p className="text-xs text-gray-400">{t('campaignCustomerModals.clickedLinks')} ({zaloClickedLinks.length})</p>
                                    {zaloClickedLinks.map((clickedLink) => (
                                      <p key={clickedLink.linkKey} className="text-xs text-gray-500 break-all">
                                        - {clickedLink.targetUrl || clickedLink.label || t('campaignCustomerModals.clickedLink')}
                                      </p>
                                    ))}
                                  </div>
                                )}
                                {linkedZaloAttachments.length > 0 && (
                                  <div className="pt-1">
                                    <p className="text-xs text-gray-400">{t('campaignCustomerModals.attachments')} ({linkedZaloAttachments.length})</p>
                                    <div className="space-y-1 mt-1">
                                      {linkedZaloAttachments.map((file, index) => (
                                        <p key={`${file?.displayName || 'file'}-${index}`} className="text-xs text-gray-600">
                                          - {file?.displayName || t('campaignCustomerModals.attachment')}
                                        </p>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                            {linkedEmail && (
                              <div className="pt-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setShowEmailContentByPurchase((prev) => ({
                                      ...prev,
                                      [key]: !prev[key],
                                    }));
                                  }}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-600 bg-white hover:bg-gray-50 hover:border-gray-300 transition-colors"
                                >
                                  <HiOutlineEye className="w-3.5 h-3.5" />
                                  {isShowingEmailContent ? t('campaignCustomerModals.hideEmailContent') : t('campaignCustomerModals.viewEmailContent')}
                                </button>
                                {isShowingEmailContent && <EmailContentViewer email={linkedEmail} />}
                              </div>
                            )}
                            {linkedZaloMessage && (
                              <div className="pt-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setShowZaloContentByPurchase((prev) => ({
                                      ...prev,
                                      [key]: !prev[key],
                                    }));
                                  }}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-600 bg-white hover:bg-gray-50 hover:border-gray-300 transition-colors"
                                >
                                  <HiOutlineEye className="w-3.5 h-3.5" />
                                  {isShowingZaloContent ? t('campaignCustomerModals.hideZaloContent') : t('campaignCustomerModals.viewZaloContent')}
                                </button>
                                {isShowingZaloContent && (
                                  <div className="mt-2 space-y-2">
                                    <p className="text-sm text-gray-700 whitespace-pre-wrap rounded-lg bg-white border border-gray-200 p-3">
                                      {linkedZaloMessage.messageText || t('campaignCustomerModals.noZaloContent')}
                                    </p>
                                    {linkedZaloAttachments.length > 0 && (
                                      <div className="rounded-lg bg-white border border-gray-200 p-3">
                                        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                                          {t('campaignCustomerModals.attachments')} ({linkedZaloAttachments.length})
                                        </p>
                                        <div className="space-y-1.5">
                                          {linkedZaloAttachments.map((file, index) => (
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
                            )}
                            {(p.attributedFromClick || linkedOrderEvents.length > 0) && emailJourney && (
                              <div className="pt-1">
                                <p className="text-xs text-gray-400 mb-2 uppercase tracking-wide font-medium">{t('campaignCustomerModals.emailJourneyLeadingOrder')}</p>
                                <div className="bg-gray-50 rounded-lg border border-gray-100 p-3">
                                  <Journey4States
                                    journey={emailJourney}
                                    emailSubject={emailSubject}
                                    orderEvents={linkedOrderEvents}
                                    t={t}
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </BaseModal>
  );
};

const sanitizeEmailHtml = (html) => {
  if (!html) return '';
  let clean = html;
  clean = clean.replace(/<img[^>]*\/api\/customers\/email-tracking\/open\/[^>]*\/?>/gi, '');
  clean = clean.replace(
    /href=(["'])[^"']*\/api\/customers\/email-tracking\/click\/[^"'?]*\?[^"']*url=([^"'&]+)[^"']*/gi,
    (_m, q, encodedUrl) => {
      try { return `href=${q}${decodeURIComponent(encodedUrl)}`; }
      catch { return `href=${q}#`; }
    }
  );
  clean = clean.replace(
    /href=(["'])[^"']*\/track\/attachment\/[^"']*/gi,
    (_m, q) => `href=${q}#`
  );
  return clean;
};

const wrapEmailPreviewHtml = (html) => `<!doctype html>
<html><head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <base target="_blank">
  <style>html,body{margin:0;padding:0}img{max-width:100%;height:auto}table{border-collapse:collapse}</style>
</head><body>${html || ''}</body></html>`;

const EmailStateBadge = ({ journey, orderEvents = [], t }) => {
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

const Journey4States = ({ journey, emailSubject, orderEvents = [], t }) => {
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

const EmailContentViewer = ({ email }) => {
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

const EmailAccordionItem = ({ email, isExpanded, onToggle, orderEvents = [], t }) => {
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

const ZaloJourneyItem = ({ message, orderEvents = [], clickedEvents = [], t }) => {
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

const JourneyModal = ({ customer, campaignId, isOpen, onClose }) => {
  const { t } = useI18n();
  const [journeyData, setJourneyData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    if (!isOpen || !customer?.id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setJourneyData(null);
      setExpandedId(null);
      try {
        const res = await customerApiService.getCustomerCampaignJourney(customer.id, campaignId);
        if (!cancelled) setJourneyData(res.data?.data || null);
      } catch {
        if (!cancelled) toast.error(t('campaignCustomerModals.cantLoadJourney'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, customer?.id, campaignId]);

  const emails = [...(journeyData?.emails || [])].sort((a, b) => {
    const ta = a.sentAt ? new Date(a.sentAt).getTime() : 0;
    const tb = b.sentAt ? new Date(b.sentAt).getTime() : 0;
    return tb - ta;
  });
  const zaloMessages = [...(journeyData?.zaloMessages || [])].sort((a, b) => {
    const ta = a.sentAt ? new Date(a.sentAt).getTime() : 0;
    const tb = b.sentAt ? new Date(b.sentAt).getTime() : 0;
    return tb - ta;
  });
  const journey = journeyData?.journey || [];
  const hasAnyZaloJourneyData = zaloMessages.length > 0
    || journey.some((event) => String(event?.eventType || '').toLowerCase().startsWith('zalo_'));
  const displayName = getCustomerDisplayName(customer);
  const runMetaById = new Map(
    (journeyData?.runs || []).map((run) => [String(run?.runId || ''), run])
  );

  const orderEventsByEmailId = {};
  const orderEventsByZaloMessageId = {};
  const clickEventsByZaloMessageId = {};
  for (const event of journey) {
    const type = String(event.eventType || '').toLowerCase();
    if (type === 'order_pending' || type === 'order_completed') {
      const emailMessageId = event.idEmailMessage;
      if (emailMessageId) {
        if (!orderEventsByEmailId[emailMessageId]) orderEventsByEmailId[emailMessageId] = [];
        orderEventsByEmailId[emailMessageId].push(event);
      }
      const zaloMessageId = event.idZaloMessage;
      if (zaloMessageId) {
        if (!orderEventsByZaloMessageId[zaloMessageId]) orderEventsByZaloMessageId[zaloMessageId] = [];
        orderEventsByZaloMessageId[zaloMessageId].push(event);
      }
      continue;
    }
    if (type === 'zalo_clicked' && event.idZaloMessage) {
      if (!clickEventsByZaloMessageId[event.idZaloMessage]) {
        clickEventsByZaloMessageId[event.idZaloMessage] = [];
      }
      clickEventsByZaloMessageId[event.idZaloMessage].push(event);
    }
  }

  const toggleExpand = (id) => setExpandedId((cur) => (cur === id ? null : id));

  const runGroups = (() => {
    const grouped = new Map();
    emails.forEach((email) => {
      const key = email?.runId != null ? String(email.runId) : 'unknown';
      const runMeta = runMetaById.get(key) || null;
      if (!grouped.has(key)) {
        grouped.set(key, {
          runId: email?.runId ?? null,
          runName: email?.runName || runMeta?.runName || null,
          startedAt: runMeta?.startedAt || null,
          emails: [],
        });
      }
      grouped.get(key).emails.push(email);
    });
    zaloMessages.forEach((message) => {
      const key = message?.runId != null ? String(message.runId) : 'unknown';
      const runMeta = runMetaById.get(key) || null;
      if (!grouped.has(key)) {
        grouped.set(key, {
          runId: message?.runId ?? null,
          runName: message?.runName || runMeta?.runName || null,
          startedAt: runMeta?.startedAt || null,
          emails: [],
          zaloMessages: [],
        });
      }
      if (!grouped.get(key).zaloMessages) grouped.get(key).zaloMessages = [];
      grouped.get(key).zaloMessages.push(message);
    });
    return Array.from(grouped.values()).sort((a, b) => {
      const aTime = a.startedAt ? new Date(a.startedAt).getTime() : 0;
      const bTime = b.startedAt ? new Date(b.startedAt).getTime() : 0;
      if (aTime !== bTime) return bTime - aTime;
      const aRun = Number.parseInt(a.runId, 10);
      const bRun = Number.parseInt(b.runId, 10);
      if (Number.isFinite(aRun) && Number.isFinite(bRun)) return bRun - aRun;
      return 0;
    });
  })();

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title={`${t('campaignCustomerModals.journeyTitle')} — ${displayName || t('campaignCustomerModals.customer')}`}
    >
      <div className="p-6 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="spinner w-8 h-8" />
          </div>
        ) : runGroups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-3">
            <HiOutlineMail className="w-10 h-10" />
            <p>{t('campaignCustomerModals.noEmailsInCampaign')}</p>
          </div>
        ) : (
          <div className="space-y-5">
            {runGroups.map((group) => (
              <section key={String(group.runId || 'unknown')} className="space-y-3">
                <div className="rounded-lg border border-primary-100 bg-primary-50 px-4 py-3">
                  <p className="text-xs uppercase tracking-wide text-primary-700 font-semibold">
                    {t('campaignCustomerModals.campaignRun')}
                  </p>
                  <p className="text-sm text-gray-800 mt-0.5">
                    <span className="font-semibold">#{group.runId || '--'}</span>
                    {' · '}
                    {buildRunDisplayName(group.runId, group.runName, t)}
                  </p>
                </div>
                <div className="space-y-3">
                  {group.emails?.length ? (
                    group.emails.map((email) => (
                      <EmailAccordionItem
                        key={email.emailMessageId}
                        email={email}
                        isExpanded={expandedId === email.emailMessageId}
                        onToggle={() => toggleExpand(email.emailMessageId)}
                        orderEvents={orderEventsByEmailId[email.emailMessageId] || []}
                        t={t}
                      />
                    ))
                  ) : (
                    <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-500">
                      {t('campaignCustomerModals.noEmailsInRun')}
                    </div>
                  )}
                </div>
                {hasAnyZaloJourneyData && (
                  <div className="space-y-3">
                    <p className="text-xs uppercase tracking-wide font-semibold text-gray-500">
                      {t('campaignCustomerModals.zaloJourney')}
                    </p>
                    {group.zaloMessages?.length ? (() => {
                      const zaloGroupMessages = group.zaloMessages.filter(
                        (message) => String(message?.channel || '').toLowerCase() === 'zalo_group'
                      );
                      const otherZaloMessages = group.zaloMessages.filter(
                        (message) => String(message?.channel || '').toLowerCase() !== 'zalo_group'
                      );

                      return (
                        <div className="space-y-3">
                          {zaloGroupMessages.length > 0 && (
                            <ZaloGroupJourneySection
                              messages={zaloGroupMessages}
                              orderEventsByZaloMessageId={orderEventsByZaloMessageId}
                              clickEventsByZaloMessageId={clickEventsByZaloMessageId}
                              formatDateTime={formatDateTime}
                            />
                          )}
                          {otherZaloMessages.map((message) => (
                            <ZaloJourneyItem
                              key={message.id}
                              message={message}
                              orderEvents={orderEventsByZaloMessageId[message.id] || []}
                              clickedEvents={clickEventsByZaloMessageId[message.id] || []}
                              t={t}
                            />
                          ))}
                        </div>
                      );
                    })() : (
                      <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-500">
                        {t('campaignCustomerModals.noZaloEvents')}
                      </div>
                    )}
                  </div>
                )}
              </section>
            ))}
          </div>
        )}
      </div>
    </BaseModal>
  );
};

export {
  CustomerDetailModal,
  JourneyModal,
};
