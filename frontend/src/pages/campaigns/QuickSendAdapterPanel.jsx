import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  HiOutlinePaperAirplane,
  HiOutlineCheckCircle,
  HiOutlineXCircle,
  HiOutlineRefresh,
  HiOutlinePaperClip,
  HiOutlineChevronRight,
  HiOutlineClock,
  HiOutlineMoon,
  HiOutlineX,
  HiOutlinePlus,
} from 'react-icons/hi';
import { useI18n } from '../../i18n';
import api from '../../services/api';
import campaignApiService from '../../features/campaigns/services/campaignApi.service';
import campaignBuilderApiService from '../../features/campaigns/services/campaignBuilderApi.service';
import zaloTemplateApiService from '../../features/templates/services/zaloTemplateApi.service';
import ChannelTemplateAttachmentPicker from '../../features/campaigns/components/ChannelTemplateAttachmentPicker';
import { validateChannelAttachments } from '../../features/campaigns/utils/channelAttachments';
import useStorageQuota from '../../features/storage/useStorageQuota';
import { validateFilesBeforeUpload, getUploadValidationErrorMessage } from '../../features/storage/validateUpload';
import { notifyStorageQuotaRefresh } from '../../features/storage/storageEvents';
import { resolveActionIdempotencyKey } from '../../utils/idempotency.util';
import {
  MAX_DEFERRED_RESEND_WAIT_MS,
  quickSendSleepWithCountdown,
  getQuickSendRandomDelayMs,
  formatResumeTimeVn,
} from './quickSendPacing.util';
import {
  ADAPTER_CHANNELS,
  parseManualAdapterRecipients,
  shouldStopBatchOnFailedItem,
  shouldStopBatchOnHttpError,
} from './quickSendAdapter.util';

function formatFileSize(bytes) {
  if (!bytes) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let unitIndex = 0;
  let size = bytes;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

const DEFERRED_REASON_I18N_KEYS = {
  quiet_hours: 'quickSend.deferredReasonQuietHours',
  rate_limited: 'quickSend.deferredReasonRateLimited',
  inter_message_delay: 'quickSend.deferredReasonInterMessageDelay',
  provider_rate_limit: 'quickSendAdapter.deferredReasonProviderRateLimit',
};

const RECIPIENT_MODES = { CONVERSATIONS: 'conversations', MANUAL: 'manual', GROUPS: 'groups' };
// P5 — tệp tự tải lên: cùng danh sách định dạng với Gửi nhanh Email/Zalo (backend validateFile mặc định).
const ATTACHMENT_ACCEPT = '.pdf,.docx,.pptx,.xlsx,.txt,.csv,.png,.jpg,.jpeg,.webp';
// 5 ảnh + 3 tài liệu — chặn cứng tổng số tệp; giới hạn theo từng loại + dung lượng do validateChannelAttachments.
const MAX_ATTACHMENTS_TOTAL = 8;
const CHANNELS_SETTINGS_PATH = '/app/settings/channels';

/**
 * W7a — Gửi nhanh cho kênh adapter (Telegram / WhatsApp), trình duyệt lặp MỖI REQUEST MỘT NGƯỜI
 * (POST /campaigns/quick-send/:channel). Hỗ trợ cả 2 chế độ:
 * 1. Chế độ đồng bộ 3 bước (khi truyền `step` và `onStepChange`): Bước 1 Người nhận -> Bước 2 Nội dung -> Bước 3 Xem trước.
 * 2. Chế độ panel tự chứa (khi không truyền `step`): hiển thị toàn bộ trên một trang cho các test đơn vị độc lập.
 *
 * @param {{ channel: 'telegram'|'whatsapp', channelLabel?: string, isEmployeeContext?: boolean, step?: string, onStepChange?: (step: string) => void }} props
 */
const QuickSendAdapterPanel = ({
  channel,
  channelLabel,
  isEmployeeContext = false,
  step,
  onStepChange,
  defaultRecipientMode,
}) => {
  const { t } = useI18n();
  const navigate = useNavigate();
  const cfg = ADAPTER_CHANNELS[channel];
  const label = channelLabel || (channel === 'whatsapp' ? 'WhatsApp' : 'Telegram');
  const isStepMode = Boolean(step && onStepChange);

  const [accounts, setAccounts] = useState([]);
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(true);
  const [accountsFailed, setAccountsFailed] = useState(false);
  const [selectedRef, setSelectedRef] = useState('');

  const [recipientMode, setRecipientMode] = useState(
    () => defaultRecipientMode || (isStepMode ? RECIPIENT_MODES.MANUAL : RECIPIENT_MODES.CONVERSATIONS)
  );
  const [conversations, setConversations] = useState([]);
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);
  const [conversationsFailed, setConversationsFailed] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState(() => new Set());
  const [manualText, setManualText] = useState('');
  // P8b — nguồn "Nhóm": tải theo yêu cầu (đọc trực tiếp từ kênh), chọn nhiều nhóm.
  const [groups, setGroups] = useState([]);
  const [groupsStatus, setGroupsStatus] = useState('idle'); // idle | loading | loaded | error
  const [groupsFilter, setGroupsFilter] = useState('');
  const [selectedGroupKeys, setSelectedGroupKeys] = useState(() => new Set());

  const [message, setMessage] = useState('');
  // P5 — mẫu tin (kho mẫu Zalo, dùng chung) + tệp đính kèm của mẫu + tệp tự tải lên.
  const [templates, setTemplates] = useState([]);
  const [templatesStatus, setTemplatesStatus] = useState('loading');
  const [templateId, setTemplateId] = useState('');
  const [templateAttachments, setTemplateAttachments] = useState([]);
  const [extraAttachments, setExtraAttachments] = useState([]);
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
  const attachmentInputRef = useRef(null);
  const { usage: storageQuotaUsage } = useStorageQuota();
  const [estimate, setEstimate] = useState(null);
  const [isLoadingEstimate, setIsLoadingEstimate] = useState(false);

  const [phase, setPhase] = useState('compose'); // compose | sending | done
  const [progressMessage, setProgressMessage] = useState('');
  const [result, setResult] = useState(null);

  const abortRef = useRef(null);
  const idempotencyRef = useRef({ key: null, signature: null });
  const sendGuardRef = useRef(false);

  useEffect(() => () => {
    abortRef.current?.abort();
  }, []);

  // Mẫu tin (kho mẫu Zalo). Lỗi tải không chặn gửi: vẫn soạn tay được.
  useEffect(() => {
    let cancelled = false;
    Promise.resolve(zaloTemplateApiService.getTemplates({ page: 1, limit: 50 }))
      .then((res) => {
        if (cancelled) return;
        setTemplates(res?.data?.data?.items || []);
        setTemplatesStatus('loaded');
      })
      .catch(() => {
        if (!cancelled) setTemplatesStatus('error');
      });
    return () => { cancelled = true; };
  }, []);

  // Tài khoản gửi.
  useEffect(() => {
    let cancelled = false;
    setIsLoadingAccounts(true);
    setAccountsFailed(false);
    const request = channel === 'whatsapp'
      ? campaignBuilderApiService.getWhatsAppAccountsForBuilder()
      : campaignBuilderApiService.getTelegramAccountsForBuilder();
    Promise.resolve(request)
      .then((res) => {
        if (cancelled) return;
        const rows = Array.isArray(res?.data?.data) ? res.data.data : [];
        const normalized = rows.map((row) => (channel === 'whatsapp'
          ? {
            ref: String(row.sessionKey),
            name: row.display || row.sessionKey,
            usable: row.status === 'open',
            openConversationCount: row.openConversationCount ?? 0,
          }
          : {
            ref: String(row.id),
            name: row.name || row.username || `#${row.id}`,
            usable: true,
            openConversationCount: row.openConversationCount ?? 0,
          }));
        setAccounts(normalized);
        const firstUsable = normalized.find((a) => a.usable);
        setSelectedRef((prev) => prev || firstUsable?.ref || '');
      })
      .catch(() => {
        if (!cancelled) {
          setAccounts([]);
          setAccountsFailed(true);
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingAccounts(false);
      });
    return () => { cancelled = true; };
  }, [channel]);

  // Người đã nhắn tới tài khoản đang chọn.
  useEffect(() => {
    if (!selectedRef) {
      setConversations([]);
      return undefined;
    }
    let cancelled = false;
    setIsLoadingConversations(true);
    setConversationsFailed(false);
    setSelectedKeys(new Set());
    Promise.resolve(campaignApiService.getQuickSendAdapterConversations(channel, selectedRef))
      .then((res) => {
        if (cancelled) return;
        setConversations(Array.isArray(res?.data?.data) ? res.data.data : []);
      })
      .catch(() => {
        if (!cancelled) {
          setConversations([]);
          setConversationsFailed(true);
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingConversations(false);
      });
    return () => { cancelled = true; };
  }, [channel, selectedRef]);

  // Đổi tài khoản/kênh -> bỏ danh sách nhóm đã tải (id nhóm thuộc về từng tài khoản).
  useEffect(() => {
    setGroups([]);
    setGroupsStatus('idle');
    setGroupsFilter('');
    setSelectedGroupKeys(new Set());
  }, [channel, selectedRef]);

  const handleLoadGroups = async () => {
    if (!selectedRef) return;
    setGroupsStatus('loading');
    try {
      const res = await (channel === 'whatsapp'
        ? campaignBuilderApiService.getWhatsAppAccountGroups(selectedRef)
        : campaignBuilderApiService.getTelegramAccountGroups(selectedRef));
      const rows = Array.isArray(res?.data?.data) ? res.data.data : [];
      // Telegram trả { chatId, title }, WhatsApp trả { recipientKey, title } — gộp về { recipientKey, name, membersCount }.
      setGroups(rows
        .map((g) => ({
          recipientKey: String(g.recipientKey ?? g.chatId ?? '').trim(),
          name: g.title || '',
          membersCount: Number.isFinite(g.membersCount) ? g.membersCount : null,
        }))
        .filter((g) => g.recipientKey));
      setGroupsStatus('loaded');
    } catch {
      setGroups([]);
      setGroupsStatus('error');
    }
  };

  const toggleGroupKey = (key) => {
    setSelectedGroupKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const visibleGroups = useMemo(() => {
    const q = groupsFilter.trim().toLowerCase();
    return q ? groups.filter((g) => g.name.toLowerCase().includes(q)) : groups;
  }, [groups, groupsFilter]);

  const parsedManual = useMemo(
    () => parseManualAdapterRecipients(channel, manualText),
    [channel, manualText]
  );

  /** Danh sách người nhận cuối cùng: [{ recipientKey, name }]. */
  const recipients = useMemo(() => {
    if (recipientMode === RECIPIENT_MODES.MANUAL) {
      return parsedManual.valid.map((recipientKey) => ({ recipientKey, name: '' }));
    }
    if (recipientMode === RECIPIENT_MODES.GROUPS) {
      return groups
        .filter((g) => selectedGroupKeys.has(g.recipientKey))
        .map((g) => ({ recipientKey: g.recipientKey, name: g.name }));
    }
    return conversations.filter((c) => selectedKeys.has(c.recipientKey));
  }, [recipientMode, parsedManual, conversations, selectedKeys, groups, selectedGroupKeys]);

  const overLimit = recipients.length > cfg.maxRecipients;
  const trimmedMessage = message.trim();
  const allAttachments = useMemo(
    () => [...templateAttachments, ...extraAttachments],
    [templateAttachments, extraAttachments]
  );
  const attachmentProblem = validateChannelAttachments(allAttachments, channel);
  const canProceedToStep2 = Boolean(
    selectedRef
    && recipients.length > 0
    && !overLimit
    && (recipientMode !== RECIPIENT_MODES.MANUAL || parsedManual.invalid.length === 0)
  );
  const canProceedToStep3 = Boolean(
    trimmedMessage.length > 0
    && message.length <= cfg.maxMessageLength
    && !isUploadingAttachment
    && !attachmentProblem
  );
  const canSend = (phase === 'compose' || isStepMode)
    && !attachmentProblem
    && Boolean(selectedRef)
    && recipients.length > 0
    && !overLimit
    && (recipientMode !== RECIPIENT_MODES.MANUAL || parsedManual.invalid.length === 0)
    && trimmedMessage.length > 0
    && message.length <= cfg.maxMessageLength;

  // Ước tính thời gian.
  const recipientCount = recipients.length;
  useEffect(() => {
    if (recipientCount === 0 || overLimit) {
      setEstimate(null);
      return undefined;
    }
    let cancelled = false;
    setIsLoadingEstimate(true);
    Promise.resolve(campaignApiService.getQuickSendEstimate({ channel, recipients: recipientCount }))
      .then((res) => {
        if (!cancelled) setEstimate(res?.data?.data || null);
      })
      .catch(() => {
        if (!cancelled) setEstimate(null);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingEstimate(false);
      });
    return () => { cancelled = true; };
  }, [channel, recipientCount, overLimit]);

  const handleApplyTemplate = (template) => {
    if (!template) {
      setTemplateId('');
      setTemplateAttachments([]);
      return;
    }
    setTemplateId(String(template.id ?? ''));
    setTemplateAttachments(Array.isArray(template.attachments) ? template.attachments.filter(Boolean) : []);
    if (String(template.bodyText || '').trim()) setMessage(String(template.bodyText));
  };

  const handleRemoveAttachment = (index) => {
    if (index < templateAttachments.length) {
      setTemplateAttachments((prev) => prev.filter((_, i) => i !== index));
    } else {
      const extraIndex = index - templateAttachments.length;
      setExtraAttachments((prev) => prev.filter((_, i) => i !== extraIndex));
    }
  };

  // Đăng ký TỪNG tệp TUẦN TỰ (không Promise.all) — POST /campaigns/quick-send/attachments là JSON, request dedup của
  // api.js huỷ lượt trước nếu 2 request cùng method+url bay song song (như Gửi nhanh Email/Zalo).
  const handleAttachmentSelect = async (event) => {
    const rawFiles = Array.from(event.target.files || []);
    event.target.value = '';
    if (!rawFiles.length) return;
    if (allAttachments.length + rawFiles.length > MAX_ATTACHMENTS_TOTAL) {
      toast.error(t('channelAttachments.error.tooMany', { count: MAX_ATTACHMENTS_TOTAL }));
      return;
    }
    const validation = validateFilesBeforeUpload(rawFiles, storageQuotaUsage);
    if (!validation.ok) {
      toast.error(getUploadValidationErrorMessage(validation, t));
      return;
    }
    setIsUploadingAttachment(true);
    try {
      const uploaded = [];
      for (const file of rawFiles) {
        const formData = new FormData();
        formData.append('file', file);
        const tempRes = await api.post('/uploads/temp', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        const temp = tempRes.data.data;
        const registeredRes = await campaignApiService.uploadQuickSendAttachment({
          tempId: temp.tempId,
          originalName: temp.originalName,
          contentType: temp.contentType,
          size: temp.size,
        });
        uploaded.push(registeredRes.data.data);
      }
      setExtraAttachments((prev) => [...prev, ...uploaded]);
      notifyStorageQuotaRefresh();
    } catch (err) {
      toast.error(err?.response?.data?.message || t('quickSend.attachmentUploadError'));
    } finally {
      setIsUploadingAttachment(false);
    }
  };

  const toggleKey = (key) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const allSelected = conversations.length > 0 && conversations.every((c) => selectedKeys.has(c.recipientKey));
  const toggleAll = () => {
    setSelectedKeys(allSelected ? new Set() : new Set(conversations.map((c) => c.recipientKey)));
  };

  const resolveReasonLabel = useCallback(
    (reason) => t(DEFERRED_REASON_I18N_KEYS[reason] || 'quickSend.deferredReasonUnknown'),
    [t]
  );

  /** Vòng gửi: mỗi người một request, giãn cách, tự chờ-gửi-lại khi `inter_message_delay` ngắn. */
  const runSendLoop = useCallback(async (list) => {
    const controller = new AbortController();
    abortRef.current = controller;
    const signal = controller.signal;

    idempotencyRef.current = await resolveActionIdempotencyKey(idempotencyRef.current, {
      channel,
      account: selectedRef,
      recipients: list.map((r) => r.recipientKey),
      message: trimmedMessage,
      attachments: allAttachments.map((a) => a?.key || ''),
    });
    const baseKey = idempotencyRef.current.key;

    let success = 0;
    let fail = 0;
    let partialCount = 0;
    const partialSamples = [];
    const failureSamples = [];
    const unsent = [];
    const failedRecipients = [];
    let deferredStop = null;
    let stopError = null;
    let aborted = false;

    const sendWithDeferRetry = async (recipient, idx) => {
      // eslint-disable-next-line no-constant-condition -- thoát bằng return bên trong, không phải bộ đếm.
      while (true) {
        const res = await campaignApiService.sendQuickAdapterMessage(channel, {
          [cfg.accountField]: selectedRef,
          recipientKey: recipient.recipientKey,
          message: trimmedMessage,
          ...(allAttachments.length > 0
            ? {
              attachments: allAttachments.map((a) => ({
                key: a.key,
                ...(a.originalName ? { originalName: a.originalName } : {}),
                ...(a.displayName ? { displayName: a.displayName } : {}),
                ...(a.name ? { name: a.name } : {}),
                ...(a.size ? { size: a.size } : {}),
              })),
            }
            : {}),
        }, { idempotencyKey: `${baseKey}-${idx}`, signal });
        const item = res?.data?.data?.item;
        if (item?.status === 'deferred') {
          const retryAfterMs = Number(item.retryAfterMs) || 0;
          if (item.reason === 'inter_message_delay' && retryAfterMs <= MAX_DEFERRED_RESEND_WAIT_MS) {
            await quickSendSleepWithCountdown(retryAfterMs, signal, (seconds) => {
              setProgressMessage(t('quickSend.deferredWaitingLabel', { seconds }));
            });
            continue;
          }
          return {
            deferred: true,
            reason: item.reason || 'unknown',
            resumeAt: Number(item.resumeAt) || (Date.now() + retryAfterMs),
          };
        }
        return { deferred: false, item };
      }
    };

    try {
      for (let idx = 0; idx < list.length; idx += 1) {
        const recipient = list[idx];
        if (idx > 0) {
          const waitMs = getQuickSendRandomDelayMs(cfg.delayFallbackMs.minMs, cfg.delayFallbackMs.maxMs);
          await quickSendSleepWithCountdown(waitMs, signal, (seconds) => {
            setProgressMessage(t('quickSendAdapter.waitingBetween', {
              seconds, current: idx + 1, total: list.length,
            }));
          });
        }
        setProgressMessage(t('quickSendAdapter.sendingProgress', { current: idx + 1, total: list.length }));
        try {
          const outcome = await sendWithDeferRetry(recipient, idx);
          if (outcome.deferred) {
            deferredStop = { reason: outcome.reason, resumeAt: outcome.resumeAt };
            unsent.push(...list.slice(idx));
            break;
          }
          const item = outcome.item;
          if (item?.status === 'success') {
            success += 1;
            // P5: người nhận ĐÃ nhận tin đầu nhưng một tệp sau đó lỗi — vẫn tính đã gửi, kèm cảnh báo.
            if (item.partialError) {
              partialCount += 1;
              if (partialSamples.length < 3) {
                partialSamples.push({ recipientKey: recipient.recipientKey, error: item.partialError });
              }
            }
          } else {
            fail += 1;
            failedRecipients.push(recipient);
            if (failureSamples.length < 3) {
              failureSamples.push({ recipientKey: recipient.recipientKey, error: item?.error || item?.errorCategory || '' });
            }
            if (shouldStopBatchOnFailedItem(item)) {
              stopError = { category: item?.errorCategory, message: item?.error || '' };
              unsent.push(...list.slice(idx + 1));
              break;
            }
          }
        } catch (err) {
          if (err?.name === 'AbortError' || err?.code === 'ERR_CANCELED') {
            aborted = true;
            break;
          }
          const errMessage = err?.response?.data?.message || err?.message || '';
          if (shouldStopBatchOnHttpError(err)) {
            stopError = { category: err?.response?.data?.code || 'http_error', message: errMessage };
            unsent.push(...list.slice(idx));
            break;
          }
          fail += 1;
          failedRecipients.push(recipient);
          if (failureSamples.length < 3) {
            failureSamples.push({ recipientKey: recipient.recipientKey, error: errMessage });
          }
        }
      }
    } catch (err) {
      // Huỷ lúc đang chờ giãn cách (rời trang).
      if (err?.name === 'AbortError') aborted = true;
      else throw err;
    }

    // Đợt xong -> lần gửi MỚI (kể cả trùng nội dung) tính khoá mới.
    idempotencyRef.current = { key: null, signature: null };
    setProgressMessage('');
    return {
      success, fail, partialCount, partialSamples, failureSamples, unsent, failedRecipients, deferredStop, stopError, aborted,
    };
  }, [channel, selectedRef, trimmedMessage, allAttachments, cfg, t]);

  const startSend = async (list) => {
    if (sendGuardRef.current || list.length === 0) return;
    sendGuardRef.current = true;
    setPhase('sending');
    onStepChange?.('sending');
    try {
      const outcome = await runSendLoop(list);
      if (outcome.aborted) return;
      setResult({
        success: outcome.success,
        fail: outcome.fail,
        partialCount: outcome.partialCount,
        partialSamples: outcome.partialSamples,
        failureSamples: outcome.failureSamples,
        retryList: [...outcome.failedRecipients, ...outcome.unsent],
        unsentCount: outcome.unsent.length,
        deferredStop: outcome.deferredStop,
        stopError: outcome.stopError,
      });
      setPhase('done');
      onStepChange?.('done');
      if (outcome.success > 0 && !outcome.deferredStop && !outcome.stopError && outcome.fail === 0) {
        toast.success(t('quickSendAdapter.sendSuccessToast', { count: outcome.success }));
      }
    } catch (err) {
      console.error('[QuickSendAdapter] send loop error', err);
      toast.error(err?.response?.data?.message || t('quickSendAdapter.sendFailedToast'));
      setPhase('compose');
      onStepChange?.('preview');
    } finally {
      sendGuardRef.current = false;
    }
  };

  const handleSend = () => {
    if (!canSend) return;
    startSend(recipients);
  };

  const handleRetry = () => {
    if (!result?.retryList?.length) return;
    startSend(result.retryList);
  };

  const handleStartOver = () => {
    setResult(null);
    setPhase('compose');
    onStepChange?.('recipients');
    setSelectedKeys(new Set());
    setSelectedGroupKeys(new Set());
    setManualText('');
    setMessage('');
    setTemplateId('');
    setTemplateAttachments([]);
    setExtraAttachments([]);
    setRecipientMode(defaultRecipientMode || (isStepMode ? RECIPIENT_MODES.MANUAL : RECIPIENT_MODES.CONVERSATIONS));
  };

  const estimateText = (() => {
    if (isLoadingEstimate) return '...';
    if (!estimate) return null;
    if (estimate.unit === 'immediate') return t('quickSend.immediate');
    if (estimate.unit === 'seconds') return t('quickSend.estimateSeconds', { value: estimate.value });
    if (estimate.unit === 'minutes') return t('quickSend.estimateMinutes', { value: estimate.value });
    if (estimate.unit === 'hours') return t('quickSend.estimateHours', { value: estimate.value });
    return null;
  })();

  const cardClass = 'bg-white dark:bg-dk-surface rounded-xl border border-gray-200 dark:border-dk-border p-6';
  const selectedAccount = accounts.find((a) => a.ref === selectedRef) || null;

  if (phase === 'sending') {
    return (
      <div className={`${cardClass} p-12 text-center`} data-testid="quick-send-adapter-sending">
        <div className="h-16 w-16 rounded-full border-4 border-orange-500 border-t-transparent animate-spin mx-auto mb-6" />
        <h2 className="text-xl font-semibold text-gray-900 dark:text-dk-text mb-2">{t('quickSend.sending')}</h2>
        <p className="text-gray-500 dark:text-dk-text2">{t('quickSend.keepPageOpenNotice')}</p>
        {progressMessage && <p className="text-sm text-orange-600 dark:text-orange-400 mt-3">{progressMessage}</p>}
      </div>
    );
  }

  if (phase === 'done' && result) {
    const nothingSent = result.success === 0;
    return (
      <div className={`${cardClass} p-8 text-center`} data-testid="quick-send-adapter-done">
        <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6 ${nothingSent ? 'bg-red-100 dark:bg-red-950/40' : 'bg-green-100 dark:bg-emerald-950/40'}`}>
          {nothingSent
            ? <HiOutlineXCircle className="w-8 h-8 text-red-500" />
            : <HiOutlineCheckCircle className="w-8 h-8 text-green-500" />}
        </div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-dk-text mb-2">
          {nothingSent ? t('quickSend.sendAllFailedTitle') : t('quickSend.sendSuccessTitle')}
        </h2>
        <p className="text-gray-500 dark:text-dk-text2 mb-2">{t('quickSendAdapter.resultSent', { count: result.success })}</p>
        {result.fail > 0 && (
          <p className="text-red-600 dark:text-red-400 text-sm mb-2">{t('quickSendAdapter.resultFailed', { count: result.fail })}</p>
        )}
        {result.partialCount > 0 && (
          <div className="text-amber-700 text-sm mb-2" data-testid="quick-send-adapter-partial">
            <p>{t('quickSendAdapter.resultPartial', { count: result.partialCount })}</p>
            <ul className="text-xs text-amber-600 mt-1 space-y-0.5">
              {result.partialSamples.map((s) => (
                <li key={s.recipientKey}>{s.recipientKey}{s.error ? ` — ${s.error}` : ''}</li>
              ))}
            </ul>
          </div>
        )}
        {result.failureSamples.length > 0 && (
          <ul className="text-xs text-gray-500 mb-2 space-y-0.5">
            {result.failureSamples.map((s) => (
              <li key={s.recipientKey}>{s.recipientKey}{s.error ? ` — ${s.error}` : ''}</li>
            ))}
          </ul>
        )}
        {result.deferredStop && (
          <p className="text-amber-600 dark:text-amber-400 text-sm mb-2">
            {t('quickSend.deferredResumeNotice', {
              reason: resolveReasonLabel(result.deferredStop.reason),
              time: formatResumeTimeVn(result.deferredStop.resumeAt),
            })}
          </p>
        )}
        {result.stopError && (
          <p className="text-red-600 dark:text-red-400 text-sm mb-2">
            {t('quickSendAdapter.batchStopped', { channel: label })}
            {result.stopError.message ? ` (${result.stopError.message})` : ''}
          </p>
        )}
        {result.unsentCount > 0 && (
          <p className="text-xs text-gray-400 dark:text-dk-muted mb-3">{t('quickSendAdapter.unsentCount', { count: result.unsentCount })}</p>
        )}
        <div className="flex justify-center gap-3 flex-wrap mt-4">
          {result.retryList.length > 0 && (
            <button
              type="button"
              onClick={handleRetry}
              className="inline-flex items-center gap-2 px-6 py-3 bg-orange-500 text-white font-medium rounded-lg hover:bg-orange-600 transition"
            >
              <HiOutlineRefresh className="w-4 h-4" />
              {t('quickSendAdapter.retryRemaining', { count: result.retryList.length })}
            </button>
          )}
          <button
            type="button"
            onClick={handleStartOver}
            className="px-6 py-3 border border-gray-300 dark:border-dk-border text-gray-700 dark:text-dk-text font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-dk-raised transition"
          >
            {t('quickSend.sendAnother')}
          </button>
        </div>
      </div>
    );
  }

  const renderAccountCard = () => (
    <div className={cardClass}>
      <h2 className="text-lg font-semibold text-gray-900 dark:text-dk-text mb-4">{t('quickSend.selectSenderAccount')}</h2>
      {isLoadingAccounts ? (
        <div className="flex items-center justify-center py-6">
          <div className="h-6 w-6 rounded-full border-2 border-orange-500 border-t-transparent animate-spin" />
        </div>
      ) : accountsFailed ? (
        <p className="text-sm text-red-600 dark:text-red-400">{t('quickSendAdapter.accountsLoadFailed')}</p>
      ) : accounts.length === 0 ? (
        <div className="space-y-3">
          <p className="text-sm text-gray-500 dark:text-dk-text2">
            {isEmployeeContext
              ? t('quickSendAdapter.noAccountsAssigned', { channel: label })
              : t('quickSendAdapter.noAccounts', { channel: label })}
          </p>
          <button
            type="button"
            onClick={() => navigate(CHANNELS_SETTINGS_PATH)}
            className="px-4 py-2 text-sm font-medium text-orange-700 dark:text-orange-400 border border-orange-300 dark:border-orange-500/30 rounded-lg hover:bg-orange-50 dark:hover:bg-orange-950/30 transition"
          >
            {t('quickSendAdapter.goConnect')}
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {accounts.map((account) => (
            <label
              key={account.ref}
              className={`flex items-center gap-3 p-3 rounded-lg border-2 transition ${
                selectedRef === account.ref
                  ? 'border-orange-500 bg-orange-50 dark:bg-orange-950/30'
                  : 'border-gray-200 dark:border-dk-border hover:border-gray-300 dark:hover:border-dk-border dark:bg-dk-raised/40'
              } ${account.usable ? 'cursor-pointer' : 'opacity-60 cursor-not-allowed'}`}
            >
              <input
                type="radio"
                name="quick-send-adapter-account"
                checked={selectedRef === account.ref}
                disabled={!account.usable}
                onChange={() => setSelectedRef(account.ref)}
                className="w-4 h-4 text-orange-500"
              />
              <div className="flex-1">
                <p className="font-medium text-gray-900 dark:text-dk-text">{account.name}</p>
                {account.ref && account.ref !== account.name && (
                  <p className="text-sm text-gray-500 dark:text-dk-text2">{account.ref}</p>
                )}
              </div>
              {!account.usable ? (
                <span className="text-xs text-amber-600 dark:text-amber-400">{t('quickSendAdapter.accountOffline')}</span>
              ) : (account.isDefault || account.is_default) ? (
                <span className="text-xs bg-green-100 text-green-700 dark:bg-emerald-950/40 dark:text-emerald-300 px-2 py-1 rounded">
                  {t('quickSend.default')}
                </span>
              ) : null}
            </label>
          ))}
        </div>
      )}
    </div>
  );

  const renderRecipientsCard = () => (
    <div className={cardClass}>
      <div className="flex items-center gap-2 mb-4">
        <HiOutlinePlus className="w-5 h-5 text-orange-500" />
        <h2 className="text-lg font-semibold text-gray-900 dark:text-dk-text">{t('quickSend.manualInput')}</h2>
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 dark:text-dk-text mb-2">
          {t('quickSend.zaloRecipientTypeLabel')}
        </label>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {[
            { mode: RECIPIENT_MODES.MANUAL, labelKey: channel === 'whatsapp' ? 'quickSendAdapter.modeManualWhatsApp' : 'quickSendAdapter.modeManualTelegram' },
            { mode: RECIPIENT_MODES.CONVERSATIONS, labelKey: 'quickSendAdapter.modeConversations' },
            { mode: RECIPIENT_MODES.GROUPS, labelKey: 'quickSendAdapter.modeGroups' },
          ].map(({ mode, labelKey }) => {
            const isSelected = recipientMode === mode;
            return (
              <button
                key={mode}
                type="button"
                onClick={() => setRecipientMode(mode)}
                className="flex items-center gap-2 text-sm text-gray-700 dark:text-dk-text cursor-pointer hover:text-gray-900 dark:hover:text-dk-text transition-colors"
              >
                <span
                  className={`w-4 h-4 rounded-full border flex items-center justify-center transition-colors ${
                    isSelected
                      ? 'border-orange-500 bg-white dark:bg-dk-surface'
                      : 'border-gray-300 dark:border-dk-border bg-white dark:bg-dk-surface'
                  }`}
                  aria-hidden="true"
                >
                  {isSelected && (
                    <span className="w-2 h-2 rounded-full bg-orange-500" />
                  )}
                </span>
                <span>{t(labelKey)}</span>
              </button>
            );
          })}
        </div>
      </div>

      {recipientMode === RECIPIENT_MODES.GROUPS ? (
        <div data-testid="quick-send-adapter-groups" className="space-y-3">
          <p className="text-xs text-gray-500 dark:text-dk-text2">{t('quickSendAdapter.groupsHint', { channel: label })}</p>
          {!selectedAccount ? (
            <p className="text-sm text-amber-600 dark:text-amber-400">{t('quickSendAdapter.pickAccountFirst')}</p>
          ) : (
            <button
              type="button"
              onClick={handleLoadGroups}
              disabled={groupsStatus === 'loading'}
              className="px-3 py-1.5 text-sm font-semibold bg-white dark:bg-dk-raised border border-gray-300 dark:border-dk-border text-gray-700 dark:text-dk-text rounded-lg hover:bg-gray-50 dark:hover:bg-dk-strong disabled:opacity-60 transition"
            >
              {groupsStatus === 'loaded' ? t('quickSendAdapter.groupsReload') : t('quickSendAdapter.groupsLoad')}
            </button>
          )}
          {groupsStatus === 'loading' && (
            <p role="status" className="text-sm text-gray-500 dark:text-dk-text2">{t('quickSendAdapter.groupsLoading')}</p>
          )}
          {groupsStatus === 'error' && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">{t('quickSendAdapter.groupsLoadFailed')}</p>
          )}
          {groupsStatus === 'loaded' && groups.length === 0 && (
            <p className="text-sm text-gray-500 dark:text-dk-text2">{t('quickSendAdapter.groupsEmpty')}</p>
          )}
          {groupsStatus === 'loaded' && groups.length > 0 && (
            <div>
              <input
                type="text"
                value={groupsFilter}
                onChange={(e) => setGroupsFilter(e.target.value)}
                placeholder={t('quickSendAdapter.groupsFilterPlaceholder')}
                className="w-full px-3 py-2 mb-2 border border-gray-200 dark:border-dk-border dark:bg-dk-inset dark:text-dk-text rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
              />
              <div className="text-sm text-gray-500 dark:text-dk-text2 mb-2">
                {t('quickSendAdapter.selectedCount', { count: selectedGroupKeys.size, total: groups.length })}
              </div>
              <div className="max-h-72 overflow-y-auto border border-gray-200 dark:border-dk-border rounded-lg divide-y divide-gray-100 dark:divide-dk-border">
                {visibleGroups.map((g) => (
                  <label key={g.recipientKey} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-dk-raised/60">
                    <input
                      type="checkbox"
                      checked={selectedGroupKeys.has(g.recipientKey)}
                      onChange={() => toggleGroupKey(g.recipientKey)}
                      className="w-4 h-4 text-orange-500 rounded"
                    />
                    <span className="flex-1 truncate text-sm text-gray-900 dark:text-dk-text">{g.name || g.recipientKey}</span>
                    {g.membersCount != null && (
                      <span className="text-xs text-gray-400 dark:text-dk-muted">{t('telegramNodeSend.groupsMembers', { count: g.membersCount })}</span>
                    )}
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : recipientMode === RECIPIENT_MODES.CONVERSATIONS ? (
        isLoadingConversations ? (
          <div className="flex items-center justify-center py-6">
            <div className="h-6 w-6 rounded-full border-2 border-orange-500 border-t-transparent animate-spin" />
          </div>
        ) : conversationsFailed ? (
          <p className="text-sm text-red-600 dark:text-red-400">{t('quickSendAdapter.conversationsLoadFailed')}</p>
        ) : !selectedAccount ? (
          <p className="text-sm text-amber-600 dark:text-amber-400">{t('quickSendAdapter.pickAccountFirst')}</p>
        ) : conversations.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-dk-text2">{t('quickSendAdapter.conversationsEmpty')}</p>
        ) : (
          <div>
            <div className="flex items-center justify-between mb-2">
              <button type="button" onClick={toggleAll} className="text-sm text-orange-600 dark:text-orange-400 hover:underline">
                {allSelected ? t('quickSendAdapter.clearAll') : t('quickSendAdapter.selectAll')}
              </button>
              <span className="text-sm text-gray-500 dark:text-dk-text2">
                {t('quickSendAdapter.selectedCount', { count: selectedKeys.size, total: conversations.length })}
              </span>
            </div>
            <div className="max-h-72 overflow-y-auto border border-gray-200 dark:border-dk-border rounded-lg divide-y divide-gray-100 dark:divide-dk-border">
              {conversations.map((c) => (
                <label key={c.recipientKey} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-dk-raised/60">
                  <input
                    type="checkbox"
                    checked={selectedKeys.has(c.recipientKey)}
                    onChange={() => toggleKey(c.recipientKey)}
                    className="w-4 h-4 text-orange-500 rounded"
                  />
                  <span className="text-sm text-gray-900 dark:text-dk-text">{c.name || c.recipientKey}</span>
                  {c.name && <span className="text-xs text-gray-400 dark:text-dk-muted">{c.recipientKey}</span>}
                </label>
              ))}
            </div>
          </div>
        )
      ) : (
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-dk-text mb-2">
            {channel === 'whatsapp'
              ? t('quickSend.manualPhones')
              : (t('quickSendAdapter.manualChatIds') || 'Danh sách Chat ID (mỗi dòng 1 ID)')}
          </label>
          <textarea
            value={manualText}
            onChange={(e) => setManualText(e.target.value)}
            rows={6}
            placeholder={t(channel === 'whatsapp' ? 'quickSendAdapter.manualPlaceholderWhatsApp' : 'quickSendAdapter.manualPlaceholderTelegram')}
            className="w-full px-3 py-2 border border-gray-200 dark:border-dk-border dark:bg-dk-inset dark:text-dk-text rounded-lg focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
          />
          <p className="text-xs text-gray-500 dark:text-dk-text2 mt-2">
            {t('quickSend.manualInputHint')}
          </p>
          {parsedManual.invalid.length > 0 && (
            <p className="text-sm text-red-600 dark:text-red-400 mt-2" data-testid="quick-send-adapter-invalid">
              {t('quickSendAdapter.manualInvalidLines', { lines: parsedManual.invalid.join(', ') })}
            </p>
          )}
        </div>
      )}

      {overLimit && (
        <p className="text-sm text-red-600 dark:text-red-400 mt-3" data-testid="quick-send-adapter-over-limit">
          {t('quickSendAdapter.maxRecipients', { max: cfg.maxRecipients, count: recipients.length })}
        </p>
      )}
    </div>
  );

  const renderMessageCard = () => (
    <div className={cardClass}>
      <h2 className="text-lg font-semibold text-gray-900 dark:text-dk-text mb-4">{t('quickSendAdapter.messageTitle')}</h2>
      <div className="mb-4">
        <ChannelTemplateAttachmentPicker
          channel={channel}
          templates={templates}
          fetchTemplateById={async (id) => {
            const res = await zaloTemplateApiService.getTemplateById(id);
            return res?.data?.data || null;
          }}
          templateId={templateId}
          attachments={allAttachments}
          onApply={handleApplyTemplate}
          onRemoveAttachment={handleRemoveAttachment}
          status={templatesStatus}
        />
      </div>
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        rows={6}
        placeholder={t('quickSendAdapter.messagePlaceholder')}
        className="w-full px-3 py-2 border border-gray-200 dark:border-dk-border dark:bg-dk-inset dark:text-dk-text rounded-lg focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
      />
      <div className="flex justify-between text-xs mt-1">
        <span className="text-gray-500 dark:text-dk-text2">{t('quickSendAdapter.messageHint')}</span>
        <span className={message.length > cfg.maxMessageLength ? 'text-red-600 dark:text-red-400' : 'text-gray-400 dark:text-dk-muted'}>
          {t('quickSendAdapter.messageCounter', { count: message.length, max: cfg.maxMessageLength })}
        </span>
      </div>

      <div className="mt-4 pt-4 border-t border-gray-200 dark:border-dk-border">
        <input
          ref={attachmentInputRef}
          type="file"
          multiple
          accept={ATTACHMENT_ACCEPT}
          onChange={handleAttachmentSelect}
          className="hidden"
          data-testid="quick-send-adapter-file-input"
        />
        <button
          type="button"
          onClick={() => attachmentInputRef.current?.click()}
          disabled={isUploadingAttachment}
          className="inline-flex items-center gap-2 px-3 py-2 border border-gray-300 dark:border-dk-border rounded-lg text-sm text-gray-700 dark:text-dk-text hover:bg-gray-50 dark:hover:bg-dk-raised disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {isUploadingAttachment ? (
            <span className="w-4 h-4 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
          ) : (
            <HiOutlinePaperClip className="w-4 h-4" />
          )}
          {t('quickSend.attachmentAdd')}
        </button>
      </div>
    </div>
  );

  const renderEstimateAndSendCard = () => (
    <div className={cardClass}>
      {recipients.length > 0 && !overLimit && (
        <div className="flex items-center justify-between text-sm mb-3">
          <span className="text-gray-600 dark:text-dk-text2">{t('quickSend.estimatedDuration')}</span>
          <span className="font-medium text-gray-900 dark:text-dk-text" data-testid="quick-send-adapter-estimate">{estimateText}</span>
        </div>
      )}
      {estimate?.quietHours?.startFormatted && (
        <p className="text-xs text-gray-500 dark:text-dk-text2 mb-3">
          {t('quickSendAdapter.quietHoursNote', {
            start: estimate.quietHours.startFormatted,
            end: estimate.quietHours.endFormatted,
          })}
        </p>
      )}
      <button
        type="button"
        onClick={handleSend}
        disabled={!canSend}
        className="w-full px-6 py-3 bg-orange-500 text-white font-semibold rounded-lg hover:bg-orange-600 transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <HiOutlinePaperAirplane className="w-5 h-5" />
        {t('quickSendAdapter.sendButton', { count: recipients.length })}
      </button>
    </div>
  );

  const renderPreviewCard = () => (
    <div className={cardClass}>
      <h2 className="text-lg font-semibold text-gray-900 dark:text-dk-text mb-4">{t('quickSend.previewAndSend')}</h2>

      {/* Tóm tắt */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="p-4 bg-gray-50 dark:bg-dk-raised/60 rounded-lg">
          <p className="text-xs text-gray-500 dark:text-dk-text2">{t('quickSend.channel')}</p>
          <p className="text-base font-semibold text-gray-900 dark:text-dk-text capitalize mt-1">{label}</p>
        </div>
        <div className="p-4 bg-gray-50 dark:bg-dk-raised/60 rounded-lg">
          <p className="text-xs text-gray-500 dark:text-dk-text2">{t('quickSend.senderAccount') || 'Tài khoản gửi'}</p>
          <p className="text-base font-semibold text-gray-900 dark:text-dk-text truncate mt-1">
            {selectedAccount?.name || selectedAccount?.ref || '-'}
          </p>
        </div>
        <div className="p-4 bg-gray-50 dark:bg-dk-raised/60 rounded-lg">
          <p className="text-xs text-gray-500 dark:text-dk-text2">{t('quickSend.recipients')}</p>
          <p className="text-base font-semibold text-gray-900 dark:text-dk-text mt-1">{recipients.length}</p>
        </div>
        <div className="p-4 bg-orange-50/60 dark:bg-orange-950/20 border border-orange-100 dark:border-orange-500/20 rounded-lg">
          <p className="text-xs text-orange-600 dark:text-orange-400 font-medium flex items-center gap-1">
            <HiOutlineClock className="w-3.5 h-3.5" />
            {t('quickSend.estimatedDuration')}
          </p>
          <p className="text-base font-semibold text-orange-900 dark:text-orange-300 mt-1" data-testid="quick-send-adapter-estimate">
            {estimateText || t('quickSend.immediate')}
          </p>
        </div>
      </div>

      {/* Nhắc nhở giữ tab mở */}
      <p className="text-xs text-gray-400 dark:text-dk-muted mb-4 flex items-center gap-1.5">
        <HiOutlineClock className="w-3.5 h-3.5 shrink-0" />
        {t('quickSend.keepPageOpenNotice')}
      </p>

      {/* Cảnh báo giờ yên lặng nếu có */}
      {estimate?.quietHours?.startFormatted && (
        <div className="mb-6 p-3.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 flex items-start gap-2.5 text-xs text-indigo-900 dark:text-indigo-200">
          <HiOutlineMoon className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
          <span className="leading-relaxed">
            {t('quickSendAdapter.quietHoursNote', {
              start: estimate.quietHours.startFormatted,
              end: estimate.quietHours.endFormatted,
            })}
          </span>
        </div>
      )}

      {/* Xem trước nội dung tin nhắn */}
      <div className="p-4 bg-gray-50 dark:bg-dk-raised/60 rounded-lg mb-4">
        <p className="text-sm font-medium text-gray-700 dark:text-dk-text mb-2">
          {t('quickSend.customMessageContentLabel')}
        </p>
        <div className="whitespace-pre-wrap font-sans text-sm text-gray-900 dark:text-dk-text">
          {message}
        </div>
      </div>

      {/* Danh sách tệp đính kèm xem trước nếu có */}
      {allAttachments.length > 0 && (
        <div className="p-4 bg-gray-50 dark:bg-dk-raised/60 rounded-lg mb-4">
          <p className="text-sm font-medium text-gray-700 dark:text-dk-text mb-2 flex items-center gap-1.5">
            <HiOutlinePaperClip className="w-4 h-4 text-gray-500 dark:text-dk-text2" />
            {t('quickSend.attachments')} ({allAttachments.length})
          </p>
          <div className="flex flex-wrap gap-2">
            {allAttachments.map((att, idx) => (
              <span
                key={att.key || idx}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-white dark:bg-dk-surface rounded-lg border border-gray-200 dark:border-dk-border text-xs text-gray-700 dark:text-dk-text font-medium"
              >
                <HiOutlinePaperClip className="w-3.5 h-3.5 text-gray-400 dark:text-dk-muted shrink-0" />
                <span className="truncate max-w-[200px]">{att.originalName || att.name || att.key}</span>
                {att.size ? <span className="text-gray-400 dark:text-dk-muted">({formatFileSize(att.size)})</span> : null}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Nút hành động */}
      <div className="flex justify-between items-center pt-4 border-t border-gray-200 dark:border-dk-border">
        <button
          type="button"
          onClick={() => onStepChange('template')}
          className="px-6 py-3 border border-gray-300 dark:border-dk-border text-gray-700 dark:text-dk-text font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-dk-raised transition"
        >
          {t('quickSend.back')}
        </button>
        <button
          type="button"
          onClick={handleSend}
          disabled={!canSend}
          className="px-6 py-3 bg-orange-500 text-white font-semibold rounded-lg hover:bg-orange-600 transition flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <HiOutlinePaperAirplane className="w-5 h-5" />
          {t('quickSendAdapter.sendButton', { count: recipients.length })}
        </button>
      </div>
    </div>
  );

  if (isStepMode) {
    if (step === 'recipients') {
      return (
        <div className="space-y-6" data-testid="quick-send-adapter-panel">
          {renderAccountCard()}
          {renderRecipientsCard()}
          <div className="flex justify-end pt-2">
            <button
              type="button"
              onClick={() => onStepChange('template')}
              disabled={!canProceedToStep2}
              className="px-6 py-3 bg-orange-500 text-white font-semibold rounded-lg hover:bg-orange-600 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {t('quickSend.next')}
              <HiOutlineChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      );
    }

    if (step === 'template') {
      return (
        <div className="space-y-6" data-testid="quick-send-adapter-panel">
          {renderMessageCard()}
          <div className="flex justify-between items-center pt-2">
            <button
              type="button"
              onClick={() => onStepChange('recipients')}
              className="px-6 py-3 border border-gray-300 dark:border-dk-border text-gray-700 dark:text-dk-text font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-dk-raised transition"
            >
              {t('quickSend.back')}
            </button>
            <button
              type="button"
              onClick={() => onStepChange('preview')}
              disabled={!canProceedToStep3}
              className="px-6 py-3 bg-orange-500 text-white font-semibold rounded-lg hover:bg-orange-600 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {t('quickSend.next')}
              <HiOutlineChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      );
    }

    if (step === 'preview') {
      return (
        <div className="space-y-6" data-testid="quick-send-adapter-panel">
          {renderPreviewCard()}
        </div>
      );
    }
  }

  // Chế độ cũ (không truyền step/onStepChange): hiện toàn bộ trên 1 trang
  return (
    <div className="space-y-6" data-testid="quick-send-adapter-panel">
      {renderAccountCard()}
      {renderRecipientsCard()}
      {renderMessageCard()}
      {renderEstimateAndSendCard()}
    </div>
  );
};

export default QuickSendAdapterPanel;
