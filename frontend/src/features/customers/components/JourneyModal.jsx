import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { HiOutlineMail } from 'react-icons/hi';
import { useI18n } from '../../../i18n';
import customerApiService from '../services/customerApi.service';
import {
  formatDateTime,
  getCustomerDisplayName,
} from '../utils/customerDisplay.helpers';
import { buildRunDisplayName } from '../utils/campaignCustomerModal.helpers';
import BaseModal from './CustomerModalBase';
import { EmailAccordionItem, ZaloJourneyItem } from './CustomerJourneyItems';
import ZaloGroupJourneySection from './ZaloGroupJourneySection';

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

export default JourneyModal;
