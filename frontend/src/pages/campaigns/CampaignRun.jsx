import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import campaignRunApiService from '../../features/campaigns/services/campaignRunApi.service';
import CampaignRunMainTabs from '../../features/campaigns/components/CampaignRunMainTabs';
import CampaignRunLogsPanel from '../../features/campaigns/components/CampaignRunLogsPanel';
import CampaignRunModals from '../../features/campaigns/components/CampaignRunModals';
import useCampaignRunDerivedData from '../../features/campaigns/hooks/useCampaignRunDerivedData';
import useCampaignRunController from '../../features/campaigns/hooks/useCampaignRunController';
import { useI18n } from '../../i18n';

const CampaignRun = () => {
  const { t } = useI18n();
  const [campaigns, setCampaigns] = useState([]);
  const [pausedCampaigns, setPausedCampaigns] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeMainTab, setActiveMainTab] = useState('active_campaigns');
  const [activeCampaignSearch, setActiveCampaignSearch] = useState('');
  const [scheduledCampaignSearch, setScheduledCampaignSearch] = useState('');
  const [pausedCampaignSearch, setPausedCampaignSearch] = useState('');

  const fetchActiveCampaigns = async () => {
    setIsLoading(true);
    try {
      const response = await campaignRunApiService.getCampaignsByStatus('active', 100);
      setCampaigns(response.data.data.items || []);
    } catch (error) {
      toast.error(t('campaigns.loadFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  const fetchPausedCampaigns = async () => {
    try {
      const response = await campaignRunApiService.getCampaignsByStatus('paused', 100);
      setPausedCampaigns(response.data.data.items || []);
    } catch (error) {
      toast.error(t('campaigns.loadPausedFailed'));
    }
  };

  useEffect(() => {
    fetchActiveCampaigns();
    fetchPausedCampaigns();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ chạy 1 lần lúc mount
  }, []);

  const runController = useCampaignRunController({
    onCampaignsChanged: () => Promise.all([fetchActiveCampaigns(), fetchPausedCampaigns()]),
  });

  const {
    workspaceLogs,
    filteredActiveCampaigns,
    filteredSchedules,
    filteredPausedCampaigns,
  } = useCampaignRunDerivedData({
    selectedRunDetail: runController.selectedRunDetail,
    flowOrderByNodeId: runController.flowOrderByNodeId,
    selectedCampaignForLogs: runController.selectedCampaignForLogs,
    campaigns,
    activeCampaignSearch,
    schedules: runController.schedules,
    scheduledCampaignSearch,
    pausedCampaigns,
    pausedCampaignSearch,
  });

  /**
   * Switch main tab and reset log workspace on non-log tab.
   *
   * @param {'active_campaigns'|'scheduled_campaigns'|'paused_campaigns'} tabKey target tab key
   * @returns {void}
   */
  const handleSwitchMainTab = (tabKey) => {
    setActiveMainTab(tabKey);
    if (tabKey !== 'active_campaigns') {
      runController.closeCampaignLogs();
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="spinner w-8 h-8"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t('campaigns.runCampaign')}</h1>
        <p className="text-gray-500 mt-1">{t('campaigns.runCampaignDescription')}</p>
      </div>

      <CampaignRunMainTabs
        activeMainTab={activeMainTab}
        onSwitchMainTab={handleSwitchMainTab}
        activeCampaignSearch={activeCampaignSearch}
        onActiveCampaignSearchChange={setActiveCampaignSearch}
        scheduledCampaignSearch={scheduledCampaignSearch}
        onScheduledCampaignSearchChange={setScheduledCampaignSearch}
        pausedCampaignSearch={pausedCampaignSearch}
        onPausedCampaignSearchChange={setPausedCampaignSearch}
        campaigns={campaigns}
        filteredActiveCampaigns={filteredActiveCampaigns}
        pausedCampaigns={pausedCampaigns}
        filteredPausedCampaigns={filteredPausedCampaigns}
        schedules={runController.schedules}
        filteredSchedules={filteredSchedules}
        getCampaignKey={runController.getCampaignKey}
        isCampaignRunningById={runController.isCampaignRunningById}
        runningRunByCampaign={runController.runningRunByCampaign}
        onOpenRunConfirmModal={runController.openRunConfirmModal}
        onOpenScheduleModal={runController.openScheduleModal}
        onToggleCampaignLogs={runController.toggleCampaignLogs}
        isShowingLogsForCampaign={runController.isShowingLogsForCampaign}
        getWeeklyDayLabel={runController.getWeeklyDayLabel}
        getWeeklyDayFromCron={runController.getWeeklyDayFromCron}
        getScheduleTypeLabel={runController.getScheduleTypeLabel}
        getScheduleStatusClassName={runController.getScheduleStatusClassName}
        getScheduleStatusLabel={runController.getScheduleStatusLabel}
        isReadonlyOnceSchedule={runController.isReadonlyOnceSchedule}
        onOpenScheduleDetailModal={runController.openScheduleDetailModal}
        onOpenCampaignSchedulesSummaryModal={runController.openCampaignSchedulesSummaryModal}
        onDeleteSchedule={runController.handleDeleteSchedule}
        onToggleSchedule={runController.handleToggleSchedule}
        activatingCampaignIds={runController.activatingCampaignIds}
        onActivateCampaign={runController.handleActivateCampaign}
        stoppingRunIds={runController.stoppingRunIds}
        onStopRun={runController.openStopRunConfirmModal}
        toastNotifier={toast}
      />

      {activeMainTab === 'active_campaigns' && (
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
      )}

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
      />
    </div>
  );
};

export default CampaignRun;
