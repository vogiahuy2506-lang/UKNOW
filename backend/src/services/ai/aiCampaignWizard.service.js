import { MAX_AI_MANUAL_RECIPIENTS } from '../../utils/manualRecipients.util.js';
import {
  createEmptyCampaignBrief,
  isCampaignBriefReady,
  mergeCampaignBrief,
} from './campaignBrief.service.js';
import {
  isQuickSendRequest,
  inferQuickSendChannel,
  isMultiDaySeriesRequestLocal,
  pickChannelByExplicitSignal,
} from '../../utils/campaignQuickSend.util.js';

export {
  createEmptyCampaignBrief,
  isCampaignBriefReady,
  mergeCampaignBrief,
  extractCampaignBriefFromHistory,
  clearCampaignBriefProductFacts,
} from './campaignBrief.service.js';

const WIZARD_MARKER_RE = /^\[wizard\](\{.*\})/;

export const GOOGLE_SHEET_URL_RE = /https?:\/\/docs\.google\.com\/spreadsheets\/\S+/i;

const CAMPAIGN_RESPONSE_TYPES = new Set([
  'ask_campaign_details',
  'ask_campaign_type',
  'ask_audience',
  'content_plan',
  'confirm_create',
  'create_and_run',
]);

export const normalizeChannel = (value = '') => {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return null;
  if (raw === 'zalo_personal') return 'zalo';
  if (raw === 'zalo_group') return 'zalo_group';
  if (raw.includes('nhóm') || raw.includes('nhom') || raw.includes('group')) return 'zalo_group';
  if (raw.includes('zalo')) return 'zalo';
  if (raw.includes('email') || raw.includes('mail')) return 'email';
  return ['email', 'zalo'].includes(raw) ? raw : null;
};

export const isUsableZaloAccount = (account) => (
  account?.status === 'connected' && account?.isActive !== false && account?.is_active !== false
);

const isZaloChannel = (channel) => channel === 'zalo' || channel === 'zalo_group';

const isValidDripSchedule = (schedule) => {
  if (!schedule || schedule.mode !== 'drip') return true;
  const days = Number(schedule.days);
  const slotsPerDay = Number(schedule.slotsPerDay);
  return Number.isFinite(days) && days >= 1 && days <= 30
    && Number.isFinite(slotsPerDay) && slotsPerDay >= 1 && slotsPerDay <= 5;
};

const isValidWizardSchedule = (schedule) => (
  Boolean(schedule)
  && schedule.mode !== 'recurring'
  && isValidDripSchedule(schedule)
);

const countUsableZaloAccounts = (accounts = []) => (
  (Array.isArray(accounts) ? accounts : []).filter(isUsableZaloAccount).length
);

export function parseWizardMarker(content = '') {
  const firstLine = String(content || '').split('\n')[0]?.trim();
  const match = firstLine?.match(WIZARD_MARKER_RE);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1]);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

const inferChannelFromText = (text = '') => {
  const normalized = String(text || '').toLowerCase();
  if (/zalo\s*group|zalo\s*nh[oó]m|nh[oó]m\s*zalo|gửi\s*nh[oó]m|gui\s*nhom/.test(normalized)) {
    return 'zalo_group';
  }
  return pickChannelByExplicitSignal(normalized, /\bemail\b|gửi mail|gui mail|thư điện tử|thu dien tu/);
};

const inferDataSourceFromText = (text = '') => {
  const normalized = String(text || '').toLowerCase();
  if (/google\s*sheet|spreadsheet|docs\.google\.com\/spreadsheets|excel|xlsx|xls|csv|file|t[eệ]p|tập tin/.test(normalized)) {
    return 'sheet';
  }
  if (/landing page|landing|lead/.test(normalized)) return 'landing';
  if (/danh sách khách hàng|danh sach khach hang|khách hàng trong hệ thống|khach hang trong he thong|khách hàng có sẵn|khach hang co san|database|db|crm/.test(normalized)) {
    return 'db';
  }
  return null;
};

const inferScheduleFromText = (text = '') => {
  const normalized = String(text || '').toLowerCase();
  const recurring = normalized.match(/(?:mỗi|moi|every|cách|cach)\s+(\d+)\s*(?:ngày|ngay|day|days)/);
  if (recurring) return { mode: 'recurring', days: Number(recurring[1]) };

  // Check slots per day: e.g. "mỗi ngày 2 tin", "2 tin mỗi ngày", "2 tin/ngày", "2 slots/day", "2 messages per day"
  const slotsMatch = normalized.match(/(?:mỗi|moi|every)\s*ngày\s*(\d+)\s*(?:tin|email|message|slot)s?/i)
    || normalized.match(/(\d+)\s*(?:tin|email|message|slot)s?\s*(?:mỗi|moi|every)\s*ngày/i)
    || normalized.match(/(\d+)\s*(?:tin|email|message|slot)s?\s*(?:\/|per)\s*(?:ngày|ngay|day)/i);
  const slotsPerDay = slotsMatch ? Number(slotsMatch[1]) : undefined;

  // Extract explicit days count if present: e.g. "4 ngày", "trong 3 ngày"
  const daysMatch = normalized.match(/(?:trong|for|chuỗi|chuoi)?\s*(\d+)\s*(?:ngày|ngay|day|days)/i);
  const days = daysMatch ? Number(daysMatch[1]) : undefined;

  if (Number.isFinite(slotsPerDay) && slotsPerDay > 0) {
    return {
      mode: 'drip',
      ...(Number.isFinite(days) && days > 0 ? { days } : {}),
      slotsPerDay,
    };
  }

  const daysWindow = normalized.match(/(?:trong|for|chuỗi|chuoi)\s*(\d+)\s*(?:ngày|ngay|day|days)/i);
  if (daysWindow && /(tin|email|message|messages|chuỗi|chuoi|nhiều ngày|nhieu ngay|drip|cách nhau|cach nhau)/.test(normalized)) {
    return {
      mode: 'drip',
      days: Number(daysWindow[1]),
    };
  }

  const drip = normalized.match(/(\d+)\s*(?:tin nhắn|tin nhan|tin|email|ngày|ngay|message|messages|day|days)/);
  if (drip && /(trong|chuỗi|chuoi|nhiều ngày|nhieu ngay|drip|cách nhau|cach nhau)/.test(normalized)) {
    return {
      mode: 'drip',
      days: Number(drip[1]),
    };
  }

  if (/một lần|mot lan|1 lần|1 lan|gửi ngay|gui ngay|once/.test(normalized)) return { mode: 'once' };
  return null;
};

const isCampaignRequestText = (text = '') => {
  const normalized = String(text || '').toLowerCase();
  return /chiến dịch|chien dich|campaign|gửi email|gui email|gửi mail|gui mail|tin nhắn zalo|tin nhan zalo|zalo nhóm|zalo nhom|drip/.test(normalized)
    || isQuickSendRequest(text)
    || isMultiDaySeriesRequestLocal(text);
};

export const isContentPlanRequestPrompt = (text = '') => (
  /^(?:Hãy trả về content_plan JSON|Return content_plan JSON only)/i.test(String(text || '').trim())
);

const isPlanTemplatePrompt = (text = '') => (
  /tạo chi tiết template cho ngày|tao chi tiet template cho ngay/i.test(String(text || ''))
);

export const isContentPlanRevisionText = (text = '') => {
  const value = String(text || '');
  return /góp ý chỉnh kế hoạch|chỉnh lại content_plan|plan revision:/i.test(value);
};

/** Whole-message approve — dùng khi đang chờ cổng planApproved (không gồm "được"). */
export const PLAN_APPROVE_TEXT_RE =
  /^\s*(đồng ý|dong y|duyệt|duyet|ok|okay|oke|tạo đi|tao di|tạo luôn|tao luon|chốt|chot|yes|approve|go)\s*$/i;

export const PLAN_CANCEL_TEXT_RE =
  /^\s*(huỷ|hủy|huy|cancel|dừng|dung|thôi|thoi|stop)\s*$/i;

export function isPlanApproveText(text = '') {
  return PLAN_APPROVE_TEXT_RE.test(String(text || '').trim());
}

export function isPlanCancelText(text = '') {
  return PLAN_CANCEL_TEXT_RE.test(String(text || '').trim());
}

/**
 * Khi cùng 1 gate bị hỏi lại (lastGateCount >= 2), đổi content để có lối thoát.
 * Không hardcode "Đồng ý" cho mọi gate.
 */
export function withDeadEndNudge(response, meta = {}, gateAsked = null, locale = 'vi') {
  if (!response || !gateAsked) return response;
  const count = Number(meta?.lastGateCount) || 0;
  if (count < 2) return response;

  const isEn = String(locale || 'vi').toLowerCase() === 'en';
  const nudge = gateAsked === 'planApproved'
    ? (isEn
      ? 'Please click **Approve** above, or type **agree** / **ok**. To stop, type **cancel**.'
      : 'Bạn bấm **Đồng ý** ở trên, hoặc gõ **đồng ý** / **ok**. Muốn dừng thì gõ **huỷ**.')
    : (isEn
      ? 'Please pick an option above. To stop this flow, type **cancel**.'
      : 'Bạn chọn một lựa chọn phía trên nhé. Muốn dừng thì gõ **huỷ**.');

  const base = String(response.content || '').trim();
  if (base.includes('huỷ') || base.toLowerCase().includes('cancel')) {
    return response;
  }
  return {
    ...response,
    content: base ? `${base}\n\n${nudge}` : nudge,
  };
}

const getAssistantData = (message) => message?.data || null;

const isSpreadsheetFile = (f) => {
  const name = String(f?.originalName || f?.name || f?.filename || '').toLowerCase();
  const mime = String(f?.contentType || f?.mimeType || '').toLowerCase();
  return (
    name.endsWith('.xlsx')
    || name.endsWith('.xls')
    || name.endsWith('.csv')
    || mime.includes('spreadsheet')
    || mime.includes('excel')
    || mime.includes('csv')
  );
};

export function extractWizardState(history = [], options = {}) {
  const {
    routeSaysActionRequest = false,
    intent = null,
    abandonedAtMessageCount = null,
  } = options || {};

  const rawAbandon = abandonedAtMessageCount;
  const abandonMark = rawAbandon != null && Number.isFinite(Number(rawAbandon)) && Number(rawAbandon) >= 0
    ? Number(rawAbandon)
    : null;

  const state = {
    isCampaignFlow: false,
    channel: null,
    senderAccountId: null,
    senderAccountName: null,
    dataSource: null,
    sheetUrl: null,
    hasAttachedFile: false,
    hasAttachedSpreadsheet: false,
    zaloGroupIds: [],
    zaloFriendIds: [],
    schedule: null,
    planApproved: false,
    senderOtherRequested: false,
    lastChannelMarkerIndex: -1,
    hasContentPlan: false,
    // Tên các gate được trả lời bằng marker TƯỜNG MINH sau channel marker cuối cùng —
    // mergeWizardState dùng để biết field nào derived phải thắng persisted.
    markerGates: [],
    // Latest free-text campaign intent (not marker). null | true | false.
    latestIntentIsQuickSend: null,
    // True only when the latest free-text campaign message explicitly set/cleared schedule.
    latestIntentScheduleFresh: false,
    // Index của tin nhắn gần nhất kích hoạt campaign flow trong history
    latestCampaignMessageIndex: null,
  };

  const recordMarkerGate = (gate) => {
    if (!state.markerGates.includes(gate)) state.markerGates.push(gate);
  };

  const messages = Array.isArray(history) ? history : [];
  let latestFreeTextCampaign = null;

  messages.forEach((message, index) => {
    // Khi session đã bị huỷ ở mốc abandonedAtMessageCount, toàn bộ tin nhắn / marker
    // trước mốc đó thuộc về chiến dịch đã bỏ → không được dùng để suy ra gates cho phiên mới.
    if (abandonMark != null && index < abandonMark) return;

    const content = message?.content || '';
    const marker = message?.role === 'user' ? parseWizardMarker(content) : null;
    const isMachinePlanPrompt = isContentPlanRequestPrompt(content)
      || (index === messages.length - 1 && intent === 'content_plan_request');

    if (message?.role === 'user' && isContentPlanRevisionText(content)) {
      state.hasContentPlan = false;
      state.planApproved = false;
    }

    if (message?.role === 'user' && !marker && !isMachinePlanPrompt && isCampaignRequestText(content)) {
      state.isCampaignFlow = true;
      state.latestCampaignMessageIndex = index;
      latestFreeTextCampaign = content;
      state.channel ||= inferChannelFromText(content);
      if (!state.channel && isQuickSendRequest(content)) {
        state.channel ||= inferQuickSendChannel(content);
      }
      state.dataSource ||= inferDataSourceFromText(content);
      const inferredSchedule = inferScheduleFromText(content);
      if (isQuickSendRequest(content)) {
        // Latest quick-send forces once (multi-day already excluded by isQuickSendRequest).
        state.schedule = { mode: 'once' };
        state.latestIntentIsQuickSend = true;
        state.latestIntentScheduleFresh = true;
      } else {
        // Newer non-quick campaign intent wins over an earlier once.
        state.latestIntentIsQuickSend = false;
        if (inferredSchedule) {
          state.schedule = inferredSchedule;
          state.latestIntentScheduleFresh = true;
        } else if (isMultiDaySeriesRequestLocal(content)) {
          const daysMatch = String(content).match(/(\d+)\s*(?:ngày|ngay|day|days)/i);
          state.schedule = {
            mode: 'drip',
            days: daysMatch ? Number(daysMatch[1]) : undefined,
          };
          state.latestIntentScheduleFresh = true;
        } else if (state.schedule?.mode === 'once') {
          // Left quick-send without a new schedule → re-ask (don't keep sticky once).
          state.schedule = null;
          state.latestIntentScheduleFresh = true;
        }
      }
    }

    if (message?.role === 'assistant' && CAMPAIGN_RESPONSE_TYPES.has(message?.type)) {
      state.isCampaignFlow = true;
      state.latestCampaignMessageIndex = index;
      const data = getAssistantData(message);
      state.channel ||= normalizeChannel(data?.campaignType || data?.channel || data?.days?.[0]?.channel || data?.days?.[0]?.slots?.[0]?.channel);
      if (message.type === 'content_plan') {
        state.hasContentPlan = true;
        state.schedule ||= { mode: 'drip', days: Number(data?.totalDays) || data?.days?.length || null };
      }
    }

    // Template đã được soạn sau content_plan nghĩa là kế hoạch đã được duyệt
    // (UI chỉ sinh template sau khi user bấm Đồng ý) — kể cả khi marker planApproved
    // bị mất khỏi history (ví dụ session reload), không được bắt duyệt lại.
    if (message?.role === 'assistant' && message?.type === 'template_draft' && state.hasContentPlan) {
      state.planApproved = true;
    }

    if (!marker) {
      // Free-text duyệt kế hoạch — PHẢI trước return (reload / không có marker nút).
      if (
        message?.role === 'user'
        && state.hasContentPlan
        && !state.planApproved
        && isPlanApproveText(content)
      ) {
        state.planApproved = true;
      }
      // User dán link Google Sheet dưới dạng tin nhắn thường — lấy link mới nhất
      if (message?.role === 'user') {
        const sheetMatch = content.match(GOOGLE_SHEET_URL_RE);
        if (sheetMatch) state.sheetUrl = sheetMatch[0].replace(/[)\]}>.,;'"]+$/, '');

        // Free-text trả lời câu hỏi fileUsage nếu đang có tệp đính kèm
        if (!state.fileUsage) {
          const norm = content.toLowerCase().trim();
          if (/^cả\s*hai|ca\s*hai|both$/i.test(norm)) {
            state.fileUsage = 'both';
          } else if (/gửi\s*kèm|gui\s*kem|đính\s*kèm|dinh\s*kem|attachment/i.test(norm)) {
            state.fileUsage = 'as_attachment';
          } else if (/lấy\s*nội\s*dung|lay\s*noi\s*dung|làm\s*nội\s*dung|lam\s*noi\s*dung|content/i.test(norm)) {
            state.fileUsage = 'as_content';
          }
          if (state.fileUsage === 'as_content' || state.fileUsage === 'both') {
            state.brief = {
              ...(state.brief || {}),
              contentMode: 'attached_file',
              productMode: 'attached_file',
              hasAttachedFile: true,
            };
          }
        }
      }
      return;
    }
    state.isCampaignFlow = true;
    state.latestCampaignMessageIndex = index;

    if (marker.gate === 'channel') {
      state.channel = normalizeChannel(marker.channel || marker.value);
      state.senderAccountId = null;
      state.senderAccountName = null;
      state.dataSource = null;
      state.zaloGroupIds = [];
      state.zaloFriendIds = [];
      state.schedule = null;
      state.planApproved = false;
      state.senderOtherRequested = false;
      state.lastChannelMarkerIndex = index;
      state.markerGates = ['channel'];
      return;
    }

    if (state.lastChannelMarkerIndex >= 0 && index <= state.lastChannelMarkerIndex) return;

    if (marker.gate === 'senderAccount') {
      recordMarkerGate('senderAccount');
      state.channel = normalizeChannel(marker.channel) || state.channel;
      if (marker.other) {
        state.senderOtherRequested = true;
        state.senderAccountId = null;
        state.senderAccountName = null;
      } else {
        state.senderOtherRequested = false;
        state.senderAccountId = marker.accountId ?? marker.value ?? null;
        state.senderAccountName = marker.accountName || null;
      }
    } else if (marker.gate === 'dataSource') {
      recordMarkerGate('dataSource');
      state.dataSource = marker.value || marker.dataSource || null;
      if (marker.sheetUrl && GOOGLE_SHEET_URL_RE.test(marker.sheetUrl)) {
        state.sheetUrl = marker.sheetUrl.trim();
      }
      if (Array.isArray(marker.friendUids)) {
        state.zaloFriendIds = marker.friendUids;
      }
    } else if (marker.gate === 'zaloGroups') {
      recordMarkerGate('zaloGroups');
      state.senderAccountId = marker.accountId ?? state.senderAccountId;
      state.zaloGroupIds = Array.isArray(marker.groupIds) ? marker.groupIds : [];
    } else if (marker.gate === 'zaloFriends') {
      recordMarkerGate('zaloFriends');
      state.senderAccountId = marker.accountId ?? state.senderAccountId;
      state.zaloFriendIds = Array.isArray(marker.friendIds || marker.friendUids)
        ? (marker.friendIds || marker.friendUids)
        : [];
    } else if (marker.gate === 'schedule') {
      recordMarkerGate('schedule');
      const mode = marker.mode || marker.value || 'once';
      state.schedule = {
        mode,
        days: marker.days != null && marker.days !== '' ? Number(marker.days) : undefined,
        slotsPerDay: marker.slotsPerDay != null && marker.slotsPerDay !== ''
          ? Number(marker.slotsPerDay)
          : undefined,
      };
    } else if (marker.gate === 'planApproved') {
      recordMarkerGate('planApproved');
      state.planApproved = true;
    } else if (marker.gate === 'campaignBrief') {
      if (marker.contentMode === 'attached_file' && !state.fileUsage) {
        state.fileUsage = 'as_content';
      }
    } else if (marker.gate === 'fileUsage') {
      recordMarkerGate('fileUsage');
      const usage = marker.value || marker.fileUsage || null;
      state.fileUsage = usage;
      if (usage === 'as_content' || usage === 'both') {
        state.brief = {
          ...(state.brief || {}),
          contentMode: 'attached_file',
          productMode: 'attached_file',
          hasAttachedFile: true,
        };
      }
    }
  });

  // Khi bộ định tuyến (router) kết luận người dùng có ý định hành động (làm_giúp),
  // kích hoạt isCampaignFlow song song với regex từ khoá cũ.
  if (routeSaysActionRequest) {
    state.isCampaignFlow = true;
    state.latestCampaignMessageIndex = Math.max(
      state.latestCampaignMessageIndex ?? -1,
      messages.length > 0 ? messages.length - 1 : 0,
    );
    const lastUserMsg = messages.slice().reverse().find((m) => m?.role === 'user');
    const lastContent = lastUserMsg?.content || '';
    state.channel ||= inferChannelFromText(lastContent);
    if (!state.channel && isQuickSendRequest(lastContent)) {
      state.channel ||= inferQuickSendChannel(lastContent);
    }
    state.dataSource ||= inferDataSourceFromText(lastContent);
  }

  // Chỉ tính các file được đính kèm từ khi bắt đầu luồng chiến dịch hiện tại (hoặc trong options.files)
  const minCampaignFileIndex = Math.max(
    abandonMark ?? 0,
    state.lastChannelMarkerIndex >= 0 ? state.lastChannelMarkerIndex : 0,
    state.latestCampaignMessageIndex ?? 0
  );

  const campaignFiles = [
    ...(Array.isArray(options?.files) ? options.files : []),
    ...messages
      .filter((m, idx) => m?.role === 'user' && Array.isArray(m?.files) && (state.isCampaignFlow ? idx >= minCampaignFileIndex : true))
      .flatMap((m) => m.files),
  ];

  state.hasAttachedFile = Boolean(options?.hasAttachedFile || campaignFiles.length > 0);
  state.hasAttachedSpreadsheet = Boolean(
    options?.hasAttachedSpreadsheet || campaignFiles.some(isSpreadsheetFile)
  );

  // After channel switch clears schedule: re-apply once only if LATEST free-text intent is still quick-send.
  if (
    latestFreeTextCampaign
    && isQuickSendRequest(latestFreeTextCampaign)
    && !state.markerGates.includes('schedule')
  ) {
    state.schedule = { mode: 'once' };
    state.latestIntentIsQuickSend = true;
    state.latestIntentScheduleFresh = true;
  }

  return state;
}

export function buildChannelQuestion(locale = 'vi') {
  const isEnglish = locale === 'en';
  return {
    type: 'ask_campaign_details',
    content: isEnglish
      ? 'Which channel should this campaign use?'
      : 'Bạn muốn chiến dịch này gửi qua kênh nào?',
    missing_fields: [],
    data: {
      questions: [
        {
          id: 'channel',
          label: isEnglish ? 'Sending channel' : 'Kênh gửi',
          wizardGate: 'channel',
          options: [
            { value: 'email', label: isEnglish ? 'Email' : 'Email' },
            { value: 'zalo', label: isEnglish ? 'Zalo personal' : 'Zalo cá nhân' },
            { value: 'zalo_group', label: isEnglish ? 'Zalo groups' : 'Zalo nhóm' },
          ],
        },
      ],
    },
  };
}

export function buildDataSourceQuestion(locale = 'vi', gateState = null) {
  const isEnglish = locale === 'en';
  const isZalo = gateState?.channel === 'zalo';
  return {
    type: 'ask_campaign_details',
    content: isEnglish
      ? 'Who should receive this campaign? Pick where the recipient list comes from.'
      : 'Bạn muốn gửi cho ai? Chọn nguồn danh sách người nhận nhé.',
    missing_fields: [],
    data: {
      channel: gateState?.channel || null,
      questions: [
        {
          id: 'dataSource',
          label: isEnglish ? 'Recipient list source' : 'Danh sách người nhận lấy từ đâu?',
          wizardGate: 'dataSource',
          options: [
            {
              value: 'db',
              label: isEnglish ? 'Saved customer list' : 'Danh sách khách hàng',
              description: isEnglish
                ? 'People already in your account (from past campaigns, courses, or CRM)'
                : 'Khách đã có trong tài khoản (từ chiến dịch cũ, khóa học, CRM)',
            },
            {
              value: 'sheet',
              label: isEnglish ? 'Excel / Google Sheet' : 'File Excel / Google Sheet',
              description: isEnglish
                ? 'A spreadsheet file or Google Sheet link you provide'
                : 'File hoặc link bảng tính bạn tự cung cấp',
            },
            {
              value: 'landing',
              label: isEnglish ? 'Landing page sign-ups' : 'Đăng ký từ Landing Page',
              description: isEnglish
                ? 'People who submitted the form on your landing page (name, phone, email)'
                : 'Người điền form trên trang landing (tên, SĐT, email)',
            },
            ...(isZalo ? [{
              value: 'zalo_contacts',
              label: isEnglish ? 'Zalo Contacts' : 'Danh bạ Zalo',
              description: isEnglish
                ? 'Select from connected Zalo friends list'
                : 'Chọn từ danh sách bạn bè trên tài khoản Zalo đã kết nối',
              maxRecipients: MAX_AI_MANUAL_RECIPIENTS,
            }] : []),
            {
              value: 'manual',
              label: isEnglish ? 'Enter recipients directly' : 'Nhập người nhận trực tiếp',
              description: isEnglish ? 'Paste email addresses or phone numbers for one send' : 'Dán email hoặc số điện thoại để gửi trực tiếp',
              maxRecipients: MAX_AI_MANUAL_RECIPIENTS,
            },
          ],
        },
      ],
    },
  };
}

export function buildFileUsageQuestion(locale = 'vi') {
  const isEnglish = locale === 'en';
  return {
    type: 'ask_campaign_details',
    content: isEnglish
      ? 'Would you like me to use the content inside the attached file as the message body, or send the file itself as an attachment to recipients?'
      : 'Bạn muốn tôi lấy nội dung trong tệp làm nội dung tin, hay gửi kèm tệp này cho người nhận?',
    missing_fields: [],
    data: {
      questions: [
        {
          id: 'fileUsage',
          label: isEnglish ? 'How should the attached file be used?' : 'Cách sử dụng tệp đính kèm?',
          wizardGate: 'fileUsage',
          options: [
            {
              value: 'as_content',
              label: isEnglish ? 'Use content as message body' : 'Lấy nội dung',
              description: isEnglish
                ? 'Extract text from the file to craft your campaign messages'
                : 'Trích xuất nội dung trong tệp để soạn tin nhắn chiến dịch',
            },
            {
              value: 'as_attachment',
              label: isEnglish ? 'Send as attachment' : 'Gửi kèm tệp',
              description: isEnglish
                ? 'Send this file directly as an attachment to each recipient'
                : 'Gửi trực tiếp tệp này đính kèm cùng tin nhắn cho người nhận',
            },
            {
              value: 'both',
              label: isEnglish ? 'Both (use content & attach file)' : 'Cả hai',
              description: isEnglish
                ? 'Use file content for messages and attach the file'
                : 'Vừa lấy nội dung soạn tin, vừa đính kèm tệp gửi cho khách',
            },
          ],
        },
      ],
    },
  };
}

export function buildScheduleQuestion(locale = 'vi') {
  const isEnglish = locale === 'en';
  return {
    type: 'ask_campaign_details',
    content: isEnglish
      ? 'How should the sending schedule work?'
      : 'Bạn muốn lịch gửi của chiến dịch như thế nào?',
    missing_fields: [],
    data: {
      questions: [
        {
          id: 'schedule',
          label: isEnglish ? 'Schedule' : 'Lịch gửi',
          wizardGate: 'schedule',
          inputType: 'schedule',
          options: [
            { value: 'once', label: isEnglish ? 'Send once' : 'Gửi một lần' },
            {
              value: 'drip',
              label: isEnglish ? 'Multi-day sequence' : 'Chuỗi nhiều ngày',
              description: isEnglish
                ? 'Pick number of days and messages per day'
                : 'Tự chọn số ngày và số tin mỗi ngày',
            },
          ],
          defaults: { days: 3, slotsPerDay: 1 },
        },
      ],
    },
  };
}

/**
 * Deterministic CampaignBrief gate — product/topic picker before schedule.
 * @param {Array<{id:number|string, name?:string}>} courses
 * @param {string} locale
 * @param {{ stale?: boolean, preferredContentMode?: string|null }} [opts]
 */
export function buildCampaignBriefQuestion(courses = [], locale = 'vi', {
  stale = false,
  preferredContentMode = null,
} = {}) {
  const isEnglish = locale === 'en';
  const rawList = Array.isArray(courses) ? courses : [];
  const seenIds = new Set();
  const list = rawList.filter((course) => {
    const id = course?.id;
    if (id == null || seenIds.has(String(id))) return false;
    seenIds.add(String(id));
    return true;
  });

  const options = [
    {
      value: 'single_product',
      label: isEnglish ? 'Product / service' : 'Sản phẩm / dịch vụ',
    },
    {
      value: 'attached_file',
      label: isEnglish ? 'Use attached file (Excel/CSV/PDF)' : 'Dùng dữ liệu từ file đính kèm',
    },
    {
      value: 'custom_topic',
      label: isEnglish ? 'Other content (thank-you, notice, …)' : 'Nội dung khác (cảm ơn, thông báo, …)',
    },
  ];

  const courseOptions = [
    ...list.map((course) => ({
      value: String(course.id),
      label: String(course.name || course.course_name || `#${course.id}`),
    })),
    { value: 'other', label: isEnglish ? 'Other' : 'Khác' },
  ];

  const question = {
    id: 'campaignBrief',
    label: isEnglish ? 'What is this campaign about?' : 'Chiến dịch này nói về gì?',
    wizardGate: 'campaignBrief',
    inputType: 'campaign_brief',
    options,
    courseOptions,
  };

  const data = { questions: [question] };
  if (preferredContentMode) data.preferredContentMode = preferredContentMode;

  let content;
  if (stale) {
    content = isEnglish
      ? 'That product is no longer available. Please choose again.'
      : 'Sản phẩm đó không còn khả dụng. Bạn chọn lại nhé.';
  } else if (preferredContentMode === 'attached_file') {
    content = isEnglish
      ? 'Please attach a file (Excel, Word, PDF...), then click Continue.'
      : 'Bạn đính kèm file (Excel, Word, PDF...) rồi bấm Tiếp tục nhé.';
  } else {
    content = isEnglish
      ? 'What should this campaign promote or talk about?'
      : 'Bạn muốn chiến dịch này quảng bá sản phẩm nào, hoặc nói về chủ đề gì?';
  }

  return {
    type: 'ask_campaign_details',
    content,
    missing_fields: [],
    data,
  };
}

export const GATE_PROPAGATION = {
  channel: 'prompt+patch',
  senderAccountId: 'prompt+patch',
  senderAccountName: 'internal',
  dataSource: 'prompt+patch',
  sheetUrl: 'prompt+patch',
  sheetCheck: 'internal',
  zaloGroupIds: 'prompt+patch',
  zaloFriendIds: 'direct_recipients',
  schedule: 'prompt+patch',
  isCampaignFlow: 'internal',
  planApproved: 'internal',
  senderOtherRequested: 'internal',
  hasContentPlan: 'internal',
  hasAttachedFile: 'internal',
  hasAttachedSpreadsheet: 'internal',
  fileUsage: 'internal',
  abandonedAtMessageCount: 'internal',
};

export function buildCampaignPromptWithWizardState(state, basePrompt = '', locale = 'vi', briefContext = '') {
  const isEnglish = locale === 'en';
  const parts = [String(basePrompt || '').trim()].filter(Boolean);

  if (
    state?.channel ||
    state?.senderAccountId ||
    state?.dataSource ||
    state?.sheetUrl ||
    (Array.isArray(state?.zaloGroupIds) && state.zaloGroupIds.length > 0)
  ) {
    const lines = [];
    if (state.channel) {
      lines.push(`- channel: "${state.channel}"`);
    }
    if (state.senderAccountId) {
      if (state.channel === 'zalo' || state.channel === 'zalo_group') {
        lines.push(`- zaloSenderAccountId: ${state.senderAccountId} (BẮT BUỘC dùng ID này cho select_zalo_account.zaloAccountId và mọi node Zalo; KHÔNG dùng firstZaloAccountId khi có giá trị này)`);
      } else if (state.channel === 'email') {
        lines.push(`- emailSenderId: ${state.senderAccountId} (dùng ID này cho fromEmailId)`);
      }
    }
    if (state.dataSource) {
      lines.push(`- dataSource: "${state.dataSource}"`);
      if (state.dataSource === 'zalo_contacts') {
        const count = Array.isArray(state.zaloFriendIds) ? state.zaloFriendIds.length : 0;
        lines.push(`- zaloFriendCount: ${count}`);
      }
    }
    if (state.sheetUrl) {
      lines.push(`- sheetUrl: "${state.sheetUrl}"`);
    }
    if (Array.isArray(state.zaloGroupIds) && state.zaloGroupIds.length > 0) {
      lines.push(`- zaloGroupIds: [${state.zaloGroupIds.map((id) => `"${id}"`).join(', ')}]`);
    }
    if (lines.length > 0) {
      parts.push(`=== WIZARD ĐÃ CHỐT ===\n${lines.join('\n')}`);
    }
  }

  if (state?.schedule?.mode === 'drip') {
    const days = Number(state.schedule.days) || 3;
    const slotsPerDay = Number(state.schedule.slotsPerDay) || 1;
    parts.push(isEnglish
      ? `Schedule: ${days}-day sequence, ${slotsPerDay} message(s) per day.`
      : `Lịch gửi: chuỗi ${days} ngày, mỗi ngày ${slotsPerDay} tin.`);
  } else if (state?.schedule?.mode === 'once') {
    parts.push(isEnglish ? 'Schedule: send once.' : 'Lịch gửi: gửi một lần.');
  }

  const ctx = String(briefContext || '').trim();
  if (ctx) parts.push(ctx);
  return parts.join('\n');
}

export function findOriginalCampaignPrompt(history = []) {
  const messages = Array.isArray(history) ? history : [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== 'user') continue;
    const content = message?.content || '';
    if (parseWizardMarker(content)) continue;
    if (isCampaignRequestText(content)) return content;
  }
  return '';
}

export function buildSenderAccountQuestion(channel, resources = {}, locale = 'vi') {
  const isEnglish = locale === 'en';
  const isEmail = channel === 'email';
  const rawAccounts = isEmail ? resources.emailSenders : resources.zaloAccounts;
  const accounts = (Array.isArray(rawAccounts) ? rawAccounts : []).map((account) => ({
    id: account.id,
    name: account.name || account.displayName || account.display_name || account.email || account.replyTo || account.zaloName || account.zalo_name || `#${account.id}`,
    email: account.email || account.replyTo || account.reply_to || null,
    status: account.status || 'active',
    isDefault: Boolean(account.isDefault ?? account.is_default),
    isActive: account.isActive ?? account.is_active ?? true,
    usable: isEmail ? account.status === 'active' : isUsableZaloAccount(account),
  }));
  const usableCount = accounts.filter((account) => account.usable).length;

  return {
    type: 'ask_sender_account',
    content: isEnglish
      ? `Choose the ${isEmail ? 'email sender' : 'Zalo account'} for this campaign.`
      : `Bạn chọn tài khoản ${isEmail ? 'email' : 'Zalo'} sẽ dùng để gửi chiến dịch này nhé.`,
    missing_fields: [],
    data: {
      channel,
      accounts,
      allowOther: true,
      noUsableAccount: usableCount === 0,
    },
  };
}

export function buildZaloReconnectGuide(channel = 'zalo', locale = 'vi', { hasDisconnectedAccounts = false } = {}) {
  const isEnglish = locale === 'en';
  return {
    type: 'zalo_qr_login',
    content: hasDisconnectedAccounts
      ? (isEnglish
        ? 'All Zalo accounts are disconnected. Scan the QR code below on your phone to reconnect, then we will continue.'
        : 'Tất cả tài khoản Zalo đang mất kết nối. Bạn quét mã QR bên dưới bằng điện thoại để kết nối lại, sau đó mình sẽ tiếp tục nhé.')
      : (isEnglish
        ? 'Scan the QR code below to connect a Zalo account, then we will continue.'
        : 'Bạn quét mã QR bên dưới để kết nối tài khoản Zalo, rồi mình sẽ tiếp tục nhé.'),
    missing_fields: [],
    data: { channel },
  };
}

export function buildEmailSetupGuide(locale = 'vi') {
  const isEnglish = locale === 'en';
  return {
    type: 'email_setup_guide',
    content: isEnglish
      ? 'Please add an active email sender, then come back here to continue.'
      : 'Bạn cần thêm tài khoản gửi email trước, rồi quay lại đây để tiếp tục.',
    missing_fields: [],
    data: {
      settingsPath: '/app/settings/channels',
      tab: 'email',
    },
  };
}

export function buildGroupPickerCard(accountId, locale = 'vi') {
  const isEnglish = locale === 'en';
  return {
    type: 'zalo_group_picker',
    content: isEnglish
      ? 'Choose the Zalo groups that should receive this campaign.'
      : 'Bạn chọn nhóm Zalo sẽ nhận chiến dịch này nhé.',
    missing_fields: [],
    data: { accountId },
  };
}

export function buildFriendPickerCard(accountId, locale = 'vi') {
  const isEnglish = locale === 'en';
  return {
    type: 'zalo_friend_picker',
    content: isEnglish
      ? 'Choose the Zalo friends who should receive this campaign.'
      : 'Bạn chọn bạn bè Zalo sẽ nhận chiến dịch này nhé.',
    missing_fields: [],
    data: { accountId, maxRecipients: MAX_AI_MANUAL_RECIPIENTS },
  };
}

export function buildSheetProblemMessage(state, locale = 'vi') {
  const isEnglish = locale === 'en';
  const check = state?.sheetCheck || {};
  const status = check.status;
  const channel = state?.channel;
  const isZalo = channel === 'zalo' || channel === 'zalo_group';

  let content = '';

  if (status === 'no_contact') {
    const headerList = Array.isArray(check.headers) && check.headers.length > 0
      ? check.headers.map((h) => `"${h}"`).join(', ')
      : '';
    // Ghép câu theo từng ngôn ngữ, KHÔNG dùng chung một tiền tố: tiếng Anh cần
    // "none of them is…" chứ không nối được vào "…found any…" như tiếng Việt.
    if (isEnglish) {
      content = headerList
        ? `I detected the following columns: ${headerList}, but none of them is an email or phone number column. Please add an Email or Phone column to your sheet (or choose another data source), then share the link again.`
        : 'I could not find any email or phone number columns in your Google Sheet. Please add an Email or Phone column to your sheet (or choose another data source), then share the link again.';
    } else {
      content = headerList
        ? `Tôi đọc được các cột: ${headerList}, nhưng không tìm thấy cột email hoặc số điện thoại nào trong Google Sheet của bạn. Bạn vui lòng bổ sung cột Email hoặc Số điện thoại vào sheet (hoặc chọn nguồn dữ liệu khác), rồi gửi lại link nhé.`
        : 'Tôi không tìm thấy cột email hoặc số điện thoại nào trong Google Sheet của bạn. Bạn vui lòng bổ sung cột Email hoặc Số điện thoại vào sheet (hoặc chọn nguồn dữ liệu khác), rồi gửi lại link nhé.';
    }
  } else if (status === 'wrong_channel') {
    if (isZalo) {
      content = isEnglish
        ? 'Your Google Sheet has email addresses but no phone numbers, which are required for Zalo. Please add a phone number column or switch to the Email channel.'
        : 'Google Sheet của bạn chỉ có email mà chưa có số điện thoại (bắt buộc đối với kênh Zalo). Bạn vui lòng bổ sung cột Số điện thoại hoặc đổi sang kênh Email nhé.';
    } else {
      content = isEnglish
        ? 'Your Google Sheet has phone numbers but no email addresses, which are required for Email. Please add an email column or switch to the Zalo channel.'
        : 'Google Sheet của bạn chỉ có số điện thoại mà chưa có địa chỉ email (bắt buộc đối với kênh Email). Bạn vui lòng bổ sung cột Email hoặc đổi sang kênh Zalo nhé.';
    }
  } else if (status === 'not_public') {
    content = isEnglish
      ? 'I cannot access your Google Sheet. Please make sure the sheet is shared with "Anyone with the link" set to Viewer, then send the link again.'
      : 'Tôi không thể truy cập Google Sheet này. Bạn vui lòng mở quyền chia sẻ "Bất kỳ ai có đường liên kết" ở chế độ Người xem (Viewer), rồi gửi lại link nhé.';
  } else if (status === 'invalid_url') {
    content = isEnglish
      ? 'The Google Sheet link is invalid. Please check the URL and send it again (e.g. docs.google.com/spreadsheets/d/...).'
      : 'Đường dẫn Google Sheet không hợp lệ. Bạn vui lòng kiểm tra lại link (ví dụ: docs.google.com/spreadsheets/d/...) rồi gửi lại nhé.';
  } else if (status === 'too_many') {
    const limit = check.limit || MAX_AI_MANUAL_RECIPIENTS;
    const total = check.totalCount || 0;
    content = isEnglish
      ? `Your Google Sheet has ${total.toLocaleString('en-US')} recipients, exceeding the maximum limit of ${limit.toLocaleString('en-US')} recipients per campaign. Please split your sheet and try again.`
      : `Google Sheet của bạn có ${total.toLocaleString('vi-VN')} người nhận, vượt quá giới hạn tối đa ${limit.toLocaleString('vi-VN')} người mỗi chiến dịch. Bạn vui lòng chia nhỏ danh sách rồi thử lại nhé.`;
  } else {
    content = isEnglish
      ? 'There was an issue reading your Google Sheet recipients. Please check your sheet structure and send the link again.'
      : 'Có vấn đề khi đọc danh sách người nhận từ Google Sheet. Bạn vui lòng kiểm tra lại cấu trúc bảng tính rồi gửi lại link nhé.';
  }

  return {
    type: 'text',
    content,
    missing_fields: [],
    data: null,
  };
}

export function evaluateNextGate(state, resources = {}, locale = 'vi') {
  if (!state?.isCampaignFlow) return null;
  if (!state.channel) return { gate: 'channel', response: buildChannelQuestion(locale) };

  const accountsForChannel = state.channel === 'email' ? resources.emailSenders : resources.zaloAccounts;
  const accounts = Array.isArray(accountsForChannel) ? accountsForChannel : [];
  const selectedAccount = state.senderAccountId
    ? accounts.find((account) => String(account.id) === String(state.senderAccountId))
    : null;
  const selectedUsable = !state.senderAccountId
    || accounts.length === 0
    || (state.channel === 'email' ? selectedAccount?.status === 'active' : isUsableZaloAccount(selectedAccount));

  if (!state.senderAccountId) {
    if (state.channel === 'email' && state.senderOtherRequested) {
      return { gate: 'senderAccount', response: buildEmailSetupGuide(locale) };
    }
    if (state.channel === 'email' && accounts.length === 0) {
      return { gate: 'senderAccount', response: buildEmailSetupGuide(locale) };
    }
    if (isZaloChannel(state.channel)) {
      const usableZaloCount = countUsableZaloAccounts(accounts);
      if (state.senderOtherRequested || accounts.length === 0 || usableZaloCount === 0) {
        return {
          gate: 'senderAccount',
          response: buildZaloReconnectGuide(state.channel, locale, { hasDisconnectedAccounts: accounts.length > 0 }),
        };
      }
    }
    return { gate: 'senderAccount', response: buildSenderAccountQuestion(state.channel, resources, locale) };
  }

  if (!selectedUsable) {
    if (isZaloChannel(state.channel)) {
      return {
        gate: 'senderAccount',
        response: buildZaloReconnectGuide(state.channel, locale, { hasDisconnectedAccounts: true }),
      };
    }
    return { gate: 'senderAccount', response: buildSenderAccountQuestion(state.channel, resources, locale) };
  }

  if (state.channel === 'zalo_group' && state.zaloGroupIds.length === 0) {
    return { gate: 'zaloGroups', response: buildGroupPickerCard(state.senderAccountId, locale) };
  }

  if (state.channel !== 'zalo_group' && !state.dataSource) {
    return { gate: 'dataSource', response: buildDataSourceQuestion(locale, state) };
  }

  const hasSpreadsheetSource = Boolean(
    state.sheetUrl
    || state.hasAttachedSpreadsheet
    || resources.hasAttachedSpreadsheet
    || (state.dataSource === 'sheet' && (state.hasAttachedFile || resources.hasAttachedFile))
  );
  if (state.dataSource === 'sheet' && !hasSpreadsheetSource) {
    return null; // Dừng wizard để AI (thông qua LLM) hỏi người dùng link Google Sheet trước khi qua bước schedule
  }

  if (
    state.dataSource === 'sheet' &&
    state.sheetCheck &&
    state.sheetCheck.url === state.sheetUrl &&
    state.sheetCheck.status !== 'ok'
  ) {
    return {
      gate: 'sheetUrl',
      response: buildSheetProblemMessage(state, locale),
    };
  }

  if (state.channel === 'zalo' && state.dataSource === 'zalo_contacts' && (!Array.isArray(state.zaloFriendIds) || state.zaloFriendIds.length === 0)) {
    return { gate: 'zaloFriends', response: buildFriendPickerCard(state.senderAccountId, locale) };
  }

  const hasNonSpreadsheetFile = Boolean(
    (state.hasAttachedFile || resources.hasAttachedFile) &&
    !(state.hasAttachedSpreadsheet || resources.hasAttachedSpreadsheet)
  );

  const briefCandidate = state.brief || resources.brief;
  const hasAnyAttachedFile = Boolean(state.hasAttachedFile || resources.hasAttachedFile);
  let effectiveBrief = (briefCandidate?.contentMode === 'attached_file' && hasAnyAttachedFile)
    ? { ...briefCandidate, hasAttachedFile: true }
    : briefCandidate;

  const effectiveFileUsage = state.fileUsage || (hasAnyAttachedFile && effectiveBrief?.contentMode === 'attached_file' ? 'as_content' : null);

  if (hasNonSpreadsheetFile && !effectiveFileUsage) {
    return {
      gate: 'fileUsage',
      response: buildFileUsageQuestion(locale),
    };
  }

  if (hasAnyAttachedFile && (effectiveFileUsage === 'as_content' || effectiveFileUsage === 'both')) {
    effectiveBrief = {
      ...(effectiveBrief || createEmptyCampaignBrief(locale)),
      contentMode: 'attached_file',
      productMode: 'attached_file',
      hasAttachedFile: true,
    };
  }

  if (!isCampaignBriefReady(effectiveBrief)) {
    const preferredMode = resources.briefPreferredContentMode || effectiveBrief?.contentMode || null;
    return {
      gate: 'campaignBrief',
      response: buildCampaignBriefQuestion(resources.courses || [], locale, {
        stale: Boolean(resources.briefStale),
        preferredContentMode: preferredMode,
      }),
    };
  }

  const hasValidSchedule = isValidWizardSchedule(state.schedule);
  if (!hasValidSchedule) {
    const response = buildScheduleQuestion(locale);
    if (state.schedule?.mode === 'recurring') {
      response.content = locale === 'en'
        ? 'Recurring schedules (e.g. every 7 days) are coming soon. For now, please choose a one-time send or a multi-day drip sequence:'
        : 'Tính năng gửi lặp định kỳ (ví dụ mỗi 7 ngày) sẽ có sau. Hiện tại bạn chọn gửi một lần hoặc chuỗi drip nhé:';
    }
    return { gate: 'schedule', response };
  }

  if (state.schedule.mode !== 'once' && state.hasContentPlan && !state.planApproved) {
    return {
      gate: 'planApproved',
      response: {
        type: 'ask_campaign_details',
        content: locale === 'en'
          ? 'Please approve the day-by-day plan before I generate each template.'
          : 'Bạn xác nhận kế hoạch theo ngày trước, rồi tôi sẽ tạo từng template theo thứ tự.',
        missing_fields: [],
        data: {
          questions: [
            {
              id: 'planApproved',
              label: locale === 'en' ? 'Approve this plan?' : 'Đồng ý với kế hoạch này?',
              wizardGate: 'planApproved',
              options: [{ value: 'yes', label: locale === 'en' ? 'Approve' : 'Đồng ý' }],
            },
          ],
        },
      },
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Wizard state persistence (ai_chat_sessions.wizard_state JSONB) — pure helpers
// ---------------------------------------------------------------------------

export const WIZARD_STATE_VERSION = 1;

export const GATE_MERGE_POLICIES = {
  // marker-pick: dùng pick(gateName, d[field], p[field])
  senderAccountId: { policy: 'marker-pick', gateName: 'senderAccount' },
  senderAccountName: { policy: 'marker-pick', gateName: 'senderAccount' },
  dataSource: { policy: 'marker-pick', gateName: 'dataSource' },
  fileUsage: { policy: 'marker-pick', gateName: 'fileUsage' },

  // marker-pick-array: như marker-pick nhưng usable là mảng không rỗng
  zaloGroupIds: { policy: 'marker-pick-array', gateName: 'zaloGroups' },
  zaloFriendIds: { policy: 'marker-pick-array', gateName: 'zaloFriends' },

  // derived-first: (channelSwitched || hasAbandonMark) ? (d[field] ?? null) : (d[field] ?? p[field] ?? null)
  sheetUrl: { policy: 'derived-first' },

  // boolean-or-reset: OR hai nguồn, reset khi đổi kênh / abandon
  senderOtherRequested: { policy: 'boolean-or-reset', gateName: 'senderAccount' },
  hasContentPlan: { policy: 'boolean-or-reset' },
  planApproved: { policy: 'boolean-or-reset' },
  hasAttachedFile: { policy: 'boolean-or-reset', ignoreChannelSwitch: true, ignoreAbandon: true },
  hasAttachedSpreadsheet: { policy: 'boolean-or-reset', ignoreChannelSwitch: true, ignoreAbandon: true },

  // custom: giữ logic riêng biệt
  isCampaignFlow: { policy: 'custom' },
  channel: { policy: 'custom' },
  schedule: { policy: 'custom' },
  sheetCheck: { policy: 'custom' },
  abandonedAtMessageCount: { policy: 'custom' },
};

export function createEmptyWizardState() {
  return {
    v: WIZARD_STATE_VERSION,
    gates: {
      isCampaignFlow: false,
      channel: null,
      senderAccountId: null,
      senderAccountName: null,
      dataSource: null,
      sheetUrl: null,
      sheetCheck: null,
      zaloGroupIds: [],
      zaloFriendIds: [],
      schedule: null,
      planApproved: false,
      senderOtherRequested: false,
      hasContentPlan: false,
      hasAttachedFile: false,
      hasAttachedSpreadsheet: false,
      fileUsage: null,
      abandonedAtMessageCount: null,
    },
    plan: {
      snapshot: null,
      sourcePrompt: '',
      requiresApproval: true,
      savedTemplates: [],
      status: null,
      campaignId: null,
    },
    brief: createEmptyCampaignBrief('vi'),
    meta: {
      lastGate: null,
      lastGateCount: 0,
      deadEndLoggedAt: null,
      updatedAt: null,
    },
  };
}

export function normalizeWizardState(raw) {
  const empty = createEmptyWizardState();
  if (!raw || typeof raw !== 'object' || raw.v !== WIZARD_STATE_VERSION) return empty;
  return {
    v: WIZARD_STATE_VERSION,
    gates: { ...empty.gates, ...(raw.gates || {}) },
    plan: { ...empty.plan, ...(raw.plan || {}) },
    brief: mergeCampaignBrief(raw.brief, null),
    meta: { ...empty.meta, ...(raw.meta || {}) },
  };
}

/**
 * Câu văn tự do chỉ nói được phần thô của lịch — "chuỗi 5 ngày". Không ai gõ lại
 * "2 tin mỗi ngày" lần thứ hai; con số đó nằm trong marker [wizard] của bước schedule.
 *
 * Sau khi TẢI LẠI TRANG, marker biến mất khỏi history, nên chính câu yêu cầu ĐẦU TIÊN
 * lại trở thành "ý định mới nhất" (latestIntentScheduleFresh). Nó ghi đè lịch đã lưu và
 * đánh rơi slotsPerDay ⇒ isValidDripSchedule (:52) trả false ⇒ trợ lý hỏi lại lịch gửi
 * từ đầu giữa chuỗi drip. Bug thật 23/08/2026; golden fixture
 * dripSlotsPerDaySurvivesPlanTurn + reloadThenSaveContinuesChain khoá lại ca này.
 *
 * Cách xử: giữ nguyên quyền ghi đè của ý định mới, nhưng field nào câu văn KHÔNG nhắc
 * tới thì lấy lại từ state đã lưu — và chỉ khi cùng mode. Đổi mode (once ↔ drip) thì
 * derived thắng trọn vẹn, không hồi sinh gì.
 */
const backfillScheduleDetails = (derivedSchedule, persistedSchedule) => {
  if (!derivedSchedule || !persistedSchedule) return derivedSchedule;
  if (derivedSchedule.mode !== persistedSchedule.mode) return derivedSchedule;
  const filled = { ...derivedSchedule };
  ['days', 'slotsPerDay'].forEach((field) => {
    if (filled[field] == null && persistedSchedule[field] != null) {
      filled[field] = persistedSchedule[field];
    }
  });
  return filled;
};

/**
 * Merge persisted gates (DB) với state derive từ history của request hiện tại.
 * Nguyên tắc: marker tường minh trong request → derived thắng; persisted lấp chỗ
 * trống (marker đã mất khỏi history, ví dụ session reload); inference chỉ fill gap.
 * Đổi kênh → mọi field downstream chỉ lấy derived, cấm hồi sinh từ persisted.
 * Revision text → reset duyệt kế hoạch, thắng tất cả.
 * Thoát wizard (abandonedAtMessageCount) → chỉ kích hoạt lại khi có câu yêu cầu mới SAU mốc thoát.
 */
export function mergeWizardState(persistedGates, derived, { lastUserText = '' } = {}) {
  const p = persistedGates || {};
  const d = derived || {};
  const markerGates = Array.isArray(d.markerGates) ? d.markerGates : [];
  const channelMarkerSeen = markerGates.includes('channel');
  const channelSwitched = channelMarkerSeen && p.channel != null && d.channel !== p.channel;

  const rawAbandon = p.abandonedAtMessageCount;
  const hasAbandonMark = rawAbandon != null && Number.isFinite(Number(rawAbandon)) && Number(rawAbandon) >= 0;
  const abandonedMark = hasAbandonMark ? Number(rawAbandon) : null;
  const isReactivated = hasAbandonMark
    && Number.isFinite(d.latestCampaignMessageIndex)
    && d.latestCampaignMessageIndex >= abandonedMark;

  const isCampaignFlow = hasAbandonMark
    ? Boolean(isReactivated && d.isCampaignFlow)
    : Boolean(d.isCampaignFlow || p.isCampaignFlow);

  const pick = (gateName, derivedValue, persistedValue, persistedUsable = (v) => v != null) => {
    if (markerGates.includes(gateName)) return derivedValue;
    if (channelSwitched) return derivedValue;
    if (hasAbandonMark) return derivedValue;
    return persistedUsable(persistedValue) ? persistedValue : derivedValue;
  };

  const merged = {};

  for (const [field, config] of Object.entries(GATE_MERGE_POLICIES)) {
    const policy = config.policy;

    if (policy === 'marker-pick') {
      merged[field] = pick(config.gateName || field, d[field] ?? null, p[field]);
    } else if (policy === 'marker-pick-array') {
      merged[field] = pick(
        config.gateName || field,
        Array.isArray(d[field]) ? d[field] : [],
        p[field],
        (v) => Array.isArray(v) && v.length > 0
      );
    } else if (policy === 'derived-first') {
      merged[field] = (channelSwitched || hasAbandonMark)
        ? (d[field] ?? null)
        : (d[field] ?? p[field] ?? null);
    } else if (policy === 'boolean-or-reset') {
      const reset = (!config.ignoreChannelSwitch && channelSwitched)
        || (!config.ignoreAbandon && hasAbandonMark)
        || (config.gateName && markerGates.includes(config.gateName));

      merged[field] = reset
        ? Boolean(d[field])
        : Boolean(d[field] || p[field]);
    } else if (policy === 'custom') {
      if (field === 'isCampaignFlow') {
        merged.isCampaignFlow = isCampaignFlow;
      } else if (field === 'channel') {
        merged.channel = channelMarkerSeen
          ? (d.channel ?? null)
          : (hasAbandonMark ? (d.channel ?? null) : (p.channel ?? d.channel ?? null));
      } else if (field === 'schedule') {
        merged.schedule = (() => {
          if (markerGates.includes('schedule') || channelSwitched || hasAbandonMark) return d.schedule ?? null;
          if (d.latestIntentScheduleFresh) return backfillScheduleDetails(d.schedule ?? null, p.schedule);
          if (d.latestIntentIsQuickSend === true) return d.schedule ?? { mode: 'once' };
          return (p.schedule != null) ? p.schedule : (d.schedule ?? null);
        })();
      } else if (field === 'sheetCheck') {
        merged.sheetCheck = (channelSwitched || hasAbandonMark)
          ? null
          : ((d.sheetUrl ?? p.sheetUrl) && p.sheetCheck?.url === (d.sheetUrl ?? p.sheetUrl) ? p.sheetCheck : null);
      } else if (field === 'abandonedAtMessageCount') {
        merged.abandonedAtMessageCount = (hasAbandonMark && !isReactivated) ? abandonedMark : null;
      }
    }
  }

  if (isContentPlanRevisionText(lastUserText)) {
    merged.planApproved = false;
    merged.hasContentPlan = false;
  }

  return merged;
}

export function computeWizardMeta(prevMeta = {}, gateAsked = null) {
  const now = new Date().toISOString();
  const {
    lastGate: _ignoredLastGate,
    lastGateCount: _ignoredCount,
    deadEndLoggedAt: prevDeadEnd,
    updatedAt: _ignoredUpdated,
    ...preserved
  } = prevMeta && typeof prevMeta === 'object' ? prevMeta : {};

  if (gateAsked && prevMeta?.lastGate === gateAsked) {
    return {
      ...preserved,
      lastGate: gateAsked,
      lastGateCount: (Number(prevMeta.lastGateCount) || 0) + 1,
      deadEndLoggedAt: prevDeadEnd || null,
      updatedAt: now,
    };
  }
  return {
    ...preserved,
    lastGate: gateAsked || null,
    lastGateCount: gateAsked ? 1 : 0,
    deadEndLoggedAt: null,
    updatedAt: now,
  };
}

// --------------------------- PATCH action reducer ---------------------------

export const WIZARD_STATE_ACTIONS = [
  'approve_plan',
  'set_sheet_url',
  'record_template_saved',
  'reset_plan',
  'mark_campaign_created',
  'abandon_campaign_flow',
];

const invalidAction = (message) => {
  const err = new Error(message);
  err.status = 400;
  return err;
};

// So sánh số record đã lưu theo ngày với số slot trong snapshot — không phụ thuộc
// format slotId để khỏi lệch với getPlanSlotKey phía client.
const computePlanStatus = (plan) => {
  const days = Array.isArray(plan?.snapshot?.days) ? plan.snapshot.days : [];
  if (!days.length) {
    return (plan?.savedTemplates || []).length ? 'waiting_template_save' : (plan?.status || null);
  }
  const savedByDay = {};
  (plan.savedTemplates || []).forEach((record) => {
    const day = Number(record?.day);
    if (Number.isFinite(day)) savedByDay[day] = (savedByDay[day] || 0) + 1;
  });
  const allDone = days.every((dayItem) => {
    const day = Number(dayItem?.day);
    const slotCount = Array.isArray(dayItem?.slots) && dayItem.slots.length > 0 ? dayItem.slots.length : 1;
    return (savedByDay[day] || 0) >= slotCount;
  });
  return allDone ? 'waiting_campaign_confirm' : 'waiting_template_save';
};

/**
 * Reducer thuần cho PATCH /ai/sessions/:id/wizard-state.
 * Trả { state, changed }; không mutate input; throw { status: 400 } khi invalid.
 */
export function applyWizardStateAction(state, action, payload = {}) {
  const current = normalizeWizardState(state);
  if (!WIZARD_STATE_ACTIONS.includes(action)) {
    throw invalidAction(`Action không hợp lệ: ${String(action)}`);
  }

  const next = {
    v: WIZARD_STATE_VERSION,
    gates: { ...current.gates },
    plan: { ...current.plan, savedTemplates: [...current.plan.savedTemplates] },
    brief: current.brief,
    meta: { ...current.meta },
  };

  switch (action) {
    case 'approve_plan': {
      if (current.gates.planApproved) return { state: current, changed: false };
      next.gates.planApproved = true;
      next.meta.lastGate = null;
      next.meta.lastGateCount = 0;
      next.meta.deadEndLoggedAt = null;
      return { state: next, changed: true };
    }
    case 'set_sheet_url': {
      const sheetUrl = String(payload?.sheetUrl || '').trim();
      if (!GOOGLE_SHEET_URL_RE.test(sheetUrl)) {
        throw invalidAction('sheetUrl phải là link Google Sheet hợp lệ (docs.google.com/spreadsheets/...)');
      }
      if (current.gates.sheetUrl === sheetUrl) return { state: current, changed: false };
      next.gates.sheetUrl = sheetUrl;
      next.gates.sheetCheck = null;
      if (!next.gates.dataSource) next.gates.dataSource = 'sheet';
      return { state: next, changed: true };
    }
    case 'record_template_saved': {
      const records = Array.isArray(payload?.records) ? payload.records : [];
      if (!records.length) throw invalidAction('records không được để trống');
      const existing = new Set(next.plan.savedTemplates.map((record) => String(record.slotId)));
      let appended = 0;
      for (const record of records) {
        const slotId = record?.slotId != null ? String(record.slotId) : '';
        const templateId = Number(record?.templateId);
        if (!slotId || !Number.isFinite(templateId)) {
          throw invalidAction('Mỗi record cần slotId và templateId hợp lệ');
        }
        if (existing.has(slotId)) continue;
        existing.add(slotId);
        next.plan.savedTemplates.push({ ...record, slotId, templateId });
        appended += 1;
      }
      if (!appended) return { state: current, changed: false };
      next.plan.status = computePlanStatus(next.plan);
      return { state: next, changed: true };
    }
    case 'reset_plan': {
      const alreadyEmpty = !current.plan.snapshot
        && current.plan.savedTemplates.length === 0
        && !current.gates.planApproved
        && !current.gates.hasContentPlan;
      if (alreadyEmpty) return { state: current, changed: false };
      next.plan = createEmptyWizardState().plan;
      next.gates.planApproved = false;
      next.gates.hasContentPlan = false;
      return { state: next, changed: true };
    }
    case 'abandon_campaign_flow': {
      const messageCount = Number(payload?.messageCount ?? 0);
      next.gates = {
        ...createEmptyWizardState().gates,
        abandonedAtMessageCount: Number.isFinite(messageCount) && messageCount >= 0 ? messageCount : 0,
      };
      next.plan = createEmptyWizardState().plan;
      next.meta.lastGate = null;
      next.meta.lastGateCount = 0;
      next.meta.deadEndLoggedAt = null;
      return { state: next, changed: true };
    }
    case 'mark_campaign_created': {
      const campaignId = payload?.campaignId ?? null;
      if (current.plan.status === 'completed' && current.plan.campaignId === campaignId) {
        return { state: current, changed: false };
      }
      next.plan.status = 'completed';
      next.plan.campaignId = campaignId;
      return { state: next, changed: true };
    }
    default:
      throw invalidAction(`Action không hợp lệ: ${String(action)}`);
  }
}

export function shouldGuardCampaignResponse(response) {
  return CAMPAIGN_RESPONSE_TYPES.has(response?.type);
}

export function isWizardMarkerMessage(content = '') {
  return Boolean(parseWizardMarker(content));
}

/**
 * Types where the assistant is waiting for a gate answer (not result/display cards).
 * Keep in sync with AiChatbot interactiveTypes — ask-* / setup / confirm / plan actions only.
 */
export const GATE_PROMPT_TYPES = new Set([
  'ask_campaign_details',
  'ask_campaign_type',
  'ask_audience',
  'ask_sender_account',
  'ask_landing_details',
  'email_setup_guide',
  'zalo_qr_login',
  'zalo_group_picker',
  'zalo_friend_picker',
  'confirm_create',
  'content_plan_actions',
]);

/**
 * Current turn is answering a wizard gate?
 *  (a) button click: last user message is a [wizard] marker (gate card stripped from history)
 *  (b) typed reply: previous assistant message is a gate prompt card (still in history)
 */
export function isWizardAnswerTurn(history = []) {
  if (!Array.isArray(history) || history.length === 0) return false;
  const last = history[history.length - 1];
  if (last?.role === 'user' && isWizardMarkerMessage(last.content)) return true;
  const prev = history[history.length - 2];
  return prev?.role === 'assistant' && GATE_PROMPT_TYPES.has(prev.type);
}

export function isPlanTemplateDraftRequest(content = '') {
  return isPlanTemplatePrompt(content);
}
