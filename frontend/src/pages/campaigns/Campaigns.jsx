import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useI18n } from '../../i18n';
import PageHeader from '../../components/common/PageHeader';
import {
  HiOutlinePlus,
  HiOutlineSearch,
  HiOutlineDotsVertical,
  HiOutlinePlay,
  HiOutlinePause,
  HiOutlineTrash,
  HiOutlinePencil,
  HiOutlineDuplicate,
  HiOutlineMail,
  HiOutlineChat,
  HiOutlineCheckCircle,
  HiOutlineXCircle,
  HiOutlineShoppingBag,
  HiOutlineClock,
  HiOutlineEye,
  HiOutlineRefresh,
  HiOutlineViewList,
  HiOutlineUserGroup,
  HiOutlineSparkles,
  HiOutlineX,
  HiCheck,
} from 'react-icons/hi';
import { FaTelegramPlane, FaWhatsapp } from 'react-icons/fa';
import { getCampaignTypeMeta } from '../../utils/campaignTypeDisplay';
import { formatCampaignDateTime } from '../../features/campaigns/utils/campaignDateTime.helpers';
import { getActiveRunPause, getRunPauseI18nKey } from '../../features/campaigns/utils/campaignQuotaPause.helpers';
import { useAuthStore } from '../../stores/authStore';
import { useChannelEntitlements } from '../../hooks/queries/useChannelEntitlements';
import campaignApiService from '../../features/campaigns/services/campaignApi.service';
import CampaignMarketplaceModal from '../../components/campaigns/CampaignMarketplaceModal';
import CampaignShareModal from '../../features/campaigns/components/CampaignShareModal';
import CampaignDuplicateModal from '../../features/campaigns/components/CampaignDuplicateModal';
import useCampaignRunController from '../../features/campaigns/hooks/useCampaignRunController';
import useCampaignRunDerivedData from '../../features/campaigns/hooks/useCampaignRunDerivedData';
import CampaignRunLogsPanel from '../../features/campaigns/components/CampaignRunLogsPanel';
import CampaignRunModals from '../../features/campaigns/components/CampaignRunModals';
import CampaignSchedulesTable from '../../features/campaigns/components/CampaignSchedulesTable';

/**
 * Xác định chiến dịch có đang chạy hay không dựa trên số lượt chạy đang thực thi.
 *
 * Luồng hoạt động:
 * 1. Ép kiểu `runningCount` về number để tránh lệch kiểu dữ liệu từ API.
 * 2. Trả về `true` khi số lượt chạy > 0, ngược lại trả về `false`.
 *
 * @param {object} campaign Dữ liệu chiến dịch đang hiển thị trong bảng.
 * @returns {boolean} Trạng thái chiến dịch có đang chạy hay không.
 */
const isCampaignCurrentlyRunning = (campaign) => Number(campaign?.runningCount || 0) > 0;

const Campaigns = () => {
  const { t } = useI18n();
  const user = useAuthStore((state) => state.user);
  const activeContext = useAuthStore((state) => state.activeContext) || user?.activeContext;
  const isAdmin = String(user?.roleCode || '').trim().toLowerCase() === 'admin';
  const isOwner = !activeContext || activeContext.type === 'self';
  const canRun = activeContext?.type !== 'employee' || activeContext?.permissions?.campaigns_run === true;
  const canEditSchedules = activeContext?.type !== 'employee' || activeContext?.permissions?.campaigns_create === true;

  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  const activeTab = searchParams.get('tab') === 'schedules' ? 'schedules' : 'campaigns';
  const rawStateParam = searchParams.get('state') || 'all';
  const stateFilter = ['all', 'running', 'scheduled', 'inactive', 'draft'].includes(rawStateParam) ? rawStateParam : 'all';

  const [campaigns, setCampaigns] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 1 });
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [originTab, setOriginTab] = useState('self_created'); // 'self_created' | 'marketplace_purchased' | 'shared_with_me'
  const [scheduledCampaignSearch, setScheduledCampaignSearch] = useState('');
  const [activeMenu, setActiveMenu] = useState(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const menuButtonRefs = useRef({});
  const [duplicateModal, setDuplicateModal] = useState({ show: false, campaign: null });
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isCreatingCampaign, setIsCreatingCampaign] = useState(false);
  const [showShareModal, setShowShareModal] = useState({ show: false, campaign: null });
  const [approveModal, setApproveModal] = useState({ show: false, campaign: null });
  const [isApproving, setIsApproving] = useState(false);
  const [rejectModal, setRejectModal] = useState({ show: false, campaign: null, reason: '' });
  const [isRejecting, setIsRejecting] = useState(false);
  const [marketplaceModal, setMarketplaceModal] = useState({ show: false, campaign: null });
  const [createCampaignForm, setCreateCampaignForm] = useState({
    campaignName: '',
    campaignType: 'email',
  });
  // PLAN_PR7_NODE_TELEGRAM_TRINH_DUNG_2026-09-28 Việc 4 — nguồn cờ: gọi 1 lần khi mở trang danh
  // sách chiến dịch. Lỗi/404 (BE cũ) -> coi như tắt (mặc định false, không có nút Telegram).
  const [telegramChannelEnabled, setTelegramChannelEnabled] = useState(false);
  // PLAN_WHATSAPP_DAY_DU_2026-09-29 PR-W4b — cùng nguồn cờ /campaigns/channels (key 'whatsapp').
  const [whatsappChannelEnabled, setWhatsappChannelEnabled] = useState(false);
  // P12 — gói không có kênh Zalo: modal tạo chiến dịch bỏ 2 lựa chọn Zalo (bộ lọc loại vẫn giữ để tìm chiến dịch cũ).
  const { zalo: zaloEntitled } = useChannelEntitlements();

  const createCampaignChannels = [
    {
      id: 'email',
      name: t('campaigns.email'),
      icon: HiOutlineMail,
      iconBg: 'bg-blue-50 text-blue-600 border border-blue-100/80',
      selectedIconBg: 'bg-blue-600 text-white',
      visible: true,
    },
    {
      id: 'zalo',
      name: t('campaigns.zaloPersonal'),
      icon: HiOutlineChat,
      iconBg: 'bg-sky-50 text-sky-600 border border-sky-100/80',
      selectedIconBg: 'bg-sky-600 text-white',
      visible: zaloEntitled,
    },
    {
      id: 'zalo_group',
      name: t('campaigns.zaloGroup'),
      icon: HiOutlineUserGroup,
      iconBg: 'bg-violet-50 text-violet-600 border border-violet-100/80',
      selectedIconBg: 'bg-violet-600 text-white',
      visible: zaloEntitled,
    },
    {
      id: 'telegram',
      name: t('campaigns.telegram'),
      icon: FaTelegramPlane,
      iconBg: 'bg-sky-50 text-sky-500 border border-sky-100/80',
      selectedIconBg: 'bg-sky-500 text-white',
      visible: telegramChannelEnabled,
    },
    {
      id: 'telegram_group',
      name: t('campaigns.telegramGroup'),
      icon: FaTelegramPlane,
      iconBg: 'bg-indigo-50 text-indigo-600 border border-indigo-100/80',
      selectedIconBg: 'bg-indigo-600 text-white',
      visible: telegramChannelEnabled,
    },
    {
      id: 'whatsapp',
      name: t('campaigns.whatsapp'),
      icon: FaWhatsapp,
      iconBg: 'bg-emerald-50 text-emerald-600 border border-emerald-100/80',
      selectedIconBg: 'bg-emerald-600 text-white',
      visible: whatsappChannelEnabled,
    },
  ].filter((c) => Boolean(c.visible));

  const runController = useCampaignRunController({
    onCampaignsChanged: () => fetchCampaigns(),
  });

  const { workspaceLogs, filteredSchedules } = useCampaignRunDerivedData({
    selectedRunDetail: runController.selectedRunDetail,
    flowOrderByNodeId: runController.flowOrderByNodeId,
    schedules: runController.schedules,
    scheduledCampaignSearch,
  });

  useEffect(() => {
    fetchCampaigns();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ refetch theo filter/page/origin/state
  }, [pagination.page, statusFilter, typeFilter, originTab, stateFilter]);

  useEffect(() => {
    if (!location.state?.openCreateCampaignModal) return;
    openCreateModal();
    navigate(location.pathname, { replace: true, state: {} });
  }, [location.pathname, location.state, navigate]);

  useEffect(() => {
    let cancelled = false;
    campaignApiService.getChannels()
      .then((res) => {
        if (cancelled) return;
        const channels = res?.data?.data?.channels;
        setTelegramChannelEnabled(Array.isArray(channels) && channels.some((c) => c.key === 'telegram'));
        setWhatsappChannelEnabled(Array.isArray(channels) && channels.some((c) => c.key === 'whatsapp'));
      })
      .catch(() => {
        if (!cancelled) {
          setTelegramChannelEnabled(false);
          setWhatsappChannelEnabled(false);
        }
      });
    return () => { cancelled = true; };
  }, []);

  const fetchCampaigns = async () => {
    setIsLoading(true);
    try {
      const stateQuery = stateFilter !== 'all' ? stateFilter : undefined;
      if (originTab === 'shared_with_me') {
        // Fetch shared campaigns
        const params = {
          page: pagination.page,
          limit: 10,
          ...(search && { search }),
          ...(statusFilter && { status: statusFilter }),
          ...(stateQuery && { state: stateQuery }),
        };
        const response = await campaignApiService.getSharedWithMe(params);
        setCampaigns(response.data.data.items);
        setPagination(response.data.data.pagination);
      } else {
        const params = {
          page: pagination.page,
          limit: 10,
          origin: originTab,
          ...(search && { search }),
          ...(statusFilter && { status: statusFilter }),
          ...(typeFilter && { type: typeFilter }),
          ...(stateQuery && { state: stateQuery }),
        };

        const response = await campaignApiService.getCampaigns(params);
        setCampaigns(response.data.data.items);
        setPagination(response.data.data.pagination);
      }
    } catch (error) {
      toast.error(t('campaigns.loadFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    setPagination((prev) => ({ ...prev, page: 1 }));
    fetchCampaigns();
  };

  const handleTabChange = (tabKey) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (tabKey === 'schedules') {
        next.set('tab', 'schedules');
      } else {
        next.delete('tab');
      }
      return next;
    });
    if (tabKey !== 'campaigns') {
      runController.closeCampaignLogs();
    }
  };

  const handleStateChange = (newState) => {
    setPagination((prev) => ({ ...prev, page: 1 }));
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (newState && newState !== 'all') {
        next.set('state', newState);
      } else {
        next.delete('state');
      }
      return next;
    });
  };

  const handlePublish = async (id) => {
    try {
      await campaignApiService.publishCampaign(id);
      toast.success(t('campaigns.activateSuccess'));
      fetchCampaigns();
    } catch (error) {
      // Ưu tiên lý do cụ thể từ server. Preflight trả về những câu nói rõ phải sửa gì
      // ("Chiến dịch không có node gửi tin nhắn nào."); nuốt chúng rồi hiện câu chung chung
      // khiến người dùng không biết vì sao hỏng — đúng thứ Đợt A sinh ra để chấm dứt.
      const serverMessage = String(error?.response?.data?.message || '').trim();
      toast.error(serverMessage || t('campaigns.activateFailed'));
    }
    setActiveMenu(null);
  };

  const handlePause = async (id) => {
    const selectedCampaign = campaigns.find((campaign) => Number(campaign.id) === Number(id));
    const hasRunningCampaignRun = isCampaignCurrentlyRunning(selectedCampaign);

    if (hasRunningCampaignRun) {
      toast.error(t('campaigns.runningCampaignBlock'));
      setActiveMenu(null);
      return;
    }

    try {
      await campaignApiService.pauseCampaign(id);
      toast.success(t('campaigns.pauseSuccess'));
      fetchCampaigns();
    } catch (error) {
      toast.error(t('campaigns.pauseFailed'));
    }
    setActiveMenu(null);
  };

  const handleDelete = async (id) => {
    if (!confirm(t('campaigns.confirmDelete'))) return;

    try {
      await campaignApiService.deleteCampaign(id);
      toast.success(t('campaigns.deleteSuccess'));
      fetchCampaigns();
    } catch (error) {
      toast.error(t('campaigns.deleteFailed'));
    }
    setActiveMenu(null);
  };

  const openDuplicateModal = (campaign) => {
    setDuplicateModal({ show: true, campaign });
    setActiveMenu(null);
  };

  const closeDuplicateModal = () => {
    setDuplicateModal({ show: false, campaign: null });
  };

  // Share modal handlers
  const openShareModal = (campaign) => {
    setShowShareModal({ show: true, campaign });
    setActiveMenu(null);
  };

  const closeShareModal = () => {
    setShowShareModal({ show: false, campaign: null });
  };

  const handleApprove = async () => {
    if (!approveModal.campaign) return;
    setIsApproving(true);
    try {
      await campaignApiService.approveCampaign(approveModal.campaign.id);
      toast.success(t('campaigns.approveSuccess'));
      setApproveModal({ show: false, campaign: null });
      fetchCampaigns();
    } catch (error) {
      toast.error(error.response?.data?.message || t('campaigns.approveFailed'));
    } finally {
      setIsApproving(false);
    }
  };

  const handleReject = async () => {
    if (!rejectModal.campaign) return;
    setIsRejecting(true);
    try {
      await campaignApiService.rejectCampaign(rejectModal.campaign.id, {
        reason: rejectModal.reason?.trim() || undefined,
      });
      toast.success(t('campaigns.rejectSuccess'));
      setRejectModal({ show: false, campaign: null, reason: '' });
      fetchCampaigns();
    } catch (error) {
      toast.error(error.response?.data?.message || t('campaigns.rejectFailed'));
    } finally {
      setIsRejecting(false);
    }
  };

  const openCreateModal = () => {
    setCreateCampaignForm({
      campaignName: '',
      campaignType: 'email',
    });
    setShowCreateModal(true);
  };

  const closeCreateModal = () => {
    setShowCreateModal(false);
  };

  const handleCreateCampaign = async () => {
    if (!createCampaignForm.campaignName.trim()) {
      toast.error(t('campaigns.enterCampaignName'));
      return;
    }

    try {
      setIsCreatingCampaign(true);
      const response = await campaignApiService.createCampaign({
        campaignName: createCampaignForm.campaignName.trim(),
        description: '',
        campaignType: createCampaignForm.campaignType,
        flowJson: { nodes: [], edges: [] },
        nodes: [],
        connections: [],
      });
      const createdCampaignId = response.data?.data?.id;
      if (!createdCampaignId) {
        throw new Error(t('errors.serverError'));
      }
      setShowCreateModal(false);
      navigate(`/app/campaigns/${createdCampaignId}/builder`);
      toast.success(t('campaigns.createSuccess'));
    } catch (error) {
      if (!error._upgradeToastShown) {
        toast.error(error.response?.data?.message || t('campaigns.createFailed'));
      }
    } finally {
      setIsCreatingCampaign(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        icon={HiOutlineViewList}
        title={t('campaigns.title')}
        subtitle={
          isAdmin
            ? t('campaigns.adminDescription')
            : t('campaigns.userDescription')
        }
        actions={
          activeTab === 'campaigns' && originTab === 'self_created' && (
            <button
              onClick={openCreateModal}
              className="btn btn-primary"
            >
              <HiOutlinePlus className="w-5 h-5 mr-2" />
              {t('campaigns.create')}
            </button>
          )
        }
      />

      {/* Main Tabs: Chiến dịch (?tab=campaigns) vs Lịch chạy (?tab=schedules) */}
      <div className="flex gap-6 border-b border-gray-200">
        <button
          type="button"
          onClick={() => handleTabChange('campaigns')}
          className={`pb-3 font-medium text-sm transition-colors border-b-2 -mb-px flex items-center gap-2 ${
            activeTab === 'campaigns'
              ? 'border-orange-500 text-orange-600 font-semibold'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <HiOutlineViewList className="w-4 h-4" aria-hidden="true" />
          <span>{t('campaigns.tabCampaigns')}</span>
        </button>
        <button
          type="button"
          onClick={() => handleTabChange('schedules')}
          className={`pb-3 font-medium text-sm transition-colors border-b-2 -mb-px flex items-center gap-2 ${
            activeTab === 'schedules'
              ? 'border-orange-500 text-orange-600 font-semibold'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <HiOutlineClock className="w-4 h-4" aria-hidden="true" />
          <span>{t('campaigns.tabSchedules')}</span>
        </button>
      </div>

      {activeTab === 'schedules' ? (
        <CampaignSchedulesTable
          schedules={runController.schedules}
          filteredSchedules={filteredSchedules}
          scheduledCampaignSearch={scheduledCampaignSearch}
          onScheduledCampaignSearchChange={setScheduledCampaignSearch}
          isCampaignRunningById={runController.isCampaignRunningById}
          getWeeklyDayLabel={runController.getWeeklyDayLabel}
          getWeeklyDayFromCron={runController.getWeeklyDayFromCron}
          getScheduleTypeLabel={runController.getScheduleTypeLabel}
          getScheduleStatusClassName={runController.getScheduleStatusClassName}
          getScheduleStatusLabel={runController.getScheduleStatusLabel}
          isReadonlyOnceSchedule={runController.isReadonlyOnceSchedule}
          onOpenScheduleDetailModal={runController.openScheduleDetailModal}
          onDeleteSchedule={runController.handleDeleteSchedule}
          onToggleSchedule={runController.handleToggleSchedule}
          canEdit={canEditSchedules}
        />
      ) : (
        <>
          {/* Subheader Toolbar: Origin Selector + Operational State Pills */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            {/* Origin Tabs */}
            <div className="inline-flex items-center p-1 bg-gray-100/90 rounded-xl border border-gray-200/60 w-fit">
              <button
                type="button"
                onClick={() => {
                  setOriginTab('self_created');
                  setPagination((prev) => ({ ...prev, page: 1 }));
                }}
                className={`px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                  originTab === 'self_created'
                    ? 'bg-white text-gray-900 font-semibold shadow-xs ring-1 ring-gray-200/80'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {t('campaigns.selfCreated') || 'Tự tạo'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setOriginTab('marketplace_purchased');
                  setPagination((prev) => ({ ...prev, page: 1 }));
                }}
                className={`px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                  originTab === 'marketplace_purchased'
                    ? 'bg-white text-gray-900 font-semibold shadow-xs ring-1 ring-gray-200/80'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {t('campaigns.purchased') || 'Đã mua từ Marketplace'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setOriginTab('shared_with_me');
                  setPagination((prev) => ({ ...prev, page: 1 }));
                }}
                className={`px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                  originTab === 'shared_with_me'
                    ? 'bg-white text-gray-900 font-semibold shadow-xs ring-1 ring-gray-200/80'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {t('campaigns.sharedWithMe') || 'Được chia sẻ'}
              </button>
            </div>

            {/* Operational State Filter Pills (?state=) */}
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                { key: 'all', label: t('campaigns.operationAll') },
                { key: 'running', label: t('campaigns.operationRunning'), dot: 'bg-emerald-500' },
                { key: 'scheduled', label: t('campaigns.operationScheduled'), dot: 'bg-blue-500' },
                { key: 'inactive', label: t('campaigns.operationInactive'), dot: 'bg-amber-500' },
                { key: 'draft', label: t('campaigns.operationDraft'), dot: 'bg-gray-400' },
              ].map((item) => {
                const isSelected = stateFilter === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => handleStateChange(item.key)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                      isSelected
                        ? 'bg-orange-500 text-white shadow-xs font-semibold'
                        : 'bg-gray-100 hover:bg-gray-200/80 text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    {item.dot && !isSelected && (
                      <span className={`w-1.5 h-1.5 rounded-full ${item.dot}`} aria-hidden="true" />
                    )}
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Filters Bar: Search + Status + Type in a single neat row */}
          <div className="bg-white rounded-xl border border-gray-200 p-2.5 sm:p-3 shadow-xs flex flex-col md:flex-row items-stretch md:items-center gap-2.5">
            {/* Search */}
            <form onSubmit={handleSearch} className="flex-1 min-w-[200px]">
              <div className="relative flex items-center">
                <span className="absolute left-3 flex items-center text-gray-400 pointer-events-none" aria-hidden="true">
                  <HiOutlineSearch className="w-4 h-4" />
                </span>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t('campaigns.searchPlaceholder')}
                  className="w-full pl-9 pr-8 py-2 text-sm bg-gray-50/50 hover:bg-white focus:bg-white border border-gray-200 rounded-lg text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/10 transition-all"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearch('');
                      fetchCampaigns(1, statusFilter, '', typeFilter, stateFilter);
                    }}
                    className="absolute right-2.5 text-gray-400 hover:text-gray-600 p-0.5 rounded-full hover:bg-gray-200/60 transition-colors"
                  >
                    <HiOutlineX className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </form>

            {/* Status & Type Dropdowns */}
            <div className="flex items-center gap-2 shrink-0">
              {/* Status filter */}
              <div className="w-full sm:w-44">
                <select
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    setPagination((prev) => ({ ...prev, page: 1 }));
                  }}
                  className="w-full px-3 py-2 text-sm bg-gray-50/50 hover:bg-white focus:bg-white border border-gray-200 rounded-lg text-gray-700 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/10 transition-all cursor-pointer"
                >
                  <option value="">{t('campaigns.allStatuses')}</option>
                  <option value="pending_owner_approval">{t('campaigns.pendingOwnerApproval')}</option>
                  <option value="draft">{t('campaigns.draft')}</option>
                  <option value="active">{t('campaigns.active')}</option>
                  <option value="paused">{t('campaigns.paused')}</option>
                </select>
              </div>

              {/* Type filter */}
              <div className="w-full sm:w-40">
                <select
                  value={typeFilter}
                  onChange={(e) => {
                    setTypeFilter(e.target.value);
                    setPagination((prev) => ({ ...prev, page: 1 }));
                  }}
                  className="w-full px-3 py-2 text-sm bg-gray-50/50 hover:bg-white focus:bg-white border border-gray-200 rounded-lg text-gray-700 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/10 transition-all cursor-pointer"
                >
                  <option value="">{t('campaigns.allTypes')}</option>
                  <option value="email">{t('campaigns.email')}</option>
                  <option value="zalo">{t('campaigns.zaloPersonal')}</option>
                  <option value="zalo_group">{t('campaigns.zaloGroup')}</option>
                  {telegramChannelEnabled && <option value="telegram">{t('campaigns.telegram')}</option>}
                  {telegramChannelEnabled && <option value="telegram_group">{t('campaigns.telegramGroup')}</option>}
                  {whatsappChannelEnabled && <option value="whatsapp">{t('campaigns.whatsapp')}</option>}
                  {/* Chiến dịch đa kênh do AI tạo (+ Telegram cũ 28–29/09) có loại 'mixed' và nhãn "Đa kênh" ở cột Loại — phải lọc được (C-10). */}
                  <option value="mixed">{t('campaigns.multiChannel')}</option>
                </select>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="card">
            {isLoading ? (
              <div className="flex items-center justify-center h-64">
                <div className="spinner w-8 h-8"></div>
              </div>
            ) : campaigns.length === 0 ? (
              <div className="empty-state py-16">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                  <HiOutlinePlus className="w-8 h-8 text-gray-400" />
                </div>
                <h3 className="text-lg font-medium text-gray-900">{t('campaigns.noCampaigns')}</h3>
                <p className="text-gray-500 mt-1">{t('campaigns.startFirst')}</p>
                {originTab === 'self_created' && (
                  <button
                    onClick={openCreateModal}
                    className="btn btn-primary mt-4"
                  >
                    <HiOutlinePlus className="w-5 h-5 mr-2" />
                    {t('campaigns.createFirst')}
                  </button>
                )}
              </div>
            ) : (
              <div className="table-container relative">
                <table className="table">
                  <thead>
                    <tr>
                      <th>{t('campaigns.campaignName')}</th>
                      <th>{t('common.status')}</th>
                      <th>{t('campaigns.operation')}</th>
                      <th>{t('campaigns.campaignType')}</th>
                      <th>{t('campaigns.createdBy')}</th>
                      <th>{t('campaigns.createdAt')}</th>
                      <th>{t('campaigns.updatedAt')}</th>
                      <th title={t('campaigns.completedRunsHint')}>{t('campaigns.completedRuns')}</th>
                      <th className="text-right">{t('common.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaigns.map((campaign) => {
                      const isRunning =
                        runController.isCampaignRunningById(campaign.id) ||
                        isCampaignCurrentlyRunning(campaign);
                      // Review Claude 12/09: hook nhận ID (`getCampaignKey = (campaignId) => String(campaignId)`),
                      // truyền cả object thì khoá thành "[object Object]" → runningRun luôn null → nút Dừng
                      // luôn báo "không tìm thấy lượt chạy". Các trường liên tục / tạm dừng hạn mức nằm trong
                      // `runMetadata`, đọc qua helper như trang Chạy chiến dịch cũ (CampaignRunMainTabs cũ :155-164).
                      const campaignKey = runController.getCampaignKey(campaign.id);
                      const runningRun = runController.runningRunByCampaign[campaignKey] || null;
                      const isContinuous = Boolean(runningRun?.runMetadata?.continuousMode);
                      const pollIntervalMs = Number.parseInt(runningRun?.runMetadata?.pollIntervalMs, 10);
                      const pollIntervalMinutes = Number.isFinite(pollIntervalMs)
                        ? Math.max(1, Math.round(pollIntervalMs / 60000))
                        : null;
                      const activePause = getActiveRunPause(runningRun?.runMetadata);
                      const hasSchedules = Number(campaign.enabledScheduleCount || 0) > 0;
                      // PR-8a (UI nói thật) Việc 3 — chiến dịch chỉ có lượt failed (chưa từng
                      // running/completed thành công) vẫn phải có nút Nhật ký để xem lỗi.
                      const hasRuns =
                        Number(campaign.runningCount || 0) > 0 ||
                        Number(campaign.completedCount || 0) > 0 ||
                        Number(campaign.failedCount || 0) > 0;
                      const isShowingLogs = runController.isShowingLogsForCampaign(campaign.id);
                      const runId = Number.parseInt(runningRun?.id, 10);
                      const isStopping = Number.isFinite(runId) && runController.stoppingRunIds.has(runId);

                      return (
                        <tr key={campaign.id} className="hover:bg-orange-50/20 transition-colors">
                          <td>
                            <div className="flex flex-col py-0.5">
                              <Link
                                to={`/app/campaigns/${campaign.id}/builder`}
                                className="font-semibold text-gray-900 hover:text-orange-600 transition-colors inline-flex items-center gap-1.5 flex-wrap group"
                              >
                                <span className="group-hover:underline">{campaign.campaignName}</span>
                                {campaign.origin === 'marketplace_purchased' && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-purple-50 text-purple-700 border border-purple-200">
                                    {t('campaigns.marketplace') || 'Marketplace'}
                                  </span>
                                )}
                                {campaign.origin === 'shared_received' && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-200">
                                    {t('campaigns.shared') || 'Được chia sẻ'}
                                  </span>
                                )}
                              </Link>
                              {Number(campaign.failedCount || 0) > 0 && campaign.lastFailedRun && (
                                <p className="mt-1 text-xs text-red-500 flex items-center gap-1">
                                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                                  <span>
                                    {t('campaigns.lastRunFailed', {
                                      label: campaign.lastFailedRun.label || campaign.lastFailedRun.errorMessage || '',
                                    })}
                                  </span>
                                </p>
                              )}
                            </div>
                          </td>
                          <td>
                            {campaign.status === 'active' ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                <span>{t('campaigns.active')}</span>
                              </span>
                            ) : campaign.status === 'draft' ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700 ring-1 ring-gray-400/20">
                                <span>{t('campaigns.draft')}</span>
                              </span>
                            ) : campaign.status === 'paused' ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 ring-1 ring-amber-600/20">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                <span>{t('campaigns.paused')}</span>
                              </span>
                            ) : campaign.status === 'pending_owner_approval' ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 ring-1 ring-blue-600/20">
                                <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                                <span>{t('campaigns.pendingOwnerApproval')}</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                                {campaign.status}
                              </span>
                            )}
                          </td>
                          <td>
                            {isRunning ? (
                              <div className="flex flex-col items-start gap-1">
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/25 shadow-2xs">
                                  <HiOutlineRefresh className="w-3 h-3 animate-spin text-emerald-600" />
                                  <span>{t('campaigns.operationRunning')}</span>
                                </span>
                                {isContinuous && (
                                  <span className="text-[11px] text-emerald-600 font-medium pl-1">
                                    {pollIntervalMinutes
                                      ? t('campaignRun.continuousRunningEvery', { interval: pollIntervalMinutes })
                                      : t('campaignRun.continuousRunning')}
                                  </span>
                                )}
                                {activePause && (
                                  <>
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-normal bg-amber-50 text-amber-800 border border-amber-200">
                                      {t(getRunPauseI18nKey(activePause), {
                                        until: formatCampaignDateTime(activePause.untilIso),
                                        account: activePause.accountName || t('campaignRun.zaloAccountFallback'),
                                      })}
                                    </span>
                                    {activePause.kind === 'plan_quota' && (
                                      <Link
                                        to="/app/topup"
                                        className="text-xs font-medium text-orange-600 hover:text-orange-800 hover:underline pl-1"
                                      >
                                        {t('campaignRun.buyTopup')}
                                      </Link>
                                    )}
                                  </>
                                )}
                              </div>
                            ) : hasSchedules ? (
                              <button
                                type="button"
                                onClick={() => runController.openCampaignSchedulesSummaryModal(campaign)}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200/80 hover:bg-blue-100 transition-colors shadow-2xs"
                                title={t('campaignRun.viewSchedules')}
                              >
                                <HiOutlineClock className="w-3.5 h-3.5 text-blue-600" />
                                <span>
                                  {t('campaigns.operationScheduledCount', { count: campaign.enabledScheduleCount })}
                                </span>
                              </button>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs text-gray-500 bg-gray-50/80 border border-gray-200/60">
                                <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
                                <span>{t('campaigns.inactive')}</span>
                              </span>
                            )}
                          </td>
                          <td>
                            {(() => {
                              const typeMeta = getCampaignTypeMeta(campaign.campaignType);
                              const typeKey = String(campaign.campaignType || '').trim().toLowerCase();
                              let Icon = null;
                              if (typeKey === 'email') Icon = HiOutlineMail;
                              else if (typeKey === 'zalo') Icon = HiOutlineChat;
                              else if (typeKey === 'zalo_group') Icon = HiOutlineUserGroup;
                              else if (typeKey.includes('telegram')) Icon = FaTelegramPlane;
                              else if (typeKey === 'whatsapp') Icon = FaWhatsapp;
                              else if (typeKey === 'mixed') Icon = HiOutlineSparkles;

                              return (
                                <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${typeMeta.className}`}>
                                  {Icon && <Icon className="w-3 h-3 shrink-0" aria-hidden="true" />}
                                  <span>{typeMeta.label}</span>
                                </span>
                              );
                            })()}
                          </td>
                          <td>
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 bg-gradient-to-tr from-orange-500 to-amber-500 rounded-full flex items-center justify-center shrink-0 shadow-2xs">
                                <span className="text-white text-[11px] font-bold">{(campaign.createdBy?.name || 'A')[0]?.toUpperCase()}</span>
                              </div>
                              <span className="text-sm font-medium text-gray-700 truncate max-w-[120px]">{campaign.createdBy?.name || campaign.createdBy || 'Unknown'}</span>
                            </div>
                          </td>
                          <td className="text-xs text-gray-500 whitespace-nowrap">
                            {formatCampaignDateTime(campaign.createdAt)}
                          </td>
                          <td className="text-xs text-gray-500 whitespace-nowrap">
                            {formatCampaignDateTime(campaign.updatedAt)}
                          </td>
                          <td className="text-center">{campaign.completedCount ?? 0}</td>
                          <td>
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Nút hành động vận hành (Chạy/Dừng, Lịch, Nhật ký) */}
                              {campaign.status === 'active' && canRun && (
                                <>
                                  {isRunning ? (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (!runningRun?.id) {
                                          toast.error(t('campaignRun.runNotFound'));
                                          return;
                                        }
                                        runController.openStopRunConfirmModal(runningRun);
                                      }}
                                      disabled={isStopping || !runningRun?.id}
                                      className="btn btn-sm btn-danger inline-flex items-center gap-1"
                                      title={t('campaignRun.stopRun')}
                                    >
                                      <HiOutlinePause className="w-3.5 h-3.5" />
                                      <span>
                                        {isStopping ? t('campaignRun.stopping') : t('campaignRun.stop')}
                                      </span>
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => runController.openRunConfirmModal(campaign)}
                                      className="btn btn-sm btn-primary inline-flex items-center gap-1"
                                      title={t('campaignRun.runNow')}
                                    >
                                      <HiOutlinePlay className="w-3.5 h-3.5" />
                                      <span>{t('campaignRun.runNow')}</span>
                                    </button>
                                  )}

                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (isRunning) {
                                        toast.error(t('campaignRun.cannotScheduleWhileRunning'));
                                        return;
                                      }
                                      runController.openScheduleModal(campaign);
                                    }}
                                    className="btn btn-sm btn-secondary inline-flex items-center gap-1"
                                    title={t('campaignRun.setupSchedule')}
                                  >
                                    <HiOutlineClock className="w-3.5 h-3.5" />
                                    <span>{t('campaignRun.schedule')}</span>
                                  </button>
                                </>
                              )}

                              {hasRuns && (
                                <button
                                  type="button"
                                  onClick={() => runController.toggleCampaignLogs(campaign)}
                                  className={`btn btn-sm inline-flex items-center gap-1 ${
                                    isShowingLogs
                                      ? 'bg-blue-600 text-white hover:bg-blue-700 border-blue-600'
                                      : 'btn-secondary'
                                  }`}
                                  title={isShowingLogs ? t('campaignRun.hideLog') : t('campaignRun.viewLog')}
                                >
                                  <HiOutlineEye className="w-3.5 h-3.5" />
                                  <span>{t('campaigns.logs')}</span>
                                </button>
                              )}

                              {campaign.status === 'pending_owner_approval' && isOwner && (
                                <div className="flex items-center gap-1 mr-1">
                                  <button
                                    type="button"
                                    onClick={() => setApproveModal({ show: true, campaign })}
                                    className="px-2.5 py-1 text-xs font-semibold rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition-colors"
                                    title={t('campaigns.approve')}
                                  >
                                    {t('campaigns.approve')}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setRejectModal({ show: true, campaign, reason: '' })}
                                    className="px-2.5 py-1 text-xs font-semibold rounded bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 transition-colors"
                                    title={t('campaigns.reject')}
                                  >
                                    {t('campaigns.reject')}
                                  </button>
                                </div>
                              )}
                              <div className="relative inline-block">
                                <button
                                  ref={(el) => { menuButtonRefs.current[campaign.id] = el; }}
                                  onClick={(e) => {
                                    const id = campaign.id;
                                    if (activeMenu === id) {
                                      setActiveMenu(null);
                                      return;
                                    }
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    setMenuPosition({
                                      top: rect.bottom + 4,
                                      left: Math.min(rect.right - 192, window.innerWidth - 208),
                                    });
                                    setActiveMenu(id);
                                  }}
                                  className="p-1 rounded hover:bg-gray-100 transition-colors"
                                >
                                  <HiOutlineDotsVertical className="w-5 h-5 text-gray-400" />
                                </button>

                                {activeMenu === campaign.id && createPortal(
                                  <>
                                    <div
                                      className="fixed inset-0 z-[99]"
                                      aria-hidden
                                      onClick={() => setActiveMenu(null)}
                                    />
                                    <div
                                      className="fixed w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-[100]"
                                      style={{ top: menuPosition.top, left: menuPosition.left }}
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      {campaign.status === 'pending_owner_approval' && isOwner && (
                                        <>
                                          <button
                                            onClick={() => {
                                              setActiveMenu(null);
                                              setApproveModal({ show: true, campaign });
                                            }}
                                            className="w-full flex items-center px-4 py-2 text-sm font-medium text-emerald-600 hover:bg-emerald-50"
                                          >
                                            <HiOutlineCheckCircle className="w-4 h-4 mr-3" />
                                            {t('campaigns.approve')}
                                          </button>
                                          <button
                                            onClick={() => {
                                              setActiveMenu(null);
                                              setRejectModal({ show: true, campaign, reason: '' });
                                            }}
                                            className="w-full flex items-center px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                                          >
                                            <HiOutlineXCircle className="w-4 h-4 mr-3" />
                                            {t('campaigns.reject')}
                                          </button>
                                        </>
                                      )}
                                      <button
                                        onClick={() => navigate(`/app/campaigns/${campaign.id}/builder`)}
                                        className="w-full flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                                      >
                                        <HiOutlinePencil className="w-4 h-4 mr-3" />
                                        {t('common.edit')}
                                      </button>
                                      {campaign.status === 'active' && (
                                        <button
                                          onClick={() => handlePause(campaign.id)}
                                          className="w-full flex items-center px-4 py-2 text-sm text-yellow-600 hover:bg-yellow-50"
                                        >
                                          <HiOutlinePause className="w-4 h-4 mr-3" />
                                          {t('campaigns.pause')}
                                        </button>
                                      )}
                                      {campaign.status === 'paused' && (
                                        <button
                                          onClick={() => handlePublish(campaign.id)}
                                          className="w-full flex items-center px-4 py-2 text-sm text-green-600 hover:bg-green-50"
                                        >
                                          <HiOutlinePlay className="w-4 h-4 mr-3" />
                                          {t('campaigns.resumeSchedule')}
                                        </button>
                                      )}
                                      {/* Share - only for self-created campaigns */}
                                      {campaign.origin === 'self_created' && (
                                        <button
                                          onClick={() => openShareModal(campaign)}
                                          className="w-full flex items-center px-4 py-2 text-sm text-blue-600 hover:bg-blue-50"
                                        >
                                          <HiOutlineMail className="w-4 h-4 mr-3" />
                                          {t('campaigns.share') || 'Chia sẻ'}
                                        </button>
                                      )}
                                      {/* Marketplace - only for self-created campaigns */}
                                      {(!campaign.origin || campaign.origin === 'self_created') && (
                                        <button
                                          onClick={() => {
                                            setActiveMenu(null);
                                            setMarketplaceModal({ show: true, campaign });
                                          }}
                                          className="w-full flex items-center px-4 py-2 text-sm text-violet-600 hover:bg-violet-50"
                                        >
                                          <HiOutlineShoppingBag className="w-4 h-4 mr-3" />
                                          Đăng Marketplace
                                        </button>
                                      )}
                                      {/* Duplicate - only for self-created campaigns (not marketplace, not shared) */}
                                      {originTab !== 'shared_with_me' && (!campaign.origin || campaign.origin === 'self_created') && (
                                        <button
                                          onClick={() => openDuplicateModal(campaign)}
                                          className="w-full flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                                        >
                                          <HiOutlineDuplicate className="w-4 h-4 mr-3" />
                                          {t('campaigns.duplicate')}
                                        </button>
                                      )}
                                      <button
                                        onClick={() => handleDelete(campaign.id)}
                                        className="w-full flex items-center px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                                      >
                                        <HiOutlineTrash className="w-4 h-4 mr-3" />
                                        {t('common.delete')}
                                      </button>
                                    </div>
                                  </>,
                                  document.body
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
                <p className="text-sm text-gray-500">
                  {t('common.showing')} {campaigns.length} / {pagination.total} {t('common.results')}
                </p>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setPagination((prev) => ({ ...prev, page: prev.page - 1 }))}
                    disabled={pagination.page === 1}
                    className="btn btn-secondary disabled:opacity-50"
                  >
                    Trước
                  </button>
                  <span className="px-3 py-1 text-sm">
                    {pagination.page} / {pagination.totalPages}
                  </span>
                  <button
                    onClick={() => setPagination((prev) => ({ ...prev, page: prev.page + 1 }))}
                    disabled={pagination.page === pagination.totalPages}
                    className="btn btn-secondary disabled:opacity-50"
                  >
                    {t('common.next')}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Panel Nhật ký chiến dịch */}
          <CampaignRunLogsPanel
            selectedCampaignForLogs={runController.selectedCampaignForLogs}
            isLoadingRunDetail={runController.isLoadingRunDetail}
            selectedRunDetail={runController.selectedRunDetail}
            workspaceLogs={workspaceLogs}
            selectedExecutionLogId={runController.selectedExecutionLogId}
            onSelectExecutionLogId={runController.setSelectedExecutionLogId}
            campaignRunHistory={runController.campaignRunHistory}
            onViewRunDetail={runController.handleViewRunDetail}
          />
        </>
      )}

      <CampaignDuplicateModal
        campaign={duplicateModal.campaign}
        open={duplicateModal.show}
        onClose={closeDuplicateModal}
        onDone={fetchCampaigns}
      />

      {showCreateModal && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200"
          onKeyDown={(e) => {
            if (e.key === 'Escape' && !isCreatingCampaign) closeCreateModal();
          }}
        >
          <div className="absolute inset-0" onClick={closeCreateModal} />
          <div className="relative bg-white rounded-2xl shadow-2xl border border-slate-100 max-w-2xl w-full overflow-hidden transform transition-all duration-200">
            {/* Header */}
            <div className="px-6 py-5 border-b border-slate-100 flex items-start justify-between bg-gradient-to-b from-slate-50/70 to-white">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-orange-50 border border-orange-200/80 flex items-center justify-center text-orange-600 shadow-xs shrink-0">
                  <HiOutlineSparkles className="w-5 h-5" aria-hidden="true" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 leading-snug">{t('campaigns.createModalTitle')}</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {t('campaigns.createModalSubtitle') || 'Thiết lập tên và kênh tương tác để khởi tạo kịch bản'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeCreateModal}
                className="text-slate-400 hover:text-slate-600 p-2 rounded-xl hover:bg-slate-100 transition-colors"
                aria-label={t('common.close') || 'Đóng'}
              >
                <HiOutlineX className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-5">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-sm font-semibold text-slate-700">
                    {t('campaigns.campaignName')}
                  </label>
                  <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">
                    {t('common.required') || 'Bắt buộc'}
                  </span>
                </div>
                <input
                  type="text"
                  value={createCampaignForm.campaignName}
                  onChange={(e) => setCreateCampaignForm((prev) => ({ ...prev, campaignName: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !isCreatingCampaign && createCampaignForm.campaignName.trim()) {
                      e.preventDefault();
                      handleCreateCampaign();
                    }
                  }}
                  className="w-full px-3.5 py-2.5 text-sm bg-slate-50/60 hover:bg-white focus:bg-white border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10 transition-all shadow-xs"
                  placeholder={t('campaigns.campaignNamePlaceholder')}
                  autoFocus
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-semibold text-slate-700">
                    {t('campaigns.campaignType')}
                  </label>
                  <span className="text-xs text-slate-400 font-normal">
                    {t('campaigns.selectOneChannel') || 'Chọn 1 kênh'}
                  </span>
                </div>

                <div className={`grid gap-2.5 ${createCampaignChannels.length <= 2 ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3'}`}>
                  {createCampaignChannels.map((ch) => {
                    const isSelected = createCampaignForm.campaignType === ch.id;
                    const Icon = ch.icon;
                    return (
                      <button
                        key={ch.id}
                        type="button"
                        onClick={() => setCreateCampaignForm((prev) => ({ ...prev, campaignType: ch.id }))}
                        className={`group relative flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border text-left transition-all ${
                          isSelected
                            ? 'border-orange-500 bg-orange-50/70 shadow-sm shadow-orange-500/10 ring-1 ring-orange-500/30 text-orange-950 font-semibold'
                            : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/80 text-slate-700 hover:text-slate-900 shadow-xs'
                        }`}
                      >
                        <span
                          className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors shadow-xs ${
                            isSelected ? ch.selectedIconBg : ch.iconBg
                          }`}
                          aria-hidden="true"
                        >
                          <Icon className="w-4 h-4" />
                        </span>
                        <span className="text-sm font-medium leading-snug whitespace-nowrap">
                          {ch.name}
                        </span>
                        {isSelected && (
                          <span
                            className="absolute top-2 right-2 w-4 h-4 rounded-full bg-orange-500 text-white flex items-center justify-center shadow-xs"
                            aria-hidden="true"
                          >
                            <HiCheck className="w-2.5 h-2.5 stroke-[2.5]" />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-slate-50/80 border-t border-slate-100 flex items-center justify-end gap-3 rounded-b-2xl">
              <button
                type="button"
                onClick={closeCreateModal}
                className="btn btn-secondary px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-slate-100 transition-colors"
                disabled={isCreatingCampaign}
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={handleCreateCampaign}
                className="btn btn-primary px-5 py-2.5 rounded-xl text-sm font-semibold shadow-md shadow-orange-500/20 hover:shadow-orange-500/30 transition-all flex items-center gap-2"
                disabled={isCreatingCampaign}
              >
                {isCreatingCampaign ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" aria-hidden="true" />
                    <span>{t('campaigns.creating')}</span>
                  </>
                ) : (
                  t('campaigns.createAndDesign')
                )}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      <CampaignShareModal
        campaign={showShareModal.campaign}
        open={showShareModal.show}
        onClose={closeShareModal}
      />

      {/* Modal Duyệt chiến dịch */}
      {approveModal.show && approveModal.campaign && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => !isApproving && setApproveModal({ show: false, campaign: null })}
          />
          <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center gap-3 text-emerald-600">
              <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                <HiOutlineCheckCircle className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">
                {t('campaigns.approveConfirmTitle')}
              </h3>
            </div>
            {/* C-28 — không bao giờ nói "0 người nhận": API đã trả số ước tính cho chiến dịch chờ duyệt; nếu vẫn
                không biết (người nhận lấy từ nguồn dữ liệu lúc chạy) thì bỏ hẳn con số thay vì in số 0 sai. */}
            {(() => {
              const recipientCount = Number(approveModal.campaign.totalCustomers) || 0;
              return (
                <>
                  <p className="text-sm text-gray-600">
                    {recipientCount > 0
                      ? t('campaigns.approveConfirmMessage', {
                          name: approveModal.campaign.campaignName,
                          count: recipientCount.toLocaleString('vi-VN'),
                        })
                      : t('campaigns.approveConfirmMessageNoCount', {
                          name: approveModal.campaign.campaignName,
                        })}
                  </p>
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                    ⚠️{' '}
                    {recipientCount > 0 && (
                      <>
                        {t('campaigns.approveRecipientsLabel')}{' '}
                        <strong>{recipientCount.toLocaleString('vi-VN')}</strong>.{' '}
                      </>
                    )}
                    {t('campaigns.approveStartsImmediately')}
                  </div>
                </>
              );
            })()}
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setApproveModal({ show: false, campaign: null })}
                disabled={isApproving}
                className="btn btn-secondary"
              >
                {t('campaigns.cancel')}
              </button>
              <button
                type="button"
                onClick={handleApprove}
                disabled={isApproving}
                className="btn btn-primary bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600"
              >
                {isApproving ? t('common.processing') || 'Đang xử lý...' : t('campaigns.confirmApproveAndSend')}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal Từ chối chiến dịch */}
      {rejectModal.show && rejectModal.campaign && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => !isRejecting && setRejectModal({ show: false, campaign: null, reason: '' })}
          />
          <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center gap-3 text-red-600">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <HiOutlineXCircle className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">
                {t('campaigns.rejectConfirmTitle')}
              </h3>
            </div>
            <p className="text-sm text-gray-600">
              {t('campaigns.rejectConfirmMessage', {
                name: rejectModal.campaign.campaignName,
              })}
            </p>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Lý do từ chối (tùy chọn)
              </label>
              <input
                type="text"
                value={rejectModal.reason}
                onChange={(e) => setRejectModal((prev) => ({ ...prev, reason: e.target.value }))}
                placeholder={t('campaigns.rejectReasonPlaceholder')}
                className="input w-full text-sm"
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setRejectModal({ show: false, campaign: null, reason: '' })}
                disabled={isRejecting}
                className="btn btn-secondary"
              >
                {t('campaigns.cancel')}
              </button>
              <button
                type="button"
                onClick={handleReject}
                disabled={isRejecting}
                className="btn btn-primary bg-red-600 hover:bg-red-700 text-white border-red-600"
              >
                {isRejecting ? t('common.processing') || 'Đang xử lý...' : t('campaigns.confirmReject')}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal Marketplace */}
      {marketplaceModal.show && marketplaceModal.campaign && (
        <CampaignMarketplaceModal
          open={marketplaceModal.show}
          campaign={marketplaceModal.campaign}
          onClose={() => setMarketplaceModal({ show: false, campaign: null })}
          onSuccess={() => fetchCampaigns()}
        />
      )}

      {/* Modals chạy và lên lịch chiến dịch */}
      <CampaignRunModals
        weeklyDayOptions={runController.weeklyDayOptions}
        showRunConfirmModal={runController.showRunConfirmModal}
        closeRunConfirmModal={runController.closeRunConfirmModal}
        runConfirmCampaign={runController.runConfirmCampaign}
        runNameInput={runController.runNameInput}
        setRunNameInput={runController.setRunNameInput}
        runContinuousMode={runController.runContinuousMode}
        setRunContinuousMode={runController.setRunContinuousMode}
        runPollIntervalMinutes={runController.runPollIntervalMinutes}
        setRunPollIntervalMinutes={runController.setRunPollIntervalMinutes}
        isRunResumeLocked={runController.isRunResumeLocked}
        runResumeMode={runController.runResumeMode}
        setRunResumeMode={runController.setRunResumeMode}
        runResumeFromId={runController.runResumeFromId}
        setRunResumeFromId={runController.setRunResumeFromId}
        continuousResumeRunOptions={runController.continuousResumeRunOptions}
        isLoadingContinuousResumeOptions={runController.isLoadingContinuousResumeOptions}
        shouldShowRunContinuousOptions={!runController.isZaloGroupCampaign(runController.runConfirmCampaign)}
        isSubmittingRun={runController.isSubmittingRun}
        handleRunNow={runController.handleRunNow}
        stopRunConfirmTarget={runController.stopRunConfirmTarget}
        closeStopRunConfirmModal={runController.closeStopRunConfirmModal}
        handleConfirmStopRun={runController.handleConfirmStopRun}
        stoppingRunIds={runController.stoppingRunIds}
        showScheduleModal={runController.showScheduleModal}
        selectedCampaign={runController.selectedCampaign}
        closeScheduleModal={runController.closeScheduleModal}
        scheduleForm={runController.scheduleForm}
        setScheduleForm={runController.setScheduleForm}
        scheduleFormError={runController.scheduleFormError}
        handleSaveSchedule={runController.handleSaveSchedule}
        showScheduleDetailModal={runController.showScheduleDetailModal}
        selectedSchedule={runController.selectedSchedule}
        closeScheduleDetailModal={runController.closeScheduleDetailModal}
        getWeeklyDayLabel={runController.getWeeklyDayLabel}
        getWeeklyDayFromCron={runController.getWeeklyDayFromCron}
        getScheduleTypeLabel={runController.getScheduleTypeLabel}
        getScheduleStatusClassName={runController.getScheduleStatusClassName}
        getScheduleStatusLabel={runController.getScheduleStatusLabel}
        scheduleRuns={runController.scheduleRuns}
        handleToggleSchedule={runController.handleToggleSchedule}
        isReadonlyOnceSchedule={runController.isReadonlyOnceSchedule}
        campaignSchedulesModalCampaign={runController.campaignSchedulesModalCampaign}
        closeCampaignSchedulesSummaryModal={runController.closeCampaignSchedulesSummaryModal}
        allSchedules={runController.schedules}
        canEditSchedules={canEditSchedules}
      />

    </div>
  );
};

export default Campaigns;
