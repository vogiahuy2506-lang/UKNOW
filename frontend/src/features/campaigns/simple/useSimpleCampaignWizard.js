import { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '../../../i18n';
import campaignApiService from '../services/campaignApi.service';
import campaignRunApiService from '../services/campaignRunApi.service';
import { describeOverlapSuggestions, extractScheduleOverlapError, formatEstimateDateTime } from '../utils/campaignEstimate.helpers';
import { normalizeContinuousPollIntervalMinutes } from '../hooks/useCampaignRunController';
import {
  SIMPLE_STEP_IDS,
  applyChannelChange,
  applySenderChange,
  buildRunBody,
  buildSchedulePayload,
  buildSimpleCampaignBody,
  buildSimplePreviewBody,
  createDefaultSchedule,
  createInitialWizardState,
  getServerMessage,
  isScheduleBased,
  isStepComplete,
  normalizePreview,
  reconcileSchedule,
  unwrapResponseData,
  validateSchedule,
} from './simpleCampaign.helpers';

const IDLE_PREVIEW = Object.freeze({ status: 'idle', data: null, message: '' });
const IDLE_SUBMIT = Object.freeze({ status: 'idle', stage: null, message: '' });

/**
 * Trạng thái + hành động của trình tạo chiến dịch "Từng bước".
 *
 * Luồng "Bắt đầu gửi" / "Đặt lịch": (xoá nháp cũ nếu lần trước tạo xong mà chạy/đặt lịch lỗi) → `POST /campaigns/simple` →
 * - gửi ngay / tự động gửi cho người mới: `runCampaign` (tự động = `continuousMode`);
 * - hẹn giờ / lặp lại: `createCampaignSchedule` (cron giờ Việt Nam, bật + kích hoạt chiến dịch trong cùng lệnh).
 * Kết quả:
 * - Server trả 200 `requiresApproval:true` → phase `approval` (KHÔNG báo "đang gửi").
 * - Đặt lịch xong → phase `scheduled` (màn "Đã hẹn gửi").
 * - Chạy/đặt lịch lỗi sau khi đã tạo → giữ `draftCampaignId`; lần bấm kế DELETE nháp đó trước khi tạo bản mới để khỏi đẻ nháp rác.
 *
 * @returns {object} xem `return` cuối hàm
 */
export default function useSimpleCampaignWizard() {
  const { t } = useI18n();
  const [state, setState] = useState(createInitialWizardState);
  const [stepId, setStepId] = useState(SIMPLE_STEP_IDS[0]);
  /** 'editing' | 'done' | 'approval' | 'scheduled' */
  const [phase, setPhase] = useState('editing');
  const [preview, setPreview] = useState(IDLE_PREVIEW);
  const [submitState, setSubmitState] = useState(IDLE_SUBMIT);
  const [result, setResult] = useState(null);
  const [draftCampaignId, setDraftCampaignId] = useState(null);

  const stateRef = useRef(state);
  stateRef.current = state;
  const tRef = useRef(t);
  tRef.current = t;
  const previewSeqRef = useRef(0);
  const submittingRef = useRef(false);
  const draftIdRef = useRef(null);

  // Rời trang giữa chừng: huỷ mọi preview đang bay để nó không ghi vào state đã gỡ.
  useEffect(() => () => {
    previewSeqRef.current += 1;
  }, []);

  const stepIndex = SIMPLE_STEP_IDS.indexOf(stepId);
  const canContinue = isStepComplete(stepId, state);
  // Nút "Bắt đầu gửi": chỉ khi server đã kiểm xong VÀ nói `readyToCreate=true`; đang gửi thì khoá để khỏi tạo hai lần.
  const canStart = stepId === 'review'
    && preview.status === 'ready'
    && preview.data?.readyToCreate === true
    && submitState.status !== 'submitting';

  const selectChannel = useCallback((channel) => {
    setState((prev) => applyChannelChange(prev, channel));
  }, []);

  const selectSender = useCallback((sender) => {
    setState((prev) => applySenderChange(prev, sender));
  }, []);

  const selectAudienceType = useCallback((type) => {
    // Đổi nguồn có thể làm "Tự động gửi cho người mới" hết hợp lệ → reconcile về "Gửi ngay".
    setState((prev) => (prev.audience.type === type ? prev : reconcileSchedule({ ...prev, audience: { ...prev.audience, type } })));
  }, []);

  const patchAudience = useCallback((patch) => {
    setState((prev) => ({ ...prev, audience: { ...prev.audience, ...patch } }));
  }, []);

  const patchContent = useCallback((patch) => {
    setState((prev) => ({ ...prev, content: { ...prev.content, ...patch } }));
  }, []);

  /** Bấm một thẻ ở bước "Khi nào gửi?": bấm lại đúng thẻ đang chọn thì giữ nguyên (khỏi mất giờ đã nhập). */
  const selectWhen = useCallback((type) => {
    setState((prev) => {
      if (prev.schedule?.type === type) return prev;
      return {
        ...prev,
        schedule: createDefaultSchedule(type, {
          // Chu kỳ quét người mới: mặc định như màn chạy chiến dịch cũ (ngẫu nhiên 120–300 phút, bước 5).
          pollIntervalMinutes: type === 'continuous' ? normalizeContinuousPollIntervalMinutes(null) : null,
        }),
      };
    });
  }, []);

  /** Sửa trường của cách gửi đang chọn (ngày, giờ, tần suất, thứ…). */
  const patchSchedule = useCallback((patch) => {
    setState((prev) => ({ ...prev, schedule: { ...prev.schedule, ...patch } }));
  }, []);

  const setCampaignName = useCallback((campaignName) => {
    setState((prev) => ({ ...prev, campaignName }));
  }, []);

  const invalidatePreview = useCallback(() => {
    previewSeqRef.current += 1;
  }, []);

  /** Gọi `POST /campaigns/simple/preview` (không ghi DB). Lượt cũ bay về muộn bị bỏ. */
  const loadPreview = useCallback(async () => {
    previewSeqRef.current += 1;
    const seq = previewSeqRef.current;
    setPreview({ status: 'loading', data: null, message: '' });
    try {
      const response = await campaignApiService.previewSimpleCampaign(buildSimplePreviewBody(stateRef.current));
      if (seq !== previewSeqRef.current) return;
      setPreview({ status: 'ready', data: normalizePreview(unwrapResponseData(response)), message: '' });
    } catch (error) {
      if (seq !== previewSeqRef.current) return;
      // Lỗi nghiệp vụ 4xx (vd danh sách khách vượt trần) mang câu tiếng người — hiện nguyên văn và chặn nút gửi.
      setPreview({ status: 'error', data: null, message: getServerMessage(error, '') });
    }
  }, []);

  const goNext = useCallback(() => {
    const current = stateRef.current;
    const index = SIMPLE_STEP_IDS.indexOf(stepId);
    if (index < 0 || index >= SIMPLE_STEP_IDS.length - 1 || !isStepComplete(stepId, current)) return;
    const nextStep = SIMPLE_STEP_IDS[index + 1];
    if (nextStep === 'review' && !current.campaignName.trim()) {
      const channelTitle = tRef.current(`simpleCampaign.channel.${current.channel}.title`);
      setState((prev) => ({
        ...prev,
        campaignName: `${channelTitle} – ${formatEstimateDateTime(new Date())}`,
      }));
    }
    setStepId(nextStep);
  }, [stepId]);

  /** @returns {boolean} true nếu lùi được một bước (false = đang ở bước đầu, nơi gọi tự rời trang). */
  const goBack = useCallback(() => {
    const index = SIMPLE_STEP_IDS.indexOf(stepId);
    if (index <= 0) return false;
    if (stepId === 'review') {
      invalidatePreview();
      setPreview(IDLE_PREVIEW);
      setSubmitState(IDLE_SUBMIT);
    }
    setStepId(SIMPLE_STEP_IDS[index - 1]);
    return true;
  }, [stepId, invalidatePreview]);

  /** Bấm thanh tiến trình: chỉ lùi về bước đã qua. */
  const goToStep = useCallback((targetId) => {
    const target = SIMPLE_STEP_IDS.indexOf(targetId);
    const index = SIMPLE_STEP_IDS.indexOf(stepId);
    if (target < 0 || target >= index) return;
    if (stepId === 'review') {
      invalidatePreview();
      setPreview(IDLE_PREVIEW);
      setSubmitState(IDLE_SUBMIT);
    }
    setStepId(targetId);
  }, [stepId, invalidatePreview]);

  /** "Bắt đầu gửi": tạo chiến dịch rồi chạy. Chống bấm đúp bằng ref (state chỉ cập nhật sau lần vẽ kế). */
  const submit = useCallback(async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitState({ status: 'submitting', stage: null, message: '' });
    const snapshot = stateRef.current;
    const translate = tRef.current;
    try {
      // Giờ hẹn có thể đã trôi qua trong lúc người dùng đọc màn Xem lại → kiểm lại TRƯỚC khi tạo (khỏi đẻ nháp rồi mới bị từ chối).
      const scheduleCheck = validateSchedule(snapshot.schedule, new Date());
      if (!scheduleCheck.ok) {
        setSubmitState({
          status: 'error',
          stage: 'input',
          message: translate(scheduleCheck.reason === 'too_soon' ? 'simpleCampaign.when.scheduled.tooSoon' : 'simpleCampaign.when.scheduleIncomplete'),
        });
        return;
      }

      // Lần trước tạo xong mà chạy lỗi: người dùng đã sửa rồi bấm lại → bỏ nháp cũ, tạo bản mới.
      if (draftIdRef.current) {
        const staleId = draftIdRef.current;
        try {
          await campaignApiService.deleteCampaign(staleId);
        } catch (deleteError) {
          // 404 = nháp đã mất, coi như xong. Lỗi khác: không chặn người dùng chỉ vì dọn rác thất bại.
          if (deleteError?.response?.status !== 404) {
            console.warn('[SimpleCampaign] Không xoá được nháp cũ', staleId, deleteError?.message);
          }
        }
        draftIdRef.current = null;
        setDraftCampaignId(null);
      }

      let created;
      try {
        created = unwrapResponseData(await campaignApiService.createSimpleCampaign(buildSimpleCampaignBody(snapshot)));
      } catch (error) {
        setSubmitState({
          status: 'error',
          stage: 'create',
          message: getServerMessage(error, translate('simpleCampaign.review.createFailed')),
        });
        return;
      }
      const campaignId = created?.campaignId;
      if (!campaignId) {
        setSubmitState({ status: 'error', stage: 'create', message: translate('simpleCampaign.review.createFailed') });
        return;
      }
      draftIdRef.current = campaignId;
      setDraftCampaignId(campaignId);
      const campaignName = String(created?.campaignName || snapshot.campaignName || '').trim();

      const runName = snapshot.campaignName.trim() || campaignName;

      // Hẹn giờ / lặp lại: không chạy ngay mà đặt LỊCH (cron giờ Việt Nam). Lỗi → giữ nháp để lần bấm sau xoá nháp này trước.
      if (isScheduleBased(snapshot.schedule)) {
        try {
          await campaignRunApiService.createCampaignSchedule(
            buildSchedulePayload(snapshot.schedule, { campaignId, scheduleName: runName }),
          );
        } catch (error) {
          // 409 SCHEDULE_OVERLAP: hiện nguyên câu của server (đã nêu giờ chạy / giờ xong dự kiến) + gợi ý, không toast chung.
          const overlap = extractScheduleOverlapError(error);
          setSubmitState({
            status: 'error',
            stage: 'schedule',
            message: overlap?.message || getServerMessage(error, translate('simpleCampaign.review.scheduleFailed')),
            suggestions: overlap ? describeOverlapSuggestions(overlap.suggestions, translate) : [],
          });
          return;
        }
        draftIdRef.current = null;
        setDraftCampaignId(null);
        setResult({ campaignId, campaignName, channel: snapshot.channel, schedule: snapshot.schedule });
        setPhase('scheduled');
        setSubmitState(IDLE_SUBMIT);
        return;
      }

      try {
        const runResponse = await campaignRunApiService.runCampaign(campaignId, buildRunBody(snapshot.schedule, runName));
        const runData = unwrapResponseData(runResponse);
        // 200 không có nghĩa "đang gửi": chiến dịch vượt ngưỡng của nhân viên thì chỉ chuyển sang chờ chủ duyệt.
        const requiresApproval = runData?.requiresApproval === true || runResponse?.data?.requiresApproval === true;
        draftIdRef.current = null;
        setDraftCampaignId(null);
        setResult({ campaignId, campaignName, channel: snapshot.channel });
        setPhase(requiresApproval ? 'approval' : 'done');
        setSubmitState(IDLE_SUBMIT);
      } catch (error) {
        // Giữ campaignId (draftIdRef) để lần bấm sau xoá nháp này trước khi tạo mới.
        setSubmitState({
          status: 'error',
          stage: 'run',
          message: getServerMessage(error, translate('simpleCampaign.review.runFailed')),
        });
      }
    } finally {
      submittingRef.current = false;
    }
  }, []);

  /** Làm lại từ đầu (nút "Tạo chiến dịch khác"). */
  const reset = useCallback(() => {
    invalidatePreview();
    draftIdRef.current = null;
    setDraftCampaignId(null);
    setState(createInitialWizardState());
    setStepId(SIMPLE_STEP_IDS[0]);
    setPhase('editing');
    setPreview(IDLE_PREVIEW);
    setSubmitState(IDLE_SUBMIT);
    setResult(null);
  }, [invalidatePreview]);

  return {
    state,
    stepId,
    stepIndex,
    phase,
    canContinue,
    canStart,
    preview,
    submitState,
    result,
    draftCampaignId,
    selectChannel,
    selectSender,
    selectAudienceType,
    patchAudience,
    patchContent,
    selectWhen,
    patchSchedule,
    setCampaignName,
    loadPreview,
    invalidatePreview,
    goNext,
    goBack,
    goToStep,
    submit,
    reset,
  };
}
