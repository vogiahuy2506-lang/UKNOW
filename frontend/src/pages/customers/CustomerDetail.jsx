import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
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
      toast.error('Không thể tải chi tiết chiến dịch của khách hàng', {
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
      toast.error('Không thể tải thông tin khách hàng', { id: 'customer-detail-load-error' });
      navigate('/customers');
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
    return resolved || `Khách hàng #${id}`;
  }, [customer, id]);

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
        label: 'Đã gửi email',
        at: selectedEmailDetail.sentAt,
      });
    }
    if (selectedEmailDetail.firstOpenedAt) {
      timeline.push({
        key: 'opened',
        label: 'Khách hàng đã mở email',
        at: selectedEmailDetail.firstOpenedAt,
      });
    }
    if (selectedEmailDetail.firstClickedAt) {
      timeline.push({
        key: 'clicked',
        label: 'Khách hàng đã nhấp link trong email',
        at: selectedEmailDetail.firstClickedAt,
      });
    }

    const journeyMatches = (campaignDetail?.journey || [])
      .filter((event) => event.idEmailMessage === selectedEmailDetail.emailMessageId)
      .map((event) => {
        let label = normalizeJourneyDescription(event);
        if (String(event.eventType || '').toLowerCase() === 'course_interest') label = 'Để lại thông tin';
        if (String(event.eventType || '').toLowerCase() === 'course_purchase') label = 'Mua hàng thành công';
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
            ? `Để lại thông tin: ${decodeHtmlEntities(purchase.courseName || purchase.productName || 'Khóa học')}`
            : `Mua hàng thành công: ${decodeHtmlEntities(purchase.courseName || purchase.productName || 'Khóa học')}`,
        at: purchase.purchaseDate,
      }));

    return [...timeline, ...journeyMatches, ...purchaseMatches]
      .filter((item) => item.at)
      .sort((a, b) => new Date(a.at) - new Date(b.at));
  }, [selectedEmailDetail, campaignDetail]);

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
    return <div className="py-10 text-center text-gray-500">Không tìm thấy khách hàng</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => navigate('/customers')}
            className="rounded-lg p-2 text-gray-600 hover:bg-gray-100 shrink-0"
          >
            <HiOutlineArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-gray-900 truncate">{displayName}</h1>
            <p className="text-sm text-gray-500">Chi tiết khách hàng và hành trình theo chiến dịch</p>
          </div>
        </div>
        {selectedCampaignId ? (
          <button
            onClick={() => refreshSnapshot(selectedCampaignId)}
            className="btn btn-secondary btn-sm"
          >
            Làm mới số liệu
          </button>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <CustomerStatCard title="Số chiến dịch tham gia" value={customerStats.campaigns} icon={HiOutlineChartBar} />
        <CustomerStatCard title="Email đã nhận" value={customerStats.received} icon={HiOutlineInbox} colorClass="text-blue-600" />
        <CustomerStatCard title="Email đã mở" value={customerStats.opened} icon={HiOutlineEye} colorClass="text-green-600" />
        <CustomerStatCard title="Email đã nhấp" value={customerStats.clicked} icon={HiOutlineCursorClick} colorClass="text-orange-600" />
      </div>

      <div className="card">
        <div className="card-body">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Thông tin cơ bản</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div className="flex items-center gap-2 text-gray-700">
              <HiOutlineUser className="h-5 w-5 text-gray-400" />
              <span>{customer.fullName || '--'}</span>
            </div>
            <div className="flex items-center gap-2 text-gray-700">
              <HiOutlineMail className="h-5 w-5 text-gray-400" />
              <span>{customer.email || '--'}</span>
            </div>
            <div className="flex items-center gap-2 text-gray-700">
              <HiOutlinePhone className="h-5 w-5 text-gray-400" />
              <span>{customer.phone || '--'}</span>
            </div>
            <div className="flex items-center gap-2 text-gray-700">
              <HiOutlineCalendar className="h-5 w-5 text-gray-400" />
              <span>Tạo: {formatDateTime(customer.createdAt)}</span>
            </div>
            <div className="flex items-center gap-2 text-gray-700">
              <HiOutlineClock className="h-5 w-5 text-gray-400" />
              <span>Cập nhật: {formatDateTime(customer.updatedAt)}</span>
            </div>
            <div className="text-gray-700">
              <span className="font-medium">Nguồn:</span> {customer.customerSource || '--'}
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-body">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Danh sách chiến dịch tham gia</h2>
          {participations.length === 0 ? (
            <div className="py-8 text-center text-gray-500">Khách hàng này chưa tham gia chiến dịch nào</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Chiến dịch</th>
                    <th>Email nhận</th>
                    <th>Đã mở</th>
                    <th>Đã nhấp</th>
                    <th>Lần cuối hoạt động</th>
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
                        <div className="text-xs text-gray-500">Tham gia: {formatDateTime(item.joinedAt)}</div>
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
                          Chi tiết
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
          <h2 className="text-lg font-semibold text-gray-900">Chi tiết chiến dịch đã chọn</h2>

          {isLoadingCampaignDetail ? (
            <div className="py-8 text-center text-gray-500">Đang tải chi tiết chiến dịch...</div>
          ) : !campaignDetail ? (
            <div className="py-8 text-center text-gray-500">Chọn một chiến dịch để xem chi tiết</div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                  <p className="text-xs uppercase tracking-wide text-blue-600 font-medium">Theo chiến dịch</p>
                  <div className="mt-3 space-y-2">
                    <p className="text-sm text-gray-700">
                      <span className="font-medium">Người tham gia:</span> {campaignDetail?.summaries?.byCampaign?.participantCount || 0}
                    </p>
                    <p className="text-sm text-gray-700">
                      <span className="font-medium">Email nhận:</span> {campaignDetail?.summaries?.byCampaign?.emailReceivedCount || 0}
                    </p>
                    <p className="text-sm text-gray-700">
                      <span className="font-medium">Đã mở:</span> {campaignDetail?.summaries?.byCampaign?.emailOpenedCount || 0}
                    </p>
                    <p className="text-sm text-gray-700">
                      <span className="font-medium">Đã nhấp:</span> {campaignDetail?.summaries?.byCampaign?.emailClickedCount || 0}
                    </p>
                    <p className="text-sm text-gray-700">
                      <span className="font-medium">Đã mua:</span> {campaignDetail?.summaries?.byCampaign?.purchaseCount || 0}
                    </p>
                    <p className="text-sm text-gray-700">
                      <span className="font-medium">Để lại thông tin:</span> {campaignDetail?.summaries?.byCampaign?.interestedCount || 0}
                    </p>
                    <p className="text-sm text-gray-700">
                      <span className="font-medium">Mua sau click:</span> {campaignDetail?.summaries?.byCampaign?.attributedFromClickCount || 0}
                    </p>
                    <p className="text-sm text-gray-700">
                      <span className="font-medium">Doanh thu:</span> {formatMoney(campaignDetail?.summaries?.byCampaign?.revenue || 0)}
                    </p>
                  </div>
                </div>

                <div className="rounded-lg border border-purple-200 bg-purple-50 p-4">
                  <p className="text-xs uppercase tracking-wide text-purple-600 font-medium">Theo khách hàng</p>
                  <div className="mt-3 space-y-2">
                    <p className="text-sm text-gray-700">
                      <span className="font-medium">Số chiến dịch:</span> {campaignDetail?.summaries?.byCustomer?.campaignCount || 0}
                    </p>
                    <p className="text-sm text-gray-700">
                      <span className="font-medium">Email nhận:</span> {campaignDetail?.summaries?.byCustomer?.emailReceivedCount || 0}
                    </p>
                    <p className="text-sm text-gray-700">
                      <span className="font-medium">Đã mở:</span> {campaignDetail?.summaries?.byCustomer?.emailOpenedCount || 0}
                    </p>
                    <p className="text-sm text-gray-700">
                      <span className="font-medium">Đã nhấp:</span> {campaignDetail?.summaries?.byCustomer?.emailClickedCount || 0}
                    </p>
                    <p className="text-sm text-gray-700">
                      <span className="font-medium">Đã mua:</span> {campaignDetail?.summaries?.byCustomer?.purchaseCount || 0}
                    </p>
                    <p className="text-sm text-gray-700">
                      <span className="font-medium">Để lại thông tin:</span> {campaignDetail?.summaries?.byCustomer?.interestedCount || 0}
                    </p>
                    <p className="text-sm text-gray-700">
                      <span className="font-medium">Mua sau click:</span> {campaignDetail?.summaries?.byCustomer?.attributedFromClickCount || 0}
                    </p>
                    <p className="text-sm text-gray-700">
                      <span className="font-medium">Doanh thu:</span> {formatMoney(campaignDetail?.summaries?.byCustomer?.revenue || 0)}
                    </p>
                  </div>
                </div>

                <div className="rounded-lg border border-gray-300 bg-gray-50 p-4">
                  <p className="text-xs uppercase tracking-wide font-medium text-gray-600">Tổng thể hệ thống</p>
                  <div className="mt-3 space-y-2">
                    <p className="text-sm text-gray-700">
                      <span className="font-medium">Người tham gia:</span> {campaignDetail?.summaries?.overall?.participantCount || 0}
                    </p>
                    <p className="text-sm text-gray-700">
                      <span className="font-medium">Email nhận:</span> {campaignDetail?.summaries?.overall?.emailReceivedCount || 0}
                    </p>
                    <p className="text-sm text-gray-700">
                      <span className="font-medium">Đã mở:</span> {campaignDetail?.summaries?.overall?.emailOpenedCount || 0}
                    </p>
                    <p className="text-sm text-gray-700">
                      <span className="font-medium">Đã nhấp:</span> {campaignDetail?.summaries?.overall?.emailClickedCount || 0}
                    </p>
                    <p className="text-sm text-gray-700">
                      <span className="font-medium">Đã mua:</span> {campaignDetail?.summaries?.overall?.purchaseCount || 0}
                    </p>
                    <p className="text-sm text-gray-700">
                      <span className="font-medium">Để lại thông tin:</span> {campaignDetail?.summaries?.overall?.interestedCount || 0}
                    </p>
                    <p className="text-sm text-gray-700">
                      <span className="font-medium">Mua sau click:</span> {campaignDetail?.summaries?.overall?.attributedFromClickCount || 0}
                    </p>
                    <p className="text-sm text-gray-700">
                      <span className="font-medium">Doanh thu:</span> {formatMoney(campaignDetail?.summaries?.overall?.revenue || 0)}
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="mb-3 text-base font-medium text-gray-900">Hành trình email trong chiến dịch</h3>
                {campaignDetail.emails?.length ? (
                  <div className="overflow-x-auto">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Tên email</th>
                          <th>Gửi lúc</th>
                          <th>Đã mở</th>
                          <th>Đã nhấp</th>
                          <th>Trạng thái</th>
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
                                Tiêu đề: {decodeHtmlEntities(email.subject || '--')}
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
                                {email.openCount > 0 ? '✓ Đã mở' : 'Chưa mở'} - Xem chi tiết
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-sm text-gray-500">Chưa có dữ liệu email trong chiến dịch này.</div>
                )}
              </div>

              <div>
                <h3 className="mb-3 text-base font-medium text-gray-900">Khóa học đã mua/quan tâm từ chiến dịch</h3>
                {campaignDetail.purchases?.length ? (
                  <div className="overflow-x-auto">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Mã ĐH</th>
                          <th>Tên khóa học</th>
                          <th>Mã SP</th>
                          <th>Trạng thái</th>
                          <th>Giá trị</th>
                          <th>Thời gian mua</th>
                          <th>ID email gửi</th>
                          <th>Sau click email</th>
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
                                      displayStatus === 'Đã mua'
                                        ? 'bg-green-100 text-green-800'
                                        : displayStatus === 'Để lại thông tin'
                                          ? 'bg-yellow-100 text-yellow-800'
                                            : displayStatus.includes('nhấn link')
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
                                  Có
                                </span>
                              ) : (
                                <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
                                  Không rõ
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-sm text-gray-500">Chưa có dữ liệu mua hàng từ chiến dịch này.</div>
                )}
              </div>

              <div>
                <h3 className="mb-3 text-base font-medium text-gray-900">Timeline hành trình khách hàng</h3>
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
                  <div className="text-sm text-gray-500">Chưa có dữ liệu hành trình cho chiến dịch này.</div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-body">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Khóa học khách hàng đã mua/quan tâm</h2>
          {customer.purchases?.length ? (
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Đơn hàng</th>
                    <th>Khóa học</th>
                    <th>Trạng thái</th>
                    <th>Giá trị</th>
                    <th>Chiến dịch</th>
                    <th>Sau click email</th>
                    <th>Thời gian mua</th>
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
                                displayStatus === 'Đã mua'
                                  ? 'bg-green-100 text-green-800'
                                  : displayStatus === 'Để lại thông tin'
                                    ? 'bg-yellow-100 text-yellow-800'
                                    : displayStatus.includes('nhấn link')
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
                            Có
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
                            Chưa rõ
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
            <div className="py-6 text-sm text-gray-500">Khách hàng chưa có dữ liệu mua khóa học.</div>
          )}
        </div>
      </div>

      <Modal
        isOpen={Boolean(selectedEmailDetail)}
        onClose={() => setSelectedEmailDetail(null)}
        title="Chi tiết email và hành trình"
        size="2xl"
      >
        {selectedEmailDetail ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <p className="text-sm text-gray-500">Tên email</p>
              <p className="font-medium text-gray-900">
                {decodeHtmlEntities(selectedEmailDetail.emailTemplateName || selectedEmailDetail.subject || '--')}
              </p>
              <p className="mt-2 text-sm text-gray-500">Tiêu đề gửi</p>
              <p className="font-medium text-gray-900">{decodeHtmlEntities(selectedEmailDetail.subject || '--')}</p>
              <p className="mt-2 text-sm text-gray-500">
                Gửi lúc: <span className="font-medium text-gray-800">{formatDateTime(selectedEmailDetail.sentAt)}</span>
              </p>
            </div>

            <div>
              <h4 className="mb-2 font-medium text-gray-900">Nội dung email</h4>
              {selectedEmailContentHtml ? (
                <div
                  className="rounded-lg border border-gray-200 bg-white p-4 prose max-w-none"
                  dangerouslySetInnerHTML={{ __html: selectedEmailContentHtml }}
                />
              ) : (
                <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-700 whitespace-pre-wrap">
                  {decodeHtmlEntities(selectedEmailDetail.bodyText || 'Không có nội dung email.')}
                </div>
              )}
            </div>

            <div>
              <h4 className="mb-2 font-medium text-gray-900">Timeline hành trình</h4>
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
                <div className="text-sm text-gray-500">Chưa có timeline cho email này.</div>
              )}
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
};

export default CustomerDetail;
