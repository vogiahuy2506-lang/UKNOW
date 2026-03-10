import { useState, useEffect } from 'react';
import campaignRunApiService from '../../features/campaigns/services/campaignRunApi.service';
import toast from 'react-hot-toast';
import { buildFlowOrderIndex } from '../../utils/campaignExecutionLogs';
import CampaignRunMainTabs from '../../features/campaigns/components/CampaignRunMainTabs';
import CampaignRunLogsPanel from '../../features/campaigns/components/CampaignRunLogsPanel';
import CampaignRunModals from '../../features/campaigns/components/CampaignRunModals';
import useCampaignRunDerivedData from '../../features/campaigns/hooks/useCampaignRunDerivedData';
import {
  buildCronExpression,
  getScheduleStatusClassName,
  getScheduleStatusLabel,
  getScheduleTypeLabel,
  getWeeklyDayFromCron,
  getWeeklyDayLabel,
  isCompletedOnceSchedule,
  isReadonlyOnceSchedule,
  isStoppedOnceSchedule,
} from '../../features/campaigns/utils/campaignRunSchedule.helpers';

const WEEKLY_DAY_OPTIONS = [
  { value: '1', label: 'Thứ 2' },
  { value: '2', label: 'Thứ 3' },
  { value: '3', label: 'Thứ 4' },
  { value: '4', label: 'Thứ 5' },
  { value: '5', label: 'Thứ 6' },
  { value: '6', label: 'Thứ 7' },
  { value: '0', label: 'Chủ nhật' },
];
const ADJACENT_ZALO_NODE_DELAY_MS = 5000;
const DEFAULT_CONTINUOUS_MODE = true;
const DEFAULT_CONTINUOUS_POLL_INTERVAL_MINUTES = 120;
const ZALO_GROUP_CAMPAIGN_TYPE = 'zalo_group';

const CampaignRun = () => {
  const [campaigns, setCampaigns] = useState([]);
  const [pausedCampaigns, setPausedCampaigns] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [showScheduleDetailModal, setShowScheduleDetailModal] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [selectedSchedule, setSelectedSchedule] = useState(null);
  const [scheduleRuns, setScheduleRuns] = useState([]);
  const [scheduleForm, setScheduleForm] = useState({
    scheduleName: '',
    scheduleType: 'once', // once, daily, weekly, monthly
    scheduleDate: '',
    scheduleTime: '',
    weeklyDay: '1',
    cronExpression: '',
    enabled: true,
  });
  const [schedules, setSchedules] = useState([]);
  const [runningCampaigns, setRunningCampaigns] = useState(new Set());
  const [runningRunByCampaign, setRunningRunByCampaign] = useState({});
  const [selectedRunDetail, setSelectedRunDetail] = useState(null);
  const [campaignRunHistory, setCampaignRunHistory] = useState([]);
  const [isLoadingRunDetail, setIsLoadingRunDetail] = useState(false);
  const [showRunConfirmModal, setShowRunConfirmModal] = useState(false);
  const [runConfirmCampaign, setRunConfirmCampaign] = useState(null);
  const [runNameInput, setRunNameInput] = useState('');
  const [runContinuousMode, setRunContinuousMode] = useState(DEFAULT_CONTINUOUS_MODE);
  const [runPollIntervalMinutes, setRunPollIntervalMinutes] = useState(DEFAULT_CONTINUOUS_POLL_INTERVAL_MINUTES);
  const [isSubmittingRun, setIsSubmittingRun] = useState(false);
  const [stopRunConfirmTarget, setStopRunConfirmTarget] = useState(null);
  const [selectedCampaignForLogs, setSelectedCampaignForLogs] = useState(null);
  const [selectedExecutionLogId, setSelectedExecutionLogId] = useState(null);
  const [flowOrderByNodeId, setFlowOrderByNodeId] = useState(new Map());
  const [activeMainTab, setActiveMainTab] = useState('active_campaigns');
  const [activeCampaignSearch, setActiveCampaignSearch] = useState('');
  const [scheduledCampaignSearch, setScheduledCampaignSearch] = useState('');
  const [pausedCampaignSearch, setPausedCampaignSearch] = useState('');
  const [activatingCampaignIds, setActivatingCampaignIds] = useState(new Set());
  const [stoppingRunIds, setStoppingRunIds] = useState(new Set());

  const getCampaignKey = (campaignId) => String(campaignId);
  const isCampaignRunningById = (campaignId) => runningCampaigns.has(getCampaignKey(campaignId));
  const isZaloGroupCampaign = (campaign) =>
    String(campaign?.campaignType || campaign?.campaign_type || '').trim().toLowerCase() === ZALO_GROUP_CAMPAIGN_TYPE;

  /**
   * Load campaign flow and build node order map from graph connections.
   *
   * @param {number|string} campaignId campaign identifier
   * @returns {Promise<void>}
   */
  const loadCampaignFlowOrder = async (campaignId) => {
    if (!campaignId) {
      setFlowOrderByNodeId(new Map());
      return;
    }
    try {
      const campaignRes = await campaignRunApiService.getCampaignById(campaignId);
      const flowJson = campaignRes.data?.data?.flowJson;
      const flow = typeof flowJson === 'string' ? JSON.parse(flowJson) : flowJson;
      const flowNodes = Array.isArray(flow?.nodes) ? flow.nodes : [];
      const flowEdges = Array.isArray(flow?.edges) ? flow.edges : [];
      setFlowOrderByNodeId(buildFlowOrderIndex(flowNodes, flowEdges));
    } catch (error) {
      setFlowOrderByNodeId(new Map());
    }
  };

  useEffect(() => {
    fetchActiveCampaigns();
    fetchPausedCampaigns();
    fetchSchedules();
    checkRunningCampaigns();
    
    // Poll running status every 5 seconds
    const interval = setInterval(() => {
      checkRunningCampaigns();
    }, 5000);
    
    return () => clearInterval(interval);
  }, []);

  const fetchActiveCampaigns = async () => {
    setIsLoading(true);
    try {
      const response = await campaignRunApiService.getCampaignsByStatus('active', 100);
      setCampaigns(response.data.data.items || []);
    } catch (error) {
      toast.error('Không thể tải danh sách chiến dịch');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchPausedCampaigns = async () => {
    try {
      const response = await campaignRunApiService.getCampaignsByStatus('paused', 100);
      setPausedCampaigns(response.data.data.items || []);
    } catch (error) {
      toast.error('Không thể tải danh sách chiến dịch tạm dừng');
    }
  };

  const fetchSchedules = async () => {
    try {
      const response = await campaignRunApiService.getCampaignSchedules();
      setSchedules(response.data.data || []);
    } catch (error) {
      console.error('Không thể tải lịch chạy:', error);
    }
  };

  const checkRunningCampaigns = async () => {
    try {
      const response = await campaignRunApiService.getCampaignRuns('limit=100');
      const runs = response.data.data || [];
      
      // Lấy danh sách campaign đang chạy
      const running = new Set(
        runs
          .filter(run => run.status === 'running')
          .map(run => getCampaignKey(run.campaignId))
      );
      const runningMap = {};
      runs
        .filter((run) => run.status === 'running')
        .forEach((run) => {
          const campaignKey = getCampaignKey(run.campaignId);
          if (!runningMap[campaignKey]) runningMap[campaignKey] = run;
        });
      
      setRunningCampaigns(running);
      setRunningRunByCampaign(runningMap);
    } catch (error) {
      console.error('Không thể kiểm tra trạng thái chạy:', error);
    }
  };

  const handleViewRunDetail = async (runId, campaignId) => {
    setIsLoadingRunDetail(true);
    try {
      const [runRes, historyRes] = await Promise.all([
        campaignRunApiService.getCampaignRunDetail(runId),
        campaignRunApiService.getCampaignRuns(`campaignId=${campaignId}&limit=20`),
      ]);
      await loadCampaignFlowOrder(campaignId);
      setSelectedRunDetail(runRes.data?.data || null);
      setCampaignRunHistory(historyRes.data?.data || []);
    } catch (error) {
      toast.error('Không thể tải log chạy chiến dịch');
    } finally {
      setIsLoadingRunDetail(false);
    }
  };

  const fetchScheduleRuns = async (scheduleId) => {
    try {
      const response = await campaignRunApiService.getCampaignRuns(`scheduleId=${scheduleId}&limit=20`);
      setScheduleRuns(response.data.data || []);
    } catch (error) {
      console.error('Không thể tải lịch sử chạy:', error);
      toast.error('Không thể tải lịch sử chạy');
    }
  };
  
  const openScheduleDetailModal = async (schedule) => {
    setSelectedSchedule(schedule);
    setShowScheduleDetailModal(true);
    await fetchScheduleRuns(schedule.id);
  };

  const closeScheduleDetailModal = () => {
    setShowScheduleDetailModal(false);
    setSelectedSchedule(null);
    setScheduleRuns([]);
  };

  const openRunConfirmModal = (campaign) => {
    if (isCampaignRunningById(campaign.id)) {
      toast.error('Chiến dịch đang chạy, vui lòng chờ hoàn tất');
      return;
    }
    setRunConfirmCampaign(campaign);
    setRunNameInput(campaign?.campaignName || '');
    setRunContinuousMode(isZaloGroupCampaign(campaign) ? false : DEFAULT_CONTINUOUS_MODE);
    setRunPollIntervalMinutes(DEFAULT_CONTINUOUS_POLL_INTERVAL_MINUTES);
    setShowRunConfirmModal(true);
  };

  const closeRunConfirmModal = (force = false) => {
    if (!force && isSubmittingRun) return;
    setShowRunConfirmModal(false);
    setRunConfirmCampaign(null);
    setRunNameInput('');
    setRunContinuousMode(DEFAULT_CONTINUOUS_MODE);
    setRunPollIntervalMinutes(DEFAULT_CONTINUOUS_POLL_INTERVAL_MINUTES);
  };

  const handleRunNow = async () => {
    if (!runConfirmCampaign?.id) return;
    if (isCampaignRunningById(runConfirmCampaign.id)) {
      toast.error('Chiến dịch đang chạy, không thể chạy thêm');
      return;
    }
    setIsSubmittingRun(true);
    try {
      const isGroupCampaign = isZaloGroupCampaign(runConfirmCampaign);
      const parsedPollIntervalMinutes = Number.parseInt(runPollIntervalMinutes, 10);
      const safePollIntervalMinutes = Number.isFinite(parsedPollIntervalMinutes)
        ? Math.max(1, Math.min(parsedPollIntervalMinutes, 24 * 60))
        : DEFAULT_CONTINUOUS_POLL_INTERVAL_MINUTES;
      const effectiveContinuousMode = isGroupCampaign ? false : Boolean(runContinuousMode);
      await campaignRunApiService.runCampaign(runConfirmCampaign.id, {
        source: 'campaign_run',
        runName: runNameInput?.trim() || runConfirmCampaign.campaignName,
        adjacentZaloNodeDelayMs: ADJACENT_ZALO_NODE_DELAY_MS,
        continuousMode: effectiveContinuousMode,
        pollIntervalMs: safePollIntervalMinutes * 60 * 1000,
      });
      toast.success('Đã bắt đầu chạy chiến dịch');
      await checkRunningCampaigns();
      closeRunConfirmModal(true);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Không thể chạy chiến dịch');
    } finally {
      setIsSubmittingRun(false);
    }
  };

  const openCampaignLogs = async (campaign) => {
    setSelectedCampaignForLogs(campaign);
    setSelectedRunDetail(null);
    setSelectedExecutionLogId(null);
    setFlowOrderByNodeId(new Map());
    setIsLoadingRunDetail(true);
    try {
      const [historyRes] = await Promise.all([
        campaignRunApiService.getCampaignRuns(`campaignId=${campaign.id}&limit=20`),
        loadCampaignFlowOrder(campaign.id),
      ]);
      const history = historyRes.data?.data || [];
      setCampaignRunHistory(history);
      if (history.length > 0) {
        const latestRunId = history[0].id;
        const runRes = await campaignRunApiService.getCampaignRunDetail(latestRunId);
        setSelectedRunDetail(runRes.data?.data || null);
      }
    } catch (error) {
      toast.error('Không thể tải log chạy chiến dịch');
    } finally {
      setIsLoadingRunDetail(false);
    }
  };

  /**
   * Đóng khu vực log hiện tại và reset context lượt chạy đã chọn.
   *
   * Luồng hoạt động:
   * 1. Xóa campaign đang mở log.
   * 2. Xóa chi tiết run, danh sách lịch sử và log node đang chọn.
   * 3. Reset thứ tự node để lần mở sau luôn lấy dữ liệu mới.
   *
   * @returns {void}
   */
  const closeCampaignLogs = () => {
    setSelectedCampaignForLogs(null);
    setSelectedRunDetail(null);
    setCampaignRunHistory([]);
    setSelectedExecutionLogId(null);
    setFlowOrderByNodeId(new Map());
  };

  const isShowingLogsForCampaign = (campaignId) =>
    Number(selectedCampaignForLogs?.id) === Number(campaignId);

  const toggleCampaignLogs = async (campaign) => {
    if (isShowingLogsForCampaign(campaign.id)) {
      closeCampaignLogs();
      return;
    }
    await openCampaignLogs(campaign);
  };

  /**
   * Switch main tab and reset log workspace on non-log tab.
   *
   * @param {'active_campaigns'|'scheduled_campaigns'|'paused_campaigns'} tabKey target tab key
   * @returns {void}
   */
  const handleSwitchMainTab = (tabKey) => {
    setActiveMainTab(tabKey);
    // Chỉ tab chiến dịch hoạt động mới cho phép hiển thị panel log.
    if (tabKey !== 'active_campaigns') {
      closeCampaignLogs();
    }
  };

  useEffect(() => {
    const campaignId = selectedCampaignForLogs?.id;
    if (!campaignId) return;

    const shouldPoll =
      selectedRunDetail?.status === 'running' || isCampaignRunningById(campaignId);
    if (!shouldPoll) return;

    let isCancelled = false;

    /**
     * Refresh log list + selected run detail while campaign is running.
     *
     * @returns {Promise<void>}
     */
    const pollRunLogs = async () => {
      try {
        const historyRes = await campaignRunApiService.getCampaignRuns(`campaignId=${campaignId}&limit=20`);
        if (isCancelled) return;

        const history = historyRes.data?.data || [];
        setCampaignRunHistory(history);

        const targetRunId = selectedRunDetail?.id || history[0]?.id;
        if (!targetRunId) {
          setSelectedRunDetail(null);
          return;
        }

        const runRes = await campaignRunApiService.getCampaignRunDetail(targetRunId);
        if (isCancelled) return;
        setSelectedRunDetail(runRes.data?.data || null);
      } catch (error) {
        console.error('Không thể cập nhật log chạy chiến dịch:', error);
      }
    };

    pollRunLogs();
    const timer = setInterval(pollRunLogs, 3000);
    return () => {
      isCancelled = true;
      clearInterval(timer);
    };
  }, [runningCampaigns, selectedCampaignForLogs?.id, selectedRunDetail?.id, selectedRunDetail?.status]);

  const {
    workspaceLogs,
    filteredActiveCampaigns,
    filteredSchedules,
    filteredPausedCampaigns,
  } = useCampaignRunDerivedData({
    selectedRunDetail,
    flowOrderByNodeId,
    selectedCampaignForLogs,
    campaigns,
    activeCampaignSearch,
    schedules,
    scheduledCampaignSearch,
    pausedCampaigns,
    pausedCampaignSearch,
  });

  const openScheduleModal = (campaign) => {
    if (isCampaignRunningById(campaign.id)) {
      toast.error('Chiến dịch đang chạy, tạm thời không thể lên lịch');
      return;
    }
    setSelectedCampaign(campaign);
    setScheduleForm({
      scheduleName: `Lịch chạy - ${campaign.campaignName}`,
      scheduleType: 'once',
      scheduleDate: '',
      scheduleTime: '',
      weeklyDay: '1',
      cronExpression: '',
      enabled: true,
    });
    setShowScheduleModal(true);
  };

  const closeScheduleModal = () => {
    setShowScheduleModal(false);
    setSelectedCampaign(null);
  };

  const handleSaveSchedule = async () => {
    if (selectedCampaign?.id && isCampaignRunningById(selectedCampaign.id)) {
      toast.error('Chiến dịch đang chạy, tạm thời không thể lên lịch');
      return;
    }

    if (!scheduleForm.scheduleName.trim()) {
      toast.error('Vui lòng nhập tên lịch chạy');
      return;
    }

    if (!scheduleForm.scheduleTime) {
      toast.error('Vui lòng chọn thời gian chạy');
      return;
    }

    if (scheduleForm.scheduleType === 'once' && !scheduleForm.scheduleDate) {
      toast.error('Vui lòng chọn ngày chạy');
      return;
    }

    if (scheduleForm.scheduleType === 'weekly' && !scheduleForm.weeklyDay) {
      toast.error('Vui lòng chọn thứ chạy');
      return;
    }

    const cronExpression = buildCronExpression(scheduleForm);
    
    if (!cronExpression) {
      toast.error('Không thể tạo biểu thức thời gian');
      return;
    }

    try {
      await campaignRunApiService.createCampaignSchedule({
        campaignId: selectedCampaign.id,
        scheduleName: scheduleForm.scheduleName.trim(),
        scheduleType: scheduleForm.scheduleType,
        cronExpression,
        enabled: scheduleForm.enabled,
      });
      
      toast.success('Đã tạo lịch chạy chiến dịch');
      closeScheduleModal();
      fetchSchedules();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Không thể tạo lịch chạy');
    }
  };

  const handleDeleteSchedule = async (scheduleId) => {
    if (!confirm('Bạn có chắc chắn muốn xóa lịch chạy này?')) {
      return;
    }

    try {
      await campaignRunApiService.deleteCampaignSchedule(scheduleId);
      toast.success('Đã xóa lịch chạy');
      fetchSchedules();
    } catch (error) {
      toast.error('Không thể xóa lịch chạy');
    }
  };

  const handleToggleSchedule = async (scheduleId, currentStatus) => {
    const targetSchedule = schedules.find((item) => item.id === scheduleId);
    if (isReadonlyOnceSchedule(targetSchedule)) {
      if (isStoppedOnceSchedule(targetSchedule)) {
        toast.error('Lịch chạy 1 lần đã dừng, không thể chỉnh sửa');
        return;
      }
      if (isCompletedOnceSchedule(targetSchedule)) {
        toast.error('Lịch chạy 1 lần đã hoàn thành, không thể bật lại');
        return;
      }
      return;
    }
    if (
      targetSchedule?.campaignId &&
      currentStatus === false &&
      isCampaignRunningById(targetSchedule.campaignId)
    ) {
      toast.error('Chiến dịch đang chạy, chưa thể bật lịch');
      return;
    }

    try {
      await campaignRunApiService.updateCampaignSchedule(scheduleId, {
        enabled: !currentStatus,
      });
      toast.success(currentStatus ? 'Đã tắt lịch chạy' : 'Đã bật lịch chạy');
      fetchSchedules();
      
      // Nếu đang mở modal detail, cập nhật selectedSchedule
      if (selectedSchedule && selectedSchedule.id === scheduleId) {
        setSelectedSchedule({
          ...selectedSchedule,
          enabled: !currentStatus,
        });
      }
    } catch (error) {
      toast.error('Không thể cập nhật lịch chạy');
    }
  };

  /**
   * Activate a paused campaign and refresh tab data.
   *
   * @param {number|string} campaignId campaign identifier
   * @returns {Promise<void>}
   */
  const handleActivateCampaign = async (campaignId) => {
    if (!campaignId) return;
    if (isCampaignRunningById(campaignId)) {
      toast.error('Chiến dịch đang chạy, vui lòng chờ hoàn tất');
      return;
    }

    setActivatingCampaignIds((prev) => new Set(prev).add(campaignId));
    try {
      await campaignRunApiService.publishCampaign(campaignId);
      toast.success('Đã kích hoạt chiến dịch');
      await Promise.all([fetchActiveCampaigns(), fetchPausedCampaigns()]);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Không thể kích hoạt chiến dịch');
    } finally {
      setActivatingCampaignIds((prev) => {
        const next = new Set(prev);
        next.delete(campaignId);
        return next;
      });
    }
  };

  const openStopRunConfirmModal = (run) => {
    const runId = Number.parseInt(run?.id, 10);
    const campaignId = run?.campaignId;
    if (!Number.isFinite(runId) || !campaignId) return;
    if (!isCampaignRunningById(campaignId)) {
      toast.error('Lượt chạy hiện không ở trạng thái đang chạy');
      return;
    }
    setStopRunConfirmTarget(run);
  };

  const closeStopRunConfirmModal = () => {
    const runId = Number.parseInt(stopRunConfirmTarget?.id, 10);
    if (Number.isFinite(runId) && stoppingRunIds.has(runId)) return;
    setStopRunConfirmTarget(null);
  };

  /**
   * Stop one running campaign run after user confirms on custom modal.
   *
   * @returns {Promise<void>}
   */
  const handleConfirmStopRun = async () => {
    const runId = Number.parseInt(stopRunConfirmTarget?.id, 10);
    const campaignId = stopRunConfirmTarget?.campaignId;
    if (!Number.isFinite(runId) || !campaignId) return;
    setStoppingRunIds((prev) => new Set(prev).add(runId));
    try {
      await campaignRunApiService.stopCampaignRun(runId);
      toast.success('Đã dừng lượt chạy');
      await checkRunningCampaigns();
      if (selectedRunDetail?.id === runId && selectedCampaignForLogs?.id) {
        const [runRes, historyRes] = await Promise.all([
          campaignRunApiService.getCampaignRunDetail(runId),
          campaignRunApiService.getCampaignRuns(`campaignId=${selectedCampaignForLogs.id}&limit=20`),
        ]);
        setSelectedRunDetail(runRes.data?.data || null);
        setCampaignRunHistory(historyRes.data?.data || []);
      }
      setStopRunConfirmTarget(null);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Không thể dừng lượt chạy');
    } finally {
      setStoppingRunIds((prev) => {
        const next = new Set(prev);
        next.delete(runId);
        return next;
      });
    }
  };

  const getWeeklyDayLabelByOptions = (dayValue) => getWeeklyDayLabel(dayValue, WEEKLY_DAY_OPTIONS);
  const getWeeklyDayFromCronByOptions = (cronExpression = '') =>
    getWeeklyDayFromCron(cronExpression, WEEKLY_DAY_OPTIONS);

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
        <h1 className="text-2xl font-bold text-gray-900">Chạy chiến dịch</h1>
        <p className="text-gray-500 mt-1">Chạy ngay hoặc thiết lập lịch chạy cho các chiến dịch đang hoạt động</p>
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
        schedules={schedules}
        filteredSchedules={filteredSchedules}
        getCampaignKey={getCampaignKey}
        isCampaignRunningById={isCampaignRunningById}
        runningRunByCampaign={runningRunByCampaign}
        onOpenRunConfirmModal={openRunConfirmModal}
        onOpenScheduleModal={openScheduleModal}
        onToggleCampaignLogs={toggleCampaignLogs}
        isShowingLogsForCampaign={isShowingLogsForCampaign}
        getWeeklyDayLabel={getWeeklyDayLabelByOptions}
        getWeeklyDayFromCron={getWeeklyDayFromCronByOptions}
        getScheduleTypeLabel={getScheduleTypeLabel}
        getScheduleStatusClassName={getScheduleStatusClassName}
        getScheduleStatusLabel={getScheduleStatusLabel}
        isReadonlyOnceSchedule={isReadonlyOnceSchedule}
        onOpenScheduleDetailModal={openScheduleDetailModal}
        onDeleteSchedule={handleDeleteSchedule}
        onToggleSchedule={handleToggleSchedule}
        activatingCampaignIds={activatingCampaignIds}
        onActivateCampaign={handleActivateCampaign}
        stoppingRunIds={stoppingRunIds}
        onStopRun={openStopRunConfirmModal}
        toastNotifier={toast}
      />

      {activeMainTab === 'active_campaigns' && (
        <CampaignRunLogsPanel
          selectedCampaignForLogs={selectedCampaignForLogs}
          isLoadingRunDetail={isLoadingRunDetail}
          selectedRunDetail={selectedRunDetail}
          workspaceLogs={workspaceLogs}
          selectedExecutionLogId={selectedExecutionLogId}
          onSelectExecutionLogId={setSelectedExecutionLogId}
          campaignRunHistory={campaignRunHistory}
          onViewRunDetail={handleViewRunDetail}
        />
      )}

      <CampaignRunModals
        weeklyDayOptions={WEEKLY_DAY_OPTIONS}
        showRunConfirmModal={showRunConfirmModal}
        closeRunConfirmModal={closeRunConfirmModal}
        runConfirmCampaign={runConfirmCampaign}
        runNameInput={runNameInput}
        setRunNameInput={setRunNameInput}
        runContinuousMode={runContinuousMode}
        setRunContinuousMode={setRunContinuousMode}
        runPollIntervalMinutes={runPollIntervalMinutes}
        setRunPollIntervalMinutes={setRunPollIntervalMinutes}
        shouldShowRunContinuousOptions={!isZaloGroupCampaign(runConfirmCampaign)}
        isSubmittingRun={isSubmittingRun}
        handleRunNow={handleRunNow}
        stopRunConfirmTarget={stopRunConfirmTarget}
        closeStopRunConfirmModal={closeStopRunConfirmModal}
        handleConfirmStopRun={handleConfirmStopRun}
        stoppingRunIds={stoppingRunIds}
        showScheduleModal={showScheduleModal}
        selectedCampaign={selectedCampaign}
        closeScheduleModal={closeScheduleModal}
        scheduleForm={scheduleForm}
        setScheduleForm={setScheduleForm}
        handleSaveSchedule={handleSaveSchedule}
        showScheduleDetailModal={showScheduleDetailModal}
        selectedSchedule={selectedSchedule}
        closeScheduleDetailModal={closeScheduleDetailModal}
        getWeeklyDayLabel={getWeeklyDayLabelByOptions}
        getWeeklyDayFromCron={getWeeklyDayFromCronByOptions}
        getScheduleTypeLabel={getScheduleTypeLabel}
        getScheduleStatusClassName={getScheduleStatusClassName}
        getScheduleStatusLabel={getScheduleStatusLabel}
        scheduleRuns={scheduleRuns}
        handleToggleSchedule={handleToggleSchedule}
        isReadonlyOnceSchedule={isReadonlyOnceSchedule}
      />
    </div>
  );
};

export default CampaignRun;
