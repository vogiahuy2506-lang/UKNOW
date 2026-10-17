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
  MAX_FOLLOW_UPS,
  createDefaultSchedule,
  createFollowUp,
  createInitialWizardState,
  getServerMessage,
  isScheduleBased,
  isStepComplete,
  normalizePreview,
  reconcileSchedule,
  senderKindOf,
  unwrapResponseData,
  validateSchedule,
} from './simpleCampaign.helpers';
import {
  MULTIPLE_SCHEDULES_CODE,
  buildEditBody,
  buildScheduleUpdatePayload,
  buildStateFromServer,
  fingerprintEditState,
  makeFingerprint,
  parseServerSchedules,
  planScheduleSync,
  scheduleSignature,
} from './simpleCampaign.edit.helpers';
import { loadSenderAccounts } from './loadSenderAccounts';
import { applyTemplateLabels, fetchTemplateLabels } from './resolveTemplateLabels';

const IDLE_PREVIEW = Object.freeze({ status: 'idle', data: null, message: '' });
const IDLE_SUBMIT = Object.freeze({ status: 'idle', stage: null, message: '' });
/** Chế độ sửa: lỗi "đã đủ chỗ tạo thêm chiến dịch" không áp cho việc SỬA một chiến dịch đã có. */
const LIMIT_REACHED_CODE = 'campaign_limit_reached';

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
 * Chế độ SỬA (`campaignId` có giá trị — PLAN_HAI_TAB_TUNG_BUOC_SO_DO_2026-10-17): nạp `GET /campaigns/:id/simple`, điền sẵn mọi bước,
 * cho nhảy tự do, và `saveEdit` ghi bằng `PUT /campaigns/:id/simple` (+ tạo / sửa / xoá đúng 1 lịch bằng API lịch sẵn có).
 *
 * @param {{ campaignId?: number|string|null }} [options]
 * @returns {object} xem `return` cuối hàm
 */
export default function useSimpleCampaignWizard({ campaignId = null } = {}) {
  const isEdit = Boolean(campaignId);
  const { t } = useI18n();
  const [state, setState] = useState(createInitialWizardState);
  const [stepId, setStepId] = useState(SIMPLE_STEP_IDS[0]);
  /** 'editing' | 'done' | 'approval' | 'scheduled' */
  const [phase, setPhase] = useState('editing');
  const [preview, setPreview] = useState(IDLE_PREVIEW);
  const [submitState, setSubmitState] = useState(IDLE_SUBMIT);
  const [result, setResult] = useState(null);
  const [draftCampaignId, setDraftCampaignId] = useState(null);
  // Chế độ sửa: tình trạng nạp, thông tin phụ của chiến dịch, dấu vân tay lúc nạp (để biết còn thay đổi chưa lưu), mốc lưu gần nhất.
  const [editLoad, setEditLoad] = useState(() => ({ status: isEdit ? 'loading' : 'idle', message: '' }));
  const [editInfo, setEditInfo] = useState(null);
  const [baseline, setBaseline] = useState(null);
  const [savedAt, setSavedAt] = useState(null);

  const stateRef = useRef(state);
  stateRef.current = state;
  const tRef = useRef(t);
  tRef.current = t;
  const previewSeqRef = useRef(0);
  const submittingRef = useRef(false);
  const draftIdRef = useRef(null);
  const editInfoRef = useRef(null);
  editInfoRef.current = editInfo;
  const loadSeqRef = useRef(0);

  // Rời trang giữa chừng: huỷ mọi preview đang bay để nó không ghi vào state đã gỡ.
  useEffect(() => () => {
    previewSeqRef.current += 1;
  }, []);

  /** Bước đã đủ thông tin chưa. Chế độ sửa: lịch giữ nguyên (kể cả giờ đã qua) hoặc đang khoá thì không bị hỏi lại giờ hẹn. */
  const isStepDone = (id) => {
    if (isEdit && id === 'when' && editInfo) {
      if (editInfo.scheduleLocked) return true;
      if (scheduleSignature(state.schedule) === editInfo.originalSignature) return true;
    }
    return isStepComplete(id, state);
  };
  const stepIndex = SIMPLE_STEP_IDS.indexOf(stepId);
  const canContinue = isStepDone(stepId);
  // Nút "Bắt đầu gửi": chỉ khi server đã kiểm xong VÀ nói `readyToCreate=true`; đang gửi thì khoá để khỏi tạo hai lần.
  const canStart = stepId === 'review'
    && preview.status === 'ready'
    && preview.data?.readyToCreate === true
    && submitState.status !== 'submitting';

  // ── Chế độ sửa ───────────────────────────────────────────────────────────────────────────────────────────────────────────
  const incompleteStepId = isEdit ? (SIMPLE_STEP_IDS.find((id) => id !== 'review' && !isStepDone(id)) || null) : null;
  const previewIssues = preview.status === 'ready' ? (preview.data?.issues || []) : [];
  const previewLimitOnly = preview.status === 'ready'
    && preview.data?.readyToCreate !== true
    && previewIssues.some((issue) => issue?.code === LIMIT_REACHED_CODE)
    && previewIssues.every((issue) => issue?.code === LIMIT_REACHED_CODE || (typeof issue === 'object' && issue?.severity === 'warning'));
  const canSaveEdit = isEdit
    && stepId === 'review'
    && editLoad.status === 'ready'
    && !incompleteStepId
    && preview.status === 'ready'
    && (preview.data?.readyToCreate === true || previewLimitOnly)
    && submitState.status !== 'submitting';
  const isDirty = isEdit && baseline !== null && fingerprintEditState(state) !== baseline;
  const isReadOnly = isEdit && editLoad.status === 'ready' && Boolean(editInfo?.readOnly);

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

  /** Chuỗi tin: thêm tin sau (tối đa 9), xoá, sửa độ trễ, sửa nội dung. */
  const addFollowUp = useCallback(() => {
    setState((prev) => {
      const list = Array.isArray(prev.followUps) ? prev.followUps : [];
      return list.length >= MAX_FOLLOW_UPS ? prev : { ...prev, followUps: [...list, createFollowUp()] };
    });
  }, []);

  const removeFollowUp = useCallback((id) => {
    setState((prev) => ({ ...prev, followUps: (prev.followUps || []).filter((item) => item.id !== id) }));
  }, []);

  const patchFollowUp = useCallback((id, patch) => {
    setState((prev) => ({
      ...prev,
      followUps: (prev.followUps || []).map((item) => (item.id === id ? { ...item, ...patch } : item)),
    }));
  }, []);

  const patchFollowUpContent = useCallback((id, patch) => {
    setState((prev) => ({
      ...prev,
      followUps: (prev.followUps || []).map((item) => (item.id === id ? { ...item, content: { ...item.content, ...patch } } : item)),
    }));
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
    const info = editInfoRef.current;
    const keptSchedule = isEdit && stepId === 'when' && info
      && (info.scheduleLocked || scheduleSignature(current.schedule) === info.originalSignature);
    if (index < 0 || index >= SIMPLE_STEP_IDS.length - 1 || !(keptSchedule || isStepComplete(stepId, current))) return;
    const nextStep = SIMPLE_STEP_IDS[index + 1];
    if (nextStep === 'review' && !current.campaignName.trim()) {
      const channelTitle = tRef.current(`simpleCampaign.channel.${current.channel}.title`);
      setState((prev) => ({
        ...prev,
        campaignName: `${channelTitle} – ${formatEstimateDateTime(new Date())}`,
      }));
    }
    setStepId(nextStep);
  }, [stepId, isEdit]);

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

  /** Bấm thanh tiến trình: chỉ lùi về bước đã qua (chế độ sửa: nhảy tự do vì dữ liệu đã đủ). */
  const goToStep = useCallback((targetId) => {
    const target = SIMPLE_STEP_IDS.indexOf(targetId);
    const index = SIMPLE_STEP_IDS.indexOf(stepId);
    if (target < 0 || target === index || (!isEdit && target >= index)) return;
    if (stepId === 'review') {
      invalidatePreview();
      setPreview(IDLE_PREVIEW);
      setSubmitState(IDLE_SUBMIT);
    }
    setStepId(targetId);
  }, [stepId, isEdit, invalidatePreview]);

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

  /**
   * Nạp (hoặc nạp lại) chiến dịch từ server. `quiet`: không đổi màn hình sang "đang tải" và giữ bước đang đứng (dùng sau khi lưu).
   * Mỗi lần nạp xong là một mốc "đã lưu": dấu vân tay baseline đặt lại theo đúng dữ liệu server.
   */
  const loadEdit = useCallback(async ({ quiet = false } = {}) => {
    if (!campaignId) return;
    loadSeqRef.current += 1;
    const seq = loadSeqRef.current;
    if (!quiet) setEditLoad({ status: 'loading', message: '' });
    try {
      const data = unwrapResponseData(await campaignApiService.getSimpleCampaign(campaignId));
      if (seq !== loadSeqRef.current) return;
      const next = buildStateFromServer(data);
      const parsed = parseServerSchedules(data?.schedules);
      const reasons = Array.isArray(data?.readOnlyReasons) ? data.readOnlyReasons : [];
      const scheduleLocked = parsed.locked
        || reasons.some((reason) => reason?.code === MULTIPLE_SCHEDULES_CODE)
        || (Array.isArray(data?.schedules) && data.schedules.length > 1);
      setEditInfo({
        readOnly: data?.editable !== true || data?.running === true || !next,
        running: data?.running === true,
        reasons,
        campaignStatus: String(data?.status || ''),
        campaignName: String(data?.campaignName || ''),
        original: parsed.original,
        originalSignature: scheduleSignature(parsed.schedule),
        scheduleLocked,
        lockedCron: parsed.lockedCron,
        hasForm: Boolean(next),
      });
      if (next) {
        setState(next);
        setBaseline(fingerprintEditState(next));
      } else {
        setBaseline(null);
      }
      invalidatePreview();
      setPreview(IDLE_PREVIEW);
      setSubmitState(IDLE_SUBMIT);
      if (!quiet) setStepId('review');
      setEditLoad({ status: 'ready', message: '' });

      // Điền tên mẫu (GET chỉ trả id; trình mở ở bước Xem lại nên bước Nội dung chưa mount để tự tra) — không chặn màn hình.
      if (next) {
        fetchTemplateLabels(next).then((labels) => {
          if (seq !== loadSeqRef.current) return;
          setState((prev) => applyTemplateLabels(prev, labels));
        }).catch(() => {});
      }

      // Điền tên tài khoản gửi (GET chỉ trả id) — không chặn màn hình, lỗi thì để trống.
      if (next?.sender?.id) {
        try {
          const accounts = await loadSenderAccounts(senderKindOf(next.channel));
          if (seq !== loadSeqRef.current) return;
          const found = accounts.find((account) => String(account.id) === String(next.sender.id));
          if (found) {
            setState((prev) => (String(prev.sender?.id ?? '') === String(found.id) && !prev.sender.label
              ? { ...prev, sender: { id: found.id, label: found.label } }
              : prev));
          }
        } catch {
          // Không có tên thì câu tóm tắt chỉ thiếu tên tài khoản.
        }
      }
    } catch (error) {
      if (seq !== loadSeqRef.current) return;
      setEditLoad({ status: 'error', message: getServerMessage(error, tRef.current('simpleCampaign.edit.loadFailed')) });
    }
  }, [campaignId, invalidatePreview]);

  useEffect(() => {
    if (!campaignId) return undefined;
    loadEdit();
    return () => {
      loadSeqRef.current += 1;
    };
  }, [campaignId, loadEdit]);

  /**
   * Lưu thay đổi ở chế độ sửa. `mode`: 'save' (chỉ lưu) · 'run' (lưu rồi chạy ngay) · 'continuous' (lưu rồi bật tự động gửi cho người mới).
   * Thứ tự: PUT nội dung → đồng bộ đúng 1 lịch (tạo / sửa / xoá) → nạp lại từ server → (nếu có) chạy.
   *
   * @param {'save'|'run'|'continuous'} [mode]
   * @returns {Promise<boolean>} true khi phần LƯU đã xong (nơi gọi dùng để chuyển tab sau "Lưu rồi chuyển")
   */
  const saveEdit = useCallback(async (mode = 'save') => {
    const info = editInfoRef.current;
    if (!campaignId || !info || submittingRef.current) return false;
    submittingRef.current = true;
    setSubmitState({ status: 'submitting', stage: null, message: '' });
    const snapshot = stateRef.current;
    const translate = tRef.current;
    try {
      const plan = planScheduleSync({ original: info.original, schedule: snapshot.schedule, locked: info.scheduleLocked });
      if (plan === 'create' || plan === 'update') {
        const scheduleCheck = validateSchedule(snapshot.schedule, new Date());
        if (!scheduleCheck.ok) {
          setSubmitState({
            status: 'error',
            stage: 'input',
            message: translate(scheduleCheck.reason === 'too_soon' ? 'simpleCampaign.when.scheduled.tooSoon' : 'simpleCampaign.when.scheduleIncomplete'),
          });
          return false;
        }
      }

      const body = buildEditBody(snapshot);
      try {
        await campaignApiService.updateSimpleCampaign(campaignId, body);
      } catch (error) {
        setSubmitState({ status: 'error', stage: 'save', message: getServerMessage(error, translate('simpleCampaign.edit.saveFailed')) });
        return false;
      }

      const runName = snapshot.campaignName.trim() || info.campaignName;
      if (plan !== 'none') {
        try {
          if (plan === 'create') {
            await campaignRunApiService.createCampaignSchedule(buildSchedulePayload(snapshot.schedule, { campaignId, scheduleName: runName }));
          } else if (plan === 'update') {
            await campaignRunApiService.updateCampaignSchedule(info.original.id, buildScheduleUpdatePayload(snapshot.schedule));
          } else {
            await campaignRunApiService.deleteCampaignSchedule(info.original.id);
          }
        } catch (error) {
          // Nội dung đã lưu rồi: mốc "đã lưu" dời theo body mới, chỉ lịch còn lệch (người dùng sửa giờ rồi bấm lưu lại).
          setBaseline(makeFingerprint(body, info.originalSignature));
          const overlap = extractScheduleOverlapError(error);
          setSubmitState({
            status: 'error',
            stage: 'schedule',
            message: overlap?.message || getServerMessage(error, translate('simpleCampaign.edit.scheduleFailed')),
            suggestions: overlap ? describeOverlapSuggestions(overlap.suggestions, translate) : [],
          });
          return false;
        }
      }

      await loadEdit({ quiet: true });
      setSavedAt(Date.now());
      if (mode === 'save') return true;

      try {
        const runSchedule = mode === 'continuous'
          ? { type: 'continuous', pollIntervalMinutes: normalizeContinuousPollIntervalMinutes(null) }
          : { type: 'now' };
        const runResponse = await campaignRunApiService.runCampaign(campaignId, buildRunBody(runSchedule, runName));
        const runData = unwrapResponseData(runResponse);
        const requiresApproval = runData?.requiresApproval === true || runResponse?.data?.requiresApproval === true;
        setResult({ campaignId, campaignName: runName, channel: snapshot.channel });
        setPhase(requiresApproval ? 'approval' : 'done');
        setSubmitState(IDLE_SUBMIT);
      } catch (error) {
        // Phần lưu đã xong; chỉ lệnh chạy lỗi.
        setSubmitState({ status: 'error', stage: 'run', message: getServerMessage(error, translate('simpleCampaign.edit.runFailed')) });
      }
      return true;
    } finally {
      submittingRef.current = false;
    }
  }, [campaignId, loadEdit]);

  /** Từ màn "Đang gửi" / "Chờ duyệt" quay lại chi tiết chiến dịch (nạp lại từ server). */
  const backToCampaign = useCallback(() => {
    setPhase('editing');
    setResult(null);
    setSubmitState(IDLE_SUBMIT);
    loadEdit();
  }, [loadEdit]);

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
    addFollowUp,
    removeFollowUp,
    patchFollowUp,
    patchFollowUpContent,
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
    // Chế độ sửa
    isEdit,
    editLoad,
    editInfo,
    isDirty,
    isReadOnly,
    savedAt,
    canSaveEdit,
    incompleteStepId,
    loadEdit,
    saveEdit,
    backToCampaign,
  };
}
