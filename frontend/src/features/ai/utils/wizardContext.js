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

/**
 * Chỉ số thẻ tương tác đang "sống" (isActive) trong lịch sử, hoặc -1. Thẻ đứng TRƯỚC một tin
 * ranh giới (đã tạo xong / đã bỏ dở) không còn sống dù nó là thẻ tương tác cuối cùng.
 *
 * Nghiệm thu thật 09/09 (PLAN_WIZARD_VONG_DOI PR-2): gõ "huỷ" → tin `campaign_abandoned` được
 * thêm, nhưng AiChatbot.jsx tính latestInteractiveIndex bằng "thẻ tương tác cuối cùng" không
 * nhìn ranh giới → thẻ cổng cũ vẫn bấm được, bấm là wizard chạy tiếp như chưa huỷ. Tải lại
 * trang thì hết (wizardCardHistory cắt thẻ trước ranh giới) — đúng kiểu "chỉ đúng sau F5" mà
 * PR-2 tuyên bố đã sửa. Cùng một luật cho campaign_created: thẻ confirm cũ cũng phải tắt.
 *
 * @param {Array<{ role?: string, type?: string }>} messages
 * @param {Iterable<string>} interactiveTypes
 * @returns {number}
 */
export const findLatestInteractiveIndex = (messages = [], interactiveTypes = []) => {
  const interactive = interactiveTypes instanceof Set ? interactiveTypes : new Set(interactiveTypes);
  return (Array.isArray(messages) ? messages : []).reduce((latest, message, index) => {
    if (message?.role === 'assistant' && FLOW_BOUNDARY_TYPES.has(message?.type)) return -1;
    return interactive.has(message?.type) ? index : latest;
  }, -1);
};

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

// Khai lại chuẩn hoá slug landing của backend (aiCampaignWizard.service.js normalizeLandingSlugs): chuỗi, thường hoá, bỏ "/" đầu cuối, bỏ trùng.
// Khai lại normalizeFormId của backend (aiCampaignWizard.service.js): số nguyên dương hoặc null; chuỗi số ("7") được nhận.
export const normalizeFormId = (raw) => {
  if (raw == null || raw === '' || typeof raw === 'boolean') return null;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
};

const normalizeLandingSlugList = (raw) => {
  if (!Array.isArray(raw)) return [];
  const out = [];
  raw.forEach((item) => {
    const slug = String(item ?? '').trim().toLowerCase().replace(/^\/+|\/+$/g, '').slice(0, 100);
    if (slug && !out.includes(slug)) out.push(slug);
  });
  return out;
};

export const deriveWizardContext = (items = []) => {
  const context = {
    channel: null,
    senderAccountId: null,
    senderAccountName: null,
    dataSource: null,
    sheetUrl: null,
    zaloGroupIds: [],
    zaloFriendIds: [],
    // Rà soát C P2-7 — lựa chọn landing của nguồn "Đăng ký từ Landing Page" (cổng landingLeads của backend).
    landingLeadsSlugs: [],
    landingLeadsAll: false,
    // Biểu mẫu đã chọn ở cổng formId của nguồn "Người điền Biểu mẫu" (số nguyên dương hoặc null).
    formId: null,
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
      context.landingLeadsSlugs = [];
      context.landingLeadsAll = false;
      context.formId = null;
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
      context.landingLeadsSlugs = [];
      context.landingLeadsAll = false;
      context.formId = null;
      context.schedule = null;
      context.planApproved = false;
    } else if (marker.gate === 'senderAccount') {
      context.channel = normalizeChannel(marker.channel) || context.channel;
      context.senderAccountId = marker.accountId ?? null;
      context.senderAccountName = marker.accountName || null;
    } else if (marker.gate === 'dataSource') {
      context.dataSource = marker.value || marker.dataSource || null;
      // Chọn lại nguồn người nhận = làm lại từ đầu (backend cũng reset ở marker dataSource).
      context.landingLeadsSlugs = [];
      context.landingLeadsAll = false;
      context.formId = null;
      if (marker.sheetUrl) {
        context.sheetUrl = marker.sheetUrl;
      }
      if (Array.isArray(marker.friendUids)) {
        context.zaloFriendIds = marker.friendUids;
      }
    } else if (marker.gate === 'landingLeads') {
      // `all: true` = "Tất cả landing" TƯỜNG MINH; marker rỗng không bao giờ được hiểu là "tất cả".
      context.landingLeadsAll = marker.all === true;
      context.landingLeadsSlugs = context.landingLeadsAll ? [] : normalizeLandingSlugList(marker.slugs);
    } else if (marker.gate === 'formId') {
      context.formId = normalizeFormId(marker.formId ?? marker.value);
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
  landingLeadsSlugs: derived.landingLeadsSlugs?.length
    ? derived.landingLeadsSlugs
    : normalizeLandingSlugList(gates.landingLeadsSlugs),
  landingLeadsAll: Boolean(derived.landingLeadsAll || gates.landingLeadsAll),
  formId: normalizeFormId(derived.formId) ?? normalizeFormId(gates.formId),
  schedule: derived.schedule ?? gates.schedule ?? null,
  planApproved: Boolean(derived.planApproved || gates.planApproved),
});

// ---------------------------------------------------------------------------
// PR-C2 (C-NO-GOC1) — trạng thái wizard lấy từ SERVER thay vì suy lại từ lịch sử.
// Backend (PR-C1) trả `wizardState` (v:1, gates đã gộp, plan.status, meta) sau MỖI lượt /ai/chat và trong phản hồi PATCH.
// Có nó thì FE dựng `wizardContext` thẳng từ gates; thiếu (BE cũ chưa deploy, hoặc đường không ghi state) thì rơi về
// deriveWizardContext + mergeClientWizardContext như trước.
// TODO(C-NO-GOC1): xoá đường suy từ lịch sử (deriveWizardContext, mergeClientWizardContext, nhánh fallback của
// resolveWizardContext) khi đo được production không còn phản hồi /ai/chat thiếu `wizardState` (log shadow BE + nhật ký request).
// ---------------------------------------------------------------------------

/** Lấy { gates, updatedAt } từ phản hồi API khi hợp lệ (v === 1 và có gates), ngược lại null. */
export const extractServerWizardState = (wizardState) => {
  if (!wizardState || wizardState.v !== 1 || !wizardState.gates || typeof wizardState.gates !== 'object') return null;
  return { gates: wizardState.gates, updatedAt: typeof wizardState.meta?.updatedAt === 'string' ? wizardState.meta.updatedAt : null };
};

/**
 * Có nhận `wizardState` này không? null nếu thiếu/không hợp lệ HOẶC cũ hơn bản đã nhận (`lastStamp` = meta.updatedAt mới
 * nhất): phản hồi PATCH và phản hồi chat có thể về sai thứ tự, bản cũ đến muộn không được đè bản mới.
 */
export const acceptServerWizardState = (wizardState, lastStamp = null) => {
  const parsed = extractServerWizardState(wizardState);
  if (!parsed) return null;
  if (parsed.updatedAt && lastStamp && parsed.updatedAt < lastStamp) return null;
  return parsed;
};

export const countUserMessages = (messages = []) => (Array.isArray(messages) ? messages : [])
  .filter((message) => message?.role === 'user').length;

/** Dựng context từ gates server — cùng hình dạng với deriveWizardContext. */
export const contextFromServerGates = (gates = {}) => ({
  channel: gates.channel ?? null,
  senderAccountId: gates.senderAccountId ?? null,
  senderAccountName: gates.senderAccountName ?? null,
  dataSource: gates.dataSource ?? null,
  sheetUrl: gates.sheetUrl ?? null,
  zaloGroupIds: Array.isArray(gates.zaloGroupIds) ? gates.zaloGroupIds : [],
  zaloFriendIds: Array.isArray(gates.zaloFriendIds) ? gates.zaloFriendIds : [],
  landingLeadsSlugs: normalizeLandingSlugList(gates.landingLeadsSlugs),
  landingLeadsAll: gates.landingLeadsAll === true,
  formId: normalizeFormId(gates.formId),
  schedule: gates.schedule ?? null,
  planApproved: Boolean(gates.planApproved),
});

/**
 * wizardContext cho UI. `turnMark` = { gates, userCount } ghi lúc nhận phản hồi server. Còn đúng chừng nào chưa có tin
 * user mới (bấm nút/gõ thêm = thêm tin user → chờ phản hồi kế tiếp; trong lúc chờ dùng đường suy từ lịch sử như trước để
 * lựa chọn vừa bấm hiện ngay).
 */
export const resolveWizardContext = ({ messages = [], serverGates = null, turnMark = null }) => {
  if (turnMark?.gates && turnMark.userCount === countUserMessages(messages)) {
    return contextFromServerGates(turnMark.gates);
  }
  const derived = deriveWizardContext(messages);
  return serverGates ? mergeClientWizardContext(derived, serverGates) : derived;
};

export const applyWizardSelectionsToScript = (script, context = {}) => {
  if (!script) return script;
  const senderId = context.senderAccountId != null ? Number(context.senderAccountId) : null;
  const groupIds = Array.isArray(context.zaloGroupIds) ? context.zaloGroupIds : [];
  const sheetUrl = context.sheetUrl || '';
  if (!senderId && groupIds.length === 0 && !context.dataSource && !sheetUrl) return script;

  // Rà soát C P2-7 — nguồn landing chỉ được vá thành node lead landing theo lựa chọn người dùng ĐÃ làm ở cổng landingLeads. Trước đây
  // vá cứng `landingLeadsSlugs: []` = MỌI lead của MỌI landing → gửi nhầm người. Chưa có lựa chọn → KHÔNG vá và đánh dấu
  // `landingSelectionMissing` để nơi tạo chiến dịch từ chối (không để node khách DB lặng lẽ thay vào chỗ nguồn landing).
  const landingSlugs = normalizeLandingSlugList(context.landingLeadsSlugs);
  const landingAll = context.landingLeadsAll === true;
  let landingSelectionMissing = false;

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
          if (!landingAll && landingSlugs.length === 0) {
            landingSelectionMissing = true;
            return { ...node, config };
          }
          return {
            ...node,
            nodeSubtype: 'read_landing_leads',
            nodeName: 'Lead từ Landing Page',
            nodeDescription: 'Danh sách đăng ký từ Landing Page.',
            config: { landingLeadsSlugs: landingAll ? [] : landingSlugs },
          };
        }
        if (context.dataSource === 'form' && node.nodeSubtype === 'interested_customers') {
          return {
            ...node,
            nodeSubtype: 'read_form_submissions',
            nodeName: 'Dữ liệu Biểu mẫu',
            nodeDescription: 'Người đã nộp Biểu mẫu và đồng ý nhận tin.',
            config: { formId: normalizeFormId(context.formId) ?? '' },
          };
        }
        return { ...node, config };
      })
      : script.nodes,
  };

  if (context.dataSource && Array.isArray(next.nodes) && context.channel !== 'zalo_group') {
    next.wizardDataSource = context.dataSource;
  }
  if (landingSelectionMissing) next.landingSelectionMissing = true;
  // Dấu "đã chọn TƯỜNG MINH Tất cả landing" — thẻ xác nhận ở backend chỉ chấp nhận node lead landing slug rỗng khi có dấu này.
  if (context.dataSource === 'landing' && landingAll) next.landingLeadsAll = true;
  return next;
};
