// Tách khỏi AiChatbot.jsx (PLAN_WIZARD_VONG_DOI_2026-09-07 PR-1) — ba hàm suy trạng thái
// wizard chưa có test vì trước đây là `const` riêng của component. Cùng dependencies
// (normalizeChannel, parseWizardMarker, GOOGLE_SHEET_URL_RE) di chuyển theo để tránh import
// vòng (AiChatbot.jsx import lại các hàm này thay vì tự khai báo).

// Ranh giới "chiến dịch đã tạo xong / đã bỏ dở" trong lịch sử — khai lại y hệt backend
// (aiCampaignWizard.service.js FLOW_BOUNDARY_TYPES). 'campaign_abandoned' thêm ở PR-2
// (PLAN_WIZARD_VONG_DOI). Cố ý KHÔNG coi là "đang trong luồng" — nghĩa ngược lại.
// LƯU Ý: wizardContext.spec.js chỉ so với một mảng HẰNG (không import ngược backend, hai dự
// án chạy hai test runner khác nhau — jest/vitest) — sửa một bên mà quên bên kia sẽ KHÔNG bị
// bắt tự động, phải tự đối chiếu tay khi đổi bộ này.
export const FLOW_BOUNDARY_TYPES = new Set(['campaign_created', 'auto_created_success', 'campaign_abandoned']);

export const normalizeChannel = (channel) => {
  const lower = String(channel || '').trim().toLowerCase();
  if (lower === 'zalo_personal') return 'zalo';
  if (lower === 'zalo_group') return 'zalo_group';
  return lower;
};

export const parseWizardMarker = (content = '') => {
  const firstLine = String(content || '').split('\n')[0]?.trim();
  const match = firstLine?.match(/^\[wizard\](\{.*\})/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
};

export const GOOGLE_SHEET_URL_RE = /https?:\/\/docs\.google\.com\/spreadsheets\/\S+/i;

export const deriveWizardContext = (items = []) => {
  const context = {
    channel: null,
    senderAccountId: null,
    senderAccountName: null,
    dataSource: null,
    sheetUrl: null,
    zaloGroupIds: [],
    zaloFriendIds: [],
    schedule: null,
    planApproved: false,
  };
  items.forEach((message) => {
    // Ranh giới "chiến dịch đã tạo xong" — reset TRƯỚC khi xét role/marker, để chiến dịch
    // tiếp theo trong CÙNG hội thoại không kế thừa sender/nhóm/nguồn của chiến dịch vừa tạo.
    if (message?.role === 'assistant' && FLOW_BOUNDARY_TYPES.has(message?.type)) {
      context.channel = null;
      context.senderAccountId = null;
      context.senderAccountName = null;
      context.dataSource = null;
      context.sheetUrl = null;
      context.zaloGroupIds = [];
      context.zaloFriendIds = [];
      context.schedule = null;
      context.planApproved = false;
      return;
    }
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
      context.zaloFriendIds = [];
      context.schedule = null;
      context.planApproved = false;
    } else if (marker.gate === 'senderAccount') {
      context.channel = normalizeChannel(marker.channel) || context.channel;
      context.senderAccountId = marker.accountId ?? null;
      context.senderAccountName = marker.accountName || null;
    } else if (marker.gate === 'dataSource') {
      context.dataSource = marker.value || marker.dataSource || null;
      if (marker.sheetUrl) {
        context.sheetUrl = marker.sheetUrl;
      }
      if (Array.isArray(marker.friendUids)) {
        context.zaloFriendIds = marker.friendUids;
      }
    } else if (marker.gate === 'zaloGroups') {
      context.senderAccountId = marker.accountId ?? context.senderAccountId;
      context.zaloGroupIds = Array.isArray(marker.groupIds) ? marker.groupIds : [];
    } else if (marker.gate === 'zaloFriends') {
      context.senderAccountId = marker.accountId ?? context.senderAccountId;
      context.zaloFriendIds = Array.isArray(marker.friendIds || marker.friendUids) ? (marker.friendIds || marker.friendUids) : [];
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
export const mergeClientWizardContext = (derived, gates) => ({
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

export const applyWizardSelectionsToScript = (script, context = {}) => {
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
            config: { sheetUrl, headerRow: 1, dataStartRow: 2 },
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
