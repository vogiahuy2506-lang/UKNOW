import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useI18n } from '../../i18n';
import customerApiService from '../../features/customers/services/customerApi.service';
import {
  formatDateOnly,
  getCustomerDisplayName,
} from '../../features/customers/utils/customerDisplay.helpers';
import {
  getCampaignStatusMeta,
  resolveCampaignStatus,
} from '../../features/customers/utils/campaignCustomerStatus';
import {
  HiOutlineArrowLeft,
  HiOutlineSearch,
  HiOutlineMail,
  HiOutlinePhone,
  HiOutlineChevronLeft,
  HiOutlineChevronRight,
  HiOutlineCalendar,
  HiOutlineUser,
  HiOutlineEye,
} from 'react-icons/hi';
import { getCampaignTypeMeta } from '../../utils/campaignTypeDisplay';
import {
  CustomerDetailModal,
  JourneyModal,
} from '../../features/customers/components/CampaignCustomerModals';
import ZaloGroupMessageList from '../../features/customers/components/ZaloGroupMessageList';

// ─── helpers ────────────────────────────────────────────────────────────────

const getDisplayName = getCustomerDisplayName;

const getInitial = (c) => {
  const name = getDisplayName(c);
  return name ? name[0].toUpperCase() : '?';
};

const formatDate = formatDateOnly;


const CustomerStatusBadge = ({ status, campaignType }) => {
  const meta = getCampaignStatusMeta(status, { campaignType });
  if (!meta) return null;
  return <span className={`badge ${meta.cls}`}>{meta.label}</span>;
};

// ─── Main page ───────────────────────────────────────────────────────────────

const CampaignCustomers = () => {
  const { t } = useI18n();
  const { campaignId } = useParams();
  const navigate = useNavigate();

  const [campaign,       setCampaign]      = useState(null);
  const [customers,      setCustomers]     = useState([]);
  const [isLoading,      setIsLoading]     = useState(true);
  const [pendingSearch,  setPendingSearch] = useState('');
  const [search,         setSearch]        = useState('');
  const [pagination,     setPagination]    = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });

  const [selectedCustomer,   setSelectedCustomer]   = useState(null);
  const [showCustomerModal,  setShowCustomerModal]  = useState(false);
  const [showJourneyModal,   setShowJourneyModal]   = useState(false);
  const [activeTab, setActiveTab] = useState('customers');
  const [groupMessages, setGroupMessages] = useState([]);
  const [groupMessagesLoading, setGroupMessagesLoading] = useState(false);
  const [groupMessagesPagination, setGroupMessagesPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1,
  });
  const isZaloGroupCampaign = campaign?.campaignType === 'zalo_group';


  useEffect(() => {
    if (!campaignId) return;
    customerApiService.getCampaignById(campaignId)
      .then((res) => setCampaign(res.data?.data || null))
      .catch(() => toast.error(t('campaignCustomers.loadCampaignFailed')));
  }, [campaignId]);

  useEffect(() => {
    if (!isZaloGroupCampaign) {
      setActiveTab('customers');
      return;
    }
    if (activeTab !== 'customers' && activeTab !== 'messages') {
      setActiveTab('customers');
    }
  }, [activeTab, isZaloGroupCampaign]);

  const fetchCustomers = useCallback(async (page, currentSearch) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page,
        limit: 20,
        campaignId,
        ...(currentSearch && { search: currentSearch }),
      });
      const res = await customerApiService.getCustomersByQueryString(params.toString());
      const payload = res.data?.data || {};
      setCustomers(payload.items || []);
      setPagination((p) => ({
        ...p,
        page,
        total:      payload.pagination?.total      ?? 0,
        totalPages: payload.pagination?.totalPages ?? 1,
      }));
    } catch {
      toast.error(t('campaignCustomers.loadCustomersFailed'));
    } finally {
      setIsLoading(false);
    }
  }, [campaignId]);

  const fetchGroupMessages = useCallback(async (page = 1) => {
    setGroupMessagesLoading(true);
    try {
      const res = await customerApiService.getCampaignZaloGroupMessages(campaignId, {
        page,
        limit: groupMessagesPagination.limit,
      });
      const payload = res.data?.data || {};
      setGroupMessages(payload.items || []);
      setGroupMessagesPagination((prev) => ({
        ...prev,
        page,
        total: payload.pagination?.total ?? 0,
        totalPages: payload.pagination?.totalPages ?? 1,
      }));
    } catch {
      toast.error(t('campaignCustomers.loadMessagesFailed'));
    } finally {
      setGroupMessagesLoading(false);
    }
  }, [campaignId, groupMessagesPagination.limit]);

  useEffect(() => {
    if (isZaloGroupCampaign && activeTab !== 'customers') return;
    fetchCustomers(pagination.page, search);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId, pagination.page, search, activeTab, isZaloGroupCampaign]);

  useEffect(() => {
    if (!isZaloGroupCampaign || activeTab !== 'messages') return;
    fetchGroupMessages(groupMessagesPagination.page);
  }, [activeTab, fetchGroupMessages, groupMessagesPagination.page, isZaloGroupCampaign]);

  const handleSearch = (e) => {
    e.preventDefault();
    setSearch(pendingSearch);
    setPagination((p) => ({ ...p, page: 1 }));
  };

  const openCustomerModal = (c) => { setSelectedCustomer(c); setShowCustomerModal(true); };
  const openJourneyModal  = (c) => { setSelectedCustomer(c); setShowJourneyModal(true);  };
  const closeCustomerModal = useCallback(() => setShowCustomerModal(false), []);
  const closeJourneyModal  = useCallback(() => setShowJourneyModal(false),  []);



  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/app/customers')}
          className="p-2 rounded-lg hover:bg-gray-100 shrink-0 transition-colors"
          aria-label={t('campaignCustomers.goBackAriaLabel')}
        >
          <HiOutlineArrowLeft className="w-5 h-5" />
        </button>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold text-gray-900 truncate">
              {campaign?.campaignName ?? t('customers.loadingDetail')}
            </h1>
            {campaign?.campaignType ? (
              <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                getCampaignTypeMeta(campaign.campaignType).className
              }`}>
                {getCampaignTypeMeta(campaign.campaignType).label}
              </span>
            ) : null}
          </div>
          <p className="text-sm text-gray-500 mt-0.5">
            {t('campaignCustomers.customerListTitle')}
          </p>
        </div>
      </div>

      {isZaloGroupCampaign && (
        <div className="card p-2 inline-flex gap-1">
          <button
            type="button"
            onClick={() => setActiveTab('customers')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'customers'
                ? 'bg-primary-100 text-primary-700'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {t('campaignCustomers.customerListTab')}
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('messages');
              setGroupMessagesPagination((prev) => ({ ...prev, page: 1 }));
            }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'messages'
                ? 'bg-primary-100 text-primary-700'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {t('campaignCustomers.messagesTab')}
          </button>
        </div>
      )}

      {/* Search bar */}
      {(!isZaloGroupCampaign || activeTab === 'customers') && (
        <div className="card p-4">
          <form onSubmit={handleSearch} className="flex gap-3">
            <div className="flex items-center flex-1 min-w-0 rounded-lg border border-gray-300 bg-white transition-base focus-within:border-primary-500 focus-within:ring-1 focus-within:ring-primary-500">
              <span className="pl-3 pr-2 text-gray-400 pointer-events-none shrink-0">
                <HiOutlineSearch className="w-4 h-4" />
              </span>
              <input
                type="text"
                value={pendingSearch}
                onChange={(e) => setPendingSearch(e.target.value)}
                placeholder={t('campaignCustomers.searchCustomer')}
                className="w-full py-2 pr-3 text-sm bg-transparent border-0 focus:outline-none"
              />
            </div>
            <button type="submit" className="btn btn-secondary shrink-0">
              {t('campaignCustomers.search')}
            </button>
          </form>
        </div>
      )}

      {isZaloGroupCampaign && activeTab === 'messages' ? (
        <ZaloGroupMessageList
          loading={groupMessagesLoading}
          messages={groupMessages}
          pagination={groupMessagesPagination}
          onChangePage={(page) => setGroupMessagesPagination((prev) => ({ ...prev, page }))}
        />
      ) : (
        <>
          {/* Customer table */}
          <div className="card">
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('campaignCustomers.customer')}</th>
                    <th>{t('campaignCustomers.email')}</th>
                    <th>{t('campaignCustomers.phone')}</th>
                    <th>{t('campaignCustomers.status')}</th>
                    <th>{t('campaignCustomers.joinDate')}</th>
                    <th className="text-right">{t('campaignCustomers.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan={6} className="py-10 text-center">
                        <div className="spinner w-8 h-8 mx-auto" />
                      </td>
                    </tr>
                  ) : customers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-gray-400">
                        {t('customers.noCustomersInCampaign')}
                      </td>
                    </tr>
                  ) : (
                    customers.map((c) => (
                      <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                        <td>
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-primary-100 flex items-center justify-center shrink-0">
                              <span className="font-semibold text-sm text-primary-600">{getInitial(c)}</span>
                            </div>
                            <span className="font-medium text-gray-900 truncate max-w-[180px]">
                              {getDisplayName(c) || '—'}
                            </span>
                          </div>
                        </td>
                        <td>
                          <div className="flex items-center gap-1.5 text-gray-600 min-w-0">
                            <HiOutlineMail className="w-4 h-4 text-gray-400 shrink-0" />
                            <span className="truncate max-w-[180px]">{c.email || '--'}</span>
                          </div>
                        </td>
                        <td>
                          {c.phone ? (
                            <div className="flex items-center gap-1.5 text-gray-600">
                              <HiOutlinePhone className="w-4 h-4 text-gray-400 shrink-0" />
                              {c.phone}
                            </div>
                          ) : (
                            <span className="text-gray-400">--</span>
                          )}
                        </td>
                        <td>
                          <CustomerStatusBadge
                            status={resolveCampaignStatus(c)}
                            campaignType={campaign?.campaignType}
                          />
                        </td>
                        <td>
                          <div className="flex items-center gap-1.5 text-sm text-gray-500">
                            <HiOutlineCalendar className="w-4 h-4 text-gray-400 shrink-0" />
                            {formatDate(c.createdAt)}
                          </div>
                        </td>
                        <td>
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => openCustomerModal(c)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-700 bg-white hover:bg-gray-50 hover:border-gray-300 transition-colors whitespace-nowrap"
                            >
                              <HiOutlineUser className="w-3.5 h-3.5" />
                              {t('campaignCustomers.detail')}
                            </button>
                            {!isZaloGroupCampaign && (
                              <button
                                onClick={() => openJourneyModal(c)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-primary-200 text-primary-700 bg-primary-50 hover:bg-primary-100 hover:border-primary-300 transition-colors whitespace-nowrap"
                              >
                                <HiOutlineEye className="w-3.5 h-3.5" />
                                {t('campaignCustomers.journey')}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {pagination.totalPages > 1 && (
              <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
                <p className="text-sm text-gray-500">
                  {t('campaignCustomers.paginationInfo', {
                    start: (pagination.page - 1) * 20 + 1,
                    end: Math.min(pagination.page * 20, pagination.total),
                    total: pagination.total,
                  })}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPagination((p) => ({ ...p, page: p.page - 1 }))}
                    disabled={pagination.page === 1}
                    className="btn btn-secondary btn-sm disabled:opacity-50"
                  >
                    <HiOutlineChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-sm px-1 text-gray-600">
                    {pagination.page} / {pagination.totalPages}
                  </span>
                  <button
                    onClick={() => setPagination((p) => ({ ...p, page: p.page + 1 }))}
                    disabled={pagination.page === pagination.totalPages}
                    className="btn btn-secondary btn-sm disabled:opacity-50"
                  >
                    <HiOutlineChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Modals */}
      <CustomerDetailModal
        customer={selectedCustomer}
        campaignId={campaignId}
        isOpen={showCustomerModal}
        onClose={closeCustomerModal}
      />
      <JourneyModal
        customer={selectedCustomer}
        campaignId={campaignId}
        isOpen={!isZaloGroupCampaign && showJourneyModal}
        onClose={closeJourneyModal}
      />
    </div>
  );
};

export default CampaignCustomers;
