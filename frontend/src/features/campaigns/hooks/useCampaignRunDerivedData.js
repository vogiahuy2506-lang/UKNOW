import { useMemo } from 'react';
import { buildWorkspaceLogsFromExecution } from '../../../utils/campaignExecutionLogs';

/**
 * Build derived display data for Campaign Run page.
 *
 * @param {Object} params source state bundle
 * @returns {{workspaceLogs: Array, filteredActiveCampaigns: Array, filteredSchedules: Array, filteredPausedCampaigns: Array}}
 */
const useCampaignRunDerivedData = ({
  selectedRunDetail,
  flowOrderByNodeId,
  selectedCampaignForLogs,
  campaigns,
  activeCampaignSearch,
  schedules,
  scheduledCampaignSearch,
  pausedCampaigns,
  pausedCampaignSearch,
}) => {
  const selectedLogCampaignId = selectedCampaignForLogs?.id;

  const workspaceLogs = useMemo(() => {
    if (!selectedRunDetail) return [];
    const nodeLogs = buildWorkspaceLogsFromExecution(selectedRunDetail?.executionLogs || [], {
      flowOrderByNodeId,
    });

    const startedAt = selectedRunDetail?.startedAt
      ? new Date(selectedRunDetail.startedAt)
      : new Date();
    const completedAt = selectedRunDetail?.completedAt
      ? new Date(selectedRunDetail.completedAt)
      : new Date();

    const systemLogs = [
      {
        id: `run-start-${selectedRunDetail.id}`,
        status: 'info',
        nodeName: 'Hệ thống',
        message: 'Bắt đầu chạy chiến dịch',
        timestamp: startedAt,
        result: { input: null, output: {} },
      },
    ];

    let runEndLog = null;
    if (selectedRunDetail?.status === 'completed') {
      runEndLog = {
        id: `run-end-${selectedRunDetail.id}`,
        status: 'info',
        nodeName: 'Hệ thống',
        message: 'Hoàn tất chạy chiến dịch',
        timestamp: completedAt,
        result: { input: null, output: {} },
      };
    } else if (selectedRunDetail?.status === 'failed') {
      runEndLog = {
        id: `run-end-${selectedRunDetail.id}`,
        status: 'failed',
        nodeName: 'Hệ thống',
        message: selectedRunDetail?.errorMessage || 'Chiến dịch chạy thất bại',
        timestamp: completedAt,
        result: { input: null, output: { error: selectedRunDetail?.errorMessage || null } },
      };
    }

    /**
     * Giữ thứ tự hiển thị theo flow node:
     * 1) Log bắt đầu hệ thống
     * 2) Log các node (đã được sắp theo thứ tự nối trong flow)
     * 3) Log kết thúc hệ thống (nếu có)
     */
    return runEndLog ? [...systemLogs, ...nodeLogs, runEndLog] : [...systemLogs, ...nodeLogs];
  }, [selectedRunDetail, flowOrderByNodeId]);

  const filteredActiveCampaigns = useMemo(() => {
    if (selectedLogCampaignId) {
      return campaigns.filter(
        (campaign) => Number(campaign?.id) === Number(selectedLogCampaignId)
      );
    }

    const keyword = activeCampaignSearch.trim().toLowerCase();
    if (!keyword) return campaigns;
    // Khớp theo tên hoặc theo chuỗi con của ID (gõ một phần số vẫn lọc được)
    return campaigns.filter((campaign) => {
      const name = String(campaign?.campaignName || '').toLowerCase();
      const idStr = campaign?.id != null ? String(campaign.id).toLowerCase() : '';
      return name.includes(keyword) || (idStr && idStr.includes(keyword));
    });
  }, [campaigns, activeCampaignSearch, selectedLogCampaignId]);

  const filteredSchedules = useMemo(() => {
    const keyword = scheduledCampaignSearch.trim().toLowerCase();
    if (!keyword) return schedules;
    // Cho phép lọc thêm theo ID chiến dịch gắn với lịch
    return schedules.filter((schedule) => {
      const scheduleName = String(schedule?.scheduleName || '').toLowerCase();
      const campaignName = String(schedule?.campaignName || '').toLowerCase();
      const campaignIdStr =
        schedule?.campaignId != null ? String(schedule.campaignId).toLowerCase() : '';
      return (
        scheduleName.includes(keyword) ||
        campaignName.includes(keyword) ||
        (campaignIdStr && campaignIdStr.includes(keyword))
      );
    });
  }, [schedules, scheduledCampaignSearch]);

  const filteredPausedCampaigns = useMemo(() => {
    if (selectedLogCampaignId) {
      return pausedCampaigns.filter(
        (campaign) => Number(campaign?.id) === Number(selectedLogCampaignId)
      );
    }

    const keyword = pausedCampaignSearch.trim().toLowerCase();
    if (!keyword) return pausedCampaigns;
    // Giống tab đang hoạt động: tên hoặc chuỗi con ID
    return pausedCampaigns.filter((campaign) => {
      const name = String(campaign?.campaignName || '').toLowerCase();
      const idStr = campaign?.id != null ? String(campaign.id).toLowerCase() : '';
      return name.includes(keyword) || (idStr && idStr.includes(keyword));
    });
  }, [pausedCampaigns, pausedCampaignSearch, selectedLogCampaignId]);

  return {
    workspaceLogs,
    filteredActiveCampaigns,
    filteredSchedules,
    filteredPausedCampaigns,
  };
};

export default useCampaignRunDerivedData;
