import {
  HiOutlineClock,
  HiOutlineEye,
  HiOutlinePause,
  HiOutlinePlay,
  HiOutlineRefresh,
  HiOutlineSearch,
  HiOutlineTrash,
} from 'react-icons/hi';
import { getCampaignTypeMeta } from '../../../utils/campaignTypeDisplay';
import { formatCampaignDateTime } from '../utils/campaignDateTime.helpers';

const CampaignRunMainTabs = ({
  activeMainTab,
  onSwitchMainTab,
  activeCampaignSearch,
  onActiveCampaignSearchChange,
  scheduledCampaignSearch,
  onScheduledCampaignSearchChange,
  pausedCampaignSearch,
  onPausedCampaignSearchChange,
  campaigns,
  filteredActiveCampaigns,
  pausedCampaigns,
  filteredPausedCampaigns,
  schedules,
  filteredSchedules,
  getCampaignKey,
  isCampaignRunningById,
  runningRunByCampaign,
  onOpenRunConfirmModal,
  onOpenScheduleModal,
  onToggleCampaignLogs,
  isShowingLogsForCampaign,
  getWeeklyDayLabel,
  getWeeklyDayFromCron,
  getScheduleTypeLabel,
  getScheduleStatusClassName,
  getScheduleStatusLabel,
  isReadonlyOnceSchedule,
  onOpenScheduleDetailModal,
  onDeleteSchedule,
  onToggleSchedule,
  activatingCampaignIds,
  onActivateCampaign,
  stoppingRunIds,
  onStopRun,
  toastNotifier,
}) => (
  <>
    <div className="border-b border-gray-200">
      <nav className="flex gap-6" aria-label="Tabs">
        <button
          type="button"
          onClick={() => onSwitchMainTab('active_campaigns')}
          className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
            activeMainTab === 'active_campaigns'
              ? 'border-primary-500 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Chiến dịch đang hoạt động
        </button>
        <button
          type="button"
          onClick={() => onSwitchMainTab('scheduled_campaigns')}
          className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
            activeMainTab === 'scheduled_campaigns'
              ? 'border-primary-500 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Lịch chạy đã thiết lập
        </button>
        <button
          type="button"
          onClick={() => onSwitchMainTab('paused_campaigns')}
          className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
            activeMainTab === 'paused_campaigns'
              ? 'border-primary-500 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Chiến dịch đang tạm dừng
        </button>
      </nav>
    </div>

    {activeMainTab === 'active_campaigns' && (
      <div className="card">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Chiến dịch đang hoạt động</h2>
          <div className="mt-4">
            <div className="max-w-md flex items-center rounded-lg border border-gray-300 bg-white text-sm focus-within:border-primary-500 focus-within:ring-1 focus-within:ring-primary-500">
              <span className="pl-3 flex items-center text-gray-400" aria-hidden>
                <HiOutlineSearch className="w-5 h-5" />
              </span>
              <input
                type="text"
                value={activeCampaignSearch}
                onChange={(e) => onActiveCampaignSearchChange(e.target.value)}
                placeholder="Tìm theo tên chiến dịch"
                className="flex-1 min-w-0 py-2 pr-3 border-0 bg-transparent focus:ring-0 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {filteredActiveCampaigns.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-gray-500">
              {campaigns.length === 0
                ? 'Không có chiến dịch đang hoạt động'
                : 'Không tìm thấy chiến dịch phù hợp'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Tên chiến dịch
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Loại
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Cập nhật lần cuối
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Thao tác
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredActiveCampaigns.map((campaign) => {
                  const campaignKey = getCampaignKey(campaign.id);
                  const isRunning = isCampaignRunningById(campaign.id);
                  const runningRun = runningRunByCampaign[campaignKey] || null;
                  const isContinuousMode = Boolean(runningRun?.runMetadata?.continuousMode);
                  const pollIntervalMs = Number.parseInt(runningRun?.runMetadata?.pollIntervalMs, 10);
                  const pollIntervalMinutes = Number.isFinite(pollIntervalMs)
                    ? Math.max(1, Math.round(pollIntervalMs / 60000))
                    : null;
                  const runId = Number.parseInt(runningRun?.id, 10);
                  const isStopping = Number.isFinite(runId) && stoppingRunIds.has(runId);

                  return (
                    <tr key={campaign.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="flex items-center">
                          <div>
                            <div className="font-medium text-gray-900">{campaign.campaignName}</div>
                            {campaign.description && (
                              <div className="text-sm text-gray-500">{campaign.description}</div>
                            )}
                            {isRunning && (
                              <div className="flex items-center gap-2 mt-1">
                                <span className="badge badge-warning flex items-center gap-1">
                                  <HiOutlineRefresh className="w-3 h-3 animate-spin" />
                                  Đang chạy
                                </span>
                                {isContinuousMode && (
                                  <span className="text-xs text-emerald-600 font-medium">
                                    Chạy liên tục{pollIntervalMinutes ? ` (${pollIntervalMinutes} phút/lần)` : ''}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {(() => {
                          const typeMeta = getCampaignTypeMeta(campaign.campaignType);
                          return (
                            <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${typeMeta.className}`}>
                              {typeMeta.label}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {formatCampaignDateTime(campaign.updatedAt)}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {isRunning ? (
                            <button
                              onClick={() => {
                                if (!runningRun?.id) {
                                  toastNotifier.error('Không tìm thấy lượt chạy để dừng');
                                  return;
                                }
                                onStopRun(runningRun);
                              }}
                              className="btn btn-danger"
                              title="Dừng lượt chạy"
                              disabled={isStopping || !runningRun?.id}
                            >
                              <HiOutlinePause className="w-4 h-4 mr-2" />
                              {isStopping ? 'Đang dừng...' : 'Dừng chạy'}
                            </button>
                          ) : (
                            <button
                              onClick={() => {
                                onOpenRunConfirmModal(campaign);
                              }}
                              className="btn btn-primary"
                              title="Chạy ngay"
                            >
                              <HiOutlinePlay className="w-4 h-4 mr-2" />
                              Chạy ngay
                            </button>
                          )}
                          <button
                            onClick={() => {
                              if (isRunning) {
                                toastNotifier.error('Chiến dịch đang chạy, tạm thời không thể lên lịch');
                                return;
                              }
                              onOpenScheduleModal(campaign);
                            }}
                            className="btn btn-secondary"
                            title="Thiết lập lịch chạy"
                          >
                            <HiOutlineClock className="w-4 h-4 mr-2" />
                            Lên lịch
                          </button>
                          <button
                            onClick={() => onToggleCampaignLogs(campaign)}
                            className="btn btn-secondary"
                            title={isShowingLogsForCampaign(campaign.id) ? 'Ẩn log' : 'Xem log'}
                          >
                            <HiOutlineEye className="w-4 h-4 mr-2" />
                            {isShowingLogsForCampaign(campaign.id) ? 'Ẩn log' : 'Xem log'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    )}

    {activeMainTab === 'scheduled_campaigns' && (
      <div className="card">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Lịch chạy đã thiết lập</h2>
          <div className="mt-4">
            <div className="max-w-md flex items-center rounded-lg border border-gray-300 bg-white text-sm focus-within:border-primary-500 focus-within:ring-1 focus-within:ring-primary-500">
              <span className="pl-3 flex items-center text-gray-400" aria-hidden>
                <HiOutlineSearch className="w-5 h-5" />
              </span>
              <input
                type="text"
                value={scheduledCampaignSearch}
                onChange={(e) => onScheduledCampaignSearchChange(e.target.value)}
                placeholder="Tìm theo tên lịch hoặc tên chiến dịch"
                className="flex-1 min-w-0 py-2 pr-3 border-0 bg-transparent focus:ring-0 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {filteredSchedules.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-gray-500">
              {schedules.length === 0 ? 'Chưa có lịch chạy nào' : 'Không tìm thấy chiến dịch phù hợp'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tên lịch</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Chiến dịch</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Loại lịch</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cron</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Trạng thái</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Thao tác</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredSchedules.map((schedule) => (
                  <tr key={schedule.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="font-medium text-gray-900">{schedule.scheduleName}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900">{schedule.campaignName}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="badge badge-info">
                        {schedule.scheduleType === 'weekly'
                          ? `Hàng tuần (${getWeeklyDayLabel(getWeeklyDayFromCron(schedule.cronExpression))})`
                          : getScheduleTypeLabel(schedule.scheduleType)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <code className="text-xs bg-gray-100 px-2 py-1 rounded">{schedule.cronExpression}</code>
                    </td>
                    <td className="px-6 py-4">
                      {(() => {
                        const isReadonlyStatus = isReadonlyOnceSchedule(schedule);
                        return (
                      <button
                        onClick={() => {
                          if (isReadonlyStatus) return;
                          onToggleSchedule(schedule.id, schedule.enabled);
                        }}
                        className={`badge ${isReadonlyStatus ? 'cursor-not-allowed opacity-80' : 'cursor-pointer'} ${getScheduleStatusClassName(schedule)}`}
                        disabled={isReadonlyStatus}
                      >
                        {getScheduleStatusLabel(schedule)}
                      </button>
                        );
                      })()}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => onOpenScheduleDetailModal(schedule)}
                          className="text-blue-600 hover:text-blue-800"
                          title="Xem chi tiết"
                        >
                          <HiOutlineEye className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => onDeleteSchedule(schedule.id)}
                          className="text-red-600 hover:text-red-800"
                          title="Xóa lịch"
                        >
                          <HiOutlineTrash className="w-5 h-5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    )}

    {activeMainTab === 'paused_campaigns' && (
      <div className="card">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Chiến dịch đang tạm dừng</h2>
          <div className="mt-4">
            <div className="max-w-md flex items-center rounded-lg border border-gray-300 bg-white text-sm focus-within:border-primary-500 focus-within:ring-1 focus-within:ring-primary-500">
              <span className="pl-3 flex items-center text-gray-400" aria-hidden>
                <HiOutlineSearch className="w-5 h-5" />
              </span>
              <input
                type="text"
                value={pausedCampaignSearch}
                onChange={(e) => onPausedCampaignSearchChange(e.target.value)}
                placeholder="Tìm theo tên chiến dịch"
                className="flex-1 min-w-0 py-2 pr-3 border-0 bg-transparent focus:ring-0 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {filteredPausedCampaigns.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-gray-500">
              {pausedCampaigns.length === 0
                ? 'Không có chiến dịch tạm dừng'
                : 'Không tìm thấy chiến dịch phù hợp'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tên chiến dịch</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Loại</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cập nhật lần cuối</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Thao tác</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredPausedCampaigns.map((campaign) => {
                  const isActivating = activatingCampaignIds.has(campaign.id);
                  return (
                    <tr key={campaign.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="font-medium text-gray-900">{campaign.campaignName}</div>
                        {campaign.description && (
                          <div className="text-sm text-gray-500">{campaign.description}</div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {(() => {
                          const typeMeta = getCampaignTypeMeta(campaign.campaignType);
                          return (
                            <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${typeMeta.className}`}>
                              {typeMeta.label}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {formatCampaignDateTime(campaign.updatedAt)}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => onActivateCampaign(campaign.id)}
                            className="btn btn-primary"
                            title="Kích hoạt chiến dịch"
                            disabled={isActivating}
                          >
                            <HiOutlinePlay className="w-4 h-4 mr-2" />
                            {isActivating ? 'Đang kích hoạt...' : 'Kích hoạt'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    )}
  </>
);

export default CampaignRunMainTabs;
