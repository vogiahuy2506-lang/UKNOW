import { useMemo } from 'react';
import { buildWorkspaceLogsFromExecution } from '../../../utils/campaignExecutionLogs';

/**
 * Build derived display data for Campaign Run workspace logs and schedules.
 *
 * @param {Object} params source state bundle
 * @param {Object} [params.selectedRunDetail] Chi tiết lượt chạy đang chọn
 * @param {Map} [params.flowOrderByNodeId] Map thứ tự node trong luồng
 * @param {Array} [params.schedules] Danh sách toàn bộ lịch chạy
 * @param {string} [params.scheduledCampaignSearch] Từ khóa tìm kiếm lịch chạy
 * @returns {{workspaceLogs: Array, filteredSchedules: Array}}
 */
const useCampaignRunDerivedData = ({
  selectedRunDetail,
  flowOrderByNodeId,
  schedules = [],
  scheduledCampaignSearch = '',
}) => {
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

  const filteredSchedules = useMemo(() => {
    const keyword = (scheduledCampaignSearch || '').trim().toLowerCase();
    if (!keyword) return schedules || [];
    // Cho phép lọc thêm theo ID chiến dịch gắn với lịch
    return (schedules || []).filter((schedule) => {
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

  return {
    workspaceLogs,
    filteredSchedules,
  };
};

export default useCampaignRunDerivedData;
