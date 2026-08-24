import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useI18n } from '../../i18n';
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
} from 'react-icons/hi';
import { getCampaignTypeMeta } from '../../utils/campaignTypeDisplay';
import { formatCampaignDateTime } from '../../features/campaigns/utils/campaignDateTime.helpers';
import { useAuthStore } from '../../stores/authStore';
import campaignApiService from '../../features/campaigns/services/campaignApi.service';
import CampaignMarketplaceModal from '../../components/campaigns/CampaignMarketplaceModal';

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
  const isAdmin = String(user?.roleCode || '').trim().toLowerCase() === 'admin';
  const isOwner = !user?.activeContext || user.activeContext.type === 'self';
  const navigate = useNavigate();
  const location = useLocation();
  const [campaigns, setCampaigns] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 1 });
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [originTab, setOriginTab] = useState('self_created'); // 'self_created' | 'marketplace_purchased' | 'shared_with_me'
  const [activeMenu, setActiveMenu] = useState(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const menuButtonRefs = useRef({});
  const [duplicateModal, setDuplicateModal] = useState({ show: false, campaign: null });
  const [duplicateName, setDuplicateName] = useState('');
  const [isDuplicating, setIsDuplicating] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isCreatingCampaign, setIsCreatingCampaign] = useState(false);
  const [showShareModal, setShowShareModal] = useState({ show: false, campaign: null });
  const [isSharing, setIsSharing] = useState(false);
  const [shareForm, setShareForm] = useState({ email: '', shareType: 'view', canRun: false });
  const [approveModal, setApproveModal] = useState({ show: false, campaign: null });
  const [isApproving, setIsApproving] = useState(false);
  const [rejectModal, setRejectModal] = useState({ show: false, campaign: null, reason: '' });
  const [isRejecting, setIsRejecting] = useState(false);
  const [marketplaceModal, setMarketplaceModal] = useState({ show: false, campaign: null });
  const [createCampaignForm, setCreateCampaignForm] = useState({
    campaignName: '',
    campaignType: 'email',
  });

  useEffect(() => {
    fetchCampaigns();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ refetch theo filter/page/origin
  }, [pagination.page, statusFilter, typeFilter, originTab]);

  useEffect(() => {
    if (!location.state?.openCreateCampaignModal) return;
    openCreateModal();
    navigate(location.pathname, { replace: true, state: {} });
  }, [location.pathname, location.state, navigate]);

  const fetchCampaigns = async () => {
    setIsLoading(true);
    try {
      if (originTab === 'shared_with_me') {
        // Fetch shared campaigns
        const params = {
          page: pagination.page,
          limit: 10,
          ...(search && { search }),
          ...(statusFilter && { status: statusFilter }),
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

  const handlePublish = async (id) => {
    try {
      await campaignApiService.publishCampaign(id);
      toast.success(t('campaigns.activateSuccess'));
      fetchCampaigns();
    } catch (error) {
      toast.error(t('campaigns.activateFailed'));
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
    setDuplicateName(`${campaign.campaignName} (${t('campaigns.copy')})`);
    setActiveMenu(null);
  };

  const closeDuplicateModal = () => {
    setDuplicateModal({ show: false, campaign: null });
    setDuplicateName('');
  };

  // Share modal handlers
  const openShareModal = (campaign) => {
    setShareForm({ email: '', shareType: 'view', canRun: false });
    setShowShareModal({ show: true, campaign });
    setActiveMenu(null);
  };

  const closeShareModal = () => {
    setShowShareModal({ show: false, campaign: null });
    setShareForm({ email: '', shareType: 'view', canRun: false });
  };

  const handleShare = async () => {
    if (!shareForm.email.trim()) {
      toast.error(t('campaigns.enterEmail'));
      return;
    }
    if (!shareForm.email.includes('@')) {
      toast.error(t('campaigns.invalidEmail'));
      return;
    }

    setIsSharing(true);
    try {
      await campaignApiService.shareCampaign(showShareModal.campaign.id, {
        recipientEmail: shareForm.email.trim(),
        shareType: shareForm.shareType,
        canRun: shareForm.canRun,
      });
      toast.success(t('campaigns.shareSuccess'));
      closeShareModal();
    } catch (error) {
      toast.error(error.response?.data?.message || t('campaigns.shareFailed'));
    } finally {
      setIsSharing(false);
    }
  };

  const handleDuplicate = async () => {
    if (!duplicateName.trim()) {
      toast.error(t('campaigns.enterCampaignName'));
      return;
    }

    setIsDuplicating(true);
    try {
      await campaignApiService.duplicateCampaign(duplicateModal.campaign.id, {
        campaignName: duplicateName.trim()
      });
      toast.success(t('campaigns.duplicateSuccess'));
      closeDuplicateModal();
      fetchCampaigns();
    } catch (error) {
      toast.error(error.response?.data?.message || t('campaigns.duplicateFailed'));
    } finally {
      setIsDuplicating(false);
    }
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('campaigns.title')}</h1>
          <p className="text-gray-500 mt-1">
            {isAdmin
              ? t('campaigns.adminDescription')
              : t('campaigns.userDescription')}
          </p>
        </div>
        {/* Chỉ hiển thị nút tạo khi ở tab tự tạo */}
        {originTab === 'self_created' && (
          <button
            onClick={openCreateModal}
            className="btn btn-primary"
          >
            <HiOutlinePlus className="w-5 h-5 mr-2" />
            {t('campaigns.create')}
          </button>
        )}
      </div>

      {/* Origin Tabs - Self Created vs Purchased */}
      <div className="flex gap-2 border-b border-gray-200">
        <button
          onClick={() => {
            setOriginTab('self_created');
            setPagination((prev) => ({ ...prev, page: 1 }));
          }}
          className={`px-4 py-2 font-medium text-sm transition-colors border-b-2 -mb-px ${
            originTab === 'self_created'
              ? 'border-primary-500 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          {t('campaigns.selfCreated') || 'Tự tạo'}
        </button>
        <button
          onClick={() => {
            setOriginTab('marketplace_purchased');
            setPagination((prev) => ({ ...prev, page: 1 }));
          }}
          className={`px-4 py-2 font-medium text-sm transition-colors border-b-2 -mb-px ${
            originTab === 'marketplace_purchased'
              ? 'border-primary-500 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          {t('campaigns.purchased') || 'Đã mua từ Marketplace'}
        </button>
        <button
          onClick={() => {
            setOriginTab('shared_with_me');
            setPagination((prev) => ({ ...prev, page: 1 }));
          }}
          className={`px-4 py-2 font-medium text-sm transition-colors border-b-2 -mb-px ${
            originTab === 'shared_with_me'
              ? 'border-primary-500 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          {t('campaigns.sharedWithMe') || 'Được chia sẻ'}
        </button>
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-wrap gap-4">
          {/* Search */}
          <form onSubmit={handleSearch} className="flex-1 min-w-[200px]">
            <div className="flex items-center rounded-lg border border-gray-300 bg-white text-sm transition-base focus-within:border-primary-500 focus-within:ring-1 focus-within:ring-primary-500">
              <span className="pl-3 flex items-center shrink-0 text-gray-400" aria-hidden>
                <HiOutlineSearch className="w-5 h-5" />
              </span>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('campaigns.searchPlaceholder')}
                className="flex-1 min-w-0 py-2 pr-3 border-0 bg-white focus:ring-0 focus:outline-none"
              />
            </div>
          </form>

          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPagination((prev) => ({ ...prev, page: 1 }));
            }}
            className="input w-auto"
          >
            <option value="">{t('campaigns.allStatuses')}</option>
            <option value="pending_owner_approval">{t('campaigns.pendingOwnerApproval')}</option>
            <option value="draft">{t('campaigns.draft')}</option>
            <option value="active">{t('campaigns.active')}</option>
            <option value="paused">{t('campaigns.paused')}</option>
            <option value="completed">{t('campaigns.completed')}</option>
          </select>

          {/* Type filter */}
          <select
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value);
              setPagination((prev) => ({ ...prev, page: 1 }));
            }}
            className="input w-auto"
          >
            <option value="">{t('campaigns.allTypes')}</option>
            <option value="email">{t('campaigns.email')}</option>
            <option value="zalo">{t('campaigns.zaloPersonal')}</option>
            <option value="zalo_group">{t('campaigns.zaloGroup')}</option>
          </select>
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
                  <th>{t('campaigns.running')}</th>
                  <th>{t('campaigns.campaignType')}</th>
                  <th>{t('campaigns.createdBy')}</th>
                  <th>{t('campaigns.createdAt')}</th>
                  <th>{t('campaigns.updatedAt')}</th>
                  <th>{t('campaigns.completed')}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((campaign) => (
                  <tr key={campaign.id}>
                    <td>
                      <Link
                        to={`/app/campaigns/${campaign.id}`}
                        className="text-primary-600 hover:text-primary-700 font-medium"
                      >
                        {campaign.campaignName}
                        {campaign.origin === 'marketplace_purchased' && (
                          <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800">
                            {t('campaigns.marketplace') || 'Marketplace'}
                          </span>
                        )}
                        {campaign.origin === 'shared_received' && (
                          <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                            {t('campaigns.shared') || 'Được chia sẻ'}
                          </span>
                        )}
                      </Link>
                    </td>
                    <td>
                      <span
                        className={`badge ${
                          campaign.status === 'active'
                            ? 'badge-success'
                            : campaign.status === 'draft'
                            ? 'badge-gray'
                            : campaign.status === 'paused'
                            ? 'badge-warning'
                            : campaign.status === 'pending_owner_approval'
                            ? 'bg-amber-100 text-amber-800 border border-amber-200'
                            : 'badge-info'
                        }`}
                      >
                        {campaign.status === 'active'
                          ? t('campaigns.active')
                          : campaign.status === 'draft'
                          ? t('campaigns.draft')
                          : campaign.status === 'paused'
                          ? t('campaigns.paused')
                          : campaign.status === 'pending_owner_approval'
                          ? t('campaigns.pendingOwnerApproval')
                          : campaign.status}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${isCampaignCurrentlyRunning(campaign) ? 'badge-success' : 'badge-gray'}`}>
                        {isCampaignCurrentlyRunning(campaign) ? t('campaigns.running') : t('campaigns.notRunning')}
                      </span>
                    </td>
                    <td>
                      {(() => {
                        const typeMeta = getCampaignTypeMeta(campaign.campaignType);
                        return (
                          <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${typeMeta.className}`}>
                            {typeMeta.label}
                          </span>
                        );
                      })()}
                    </td>
                    <td>
                      <div className="flex items-center">
                        <div className="w-6 h-6 bg-primary-500 rounded-full flex items-center justify-center mr-2">
                          <span className="text-white text-xs font-medium">{(campaign.createdBy?.name || 'A')[0]?.toUpperCase()}</span>
                        </div>
                        <span className="text-sm">{campaign.createdBy?.name || campaign.createdBy || 'Unknown'}</span>
                      </div>
                    </td>
                    {/* Dùng formatCampaignDateTime để luôn hiển thị theo Asia/Ho_Chi_Minh, khớp dữ liệu DB/API (ISO/UTC). */}
                    <td className="text-sm text-gray-500">
                      {formatCampaignDateTime(campaign.createdAt)}
                    </td>
                    <td className="text-sm text-gray-500">
                      {formatCampaignDateTime(campaign.updatedAt)}
                    </td>
                    <td className="text-center">{campaign.completedCount ?? 0}</td>
                    <td>
                      <div className="flex items-center justify-end">
                        {campaign.status === 'pending_owner_approval' && isOwner && (
                          <div className="flex items-center gap-1.5 mr-2">
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
                                {campaign.status === 'draft' && (
                                  <button
                                    onClick={() => handlePublish(campaign.id)}
                                    className="w-full flex items-center px-4 py-2 text-sm text-green-600 hover:bg-green-50"
                                  >
                                    <HiOutlinePlay className="w-4 h-4 mr-3" />
                                    {t('campaigns.activate')}
                                  </button>
                                )}
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
                                    {t('campaigns.activate')}
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
                ))}
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

      {/* Modal nhân bản chiến dịch */}
      {duplicateModal.show && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div 
            className="absolute inset-0 bg-black/50"
            onClick={closeDuplicateModal}
          />
          <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">{t('campaigns.duplicateModalTitle')}</h3>
            </div>
            <div className="px-6 py-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('campaigns.newCampaignName')}
              </label>
              <input
                type="text"
                value={duplicateName}
                onChange={(e) => setDuplicateName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleDuplicate();
                  if (e.key === 'Escape') closeDuplicateModal();
                }}
                placeholder={t('campaigns.newCampaignNamePlaceholder')}
                className="input w-full"
                autoFocus
              />
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end space-x-3">
              <button
                onClick={closeDuplicateModal}
                disabled={isDuplicating}
                className="btn btn-secondary"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleDuplicate}
                disabled={isDuplicating}
                className="btn btn-primary"
              >
                {isDuplicating ? (
                  <>
                    <div className="spinner w-4 h-4 mr-2"></div>
                    {t('common.processing')}
                  </>
                ) : (
                  t('campaigns.duplicate')
                )}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showCreateModal && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={closeCreateModal} />
          <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">{t('campaigns.createModalTitle')}</h3>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('campaigns.campaignName')}
                </label>
                <input
                  type="text"
                  value={createCampaignForm.campaignName}
                  onChange={(e) => setCreateCampaignForm((prev) => ({ ...prev, campaignName: e.target.value }))}
                  className="input w-full"
                  placeholder={t('campaigns.campaignNamePlaceholder')}
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('campaigns.campaignType')}
                </label>
                <div className="grid grid-cols-3 gap-3">
                  <button
                    type="button"
                    onClick={() => setCreateCampaignForm((prev) => ({ ...prev, campaignType: 'email' }))}
                    className={`border rounded-lg px-3 py-2 flex items-center justify-center gap-2 transition-colors ${
                      createCampaignForm.campaignType === 'email'
                        ? 'border-primary-500 bg-primary-50 text-primary-700'
                        : 'border-gray-300 text-gray-600 hover:border-gray-400'
                    }`}
                  >
                    <HiOutlineMail className="w-4 h-4" />
                    {t('campaigns.email')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setCreateCampaignForm((prev) => ({ ...prev, campaignType: 'zalo' }))}
                    className={`border rounded-lg px-3 py-2 flex items-center justify-center gap-2 transition-colors ${
                      createCampaignForm.campaignType === 'zalo'
                        ? 'border-primary-500 bg-primary-50 text-primary-700'
                        : 'border-gray-300 text-gray-600 hover:border-gray-400'
                    }`}
                  >
                    <HiOutlineChat className="w-4 h-4" />
                    {t('campaigns.zaloPersonal')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setCreateCampaignForm((prev) => ({ ...prev, campaignType: 'zalo_group' }))}
                    className={`border rounded-lg px-3 py-2 flex items-center justify-center gap-2 transition-colors ${
                      createCampaignForm.campaignType === 'zalo_group'
                        ? 'border-primary-500 bg-primary-50 text-primary-700'
                        : 'border-gray-300 text-gray-600 hover:border-gray-400'
                    }`}
                  >
                    <HiOutlineChat className="w-4 h-4" />
                    {t('campaigns.zaloGroup')}
                  </button>
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end space-x-3">
              <button onClick={closeCreateModal} className="btn btn-secondary" disabled={isCreatingCampaign}>
                {t('common.cancel')}
              </button>
              <button onClick={handleCreateCampaign} className="btn btn-primary" disabled={isCreatingCampaign}>
                {isCreatingCampaign ? t('campaigns.creating') : t('campaigns.createAndDesign')}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal chia sẻ chiến dịch */}
      {showShareModal.show && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={closeShareModal}
          />
          <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">
                {t('campaigns.shareModalTitle') || 'Chia sẻ chiến dịch'}
              </h3>
              <p className="text-sm text-gray-500 mt-1">
                {showShareModal.campaign?.campaignName}
              </p>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('campaigns.recipientEmail') || 'Email người nhận'}
                </label>
                <input
                  type="email"
                  value={shareForm.email}
                  onChange={(e) => setShareForm({ ...shareForm, email: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleShare();
                    if (e.key === 'Escape') closeShareModal();
                  }}
                  placeholder="email@example.com"
                  className="input w-full"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('campaigns.sharePermission') || 'Quyền chia sẻ'}
                </label>
                <select
                  value={shareForm.shareType}
                  onChange={(e) => setShareForm({ ...shareForm, shareType: e.target.value })}
                  className="input w-full"
                >
                  <option value="view">{t('campaigns.viewOnly') || 'Chỉ xem'}</option>
                  <option value="edit">{t('campaigns.viewAndEdit') || 'Xem và chỉnh sửa'}</option>
                </select>
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="canRun"
                  checked={shareForm.canRun}
                  onChange={(e) => setShareForm({ ...shareForm, canRun: e.target.checked })}
                  className="h-4 w-4 text-primary-600 rounded border-gray-300 focus:ring-primary-500"
                />
                <label htmlFor="canRun" className="ml-2 text-sm text-gray-700">
                  {t('campaigns.canRunCampaign') || 'Cho phép chạy chiến dịch'}
                </label>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end space-x-3">
              <button
                onClick={closeShareModal}
                disabled={isSharing}
                className="btn btn-secondary"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleShare}
                disabled={isSharing}
                className="btn btn-primary"
              >
                {isSharing ? (
                  <>
                    <div className="spinner w-4 h-4 mr-2"></div>
                    {t('common.processing')}
                  </>
                ) : (
                  t('campaigns.share')
                )}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

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
            <p className="text-sm text-gray-600">
              {t('campaigns.approveConfirmMessage', {
                name: approveModal.campaign.campaignName,
                count: (approveModal.campaign.totalCustomers ?? 0).toLocaleString('vi-VN'),
              })}
            </p>
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
              ⚠️ Số người nhận: <strong>{(approveModal.campaign.totalCustomers ?? 0).toLocaleString('vi-VN')}</strong>. Khi duyệt, chiến dịch sẽ bắt đầu chạy và gửi tin ngay lập tức.
            </div>
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

    </div>
  );
};

export default Campaigns;
