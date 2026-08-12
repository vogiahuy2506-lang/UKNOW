import { useState, useRef, useEffect, useMemo } from 'react';
import useIsMobile from '../../hooks/useIsMobile';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useI18n } from '../../i18n';
import { useAuthStore } from '../../stores/authStore';
import { getHelpArticle } from '../../services/help.service';
import {
  HiOutlineSparkles, HiOutlinePaperClip, HiOutlineX,
  HiOutlineChevronRight, HiOutlineChevronDown, HiOutlineArrowRight,
  HiOutlineMail, HiOutlineGlobeAlt, HiOutlinePlus,
  HiOutlineClipboardList, HiOutlineChat, HiOutlineLink, HiOutlineClock,
  HiOutlineExclamation,
} from 'react-icons/hi';
import { writeCampaignDraft } from '../../utils/campaignDraftStorage';
import { toast } from 'react-hot-toast';
import aiApi from '../../services/aiApi';
import api from '../../services/api';
import LandingPageCard from './components/LandingPageCard';
import {
  AiContent, TemplateDraftCard, ContentPlanCard, ContentPlanActionsCard, AskMoreCard, AskCampaignTypeCard, AskCampaignDetailsCard,
  AskLandingDetailsCard, AskAudienceCard, CampaignDraftEditor, ConfirmCreateCard,
  AutoCreatingCard, AutoCreatedSuccessCard, CampaignPickerModal, TemplatePickerModal,
} from './components/AiChatbotCards';
import {
  AskSenderAccountCard,
  EmailSetupGuideCard,
  ZaloGroupPickerCard,
  ZaloQrLoginCard,
} from './components/AiChatbotWizardCards';
import ConfirmModal from '../inbox/ConfirmModal';
import CreditWarningBanner from '../../components/layout/CreditWarningBanner';
import { getAiQuotaErrorMessage, shouldShowAiUpgradeCta } from '../../utils/aiLimitError.util';
import { getAiBillingBlockState } from '../../utils/subscriptionStatus.util.js';
import zaloSettingsApiService from '../settings/services/zaloSettingsApi.service';

const PLAN_SUPPORTED_CHANNELS = new Set(['email', 'zalo', 'zalo_group']);
const DAY_CONFIRM_REGEX = /^(co|có|ok|oke|yes|y|dong y|đồng ý)$/i;
const PLAN_APPROVE_REGEX =
  /^\s*(đồng ý|dong y|duyệt|duyet|ok|okay|oke|tạo đi|tao di|tạo luôn|tao luon|chốt|chot|yes|approve|go)\s*$/i;
const PLAN_CANCEL_REGEX =
  /^\s*(huỷ|hủy|huy|cancel|dừng|dung|thôi|thoi|stop)\s*$/i;

const normalizeChannel = (channel) => {
  const lower = String(channel || '').trim().toLowerCase();
  if (lower === 'zalo_personal') return 'zalo';
  if (lower === 'zalo_group') return 'zalo_group';
  return lower;
};

const parseWizardMarker = (content = '') => {
  const firstLine = String(content || '').split('\n')[0]?.trim();
  const match = firstLine?.match(/^\[wizard\](\{.*\})/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
};

const parseScheduleValue = (value, answers = {}) => {
  const raw = String(value || '').trim();
  if (!raw || raw === 'once') return { mode: 'once' };
  if (raw === 'drip' || raw.startsWith('drip_')) {
    const days = raw.startsWith('drip_')
      ? Number(raw.replace('drip_', '')) || 3
      : Number(answers.scheduleDays) || 3;
    const slotsPerDay = Number(answers.scheduleSlotsPerDay) || 1;
    return {
      mode: 'drip',
      days: Math.min(30, Math.max(1, days)),
      slotsPerDay: Math.min(5, Math.max(1, slotsPerDay)),
    };
  }
  if (raw.startsWith('recurring_')) return { mode: 'recurring', days: Number(raw.replace('recurring_', '')) || 7 };
  return { mode: raw || 'once' };
};

const WIZARD_ASSISTANT_TYPES = new Set([
  'ask_campaign_details',
  'ask_sender_account',
  'email_setup_guide',
  'zalo_qr_login',
  'zalo_group_picker',
]);

const stripWizardCards = (items = []) => {
  const next = [...items];
  while (next.length > 0) {
    const last = next[next.length - 1];
    if (last?.role === 'assistant' && WIZARD_ASSISTANT_TYPES.has(last.type)) {
      next.pop();
      continue;
    }
    break;
  }
  return next;
};

const isSilentWizardUserMessage = (message) => (
  message?.role === 'user' && (message?.silent || Boolean(parseWizardMarker(message?.content)))
);

const appendWizardAssistantMessage = (items, message) => (
  [...stripWizardCards(items), message]
);

const buildWizardMarkerText = (payload, readableText) => `[wizard]${JSON.stringify(payload)}\n${readableText}`;

const WIZARD_CHANNEL_LABELS = {
  email: { vi: 'Email', en: 'Email' },
  zalo: { vi: 'Zalo cá nhân', en: 'Zalo personal' },
  zalo_group: { vi: 'Zalo nhóm', en: 'Zalo groups' },
};

const WIZARD_DATA_SOURCE_LABELS = {
  landing: { vi: 'Đăng ký từ Landing Page', en: 'Landing page sign-ups' },
  sheet: { vi: 'File Excel / Google Sheet', en: 'Excel / Google Sheet' },
  db: { vi: 'Danh sách khách hàng', en: 'Saved customer list' },
};

const formatUserMessageForDisplay = (content = '', t, locale = 'vi') => {
  const marker = parseWizardMarker(content);
  if (!marker) return content;

  const lang = locale === 'en' ? 'en' : 'vi';
  const channelKey = normalizeChannel(marker.channel || marker.value) || marker.channel || marker.value;
  const channelLabel = WIZARD_CHANNEL_LABELS[channelKey]?.[lang] || channelKey || '';

  switch (marker.gate) {
    case 'channel':
      return t('aiChatbot.wizardDisplayPickedChannel', { channel: channelLabel })
        || `Đã chọn kênh ${channelLabel}.`;
    case 'senderAccount':
      if (marker.other) {
        return marker.channel === 'email'
          ? (t('aiChatbot.wizardDisplayOtherEmail') || 'Tôi muốn thêm email sender khác.')
          : (t('aiChatbot.wizardDisplayOtherZalo') || 'Tôi muốn kết nối tài khoản Zalo khác.');
      }
      {
        const name = marker.accountName || `#${marker.accountId}`;
        if (marker.viaQr) {
          return t('aiChatbot.wizardDisplayLoggedInZalo', { name })
            || `Đã đăng nhập bằng tài khoản Zalo «${name}».`;
        }
        if (marker.channel === 'email') {
          return t('aiChatbot.wizardDisplayPickedEmailSender', { name })
            || `Đã chọn email sender «${name}».`;
        }
        return t('aiChatbot.wizardDisplayPickedZaloAccount', { name })
          || `Đã chọn tài khoản Zalo «${name}».`;
      }
    case 'dataSource': {
      const sourceKey = marker.value || marker.dataSource;
      const sourceLabel = WIZARD_DATA_SOURCE_LABELS[sourceKey]?.[lang] || sourceKey;
      return t('aiChatbot.wizardDisplayPickedDataSource', { source: sourceLabel })
        || `Đã chọn nguồn khách: ${sourceLabel}.`;
    }
    case 'schedule': {
      const mode = marker.mode || marker.value || 'once';
      const days = Number(marker.days);
      const slotsPerDay = Number(marker.slotsPerDay) || 1;
      if (mode === 'drip' && days > 0) {
        if (slotsPerDay > 1) {
          return t('aiChatbot.wizardDisplayPickedDripScheduleDetail', { days, slots: slotsPerDay })
            || `Đã chọn chuỗi ${days} ngày, mỗi ngày ${slotsPerDay} tin.`;
        }
        return t('aiChatbot.wizardDisplayPickedDripSchedule', { days })
          || `Đã chọn chuỗi gửi ${days} ngày.`;
      }
      return t('aiChatbot.wizardDisplayPickedOnceSchedule')
        || 'Đã chọn gửi một lần.';
    }
    case 'zaloGroups':
      return t('aiChatbot.wizardDisplayPickedGroups', { count: marker.groupIds?.length || 0 })
        || `Đã chọn ${marker.groupIds?.length || 0} nhóm Zalo.`;
    case 'planApproved':
      return t('aiChatbot.wizardDisplayPlanApproved') || 'Đã đồng ý với kế hoạch này.';
    default: {
      const readable = String(content).split('\n').slice(1).join('\n').trim();
      return readable || '';
    }
  }
};

const GOOGLE_SHEET_URL_RE = /https?:\/\/docs\.google\.com\/spreadsheets\/\S+/i;

const deriveWizardContext = (items = []) => {
  const context = {
    channel: null,
    senderAccountId: null,
    senderAccountName: null,
    dataSource: null,
    sheetUrl: null,
    zaloGroupIds: [],
    schedule: null,
    planApproved: false,
  };
  items.forEach((message) => {
    if (message?.role !== 'user') return;
    const marker = parseWizardMarker(message.content);
    if (!marker) {
      // User dán link Google Sheet dưới dạng tin nhắn thường — lấy link mới nhất
      const sheetMatch = String(message.content || '').match(GOOGLE_SHEET_URL_RE);
      if (sheetMatch) context.sheetUrl = sheetMatch[0].replace(/[)\]}>.,;'"]+$/, '');
      return;
    }
    if (marker.gate === 'channel') {
      context.channel = normalizeChannel(marker.channel || marker.value);
      context.senderAccountId = null;
      context.senderAccountName = null;
      context.dataSource = null;
      context.zaloGroupIds = [];
      context.schedule = null;
      context.planApproved = false;
    } else if (marker.gate === 'senderAccount') {
      context.channel = normalizeChannel(marker.channel) || context.channel;
      context.senderAccountId = marker.accountId ?? null;
      context.senderAccountName = marker.accountName || null;
    } else if (marker.gate === 'dataSource') {
      context.dataSource = marker.value || marker.dataSource || null;
    } else if (marker.gate === 'zaloGroups') {
      context.senderAccountId = marker.accountId ?? context.senderAccountId;
      context.zaloGroupIds = Array.isArray(marker.groupIds) ? marker.groupIds : [];
    } else if (marker.gate === 'schedule') {
      context.schedule = {
        mode: marker.mode || marker.value || 'once',
        days: marker.days,
        slotsPerDay: marker.slotsPerDay ? Number(marker.slotsPerDay) : 1,
      };
    } else if (marker.gate === 'planApproved') {
      context.planApproved = true;
    }
  });
  return context;
};

// Fill wizardContext derive từ messages bằng gates persist trên server (chỉ lấp chỗ
// trống — marker tường minh trong messages luôn thắng, cùng triết lý merge backend)
const mergeClientWizardContext = (derived, gates) => ({
  ...derived,
  channel: derived.channel ?? gates.channel ?? null,
  senderAccountId: derived.senderAccountId ?? gates.senderAccountId ?? null,
  senderAccountName: derived.senderAccountName ?? gates.senderAccountName ?? null,
  dataSource: derived.dataSource ?? gates.dataSource ?? null,
  sheetUrl: derived.sheetUrl ?? gates.sheetUrl ?? null,
  zaloGroupIds: derived.zaloGroupIds?.length
    ? derived.zaloGroupIds
    : (Array.isArray(gates.zaloGroupIds) ? gates.zaloGroupIds : []),
  schedule: derived.schedule ?? gates.schedule ?? null,
  planApproved: Boolean(derived.planApproved || gates.planApproved),
});

const applyWizardSelectionsToScript = (script, context = {}) => {
  if (!script) return script;
  const senderId = context.senderAccountId != null ? Number(context.senderAccountId) : null;
  const groupIds = Array.isArray(context.zaloGroupIds) ? context.zaloGroupIds : [];
  const sheetUrl = context.sheetUrl || '';
  if (!senderId && groupIds.length === 0 && !context.dataSource && !sheetUrl) return script;

  const next = {
    ...script,
    campaignType: context.channel || script.campaignType,
    wizardContext: context,
    nodes: Array.isArray(script.nodes)
      ? script.nodes.map((node) => {
        const config = { ...(node.config || {}) };
        if (senderId) {
          if (node.nodeSubtype === 'send_email') config.fromEmailId = config.fromEmailId || senderId;
          if (node.nodeSubtype === 'select_zalo_account' || node.nodeSubtype === 'send_zalo_personal' || node.nodeSubtype === 'send_zalo_group') {
            config.zaloAccountId = config.zaloAccountId || senderId;
          }
        }
        if (node.nodeSubtype === 'get_all_groups' && groupIds.length > 0) {
          config.zaloSelectedGroupIds = groupIds;
        }
        if (node.nodeSubtype === 'read_sheet' && sheetUrl && !config.sheetUrl) {
          config.sheetUrl = sheetUrl;
        }
        if (context.dataSource === 'sheet' && node.nodeSubtype === 'interested_customers') {
          return {
            ...node,
            nodeSubtype: 'read_sheet',
            nodeName: 'Danh sách từ Sheet',
            nodeDescription: sheetUrl
              ? 'Danh sách lấy từ Google Sheet bạn đã cung cấp.'
              : 'Danh sách lấy từ Google Sheet - cần dán URL trong Campaign Builder nếu chưa có.',
            config: { sheetUrl, sheetName: 'Sheet1', headerRow: 1, dataStartRow: 2 },
          };
        }
        if (context.dataSource === 'landing' && node.nodeSubtype === 'interested_customers') {
          return {
            ...node,
            nodeSubtype: 'read_landing_leads',
            nodeName: 'Lead từ Landing Page',
            nodeDescription: 'Danh sách đăng ký từ Landing Page.',
            config: { landingLeadsSlugs: [] },
          };
        }
        return { ...node, config };
      })
      : script.nodes,
  };

  if (context.dataSource && Array.isArray(next.nodes) && context.channel !== 'zalo_group') {
    next.wizardDataSource = context.dataSource;
  }
  return next;
};

const parseHourFromSendTime = (sendTime) => {
  if (!sendTime) return null;
  const match = String(sendTime).match(/(\d{1,2})(?::(\d{1,2}))?/);
  if (!match) return null;
  const hour = Number.parseInt(match[1], 10);
  if (!Number.isFinite(hour) || hour < 0 || hour > 23) return null;
  const minute = Number.parseInt(match[2] || '0', 10);
  if (!Number.isFinite(minute) || minute < 0 || minute > 59) return null;
  return hour + minute / 60;
};

const normalizeContentPlanData = (rawData) => {
  const daysRaw = Array.isArray(rawData?.days) ? rawData.days : [];
  const grouped = new Map();

  const pushSlot = (dayNumber, seed = {}, fallbackChannel = 'zalo', slotIndex = null) => {
    const day = Number(dayNumber);
    if (!Number.isFinite(day) || day <= 0) return;

    const channel = normalizeChannel(seed.channel || fallbackChannel || 'zalo');
    const group = grouped.get(day) || {
      day,
      channel,
      goal: seed.goal || `Nội dung ngày ${day}`,
      summary: seed.summary || '',
      slots: [],
    };
    if (!group.channel && channel) group.channel = channel;
    if (!group.goal && seed.goal) group.goal = seed.goal;
    if (!group.summary && seed.summary) group.summary = seed.summary;

    const nextSlotIndex = slotIndex || group.slots.length + 1;
    group.slots.push({
      slotId: seed.slotId || `d${day}-s${nextSlotIndex}`,
      slotIndex: nextSlotIndex,
      channel,
      sendTime: seed.sendTime || null,
      goal: seed.goal || group.goal || '',
      summary: seed.summary || group.summary || '',
      delayValue: Number.isFinite(Number(seed.delayValue)) ? Number(seed.delayValue) : null,
      delayUnit: seed.delayUnit || null,
    });
    grouped.set(day, group);
  };

  daysRaw.forEach((dayItem, idx) => {
    const day = Number(dayItem?.day);
    if (!Number.isFinite(day) || day <= 0) return;

    if (Array.isArray(dayItem?.slots) && dayItem.slots.length > 0) {
      dayItem.slots.forEach((slot, slotIdx) => {
        pushSlot(
          day,
          {
            ...slot,
            goal: slot?.goal || dayItem.goal,
            summary: slot?.summary || dayItem.summary,
            channel: slot?.channel || dayItem.channel,
          },
          dayItem.channel,
          Number(slot?.slotIndex) || slotIdx + 1
        );
      });
      return;
    }

    // Legacy fallback: one item per day or flat items.
    pushSlot(
      day,
      {
        ...dayItem,
        slotId: dayItem.slotId || `legacy-${idx + 1}`,
      },
      dayItem.channel
    );
  });

  const normalizedDays = [...grouped.values()]
    .sort((a, b) => a.day - b.day)
    .map((dayItem) => ({
      ...dayItem,
      channel: normalizeChannel(dayItem.channel || dayItem.slots[0]?.channel || 'zalo'),
      slots: [...dayItem.slots]
        .sort((a, b) => Number(a.slotIndex || 0) - Number(b.slotIndex || 0))
        .map((slot, idx) => ({
          ...slot,
          slotIndex: Number(slot.slotIndex) || idx + 1,
          channel: normalizeChannel(slot.channel || dayItem.channel || 'zalo'),
        })),
    }));

  return {
    totalDays: Number(rawData?.totalDays) || normalizedDays.length,
    days: normalizedDays,
  };
};

const AiChatbot = ({ isOpen, onToggle, panelWidth = 420, onWidthChange, onResizeStart, onResizeEnd, variant = 'panel' }) => {
  const { t, locale } = useI18n();
  const { user, fetchAiCredits, aiCredits, billingStatus, addons, activeContext } = useAuthStore();
  const isSuperAdmin = user?.role === 'admin';
  const isEmployeeCtx = activeContext?.type === 'employee';

  const aiBillingBlock = useMemo(
    () => getAiBillingBlockState({
      isAdmin: isSuperAdmin,
      billingStatus,
      aiCredits,
      walletRemaining: Number(addons?.aiCredits?.remaining) || 0,
    }),
    [addons, aiCredits, billingStatus, isSuperAdmin],
  );

  const welcomeMessage = isSuperAdmin
    ? t('aiChatbot.welcomeAdmin')
    : t('aiChatbot.welcomeUser');

  const [messages, setMessages] = useState([{
    role: 'assistant',
    content: welcomeMessage,
  }]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [currentScript, setCurrentScript] = useState(null);
  const [campaignConfirmation, setCampaignConfirmation] = useState(null);
  const [hasProfile, setHasProfile] = useState(true);
  const [showCampaignPicker, setShowCampaignPicker] = useState(false);
  const [templatePickerContext, setTemplatePickerContext] = useState(null);
  const [selectedScriptForPush, setSelectedScriptForPush] = useState(null);
  const [pendingLandingPrompt, setPendingLandingPrompt] = useState(null);
  const [pendingLandingData, setPendingLandingData] = useState(null);
  const [_creatingCampaign, setCreatingCampaign] = useState(false);
  const [autoCreatedCampaign, setAutoCreatedCampaign] = useState(null);
  const [generatingDay, setGeneratingDay] = useState(null);
  const [contentPlanWorkflow, setContentPlanWorkflow] = useState(null);
  const [wizardContext, setWizardContext] = useState(() => deriveWizardContext([]));
  
  // Trạng thái cho flow campaign mới: hỏi chọn type → hỏi audience → confirm → tạo
  const [quickActionsOpen, setQuickActionsOpen] = useState(false);
  const [pendingCampaignPrompt, setPendingCampaignPrompt] = useState(null); // Prompt gốc của user
  const [pendingCampaignData, setPendingCampaignData] = useState(null); // Data từ AI khi hỏi campaign type
  const [isEditingDraft, setIsEditingDraft] = useState(false); // Đang chỉnh sửa draft trong chatbot
  const [_selectedCampaignType, setSelectedCampaignType] = useState(null); // Type đã chọn (email/zalo/zalo_group)
  const [_selectedAudience, setSelectedAudience] = useState(null); // Audience đã chọn (interested/cart_abandoned/all)

  const [sessions, setSessions] = useState([]);
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const [sessionToDelete, setSessionToDelete] = useState(null);
  const [isSavingAllTemplates, setIsSavingAllTemplates] = useState(false);

  const isMobile = useIsMobile();
  const [isResizingPanel, setIsResizingPanel] = useState(false);
  const panelDragStartXRef = useRef(0);
  const panelDragStartWidthRef = useRef(panelWidth);

  const messagesEndRef = useRef(null);
  const isSendingRef = useRef(false);
  const fileInputRef = useRef(null);
  const hasInitializedRef = useRef(false);
  const tabsScrollRef = useRef(null);
  const tabsDragRef = useRef({ dragging: false, startX: 0, scrollLeft: 0, moved: false });
  const currentSessionIdRef = useRef(null);
  const sessionMessagesCache = useRef(new Map()); // sessionId → messages[] (for background generation)
  const campaignConfirmationRequestRef = useRef(0);
  const sessionWizardStateCache = useRef(new Map()); // sessionId → wizard_state từ server (restore khi tab-switch)
  const wizardPatchQueueRef = useRef(Promise.resolve()); // serialize PATCH wizard-state (tránh interleave khi "Lưu tất cả")
  const [serverWizardGates, setServerWizardGates] = useState(null); // gates persist trên server của session hiện tại
  const pendingTabIdRef = useRef(new Set()); // non-rendering check
  const [pendingTabIds, setPendingTabIds] = useState(new Set()); // for tab dot indicator
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const getAiRequestErrorMessage = (error) => getAiQuotaErrorMessage(error, t);

  const refreshAiCredits = () => {
    if (isSuperAdmin) return;
    fetchAiCredits?.().catch(() => {});
  };

  const notifyAiRequestError = (error) => {
    const message = getAiRequestErrorMessage(error);
    if (shouldShowAiUpgradeCta(error)) {
      toast((toastInstance) => (
        <div className="flex flex-col gap-2 text-sm">
          <span>{message}</span>
          <button
            type="button"
            className="self-start font-semibold text-orange-600 underline"
            onClick={() => {
              toast.dismiss(toastInstance.id);
              navigate('/pricing');
            }}
          >
            {t('aiChatbot.upgradePlan')}
          </button>
        </div>
      ), { duration: 8000 });
      return;
    }
    toast.error(message);
  };

  useEffect(() => {
    if (!isResizingPanel) return;

    const handleMouseMove = (e) => {
      const delta = panelDragStartXRef.current - e.clientX;
      const nextWidth = Math.min(700, Math.max(320, panelDragStartWidthRef.current + delta));
      onWidthChange?.(nextWidth);
    };

    const handleMouseUp = () => {
      setIsResizingPanel(false);
      onResizeEnd?.();
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizingPanel, onWidthChange, onResizeEnd]);

  const handlePanelResizeStart = (e) => {
    e.preventDefault();
    setIsResizingPanel(true);
    panelDragStartXRef.current = e.clientX;
    panelDragStartWidthRef.current = panelWidth;
    onResizeStart?.();
  };

  // Keep currentSessionIdRef in sync so async closures can check the current session
  useEffect(() => {
    currentSessionIdRef.current = currentSessionId;
  }, [currentSessionId]);

  const markTabPending = (sessionId) => {
    if (!sessionId) return;
    pendingTabIdRef.current.add(sessionId);
    setPendingTabIds(new Set(pendingTabIdRef.current));
  };
  const clearTabPending = (sessionId) => {
    if (!sessionId) return;
    pendingTabIdRef.current.delete(sessionId);
    setPendingTabIds(new Set(pendingTabIdRef.current));
  };
  // Creates a session-aware setMessages wrapper. Updates cache always; updates display only if user is still on this session.
  const makeUpdater = (sessionId, baseMessages) => {
    let snapshot = baseMessages;
    return (updater) => {
      snapshot = typeof updater === 'function' ? updater(snapshot) : updater;
      if (sessionId) {
        sessionMessagesCache.current.set(sessionId, snapshot);
        if (currentSessionIdRef.current === sessionId) setMessages(updater);
      } else {
        setMessages(updater); // new session (no ID yet): use normal update
      }
    };
  };

  // Every confirm_create path flows through this one read-only preview request.
  // The response is deliberately held only in component state, never appended to chat history.
  const prepareAndShowCampaignConfirmation = async (rawScript, { sessionId = currentSessionIdRef.current, update, content, appendMessage = true } = {}) => {
    const requestId = ++campaignConfirmationRequestRef.current;
    const confirmationId = `campaign-confirmation-${requestId}`;
    const message = { role: 'assistant', content, type: 'confirm_create', data: rawScript, confirmationId };
    if (appendMessage && update) update((previous) => [...previous, message]);
    setCurrentScript(rawScript);
    setIsEditingDraft(false);
    setCampaignConfirmation({ confirmationId, rawScript, status: 'loading', confirmationView: null, error: null });
    try {
      const response = await aiApi.prepareCampaign(rawScript);
      if (requestId !== campaignConfirmationRequestRef.current) return;
      if (sessionId && currentSessionIdRef.current && currentSessionIdRef.current !== sessionId) return;
      if (!response.success || !response.data?.confirmationView) throw new Error(response.message || 'Không thể chuẩn bị bản xem trước');
      setCampaignConfirmation({ confirmationId, rawScript, status: 'ready', confirmationView: response.data.confirmationView, error: null });
    } catch (error) {
      if (requestId !== campaignConfirmationRequestRef.current) return;
      setCampaignConfirmation({ confirmationId, rawScript, status: 'error', confirmationView: null, error: error.response?.data?.message || error.message || 'Không thể chuẩn bị bản xem trước' });
    }
  };

  // Fire-and-forget PATCH wizard-state, serialize qua promise queue để "Lưu tất cả"
  // không gửi interleave. Chỉ gọi khi session đã tồn tại trên server.
  const enqueueWizardPatch = (action, payload = {}) => {
    const sessionId = currentSessionIdRef.current;
    if (!sessionId) return;
    wizardPatchQueueRef.current = wizardPatchQueueRef.current
      .then(() => aiApi.patchWizardState(sessionId, action, payload))
      .catch(() => {});
  };

  // Rebuild contentPlanWorkflow + serverWizardGates từ wizard_state server trả về.
  // Return true nếu đã set workflow (caller bỏ qua fallback lossy từ messages).
  const restoreFromServerWizardState = (wizardState) => {
    const gates = wizardState?.v === 1 ? wizardState.gates : null;
    const planSection = wizardState?.v === 1 ? wizardState.plan : null;
    setServerWizardGates(gates || null);

    if (!planSection?.snapshot || planSection.status === 'completed') return false;
    const normalizedPlan = normalizeContentPlanData(planSection.snapshot);
    if (!normalizedPlan.days.length) return false;

    const savedTemplates = Array.isArray(planSection.savedTemplates) ? planSection.savedTemplates : [];
    const completedDays = getCompletedDaysFromSaved(normalizedPlan.days, savedTemplates);
    const pendingDay = getNextPendingDay(normalizedPlan.days, completedDays);
    const savedCountByDay = buildSavedCountByDay(savedTemplates);
    const allDone = !pendingDay && savedTemplates.length > 0;

    setContentPlanWorkflow({
      sourcePrompt: planSection.sourcePrompt || '',
      plan: normalizedPlan,
      pendingDay,
      completedDays,
      savedTemplates,
      draftTemplates: [],
      savedCountByDay,
      generatingDay: null,
      failedDay: null,
      awaitingDayConfirm: Boolean(pendingDay),
      awaitingCampaignConfirm: allDone,
      isCreatingCampaign: false,
      isGeneratingAll: false,
      allDraftsRequested: false,
      requiresApproval: planSection.requiresApproval !== false,
      planApproved: Boolean(gates?.planApproved),
      status: allDone
        ? 'waiting_campaign_confirm'
        : (savedTemplates.length > 0 ? 'waiting_template_save' : 'waiting_day_confirm'),
    });
    return true;
  };

  const loadSession = async (sessionId) => {
    // If this session has cached messages (background generation in-progress or just completed), load from cache
    if (sessionMessagesCache.current.has(sessionId)) {
      currentSessionIdRef.current = sessionId;
      setCurrentSessionId(sessionId);
      const cachedMessages = sessionMessagesCache.current.get(sessionId);
      setMessages(cachedMessages);
      const cachedConfirmation = [...cachedMessages].reverse().find((message) => message.type === 'confirm_create' && message.data);
      if (cachedConfirmation) {
        await prepareAndShowCampaignConfirmation(cachedConfirmation.data, { sessionId, content: cachedConfirmation.content, appendMessage: false });
      } else {
        campaignConfirmationRequestRef.current += 1;
        setCampaignConfirmation(null);
      }
      setIsTyping(pendingTabIdRef.current.has(sessionId));
      // Cache path không hit server — restore wizard state từ cache; không clobber
      // workflow đang sống (có thể chứa draft chưa lưu)
      const cachedState = sessionWizardStateCache.current.get(sessionId);
      if (cachedState) {
        if (!contentPlanWorkflow) {
          restoreFromServerWizardState(cachedState);
        } else {
          setServerWizardGates(cachedState?.v === 1 ? cachedState.gates : null);
        }
      } else {
        setServerWizardGates(null);
      }
      return;
    }
    try {
      const res = await aiApi.getSessionMessages(sessionId);
      const dbMessages = res.data || [];
      const serverWizardState = res.wizardState || null;
      if (serverWizardState) {
        sessionWizardStateCache.current.set(sessionId, serverWizardState);
      }

      // Tìm assistant message cuối cùng có type tương tác
      let lastAssistantIdx = -1;
      for (let i = dbMessages.length - 1; i >= 0; i--) {
        if (dbMessages[i].role === 'assistant') { lastAssistantIdx = i; break; }
      }
      const lastAssistant = lastAssistantIdx >= 0 ? dbMessages[lastAssistantIdx] : null;
      const interactiveTypes = ['ask_landing_details', 'ask_campaign_details', 'ask_campaign_type', 'ask_audience', 'ask_sender_account', 'email_setup_guide', 'zalo_qr_login', 'zalo_group_picker', 'confirm_create', 'landing_page', 'template_draft', 'content_plan', 'content_plan_actions', 'auto_created_success'];

      const mappedMessages = dbMessages.map((m) => {
        if (m.role === 'assistant' && interactiveTypes.includes(m.type)) {
          return { role: m.role, content: m.content, type: m.type, data: m.data };
        }
        if (m.role === 'user' && parseWizardMarker(m.content)) {
          return { role: m.role, content: m.content, silent: true };
        }
        return {
          role: m.role,
          content: m.content,
          ...(m.role === 'user' && Array.isArray(m.data?.files) ? { files: m.data.files } : {}),
        };
      });

      currentSessionIdRef.current = sessionId;
      setMessages([{ role: 'assistant', content: welcomeMessage }, ...mappedMessages]);
      setCurrentSessionId(sessionId);

      // Restore workflow từ wizard_state server (nguồn chuẩn); fallback lossy từ
      // messages chỉ khi server chưa có state (session cũ trước migration)
      let workflowRestored = false;
      if (serverWizardState) {
        workflowRestored = restoreFromServerWizardState(serverWizardState);
      } else {
        setServerWizardGates(null);
      }

      // Restore pending state cho card tương tác cuối cùng
      const lastUserMsg = lastAssistantIdx > 0
        ? [...dbMessages].slice(0, lastAssistantIdx).reverse().find(m => m.role === 'user')
        : null;

      if (lastAssistant?.type === 'ask_landing_details') {
        setPendingLandingPrompt(lastUserMsg?.content || '');
        setPendingLandingData(lastAssistant.data);
        setPendingCampaignPrompt(null); setPendingCampaignData(null); setCurrentScript(null);
      } else if (['ask_campaign_details', 'ask_campaign_type'].includes(lastAssistant?.type)) {
        setPendingCampaignPrompt(lastUserMsg?.content || '');
        setPendingCampaignData(lastAssistant.data);
        setPendingLandingPrompt(null); setPendingLandingData(null); setCurrentScript(null);
      } else if (lastAssistant?.type === 'confirm_create') {
        await prepareAndShowCampaignConfirmation(lastAssistant.data, {
          sessionId,
          content: lastAssistant.content,
          appendMessage: false,
        });
        setPendingCampaignPrompt(null); setPendingCampaignData(null);
        setPendingLandingPrompt(null); setPendingLandingData(null);
        if (!workflowRestored) setContentPlanWorkflow(null);
      } else if (['content_plan', 'content_plan_actions'].includes(lastAssistant?.type)) {
        if (!workflowRestored) {
          const contentPlanMsg = [...dbMessages].reverse().find((m) => m.type === 'content_plan' && m.data);
          if (contentPlanMsg?.data) {
            const normalizedPlan = normalizeContentPlanData(contentPlanMsg.data);
            setContentPlanWorkflow({
              sourcePrompt: lastUserMsg?.content || '',
              plan: normalizedPlan,
              pendingDay: normalizedPlan.days[0]?.day || null,
              completedDays: [],
              savedTemplates: [],
              draftTemplates: [],
              savedCountByDay: {},
              generatingDay: null,
              failedDay: null,
              awaitingDayConfirm: true,
              awaitingCampaignConfirm: false,
              isCreatingCampaign: false,
              isGeneratingAll: false,
              allDraftsRequested: false,
              requiresApproval: contentPlanMsg.data.requiresApproval !== false,
              planApproved: false,
              status: 'waiting_day_confirm',
            });
          } else {
            setContentPlanWorkflow(null);
          }
        }
        setPendingCampaignPrompt(null); setPendingCampaignData(null);
        setPendingLandingPrompt(null); setPendingLandingData(null); setCurrentScript(null);
      } else {
        setPendingCampaignPrompt(null); setPendingCampaignData(null);
        setPendingLandingPrompt(null); setPendingLandingData(null); setCurrentScript(null);
        if (!workflowRestored) setContentPlanWorkflow(null);
      }
    } catch { /* silent */ }
  };

  const startNewChat = () => {
    campaignConfirmationRequestRef.current += 1;
    setCurrentSessionId(null);
    setMessages([{ role: 'assistant', content: welcomeMessage }]);
    setPendingCampaignPrompt(null);
    setPendingCampaignData(null);
    setPendingLandingPrompt(null);
    setPendingLandingData(null);
    setCurrentScript(null);
    setCampaignConfirmation(null);
    setContentPlanWorkflow(null);
    setWizardContext(deriveWizardContext([]));
    setServerWizardGates(null);
    setGeneratingDay(null);
  };

  const requestDeleteSession = (sessionId, e) => {
    e.stopPropagation();
    setSessionToDelete(sessionId);
  };

  const confirmDeleteSession = async () => {
    const sessionId = sessionToDelete;
    if (!sessionId) return;
    setSessionToDelete(null);
    try {
      await aiApi.deleteSession(sessionId);
      sessionMessagesCache.current.delete(sessionId);
      clearTabPending(sessionId);
      const updated = sessions.filter(s => s.id !== sessionId);
      setSessions(updated);
      if (currentSessionId === sessionId) {
        if (updated.length > 0) {
          await loadSession(updated[0].id);
        } else {
          startNewChat();
        }
      }
    } catch { /* silent */ }
  };

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      if (!isSuperAdmin) {
        aiApi.getBusinessProfile()
          .then(res => setHasProfile(!!res.data))
          .catch(() => setHasProfile(true));
      }
      // Load sessions một lần khi panel mở lần đầu — chỉ để hiện danh sách tabs.
      // KHÔNG tự động load phiên gần nhất: mỗi lần mở panel đều bắt đầu ở
      // phiên chat mới (welcome message). Người dùng có thể click tab session
      // cũ trong sidebar để quay lại context trước.
      if (!hasInitializedRef.current) {
        hasInitializedRef.current = true;
        aiApi.getSessions()
          .then(res => {
            setSessions(res.data || []);
            startNewChat();
          })
          .catch(() => {
            startNewChat();
          });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Nút "Hỏi trợ lý về mục này" ở trang hướng dẫn (/huong-dan/:slug) điều hướng tới
  // /app?ask=<slug> — khi panel mở, tự điền câu hỏi gợi ý rồi xoá query param.
  useEffect(() => {
    const askSlug = searchParams.get('ask');
    if (!isOpen || !askSlug) return;

    let mounted = true;
    getHelpArticle(askSlug, locale)
      .then((res) => {
        if (!mounted) return;
        const title = res.data?.result?.title;
        setInputText(title ? t('aiChatbot.askAboutArticle', { title }) : t('aiChatbot.askAboutSlug', { slug: askSlug }));
      })
      .catch(() => {
        if (mounted) setInputText(t('aiChatbot.askAboutSlug', { slug: askSlug }));
      });

    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('ask');
      return next;
    }, { replace: true });

    return () => { mounted = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, searchParams, locale]);

  useEffect(() => {
    if (isOpen) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ scroll khi messages đổi; isOpen chỉ là guard
  }, [messages]);

  useEffect(() => {
    const derived = deriveWizardContext(messages);
    setWizardContext(serverWizardGates ? mergeClientWizardContext(derived, serverWizardGates) : derived);
  }, [messages, serverWizardGates]);

  useEffect(() => {
    setMessages(prev => {
      if (prev.length === 0) return prev;
      const newWelcome = isSuperAdmin ? t('aiChatbot.welcomeAdmin') : t('aiChatbot.welcomeUser');
      if (prev[0].content === newWelcome) return prev;
      return [{ role: 'assistant', content: newWelcome }, ...prev.slice(1)];
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale]);

  const uploadFiles = async (files) => {
    if (!files.length) return;
    setIsUploading(true);
    try {
      const results = await Promise.all(files.map(async (file) => {
        const previewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : null;
        const fd = new FormData();
        fd.append('file', file);
        const res = await api.post('/uploads/temp', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
        // Giữ File gốc để tải-về-ngay tin vừa gửi (chưa có url server) — không cần F5.
        return { ...res.data.data, previewUrl, localFile: file };
      }));
      setUploadedFiles(prev => [...prev, ...results]);
      toast.success(`Đã tải lên ${results.length} tệp`);
    } catch {
      toast.error('Tải tệp lên thất bại');
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileUpload = (e) => uploadFiles(Array.from(e.target.files));

  const fileChipMeta = (f) => {
    const ext = (f.originalName || '').split('.').pop().toLowerCase();
    if (f.previewUrl || ['jpg','jpeg','png','webp','gif'].includes(ext))
      return { label: 'Ảnh', icon: null, bg: 'bg-blue-50 border-blue-200', text: 'text-blue-600' };
    if (['xlsx','xls','csv'].includes(ext))
      return { label: 'Excel', icon: null, bg: 'bg-green-50 border-green-200', text: 'text-green-600' };
    if (ext === 'pdf')
      return { label: 'PDF', icon: null, bg: 'bg-red-50 border-red-200', text: 'text-red-500' };
    if (['doc','docx'].includes(ext))
      return { label: 'Word', icon: null, bg: 'bg-sky-50 border-sky-200', text: 'text-sky-600' };
    return { label: 'File', icon: null, bg: 'bg-slate-100 border-slate-200', text: 'text-slate-500' };
  };

  // URL tải file về (ép attachment, như Zalo/Messenger). Chỉ có khi tin đã lưu:
  // f.url dạng /file/<token> (viewer tài liệu) → +/download; ảnh /file/<token>/download?preview=true → bỏ query.
  // File vừa upload (temp) chưa có url → trả null (không cho tải, người dùng đang giữ bản gốc).
  const fileDownloadHref = (f) => {
    const raw = f?.url;
    if (!raw) return null;
    const base = String(raw).split('?')[0];
    return base.endsWith('/download') ? base : `${base}/download`;
  };

  // Tải file VỪA GỬI (chưa có url server) ngay từ bộ nhớ trình duyệt — không cần F5.
  const downloadLocalFile = (file, name) => {
    if (!(file instanceof Blob)) return;
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = name || file.name || 'download';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
  const handleDragEnter = (e) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e) => { if (!e.currentTarget.contains(e.relatedTarget)) setIsDragging(false); };
  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length) uploadFiles(files);
  };

  const buildSavedCountByDay = (savedTemplates) => savedTemplates.reduce((acc, item) => {
    const key = String(item.day);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const getNextPendingDay = (planDays, completedDays) => {
    const completed = new Set(completedDays);
    const next = planDays.find((d) => !completed.has(d.day));
    return next?.day ?? null;
  };

  const getPlanSlotKey = (day, slot, index = 0) => (
    String(slot?.slotId || `d${day}-s${Number(slot?.slotIndex) || index + 1}`)
  );

  const getCompletedDaysFromSaved = (planDays, savedTemplates) => {
    const savedKeys = new Set((savedTemplates || []).map((item) => String(item.slotId)));
    return (planDays || [])
      .filter((dayItem) => {
        const day = Number(dayItem.day);
        const slots = Array.isArray(dayItem.slots) ? dayItem.slots : [];
        return slots.length > 0 && slots.every((slot, index) => savedKeys.has(getPlanSlotKey(day, slot, index)));
      })
      .map((dayItem) => dayItem.day);
  };

  const getPendingPlanSlotsForDay = (dayItem) => {
    if (!dayItem || !contentPlanWorkflow?.plan) return [];
    const day = Number(dayItem.day);
    if (!Number.isFinite(day)) return [];
    const slots = Array.isArray(dayItem.slots) ? dayItem.slots : [];
    const savedKeys = new Set((contentPlanWorkflow.savedTemplates || []).map((item) => String(item.slotId)));
    const draftedKeys = new Set((contentPlanWorkflow.draftTemplates || []).map((item) => String(item._planSlotKey)));
    return slots
      .map((slot, index) => {
        const slotOrder = Number(slot.slotIndex) || index + 1;
        const slotKey = getPlanSlotKey(day, slot, index);
        return { slot, index, slotOrder, slotKey };
      })
      .filter(({ slotKey }) => !savedKeys.has(slotKey) && !draftedKeys.has(slotKey));
  };

  const openTemplatePickerForDay = (dayItem) => {
    if (!dayItem || generatingDay !== null) return;
    const pendingSlots = getPendingPlanSlotsForDay(dayItem);
    if (!pendingSlots.length) {
      toast(t('aiChatbot.planDayTemplatesReady') || 'Ngày này đã có đủ template.');
      return;
    }
    setTemplatePickerContext({ mode: 'pick', dayItem, slots: pendingSlots });
  };

  const openTemplatePickerForDraft = (draft) => {
    if (!draft?._planSlotKey || generatingDay !== null) return;
    setTemplatePickerContext({ mode: 'replace', draft });
  };

  const buildLibraryDraftFromTemplate = (tpl, draftMeta, apiChannel) => ({
    templateName: tpl.templateName || tpl.name || `Template #${tpl.id}`,
    subject: tpl.subject || '',
    bodyHtml: tpl.bodyHtml || '',
    bodyText: tpl.bodyText || tpl.message || '',
    channel: draftMeta.channel || apiChannel,
    _planTemplate: draftMeta._planTemplate,
    _planDay: draftMeta._planDay,
    _planSlotId: draftMeta._planSlotId,
    _planSlotKey: draftMeta._planSlotKey,
    _planSlotIndex: draftMeta._planSlotIndex,
    _planSendTime: draftMeta._planSendTime,
    _planSummary: draftMeta._planSummary,
    _fromLibrary: true,
    _libraryTemplateId: tpl.id,
  });

  const handleTemplatePickerClose = () => {
    setTemplatePickerContext(null);
  };

  const handleTemplatePickerSelect = async (templateSummary) => {
    const context = templatePickerContext;
    if (!templateSummary?.id) return;

    if (context?.mode === 'replace' && context.draft) {
      const draftMeta = context.draft;
      const draftChannel = normalizeChannel(draftMeta.channel);
      const apiChannel = draftChannel === 'email' ? 'email' : 'zalo';
      const endpoint = apiChannel === 'email' ? '/email-templates' : '/zalo-templates';

      try {
        const detailRes = await api.get(`${endpoint}/${templateSummary.id}`);
        const tpl = detailRes.data?.data;
        if (!tpl) throw new Error('Template not found');

        const draftData = buildLibraryDraftFromTemplate(tpl, draftMeta, apiChannel);
        const slotKey = String(draftMeta._planSlotKey);

        setMessages((prev) => prev.map((msg) => (
          msg.type === 'template_draft' && String(msg.data?._planSlotKey) === slotKey
            ? {
              ...msg,
              content: t('aiChatbot.existingTemplateFilled', {
                name: draftData.templateName,
              }) || `Đã điền template «${draftData.templateName}» vào nháp bên dưới.`,
              data: draftData,
            }
            : msg
        )));

        setContentPlanWorkflow((prev) => {
          if (!prev) return prev;
          const draftTemplates = prev.draftTemplates.some((item) => String(item._planSlotKey) === slotKey)
            ? prev.draftTemplates.map((item) => (
              String(item._planSlotKey) === slotKey ? draftData : item
            ))
            : [...prev.draftTemplates, draftData];
          return {
            ...prev,
            draftTemplates,
            status: 'waiting_template_save',
          };
        });

        setTemplatePickerContext(null);
      } catch (err) {
        toast.error(err.response?.data?.message || err.message || t('aiChatbot.templateLoadFailed') || 'Không tải được template.');
      }
      return;
    }

    if (!context?.slots?.length) return;

    const { dayItem, slots } = context;
    const { slot, slotOrder, slotKey } = slots[0];
    const day = Number(dayItem.day);
    const draftChannel = normalizeChannel(dayItem.channel || slot.channel);
    const apiChannel = draftChannel === 'email' ? 'email' : 'zalo';
    const endpoint = apiChannel === 'email' ? '/email-templates' : '/zalo-templates';

    try {
      const detailRes = await api.get(`${endpoint}/${templateSummary.id}`);
      const tpl = detailRes.data?.data;
      if (!tpl) throw new Error('Template not found');

      const draftData = buildLibraryDraftFromTemplate(tpl, {
        channel: apiChannel,
        _planTemplate: true,
        _planDay: day,
        _planSlotId: slotKey,
        _planSlotKey: slotKey,
        _planSlotIndex: slotOrder,
        _planSendTime: slot.sendTime || null,
        _planSummary: slot.summary || dayItem.summary || '',
      }, apiChannel);

      const assistantMsg = {
        role: 'assistant',
        content: t('aiChatbot.existingTemplatePicked', {
          name: draftData.templateName,
          day,
        }) || `Đã chọn template «${draftData.templateName}» cho Ngày ${day}. Xác nhận để tiếp tục.`,
        type: 'template_draft',
        data: draftData,
      };

      setMessages((prev) => [...prev, assistantMsg]);
      setContentPlanWorkflow((prev) => {
        if (!prev) return prev;
        const exists = prev.draftTemplates.some((item) => String(item._planSlotKey) === String(slotKey));
        return {
          ...prev,
          draftTemplates: exists ? prev.draftTemplates : [...prev.draftTemplates, draftData],
          generatingDay: null,
          failedDay: null,
          awaitingDayConfirm: false,
          status: 'waiting_template_save',
        };
      });

      const remainingSlots = slots.slice(1);
      if (remainingSlots.length > 0) {
        setTemplatePickerContext({ mode: 'pick', dayItem, slots: remainingSlots });
      } else {
        setTemplatePickerContext(null);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || t('aiChatbot.templateLoadFailed') || 'Không tải được template.');
    }
  };

  const getSlotDelayHours = (slot, day, slotIndex, baseHour) => {
    const parsed = parseHourFromSendTime(slot.sendTime);
    if (parsed !== null) {
      const absoluteHour = (day - 1) * 24 + parsed;
      return Math.max(0, Math.round(absoluteHour - baseHour));
    }

    if (Number.isFinite(Number(slot.delayValue)) && slot.delayUnit) {
      const rawDelay = Number(slot.delayValue);
      const unit = String(slot.delayUnit).toLowerCase();
      if (unit === 'hours') return rawDelay;
      if (unit === 'days') return rawDelay * 24;
      if (unit === 'minutes') return Math.max(0, Math.round(rawDelay / 60));
    }

    const fallbackHour = (day - 1) * 24 + ((slotIndex - 1) * 11);
    return Math.max(0, Math.round(fallbackHour - baseHour));
  };

  const buildCampaignScriptFromSavedTemplates = (workflow) => {
    const plan = workflow?.plan;
    const saved = Array.isArray(workflow?.savedTemplates) ? workflow.savedTemplates : [];
    if (!plan || saved.length === 0) return null;

    const ordered = [...saved].sort((a, b) => {
      if (a.day !== b.day) return a.day - b.day;
      return a.slotIndex - b.slotIndex;
    });

    const firstSlot = ordered[0];
    const firstParsedHour = parseHourFromSendTime(firstSlot?.sendTime);
    const baseHour = firstParsedHour !== null
      ? ((firstSlot.day - 1) * 24 + firstParsedHour)
      : ((firstSlot.day - 1) * 24);

    const channel = normalizeChannel(plan.days?.[0]?.channel || ordered[0]?.channel || 'zalo');
    const campaignName = channel === 'email'
      ? `Email Auto Plan ${new Date().toLocaleDateString('vi-VN')}`
      : channel === 'zalo_group'
        ? `Zalo nhóm Auto Plan ${new Date().toLocaleDateString('vi-VN')}`
        : `Zalo Auto Plan ${new Date().toLocaleDateString('vi-VN')}`;
    const description = workflow?.sourcePrompt
      ? `AI content-plan draft: ${workflow.sourcePrompt}`
      : 'AI content-plan draft';

    if (channel === 'email') {
      const emailSteps = ordered.map((slot, idx) => ({
        templateId: Number(slot.templateId),
        emailSubject: slot.subject || slot.templateName || `Email ${idx + 1}`,
        emailBody: slot.bodyHtml || '',
        delayValue: getSlotDelayHours(slot, slot.day, slot.slotIndex, baseHour),
        delayUnit: 'hours',
        delayFrom: 'start',
        enableLinkTracking: true,
        templateMappings: [],
      }));

      return {
        campaignName,
        description,
        campaignType: 'email',
        isAiDraft: true,
        nodes: [
          { tempId: 'n1', nodeType: 'trigger', nodeSubtype: 'manual', nodeName: 'Bắt đầu', nodeDescription: '', positionX: 100, positionY: 200, config: {} },
          { tempId: 'n2', nodeType: 'data', nodeSubtype: 'interested_customers', nodeName: 'Danh sách khách', nodeDescription: 'Khách từ database', positionX: 350, positionY: 200, config: { interestedCustomerType: 'both', interestedLimit: 1000 } },
          {
            tempId: 'n3',
            nodeType: 'action',
            nodeSubtype: 'send_email',
            nodeName: 'Chuỗi Email theo ngày',
            nodeDescription: `Tự động tạo từ content plan ${ordered.length} template`,
            positionX: 650,
            positionY: 200,
            config: {
              fromEmailId: null,
              sendMode: 'schedule',
              recipientSource: 'node',
              recipientNodeId: 'n2',
              recipientField: 'email',
              saveMessageLog: true,
              emailSteps,
            },
          },
          { tempId: 'n4', nodeType: 'end', nodeSubtype: 'end', nodeName: 'Kết thúc', nodeDescription: '', positionX: 920, positionY: 200, config: {} },
        ],
        connections: [
          { sourceNodeId: 'n1', targetNodeId: 'n2' },
          { sourceNodeId: 'n2', targetNodeId: 'n3' },
          { sourceNodeId: 'n3', targetNodeId: 'n4' },
        ],
      };
    }

    if (channel === 'zalo_group') {
      const zaloGroupTemplateSteps = ordered.map((slot, idx) => ({
        templateId: Number(slot.templateId),
        message: slot.bodyText || slot.summary || `Tin nhắn nhóm ${idx + 1}`,
        delayValue: getSlotDelayHours(slot, slot.day, slot.slotIndex, baseHour),
        delayUnit: 'hours',
        delayFrom: 'start',
        enableLinkTracking: true,
        templateMappings: [],
      }));

      return {
        campaignName,
        description,
        campaignType: 'zalo_group',
        isAiDraft: true,
        nodes: [
          { tempId: 'n1', nodeType: 'trigger', nodeSubtype: 'manual', nodeName: 'Bắt đầu', nodeDescription: '', positionX: 100, positionY: 200, config: {} },
          { tempId: 'n2', nodeType: 'action', nodeSubtype: 'select_zalo_account', nodeName: 'Chọn tài khoản Zalo', nodeDescription: '', positionX: 300, positionY: 200, config: { zaloAccountId: null } },
          { tempId: 'n3', nodeType: 'data', nodeSubtype: 'get_all_groups', nodeName: 'Danh sách nhóm', nodeDescription: 'Lấy tất cả nhóm Zalo', positionX: 500, positionY: 200, config: { zaloAccountNodeId: 'n2' } },
          {
            tempId: 'n4',
            nodeType: 'action',
            nodeSubtype: 'send_zalo_group',
            nodeName: 'Chuỗi Zalo nhóm theo ngày',
            nodeDescription: `Tự động tạo từ content plan ${ordered.length} template`,
            positionX: 750,
            positionY: 200,
            config: {
              zaloAccountId: null,
              zaloGroupSource: 'node',
              zaloGroupNodeId: 'n3',
              zaloGroupField: 'groupId',
              zaloGroupSendMode: 'schedule',
              saveMessageLog: true,
              zaloGroupTemplateSteps,
            },
          },
          { tempId: 'n5', nodeType: 'end', nodeSubtype: 'end', nodeName: 'Kết thúc', nodeDescription: '', positionX: 1000, positionY: 200, config: {} },
        ],
        connections: [
          { sourceNodeId: 'n1', targetNodeId: 'n2' },
          { sourceNodeId: 'n2', targetNodeId: 'n3' },
          { sourceNodeId: 'n3', targetNodeId: 'n4' },
          { sourceNodeId: 'n4', targetNodeId: 'n5' },
        ],
      };
    }

    const zaloPersonalTemplateSteps = ordered.map((slot, idx) => ({
      templateId: Number(slot.templateId),
      message: slot.bodyText || slot.summary || `Tin nhắn ${idx + 1}`,
      delayValue: getSlotDelayHours(slot, slot.day, slot.slotIndex, baseHour),
      delayUnit: 'hours',
      delayFrom: 'start',
      enableLinkTracking: true,
      templateMappings: [],
    }));

    return {
      campaignName,
      description,
      campaignType: 'zalo',
      isAiDraft: true,
      nodes: [
        { tempId: 'n1', nodeType: 'trigger', nodeSubtype: 'manual', nodeName: 'Bắt đầu', nodeDescription: '', positionX: 100, positionY: 200, config: {} },
        { tempId: 'n2', nodeType: 'data', nodeSubtype: 'interested_customers', nodeName: 'Danh sách khách', nodeDescription: 'Khách từ database', positionX: 350, positionY: 200, config: { interestedCustomerType: 'both', interestedLimit: 1000 } },
        {
          tempId: 'n3',
          nodeType: 'action',
          nodeSubtype: 'send_zalo_personal',
          nodeName: 'Chuỗi Zalo theo ngày',
          nodeDescription: `Tự động tạo từ content plan ${ordered.length} template`,
          positionX: 650,
          positionY: 200,
          config: {
            zaloAccountId: null,
            zaloRecipientSource: 'node',
            zaloRecipientNodeId: 'n2',
            zaloRecipientField: 'phone',
            zaloRecipientType: 'phone',
            zaloPersonalSendMode: 'schedule',
            saveMessageLog: true,
            zaloPersonalTemplateSteps,
          },
        },
        { tempId: 'n4', nodeType: 'end', nodeSubtype: 'end', nodeName: 'Kết thúc', nodeDescription: '', positionX: 920, positionY: 200, config: {} },
      ],
      connections: [
        { sourceNodeId: 'n1', targetNodeId: 'n2' },
        { sourceNodeId: 'n2', targetNodeId: 'n3' },
        { sourceNodeId: 'n3', targetNodeId: 'n4' },
      ],
    };
  };

  const createCampaignDraftFromPlan = async () => {
    if (!contentPlanWorkflow?.awaitingCampaignConfirm || contentPlanWorkflow?.isCreatingCampaign) return;

    const script = applyWizardSelectionsToScript(buildCampaignScriptFromSavedTemplates(contentPlanWorkflow), wizardContext);
    if (!script) {
      toast.error('Chưa có template đã lưu để tạo chiến dịch.');
      return;
    }

    setContentPlanWorkflow((prev) => (prev ? { ...prev, isCreatingCampaign: true } : prev));
    const loadingToast = toast.loading('Đang tạo campaign draft từ các template đã lưu...');
    try {
      const res = await aiApi.createCampaignFromDraft(script);
      if (res.success) {
        toast.success('Đã tạo campaign draft thành công!', { id: loadingToast });
        enqueueWizardPatch('mark_campaign_created', { campaignId: res.campaignId ?? null });
        setContentPlanWorkflow((prev) => (prev ? {
          ...prev,
          isCreatingCampaign: false,
          awaitingCampaignConfirm: false,
          status: 'completed',
        } : prev));
        setMessages((prev) => [...prev, {
          role: 'assistant',
          content: `🎉 Đã tạo chiến dịch draft "${script.campaignName}". Mình mở Campaign Builder để bạn review trước khi chạy.`,
        }]);
        if (res.campaignId) {
          navigate(`/app/campaigns/${res.campaignId}/builder`);
          onToggle?.();
        }
      } else {
        toast.error(res.message || 'Không thể tạo campaign draft.', { id: loadingToast });
        setContentPlanWorkflow((prev) => (prev ? { ...prev, isCreatingCampaign: false } : prev));
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Không thể tạo campaign draft.', { id: loadingToast });
      setContentPlanWorkflow((prev) => (prev ? { ...prev, isCreatingCampaign: false } : prev));
    }
  };

  const shouldHandlePlanConfirmationByText = (text) => {
    if (!text || !contentPlanWorkflow) return false;
    // Khi đang chờ duyệt plan — không dùng nhánh day-confirm (thiếu approve_plan).
    const waitingPlanApproval = contentPlanWorkflow.requiresApproval !== false
      && !contentPlanWorkflow.planApproved
      && contentPlanWorkflow.status === 'waiting_day_confirm';
    if (waitingPlanApproval) return false;
    if (!DAY_CONFIRM_REGEX.test(text.trim())) return false;
    return contentPlanWorkflow.awaitingDayConfirm || contentPlanWorkflow.awaitingCampaignConfirm;
  };

  const handleCancelPlanByText = async () => {
    enqueueWizardPatch('reset_plan');
    setContentPlanWorkflow(null);
    setPendingCampaignData(null);
    setPendingCampaignPrompt(null);
    setMessages((prev) => [...prev, {
      role: 'user',
      content: locale === 'en' ? 'cancel' : 'huỷ',
    }, {
      role: 'assistant',
      content: locale === 'en'
        ? 'Stopped. The content plan was cleared. Tell me if you want to start a new campaign.'
        : 'Đã dừng. Kế hoạch nội dung đã được xoá. Bạn muốn tạo chiến dịch mới thì nói mình nhé.',
    }]);
  };

  const handlePlanConfirmationByText = async () => {
    if (!contentPlanWorkflow) return;
    if (contentPlanWorkflow.awaitingCampaignConfirm) {
      await createCampaignDraftFromPlan();
      return;
    }
    if (!contentPlanWorkflow.awaitingDayConfirm || !contentPlanWorkflow.pendingDay) return;
    const dayItem = contentPlanWorkflow.plan.days.find((d) => d.day === contentPlanWorkflow.pendingDay);
    if (!dayItem) return;
    await handleGenerateDayTemplate(dayItem);
  };

  const sendChatMessage = async (trimmedInput, messageFiles = [], options = {}) => {
    const { silentUser = false, historyBase = null } = options;
    if (isSendingRef.current) return;
    if (aiBillingBlock) {
      notifyAiRequestError({
        response: {
          data: {
            code: 'RESOURCE_LIMIT_EXCEEDED',
            resource: aiBillingBlock.type === 'expired' ? 'ai_credit' : 'ai_credit',
            upgradeRequired: true,
            message: aiBillingBlock.type === 'expired'
              ? t('aiChatbot.planExpired')
              : t('aiChatbot.aiCreditExceeded'),
          },
        },
      });
      return;
    }
    if (!trimmedInput && !messageFiles.length) return;

    isSendingRef.current = true;

    let mySessionId = currentSessionId;
    const baseMessages = historyBase ?? messages;
    const update = makeUpdater(mySessionId, [...baseMessages]);
    if (mySessionId) markTabPending(mySessionId);

    const wizardMarker = parseWizardMarker(trimmedInput);
    const userMsg = {
      role: 'user',
      content: trimmedInput,
      files: [...messageFiles],
      silent: silentUser || Boolean(wizardMarker),
    };
    const newHistory = [...(wizardMarker ? stripWizardCards(baseMessages) : baseMessages), userMsg];
    update(newHistory);
    setIsTyping(true);

    try {
      const response = await aiApi.chat(newHistory, userMsg.files, currentSessionId, locale);
      if (response.success) {
        refreshAiCredits();
        const { type, content, data, missing_fields, sessionId: returnedSessionId, sessionTitle } = response.data;
        if (returnedSessionId && !currentSessionId) {
          mySessionId = returnedSessionId;
          markTabPending(mySessionId);
          setCurrentSessionId(returnedSessionId);
          setSessions(prev => [{ id: returnedSessionId, title: sessionTitle || trimmedInput.slice(0, 60), updated_at: new Date().toISOString(), created_at: new Date().toISOString() }, ...prev]);
        } else if (returnedSessionId) {
          setSessions(prev => prev.map(s => s.id === returnedSessionId ? { ...s, updated_at: new Date().toISOString() } : s));
        }

        if (type === 'ask_campaign_details' && data) {
          setPendingCampaignPrompt(trimmedInput);
          setPendingCampaignData(data);
          update(prev => appendWizardAssistantMessage(prev, { role: 'assistant', content, type, data }));
          return;
        }

        if (type === 'ask_landing_details' && data) {
          setPendingLandingPrompt(trimmedInput);
          setPendingLandingData(data);
          update(prev => [...prev, { role: 'assistant', content, type, data }]);
          return;
        }

        if (type === 'ask_campaign_type' && data) {
          setPendingCampaignPrompt(trimmedInput);
          setPendingCampaignData(data);
          update(prev => [...prev, { role: 'assistant', content, type, data }]);
          return;
        }

        if (type === 'ask_audience' && data) {
          setPendingCampaignData(prev => prev ? { ...prev, ...data } : data);
          update(prev => [...prev, { role: 'assistant', content, type, data }]);
          return;
        }

        if (['ask_sender_account', 'email_setup_guide', 'zalo_qr_login', 'zalo_group_picker'].includes(type)) {
          setPendingCampaignPrompt(null);
          setPendingCampaignData(null);
          update(prev => appendWizardAssistantMessage(prev, { role: 'assistant', content, type, data: data || {} }));
          return;
        }

        if (type === 'content_plan' && data) {
          const normalizedPlan = normalizeContentPlanData(data);
          // Plan rỗng (AI trả 0 ngày) — message riêng, đừng báo nhầm "chỉ hỗ trợ 1 kênh"
          if (!normalizedPlan.days.length) {
            update((prev) => [...prev, {
              role: 'assistant',
              content: t('aiChatbot.contentPlanEmpty')
                || 'Kế hoạch AI trả về chưa có ngày nào. Bạn mô tả lại số ngày và nội dung muốn gửi giúp mình nhé (ví dụ: "5 email trong 5 ngày ra mắt sản phẩm").',
            }]);
            return;
          }
          const channels = new Set(
            normalizedPlan.days.flatMap((dayItem) => dayItem.slots.map((slot) => normalizeChannel(slot.channel || dayItem.channel)))
          );
          if (channels.size !== 1 || !PLAN_SUPPORTED_CHANNELS.has([...channels][0])) {
            update((prev) => [...prev, {
              role: 'assistant',
              content: t('aiChatbot.contentPlanUnsupportedChannel'),
            }]);
            return;
          }

          setContentPlanWorkflow({
            sourcePrompt: trimmedInput,
            plan: normalizedPlan,
            pendingDay: normalizedPlan.days[0]?.day || null,
            completedDays: [],
            savedTemplates: [],
            draftTemplates: [],
            savedCountByDay: {},
            generatingDay: null,
            failedDay: null,
            awaitingDayConfirm: true,
            awaitingCampaignConfirm: false,
            isCreatingCampaign: false,
            isGeneratingAll: false,
            allDraftsRequested: false,
            requiresApproval: data.requiresApproval !== false,
            status: 'waiting_day_confirm',
          });
          setPendingCampaignPrompt(null);
          setPendingCampaignData(null);
          setCurrentScript(null);
          update((prev) => [...prev, {
            role: 'assistant',
            content: content || `Mình đã lên kế hoạch ${normalizedPlan.totalDays} ngày.`,
            type,
            data: normalizedPlan,
          }, {
            role: 'assistant',
            type: 'content_plan_actions',
            data: { firstDay: normalizedPlan.days[0]?.day || null },
            content: data.requiresApproval === false
              ? (t('aiChatbot.planStartDayHint') || 'Bạn muốn bắt đầu tạo nháp Ngày 1?')
              : (t('aiChatbot.planApprovalHint') || 'Xem kế hoạch bên trên. Nếu ổn bấm Đồng ý; nếu cần sửa bấm Chỉnh lại kế hoạch.'),
          }]);
          return;
        }

        if (type === 'suggest_content_plan' && data) {
          setPendingCampaignPrompt(null);
          setPendingCampaignData(null);
          update(prev => appendWizardAssistantMessage(prev, { role: 'assistant', content, type, data }));
          return;
        }

        if (type === 'confirm_create' && data) {
          // Derive từ newHistory (thay vì wizardContext state) để không bỏ sót
          // tin nhắn vừa gửi trong lượt này (ví dụ link Google Sheet vừa dán)
          const mergedScript = applyWizardSelectionsToScript(data, deriveWizardContext(newHistory));
          await prepareAndShowCampaignConfirmation(mergedScript, { sessionId: mySessionId, update, content });
          return;
        }

        if (type === 'create_and_run' && data) {
          setCreatingCampaign(true);
          const scriptData = {
            ...applyWizardSelectionsToScript(data, deriveWizardContext(newHistory)),
            isAiDraft: false,
            autoRun: true,
          };
          update(prev => [...prev, {
            role: 'assistant',
            content: content || 'Đang tạo và chạy chiến dịch cho bạn...',
            type: 'auto_creating',
            data: { campaignName: data.campaignName },
          }]);

          try {
            const createResult = await aiApi.createAndRunCampaign(scriptData);
            setCreatingCampaign(false);
            if (createResult.success) {
              setAutoCreatedCampaign(createResult.data);
              update(prev => [...prev, {
                role: 'assistant',
                content: `🎉 Chiến dịch "${createResult.data.campaignName}" đã được tạo và đang chạy!\n\nRun ID: ${createResult.data.runId || 'N/A'}\n\nBạn có thể theo dõi tiến trình tại trang Chiến dịch.`,
                type: 'auto_created_success',
                data: createResult.data,
              }]);
            } else {
              update(prev => [...prev, {
                role: 'assistant',
                content: `⚠️ ${createResult.message || 'Có lỗi khi tạo chiến dịch. Vui lòng thử lại.'}`,
                type: 'error',
              }]);
            }
          } catch (createErr) {
            setCreatingCampaign(false);
            update(prev => [...prev, {
              role: 'assistant',
              content: `⚠️ Lỗi: ${getAiRequestErrorMessage(createErr)}`,
              type: 'error',
            }]);
          }
          return;
        }

        if (type === 'confirm_create' && data) {
          await prepareAndShowCampaignConfirmation(data, { sessionId: mySessionId, update, content });
          return;
        }
        update(prev => [...prev, {
          role: 'assistant', content, type, data,
          missing_fields: missing_fields || [],
        }]);
      }
    } catch (error) {
      update(prev => [...prev, {
        role: 'assistant',
        content: `⚠️ Lỗi: ${getAiRequestErrorMessage(error)}`
      }]);
    } finally {
      setIsTyping(false);
      isSendingRef.current = false;
      clearTabPending(mySessionId);
    }
  };

  const emitWizardAnswer = async (payload, readableText) => {
    await sendChatMessage(buildWizardMarkerText(payload, readableText));
  };

  const handleWizardSenderSelect = async (account, channel = null, options = {}) => {
    const { viaQr = false } = options;
    const selectedChannel = channel || wizardContext.channel || 'zalo';
    await emitWizardAnswer(
      {
        gate: 'senderAccount',
        channel: selectedChannel,
        accountId: account.id,
        accountName: account.name || account.displayName || account.email || `#${account.id}`,
        ...(viaQr ? { viaQr: true } : {}),
      },
      selectedChannel === 'email'
        ? `Tôi chọn email sender "${account.name || account.email || account.id}".`
        : `Tôi chọn tài khoản Zalo "${account.name || account.displayName || account.id}".`
    );
  };

  const handleWizardSenderOther = async (channel) => {
    const selectedChannel = channel || wizardContext.channel || 'zalo';
    const marker = buildWizardMarkerText(
      { gate: 'senderAccount', channel: selectedChannel, other: true },
      selectedChannel === 'email' ? 'Tôi muốn dùng email sender khác.' : 'Tôi muốn kết nối tài khoản Zalo khác.'
    );
    if (selectedChannel === 'email') {
      await sendChatMessage(marker);
      return;
    }
    setMessages((prev) => [
      ...stripWizardCards(prev),
      { role: 'user', content: marker, silent: true },
      {
        role: 'assistant',
        type: 'zalo_qr_login',
        content: t('aiChatbot.wizardZaloQrPrompt') || 'Quét QR để kết nối tài khoản Zalo rồi mình sẽ tiếp tục.',
        data: { channel: selectedChannel },
      },
    ]);
  };

  const mapZaloAccountsForPicker = (rawAccounts = []) => {
    const list = Array.isArray(rawAccounts) ? rawAccounts : [];
    return list.map((account) => ({
      id: account.id,
      name: account.displayName || account.display_name || account.zaloName || account.zalo_name || `Zalo #${account.id}`,
      email: null,
      status: account.status || 'unknown',
      isDefault: Boolean(account.isDefault ?? account.is_default),
      usable: account.status === 'connected'
        && account.isActive !== false
        && account.is_active !== false,
    }));
  };

  const handleWizardZaloBackToAccounts = async (channel) => {
    const selectedChannel = channel || wizardContext.channel || 'zalo';
    try {
      const response = await zaloSettingsApiService.listAccounts();
      const payload = response?.data?.data ?? response?.data ?? [];
      const rawList = Array.isArray(payload) ? payload : (payload.items || []);
      const accounts = mapZaloAccountsForPicker(rawList);
      const usableCount = accounts.filter((account) => account.usable).length;

      setMessages((prev) => [
        ...stripWizardCards(prev),
        {
          role: 'assistant',
          content: t('aiChatbot.wizardChooseZaloAccount') || 'Bạn chọn tài khoản Zalo sẽ dùng cho chiến dịch nhé.',
          type: 'ask_sender_account',
          data: {
            channel: selectedChannel,
            accounts,
            allowOther: true,
            noUsableAccount: usableCount === 0,
          },
        },
      ]);
    } catch (error) {
      toast.error(error?.response?.data?.message || t('aiChatbot.wizardZaloAccountLoadFailed') || 'Không tải được danh sách tài khoản Zalo.');
    }
  };

  const handleWizardGroupsSubmit = async (groupIds, groups = []) => {
    const labels = groups
      .filter((group) => groupIds.includes(group.groupId || group.group_id || group.id))
      .map((group) => group.groupName || group.group_name || group.name)
      .filter(Boolean);
    await emitWizardAnswer(
      { gate: 'zaloGroups', accountId: wizardContext.senderAccountId, groupIds },
      `Tôi chọn ${groupIds.length} nhóm Zalo${labels.length ? `: ${labels.join(', ')}` : ''}.`
    );
  };

  const requestContentPlan = async (userPrompt, historyBase = null) => {
    const text = locale === 'en'
      ? `Return content_plan JSON only (day-by-day overview, no full message bodies) for: ${userPrompt}`
      : `Hãy trả về content_plan JSON (kế hoạch từng ngày, không viết full nội dung tin) cho: ${userPrompt}`;
    await sendChatMessage(text, [], { silentUser: true, historyBase });
  };

  const handleSend = async () => {
    if (isSendingRef.current) return;
    const trimmedInput = inputText.trim();
    if (!trimmedInput && !uploadedFiles.length) return;

    // Huỷ plan/wizard bằng free-text — trước mọi nhánh chat.
    if (
      trimmedInput
      && uploadedFiles.length === 0
      && PLAN_CANCEL_REGEX.test(trimmedInput)
      && contentPlanWorkflow
    ) {
      isSendingRef.current = true;
      setInputText('');
      try {
        await handleCancelPlanByText();
      } finally {
        isSendingRef.current = false;
      }
      return;
    }

    // Duyệt kế hoạch: mirror nút Đồng ý (approve_plan + generate day 1).
    const waitingPlanApproval = Boolean(
      contentPlanWorkflow
      && contentPlanWorkflow.requiresApproval !== false
      && !contentPlanWorkflow.planApproved
      && contentPlanWorkflow.status === 'waiting_day_confirm'
    );
    if (
      trimmedInput
      && uploadedFiles.length === 0
      && waitingPlanApproval
      && PLAN_APPROVE_REGEX.test(trimmedInput)
    ) {
      isSendingRef.current = true;
      setInputText('');
      try {
        await handleApproveContentPlan();
      } finally {
        isSendingRef.current = false;
      }
      return;
    }

    if (trimmedInput && uploadedFiles.length === 0 && shouldHandlePlanConfirmationByText(trimmedInput)) {
      isSendingRef.current = true;
      setInputText('');
      setMessages((prev) => [...prev, { role: 'user', content: trimmedInput }]);
      try {
        await handlePlanConfirmationByText();
      } finally {
        isSendingRef.current = false;
      }
      return;
    }

    const files = [...uploadedFiles];
    setInputText('');
    setUploadedFiles([]);
    await sendChatMessage(trimmedInput, files);
  };

  const handleEditTemplate = (draft) => {
    navigate('/app/settings/templates', { state: { aiDraft: draft } });
    onToggle?.();
  };

  const handlePlanTemplateSaved = (draft, savedTemplate) => {
    if (!draft?._planTemplate || !savedTemplate?.id) return;

    const day = Number(draft._planDay);
    const slotIndex = Number(draft._planSlotIndex) || 1;
    const slotId = draft._planSlotId || `d${day}-s${slotIndex}`;
    if (!Number.isFinite(day)) return;

    const record = {
      day,
      slotIndex,
      slotId,
      channel: normalizeChannel(draft.channel || 'zalo'),
      sendTime: draft._planSendTime || null,
      summary: draft._planSummary || '',
      templateId: Number(savedTemplate.id),
      templateName: savedTemplate.templateName || draft.templateName,
      subject: draft.subject || '',
      bodyHtml: draft.bodyHtml || '',
      bodyText: draft.bodyText || '',
    };

    // Persist tiến độ lên server để F5 không mất (server dedupe theo slotId)
    enqueueWizardPatch('record_template_saved', { records: [record] });

    setContentPlanWorkflow((prev) => {
      if (!prev) return prev;
      if (prev.savedTemplates.some((item) => String(item.slotId) === String(slotId))) return prev;

      const mergedSaved = [...prev.savedTemplates, record];
      const completedDays = getCompletedDaysFromSaved(prev.plan.days, mergedSaved);
      const dayJustCompleted = completedDays.includes(day) && !prev.completedDays.includes(day);
      const nextPendingDay = getNextPendingDay(prev.plan.days, completedDays);
      const allDone = !nextPendingDay;
      const savedCountByDay = buildSavedCountByDay(mergedSaved);

      if (dayJustCompleted) {
        setMessages((current) => {
          const next = [...current, {
            role: 'assistant',
            content: `✅ Đã lưu đủ ${savedCountByDay[String(day)] || 0} template cho Ngày ${day}.`,
          }];

          if (allDone) {
            next.push({
              role: 'assistant',
              type: 'confirm_plan_campaign',
              content: 'Đã hoàn tất toàn bộ kế hoạch. Bạn muốn tạo campaign draft từ các template này không?',
            });
          } else if (!prev.allDraftsRequested) {
            next.push({
              role: 'assistant',
              type: 'confirm_next_day',
              data: { day: nextPendingDay },
              content: `Tiếp tục tạo template cho Ngày ${nextPendingDay} nhé?`,
            });
          }

          return next;
        });
      }

      return {
        ...prev,
        savedTemplates: mergedSaved,
        completedDays,
        savedCountByDay,
        pendingDay: nextPendingDay,
        failedDay: null,
        awaitingDayConfirm: Boolean(nextPendingDay) && !prev.allDraftsRequested,
        awaitingCampaignConfirm: allDone,
        status: allDone ? 'waiting_campaign_confirm' : 'waiting_template_save',
      };
    });
  };

  const getUnsavedPlanDrafts = () => {
    if (!contentPlanWorkflow) return [];
    const savedKeys = new Set((contentPlanWorkflow.savedTemplates || []).map((item) => String(item.slotId)));
    return (contentPlanWorkflow.draftTemplates || []).filter((draft) => !savedKeys.has(String(draft._planSlotKey)));
  };

  const handleSaveAllPlanTemplates = async () => {
    if (isSavingAllTemplates) return;
    const drafts = getUnsavedPlanDrafts();
    if (!drafts.length) return;

    setIsSavingAllTemplates(true);
    let savedCount = 0;
    let failedCount = 0;
    try {
      for (const draft of drafts) {
        try {
          if (draft._fromLibrary && draft._libraryTemplateId) {
            handlePlanTemplateSaved(draft, { id: draft._libraryTemplateId, templateName: draft.templateName });
            savedCount += 1;
            continue;
          }
          const endpoint = draft.channel === 'email' ? '/email-templates' : '/zalo-templates';
          const response = await api.post(endpoint, {
            templateName: draft.templateName,
            subject: draft.subject || '',
            bodyHtml: draft.bodyHtml || '',
            bodyText: draft.bodyText || '',
            category: 'AI Generated',
            variables: [],
          });
          const savedTemplate = response?.data?.data || null;
          if (!savedTemplate?.id) throw new Error('missing saved template id');
          handlePlanTemplateSaved(draft, savedTemplate);
          savedCount += 1;
        } catch {
          failedCount += 1;
        }
      }
    } finally {
      setIsSavingAllTemplates(false);
    }

    if (failedCount > 0) {
      toast.error(t('aiChatbot.planSaveAllPartial', { saved: savedCount, failed: failedCount })
        || `Đã lưu ${savedCount} template, ${failedCount} template lỗi. Bạn bấm Lưu ở từng template còn lại nhé.`);
    } else {
      toast.success(t('aiChatbot.planSaveAllDone', { count: savedCount })
        || `Đã lưu ${savedCount} template vào thư viện.`);
    }
  };

  const handleGenerateDayTemplate = async (dayItem, options = {}) => {
    const { allMode = false, silentDone = false } = options;
    if (!dayItem || generatingDay !== null || !contentPlanWorkflow?.plan) return;

    const day = Number(dayItem.day);
    if (!Number.isFinite(day)) return;
    if (!allMode && contentPlanWorkflow.pendingDay !== day) return;

    const slots = Array.isArray(dayItem.slots) ? dayItem.slots : [];
    if (!slots.length) {
      toast.error(`Ngày ${day} không có slot để tạo template.`);
      return false;
    }

    const savedKeys = new Set((contentPlanWorkflow.savedTemplates || []).map((item) => String(item.slotId)));
    const draftedKeys = new Set((contentPlanWorkflow.draftTemplates || []).map((item) => String(item._planSlotKey)));
    const slotItems = slots.map((slot, index) => {
      const slotOrder = Number(slot.slotIndex) || index + 1;
      const slotKey = getPlanSlotKey(day, slot, index);
      return { slot, index, slotOrder, slotKey };
    });
    const slotsToProcess = slotItems.filter(({ slotKey }) => !savedKeys.has(slotKey) && !draftedKeys.has(slotKey));
    const hasUnsavedDrafts = slotItems.some(({ slotKey }) => draftedKeys.has(slotKey) && !savedKeys.has(slotKey));

    if (!slotsToProcess.length) {
      if (!silentDone) {
        setMessages((prev) => [...prev, {
          role: 'assistant',
          content: hasUnsavedDrafts
            ? `Template nháp Ngày ${day} đã được tạo bên dưới. Bạn xem nội dung rồi bấm Lưu từng template để tiếp tục.`
            : `Ngày ${day} đã có đủ template lưu trước đó.`,
        }]);
      }
      return true;
    }

    setGeneratingDay(day);
    setIsTyping(true);
    setContentPlanWorkflow((prev) => (prev ? {
      ...prev,
      generatingDay: day,
      failedDay: null,
      awaitingDayConfirm: false,
      isGeneratingAll: allMode ? true : prev.isGeneratingAll,
      allDraftsRequested: allMode ? true : prev.allDraftsRequested,
      status: allMode ? 'generating_all' : 'generating_day',
    } : prev));

    let mySessionId = currentSessionId;
    if (mySessionId) markTabPending(mySessionId);
    let workingHistory = [...messages];
    const generatedDrafts = [];

    try {
      for (let index = 0; index < slotsToProcess.length; index += 1) {
        const { slot, slotOrder, slotKey } = slotsToProcess[index];
        const channelLabel = slot.channel === 'email'
          ? 'Email'
          : slot.channel === 'zalo_group'
            ? 'Zalo nhóm'
            : 'Zalo cá nhân';
        const slotPromptParts = [
          `Tạo chi tiết template cho ngày ${day}, slot ${slotOrder} (${channelLabel}).`,
          `Mục tiêu ngày: ${dayItem.goal || slot.goal || ''}`,
          `Tóm tắt ngày: ${dayItem.summary || ''}`,
          `Tóm tắt slot: ${slot.summary || ''}`,
        ];
        if (slot.sendTime) slotPromptParts.push(`Khung giờ gửi: ${slot.sendTime}`);
        const slotPrompt = slotPromptParts.filter(Boolean).join(' ');

        const slotUserMsg = { role: 'user', content: slotPrompt };
        workingHistory = [...workingHistory, slotUserMsg];
        const response = await aiApi.chat(workingHistory, [], mySessionId, locale);
        if (!response?.success) {
          throw new Error('AI không trả về kết quả hợp lệ');
        }
        refreshAiCredits();

        const { type, data, content, sessionId: returnedSessionId, sessionTitle } = response.data;
        if (returnedSessionId && !mySessionId) {
          mySessionId = returnedSessionId;
          markTabPending(mySessionId);
          setCurrentSessionId(returnedSessionId);
          setSessions((prev) => [{
            id: returnedSessionId,
            title: sessionTitle || `Content plan ngày ${day}`,
            updated_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
          }, ...prev]);
        } else if (returnedSessionId) {
          setSessions((prev) => prev.map((s) => (s.id === returnedSessionId ? { ...s, updated_at: new Date().toISOString() } : s)));
        }

        if (type !== 'template_draft' || !data) {
          throw new Error(content || 'AI không trả về template_draft cho slot này.');
        }
        const draftChannel = normalizeChannel(data.channel || dayItem.channel || slot.channel);
        if (!PLAN_SUPPORTED_CHANNELS.has(draftChannel)) {
          throw new Error(t('aiChatbot.contentPlanUnsupportedChannel'));
        }

        const draftData = {
          ...data,
          channel: draftChannel,
          _planTemplate: true,
          _planDay: day,
          _planSlotId: slotKey,
          _planSlotKey: slotKey,
          _planSlotIndex: slotOrder,
          _planSendTime: slot.sendTime || null,
          _planSummary: slot.summary || dayItem.summary || '',
        };

        const assistantMsg = {
          role: 'assistant',
          content: content || t('aiChatbot.templateCreated'),
          type,
          data: draftData,
        };
        workingHistory = [...workingHistory, assistantMsg];
        generatedDrafts.push(draftData);
        setMessages((current) => [...current, assistantMsg]);
        setContentPlanWorkflow((prev) => {
          if (!prev) return prev;
          const exists = prev.draftTemplates.some((item) => String(item._planSlotKey) === String(draftData._planSlotKey));
          if (exists) return prev;
          return {
            ...prev,
            draftTemplates: [...prev.draftTemplates, draftData],
          };
        });
      }

      if (!silentDone) {
        setMessages((current) => [...current, {
          role: 'assistant',
          content: `✅ Đã tạo ${generatedDrafts.length} template nháp cho Ngày ${day}. Bạn xem nội dung rồi bấm Lưu từng template để tiếp tục.`,
        }]);
      }

      setContentPlanWorkflow((prev) => (prev ? {
        ...prev,
        generatingDay: null,
        failedDay: null,
        awaitingDayConfirm: false,
        status: 'waiting_template_save',
      } : prev));
      return true;
    } catch (err) {
      const message = getAiRequestErrorMessage(err);
      notifyAiRequestError(err);
      if (generatedDrafts.length > 0) {
        setContentPlanWorkflow((prev) => {
          if (!prev) return prev;
          const mergedDrafts = [...prev.draftTemplates];
          generatedDrafts.forEach((draft) => {
            if (!mergedDrafts.some((item) => String(item._planSlotKey) === String(draft._planSlotKey))) {
              mergedDrafts.push(draft);
            }
          });
          return {
            ...prev,
            draftTemplates: mergedDrafts,
          };
        });
      }
      setContentPlanWorkflow((prev) => (prev ? {
        ...prev,
        generatingDay: null,
        failedDay: day,
        awaitingDayConfirm: true,
        status: 'waiting_day_confirm',
      } : prev));
      setMessages((prev) => [...prev, {
        role: 'assistant',
        type: 'confirm_next_day',
        data: { day, retry: true },
        content: `⚠️ Tạo template Ngày ${day} bị lỗi: ${message}. Bạn bấm "Thử lại Ngày ${day}" hoặc gõ "có" để thử lại.`,
      }]);
      return false;
    } finally {
      setIsTyping(false);
      setGeneratingDay(null);
      if (mySessionId) clearTabPending(mySessionId);
    }
  };

  const handleApproveContentPlan = async () => {
    if (!contentPlanWorkflow?.plan) return;
    const day = Number(contentPlanWorkflow.pendingDay || contentPlanWorkflow.plan.days?.[0]?.day);
    const dayItem = contentPlanWorkflow.plan.days?.find((item) => Number(item.day) === day);
    if (!dayItem) return;
    const marker = buildWizardMarkerText({ gate: 'planApproved', value: true }, 'Đồng ý với kế hoạch này.');
    setMessages((prev) => [...prev, { role: 'user', content: marker, silent: true }]);
    setContentPlanWorkflow((prev) => (prev ? { ...prev, planApproved: true } : prev));
    enqueueWizardPatch('approve_plan');
    await handleGenerateDayTemplate(dayItem);
  };

  const handleReviseContentPlan = async (feedback) => {
    const trimmed = String(feedback || '').trim();
    if (!trimmed) return;
    // Reset plan trên server trước (backend merge cũng reset qua revision text — belt & braces)
    enqueueWizardPatch('reset_plan');
    const basePrompt = contentPlanWorkflow?.sourcePrompt || '';
    const filtered = messages.filter((msg) => !['content_plan', 'content_plan_actions'].includes(msg.type));
    const feedbackContent = t('aiChatbot.planReviseUserMessage', { feedback: trimmed })
      || `Góp ý chỉnh kế hoạch: ${trimmed}`;
    const visibleUserMsg = { role: 'user', content: feedbackContent };
    const historyWithFeedback = [...filtered, visibleUserMsg];

    setMessages(historyWithFeedback);
    setContentPlanWorkflow(null);
    setPendingCampaignData(null);
    setPendingCampaignPrompt(null);

    const revisionPrompt = basePrompt
      ? `${basePrompt}\n\nGóp ý chỉnh kế hoạch: ${trimmed}`
      : `Hãy chỉnh lại content_plan theo góp ý: ${trimmed}`;
    await requestContentPlan(revisionPrompt, historyWithFeedback);
  };

  const handleWizardPlanApproved = async () => {
    await handleApproveContentPlan();
  };

  const handleGenerateAllPlanTemplates = async () => {
    if (!contentPlanWorkflow?.plan || generatingDay !== null || contentPlanWorkflow?.isGeneratingAll) return;

    setContentPlanWorkflow((prev) => (prev ? {
      ...prev,
      awaitingDayConfirm: false,
      isGeneratingAll: true,
      allDraftsRequested: true,
      status: 'generating_all',
    } : prev));

    const days = contentPlanWorkflow.plan.days || [];
    let generatedAll = true;
    for (const dayItem of days) {
      const ok = await handleGenerateDayTemplate(dayItem, { allMode: true, silentDone: true });
      if (!ok) {
        generatedAll = false;
        break;
      }
    }

    setContentPlanWorkflow((prev) => (prev ? {
      ...prev,
      isGeneratingAll: false,
      generatingDay: null,
      status: generatedAll ? 'waiting_template_save' : prev.status,
    } : prev));

    if (generatedAll) {
      setMessages((prev) => [...prev, {
        role: 'assistant',
        type: 'save_all_templates',
        content: t('aiChatbot.planAllDraftsReady')
          || '✅ Đã tạo nháp tất cả template trong kế hoạch. Bạn có thể xem lại và Lưu từng template, hoặc bấm nút bên dưới để lưu tất cả 1 lượt; khi lưu đủ mình sẽ tạo campaign draft cho bạn.',
      }]);
    }
  };

  // Write AI campaign script to sessionStorage draft so CampaignBuilder loads it directly
  const _handleEditCampaign = (script) => {
    console.log('[AI Chatbot] handleEditCampaign called with script:', JSON.stringify(script, null, 2));
    const draftData = {
      campaignName: script.campaignName || '',
      campaignDescription: script.description || '',
      campaignType: script.campaignType || 'mixed',
      // Store raw script nodes/connections for buildFlowFromCampaign (legacy format)
      _aiScript: script,
      updatedAt: new Date().toISOString(),
    };
    console.log('[AI Chatbot] Saving draftData:', JSON.stringify(draftData, null, 2));
    writeCampaignDraft(draftData);
    console.log('[AI Chatbot] Draft saved, navigating to builder');
    // Force reload to ensure CampaignBuilder remounts and reads the new draft
    // Use a query param to force React Router to recognize a new navigation
    const timestamp = Date.now();
    navigate(`/app/campaigns/new/builder?t=${timestamp}`, { replace: true });
    onToggle?.();
  };

  const handleSaveLandingPage = (page) => {
    navigate('/app/settings/landing-pages', { state: { aiDraft: page } });
    onToggle?.();
  };

  /**
   * Xử lý khi user chọn campaign type (email/zalo/zalo_group)
   */
  /**
   * Xử lý khi user submit câu trả lời từ AskCampaignDetailsCard
   * summaryText: chuỗi mô tả lựa chọn, answers: { channel, productCount, sendingStyle, audienceCount }
   */
  const handleCampaignDetailsSubmit = async (summaryText, answers) => {
    const wizardQuestion = pendingCampaignData?.questions?.find((q) => q.wizardGate);
    if (wizardQuestion) {
      if (wizardQuestion.wizardGate === 'channel') {
        await emitWizardAnswer(
          { gate: 'channel', channel: answers.channel },
          summaryText
        );
        return;
      }
      if (wizardQuestion.wizardGate === 'dataSource') {
        await emitWizardAnswer(
          { gate: 'dataSource', value: answers.dataSource },
          summaryText
        );
        return;
      }
      if (wizardQuestion.wizardGate === 'schedule') {
        const schedule = parseScheduleValue(answers.schedule, answers);
        await emitWizardAnswer(
          {
            gate: 'schedule',
            value: schedule.mode,
            mode: schedule.mode,
            days: schedule.days,
            slotsPerDay: schedule.slotsPerDay,
          },
          summaryText
        );
        return;
      }
      if (wizardQuestion.wizardGate === 'planApproved') {
        // Ghi thẳng state lên server trước (idempotent với marker phía sau)
        enqueueWizardPatch('approve_plan');
        if (contentPlanWorkflow?.plan) {
          await handleWizardPlanApproved();
        } else {
          // Không còn plan workflow ở client (session reload / plan đã hoàn tất) —
          // gửi marker duyệt kế hoạch cho backend để wizard đi tiếp thay vì kẹt im lặng
          await emitWizardAnswer({ gate: 'planApproved', value: true }, 'Đồng ý với kế hoạch này.');
        }
        return;
      }
    }

    if (!pendingCampaignPrompt) return;
    setIsTyping(true);
    const mySessionId = currentSessionId;
    const update = makeUpdater(mySessionId, [...messages]);
    if (mySessionId) markTabPending(mySessionId);
    update(prev => [...prev, { role: 'user', content: summaryText }]);

    // Nếu user chọn dùng mẫu email có sẵn, fetch template content để nhúng vào prompt
    let emailTemplateContext = '';
    if (answers.emailChoice === 'existing' && answers.emailTemplateName) {
      try {
        const searchRes = await api.get('/email-templates', {
          params: { search: answers.emailTemplateName, limit: 1 },
        });
        const found = searchRes.data?.data?.items?.[0];
        if (found) {
          const detailRes = await api.get(`/email-templates/${found.id}`);
          const tpl = detailRes.data?.data;
          if (tpl) {
            emailTemplateContext = `\n\nSử dụng mẫu email có sẵn (KHÔNG tạo nội dung mới):\nTên mẫu: ${tpl.templateName}\nTiêu đề email: ${tpl.subject || ''}\nNội dung HTML:\n${tpl.bodyHtml || tpl.bodyText || ''}`;
            answers = { ...answers, emailTemplateId: found.id };
          }
        } else {
          toast(`⚠️ Không tìm thấy mẫu email "${answers.emailTemplateName}", AI sẽ tạo nội dung mới.`, { icon: '⚠️' });
        }
      } catch {
        // silently fall back to AI-generated content
      }
    }

    try {
      const enrichedHistory = [
        ...messages,
        { role: 'user', content: pendingCampaignPrompt },
        { role: 'assistant', content: 'Cho tôi hỏi vài điều để thiết kế chiến dịch phù hợp.' },
        { role: 'user', content: summaryText + emailTemplateContext },
      ];
      const response = await aiApi.chat(enrichedHistory, uploadedFiles, null, locale);
      if (response.success) {
        refreshAiCredits();
        const { type, content, data } = response.data;
        if (type === 'confirm_create' && data) {
          await prepareAndShowCampaignConfirmation({ ...data, ...answers }, { sessionId: currentSessionIdRef.current, update, content });
        } else {
          update(prev => [...prev, { role: 'assistant', content, type, data }]);
          if (type === 'campaign_script' && data) setCurrentScript({ ...data, ...answers });
        }
        setPendingCampaignPrompt(null);
        setPendingCampaignData(null);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Lỗi khi tạo chiến dịch');
    } finally {
      setIsTyping(false);
      clearTabPending(mySessionId);
    }
  };

  const handleLandingDetailsSubmit = async (summaryText, answers) => {
    if (!pendingLandingPrompt) return;
    setIsTyping(true);
    const mySessionId = currentSessionId;
    const update = makeUpdater(mySessionId, [...messages]);
    if (mySessionId) markTabPending(mySessionId);
    update(prev => [...prev, { role: 'user', content: summaryText }]);

    const goalLabels = {
      lead: 'Thu thập thông tin đăng ký (lead form)',
      product: 'Giới thiệu sản phẩm / dịch vụ',
      event: 'Đăng ký sự kiện / hội thảo',
      trial: 'Dùng thử miễn phí / nhận ưu đãi',
    };
    const audienceLabels = {
      student: 'Học viên / người muốn học',
      business: 'Doanh nghiệp / B2B',
      consumer: 'Cá nhân phổ thông',
      parent_child: 'Phụ huynh & trẻ em',
    };

    if (!hasProfile) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: '⚠️ Bạn chưa có hồ sơ doanh nghiệp — AI sẽ tự suy luận nội dung từ mô tả của bạn. Để landing page chính xác hơn, hãy thiết lập hồ sơ tại Thiết lập → Hồ sơ AI.',
      }]);
    }

    const parts = [pendingLandingPrompt];
    if (answers.pageGoal) parts.push(`Mục tiêu trang: ${goalLabels[answers.pageGoal] || answers.pageGoal}`);
    if (answers.targetAudience) parts.push(`Đối tượng: ${audienceLabels[answers.targetAudience] || answers.targetAudience}`);
    if (answers.product && answers.product !== 'other' && pendingLandingData?.questions) {
      const productQ = pendingLandingData.questions.find(q => q.id === 'product');
      const productOpt = productQ?.options?.find(o => o.value === answers.product);
      if (productOpt) parts.push(`Sản phẩm: ${productOpt.label}`);
    }
    if (answers.formFields === 'extended') {
      parts.push('Form lead thu thập thêm: Nghề nghiệp và Lĩnh vực quan tâm');
    } else if (answers.formFields === 'custom' && answers.customFields) {
      parts.push(`Form lead thu thập thêm các trường: ${answers.customFields}`);
    }
    const enrichedPrompt = parts.join('. ');

    try {
      const response = await aiApi.generateLandingPage(enrichedPrompt, null, uploadedFiles, currentSessionId, summaryText);
      if (response.success) {
        refreshAiCredits();
        const { title, html, css } = response.data;
        update(prev => [...prev, {
          role: 'assistant',
          content: `Đã tạo landing page "${title}" cho bạn! Bạn có thể xem trước và lưu vào thư viện.`,
          type: 'landing_page',
          data: { title, html, css },
        }]);
      }
    } catch (err) {
      update(prev => [...prev, {
        role: 'assistant',
        content: `Có lỗi khi tạo landing page: ${err.response?.data?.message || err.message}`,
      }]);
    } finally {
      setIsTyping(false);
      clearTabPending(mySessionId);
      setPendingLandingPrompt(null);
      setPendingLandingData(null);
    }
  };

  const handleSelectCampaignType = async (campaignType) => {
    if (!pendingCampaignPrompt || !pendingCampaignData) return;
    
    setIsTyping(true);
    setMessages(prev => [...prev, {
      role: 'assistant',
      content: `Tôi đã chọn kênh ${campaignType === 'email' ? '📧 Email' : campaignType === 'zalo' ? '💬 Zalo cá nhân' : '👥 Zalo nhóm'}. Đang thiết kế chiến dịch...`,
    }]);

    try {
      // Gửi lại prompt với campaign type đã chọn
      const enrichedHistory = [
        ...messages,
        { role: 'user', content: pendingCampaignPrompt },
        { role: 'assistant', content: 'Tôi sẽ hỏi bạn chọn kênh trước.' },
        { role: 'user', content: `Tôi muốn gửi qua ${campaignType}` }
      ];
      
      const response = await aiApi.chat(enrichedHistory, [], null, locale);
      
      if (response.success) {
        refreshAiCredits();
        const { type, content, data } = response.data;
        
        // Nếu AI trả về confirm_create
        if (type === 'confirm_create' && data) {
          await prepareAndShowCampaignConfirmation({
            ...data,
            campaignType: campaignType, // Override với type user đã chọn
          }, { sessionId: currentSessionIdRef.current, update: setMessages, content: content || 'Chiến dịch đã sẵn sàng!' });
        } else {
          // AI trả lời khác, hiển thị như bình thường
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: content || 'Tôi đang xử lý yêu cầu của bạn...',
            type,
            data,
          }]);
        }

        // Clear pending state
        setPendingCampaignPrompt(null);
        setPendingCampaignData(null);
        setSelectedCampaignType(campaignType);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Lỗi khi tạo chiến dịch');
    } finally {
      setIsTyping(false);
    }
  };

  /**
   * Xử lý khi user chọn đối tượng khách hàng (all/has_email/has_zalo_phone)
   */
  const handleSelectAudience = async (audience) => {
    if (!pendingCampaignPrompt || !pendingCampaignData) return;

    setIsTyping(true);
    const audienceLabel = audience === 'all' ? 'tất cả khách hàng' : audience === 'has_email' ? 'khách hàng có email' : 'khách hàng có Zalo/phone';
    setMessages(prev => [...prev, {
      role: 'assistant',
      content: `Tôi sẽ gửi cho đối tượng ${audienceLabel}. Đang thiết kế chiến dịch hoàn chỉnh...`,
    }]);

    try {
      // Gửi lại prompt với audience đã chọn
      const enrichedHistory = [
        ...messages,
        { role: 'user', content: pendingCampaignPrompt },
        { role: 'assistant', content: 'Tôi sẽ hỏi bạn chọn kênh trước.' },
        { role: 'user', content: `Tôi muốn gửi qua ${pendingCampaignData?.campaignType || 'đa kênh'}` },
        { role: 'assistant', content: 'Bạn muốn gửi cho đối tượng nào?' },
        { role: 'user', content: `Gửi cho ${audienceLabel}` }
      ];

      const response = await aiApi.chat(enrichedHistory, [], null, locale);

      if (response.success) {
        refreshAiCredits();
        const { type, content, data } = response.data;

        // Nếu AI trả về confirm_create
        if (type === 'confirm_create' && data) {
          await prepareAndShowCampaignConfirmation({
            ...data,
            campaignType: pendingCampaignData?.campaignType,
            audience: audience,
          }, { sessionId: currentSessionIdRef.current, update: setMessages, content: content || 'Chiến dịch đã sẵn sàng!' });
        } else {
          // AI trả lời khác, hiển thị như bình thường
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: content || 'Tôi đang xử lý yêu cầu của bạn...',
            type,
            data,
          }]);
        }

        // Clear pending state
        setPendingCampaignPrompt(null);
        setPendingCampaignData(null);
        setSelectedCampaignType(pendingCampaignData?.campaignType);
        setSelectedAudience(audience);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Lỗi khi tạo chiến dịch');
    } finally {
      setIsTyping(false);
    }
  };

  /**
   * Xử lý khi user xác nhận tạo chiến dịch
   */
  const handleConfirmCreate = async () => {
    if (!currentScript) return;
    if (campaignConfirmation?.status !== 'ready' || !campaignConfirmation.confirmationView?.readyToCreate) {
      toast.error('Hãy sửa các mục trong bản xem trước trước khi tạo chiến dịch.');
      return;
    }
    await handleCreateCampaign();
  };

  /**
   * Xử lý khi user hủy tạo chiến dịch
   */
  const handleCancelCreate = () => {
    campaignConfirmationRequestRef.current += 1;
    setCurrentScript(null);
    setCampaignConfirmation(null);
    setPendingCampaignPrompt(null);
    setPendingCampaignData(null);
    setSelectedCampaignType(null);
    setSelectedAudience(null);
    setIsEditingDraft(false);
    setMessages(prev => [...prev, {
      role: 'assistant',
      content: 'Đã hủy tạo chiến dịch. Bạn cần tôi giúp gì khác không?',
    }]);
  };

  /**
   * Create campaign from AI draft (NO auto-run).
   * User will go to builder to review and run manually.
   */
  const handleCreateCampaign = async () => {
    if (!currentScript) return;
    const t = toast.loading('Đang tạo chiến dịch...');
    try {
      // Merge lựa chọn wizard (tài khoản gửi, nhóm Zalo, link Sheet) vào script
      // tại thời điểm tạo — currentScript có thể được set từ nhiều đường chưa merge
      const scriptWithSelections = applyWizardSelectionsToScript(currentScript, wizardContext);
      const res = await aiApi.createCampaignFromDraft(scriptWithSelections);
      if (res.success) {
        toast.success('Đã tạo chiến dịch từ draft AI!', { id: t });
        campaignConfirmationRequestRef.current += 1;
        setCampaignConfirmation(null);
        setCurrentScript(null);
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `🎉 Chiến dịch "${currentScript.campaignName}" đã được tạo thành công!\n\nVào Campaign Builder để xem chi tiết và nhấn "Chạy" khi sẵn sàng.`
        }]);
        // Navigate to the new campaign builder
        if (res.campaignId) {
          navigate(`/app/campaigns/${res.campaignId}/builder`);
          onToggle?.();
        }
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Không thể tạo chiến dịch.', { id: t });
    }
  };

  const _handlePushToExisting = (script) => {
    setSelectedScriptForPush(script);
    setShowCampaignPicker(true);
  };

  const handleSelectCampaign = async (campaign) => {
    if (!selectedScriptForPush) return;
    setShowCampaignPicker(false);
    const t = toast.loading('Đang đẩy kịch bản vào chiến dịch...');
    try {
      const res = await aiApi.pushToCampaign(campaign.id, selectedScriptForPush, true);
      if (res.success) {
        toast.success(`Đã đẩy kịch bản vào "${campaign.campaignName}" và kích hoạt!`, { id: t });
        setCurrentScript(null);
        setSelectedScriptForPush(null);
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `🎉 Kịch bản đã được đẩy vào chiến dịch "${campaign.campaignName}" và đang chạy! Theo dõi tại mục Quản lý chiến dịch nhé.`
        }]);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Không thể đẩy kịch bản.', { id: t });
    }
  };

  const handleGenerateNewLandingPage = () => {
    setPendingLandingPrompt(null);
    setPendingLandingData(null);
    setMessages(prev => [...prev, {
      role: 'assistant',
      content: 'Bạn muốn tạo landing page mới về chủ đề gì? Hãy mô tả ngắn gọn sản phẩm/dịch vụ, đối tượng khách hàng và phong cách thiết kế bạn muốn nhé! 🎨',
    }]);
  };

  const getLastContentPlanMessageIndex = () => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i]?.type === 'content_plan') return i;
    }
    return -1;
  };

  const shouldShowContentPlanActions = (messageIndex) => {
    if (getLastContentPlanMessageIndex() !== messageIndex) return false;
    if (!contentPlanWorkflow) return false;
    if (contentPlanWorkflow.requiresApproval === false) return false;
    if (!contentPlanWorkflow.awaitingDayConfirm) return false;
    if (contentPlanWorkflow.planApproved) return false;
    if (contentPlanWorkflow.isGeneratingAll) return false;
    if (generatingDay !== null) return false;
    return contentPlanWorkflow.status === 'waiting_day_confirm';
  };

  const isPlanApprovalMode = Boolean(
    contentPlanWorkflow
    && contentPlanWorkflow.requiresApproval !== false
    && !contentPlanWorkflow.planApproved
    && contentPlanWorkflow.status === 'waiting_day_confirm'
  );

  const openTemplatePickerForPendingDay = () => {
    const day = Number(contentPlanWorkflow?.pendingDay);
    const dayItem = contentPlanWorkflow?.plan?.days?.find((item) => Number(item.day) === day);
    if (dayItem) openTemplatePickerForDay(dayItem);
  };

  const templatePickerChannel = (() => {
    if (templatePickerContext?.mode === 'replace' && templatePickerContext.draft) {
      return templatePickerContext.draft.channel === 'email' ? 'email' : 'zalo';
    }
    const dayItem = templatePickerContext?.dayItem;
    if (!dayItem) return 'zalo';
    const channel = normalizeChannel(dayItem.channel || dayItem.slots?.[0]?.channel);
    return channel === 'email' ? 'email' : 'zalo';
  })();

  const templatePickerSlotLabel = (() => {
    if (templatePickerContext?.mode === 'replace' && templatePickerContext.draft) {
      const day = templatePickerContext.draft._planDay;
      const slot = templatePickerContext.draft._planSlotIndex;
      if (!day) return '';
      return t('aiChatbot.pickTemplateForDaySlot', {
        day,
        slot: slot || 1,
      }) || `Ngày ${day} • tin #${slot || 1}`;
    }
    const slot = templatePickerContext?.slots?.[0];
    const day = templatePickerContext?.dayItem?.day;
    if (!slot || !day) return '';
    return t('aiChatbot.pickTemplateForDaySlot', {
      day,
      slot: slot.slotOrder,
    }) || `Ngày ${day} • tin #${slot.slotOrder}`;
  })();

  const isFullscreen = variant === 'fullscreen';
  const showHomeHero = isFullscreen
    && messages.length <= 1
    && !isTyping
    && !currentSessionId;

  const renderInputSection = ({ centered = false } = {}) => (
    <div className={centered ? 'w-full' : `flex-shrink-0 ${isFullscreen ? 'px-4 pb-6 bg-gray-50' : 'px-4 pt-3 pb-4 border-t border-slate-100 bg-white'}`}>
      <div className={isFullscreen ? 'max-w-3xl mx-auto w-full' : 'w-full'}>
        {isFullscreen && <CreditWarningBanner placement="composer" />}
        <div className={`rounded-2xl border transition-all outline-none shadow-sm ${centered ? 'bg-white border-slate-200' : ''} ${isDragging ? 'border-orange-300 bg-orange-50/40' : centered ? '' : 'border-slate-200 bg-slate-50 focus-within:bg-white'}`}>
          {uploadedFiles.length > 0 && (
            <div className="flex flex-wrap gap-1.5 px-3 pt-3">
              {uploadedFiles.map(f => {
                const { bg, text } = fileChipMeta(f);
                return (
                  <div key={f.tempId} className={`flex items-center gap-1.5 ${bg} border rounded-xl overflow-hidden pr-1.5 py-1`}>
                    {f.previewUrl
                      ? <img src={f.previewUrl} alt="" className="w-7 h-7 object-cover rounded-lg shrink-0 ml-1" />
                      : <span className={`ml-2 text-[10px] font-bold uppercase ${text}`}>{fileChipMeta(f).label}</span>
                    }
                    <span className="truncate max-w-[100px] text-xs font-medium text-slate-700 ml-1">{f.originalName}</span>
                    <button onClick={() => setUploadedFiles(p => p.filter(x => x.tempId !== f.tempId))}
                      className="p-0.5 ml-0.5 text-slate-400 hover:text-red-500 transition-colors shrink-0">
                      <HiOutlineX className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          <textarea
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); handleSend(); } }}
            placeholder={aiBillingBlock
              ? t('aiChatbot.inputBlockedPlaceholder')
              : (isDragging ? t('aiChatbot.dropFilePlaceholder') : (centered ? t('aiChatbot.homeAskAnything') : t('aiChatbot.inputPlaceholder')))}
            rows={centered ? 1 : 2}
            disabled={Boolean(aiBillingBlock)}
            className={`w-full bg-transparent outline-none focus:outline-none focus:ring-0 resize-none text-slate-800 placeholder-slate-400 disabled:opacity-60 ${centered ? 'px-5 py-4 text-base' : 'px-3.5 pt-3 pb-1 text-sm'}`}
            style={{ WebkitAppearance: 'none', boxShadow: 'none' }}
          />
          <div className={`flex items-center justify-between ${centered ? 'px-3 pb-3' : 'px-2 pb-2'}`}>
            <button onClick={() => fileInputRef.current?.click()} disabled={isUploading}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-slate-400 hover:text-orange-500 hover:bg-orange-50 rounded-xl transition-all disabled:opacity-50">
              {isUploading
                ? <div className="w-3.5 h-3.5 border-2 border-orange-500/30 border-t-orange-500 rounded-full animate-spin" />
                : <HiOutlinePaperClip className="w-3.5 h-3.5" />}
              {!centered && <span>{t('aiChatbot.attach')}</span>}
            </button>
            <div className="flex items-center gap-2">
              {!centered && <span className="text-[10px] text-slate-300">{t('aiChatbot.enterToSend')}</span>}
              <button onClick={handleSend} disabled={Boolean(aiBillingBlock) || (!inputText.trim() && !uploadedFiles.length)}
                className={`flex items-center justify-center bg-slate-800 text-white rounded-xl hover:bg-orange-500 disabled:bg-slate-200 disabled:text-slate-400 transition-all ${centered ? 'w-9 h-9' : 'w-8 h-8'}`}>
                <HiOutlineChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
        {!centered && <p className="mt-2 text-[10px] text-center text-slate-400">{t('aiChatbot.poweredBy')}</p>}
      </div>
    </div>
  );

  const latestConfirmationIndex = messages.reduce(
    (latest, message, index) => (message.type === 'confirm_create' ? index : latest),
    -1,
  );

  return (
    <div
      className={
        isFullscreen
          ? 'relative w-full h-full min-h-0 bg-gray-50 flex flex-col overflow-hidden'
          : `fixed top-0 right-0 h-full bg-white border-l border-slate-200 shadow-2xl z-40 flex flex-col overflow-hidden ${isOpen ? 'translate-x-0' : 'translate-x-full pointer-events-none'}`
      }
      style={
        isFullscreen
          ? undefined
          : {
            width: isMobile ? '100%' : `${panelWidth}px`,
            transition: isResizingPanel ? 'none' : 'transform 0.3s ease-in-out',
          }
      }
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag handle — chỉ trên desktop panel */}
      {!isFullscreen && !isMobile && isOpen && (
        <div
          className={`absolute left-0 top-0 h-full w-1.5 cursor-col-resize z-50 transition-colors ${isResizingPanel ? 'bg-orange-300' : 'hover:bg-orange-200'}`}
          onMouseDown={handlePanelResizeStart}
        />
      )}
      {isDragging && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-orange-50/90 border-2 border-dashed border-orange-400 rounded pointer-events-none">
          <HiOutlinePaperClip className="w-10 h-10 text-orange-400" />
          <p className="text-sm font-semibold text-orange-600">{t('aiChatbot.dropFileToUpload')}</p>
          <p className="text-xs text-orange-400">{t('aiChatbot.supportedFormats')}</p>
        </div>
      )}
      {/* Header */}
      <div className={`flex-shrink-0 border-b border-slate-100 flex items-center justify-between ${isFullscreen ? 'h-14 px-4 bg-white/80 backdrop-blur-sm' : 'h-16 px-5'}`}>
        <div className="flex items-center gap-3">
          <div className={`${isFullscreen ? 'w-7 h-7 rounded-lg' : 'w-8 h-8 rounded-lg'} bg-orange-500 flex items-center justify-center shadow-lg shadow-orange-500/20`}>
            <HiOutlineSparkles className={`${isFullscreen ? 'w-4 h-4' : 'w-5 h-5'} text-white`} />
          </div>
          <div>
            <h3 className={`font-bold text-slate-800 ${isFullscreen ? 'text-base' : 'text-sm'}`}>{t('aiChatbot.title')}</h3>
            {!isFullscreen && (
              <div className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full" />
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{t('aiChatbot.ready')}</span>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isFullscreen && (
            <button onClick={onToggle} className="p-2 hover:bg-slate-50 rounded-xl text-slate-400 hover:text-slate-600">
              <HiOutlineArrowRight className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Session tabs — session list scrolls, New stays pinned */}
      <div className="flex-shrink-0 flex items-center gap-2 px-3 py-2 border-b border-slate-100">
        <div
          ref={tabsScrollRef}
          className="min-w-0 flex-1 flex items-center gap-1 overflow-x-auto select-none"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', cursor: 'grab' }}
          onMouseDown={(e) => {
            tabsDragRef.current = { dragging: true, startX: e.clientX, scrollLeft: tabsScrollRef.current.scrollLeft, moved: false };
            tabsScrollRef.current.style.cursor = 'grabbing';
          }}
          onMouseMove={(e) => {
            if (!tabsDragRef.current.dragging) return;
            const dx = e.clientX - tabsDragRef.current.startX;
            if (Math.abs(dx) > 4) tabsDragRef.current.moved = true;
            tabsScrollRef.current.scrollLeft = tabsDragRef.current.scrollLeft - dx;
          }}
          onMouseUp={() => { tabsDragRef.current.dragging = false; if (tabsScrollRef.current) tabsScrollRef.current.style.cursor = 'grab'; }}
          onMouseLeave={() => { tabsDragRef.current.dragging = false; if (tabsScrollRef.current) tabsScrollRef.current.style.cursor = 'grab'; }}
        >
          {sessions.map(session => (
            <div
              key={session.id}
              title={session.title}
              className={`shrink-0 group flex items-center gap-1 pl-3 pr-1.5 py-1 rounded-full text-[11px] font-semibold transition-all min-w-[60px] max-w-[130px] ${
                currentSessionId === session.id
                  ? 'bg-orange-500 text-white shadow-sm shadow-orange-500/30'
                  : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
              }`}
            >
              {pendingTabIds.has(session.id) && currentSessionId !== session.id && (
                <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse mr-0.5" title="Đang xử lý ngầm..." />
              )}
              <span
                className="truncate flex-1 cursor-pointer"
                onMouseDown={(e) => e.stopPropagation()}
                onMouseUp={() => { if (!tabsDragRef.current.moved) loadSession(session.id); }}
              >
                {session.title}
              </span>
              <span
                onMouseDown={(e) => e.stopPropagation()}
                onMouseUp={(e) => { if (!tabsDragRef.current.moved) requestDeleteSession(session.id, e); }}
                className={`shrink-0 p-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer ${
                  currentSessionId === session.id ? 'hover:bg-orange-400' : 'hover:bg-slate-200'
                }`}
              >
                <HiOutlineX className="w-3 h-3" />
              </span>
            </div>
          ))}
        </div>
        <button
          onMouseUp={() => { if (!tabsDragRef.current.moved) startNewChat(); }}
          onMouseDown={(e) => {
            e.stopPropagation();
            tabsDragRef.current = { ...tabsDragRef.current, dragging: false, moved: false };
          }}
          title={t('aiChatbot.newConversation')}
          className={`shrink-0 flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-semibold transition-all ${
            !currentSessionId
              ? 'bg-orange-50 text-orange-500 border border-orange-200'
              : 'text-slate-400 hover:bg-slate-100 hover:text-orange-500'
          }`}
        >
          <HiOutlinePlus className="w-3 h-3 shrink-0" />
          {t('aiChatbot.newChat')}
        </button>
      </div>

      {/* Gói hết hạn / hết credit AI — ở fullscreen đã có banner ngay trên khung nhập */}
      {!isSuperAdmin && !isFullscreen && aiBillingBlock && (
        <div className="flex-shrink-0 mx-4 mt-3 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5">
          <HiOutlineExclamation className="w-4 h-4 shrink-0 text-red-500 mt-0.5" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-red-800 leading-snug">
              {aiBillingBlock.type === 'expired'
                ? t('aiChatbot.planExpiredBanner')
                : t('aiChatbot.creditsEmptyBanner')}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-3">
              {aiBillingBlock.type !== 'expired' && !isEmployeeCtx && (
                <button
                  type="button"
                  onClick={() => navigate('/app/topup')}
                  className="text-xs font-semibold text-red-700 underline hover:text-red-900"
                >
                  {t('creditBanner.buyTopup')}
                </button>
              )}
              <button
                type="button"
                onClick={() => navigate('/pricing')}
                className="text-xs font-semibold text-red-700 underline hover:text-red-900"
              >
                {t('aiChatbot.upgradePlan')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Banner hồ sơ doanh nghiệp — chỉ hiện cho user_admin */}
      {!isSuperAdmin && !showHomeHero && (
        <div className={`flex-shrink-0 mx-4 mt-3 flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 ${hasProfile ? 'bg-slate-50 border border-slate-200' : 'bg-orange-50 border border-orange-200'}`}>
          <HiOutlineSparkles className={`w-3.5 h-3.5 shrink-0 ${hasProfile ? 'text-slate-400' : 'text-orange-500'}`} />
          <p className={`flex-1 text-xs ${hasProfile ? 'text-slate-500' : 'text-orange-700 font-medium'}`}>
            {hasProfile ? t('aiChatbot.usingBusinessProfile') : t('aiChatbot.noProfile')}
          </p>
          <Link
            to="/app/settings/ai-profile"
            onClick={() => { if (!isFullscreen) onToggle?.(); }}
            className={`shrink-0 text-xs font-semibold whitespace-nowrap ${hasProfile ? 'text-slate-500 hover:text-orange-500' : 'text-orange-600 hover:text-orange-700'}`}
          >
            {hasProfile ? t('aiChatbot.view') : t('aiChatbot.setup')}
          </Link>
        </div>
      )}

      {/* Quick Actions — chỉ hiện ở panel mode */}
      {!isFullscreen && !isSuperAdmin && (
        <div className="flex-shrink-0 mx-4 mt-3">
          <button
            onClick={() => setQuickActionsOpen(o => !o)}
            className="flex items-center justify-between w-full group"
          >
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider group-hover:text-slate-500 transition-colors">{t('aiChatbot.quickActions')}</p>
            <HiOutlineChevronDown className={`w-3.5 h-3.5 text-slate-400 group-hover:text-slate-500 transition-all duration-200 ${quickActionsOpen ? 'rotate-180' : ''}`} />
          </button>
          {quickActionsOpen && (
            <div className="grid grid-cols-3 gap-1.5 mt-1.5">
              <button
                onClick={() => setInputText('Lập kịch bản chiến dịch marketing cho [tên sản phẩm/dịch vụ], gửi qua Email và Zalo')}
                className="flex flex-col items-center gap-1 p-2.5 bg-green-50 hover:bg-green-100 rounded-xl text-green-700 transition-all"
              >
                <HiOutlineClipboardList className="w-4 h-4 shrink-0" />
                <span className="text-[10px] font-semibold leading-tight text-center">{t('aiChatbot.scriptCampaign')}</span>
              </button>
              <button
                onClick={() => setInputText('Viết template email chào mừng khách hàng mới')}
                className="flex flex-col items-center gap-1 p-2.5 bg-orange-50 hover:bg-orange-100 rounded-xl text-orange-700 transition-all"
              >
                <HiOutlineMail className="w-4 h-4 shrink-0" />
                <span className="text-[10px] font-semibold leading-tight text-center">{t('aiChatbot.emailTemplate')}</span>
              </button>
              <button
                onClick={() => setInputText('Viết template tin nhắn Zalo chăm sóc khách hàng sau mua hàng')}
                className="flex flex-col items-center gap-1 p-2.5 bg-blue-50 hover:bg-blue-100 rounded-xl text-blue-700 transition-all"
              >
                <HiOutlineChat className="w-4 h-4 shrink-0" />
                <span className="text-[10px] font-semibold leading-tight text-center">{t('aiChatbot.zaloTemplate')}</span>
              </button>
              <button
                onClick={() => { onToggle?.(); navigate('/app/settings/channels'); }}
                className="flex flex-col items-center gap-1 p-2.5 bg-cyan-50 hover:bg-cyan-100 rounded-xl text-cyan-700 transition-all"
              >
                <HiOutlineLink className="w-4 h-4 shrink-0" />
                <span className="text-[10px] font-semibold leading-tight text-center">{t('aiChatbot.connectZalo')}</span>
              </button>
              <button
                onClick={() => { onToggle?.(); navigate('/app/settings/channels'); }}
                className="flex flex-col items-center gap-1 p-2.5 bg-purple-50 hover:bg-purple-100 rounded-xl text-purple-700 transition-all"
              >
                <HiOutlineClock className="w-4 h-4 shrink-0" />
                <span className="text-[10px] font-semibold leading-tight text-center">{t('aiChatbot.zaloTimeSlot')}</span>
              </button>
              <button
                onClick={() => {
                  setInputText('Tạo landing page thu thập lead cho sản phẩm [tên sản phẩm]');
                  setPendingLandingPrompt('Tạo landing page thu thập lead cho sản phẩm [tên sản phẩm]');
                }}
                className="flex flex-col items-center gap-1 p-2.5 bg-slate-100 hover:bg-slate-200 rounded-xl text-slate-600 transition-all"
              >
                <HiOutlineGlobeAlt className="w-4 h-4 shrink-0" />
                <span className="text-[10px] font-semibold leading-tight text-center">Landing Page</span>
              </button>
            </div>
          )}
        </div>
      )}

      {showHomeHero ? (
        <div className="flex-1 flex flex-col items-center justify-center px-4 pb-10">
          <h1 className="text-3xl sm:text-4xl font-semibold text-slate-800 mb-8 text-center tracking-tight">
            {t('aiChatbot.homeHeadline')}
          </h1>
          <div className="w-full max-w-3xl">
            {renderInputSection({ centered: true })}
          </div>
          {!isSuperAdmin && (
            <div className="mt-5 flex flex-wrap justify-center gap-2 max-w-3xl w-full">
              <button
                type="button"
                onClick={() => setInputText('Lập kịch bản chiến dịch marketing cho [tên sản phẩm/dịch vụ], gửi qua Email và Zalo')}
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-colors"
              >
                {t('aiChatbot.homeSuggestionCampaign')}
              </button>
              <button
                type="button"
                onClick={() => setInputText('Viết template email chào mừng khách hàng mới')}
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-colors"
              >
                {t('aiChatbot.homeSuggestionEmail')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setInputText('Tạo landing page thu thập lead cho sản phẩm [tên sản phẩm]');
                  setPendingLandingPrompt('Tạo landing page thu thập lead cho sản phẩm [tên sản phẩm]');
                }}
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-colors"
              >
                {t('aiChatbot.homeSuggestionLanding')}
              </button>
            </div>
          )}
        </div>
      ) : (
        <>
      {/* Messages */}
      <div className={`flex-1 overflow-y-auto space-y-5 chat-messages-scroll ${isFullscreen ? 'px-4 py-6' : 'p-5'}`}>
        <div className={isFullscreen ? 'max-w-3xl mx-auto w-full space-y-5' : 'space-y-5'}>
        {messages.map((msg, idx) => {
          if (isSilentWizardUserMessage(msg)) return null;
          const userDisplayText = msg.role === 'user'
            ? formatUserMessageForDisplay(msg.content, t, locale)
            : msg.content;
          if (msg.role === 'user' && !String(userDisplayText || '').trim()) return null;
          return (
          <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[92%] min-w-0 break-words ${msg.role === 'user' ? 'bg-slate-100 rounded-2xl px-4 py-3' : ''}`}>
              {msg.role === 'assistant' && (
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="w-5 h-5 bg-orange-100 rounded-md flex items-center justify-center">
                    <HiOutlineSparkles className="w-3 h-3 text-orange-500" />
                  </div>
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">AI</span>
                </div>
              )}
              <AiContent text={userDisplayText} />

              {/* Files */}
              {msg.files?.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {msg.files.map((f, i) => {
                    const { bg, text } = fileChipMeta(f);
                    const dl = fileDownloadHref(f);
                    const cls = `flex items-center gap-1.5 ${bg} border rounded-xl overflow-hidden pr-2 py-1`;
                    const inner = (
                      <>
                        {(f.previewUrl || (f.url && String(f.contentType || f.type || '').includes('image')))
                          ? <img src={f.previewUrl || f.url} alt="" className="w-7 h-7 object-cover rounded-lg shrink-0 ml-1" />
                          : <span className={`ml-2 text-[10px] font-bold uppercase ${text}`}>{fileChipMeta(f).label}</span>
                        }
                        <span className="truncate max-w-[100px] text-[11px] font-medium text-slate-700 ml-0.5">{f.displayName || f.originalName}</span>
                      </>
                    );
                    if (dl) {
                      return (
                        <a
                          key={i}
                          href={dl}
                          download={f.displayName || f.originalName}
                          title="Tải xuống"
                          className={`${cls} cursor-pointer hover:brightness-95 transition`}
                        >
                          {inner}
                        </a>
                      );
                    }
                    if (f.localFile instanceof File) {
                      // Tin vừa gửi: tải ngay từ File trong bộ nhớ, không cần F5.
                      return (
                        <button
                          key={i}
                          type="button"
                          onClick={() => downloadLocalFile(f.localFile, f.displayName || f.originalName)}
                          title="Tải xuống"
                          className={`${cls} cursor-pointer hover:brightness-95 transition text-left`}
                        >
                          {inner}
                        </button>
                      );
                    }
                    return <div key={i} className={cls}>{inner}</div>;
                  })}
                </div>
              )}

              {/* Ask more */}
              {msg.type === 'ask_more' && msg.missing_fields?.length > 0 && (
                <AskMoreCard missingFields={msg.missing_fields} t={t} />
              )}

              {/* Ask campaign type - hỏi user chọn kênh */}
              {msg.type === 'ask_campaign_details' && msg.data && (
                <AskCampaignDetailsCard
                  data={msg.data}
                  onSubmit={handleCampaignDetailsSubmit}
                  t={t}
                />
              )}

              {msg.type === 'ask_sender_account' && msg.data && (
                <AskSenderAccountCard
                  data={msg.data}
                  onSelect={(account) => handleWizardSenderSelect(account, msg.data.channel)}
                  onOther={() => handleWizardSenderOther(msg.data.channel)}
                  t={t}
                />
              )}

              {msg.type === 'email_setup_guide' && msg.data && (
                <EmailSetupGuideCard
                  data={msg.data}
                  onSelectAccount={(account) => handleWizardSenderSelect(account, 'email')}
                  onAccountsFound={(accounts) => {
                    setMessages((prev) => [...prev, {
                      role: 'assistant',
                      content: t('aiChatbot.wizardChooseEmailSender') || 'Bạn chọn email sender sẽ dùng cho chiến dịch nhé.',
                      type: 'ask_sender_account',
                      data: { channel: 'email', accounts, allowOther: true, noUsableAccount: false },
                    }]);
                  }}
                  t={t}
                />
              )}

              {msg.type === 'zalo_qr_login' && (
                <ZaloQrLoginCard
                  channel={msg.data?.channel || wizardContext.channel || 'zalo'}
                  onConnected={(account, channel) => handleWizardSenderSelect(account, channel, { viaQr: true })}
                  onBackToAccounts={handleWizardZaloBackToAccounts}
                  t={t}
                />
              )}

              {msg.type === 'zalo_group_picker' && msg.data && (
                <ZaloGroupPickerCard
                  data={msg.data}
                  onSubmit={handleWizardGroupsSubmit}
                  t={t}
                />
              )}

              {msg.type === 'ask_landing_details' && msg.data && (
                <AskLandingDetailsCard
                  data={msg.data}
                  onSubmit={handleLandingDetailsSubmit}
                  t={t}
                />
              )}

              {msg.type === 'ask_campaign_type' && msg.data && (
                <AskCampaignTypeCard
                  data={msg.data}
                  onSelect={handleSelectCampaignType}
                  t={t}
                />
              )}

              {/* Ask audience - hỏi user chọn đối tượng khách hàng */}
              {msg.type === 'ask_audience' && msg.data && (
                <AskAudienceCard
                  data={msg.data}
                  onSelect={handleSelectAudience}
                  t={t}
                />
              )}

              {/* Confirm create - xác nhận trước khi tạo */}
              {msg.type === 'confirm_create' && msg.data && !(isEditingDraft && idx === latestConfirmationIndex) && (
                <ConfirmCreateCard
                  confirmationView={idx === latestConfirmationIndex ? campaignConfirmation?.confirmationView : null}
                  isPreparing={idx === latestConfirmationIndex && campaignConfirmation?.status === 'loading'}
                  prepareError={idx === latestConfirmationIndex && campaignConfirmation?.status === 'error' ? campaignConfirmation.error : null}
                  isActive={idx === latestConfirmationIndex && Boolean(currentScript)}
                  onConfirm={handleConfirmCreate}
                  onEdit={() => setIsEditingDraft(true)}
                  onCancel={handleCancelCreate}
                  onRetry={() => prepareAndShowCampaignConfirmation(currentScript, { sessionId: currentSessionIdRef.current, appendMessage: false })}
                  t={t}
                  locale={locale}
                />
              )}
              
              {/* Campaign Draft Editor - Chỉnh sửa trong chatbot */}
              {msg.type === 'confirm_create' && msg.data && isEditingDraft && idx === latestConfirmationIndex && (
                <CampaignDraftEditor
                  script={currentScript || msg.data}
                  onSave={async (editedScript) => {
                    const nextScript = { ...(currentScript || msg.data), ...editedScript };
                    await prepareAndShowCampaignConfirmation(nextScript, { sessionId: currentSessionIdRef.current, appendMessage: false });
                    setIsEditingDraft(false);
                    toast.success('Đã cập nhật draft!');
                  }}
                  onCancel={() => setIsEditingDraft(false)}
                  t={t}
                />
              )}

              {/* Content plan overview */}
              {msg.type === 'content_plan' && msg.data && (
                <>
                  <ContentPlanCard
                    data={msg.data}
                    workflow={contentPlanWorkflow}
                    approvalMode={isPlanApprovalMode}
                    t={t}
                  />
                  {shouldShowContentPlanActions(idx) && (
                    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                      <p className="mb-3 text-xs leading-relaxed text-slate-600">
                        {t('aiChatbot.planApprovalHint')}
                      </p>
                      <ContentPlanActionsCard
                        data={{ firstDay: msg.data?.days?.[0]?.day || contentPlanWorkflow?.pendingDay }}
                        workflow={contentPlanWorkflow}
                        approvalMode={isPlanApprovalMode}
                        onApprove={handleApproveContentPlan}
                        onRevise={handleReviseContentPlan}
                        onGenerateAll={handleGenerateAllPlanTemplates}
                        onUseExisting={openTemplatePickerForPendingDay}
                        t={t}
                      />
                    </div>
                  )}
                </>
              )}

              {msg.type === 'suggest_content_plan' && msg.data?.userPrompt && (
                <div className="mt-3 rounded-xl border border-orange-200 bg-orange-50 px-3 py-3">
                  <p className="mb-2 text-xs leading-relaxed text-orange-800">
                    {t('aiChatbot.suggestContentPlanHint')}
                  </p>
                  <button
                    type="button"
                    onClick={() => requestContentPlan(msg.data.userPrompt)}
                    disabled={isTyping}
                    className="rounded-xl bg-orange-500 px-3 py-2 text-xs font-black text-white transition-all hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {t('aiChatbot.suggestContentPlanButton')}
                  </button>
                </div>
              )}

              {msg.type === 'content_plan_actions' && !shouldShowContentPlanActions(getLastContentPlanMessageIndex()) && (
                <ContentPlanActionsCard
                  data={msg.data}
                  workflow={contentPlanWorkflow}
                  onApprove={handleApproveContentPlan}
                  onRevise={handleReviseContentPlan}
                  onGenerateAll={handleGenerateAllPlanTemplates}
                  onUseExisting={openTemplatePickerForPendingDay}
                  t={t}
                />
              )}

              {msg.type === 'confirm_next_day' && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const day = Number(msg.data?.day || contentPlanWorkflow?.pendingDay);
                      if (!day) return;
                      const dayItem = contentPlanWorkflow?.plan?.days?.find((d) => d.day === day);
                      if (dayItem) handleGenerateDayTemplate(dayItem);
                    }}
                    disabled={generatingDay !== null}
                    className="rounded-xl bg-orange-500 px-3 py-2 text-xs font-black text-white transition-all hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {msg.data?.retry ? `Thử lại Ngày ${msg.data?.day}` : `Tạo template Ngày ${msg.data?.day}`}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const day = Number(msg.data?.day || contentPlanWorkflow?.pendingDay);
                      if (!day) return;
                      const dayItem = contentPlanWorkflow?.plan?.days?.find((d) => d.day === day);
                      if (dayItem) openTemplatePickerForDay(dayItem);
                    }}
                    disabled={generatingDay !== null}
                    className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-black text-slate-700 transition-all hover:border-orange-300 hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {t('aiChatbot.useExistingTemplate') || 'Dùng mẫu có sẵn'}
                  </button>
                </div>
              )}

              {msg.type === 'confirm_plan_campaign' && (
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={createCampaignDraftFromPlan}
                    disabled={Boolean(contentPlanWorkflow?.isCreatingCampaign)}
                    className="rounded-xl bg-emerald-500 px-3 py-2 text-xs font-black text-white transition-all hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {contentPlanWorkflow?.isCreatingCampaign ? 'Đang tạo campaign draft...' : 'Tạo chiến dịch draft'}
                  </button>
                </div>
              )}

              {/* Save all plan templates */}
              {msg.type === 'save_all_templates' && (
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={handleSaveAllPlanTemplates}
                    disabled={isSavingAllTemplates || !getUnsavedPlanDrafts().length}
                    className={`rounded-xl px-3 py-2 text-xs font-black transition-all disabled:cursor-not-allowed ${
                      !isSavingAllTemplates && !getUnsavedPlanDrafts().length
                        ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                        : 'bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-60'
                    }`}
                  >
                    {isSavingAllTemplates
                      ? (t('aiChatbot.planSavingAllTemplates') || 'Đang lưu tất cả...')
                      : (getUnsavedPlanDrafts().length
                        ? (t('aiChatbot.planSaveAllTemplates') || 'Lưu tất cả template vào thư viện')
                        : (t('aiChatbot.planAllTemplatesSaved') || 'Đã lưu tất cả template'))}
                  </button>
                </div>
              )}

              {/* Template draft */}
              {msg.type === 'template_draft' && msg.data && (
                <TemplateDraftCard
                  draft={msg.data}
                  onSave={(savedTemplate) => handlePlanTemplateSaved(msg.data, savedTemplate)}
                  onEdit={handleEditTemplate}
                  onUseExisting={msg.data?._planTemplate ? openTemplatePickerForDraft : undefined}
                  autoSaveCategory={msg.data?._planTemplate && !msg.data?._fromLibrary ? 'AI Generated' : null}
                  fromLibrary={Boolean(msg.data?._fromLibrary)}
                  externallySaved={Boolean(msg.data?._planSlotKey)
                    && (contentPlanWorkflow?.savedTemplates || []).some((item) => String(item.slotId) === String(msg.data._planSlotKey))}
                  t={t}
                />
              )}

              {/* Landing page */}
              {msg.type === 'landing_page' && msg.data && (
                <LandingPageCard
                  page={msg.data}
                  onSaveToLibrary={handleSaveLandingPage}
                  onGenerateNew={handleGenerateNewLandingPage}
                />
              )}

              {/* Auto creating campaign */}
              {msg.type === 'auto_creating' && (
                <AutoCreatingCard
                  campaignName={msg.data?.campaignName}
                  onView={autoCreatedCampaign ? () => navigate(`/app/campaigns/${autoCreatedCampaign.campaignId}/builder`) : null}
                  t={t}
                />
              )}

              {/* Auto created success */}
              {msg.type === 'auto_created_success' && msg.data && (
                <AutoCreatedSuccessCard
                  result={msg.data}
                  onView={() => navigate(`/app/campaigns/${msg.data.campaignId}/builder`)}
                  t={t}
                />
              )}
            </div>
          </div>
          );
        })}

        {isTyping && (
          <div className="flex justify-start">
            <div className="flex gap-1.5 px-4 py-3 bg-slate-50 rounded-2xl">
              <span className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce" />
              <span className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce [animation-delay:0.2s]" />
              <span className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce [animation-delay:0.4s]" />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
        </div>
      </div>

      {renderInputSection()}
        </>
      )}

      <input type="file" ref={fileInputRef} onChange={handleFileUpload} multiple className="hidden"
        accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp,.xlsx,.xls,.csv" />

      {/* Campaign Picker Modal */}
      <CampaignPickerModal
        isOpen={showCampaignPicker}
        onClose={() => {
          setShowCampaignPicker(false);
          setSelectedScriptForPush(null);
        }}
        onSelect={handleSelectCampaign}
        t={t}
      />

      <TemplatePickerModal
        isOpen={Boolean(templatePickerContext)}
        onClose={handleTemplatePickerClose}
        onSelect={handleTemplatePickerSelect}
        channel={templatePickerChannel}
        slotLabel={templatePickerSlotLabel}
        t={t}
      />

      <ConfirmModal
        isOpen={sessionToDelete !== null}
        title={t('aiChatbot.confirmDeleteSessionTitle')}
        message={t('aiChatbot.confirmDeleteSessionMessage')}
        onConfirm={confirmDeleteSession}
        onCancel={() => setSessionToDelete(null)}
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
        danger
      />

    </div>
  );
};

export default AiChatbot;
