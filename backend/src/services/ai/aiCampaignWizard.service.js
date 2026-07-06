const WIZARD_MARKER_RE = /^\[wizard\](\{.*\})/;

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

const isUsableZaloAccount = (account) => (
  account?.status === 'connected' && account?.isActive !== false && account?.is_active !== false
);

const parseWizardMarker = (content = '') => {
  const firstLine = String(content || '').split('\n')[0]?.trim();
  const match = firstLine?.match(WIZARD_MARKER_RE);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1]);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
};

const inferChannelFromText = (text = '') => {
  const normalized = String(text || '').toLowerCase();
  if (/zalo\s*group|zalo\s*nh[oó]m|nh[oó]m\s*zalo|gửi\s*nh[oó]m|gui\s*nhom/.test(normalized)) {
    return 'zalo_group';
  }
  if (/\bzalo\b|tin nhắn|tin nhan/.test(normalized)) return 'zalo';
  if (/\bemail\b|gửi mail|gui mail|thư điện tử|thu dien tu/.test(normalized)) return 'email';
  return null;
};

const inferDataSourceFromText = (text = '') => {
  const normalized = String(text || '').toLowerCase();
  if (/google\s*sheet|spreadsheet|docs\.google\.com\/spreadsheets|excel|xlsx|xls|csv|file|t[eệ]p|tập tin/.test(normalized)) {
    return 'sheet';
  }
  if (/landing page|landing|lead/.test(normalized)) return 'landing';
  if (/database|db|crm|khách hàng trong hệ thống|khach hang trong he thong|khách hàng có sẵn|khach hang co san/.test(normalized)) {
    return 'db';
  }
  return null;
};

const inferScheduleFromText = (text = '') => {
  const normalized = String(text || '').toLowerCase();
  const recurring = normalized.match(/(?:mỗi|moi|every|cách|cach)\s+(\d+)\s*(?:ngày|ngay|day|days)/);
  if (recurring) return { mode: 'recurring', days: Number(recurring[1]) };

  const daysWindow = normalized.match(/(?:trong|for)\s+(\d+)\s*(?:ngày|ngay|day|days)/);
  if (daysWindow && /(tin|email|message|messages|chuỗi|chuoi|nhiều ngày|nhieu ngay|drip|cách nhau|cach nhau)/.test(normalized)) {
    return { mode: 'drip', days: Number(daysWindow[1]) };
  }

  const drip = normalized.match(/(\d+)\s*(?:tin nhắn|tin nhan|tin|email|ngày|ngay|message|messages|day|days)/);
  if (drip && /(trong|chuỗi|chuoi|nhiều ngày|nhieu ngay|drip|cách nhau|cach nhau)/.test(normalized)) {
    return { mode: 'drip', days: Number(drip[1]) };
  }

  if (/một lần|mot lan|1 lần|1 lan|gửi ngay|gui ngay|once/.test(normalized)) return { mode: 'once' };
  return null;
};

const isCampaignRequestText = (text = '') => {
  const normalized = String(text || '').toLowerCase();
  return /chiến dịch|chien dich|campaign|gửi email|gui email|gửi mail|gui mail|tin nhắn zalo|tin nhan zalo|zalo nhóm|zalo nhom|drip/.test(normalized);
};

const isPlanTemplatePrompt = (text = '') => (
  /tạo chi tiết template cho ngày|tao chi tiet template cho ngay/i.test(String(text || ''))
);

const getAssistantData = (message) => message?.data || null;

export function extractWizardState(history = []) {
  const state = {
    isCampaignFlow: false,
    channel: null,
    senderAccountId: null,
    senderAccountName: null,
    dataSource: null,
    zaloGroupIds: [],
    schedule: null,
    planApproved: false,
    senderOtherRequested: false,
    lastChannelMarkerIndex: -1,
    hasContentPlan: false,
  };

  const messages = Array.isArray(history) ? history : [];

  messages.forEach((message, index) => {
    const content = message?.content || '';
    const marker = message?.role === 'user' ? parseWizardMarker(content) : null;

    if (message?.role === 'user' && isCampaignRequestText(content)) {
      state.isCampaignFlow = true;
      state.channel ||= inferChannelFromText(content);
      state.dataSource ||= inferDataSourceFromText(content);
      const inferredSchedule = inferScheduleFromText(content);
      if (inferredSchedule && inferredSchedule.mode !== 'recurring') {
        state.schedule ||= inferredSchedule;
      } else if (inferredSchedule?.mode === 'recurring') {
        state.schedule = { mode: 'recurring', days: inferredSchedule.days };
      }
    }

    if (message?.role === 'assistant' && CAMPAIGN_RESPONSE_TYPES.has(message?.type)) {
      state.isCampaignFlow = true;
      const data = getAssistantData(message);
      state.channel ||= normalizeChannel(data?.campaignType || data?.channel || data?.days?.[0]?.channel || data?.days?.[0]?.slots?.[0]?.channel);
      if (message.type === 'content_plan') {
        state.hasContentPlan = true;
        state.schedule ||= { mode: 'drip', days: Number(data?.totalDays) || data?.days?.length || null };
      }
    }

    if (!marker) return;
    state.isCampaignFlow = true;

    if (marker.gate === 'channel') {
      state.channel = normalizeChannel(marker.channel || marker.value);
      state.senderAccountId = null;
      state.senderAccountName = null;
      state.dataSource = null;
      state.zaloGroupIds = [];
      state.schedule = null;
      state.planApproved = false;
      state.senderOtherRequested = false;
      state.lastChannelMarkerIndex = index;
      return;
    }

    if (state.lastChannelMarkerIndex >= 0 && index <= state.lastChannelMarkerIndex) return;

    if (marker.gate === 'senderAccount') {
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
      state.dataSource = marker.value || marker.dataSource || null;
    } else if (marker.gate === 'zaloGroups') {
      state.senderAccountId = marker.accountId ?? state.senderAccountId;
      state.zaloGroupIds = Array.isArray(marker.groupIds) ? marker.groupIds : [];
    } else if (marker.gate === 'schedule') {
      state.schedule = {
        mode: marker.mode || marker.value || 'once',
        days: marker.days ? Number(marker.days) : undefined,
      };
    } else if (marker.gate === 'planApproved') {
      state.planApproved = true;
    }
  });

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

export function buildDataSourceQuestion(locale = 'vi') {
  const isEnglish = locale === 'en';
  return {
    type: 'ask_campaign_details',
    content: isEnglish
      ? 'Where should the recipient list come from?'
      : 'Bạn chọn giúp tôi nguồn danh sách người nhận nhé.',
    missing_fields: [],
    data: {
      questions: [
        {
          id: 'dataSource',
          label: isEnglish ? 'Recipient source' : 'Lấy danh sách người nhận từ đâu?',
          wizardGate: 'dataSource',
          options: [
            { value: 'db', label: isEnglish ? 'Customers in the system' : 'Khách hàng trong hệ thống' },
            { value: 'sheet', label: isEnglish ? 'Excel / Google Sheet' : 'File Excel / Google Sheet' },
            { value: 'landing', label: isEnglish ? 'Landing page leads' : 'Lead từ Landing Page' },
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
          options: [
            { value: 'once', label: isEnglish ? 'Send once' : 'Gửi một lần' },
            { value: 'drip_3', label: isEnglish ? '3-day sequence' : 'Chuỗi 3 ngày' },
            { value: 'drip_5', label: isEnglish ? '5-day sequence' : 'Chuỗi 5 ngày' },
          ],
        },
      ],
    },
  };
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
    return { gate: 'senderAccount', response: buildSenderAccountQuestion(state.channel, resources, locale) };
  }

  if (!selectedUsable) {
    return { gate: 'senderAccount', response: buildSenderAccountQuestion(state.channel, resources, locale) };
  }

  if (state.channel === 'zalo_group' && state.zaloGroupIds.length === 0) {
    return { gate: 'zaloGroups', response: buildGroupPickerCard(state.senderAccountId, locale) };
  }

  if (state.channel !== 'zalo_group' && !state.dataSource) {
    return { gate: 'dataSource', response: buildDataSourceQuestion(locale) };
  }

  const hasValidSchedule = state.schedule && state.schedule.mode !== 'recurring';
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

export function shouldGuardCampaignResponse(response) {
  return CAMPAIGN_RESPONSE_TYPES.has(response?.type);
}

export function isWizardMarkerMessage(content = '') {
  return Boolean(parseWizardMarker(content));
}

export function isPlanTemplateDraftRequest(content = '') {
  return isPlanTemplatePrompt(content);
}
