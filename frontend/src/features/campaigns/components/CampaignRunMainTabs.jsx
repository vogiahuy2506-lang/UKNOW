import { useI18n } from '../../../i18n';
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
import { filterSchedulesByCampaignId } from '../utils/campaignRunSchedule.helpers';

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
  onOpenCampaignSchedulesSummaryModal,
  onDeleteSchedule,
  onToggleSchedule,
  activatingCampaignIds,
  onActivateCampaign,
  stoppingRunIds,
  onStopRun,
  toastNotifier,
}) => {
  const { t } = useI18n();

  return (
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
          {t('campaignRun.activeCampaigns')}
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
          {t('campaignRun.scheduledCampaigns')}
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
          {t('campaignRun.pausedCampaigns')}
        </button>
      </nav>
    </div>

    {activeMainTab === 'active_campaigns' && (
      <div className="card">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">{t('campaignRun.activeCampaigns')}</h2>
          <div className="mt-4">
            <div className="max-w-md flex items-center rounded-lg border border-gray-300 bg-white text-sm focus-within:border-primary-500 focus-within:ring-1 focus-within:ring-primary-500">
              <span className="pl-3 flex items-center text-gray-400" aria-hidden>
                <HiOutlineSearch className="w-5 h-5" />
              </span>
              <input
                type="text"
                value={activeCampaignSearch}
                onChange={(e) => onActiveCampaignSearchChange(e.target.value)}
                placeholder={t('campaignRun.searchCampaignOrId')}
                className="flex-1 min-w-0 py-2 pr-3 border-0 bg-transparent focus:ring-0 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {filteredActiveCampaigns.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-gray-500">
              {campaigns.length === 0
                ? t('campaignRun.noActiveCampaigns')
                : t('campaignRun.noMatchingCampaigns')}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-24">
                    {t('campaignRun.campaignId')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('campaignRun.campaignName')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('campaignRun.type')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('campaignRun.createdBy')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('campaignRun.lastUpdated')}
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('campaignRun.actions')}
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredActiveCampaigns.map((campaign) => {
                  const campaignKey = getCampaignKey(campaign.id);
                  const campaignSchedules = filterSchedulesByCampaignId(schedules, campaign.id);
                  const scheduleCount = campaignSchedules.length;
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
                      <td className="px-6 py-4 text-sm text-gray-600 tabular-nums">
                        {campaign.id != null ? String(campaign.id) : '—'}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center">
                          <div>
                            <div className="font-medium text-gray-900">{campaign.campaignName}</div>
                            {campaign.description && (
                              <div className="text-sm text-gray-500">{campaign.description}</div>
                            )}
                            {/* Schedule status label + popup to view schedule details */}
                            <div className="mt-1 flex flex-wrap items-center gap-2">
                              {scheduleCount === 0 ? (
                                <span className="text-xs text-gray-500">{t('campaignRun.noSchedules')}</span>
                              ) : (
                                <>
                                  <span className="badge badge-info text-xs font-normal">
                                    {t('campaignRun.schedulesCount', { count: scheduleCount })}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => onOpenCampaignSchedulesSummaryModal(campaign)}
                                    className="text-xs font-medium text-primary-600 hover:text-primary-800 hover:underline"
                                  >
                                    {t('campaignRun.viewSchedules')}
                                  </button>
                                </>
                              )}
                            </div>
                            {isRunning && (
                              <div className="flex items-center gap-2 mt-1">
                                <span className="badge badge-warning flex items-center gap-1">
                                  <HiOutlineRefresh className="w-3 h-3 animate-spin" />
                                  {t('campaignRun.running')}
                                </span>
                                {isContinuousMode && (
                                  <span className="text-xs text-emerald-600 font-medium">
                                    {t('campaignRun.continuousRunning', { interval: pollIntervalMinutes })}
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
                      <td className="px-6 py-4 text-sm text-gray-700">
                        {campaign?.createdBy?.name || campaign?.creatorName || t('campaignRun.unknown')}
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
                                  toastNotifier.error(t('campaignRun.runNotFound'));
                                  return;
                                }
                                onStopRun(runningRun);
                              }}
                              className="btn btn-danger"
                              title={t('campaignRun.stopRun')}
                              disabled={isStopping || !runningRun?.id}
                            >
                              <HiOutlinePause className="w-4 h-4 mr-2" />
                              {isStopping ? t('campaignRun.stopping') : t('campaignRun.stop')}
                            </button>
                          ) : (
                            <button
                              onClick={() => {
                                onOpenRunConfirmModal(campaign);
                              }}
                              className="btn btn-primary"
                              title={t('campaignRun.runNow')}
                            >
                              <HiOutlinePlay className="w-4 h-4 mr-2" />
                              {t('campaignRun.runNow')}
                            </button>
                          )}
                          <button
                            onClick={() => {
                              if (isRunning) {
                                toastNotifier.error(t('campaignRun.cannotScheduleWhileRunning'));
                                return;
                              }
                              onOpenScheduleModal(campaign);
                            }}
                            className="btn btn-secondary"
                            title={t('campaignRun.setupSchedule')}
                          >
                            <HiOutlineClock className="w-4 h-4 mr-2" />
                            {t('campaignRun.schedule')}
                          </button>
                          <button
                            onClick={() => onToggleCampaignLogs(campaign)}
                            className="btn btn-secondary"
                            title={isShowingLogsForCampaign(campaign.id) ? t('campaignRun.hideLog') : t('campaignRun.viewLog')}
                          >
                            <HiOutlineEye className="w-4 h-4 mr-2" />
                            {isShowingLogsForCampaign(campaign.id) ? t('campaignRun.hideLog') : t('campaignRun.viewLog')}
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
          <h2 className="text-lg font-semibold text-gray-900">{t('campaignRun.scheduledCampaigns')}</h2>
          <div className="mt-4">
            <div className="max-w-md flex items-center rounded-lg border border-gray-300 bg-white text-sm focus-within:border-primary-500 focus-within:ring-1 focus-within:ring-primary-500">
              <span className="pl-3 flex items-center text-gray-400" aria-hidden>
                <HiOutlineSearch className="w-5 h-5" />
              </span>
              <input
                type="text"
                value={scheduledCampaignSearch}
                onChange={(e) => onScheduledCampaignSearchChange(e.target.value)}
                placeholder={t('campaignRun.searchScheduleOrCampaign')}
                className="flex-1 min-w-0 py-2 pr-3 border-0 bg-transparent focus:ring-0 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {filteredSchedules.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-gray-500">
              {schedules.length === 0 ? t('campaignRun.noSchedules') : t('campaignRun.noMatchingCampaigns')}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('campaignRun.scheduleName')}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('campaigns.title')}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-28">{t('campaignRun.campaignId')}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('campaignRun.scheduleType')}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('campaignRun.cron')}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('common.status')}</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">{t('common.actions')}</th>
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
                    <td className="px-6 py-4 text-sm text-gray-600 tabular-nums">
                      {schedule.campaignId != null ? String(schedule.campaignId) : '—'}
                    </td>
                    <td className="px-6 py-4">
                      <span className="badge badge-info">
                        {schedule.scheduleType === 'weekly'
                          ? `${t('campaigns.scheduleWeekly')} (${getWeeklyDayLabel(getWeeklyDayFromCron(schedule.cronExpression))})`
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
                          title={t('campaignRun.viewDetails')}
                        >
                          <HiOutlineEye className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => onDeleteSchedule(schedule.id)}
                          className="text-red-600 hover:text-red-800"
                          title={t('campaignRun.deleteSchedule')}
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
          <h2 className="text-lg font-semibold text-gray-900">{t('campaignRun.pausedCampaigns')}</h2>
          <div className="mt-4">
            <div className="max-w-md flex items-center rounded-lg border border-gray-300 bg-white text-sm focus-within:border-primary-500 focus-within:ring-1 focus-within:ring-primary-500">
              <span className="pl-3 flex items-center text-gray-400" aria-hidden>
                <HiOutlineSearch className="w-5 h-5" />
              </span>
              <input
                type="text"
                value={pausedCampaignSearch}
                onChange={(e) => onPausedCampaignSearchChange(e.target.value)}
                placeholder={t('campaignRun.searchCampaignOrId')}
                className="flex-1 min-w-0 py-2 pr-3 border-0 bg-transparent focus:ring-0 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {filteredPausedCampaigns.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-gray-500">
              {pausedCampaigns.length === 0
                ? t('campaignRun.noPausedCampaigns')
                : t('campaignRun.noMatchingCampaigns')}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-24">{t('campaignRun.campaignId')}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('campaignRun.campaignName')}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('campaignRun.type')}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('campaignRun.createdBy')}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('campaignRun.lastUpdated')}</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredPausedCampaigns.map((campaign) => {
                  const isActivating = activatingCampaignIds.has(campaign.id);
                  return (
                    <tr key={campaign.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm text-gray-600 tabular-nums">
                        {campaign.id != null ? String(campaign.id) : '—'}
                      </td>
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
                      <td className="px-6 py-4 text-sm text-gray-700">
                        {campaign?.createdBy?.name || campaign?.creatorName || t('campaignRun.unknown')}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {formatCampaignDateTime(campaign.updatedAt)}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => onActivateCampaign(campaign.id)}
                            className="btn btn-primary"
                            title={t('campaignRun.activateCampaign')}
                            disabled={isActivating}
                          >
                            <HiOutlinePlay className="w-4 h-4 mr-2" />
                            {isActivating ? t('campaignRun.activating') : t('campaignRun.activate')}
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
};

export default CampaignRunMainTabs;
