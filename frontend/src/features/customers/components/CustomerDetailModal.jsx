import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  HiOutlineCalendar,
  HiOutlineChevronDown,
  HiOutlineEye,
  HiOutlineInformationCircle,
  HiOutlineMail,
  HiOutlinePhone,
  HiOutlineUser,
} from 'react-icons/hi';
import { useI18n } from '../../../i18n';
import customerApiService from '../services/customerApi.service';
import {
  decodeHtmlEntities,
  formatDateOnly,
  formatDateTime,
  getCustomerDisplayName,
} from '../utils/customerDisplay.helpers';
import {
  buildRunDisplayName,
  buildUniqueClickedLinks,
  getInitial,
  hasInterestedStatus,
  hasPurchasedStatus,
} from '../utils/campaignCustomerModal.helpers';
import BaseModal from './CustomerModalBase';
import { EmailContentViewer, Journey4States } from './CustomerJourneyItems';

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
            <div className="w-16 h-16 rounded-full bg-primary-100 dark:bg-primary-950/40 flex items-center justify-center shrink-0">
              <span className="text-2xl font-bold text-primary-600 dark:text-primary-400">{getInitial(customer)}</span>
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-xl font-bold text-gray-900 dark:text-dk-text mb-3">{displayName || '—'}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex items-center gap-2.5 text-sm text-gray-700 dark:text-dk-text">
                  <HiOutlineMail className="w-4 h-4 text-gray-400 dark:text-dk-muted shrink-0" />
                  <span className="truncate">{customer?.email || '--'}</span>
                </div>
                <div className="flex items-center gap-2.5 text-sm text-gray-700 dark:text-dk-text">
                  <HiOutlinePhone className="w-4 h-4 text-gray-400 dark:text-dk-muted shrink-0" />
                  <span>{customer?.phone || '--'}</span>
                </div>
                <div className="flex items-center gap-2.5 text-sm text-gray-700 dark:text-dk-text">
                  <HiOutlineCalendar className="w-4 h-4 text-gray-400 dark:text-dk-muted shrink-0" />
                  <span>{t('campaignCustomerModals.joined')} {formatDateOnly(customer?.createdAt)}</span>
                </div>
                <div className="flex items-center gap-2.5 text-sm">
                  <HiOutlineUser className="w-4 h-4 text-gray-400 dark:text-dk-muted shrink-0" />
                  <CustomerStatusBadge status={status} t={t} />
                </div>
                {customer?.consentSource ? (
                  <div className="flex items-center gap-2.5 text-sm text-gray-700 dark:text-dk-text">
                    <span className="text-gray-500 dark:text-dk-text2 font-medium">{t('campaignCustomers.consentSource')}:</span>
                    <span className="badge badge-info text-xs">
                      {t(`campaignCustomers.consentSources.${customer.consentSource}`, { defaultValue: customer.consentSource })}
                    </span>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        <section>
          <h3 className="text-base font-semibold text-gray-900 dark:text-dk-text mb-4 flex items-center gap-2">
            <HiOutlineInformationCircle className="w-5 h-5 text-primary-500 dark:text-primary-400" />
            {t('campaignCustomerModals.coursesFromCampaign')}
          </h3>

          {loading ? (
            <div className="flex items-center justify-center py-10">
              <div className="spinner w-8 h-8" />
            </div>
          ) : purchases.length === 0 ? (
            <div className="py-8 text-center text-gray-400 dark:text-dk-muted bg-gray-50 dark:bg-dk-raised/40 rounded-xl border border-gray-100 dark:border-dk-border">
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
                  <div key={key} className="rounded-xl border border-gray-200 dark:border-dk-border overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setExpandedPurchaseId(isExpanded ? null : key)}
                      className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-gray-50 dark:bg-dk-raised/50 hover:bg-gray-100 dark:hover:bg-dk-strong transition-colors text-left"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-gray-900 dark:text-dk-text text-sm leading-snug truncate">
                          {decodeHtmlEntities(p.courseName || p.productName || '--')}
                        </p>
                        <p className="text-xs text-gray-400 dark:text-dk-muted mt-0.5">
                          {p.orderId ? `#${p.orderId}` : t('campaignCustomerModals.noOrderCode')}
                          {p.courseCode ? ` · ${t('campaignCustomerModals.productCode')}: ${p.courseCode}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {purchased && <span className="badge badge-success">{t('campaignCustomerModals.purchased')}</span>}
                        {interested && !purchased && <span className="badge badge-warning">{t('campaignCustomerModals.leadShort')}</span>}
                        <HiOutlineChevronDown
                          className={`w-4 h-4 text-gray-400 dark:text-dk-muted transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                        />
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="px-4 py-3 border-t border-gray-100 dark:border-dk-border space-y-2 text-sm text-gray-700 dark:text-dk-text">
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                          <div>
                            <span className="text-xs text-gray-400 dark:text-dk-muted">{t('campaignCustomerModals.orderCode')}</span>
                            <p className="font-mono font-medium">{p.orderId ? `#${p.orderId}` : '--'}</p>
                          </div>
                          <div>
                            <span className="text-xs text-gray-400 dark:text-dk-muted">{t('campaignCustomerModals.productCode')}</span>
                            <p className="font-mono">{p.courseCode || '--'}</p>
                          </div>
                          <div>
                            <span className="text-xs text-gray-400 dark:text-dk-muted">{t('campaignCustomerModals.leftInfo')}</span>
                            <p>{interested ? <span className="badge badge-warning">{t('common.yes')}</span> : <span className="text-gray-400 dark:text-dk-muted">{t('common.no')}</span>}</p>
                          </div>
                          <div>
                            <span className="text-xs text-gray-400 dark:text-dk-muted">{t('campaignCustomerModals.purchased')}</span>
                            <p>{purchased ? <span className="badge badge-success">{t('common.yes')}</span> : <span className="text-gray-400 dark:text-dk-muted">{t('common.no')}</span>}</p>
                          </div>
                          <div>
                            <span className="text-xs text-gray-400 dark:text-dk-muted">{t('campaignCustomerModals.lastActivity')}</span>
                            <p>{formatDateTime(p.purchaseDate)}</p>
                          </div>
                          {p.idEmailMessage && (
                            <div>
                              <span className="text-xs text-gray-400 dark:text-dk-muted">{t('campaignCustomerModals.afterClick')}</span>
                              <p>
                                {(p.attributedFromClick || linkedOrderEvents.length > 0)
                                  ? <span className="badge badge-info">{t('common.yes')}</span>
                                  : <span className="text-gray-400 dark:text-dk-muted">{t('common.unknown')}</span>}
                              </p>
                            </div>
                          )}
                        </div>

                        {(p.idEmailMessage || p.idZaloMessage) && (
                          <div className="mt-1 pt-2 border-t border-gray-100 dark:border-dk-border space-y-2">
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                              {p.idEmailMessage && (
                                <div>
                                  <span className="text-xs text-gray-400 dark:text-dk-muted">{t('campaignCustomerModals.emailId')}</span>
                                  <p>
                                    <span className="inline-flex items-center rounded-full bg-blue-50 dark:bg-blue-950/40 px-2 py-0.5 text-xs font-mono text-blue-700 dark:text-blue-300 border border-blue-100 dark:border-blue-800">
                                      #{p.idEmailMessage}
                                    </span>
                                  </p>
                                </div>
                              )}
                              {p.idZaloMessage && (
                                <div>
                                  <span className="text-xs text-gray-400 dark:text-dk-muted">{t('campaignCustomerModals.zaloMessageId')}</span>
                                  <p className="flex flex-wrap items-center gap-1.5">
                                    <span className="inline-flex items-center rounded-full bg-orange-50 dark:bg-orange-950/40 px-2 py-0.5 text-xs font-mono text-orange-700 dark:text-orange-300 border border-orange-100 dark:border-orange-800">
                                      #{p.idZaloMessage}
                                    </span>
                                    {(linkedZaloMessage?.runId != null || linkedZaloMessage?.runName || linkedZaloMessage?.runDisplayName) && (
                                      <span className="inline-flex items-center rounded-full bg-primary-50 dark:bg-primary-950/40 px-2 py-0.5 text-xs font-medium text-primary-700 dark:text-primary-300 border border-primary-100 dark:border-primary-800">
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
                                  <span className="text-xs text-gray-400 dark:text-dk-muted">{t('campaignCustomerModals.emailOrder')}</span>
                                  <p className="font-medium text-gray-800 dark:text-dk-text">{t('customerDetail.emailIndex', { index: emailIndex })}</p>
                                </div>
                              )}
                              {(linkedEmail?.runId != null || linkedEmail?.runName) && (
                                <div className="col-span-2">
                                  <span className="text-xs text-gray-400 dark:text-dk-muted">{t('campaignCustomerModals.campaignRun')}</span>
                                  <p className="font-medium text-gray-800 dark:text-dk-text">
                                    #{linkedEmail?.runId || '--'} · {buildRunDisplayName(linkedEmail?.runId, linkedEmail?.runName, t)}
                                  </p>
                                </div>
                              )}
                            </div>
                            {emailSubject && (
                              <div>
                                <span className="text-xs text-gray-400 dark:text-dk-muted">{t('campaignCustomerModals.emailSubject')}</span>
                                <p className="font-medium text-gray-800 dark:text-dk-text leading-snug">{emailSubject}</p>
                              </div>
                            )}
                              {linkedZaloMessage && (
                                <div className="space-y-1">
                                  <span className="text-xs text-gray-400 dark:text-dk-muted">{t('campaignCustomerModals.zaloMessageLinked')}</span>
                                  <p className="text-sm text-gray-700 dark:text-dk-text">
                                    {linkedZaloMessage.channel === 'zalo_group'
                                      ? `${linkedZaloMessage.groupName || linkedZaloMessage.groupId || '--'}`
                                      : (linkedZaloMessage.recipientValue || t('campaignCustomerModals.zaloPersonal'))}
                                  </p>
                                  {linkedZaloMessage.channel === 'zalo_group' && linkedZaloMessage.groupId && linkedZaloMessage.groupName && (
                                    <p className="text-xs text-gray-500 dark:text-dk-text2">{t('campaignCustomerModals.groupId')}: {linkedZaloMessage.groupId}</p>
                                  )}
                                {zaloClickedLinks.length > 0 && (
                                  <div className="space-y-1">
                                    <p className="text-xs text-gray-400 dark:text-dk-muted">{t('campaignCustomerModals.clickedLinks')} ({zaloClickedLinks.length})</p>
                                    {zaloClickedLinks.map((clickedLink) => (
                                      <p key={clickedLink.linkKey} className="text-xs text-gray-500 dark:text-dk-text2 break-all">
                                        - {clickedLink.targetUrl || clickedLink.label || t('campaignCustomerModals.clickedLink')}
                                      </p>
                                    ))}
                                  </div>
                                )}
                                {linkedZaloAttachments.length > 0 && (
                                  <div className="pt-1">
                                    <p className="text-xs text-gray-400 dark:text-dk-muted">{t('campaignCustomerModals.attachments')} ({linkedZaloAttachments.length})</p>
                                    <div className="space-y-1 mt-1">
                                      {linkedZaloAttachments.map((file, index) => (
                                        <p key={`${file?.displayName || 'file'}-${index}`} className="text-xs text-gray-600 dark:text-dk-text2">
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
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 dark:border-dk-border text-gray-600 dark:text-dk-text2 bg-white dark:bg-dk-surface hover:bg-gray-50 dark:hover:bg-dk-raised hover:border-gray-300 dark:hover:border-dk-border-strong transition-colors"
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
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 dark:border-dk-border text-gray-600 dark:text-dk-text2 bg-white dark:bg-dk-surface hover:bg-gray-50 dark:hover:bg-dk-raised hover:border-gray-300 dark:hover:border-dk-border-strong transition-colors"
                                >
                                  <HiOutlineEye className="w-3.5 h-3.5" />
                                  {isShowingZaloContent ? t('campaignCustomerModals.hideZaloContent') : t('campaignCustomerModals.viewZaloContent')}
                                </button>
                                {isShowingZaloContent && (
                                  <div className="mt-2 space-y-2">
                                    <p className="text-sm text-gray-700 dark:text-dk-text whitespace-pre-wrap rounded-lg bg-white dark:bg-dk-surface border border-gray-200 dark:border-dk-border p-3">
                                      {linkedZaloMessage.messageText || t('campaignCustomerModals.noZaloContent')}
                                    </p>
                                    {linkedZaloAttachments.length > 0 && (
                                      <div className="rounded-lg bg-white dark:bg-dk-surface border border-gray-200 dark:border-dk-border p-3">
                                        <p className="text-xs font-medium text-gray-500 dark:text-dk-text2 uppercase tracking-wide mb-2">
                                          {t('campaignCustomerModals.attachments')} ({linkedZaloAttachments.length})
                                        </p>
                                        <div className="space-y-1.5">
                                          {linkedZaloAttachments.map((file, index) => (
                                            <p key={`${file?.displayName || 'file'}-${index}`} className="text-sm text-gray-700 dark:text-dk-text">
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
                                <p className="text-xs text-gray-400 dark:text-dk-muted mb-2 uppercase tracking-wide font-medium">{t('campaignCustomerModals.emailJourneyLeadingOrder')}</p>
                                <div className="bg-gray-50 dark:bg-dk-raised rounded-lg border border-gray-100 dark:border-dk-border p-3">
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

export default CustomerDetailModal;
