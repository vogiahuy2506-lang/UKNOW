import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useI18n } from '../../i18n';
import {
  HiOutlineArrowLeft,
  HiOutlineCalendar,
  HiOutlineChartBar,
  HiOutlineClock,
  HiOutlineCursorClick,
  HiOutlineEye,
  HiOutlineInbox,
  HiOutlineMail,
  HiOutlinePhone,
  HiOutlineUser,
  HiOutlineInformationCircle,
} from 'react-icons/hi';
import customerApiService from '../../features/customers/services/customerApi.service';
import Modal from '../../components/Modal';
import CustomerStatCard from '../../features/customers/components/CustomerStatCard';
import {
  decodeHtmlEntities,
  formatDateTime,
  formatMoney,
  getCustomerDisplayName,
} from '../../features/customers/utils/customerDisplay.helpers';
import {
  formatEventType,
  normalizeJourneyDescription,
  normalizeStatusLabel,
  sanitizeEmailHtmlForPreview,
} from '../../features/customers/utils/customerJourney.helpers';

const CustomerDetail = () => {
  const { t } = useI18n();
  const { id } = useParams();
  const navigate = useNavigate();

  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingCampaignDetail, setIsLoadingCampaignDetail] = useState(false);
  const [customer, setCustomer] = useState(null);
  const [participations, setParticipations] = useState([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState(null);
  const [campaignDetail, setCampaignDetail] = useState(null);
  const [selectedEmailDetail, setSelectedEmailDetail] = useState(null);

  const refreshSnapshot = useCallback(async (campaignId) => {
    if (!id || !campaignId) return;

    try {
      const [customerResponse, participationResponse, campaignDetailResponse] = await Promise.all([
        customerApiService.getCustomerById(id),
        customerApiService.getCustomerCampaignParticipations(id),
        customerApiService.getCustomerCampaignJourney(id, campaignId),
      ]);

      setCustomer(customerResponse.data?.data || null);
      setParticipations(participationResponse.data?.data || []);
      setCampaignDetail(campaignDetailResponse.data?.data || null);
    } catch (error) {
      console.error('Refresh customer detail snapshot error:', error);
    }
  }, [id]);

  const fetchCampaignDetail = async (campaignId) => {
    if (!campaignId) {
      setCampaignDetail(null);
      return;
    }

    setIsLoadingCampaignDetail(true);
    try {
      const response = await customerApiService.getCustomerCampaignJourney(id, campaignId);
      setCampaignDetail(response.data?.data || null);
    } catch (error) {
      console.error('Fetch campaign detail error:', error);
      setCampaignDetail(null);
      toast.error(t('customerDetail.loadCampaignFailed'), {
        id: 'customer-campaign-detail-error',
      });
    } finally {
      setIsLoadingCampaignDetail(false);
    }
  };

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [customerResponse, participationResponse] = await Promise.all([
        customerApiService.getCustomerById(id),
        customerApiService.getCustomerCampaignParticipations(id),
      ]);

      const customerData = customerResponse.data?.data || null;
      const participationData = participationResponse.data?.data || [];

      setCustomer(customerData);
      setParticipations(participationData);

      const firstCampaignId = participationData[0]?.campaignId || null;
      setSelectedCampaignId(firstCampaignId);

      if (firstCampaignId) {
        await fetchCampaignDetail(firstCampaignId);
      } else {
        setCampaignDetail(null);
      }
    } catch (error) {
      console.error('Fetch customer detail error:', error);
      toast.error(t('customerDetail.loadFailed'), { id: 'customer-detail-load-error' });
      navigate('/app/customers');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!selectedCampaignId) return undefined;

    const intervalId = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      refreshSnapshot(selectedCampaignId);
    }, 15000);

    return () => clearInterval(intervalId);
  }, [selectedCampaignId, refreshSnapshot]);

  const displayName = useMemo(() => {
    const resolved = getCustomerDisplayName(customer);
    return resolved || `${t('customerDetail.customer')} #${id}`;
  }, [customer, id, t]);

  const customerStats = useMemo(() => {
    const fromParticipations = participations.reduce(
      (acc, item) => {
        acc.received += item.emailReceivedCount || 0;
        acc.opened += item.emailOpenedCount || 0;
        acc.clicked += item.emailClickedCount || 0;
        return acc;
      },
      { received: 0, opened: 0, clicked: 0 }
    );

    return {
      campaigns: participations.length,
      received: customer?.emailsReceived ?? fromParticipations.received,
      opened: customer?.emailsOpened ?? fromParticipations.opened,
      clicked: customer?.emailsClicked ?? fromParticipations.clicked,
    };
  }, [customer, participations]);

  const selectedEmailTimeline = useMemo(() => {
    if (!selectedEmailDetail) return [];

    const timeline = [];
    if (selectedEmailDetail.sentAt) {
      timeline.push({
        key: 'sent',
        label: t('customerDetail.emailSent'),
        at: selectedEmailDetail.sentAt,
      });
    }
    if (selectedEmailDetail.firstOpenedAt) {
      timeline.push({
        key: 'opened',
        label: t('customerDetail.emailOpened'),
        at: selectedEmailDetail.firstOpenedAt,
      });
    }
    if (selectedEmailDetail.firstClickedAt) {
      timeline.push({
        key: 'clicked',
        label: t('customerDetail.linkClicked'),
        at: selectedEmailDetail.firstClickedAt,
      });
    }

    const journeyMatches = (campaignDetail?.journey || [])
      .filter((event) => event.idEmailMessage === selectedEmailDetail.emailMessageId)
      .map((event) => {
        let label = normalizeJourneyDescription(event);
        if (String(event.eventType || '').toLowerCase() === 'course_interest') label = t('customerDetail.courseInterest');
        if (String(event.eventType || '').toLowerCase() === 'course_purchase') label = t('customerDetail.coursePurchase');
        return {
          key: `journey-${event.id}`,
          label,
          at: event.eventAt,
        };
      });

    const sentAtMs = selectedEmailDetail.sentAt ? new Date(selectedEmailDetail.sentAt).getTime() : null;
    const clickedAtMs = selectedEmailDetail.firstClickedAt ? new Date(selectedEmailDetail.firstClickedAt).getTime() : null;
    const purchaseMatches = (campaignDetail?.purchases || [])
      .filter((purchase) => purchase.attributedFromClick)
      .filter((purchase) => {
        const purchaseAtMs = purchase.purchaseDate ? new Date(purchase.purchaseDate).getTime() : null;
        if (!Number.isFinite(purchaseAtMs)) return false;
        if (Number.isFinite(clickedAtMs)) return purchaseAtMs >= clickedAtMs;
        if (Number.isFinite(sentAtMs)) return purchaseAtMs >= sentAtMs;
        return true;
      })
      .map((purchase, index) => ({
        key: `purchase-${purchase.id || index}`,
        label:
          String(purchase.itemStatus || '').toLowerCase() === 'interested'
            ? `${t('customerDetail.courseInterest')}: ${decodeHtmlEntities(purchase.courseName || purchase.productName || t('customerDetail.courseName'))}`
            : `${t('customerDetail.coursePurchase')}: ${decodeHtmlEntities(purchase.courseName || purchase.productName || t('customerDetail.courseName'))}`,
        at: purchase.purchaseDate,
      }));

    return [...timeline, ...journeyMatches, ...purchaseMatches]
      .filter((item) => item.at)
      .sort((a, b) => new Date(a.at) - new Date(b.at));
  }, [selectedEmailDetail, campaignDetail, t]);

  const selectedEmailContentHtml = useMemo(
    () => sanitizeEmailHtmlForPreview(selectedEmailDetail?.bodyHtml || ''),
    [selectedEmailDetail]
  );

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 spinner" />
      </div>
    );
  }

  if (!customer) {
    return <div className="py-10 text-center text-gray-500">{t('customerDetail.customerNotFound')}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => navigate('/app/customers')}
            className="rounded-lg p-2 text-gray-600 hover:bg-gray-100 shrink-0"
          >
            <HiOutlineArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-gray-900 truncate">{displayName}</h1>
            <p className="text-sm text-gray-500">{t('customerDetail.emailAndJourney')}</p>
          </div>
        </div>
        {selectedCampaignId ? (
          <button
            onClick={() => refreshSnapshot(selectedCampaignId)}
            className="btn btn-secondary btn-sm"
          >
            {t('customerDetail.refreshStats')}
          </button>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <CustomerStatCard title={t('customers.campaignsParticipated')} value={customerStats.campaigns} icon={HiOutlineChartBar} />
        <CustomerStatCard title={t('customerDetail.emailReceived')} value={customerStats.received} icon={HiOutlineInbox} colorClass="text-blue-600" />
        <CustomerStatCard title={t('customerDetail.emailOpened')} value={customerStats.opened} icon={HiOutlineEye} colorClass="text-green-600" />
        <CustomerStatCard title={t('customerDetail.emailClicked')} value={customerStats.clicked} icon={HiOutlineCursorClick} colorClass="text-orange-600" />
      </div>

      <div className="card">
        <div className="card-body">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">{t('customerDetail.basicInfo')}</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div className="flex items-center gap-2 text-gray-700">
              <HiOutlineUser className="h-5 w-5 text-gray-400" />
              <span>{customer.fullName || '--'}</span>
            </div>
            <div className="flex items-center gap-2 text-gray-700">
              <HiOutlineMail className="h-5 w-5 text-gray-400" />
              <span>{customer.email || '--'}</span>
              {customer.email ? null : (
                <div className="relative group">
                  <button type="button" className="text-blue-500 hover:text-blue-700">
                    <HiOutlineInformationCircle className="h-4 w-4" />
                  </button>
                  <div className="absolute left-0 bottom-full mb-2 w-64 p-3 bg-white border border-gray-200 rounded-lg shadow-lg text-xs text-gray-600 z-10 hidden group-hover:block">
                    <p className="font-medium text-gray-700 mb-1">Cách khách hàng thêm email:</p>
                    <p>Khách hàng có thể nhập email khi điền form thông tin trên chatbot hoặc landing page của bạn.</p>
                    <a href="/settings/chatbot" className="block mt-2 text-blue-600 hover:underline">Cài đặt chatbot</a>
                  </div>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 text-gray-700">
              <HiOutlinePhone className="h-5 w-5 text-gray-400" />
              <span>{customer.phone || '--'}</span>
            </div>
            <div className="flex items-center gap-2 text-gray-700">
              <HiOutlineCalendar className="h-5 w-5 text-gray-400" />
              <span>{t('customerDetail.created')}: {formatDateTime(customer.createdAt)}</span>
            </div>
            <div className="flex items-center gap-2 text-gray-700">
              <HiOutlineClock className="h-5 w-5 text-gray-400" />
              <span>{t('customerDetail.updated')}: {formatDateTime(customer.updatedAt)}</span>
            </div>
            <div className="text-gray-700">
              <span className="font-medium">{t('customerDetail.source')}:</span> {customer.customerSource || '--'}
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-body">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">{t('customerDetail.participatedCampaigns')}</h2>
          {participations.length === 0 ? (
            <div className="py-8 text-center text-gray-500">{t('customerDetail.noParticipatedCampaigns')}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('customerDetail.campaign')}</th>
                    <th>{t('customerDetail.emailReceived')}</th>
                    <th>{t('customers.opened')}</th>
                    <th>{t('customerDetail.clicked')}</th>
                    <th>{t('customerDetail.lastActivity')}</th>
                    <th className="w-28" />
                  </tr>
                </thead>
                <tbody>
                  {participations.map((item) => (
                    <tr
                      key={item.campaignId}
                      className={`transition-colors ${selectedCampaignId === item.campaignId ? 'bg-primary-50' : 'hover:bg-gray-50'}`}
                    >
                      <td>
                        <div className="font-medium text-gray-900">{item.campaignName}</div>
                        <div className="text-xs text-gray-500">{t('customerDetail.joined')}: {formatDateTime(item.joinedAt)}</div>
                      </td>
                      <td><span className="inline-flex items-center rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-800">{item.emailReceivedCount || 0}</span></td>
                      <td><span className="inline-flex items-center rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-800">{item.emailOpenedCount || 0}</span></td>
                      <td><span className="inline-flex items-center rounded-full bg-orange-100 px-3 py-1 text-xs font-medium text-orange-800">{item.emailClickedCount || 0}</span></td>
                      <td>{formatDateTime(item.lastActivityAt)}</td>
                      <td>
                        <button
                          onClick={() => {
                            setSelectedCampaignId(item.campaignId);
                            fetchCampaignDetail(item.campaignId);
                          }}
                          className="btn btn-secondary btn-sm"
                        >
                          {t('customerDetail.viewDetail')}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-body space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">{t('customerDetail.selectedCampaignDetail')}</h2>

          {isLoadingCampaignDetail ? (
            <div className="py-8 text-center text-gray-500">{t('customers.loadingDetail')}</div>
          ) : !campaignDetail ? (
            <div className="py-8 text-center text-gray-500">{t('customerDetail.selectCampaignToView')}</div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                  <p className="text-xs uppercase tracking-wide text-blue-600 font-medium">{t('customerDetail.byCampaign')}</p>
                  <div className="mt-3 space-y-2">
                    <p className="text-sm text-gray-700">
                      <span className="font-medium">{t('customerDetail.participants')}:</span> {campaignDetail?.summaries?.byCampaign?.participantCount || 0}
                    </p>
                    <p className="text-sm text-gray-700">
                      <span className="font-medium">{t('customerDetail.emailsReceived')}:</span> {campaignDetail?.summaries?.byCampaign?.emailReceivedCount || 0}
                    </p>
                    <p className="text-sm text-gray-700">
                      <span className="font-medium">{t('customerDetail.emailsOpened')}:</span> {campaignDetail?.summaries?.byCampaign?.emailOpenedCount || 0}
                    </p>
                    <p className="text-sm text-gray-700">
                      <span className="font-medium">{t('customerDetail.clicked')}:</span> {campaignDetail?.summaries?.byCampaign?.emailClickedCount || 0}
                    </p>
                    <p className="text-sm text-gray-700">
                      <span className="font-medium">{t('customerDetail.purchased')}:</span> {campaignDetail?.summaries?.byCampaign?.purchaseCount || 0}
                    </p>
                    <p className="text-sm text-gray-700">
                      <span className="font-medium">{t('customerDetail.leftInfo')}:</span> {campaignDetail?.summaries?.byCampaign?.interestedCount || 0}
                    </p>
                    <p className="text-sm text-gray-700">
                      <span className="font-medium">{t('customerDetail.purchaseAfterClick')}:</span> {campaignDetail?.summaries?.byCampaign?.attributedFromClickCount || 0}
                    </p>
                    <p className="text-sm text-gray-700">
                      <span className="font-medium">{t('customerDetail.revenue')}:</span> {formatMoney(campaignDetail?.summaries?.byCampaign?.revenue || 0)}
                    </p>
                  </div>
                </div>

                <div className="rounded-lg border border-purple-200 bg-purple-50 p-4">
                  <p className="text-xs uppercase tracking-wide text-purple-600 font-medium">{t('customerDetail.byCustomer')}</p>
                  <div className="mt-3 space-y-2">
                    <p className="text-sm text-gray-700">
                      <span className="font-medium">{t('customers.campaignCount')}:</span> {campaignDetail?.summaries?.byCustomer?.campaignCount || 0}
                    </p>
                    <p className="text-sm text-gray-700">
                      <span className="font-medium">{t('customerDetail.emailsReceived')}:</span> {campaignDetail?.summaries?.byCustomer?.emailReceivedCount || 0}
                    </p>
                    <p className="text-sm text-gray-700">
                      <span className="font-medium">{t('customerDetail.emailsOpened')}:</span> {campaignDetail?.summaries?.byCustomer?.emailOpenedCount || 0}
                    </p>
                    <p className="text-sm text-gray-700">
                      <span className="font-medium">{t('customerDetail.clicked')}:</span> {campaignDetail?.summaries?.byCustomer?.emailClickedCount || 0}
                    </p>
                    <p className="text-sm text-gray-700">
                      <span className="font-medium">{t('customerDetail.purchased')}:</span> {campaignDetail?.summaries?.byCustomer?.purchaseCount || 0}
                    </p>
                    <p className="text-sm text-gray-700">
                      <span className="font-medium">{t('customerDetail.leftInfo')}:</span> {campaignDetail?.summaries?.byCustomer?.interestedCount || 0}
                    </p>
                    <p className="text-sm text-gray-700">
                      <span className="font-medium">{t('customerDetail.purchaseAfterClick')}:</span> {campaignDetail?.summaries?.byCustomer?.attributedFromClickCount || 0}
                    </p>
                    <p className="text-sm text-gray-700">
                      <span className="font-medium">{t('customerDetail.revenue')}:</span> {formatMoney(campaignDetail?.summaries?.byCustomer?.revenue || 0)}
                    </p>
                  </div>
                </div>

                <div className="rounded-lg border border-gray-300 bg-gray-50 p-4">
                  <p className="text-xs uppercase tracking-wide font-medium text-gray-600">{t('customerDetail.overallSystem')}</p>
                  <div className="mt-3 space-y-2">
                    <p className="text-sm text-gray-700">
                      <span className="font-medium">{t('customerDetail.participants')}:</span> {campaignDetail?.summaries?.overall?.participantCount || 0}
                    </p>
                    <p className="text-sm text-gray-700">
                      <span className="font-medium">{t('customerDetail.emailsReceived')}:</span> {campaignDetail?.summaries?.overall?.emailReceivedCount || 0}
                    </p>
                    <p className="text-sm text-gray-700">
                      <span className="font-medium">{t('customerDetail.emailsOpened')}:</span> {campaignDetail?.summaries?.overall?.emailOpenedCount || 0}
                    </p>
                    <p className="text-sm text-gray-700">
                      <span className="font-medium">{t('customerDetail.clicked')}:</span> {campaignDetail?.summaries?.overall?.emailClickedCount || 0}
                    </p>
                    <p className="text-sm text-gray-700">
                      <span className="font-medium">{t('customerDetail.purchased')}:</span> {campaignDetail?.summaries?.overall?.purchaseCount || 0}
                    </p>
                    <p className="text-sm text-gray-700">
                      <span className="font-medium">{t('customerDetail.leftInfo')}:</span> {campaignDetail?.summaries?.overall?.interestedCount || 0}
                    </p>
                    <p className="text-sm text-gray-700">
                      <span className="font-medium">{t('customerDetail.purchaseAfterClick')}:</span> {campaignDetail?.summaries?.overall?.attributedFromClickCount || 0}
                    </p>
                    <p className="text-sm text-gray-700">
                      <span className="font-medium">{t('customerDetail.revenue')}:</span> {formatMoney(campaignDetail?.summaries?.overall?.revenue || 0)}
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="mb-3 text-base font-medium text-gray-900">{t('customerDetail.emailJourneyInCampaign')}</h3>
                {campaignDetail.emails?.length ? (
                  <div className="overflow-x-auto">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>{t('customerDetail.emailName')}</th>
                          <th>{t('customerDetail.sentAt')}</th>
                          <th>{t('customers.opened')}</th>
                          <th>{t('customerDetail.clicked')}</th>
                          <th>{t('customerDetail.status')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {campaignDetail.emails.map((email) => (
                          <tr key={email.emailMessageId}>
                            <td>
                              <div className="font-medium text-gray-900">
                                {decodeHtmlEntities(email.emailTemplateName || email.subject || `Email ${email.emailIndex}`)}
                              </div>
                              <div className="text-xs text-gray-500">
                                {t('customerDetail.customerEmailSubject')}: {decodeHtmlEntities(email.subject || '--')}
                              </div>
                            </td>
                            <td>{formatDateTime(email.sentAt)}</td>
                            <td><span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">{email.openCount || 0}</span></td>
                            <td><span className="inline-flex items-center rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-medium text-orange-800">{email.clickCount || 0}</span></td>
                            <td>
                              <button
                                onClick={() => setSelectedEmailDetail(email)}
                                className="inline-flex items-center rounded-full bg-primary-100 px-2.5 py-0.5 text-xs font-medium text-primary-700 hover:bg-primary-200"
                              >
                                {email.openCount > 0 ? `✓ ${t('customers.opened')}` : t('customers.notOpened')} - {t('customers.viewDetail')}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-sm text-gray-500">{t('customerDetail.noEmailData')}</div>
                )}
              </div>

              <div>
                <h3 className="mb-3 text-base font-medium text-gray-900">{t('customerDetail.coursesFromCampaign')}</h3>
                {campaignDetail.purchases?.length ? (
                  <div className="overflow-x-auto">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>{t('customerDetail.orderCode')}</th>
                          <th>{t('customerDetail.course')}</th>
                          <th>{t('customerDetail.productCode')}</th>
                          <th>{t('customerDetail.status')}</th>
                          <th>{t('customerDetail.value')}</th>
                          <th>{t('customerDetail.purchaseTime')}</th>
                          <th>{t('customerDetail.emailId')}</th>
                          <th>{t('customerDetail.afterEmailClick')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {campaignDetail.purchases.map((purchase) => (
                          <tr key={purchase.id}>
                            <td className="whitespace-nowrap font-mono text-sm text-gray-700">{purchase.orderId ? `#${purchase.orderId}` : '--'}</td>
                            <td>{decodeHtmlEntities(purchase.courseName || purchase.productName || '--')}</td>
                            <td className="whitespace-nowrap font-mono text-sm text-gray-600">{purchase.courseCode || '--'}</td>
                            <td>
                              <div className="flex flex-wrap gap-1">
                                {(purchase.statuses || []).map((statusLabel, idx) => {
                                  const displayStatus = normalizeStatusLabel(statusLabel);
                                  return (
                                  <span
                                    key={`${purchase.id}-${idx}`}
                                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                                      displayStatus === t('customerDetail.statusPurchased')
                                        ? 'bg-green-100 text-green-800'
                                        : displayStatus === t('customerDetail.statusLead')
                                          ? 'bg-yellow-100 text-yellow-800'
                                          : displayStatus.includes(t('customerDetail.statusClicked'))
                                            ? 'bg-blue-100 text-blue-800'
                                            : 'bg-gray-100 text-gray-700'
                                    }`}
                                  >
                                    {displayStatus}
                                  </span>
                                  );
                                })}
                              </div>
                            </td>
                            <td>{formatMoney(purchase.amount, purchase.currency)}</td>
                            <td>{formatDateTime(purchase.purchaseDate)}</td>
                            <td>
                              {purchase.idEmailMessage ? (
                                <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-mono text-blue-700 border border-blue-100">
                                  #{purchase.idEmailMessage}
                                </span>
                              ) : (
                                <span className="text-gray-400 text-xs">—</span>
                              )}
                            </td>
                            <td>
                              {purchase.attributedFromClick ? (
                                <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                                  {t('common.yes')}
                                </span>
                              ) : (
                                <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
                                  {t('common.unknown')}
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-sm text-gray-500">{t('customerDetail.noPurchaseDataCampaign')}</div>
                )}
              </div>

              <div>
                <h3 className="mb-3 text-base font-medium text-gray-900">{t('customerDetail.timelineTitle')}</h3>
                {campaignDetail.journey?.length ? (
                  <div className="space-y-2">
                    {campaignDetail.journey.map((event) => (
                      <div key={event.id} className="rounded-lg border border-gray-200 border-l-4 border-l-primary-500 bg-white p-3 transition-colors hover:bg-gray-50">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="flex-1">
                            <p className="font-medium text-gray-900">{normalizeJourneyDescription(event)}</p>
                            <p className="mt-1 text-xs uppercase tracking-wide font-medium text-primary-600">{formatEventType(event.eventType)}</p>
                          </div>
                          <p className="whitespace-nowrap text-xs text-gray-500">{formatDateTime(event.eventAt)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-gray-500">{t('customerDetail.noJourneyData')}</div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-body">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">{t('customerDetail.customerPurchasedCourses')}</h2>
          {customer.purchases?.length ? (
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('customerDetail.order')}</th>
                    <th>{t('customerDetail.course')}</th>
                    <th>{t('customerDetail.status')}</th>
                    <th>{t('customerDetail.value')}</th>
                    <th>{t('customerDetail.campaign')}</th>
                    <th>{t('customerDetail.afterEmailClick')}</th>
                    <th>{t('customerDetail.purchaseTime')}</th>
                  </tr>
                </thead>
                <tbody>
                  {customer.purchases.map((purchase) => (
                    <tr key={purchase.id}>
                      <td>#{purchase.orderId || '--'}</td>
                      <td>{decodeHtmlEntities(purchase.courseName || purchase.productName || '--')}</td>
                      <td>
                        <div className="flex flex-wrap gap-1">
                                {(purchase.statuses || []).map((statusLabel, idx) => {
                                  const displayStatus = normalizeStatusLabel(statusLabel);
                                  return (
                                  <span
                                    key={`${purchase.id}-${idx}`}
                                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                                      displayStatus === t('customerDetail.statusPurchased')
                                        ? 'bg-green-100 text-green-800'
                                        : displayStatus === t('customerDetail.statusLead')
                                          ? 'bg-yellow-100 text-yellow-800'
                                          : displayStatus.includes(t('customerDetail.statusClicked'))
                                            ? 'bg-blue-100 text-blue-800'
                                            : 'bg-gray-100 text-gray-700'
                                    }`}
                                  >
                                    {displayStatus}
                                  </span>
                                  );
                                })}
                        </div>
                      </td>
                      <td>{formatMoney(purchase.amount, purchase.currency)}</td>
                      <td>{purchase.campaignName || '--'}</td>
                      <td>
                        {purchase.attributedFromClick ? (
                          <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                            {t('common.yes')}
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
                            {t('common.unknown')}
                          </span>
                        )}
                      </td>
                      <td>{formatDateTime(purchase.purchaseDate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-6 text-sm text-gray-500">{t('customerDetail.noPurchaseData')}</div>
          )}
        </div>
      </div>

      <Modal
        isOpen={Boolean(selectedEmailDetail)}
        onClose={() => setSelectedEmailDetail(null)}
        title={t('customerDetail.emailAndJourneyTitle')}
        size="2xl"
      >
        {selectedEmailDetail ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <p className="text-sm text-gray-500">{t('customerDetail.emailName')}</p>
              <p className="font-medium text-gray-900">
                {decodeHtmlEntities(selectedEmailDetail.emailTemplateName || selectedEmailDetail.subject || '--')}
              </p>
              <p className="mt-2 text-sm text-gray-500">{t('customerDetail.customerEmailSubject')}</p>
              <p className="font-medium text-gray-900">{decodeHtmlEntities(selectedEmailDetail.subject || '--')}</p>
              <p className="mt-2 text-sm text-gray-500">
                {t('customerDetail.sentAt')}: <span className="font-medium text-gray-800">{formatDateTime(selectedEmailDetail.sentAt)}</span>
              </p>
            </div>

            <div>
              <h4 className="mb-2 font-medium text-gray-900">{t('customerDetail.emailContent')}</h4>
              {selectedEmailContentHtml ? (
                <div
                  className="rounded-lg border border-gray-200 bg-white p-4 prose max-w-none"
                  dangerouslySetInnerHTML={{ __html: selectedEmailContentHtml }}
                />
              ) : (
                <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-700 whitespace-pre-wrap">
                  {decodeHtmlEntities(selectedEmailDetail.bodyText || t('customers.noEmailContent'))}
                </div>
              )}
            </div>

            <div>
              <h4 className="mb-2 font-medium text-gray-900">{t('customerDetail.journeyTimeline')}</h4>
              {selectedEmailTimeline.length ? (
                <div className="space-y-2">
                  {selectedEmailTimeline.map((item) => (
                    <div key={item.key} className="rounded-lg border border-gray-200 bg-white p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium text-gray-900">{item.label}</p>
                        <p className="text-xs text-gray-500">{formatDateTime(item.at)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-gray-500">{t('customerDetail.noTimeline')}</div>
              )}
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
};

export default CustomerDetail;
