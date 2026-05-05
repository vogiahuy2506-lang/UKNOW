import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { getCampaignEngagementStatDefinitions } from '../../utils/campaignDetailEngagementLabels';
import {
  HiOutlineArrowLeft,
  HiOutlinePencil,
  HiOutlinePlay,
  HiOutlinePause,
} from 'react-icons/hi';

const RUNNING_CAMPAIGN_PAUSE_BLOCK_MESSAGE =
  'Chiến dịch đang chạy. Vui lòng dừng lượt chạy tại trang Chạy chiến dịch (CampaignRun) trước khi tạm dừng.';

const CampaignDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  /** Nhãn + mã event_type theo loại chiến dịch (phải gọi hook trước mọi return) */
  const engagementStats = useMemo(
    () => getCampaignEngagementStatDefinitions(campaign?.campaignType),
    [campaign?.campaignType]
  );

  useEffect(() => {
    fetchCampaign();
  }, [id]);

  const fetchCampaign = async () => {
    try {
      const response = await api.get(`/campaigns/${id}`);
      setCampaign(response.data.data);
    } catch (error) {
      toast.error('Không thể tải thông tin chiến dịch');
      navigate('/app/campaigns');
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleStatus = async () => {
    try {
      const newStatus = campaign.status === 'active' ? 'paused' : 'active';
      if (newStatus === 'paused') {
        const runResponse = await api.get(`/campaign-runs?campaignId=${id}&limit=20`);
        const campaignRuns = Array.isArray(runResponse.data?.data) ? runResponse.data.data : [];
        const hasRunningCampaignRun = campaignRuns.some((run) => run.status === 'running');

        if (hasRunningCampaignRun) {
          toast.error(RUNNING_CAMPAIGN_PAUSE_BLOCK_MESSAGE);
          return;
        }
      }

      await api.put(`/campaigns/${id}`, {
        status: newStatus,
      });
      toast.success(newStatus === 'active' ? 'Đã kích hoạt chiến dịch' : 'Đã tạm dừng chiến dịch');
      // Reload campaign data
      fetchCampaign();
    } catch (error) {
      toast.error('Không thể cập nhật trạng thái chiến dịch');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="spinner w-8 h-8"></div>
      </div>
    );
  }

  if (!campaign) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center">
          <button
            onClick={() => navigate('/app/campaigns')}
            className="mr-4 p-2 rounded-lg hover:bg-gray-100 shrink-0"
          >
            <HiOutlineArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-gray-900 truncate">{campaign.campaignName}</h1>
            <p className="text-gray-500 mt-1">{campaign.description || 'Không có mô tả'}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            onClick={() => navigate(`/app/campaigns/${id}/builder`)}
            className="btn btn-secondary"
          >
            <HiOutlinePencil className="w-5 h-5 mr-2" />
            Chỉnh sửa
          </button>
          {campaign.status === 'active' ? (
            <button
              onClick={handleToggleStatus}
              className="btn btn-warning"
            >
              <HiOutlinePause className="w-5 h-5 mr-2" />
              Tạm dừng
            </button>
          ) : (
            <button
              onClick={handleToggleStatus}
              className="btn btn-primary"
            >
              <HiOutlinePlay className="w-5 h-5 mr-2" />
              Kích hoạt
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="card p-6">
          <p className="text-sm text-gray-500">Tổng khách hàng</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {campaign.totalCustomers?.toLocaleString() || 0}
          </p>
        </div>
        <div className="card p-6">
          <p className="text-sm text-gray-500">{engagementStats.sent.label}</p>
          <p className="text-xs uppercase tracking-wide text-gray-400 font-mono mt-0.5">
            {engagementStats.sent.eventType}
          </p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {campaign.totalSent?.toLocaleString() || 0}
          </p>
        </div>
        <div className="card p-6">
          <p className="text-sm text-gray-500">{engagementStats.opened.label}</p>
          <p className="text-xs uppercase tracking-wide text-gray-400 font-mono mt-0.5">
            {engagementStats.opened.eventType ?? '—'}
          </p>
          {engagementStats.opened.unavailableReason ? (
            <>
              <p className="text-2xl font-bold text-gray-400 mt-1">—</p>
              <p className="text-xs text-gray-500 mt-1">{engagementStats.opened.unavailableReason}</p>
            </>
          ) : (
            <p className="text-2xl font-bold text-gray-900 mt-1">
              {campaign.totalOpened?.toLocaleString() || 0}
            </p>
          )}
        </div>
        <div className="card p-6">
          <p className="text-sm text-gray-500">{engagementStats.clicked.label}</p>
          <p className="text-xs uppercase tracking-wide text-gray-400 font-mono mt-0.5">
            {engagementStats.clicked.eventType}
          </p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {campaign.totalClicked?.toLocaleString() || 0}
          </p>
        </div>
      </div>

      {/* Details */}
      <div className="card p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Thông tin chi tiết</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-gray-500">Loại chiến dịch</p>
            <p className="font-medium capitalize">{campaign.campaignType}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Trạng thái</p>
            <span
              className={`badge ${
                campaign.status === 'active'
                  ? 'badge-success'
                  : campaign.status === 'draft'
                  ? 'badge-gray'
                  : 'badge-warning'
              }`}
            >
              {campaign.status === 'active' ? 'Đang hoạt động' :
               campaign.status === 'paused' ? 'Tạm dừng' :
               'Nháp'}
            </span>
          </div>
          <div>
            <p className="text-sm text-gray-500">Ngày tạo</p>
            <p className="font-medium">
              {new Date(campaign.createdAt).toLocaleDateString('vi-VN')}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Cập nhật lần cuối</p>
            <p className="font-medium">
              {new Date(campaign.updatedAt).toLocaleDateString('vi-VN')}
            </p>
          </div>
        </div>
      </div>

      {/* Nodes preview */}
      {campaign.nodes && campaign.nodes.length > 0 && (
        <div className="card p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Các bước trong quy trình</h3>
          <div className="space-y-3">
            {campaign.nodes.map((node, index) => (
              <div
                key={node.id}
                className="flex items-center p-4 bg-gray-50 rounded-lg"
              >
                <div className="w-8 h-8 bg-primary-500 text-white rounded-full flex items-center justify-center text-sm font-medium mr-4">
                  {index + 1}
                </div>
                <div>
                  <p className="font-medium">{node.nodeName || node.nodeSubtype}</p>
                  <p className="text-sm text-gray-500">{node.nodeType} - {node.nodeSubtype}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default CampaignDetail;
