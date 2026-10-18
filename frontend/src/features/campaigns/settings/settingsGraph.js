/**
 * Thao tác CẤU TRÚC thuần của tab Thiết lập (PLAN_THIET_LAP_CAU_HINH_TRUC_TIEP PR-B): dựng khung khối từ "Gửi cho ai?",
 * đổi nguồn người nhận, thêm / xoá bước phụ, nhận diện sơ đồ rẽ nhánh. KHÔNG React, KHÔNG gọi mạng.
 *
 * Mọi hàm nhận `{ nodes, edges }` hiện tại và trả đồ thị MỚI — nơi gọi đưa thẳng cho `handleSave({ nodes, edges })` của trang
 * (một đường lưu duy nhất, giống `applyNodeConfigToGraph`). Chuỗi khối và cấu hình khung khớp BỘ BIÊN DỊCH chung
 * `backend/src/services/ai/campaignCompiler.service.js` (tên subtype phía giao diện: `manual_trigger`, `read_interested_customers`).
 */
import { AUDIENCE_TYPES_BY_CHANNEL } from '../simple/simpleCampaign.helpers';
import { isTriggerNodeType } from '../utils/campaignBuilderFlow';
import { createBuilderNode } from '../utils/createBuilderNode';
import { getAllNodeConfigs } from '../components/CampaignBuilderFlowNodes';

const idOf = (value) => String(value ?? '');
const subtypeOf = (node) => String(node?.data?.nodeType || node?.type || '');

/** Nguồn người nhận (thẻ của trình từng bước) → khối đọc dữ liệu tương ứng. Các nguồn không có ở đây nằm TRONG khối gửi. */
export const AUDIENCE_SOURCE_SUBTYPE = Object.freeze({
  customers: 'read_interested_customers',
  landing: 'read_landing_leads',
  form: 'read_form_submissions',
  sheet: 'read_sheet',
  zalo_friends: 'get_all_friends',
  zalo_groups: 'get_all_groups',
});

/** Khối nguồn mà tab Thiết lập có nút "Đổi nguồn". */
export const SWAPPABLE_SOURCE_SUBTYPES = Object.freeze(Object.values(AUDIENCE_SOURCE_SUBTYPE));

/** Bước phụ thêm / xoá được ở tab Thiết lập (rẽ nhánh `condition` thuộc Sơ đồ khối). */
export const SIDE_STEP_SUBTYPES = Object.freeze(['tag_contact', 'update_attribute', 'save_customer']);

export const SEND_SUBTYPES = Object.freeze([
  'send_email',
  'send_zalo_personal',
  'send_zalo_friend_request',
  'send_zalo_group',
  'send_telegram',
  'send_whatsapp',
]);

/** Kênh của trình từng bước ứng với loại chiến dịch đã lưu (`zalo_group` / `telegram_group` là biến thể của kênh). */
export const resolveCampaignChannel = (campaignType) => {
  const type = String(campaignType || '').trim().toLowerCase();
  if (type === 'email') return 'email';
  if (type === 'zalo' || type === 'zalo_group' || type === 'zalo_personal') return 'zalo';
  if (type === 'telegram' || type === 'telegram_group') return 'telegram';
  if (type === 'whatsapp') return 'whatsapp';
  return null;
};

/** Các nguồn người nhận chọn được cho chiến dịch (rỗng = loại chiến dịch lạ, quay về Sơ đồ khối). */
export const getSkeletonAudienceTypes = (campaignType) => {
  const channel = resolveCampaignChannel(campaignType);
  return channel ? [...AUDIENCE_TYPES_BY_CHANNEL[channel]] : [];
};

/** Khối gửi của chuỗi (tương ứng kênh × nguồn). */
export const getSendSubtypeFor = (channel, audienceType) => {
  if (channel === 'email') return 'send_email';
  if (channel === 'telegram') return 'send_telegram';
  if (channel === 'whatsapp') return 'send_whatsapp';
  return audienceType === 'zalo_groups' ? 'send_zalo_group' : 'send_zalo_personal';
};

/**
 * Chuỗi subtype của khung, theo ĐÚNG thứ tự bộ biên dịch (campaignCompiler.service.js):
 * email: khởi chạy → [nguồn] → send_email · Zalo cá nhân: khởi chạy → select_zalo_account → [nguồn] → send_zalo_personal ·
 * Zalo nhóm: khởi chạy → select_zalo_account → get_all_groups → send_zalo_group · Telegram: khởi chạy → send_telegram ·
 * WhatsApp: khởi chạy → [nguồn đọc dữ liệu nếu có] → send_whatsapp.
 *
 * @returns {string[]}
 */
export const getSkeletonChain = (campaignType, audienceType) => {
  const channel = resolveCampaignChannel(campaignType);
  if (!channel || !AUDIENCE_TYPES_BY_CHANNEL[channel].includes(audienceType)) {
    throw new Error(`Nguồn "${audienceType}" không dùng được cho chiến dịch loại "${campaignType}"`);
  }
  const source = AUDIENCE_SOURCE_SUBTYPE[audienceType] || null;
  const send = getSendSubtypeFor(channel, audienceType);
  if (channel === 'zalo') return ['manual_trigger', 'select_zalo_account', ...(source ? [source] : []), send];
  if (channel === 'telegram') return ['manual_trigger', send];
  return ['manual_trigger', ...(source ? [source] : []), send];
};

/** Cột người nhận mặc định của khối gửi theo khối nguồn ('' = chưa biết, vd Google Sheet tự đặt tên cột → người dùng chọn). */
const defaultRecipientColumn = (sendSubtype, sourceSubtype) => {
  if (!sourceSubtype || sourceSubtype === 'read_sheet') return '';
  if (sendSubtype === 'send_email') return 'email';
  if (sourceSubtype === 'get_all_friends') return 'uid';
  return 'phone';
};

const emptyTemplateStep = (extra = {}) => ({
  templateId: null,
  message: '',
  delayValue: 0,
  delayUnit: 'days',
  templateMappings: [],
  ...extra,
});

/** Cấu hình khối nguồn (khớp compiler: `buildAdapterAudienceNode` / các nhánh email, Zalo). */
const buildSourceConfig = (sourceSubtype, { accountNodeId = '' } = {}) => {
  switch (sourceSubtype) {
    case 'read_sheet':
      return { sheetUrl: '', sheetName: '', headerRow: 1, dataStartRow: 2, dataSelectedColumns: [] };
    case 'read_interested_customers':
      return { interestedCustomerType: 'all' };
    case 'read_landing_leads':
      return { landingLeadsSlugs: [] };
    case 'read_form_submissions':
      return {};
    case 'get_all_friends':
      return { zaloFriendAccountNodeId: accountNodeId };
    case 'get_all_groups':
      return { zaloGroupAccountNodeId: accountNodeId };
    default:
      return {};
  }
};

/**
 * Phần cấu hình khối gửi trỏ tới khối nguồn: `sourceNodeId` + cột / loại người nhận. Dùng cho khung mới và cho "Đổi nguồn tại chỗ".
 * `sourceSubtype = null` → nguồn nằm trong khối gửi (nhập tay / người đã nhắn / nhóm) hoặc nhập tay.
 */
const buildRecipientConfig = (sendSubtype, sourceSubtype, sourceNodeId, audienceType) => {
  const column = defaultRecipientColumn(sendSubtype, sourceSubtype);
  switch (sendSubtype) {
    case 'send_email':
      return sourceSubtype
        ? { recipientSource: 'node', recipientNodeId: sourceNodeId, recipientField: column }
        : { recipientSource: 'manual', recipientNodeId: '', recipientField: 'email' };
    case 'send_zalo_personal':
      return sourceSubtype
        ? {
          zaloRecipientSource: 'node',
          zaloRecipientNodeId: sourceNodeId,
          zaloRecipientField: column,
          zaloRecipientType: sourceSubtype === 'get_all_friends' ? 'uid' : 'phone',
        }
        : { zaloRecipientSource: 'manual', zaloRecipientNodeId: '', zaloRecipientField: 'phone', zaloRecipientType: 'phone' };
    case 'send_zalo_group':
      return { zaloGroupSource: 'node', zaloGroupNodeId: sourceNodeId, zaloGroupField: 'groupId' };
    case 'send_whatsapp':
      if (sourceSubtype) return { recipientSource: 'node', recipientNodeId: sourceNodeId, recipientColumn: column };
      return audienceType === 'whatsapp_groups'
        ? { recipientSource: 'whatsapp_groups', recipientKeys: [] }
        : { recipientSource: 'whatsapp_conversations' };
    case 'send_telegram':
      return audienceType === 'telegram_groups'
        ? { recipientSource: 'telegram_groups', recipientKeys: [] }
        : { recipientSource: 'telegram_conversations' };
    default:
      return {};
  }
};

/**
 * Tài khoản gửi đã chọn → trường ĐÚNG mà bộ biên dịch / form dùng, theo khối nhận nó:
 * email `fromEmailId` (khối gửi) · Zalo `zaloAccountId` (khối `select_zalo_account`, cá nhân lẫn nhóm — khối gửi Zalo KHÔNG cần: runtime lấy
 * tài khoản từ khối chọn phía trên, `campaignZaloAccountResolve.util.js`) · Telegram `telegramAccountId` · WhatsApp `whatsappSessionKey` (chuỗi).
 * Không có `sender` → `{}` (email trống = tài khoản mặc định; kênh khác để trống, thẻ báo thiếu).
 */
const buildSenderConfig = (subtype, sender) => {
  const id = sender?.id;
  if (id === null || id === undefined || String(id).trim() === '') return {};
  switch (subtype) {
    case 'send_email':
      return Number.isFinite(Number(id)) ? { fromEmailId: Number(id) } : {};
    case 'select_zalo_account':
      return Number.isFinite(Number(id)) ? { zaloAccountId: Number(id) } : {};
    case 'send_telegram':
      return Number.isFinite(Number(id)) ? { telegramAccountId: Number(id) } : {};
    case 'send_whatsapp':
      return { whatsappSessionKey: String(id).trim() };
    default:
      return {};
  }
};

const buildSendConfig = (sendSubtype, sourceSubtype, sourceNodeId, audienceType, sender = null) => {
  const recipient = { ...buildRecipientConfig(sendSubtype, sourceSubtype, sourceNodeId, audienceType), ...buildSenderConfig(sendSubtype, sender) };
  switch (sendSubtype) {
    case 'send_email':
      return {
        ...recipient,
        ccEnabled: false,
        saveMessageLog: true,
        sendMode: 'all',
        emailSteps: [emptyTemplateStep({ emailSubject: '', emailBody: '', delayFrom: 'start', enableLinkTracking: true })],
      };
    case 'send_zalo_personal':
      return {
        ...recipient,
        zaloPersonalSendMode: 'all',
        saveMessageLog: true,
        zaloPersonalTemplateSteps: [emptyTemplateStep({ enableLinkTracking: true })],
      };
    case 'send_zalo_group':
      return {
        ...recipient,
        saveMessageLog: true,
        zaloGroupSendMode: 'all',
        zaloGroupTemplateSteps: [emptyTemplateStep()],
      };
    case 'send_whatsapp':
    case 'send_telegram':
      return { ...recipient, steps: [{ templateId: null, message: '' }] };
    default:
      return recipient;
  }
};

/** Cạnh nối hai khối (cùng hình dạng cạnh `onConnect` của trình dựng: kiểu `custom`). */
export const makeEdge = (source, target) => ({ id: `edge-${idOf(source)}-${idOf(target)}`, source: idOf(source), target: idOf(target), type: 'custom' });

const NODE_X0 = 100;
const NODE_DX = 280;
const NODE_Y = 200;

/**
 * Khung khối cho chiến dịch trống: sinh khối + cạnh theo đúng chuỗi của bộ biên dịch (`getSkeletonChain`), mỗi khối dựng bằng
 * `createBuilderNode` (cùng hàm với thả khối ở Sơ đồ khối). Vị trí xếp trái → phải đều nhau.
 *
 * @param {object} params
 * @param {string} params.campaignType loại chiến dịch (email | zalo | zalo_group | telegram | whatsapp…)
 * @param {string} params.audienceType một phần tử của `AUDIENCE_TYPES_BY_CHANNEL[kênh]`
 * @param {string} [params.locale='vi']
 * @param {Array<string>} [params.existingNames] tên khối đã có (khung dựng lại từ đầu thì để rỗng)
 * @param {{ id: number|string, label?: string }|null} [params.sender] tài khoản gửi đã chọn trước (PR-C) — điền sẵn vào khối nhận nó (`buildSenderConfig`)
 * @param {Array<object>} [params.registry] bảng khối (mặc định `getAllNodeConfigs()`)
 * @returns {{ nodes: Array<object>, edges: Array<object>, sendNodeId: string, sourceNodeId: string|null }}
 */
export const buildSettingsSkeleton = ({ campaignType, audienceType, locale = 'vi', existingNames = [], sender = null, registry = getAllNodeConfigs() }) => {
  const chain = getSkeletonChain(campaignType, audienceType);
  const sendSubtype = chain[chain.length - 1];
  const sourceSubtype = AUDIENCE_SOURCE_SUBTYPE[audienceType] || null;
  const names = [...existingNames];

  const stamp = Date.now();
  const ids = chain.map((subtype, index) => `${subtype}-${stamp}-${index}`);
  const idBySubtype = new Map(chain.map((subtype, index) => [subtype, ids[index]]));
  const accountNodeId = idBySubtype.get('select_zalo_account') || '';
  const sourceNodeId = sourceSubtype ? idBySubtype.get(sourceSubtype) : null;

  const nodes = chain.map((subtype, index) => {
    let config;
    if (subtype === sendSubtype) config = buildSendConfig(sendSubtype, sourceSubtype, sourceNodeId, audienceType, sender);
    else if (subtype === sourceSubtype) config = buildSourceConfig(subtype, { accountNodeId });
    else if (subtype === 'select_zalo_account') config = { zaloAccountId: '', zaloPoolMultiAccountEnabled: false, ...buildSenderConfig('select_zalo_account', sender) };
    else config = {};
    const node = createBuilderNode(subtype, { x: NODE_X0 + index * NODE_DX, y: NODE_Y }, {
      locale,
      registry,
      existingNames: names,
      id: ids[index],
      config: Object.keys(config).length > 0 ? config : undefined,
    });
    names.push(node.data.label);
    return node;
  });
  const edges = ids.slice(0, -1).map((id, index) => makeEdge(id, ids[index + 1]));
  return { nodes, edges, sendNodeId: ids[ids.length - 1], sourceNodeId };
};

// ── Phân tích đồ thị ──────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * @returns {{
 *   branched: boolean,            // có khối >1 cạnh ra / >1 cạnh vào, hoặc có khối `condition`
 *   chain: string[],              // id các khối thẳng hàng từ khối khởi chạy (rỗng khi rẽ nhánh / không có đúng một khối khởi chạy)
 *   lockedIds: Set<string>,       // khối "dính nhánh": tự rẽ, hoặc nằm cạnh khối rẽ, hoặc không nằm trong chuỗi thẳng
 *   inDegree: Map<string, number>,
 *   outDegree: Map<string, number>,
 * }}
 */
export const analyzeSettingsGraph = (nodes, edges) => {
  const nodeList = Array.isArray(nodes) ? nodes : [];
  const byId = new Map(nodeList.map((node) => [idOf(node.id), node]));
  const edgeList = (Array.isArray(edges) ? edges : []).filter((edge) => byId.has(idOf(edge.source)) && byId.has(idOf(edge.target)));
  const inDegree = new Map();
  const outDegree = new Map();
  const next = new Map();
  const prev = new Map();
  edgeList.forEach((edge) => {
    const source = idOf(edge.source);
    const target = idOf(edge.target);
    outDegree.set(source, (outDegree.get(source) || 0) + 1);
    inDegree.set(target, (inDegree.get(target) || 0) + 1);
    if (!next.has(source)) next.set(source, []);
    next.get(source).push(target);
    if (!prev.has(target)) prev.set(target, []);
    prev.get(target).push(source);
  });

  const isCondition = (id) => subtypeOf(byId.get(id)) === 'condition';
  const isForkOrJoin = (id) => (outDegree.get(id) || 0) > 1 || (inDegree.get(id) || 0) > 1 || isCondition(id);
  const branched = nodeList.some((node) => isForkOrJoin(idOf(node.id)));

  const triggers = nodeList.filter((node) => isTriggerNodeType(subtypeOf(node)));
  const chain = [];
  if (!branched && triggers.length === 1) {
    const seen = new Set();
    let current = idOf(triggers[0].id);
    while (current && !seen.has(current)) {
      seen.add(current);
      chain.push(current);
      current = (next.get(current) || [])[0];
    }
  }
  const inChain = new Set(chain);

  const lockedIds = new Set();
  nodeList.forEach((node) => {
    const id = idOf(node.id);
    const neighbours = [...(next.get(id) || []), ...(prev.get(id) || [])];
    if (isForkOrJoin(id) || neighbours.some(isForkOrJoin) || !inChain.has(id)) lockedIds.add(id);
  });

  return { branched, chain, lockedIds, inDegree, outDegree };
};

/** Khối gửi + khối nguồn của chuỗi thẳng (đầu tiên mỗi loại). */
export const findChainRoles = (nodes, chain) => {
  const byId = new Map((Array.isArray(nodes) ? nodes : []).map((node) => [idOf(node.id), node]));
  const chainNodes = chain.map((id) => byId.get(id)).filter(Boolean);
  return {
    sendNode: chainNodes.find((node) => SEND_SUBTYPES.includes(subtypeOf(node))) || null,
    sourceNode: chainNodes.find((node) => SWAPPABLE_SOURCE_SUBTYPES.includes(subtypeOf(node))) || null,
    accountNode: chainNodes.find((node) => subtypeOf(node) === 'select_zalo_account') || null,
  };
};

// ── Tham chiếu giữa các khối ──────────────────────────────────────────────────────────────────────────────────────────

const REFERENCE_KEY = /nodeid$/i;

/**
 * Đổi mọi tham chiếu tới id khối trong cấu hình một khối: khoá kết thúc bằng `NodeId` (`recipientNodeId`, `zaloRecipientNodeId`,
 * `zaloGroupNodeId`, `saveCustomerNodeId`, `tagSourceNodeId`…) và `nodeId` trong `templateMappings` của mọi bước. Duyệt sâu theo
 * khoá thay vì liệt kê tay từng trường (backend `normalizeNodeReferenceConfig` cũng đang liệt kê tay và dễ sót khi thêm khối).
 *
 * @param {*} value cấu hình (hoặc một phần của nó)
 * @param {Map<string, string>} idMap id cũ → id mới ('' = xoá tham chiếu để hiện ⚠)
 * @returns {*} giá trị mới; GIỮ NGUYÊN tham chiếu khi không có gì đổi
 */
export const remapNodeReferences = (value, idMap) => {
  if (Array.isArray(value)) {
    let changed = false;
    const mapped = value.map((item) => {
      const next = remapNodeReferences(item, idMap);
      if (next !== item) changed = true;
      return next;
    });
    return changed ? mapped : value;
  }
  if (value && typeof value === 'object') {
    let changed = false;
    const mapped = {};
    Object.entries(value).forEach(([key, item]) => {
      let next = item;
      if (REFERENCE_KEY.test(key) && typeof item === 'string' && idMap.has(item)) next = idMap.get(item);
      else if (REFERENCE_KEY.test(key) && typeof item === 'number' && idMap.has(String(item))) next = idMap.get(String(item));
      else if (item && typeof item === 'object') next = remapNodeReferences(item, idMap);
      if (next !== item) changed = true;
      mapped[key] = next;
    });
    return changed ? mapped : value;
  }
  return value;
};

const remapAllNodes = (nodes, idMap) => nodes.map((node) => {
  const config = node?.data?.config;
  if (!config) return node;
  const next = remapNodeReferences(config, idMap);
  return next === config ? node : { ...node, data: { ...node.data, config: next } };
});

// ── Thêm / xoá / thay khối ────────────────────────────────────────────────────────────────────────────────────────────

/** Khối cuối của chuỗi thẳng mà bước phụ nối vào sau (trước khối `end` nếu có). `null` = không thêm được. */
export const findAppendAnchor = (nodes, edges) => {
  const analysis = analyzeSettingsGraph(nodes, edges);
  if (analysis.branched || analysis.chain.length < 2) return null;
  const byId = new Map(nodes.map((node) => [idOf(node.id), node]));
  const chain = analysis.chain;
  const last = chain[chain.length - 1];
  if (subtypeOf(byId.get(last)) === 'end') return chain.length >= 3 ? chain[chain.length - 2] : null;
  return last;
};

/**
 * Cấu hình ban đầu của bước phụ: nguồn danh bạ = khối nguồn của chuỗi (nếu có) để thẻ không thiếu chỗ "Danh bạ" ngay từ đầu.
 */
const buildSideStepConfig = (subtype, sourceNodeId) => {
  if (!sourceNodeId) return {};
  if (subtype === 'tag_contact') return { tagSourceNodeId: sourceNodeId };
  if (subtype === 'update_attribute') return { attributeSourceNodeId: sourceNodeId };
  if (subtype === 'save_customer') return { saveCustomerNodeId: sourceNodeId };
  return {};
};

/**
 * Chèn bước phụ vào CUỐI chuỗi thẳng.
 * @returns {{ nodes: Array<object>, edges: Array<object>, newNodeId: string }|null} null khi sơ đồ rẽ nhánh / không có chỗ chèn
 */
export const appendSideStep = ({ nodes, edges, subtype, locale = 'vi', registry = getAllNodeConfigs() }) => {
  if (!SIDE_STEP_SUBTYPES.includes(subtype)) return null;
  const anchorId = findAppendAnchor(nodes, edges);
  if (!anchorId) return null;
  const analysis = analyzeSettingsGraph(nodes, edges);
  const { sourceNode } = findChainRoles(nodes, analysis.chain);
  const anchor = nodes.find((node) => idOf(node.id) === anchorId);
  const config = buildSideStepConfig(subtype, sourceNode ? idOf(sourceNode.id) : '');
  const newNode = createBuilderNode(subtype, { x: (anchor?.position?.x ?? 0) + NODE_DX, y: anchor?.position?.y ?? NODE_Y }, {
    locale,
    registry,
    existingNames: nodes.map((node) => node.data?.label).filter(Boolean),
    config: Object.keys(config).length > 0 ? config : undefined,
  });
  const oldOut = edges.find((edge) => idOf(edge.source) === anchorId);
  const nextEdges = oldOut ? edges.filter((edge) => edge !== oldOut) : [...edges];
  nextEdges.push(makeEdge(anchorId, newNode.id));
  if (oldOut) nextEdges.push(makeEdge(newNode.id, oldOut.target));
  return { nodes: [...nodes, newNode], edges: nextEdges, newNodeId: newNode.id };
};

/** Bước phụ này xoá được ở tab Thiết lập không: đúng loại, thẳng hàng, không dính nhánh. */
export const canRemoveSideStep = (nodes, edges, nodeId) => {
  const node = nodes.find((item) => idOf(item.id) === idOf(nodeId));
  if (!node || !SIDE_STEP_SUBTYPES.includes(subtypeOf(node))) return false;
  const analysis = analyzeSettingsGraph(nodes, edges);
  return !analysis.lockedIds.has(idOf(nodeId)) && analysis.chain.includes(idOf(nodeId));
};

/**
 * Xoá một bước phụ thẳng hàng: nối khối trước với khối sau, gỡ cạnh của nó, xoá tham chiếu tới nó ở các khối còn lại.
 * @returns {{ nodes: Array<object>, edges: Array<object> }|null}
 */
export const removeSideStep = ({ nodes, edges, nodeId }) => {
  if (!canRemoveSideStep(nodes, edges, nodeId)) return null;
  const id = idOf(nodeId);
  const incoming = edges.find((edge) => idOf(edge.target) === id);
  const outgoing = edges.find((edge) => idOf(edge.source) === id);
  const nextEdges = edges.filter((edge) => idOf(edge.source) !== id && idOf(edge.target) !== id);
  if (incoming && outgoing) nextEdges.push(makeEdge(incoming.source, outgoing.target));
  const remaining = nodes.filter((node) => idOf(node.id) !== id);
  return { nodes: remapAllNodes(remaining, new Map([[id, '']])), edges: nextEdges };
};

/**
 * Cách đổi sang nguồn khác: `in_place` = chỉ thay khối nguồn (khung còn lại giữ nguyên) · `rebuild` = dựng lại cả khung (khác khối
 * gửi / khác có-không khối nguồn) · `null` = không đổi được ở đây (rẽ nhánh / khối dính nhánh / loại chiến dịch lạ).
 */
export const classifyAudienceChange = ({ nodes, edges, campaignType, audienceType }) => {
  const analysis = analyzeSettingsGraph(nodes, edges);
  if (analysis.branched || analysis.chain.length === 0) return null;
  let target;
  try {
    target = getSkeletonChain(campaignType, audienceType);
  } catch {
    return null;
  }
  const byId = new Map(nodes.map((node) => [idOf(node.id), node]));
  const current = analysis.chain.map((id) => subtypeOf(byId.get(id)));
  // Chuỗi hiện tại có thể đã có bước phụ phía sau khối gửi: so phần đầu tới khối gửi.
  const sendIndex = current.findIndex((subtype) => SEND_SUBTYPES.includes(subtype));
  if (sendIndex < 0) return 'rebuild';
  const head = current.slice(0, sendIndex + 1);
  if (head.length !== target.length) return 'rebuild';
  const diff = head.map((subtype, index) => (subtype === target[index] ? -1 : index)).filter((index) => index >= 0);
  if (diff.length === 0) return 'in_place';
  const swappable = diff.length === 1
    && SWAPPABLE_SOURCE_SUBTYPES.includes(head[diff[0]])
    && SWAPPABLE_SOURCE_SUBTYPES.includes(target[diff[0]])
    && diff[0] < head.length - 1;
  return swappable ? 'in_place' : 'rebuild';
};

/**
 * Đổi nguồn TẠI CHỖ: thay khối nguồn bằng khối mới (`createBuilderNode`, cùng vị trí, nối lại cạnh vào / ra), mọi tham chiếu tới id
 * cũ ở các khối sau trỏ sang id mới, và khối gửi đặt lại cột / loại người nhận cho hợp nguồn mới.
 * @returns {{ nodes: Array<object>, edges: Array<object>, newNodeId: string }|null}
 */
export const replaceAudienceSource = ({ nodes, edges, campaignType, audienceType, locale = 'vi', registry = getAllNodeConfigs() }) => {
  if (classifyAudienceChange({ nodes, edges, campaignType, audienceType }) !== 'in_place') return null;
  const analysis = analyzeSettingsGraph(nodes, edges);
  const { sourceNode, sendNode, accountNode } = findChainRoles(nodes, analysis.chain);
  const newSubtype = AUDIENCE_SOURCE_SUBTYPE[audienceType];
  if (!sourceNode || !sendNode || !newSubtype) return null;
  if (subtypeOf(sourceNode) === newSubtype) return null;
  const oldId = idOf(sourceNode.id);
  const config = buildSourceConfig(newSubtype, { accountNodeId: accountNode ? idOf(accountNode.id) : '' });
  const newNode = createBuilderNode(newSubtype, sourceNode.position, {
    locale,
    registry,
    existingNames: nodes.filter((node) => idOf(node.id) !== oldId).map((node) => node.data?.label).filter(Boolean),
    config: Object.keys(config).length > 0 ? config : undefined,
  });
  const idMap = new Map([[oldId, newNode.id]]);
  const sendSubtype = subtypeOf(sendNode);
  const recipientPatch = buildRecipientConfig(sendSubtype, newSubtype, newNode.id, audienceType);
  const swapped = nodes.map((node) => {
    if (idOf(node.id) === oldId) return newNode;
    if (idOf(node.id) === idOf(sendNode.id)) {
      return { ...node, data: { ...node.data, config: { ...(node.data?.config || {}), ...recipientPatch } } };
    }
    return node;
  });
  const nextNodes = remapAllNodes(swapped, idMap);
  const nextEdges = edges.map((edge) => ({
    ...edge,
    source: idOf(edge.source) === oldId ? newNode.id : edge.source,
    target: idOf(edge.target) === oldId ? newNode.id : edge.target,
    id: edge.id && (idOf(edge.source) === oldId || idOf(edge.target) === oldId)
      ? `edge-${idOf(edge.source) === oldId ? newNode.id : edge.source}-${idOf(edge.target) === oldId ? newNode.id : edge.target}`
      : edge.id,
  }));
  return { nodes: nextNodes, edges: nextEdges, newNodeId: newNode.id };
};

export default buildSettingsSkeleton;
