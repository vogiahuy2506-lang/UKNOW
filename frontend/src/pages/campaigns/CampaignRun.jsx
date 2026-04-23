import { useState, useEffect, useRef } from 'react';
import campaignRunApiService from '../../features/campaigns/services/campaignRunApi.service';
import {
  fetchCampaignRunDetailAllExecutionLogs,
  getMaxExecutionLogUpdatedAt,
} from '../../features/campaigns/utils/campaignRunExecutionLogLoader';
import toast from 'react-hot-toast';
import { buildFlowOrderIndex } from '../../utils/campaignExecutionLogs';
import CampaignRunMainTabs from '../../features/campaigns/components/CampaignRunMainTabs';
import CampaignRunLogsPanel from '../../features/campaigns/components/CampaignRunLogsPanel';
import CampaignRunModals from '../../features/campaigns/components/CampaignRunModals';
import useCampaignRunDerivedData from '../../features/campaigns/hooks/useCampaignRunDerivedData';
import {
  buildDelayedRunDate,
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
const ADJACENT_ZALO_NODE_DELAY_MS = 2500;
const DEFAULT_CONTINUOUS_MODE = false;
const ZALO_GROUP_CAMPAIGN_TYPE = 'zalo_group';
const CONTINUOUS_POLL_MIN_MINUTES = 120;
const CONTINUOUS_POLL_MAX_MINUTES = 300;
const CONTINUOUS_POLL_STEP_MINUTES = 5;

/**
 * Sinh số phút random cho chu kỳ continuous theo khoảng chuẩn.
 *
 * @returns {number}
 */
const getRandomContinuousPollIntervalMinutes = () => {
  const totalSteps = Math.floor(
    (CONTINUOUS_POLL_MAX_MINUTES - CONTINUOUS_POLL_MIN_MINUTES) / CONTINUOUS_POLL_STEP_MINUTES
  );
  const randomStep = Math.floor(Math.random() * (totalSteps + 1));
  return CONTINUOUS_POLL_MIN_MINUTES + (randomStep * CONTINUOUS_POLL_STEP_MINUTES);
};

/**
 * Chuẩn hóa số phút nhập tay cho chu kỳ quét continuous.
 * Nếu input không hợp lệ thì fallback về giá trị random mặc định.
 *
 * @param {number|string} rawValue
 * @returns {number}
 */
const normalizeContinuousPollIntervalMinutes = (rawValue) => {
  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return getRandomContinuousPollIntervalMinutes();
  return parsed;
};

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
    customIntervalDays: '2',
    delayValue: '30',
    delayUnit: 'minutes',
    delayPreviewAt: null,
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
  const [runPollIntervalMinutes, setRunPollIntervalMinutes] = useState(() => getRandomContinuousPollIntervalMinutes());
  const [runResumeMode, setRunResumeMode] = useState(false);
  const [runResumeFromId, setRunResumeFromId] = useState('');
  const [continuousResumeRunOptions, setContinuousResumeRunOptions] = useState([]);
  const [isLoadingContinuousResumeOptions, setIsLoadingContinuousResumeOptions] = useState(false);
  const [isSubmittingRun, setIsSubmittingRun] = useState(false);
  const [stopRunConfirmTarget, setStopRunConfirmTarget] = useState(null);
  /** Chiến dịch đang xem popup «tất cả lịch đã thiết lập» (null = đóng). */
  const [campaignSchedulesModalCampaign, setCampaignSchedulesModalCampaign] = useState(null);
  const [selectedCampaignForLogs, setSelectedCampaignForLogs] = useState(null);
  const [selectedExecutionLogId, setSelectedExecutionLogId] = useState(null);
  const [flowOrderByNodeId, setFlowOrderByNodeId] = useState(new Map());
  const [activeMainTab, setActiveMainTab] = useState('active_campaigns');
  const [activeCampaignSearch, setActiveCampaignSearch] = useState('');
  const [scheduledCampaignSearch, setScheduledCampaignSearch] = useState('');
  const [pausedCampaignSearch, setPausedCampaignSearch] = useState('');
  const [activatingCampaignIds, setActivatingCampaignIds] = useState(new Set());
  const [stoppingRunIds, setStoppingRunIds] = useState(new Set());
  const selectedResumeRunId = Number.parseInt(runResumeFromId, 10);
  const isResumeRunSelected = Number.isFinite(selectedResumeRunId) && selectedResumeRunId > 0;
  const isRunResumeLocked = Boolean(runContinuousMode && runResumeMode && isResumeRunSelected);

  /** Mốc `updated_at` lớn nhất để poll execution log dạng delta (không tải lại full mỗi nhịp). */
  const executionLogDeltaCursorRef = useRef(null);
  /** Chi tiết run mới nhất sau render — dùng khi poll merge log, tránh closure cũ. */
  const selectedRunDetailRef = useRef(null);

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
    selectedRunDetailRef.current = selectedRunDetail;
  }, [selectedRunDetail]);

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

  useEffect(() => {
    if (runContinuousMode) return;
    setRunResumeMode(false);
    setRunResumeFromId('');
  }, [runContinuousMode]);

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
    executionLogDeltaCursorRef.current = null;
    try {
      const [historyRes, , full] = await Promise.all([
        campaignRunApiService.getCampaignRuns(`campaignId=${campaignId}&limit=20`),
        loadCampaignFlowOrder(campaignId),
        fetchCampaignRunDetailAllExecutionLogs(
          (rid, params) => campaignRunApiService.getCampaignRunDetail(rid, params),
          runId,
          150
        ),
      ]);
      setCampaignRunHistory(historyRes.data?.data || []);
      setSelectedRunDetail(full);
      executionLogDeltaCursorRef.current = getMaxExecutionLogUpdatedAt(full.executionLogs);
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

  /**
   * Mở popup liệt kê mọi lịch chạy của một chiến dịch (theo dữ liệu đã tải ở trang).
   *
   * @param {object} campaign bản ghi campaign
   * @returns {void}
   */
  const openCampaignSchedulesSummaryModal = (campaign) => {
    if (!campaign?.id) return;
    setCampaignSchedulesModalCampaign(campaign);
  };

  /**
   * Đóng popup tổng hợp lịch theo chiến dịch.
   *
   * @returns {void}
   */
  const closeCampaignSchedulesSummaryModal = () => {
    setCampaignSchedulesModalCampaign(null);
  };

  /**
   * Tải danh sách run continuous có thể dùng để chạy tiếp.
   *
   * Luồng hoạt động:
   * 1. Lấy lịch sử run theo campaign hiện tại.
   * 2. Chỉ giữ các run có `runMetadata.continuousMode = true` và không còn running.
   * 3. Map thành option thân thiện để hiển thị trong modal.
   *
   * @param {number|string} campaignId id campaign
   * @returns {Promise<void>}
   */
  const loadContinuousResumeRunOptions = async (campaignId) => {
    if (!campaignId) {
      setContinuousResumeRunOptions([]);
      return;
    }
    setIsLoadingContinuousResumeOptions(true);
    try {
      const response = await campaignRunApiService.getCampaignRuns(`campaignId=${campaignId}&limit=100`);
      const runs = Array.isArray(response.data?.data) ? response.data.data : [];
      const options = runs
        .filter((run) => {
          const isContinuous = Boolean(run?.runMetadata?.continuousMode);
          const status = String(run?.status || '').trim().toLowerCase();
          return isContinuous && status !== 'running';
        })
        .map((run) => {
          const runId = Number.parseInt(run?.id, 10);
          const runName = String(run?.runName || '').trim() || `Run #${run?.id}`;
          const pollIntervalMs = Number.parseInt(run?.runMetadata?.pollIntervalMs, 10);
          const pollIntervalMinutesRaw = Number.parseInt(
            run?.runMetadata?.continuousCycleMinutes ?? run?.runMetadata?.pollIntervalMinutes,
            10
          );
          const pollIntervalMinutes = normalizeContinuousPollIntervalMinutes(
            Number.isFinite(pollIntervalMs) && pollIntervalMs > 0
              ? Math.round(pollIntervalMs / (60 * 1000))
              : pollIntervalMinutesRaw
          );
          const startedAtLabel = run?.startedAt
            ? new Date(run.startedAt).toLocaleString('vi-VN')
            : 'không rõ thời gian';
          const statusLabel = String(run?.status || '').trim() || 'unknown';
          return {
            id: runId,
            runName,
            pollIntervalMinutes,
            label: `#${runId} - ${runName} (${statusLabel}, bắt đầu: ${startedAtLabel}, quét: ${pollIntervalMinutes} phút)`,
          };
        })
        .filter((item) => Number.isFinite(item.id));
      setContinuousResumeRunOptions(options);
    } catch (error) {
      setContinuousResumeRunOptions([]);
      toast.error('Không thể tải danh sách lượt continuous cũ');
    } finally {
      setIsLoadingContinuousResumeOptions(false);
    }
  };

  const openRunConfirmModal = async (campaign) => {
    if (isCampaignRunningById(campaign.id)) {
      toast.error('Chiến dịch đang chạy, vui lòng chờ hoàn tất');
      return;
    }
    const isGroupCampaign = isZaloGroupCampaign(campaign);
    setRunConfirmCampaign(campaign);
    setRunNameInput(campaign?.campaignName || '');
    setRunContinuousMode(isGroupCampaign ? false : DEFAULT_CONTINUOUS_MODE);
    setRunPollIntervalMinutes(getRandomContinuousPollIntervalMinutes());
    setRunResumeMode(false);
    setRunResumeFromId('');
    setContinuousResumeRunOptions([]);
    if (!isGroupCampaign) {
      await loadContinuousResumeRunOptions(campaign.id);
    }
    setShowRunConfirmModal(true);
  };

  const closeRunConfirmModal = (force = false) => {
    if (!force && isSubmittingRun) return;
    setShowRunConfirmModal(false);
    setRunConfirmCampaign(null);
    setRunNameInput('');
    setRunContinuousMode(DEFAULT_CONTINUOUS_MODE);
    setRunPollIntervalMinutes(getRandomContinuousPollIntervalMinutes());
    setRunResumeMode(false);
    setRunResumeFromId('');
    setContinuousResumeRunOptions([]);
    setIsLoadingContinuousResumeOptions(false);
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
      const effectiveContinuousMode = isGroupCampaign ? false : Boolean(runContinuousMode);
      const normalizedPollIntervalMinutes = normalizeContinuousPollIntervalMinutes(runPollIntervalMinutes);
      const continueRunId = effectiveContinuousMode
        && runResumeMode
        && isResumeRunSelected
        ? selectedResumeRunId
        : null;
      if (effectiveContinuousMode && runResumeMode && !continueRunId) {
        toast.error('Vui lòng chọn lượt continuous cũ để chạy tiếp');
        return;
      }
      await campaignRunApiService.runCampaign(runConfirmCampaign.id, {
        source: 'campaign_run',
        runName: runNameInput?.trim() || runConfirmCampaign.campaignName,
        adjacentZaloNodeDelayMs: ADJACENT_ZALO_NODE_DELAY_MS,
        continuousMode: effectiveContinuousMode,
        ...(effectiveContinuousMode
          ? {
            pollIntervalMs: normalizedPollIntervalMinutes * 60 * 1000,
            pollIntervalMinutes: normalizedPollIntervalMinutes,
            continuousCycleMinutes: normalizedPollIntervalMinutes,
          }
          : {}),
        ...(continueRunId ? { continueRunId } : {}),
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

  useEffect(() => {
    if (!isRunResumeLocked) return;
    const selectedRun = continuousResumeRunOptions.find(
      (item) => Number.parseInt(item?.id, 10) === selectedResumeRunId
    );
    if (!selectedRun) return;
    setRunNameInput(String(selectedRun.runName || runConfirmCampaign?.campaignName || '').trim());
    setRunPollIntervalMinutes(selectedRun.pollIntervalMinutes);
  }, [
    isRunResumeLocked,
    selectedResumeRunId,
    continuousResumeRunOptions,
    runConfirmCampaign?.campaignName,
  ]);

  const openCampaignLogs = async (campaign) => {
    setSelectedCampaignForLogs(campaign);
    setSelectedRunDetail(null);
    setSelectedExecutionLogId(null);
    setFlowOrderByNodeId(new Map());
    setIsLoadingRunDetail(true);
    executionLogDeltaCursorRef.current = null;
    try {
      const [historyRes] = await Promise.all([
        campaignRunApiService.getCampaignRuns(`campaignId=${campaign.id}&limit=20`),
        loadCampaignFlowOrder(campaign.id),
      ]);
      const history = historyRes.data?.data || [];
      setCampaignRunHistory(history);
      if (history.length > 0) {
        const latestRunId = history[0].id;
        const full = await fetchCampaignRunDetailAllExecutionLogs(
          (rid, params) => campaignRunApiService.getCampaignRunDetail(rid, params),
          latestRunId,
          150
        );
        setSelectedRunDetail(full);
        executionLogDeltaCursorRef.current = getMaxExecutionLogUpdatedAt(full.executionLogs);
      } else {
        setSelectedRunDetail(null);
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
    executionLogDeltaCursorRef.current = null;
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

        const cursor = executionLogDeltaCursorRef.current;

        if (cursor) {
          const runRes = await campaignRunApiService.getCampaignRunDetail(targetRunId, {
            executionLogsLimit: 500,
            executionLogsUpdatedAfter: cursor,
          });
          if (isCancelled) return;
          const incoming = runRes.data?.data;
          if (!incoming) return;

          const prevDetail = selectedRunDetailRef.current;
          if (!prevDetail || Number(prevDetail.id) !== Number(targetRunId)) {
            executionLogDeltaCursorRef.current = getMaxExecutionLogUpdatedAt(incoming.executionLogs || []);
            setSelectedRunDetail(incoming);
          } else {
            const map = new Map((prevDetail.executionLogs || []).map((l) => [l.id, l]));
            (incoming.executionLogs || []).forEach((l) => map.set(l.id, l));
            const merged = Array.from(map.values());
            executionLogDeltaCursorRef.current = getMaxExecutionLogUpdatedAt(merged);
            setSelectedRunDetail({
              ...incoming,
              executionLogs: merged,
            });
          }
        } else {
          const full = await fetchCampaignRunDetailAllExecutionLogs(
            (rid, params) => campaignRunApiService.getCampaignRunDetail(rid, params),
            targetRunId,
            150
          );
          if (isCancelled) return;
          setSelectedRunDetail(full);
          executionLogDeltaCursorRef.current = getMaxExecutionLogUpdatedAt(full.executionLogs);
        }
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
      customIntervalDays: '2',
      delayValue: '30',
      delayUnit: 'minutes',
      delayPreviewAt: null,
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

    if (scheduleForm.scheduleType !== 'after_delay' && !scheduleForm.scheduleTime) {
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

    if (scheduleForm.scheduleType === 'custom') {
      const intervalDays = Number.parseInt(scheduleForm.customIntervalDays, 10);
      if (!Number.isFinite(intervalDays) || intervalDays <= 0) {
        toast.error('Vui lòng nhập số ngày lặp lại hợp lệ');
        return;
      }
    }

    if (scheduleForm.scheduleType === 'after_delay' && !scheduleForm.delayPreviewAt) {
      toast.error('Vui lòng nhập thời gian trễ hợp lệ');
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
        scheduleType: scheduleForm.scheduleType === 'after_delay' ? 'once' : scheduleForm.scheduleType,
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

  useEffect(() => {
    if (scheduleForm.scheduleType !== 'after_delay') {
      if (scheduleForm.delayPreviewAt !== null) {
        setScheduleForm((prev) => ({ ...prev, delayPreviewAt: null }));
      }
      return;
    }
    const previewAt = buildDelayedRunDate(scheduleForm.delayValue, scheduleForm.delayUnit);
    const normalizedPreview = previewAt ? previewAt.toISOString() : null;
    if (normalizedPreview === scheduleForm.delayPreviewAt) return;
    setScheduleForm((prev) => ({
      ...prev,
      delayPreviewAt: normalizedPreview,
    }));
  }, [
    scheduleForm.scheduleType,
    scheduleForm.delayValue,
    scheduleForm.delayUnit,
    scheduleForm.delayPreviewAt,
  ]);

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
        executionLogDeltaCursorRef.current = null;
        const [full, historyRes] = await Promise.all([
          fetchCampaignRunDetailAllExecutionLogs(
            (rid, params) => campaignRunApiService.getCampaignRunDetail(rid, params),
            runId,
            150
          ),
          campaignRunApiService.getCampaignRuns(`campaignId=${selectedCampaignForLogs.id}&limit=20`),
        ]);
        setSelectedRunDetail(full);
        setCampaignRunHistory(historyRes.data?.data || []);
        executionLogDeltaCursorRef.current = getMaxExecutionLogUpdatedAt(full.executionLogs);
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
        onOpenCampaignSchedulesSummaryModal={openCampaignSchedulesSummaryModal}
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
        isRunResumeLocked={isRunResumeLocked}
        runResumeMode={runResumeMode}
        setRunResumeMode={setRunResumeMode}
        runResumeFromId={runResumeFromId}
        setRunResumeFromId={setRunResumeFromId}
        continuousResumeRunOptions={continuousResumeRunOptions}
        isLoadingContinuousResumeOptions={isLoadingContinuousResumeOptions}
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
        campaignSchedulesModalCampaign={campaignSchedulesModalCampaign}
        closeCampaignSchedulesSummaryModal={closeCampaignSchedulesSummaryModal}
        allSchedules={schedules}
      />
    </div>
  );
};

export default CampaignRun;
