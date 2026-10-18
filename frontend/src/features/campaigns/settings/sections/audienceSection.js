/**
 * Mục "Gửi cho ai" của tab Thiết lập (PLAN_THIET_LAP_BIEU_MAU_RIENG PR-E1): đọc / ghi nguồn người nhận THEO TRẠNG THÁI CỦA CÁC PANEL
 * của trình từng bước (`features/campaigns/simple/audience/*Panel.jsx`, dạng `EMPTY_AUDIENCE`), không nhúng form khối.
 *
 * Bảng trường thật (đối chiếu `campaignCompiler.service.js` + `createNodeConfigFormData`; nguồn nằm ở khối đọc dữ liệu hay trong khối gửi):
 *  - email · nhập tay        → send_email.recipientEmails (chuỗi, mỗi dòng một email), recipientSource 'manual'
 *  - Zalo cá nhân · nhập tay → send_zalo_personal.zaloRecipientPhones (chuỗi), zaloRecipientType 'phone'
 *  - khách đã lưu            → read_interested_customers (chỉ khi 'all' trọn bộ; có lọc theo loại / khoá học / chọn tay → KHÔNG sửa ở đây)
 *  - landing                 → read_landing_leads.landingLeadsSlugs (không khoảng ngày / nghề / sở thích / lọc riêng)
 *  - biểu mẫu                → read_form_submissions.formIds
 *  - Google Sheet            → read_sheet.sheetUrl + sheetName; cột người nhận của khối gửi mặc định (email | phone), cột khác → KHÔNG sửa
 *  - bạn bè Zalo             → get_all_friends.zaloSelectedFriendIds với zaloFriendSelectionMode 'fixed' ('all' / 'all_exclude' → KHÔNG sửa)
 *  - nhóm Zalo               → get_all_groups.zaloSelectedGroupIds (+ khoá danh sách); nhóm nhập tay trong khối gửi → KHÔNG sửa
 *  - Telegram / WhatsApp     → send_*.recipientSource ('*_conversations' | '*_groups' + recipientKeys [{recipientKey, display}]);
 *                              WhatsApp còn nguồn đọc dữ liệu (recipientNodeId + recipientColumn); chat id / số nhập tay → KHÔNG sửa
 * Mục không hiểu cấu hình đang có → `editable: false`, tóm tắt bằng chữ thường, KHÔNG đoán, KHÔNG ghi.
 */
import {
  AUDIENCE_TYPES_BY_CHANNEL,
  EMPTY_AUDIENCE,
  isStepComplete,
  parseManualRecipients,
} from '../../simple/simpleCampaign.helpers';
import { getFormIdsFromConfig } from '../../utils/readFormSubmissionsFormIds';
import describeNodeSettings from '../describeNodeSettings';
import {
  AUDIENCE_SOURCE_SUBTYPE,
  SEND_SUBTYPES,
  analyzeSettingsGraph,
  buildSettingsSkeleton,
  defaultRecipientColumn,
  findChainRoles,
  reshapeAudienceSource,
  resolveCampaignChannel,
} from '../settingsGraph';
import { configOf, idOf, list, sameValue, setConfigFields, subtypeOf, text } from './sectionUtils';

const TYPE_BY_SOURCE_SUBTYPE = Object.freeze(Object.fromEntries(Object.entries(AUDIENCE_SOURCE_SUBTYPE).map(([type, subtype]) => [subtype, type])));

/** Tên trường người nhận của từng khối gửi. */
const RECIPIENT_FIELDS = Object.freeze({
  send_email: { source: 'recipientSource', node: 'recipientNodeId', column: 'recipientField', list: 'recipientEmails' },
  send_zalo_personal: { source: 'zaloRecipientSource', node: 'zaloRecipientNodeId', column: 'zaloRecipientField', list: 'zaloRecipientPhones' },
  send_zalo_group: { source: 'zaloGroupSource', node: 'zaloGroupNodeId', column: 'zaloGroupField' },
  send_whatsapp: { source: 'recipientSource', node: 'recipientNodeId', column: 'recipientColumn' },
  send_telegram: { source: 'recipientSource' },
});

/** Kênh của trình từng bước theo KHỐI GỬI (không tin `campaignType`: loại chiến dịch lạ vẫn đọc được từ khối gửi). */
const CHANNEL_BY_SEND = Object.freeze({
  send_email: 'email',
  send_zalo_personal: 'zalo',
  send_zalo_group: 'zalo',
  send_telegram: 'telegram',
  send_whatsapp: 'whatsapp',
});

const lower = (value) => text(value).toLowerCase();

/**
 * Tìm khối gửi / khối nguồn của chuỗi thẳng.
 * @returns {{ state: 'empty' }
 *   | { state: 'unsupported', reason: string, sendNode?: object }
 *   | { state: 'ok', channel: string, sendNode: object, sourceNode: object|null, accountNode: object|null }}
 */
export const locateAudience = (nodes, edges) => {
  const nodeList = list(nodes);
  const sends = nodeList.filter((node) => SEND_SUBTYPES.includes(subtypeOf(node)));
  if (sends.length === 0) return { state: 'empty' };
  const analysis = analyzeSettingsGraph(nodes, edges);
  if (analysis.branched) return { state: 'unsupported', reason: 'branched', sendNode: sends[0] };
  if (sends.length > 1) return { state: 'unsupported', reason: 'multiSend', sendNode: sends[0] };
  const roles = findChainRoles(nodes, analysis.chain);
  if (!roles.sendNode) return { state: 'unsupported', reason: 'detached', sendNode: sends[0] };
  const channel = CHANNEL_BY_SEND[subtypeOf(roles.sendNode)];
  if (!channel) return { state: 'unsupported', reason: 'friendRequest', sendNode: roles.sendNode };
  return { state: 'ok', channel, sendNode: roles.sendNode, sourceNode: roles.sourceNode, accountNode: roles.accountNode };
};

// ── Nhận dạng nguồn đang cấu hình ─────────────────────────────────────────────────────────────────────────────────────

/** Cột người nhận chấp nhận được = trống (khung mới) hoặc đúng cột mặc định; cột khác nghĩa là người dùng chọn riêng → không sửa. */
const isDefaultColumn = (column, sendSubtype, type, sourceSubtype) => {
  const value = lower(column);
  if (value === '') return true;
  if (sendSubtype === 'send_zalo_group') return value === 'groupid';
  if (type === 'sheet') return value === (sendSubtype === 'send_email' ? 'email' : 'phone');
  return value === lower(defaultRecipientColumn(sendSubtype, sourceSubtype));
};

/** Khối nguồn của loại này còn đúng mặc định của panel (không lọc riêng) không. Trả mã lý do nếu không. */
const sourceCustomization = (type, config) => {
  switch (type) {
    case 'customers': {
      const mode = lower(config.interestedSelectionMode);
      const filtered = lower(config.interestedCustomerType) !== 'all'
        || (mode !== '' && mode !== 'all')
        || list(config.interestedSelectedCustomerIds).length > 0
        || list(config.interestedExcludedCustomerIds).length > 0
        || list(config.interestedCourseIds).length > 0
        || list(config.interestedCourseStatuses).length > 0
        || text(config.interestedCourseQuery) !== '';
      return filtered ? 'filtered' : null;
    }
    case 'landing':
      return config.landingLeadsUseDateRange
        || list(config.landingLeadsOccupations).length > 0
        || list(config.landingLeadsInterests).length > 0
        || list(config.landingLeadsCustomFilters).length > 0
        ? 'filtered' : null;
    case 'zalo_friends':
      return lower(config.zaloFriendSelectionMode) === 'fixed' ? null : 'filtered';
    default:
      return null;
  }
};

/**
 * Nguồn người nhận hiện tại của chuỗi.
 * @returns {{ type: string|null, editable: boolean, reason: string|null }} `type` null = chưa chọn nguồn (đang trống, sửa được)
 */
const detectType = (located) => {
  const { channel, sendNode, sourceNode } = located;
  const sendSubtype = subtypeOf(sendNode);
  const config = configOf(sendNode);
  const fields = RECIPIENT_FIELDS[sendSubtype];
  const source = lower(config[fields.source]);

  const fromNode = (refId) => {
    if (!sourceNode || idOf(sourceNode.id) !== text(refId)) return { type: null, editable: false, reason: 'sourceMismatch' };
    const sourceSubtype = subtypeOf(sourceNode);
    const type = TYPE_BY_SOURCE_SUBTYPE[sourceSubtype];
    if (!type || !AUDIENCE_TYPES_BY_CHANNEL[channel].includes(type)) return { type: null, editable: false, reason: 'sourceKind' };
    if ((type === 'zalo_groups') !== (sendSubtype === 'send_zalo_group')) return { type, editable: false, reason: 'custom' };
    if (sendSubtype === 'send_zalo_group') {
      return isDefaultColumn(config[fields.column], sendSubtype, 'groups', sourceSubtype)
        ? { type, editable: true, reason: null } : { type, editable: false, reason: 'custom' };
    }
    if (sendSubtype === 'send_zalo_personal' && type === 'zalo_friends' && lower(config.zaloRecipientType) !== 'uid') {
      return { type, editable: false, reason: 'custom' };
    }
    if (!isDefaultColumn(config[fields.column], sendSubtype, type, sourceSubtype)) return { type, editable: false, reason: 'column' };
    const customization = sourceCustomization(type, configOf(sourceNode));
    return customization ? { type, editable: false, reason: customization } : { type, editable: true, reason: null };
  };

  switch (sendSubtype) {
    case 'send_email':
      if (source === 'manual') return { type: 'manual', editable: true, reason: null };
      if (source === 'node') return fromNode(config.recipientNodeId);
      return { type: null, editable: source === '', reason: source === '' ? null : 'recipientSource' };
    case 'send_zalo_personal': {
      const effective = source || 'manual';
      if (effective === 'manual') {
        return lower(config.zaloRecipientType) === 'uid'
          ? { type: 'manual', editable: false, reason: 'uidList' }
          : { type: 'manual', editable: true, reason: null };
      }
      if (effective === 'node') return fromNode(config.zaloRecipientNodeId);
      return { type: null, editable: false, reason: 'recipientSource' };
    }
    case 'send_zalo_group':
      if ((source || 'manual') === 'node') return fromNode(config.zaloGroupNodeId);
      return { type: null, editable: false, reason: 'groupListManual' };
    case 'send_telegram':
      if (source === 'telegram_conversations' || source === '') return { type: 'conversations', editable: true, reason: null };
      if (source === 'telegram_groups') return { type: 'telegram_groups', editable: true, reason: null };
      return { type: null, editable: false, reason: 'recipientSource' };
    case 'send_whatsapp':
      if (source === 'whatsapp_conversations' || source === '') return { type: 'conversations', editable: true, reason: null };
      if (source === 'whatsapp_groups') return { type: 'whatsapp_groups', editable: true, reason: null };
      if (source === 'node') return fromNode(config.recipientNodeId);
      return { type: null, editable: false, reason: 'recipientSource' };
    default:
      return { type: null, editable: false, reason: 'unknown' };
  }
};

// ── Đọc ───────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Trạng thái panel (dạng `EMPTY_AUDIENCE`) từ cấu hình đang lưu. */
const extractAudience = (type, located) => {
  const { sendNode, sourceNode } = located;
  const sendConfig = configOf(sendNode);
  const sourceConfig = configOf(sourceNode);
  const sendSubtype = subtypeOf(sendNode);
  const audience = { ...EMPTY_AUDIENCE, type };
  switch (type) {
    case 'manual': {
      const raw = sendConfig[RECIPIENT_FIELDS[sendSubtype].list];
      audience.manualText = Array.isArray(raw) ? raw.join('\n') : String(raw ?? '');
      break;
    }
    case 'sheet':
      audience.sheetUrl = text(sourceConfig.sheetUrl);
      audience.sheetName = text(sourceConfig.sheetName);
      audience.sheetCheckedUrl = audience.sheetUrl; // đã lưu từ trước: coi như đã kiểm tra, đổi link thì panel bắt kiểm lại
      break;
    case 'landing':
      audience.slugs = list(sourceConfig.landingLeadsSlugs).map(text).filter(Boolean);
      audience.landingTitles = [...audience.slugs];
      break;
    case 'form':
      audience.formIds = getFormIdsFromConfig(sourceConfig);
      audience.formTitles = audience.formIds.map((id) => `#${id}`);
      break;
    case 'zalo_friends':
      audience.uids = list(sourceConfig.zaloSelectedFriendIds).map(text).filter(Boolean);
      break;
    case 'zalo_groups':
      audience.groupIds = list(sourceConfig.zaloSelectedGroupIds).map(text).filter(Boolean);
      audience.groupNames = audience.groupIds.map(() => '');
      break;
    case 'telegram_groups':
    case 'whatsapp_groups':
      audience.groups = list(sendConfig.recipientKeys)
        .filter((item) => item && typeof item === 'object' && text(item.recipientKey))
        .map((item) => ({ recipientKey: text(item.recipientKey), display: text(item.display) || text(item.recipientKey) }));
      break;
    default:
      break;
  }
  return audience;
};

const excerpt = (value, max = 56) => {
  const clean = text(value).replace(/\s+/g, ' ');
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
};

const joinShown = (names, max = 2) => {
  const clean = names.map(text).filter(Boolean);
  const rest = clean.length - max;
  return rest > 0 ? `${clean.slice(0, max).join(', ')} +${rest}` : clean.join(', ');
};

const titleOf = (type, t) => t(`simpleCampaign.audience.types.${type}.title`);

/** Tóm tắt khi đã chọn nguồn và đủ dữ liệu. */
const summarize = (type, audience, ctx, { filtered = false, column = '' } = {}) => {
  const { t } = ctx;
  const title = titleOf(type, t);
  switch (type) {
    case 'manual':
      return t(ctx.channel === 'email' ? 'campaignSettings.manualEmails' : 'campaignSettings.manualPhones', {
        n: parseManualRecipients(audience.manualText, ctx.channel === 'email' ? 'email' : 'phone').valid.length,
      });
    case 'landing':
      return `${title}: ${audience.slugs.length > 0 ? joinShown(audience.slugs) : t('campaignSettings.landingAll')}${filtered ? ` (${t('campaignSettings.section.audience.filtered')})` : ''}`;
    case 'form':
      return `${title}: ${t('campaignSettings.section.audience.formsCount', { n: audience.formIds.length })}`;
    case 'sheet': {
      const tab = audience.sheetName ? ` · ${audience.sheetName}` : '';
      const col = column ? ` · ${t('campaignSettings.section.audience.column', { column })}` : '';
      return `${title}: ${excerpt(audience.sheetUrl)}${tab}${col}`;
    }
    case 'zalo_friends':
      return `${title}: ${filtered ? t('campaignSettings.friendsAll') : t('campaignSettings.section.audience.friendsCount', { n: audience.uids.length })}`;
    case 'zalo_groups':
      return `${title}: ${t('campaignSettings.groupsSelected', { n: audience.groupIds.length })}`;
    case 'telegram_groups':
    case 'whatsapp_groups':
      return `${title}: ${t('campaignSettings.groupsSelected', { n: audience.groups.length })}`;
    case 'customers':
      return filtered ? `${title} (${t('campaignSettings.section.audience.filtered')})` : title;
    default:
      return title;
  }
};

/** Câu nhắc khi nguồn đã chọn nhưng còn thiếu dữ liệu (chữ thường, không nhắc "khối"). */
const missingText = (type, ctx) => {
  const { t, channel } = ctx;
  if (type === null) return t('campaignSettings.section.audience.missing.type');
  if (type === 'manual') return t(channel === 'email' ? 'campaignSettings.section.audience.missing.manualEmail' : 'campaignSettings.section.audience.missing.manualPhone');
  return t(`campaignSettings.section.audience.missing.${type}`);
};

const audienceLines = (located, nodes, lookups, t) => [located.sendNode, located.sourceNode]
  .filter(Boolean)
  .flatMap((node) => describeNodeSettings(node, { ...lookups, nodes }, t))
  .filter((item) => item.role === 'audience');

/**
 * @param {Array<object>} nodes
 * @param {Array<object>} edges
 * @param {{ campaignType: string, lookups?: object, t: Function }} ctx
 * @returns {{
 *   key: 'audience', status: 'ok'|'missing'|'idle', editable: boolean,
 *   value: { type: string|null, audience: object, channel: string }|null, summary: string, nodeIds: string[],
 *   reasonIfNotEditable: string|null, advancedNodeId: string|null,
 * }}
 */
export function readAudience(nodes, edges, ctx) {
  const { lookups = {}, t } = ctx;
  const located = locateAudience(nodes, edges);
  if (located.state === 'empty') {
    return { key: 'audience', status: 'idle', editable: true, value: null, summary: '', nodeIds: [], reasonIfNotEditable: null, advancedNodeId: null, empty: true };
  }
  if (located.state === 'unsupported') {
    const lines = located.sendNode ? describeNodeSettings(located.sendNode, { ...lookups, nodes }, t).filter((item) => item.role === 'audience') : [];
    return {
      key: 'audience',
      status: lines.some((item) => item.tone === 'missing') ? 'missing' : 'ok',
      editable: false,
      value: null,
      summary: t('campaignSettings.section.audience.custom'),
      nodeIds: located.sendNode ? [idOf(located.sendNode.id)] : [],
      reasonIfNotEditable: located.reason,
      advancedNodeId: located.sendNode ? idOf(located.sendNode.id) : null,
    };
  }

  const detected = detectType(located);
  const nodeIds = [located.sourceNode, located.sendNode].filter(Boolean).map((node) => idOf(node.id));
  const advancedNodeId = idOf((located.sourceNode || located.sendNode).id);
  const sendSubtype = subtypeOf(located.sendNode);
  const sctx = { t, channel: located.channel };
  const lines = audienceLines(located, nodes, lookups, t);
  const describeMissing = lines.some((item) => item.tone === 'missing');

  if (!detected.editable) {
    const type = detected.type;
    const audience = type ? extractAudience(type, located) : { ...EMPTY_AUDIENCE };
    const column = text(configOf(located.sendNode)[RECIPIENT_FIELDS[sendSubtype].column]);
    const summary = type
      ? summarize(type, audience, sctx, { filtered: detected.reason === 'filtered', column: detected.reason === 'column' ? column : '' })
      : t('campaignSettings.section.audience.custom');
    return {
      key: 'audience',
      status: describeMissing ? 'missing' : 'ok',
      editable: false,
      value: type ? { type, audience, channel: located.channel } : null,
      summary,
      nodeIds,
      reasonIfNotEditable: detected.reason,
      advancedNodeId,
    };
  }

  const type = detected.type;
  const audience = type ? extractAudience(type, located) : { ...EMPTY_AUDIENCE };
  // Thiếu theo `describeNodeSettings` (bám validateNodeForRun) HOẶC chưa đủ theo luật của trình từng bước (≥ 1 trang / biểu mẫu / bạn bè / nhóm…).
  const incomplete = type === null || !isStepComplete('audience', { channel: located.channel, audience });
  const missing = describeMissing || incomplete;
  return {
    key: 'audience',
    status: missing ? 'missing' : 'ok',
    editable: true,
    value: { type, audience, channel: located.channel },
    summary: missing ? missingText(type, sctx) : summarize(type, audience, sctx),
    nodeIds,
    reasonIfNotEditable: null,
    advancedNodeId,
  };
}

// ── Ghi ───────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Kiểm trước khi Lưu: đúng hàm của trình từng bước. */
export const validateAudience = (channel, audience) => AUDIENCE_TYPES_BY_CHANNEL[channel]?.includes(audience?.type) && isStepComplete('audience', { channel, audience });

/** Vá DỮ LIỆU của panel vào khối nguồn / khối gửi đã có đúng hình dạng cho `audience.type`. Không đụng trường nào khác. */
const patchAudienceData = (nodes, edges, audience) => {
  const located = locateAudience(nodes, edges);
  if (located.state !== 'ok') return nodes;
  const { sendNode, sourceNode } = located;
  const sendId = idOf(sendNode.id);
  const sendSubtype = subtypeOf(sendNode);
  const sendConfig = configOf(sendNode);
  const fields = RECIPIENT_FIELDS[sendSubtype];
  let next = nodes;

  switch (audience.type) {
    case 'manual': {
      const kind = sendSubtype === 'send_email' ? 'email' : 'phone';
      const existing = sendConfig[fields.list];
      const existingText = Array.isArray(existing) ? existing.join('\n') : String(existing ?? '');
      const before = parseManualRecipients(existingText, kind);
      const valid = parseManualRecipients(audience.manualText, kind).valid;
      // Cùng danh sách (sau chuẩn hoá) thì giữ nguyên chuỗi người dùng đã lưu.
      if (!(before.invalid.length === 0 && sameValue(before.valid, valid))) next = setConfigFields(next, sendId, { [fields.list]: valid.join('\n') });
      break;
    }
    case 'sheet': {
      if (!sourceNode) break;
      const url = text(audience.sheetUrl);
      const name = text(audience.sheetName);
      const sourceConfig = configOf(sourceNode);
      const patch = { sheetUrl: url, sheetName: name };
      // Đổi file / tab thì cột đã đọc từ file cũ không còn đúng: bỏ để hộp cài đặt nâng cao đọc lại.
      if (url !== text(sourceConfig.sheetUrl) || name !== text(sourceConfig.sheetName)) {
        patch.columns = [];
        patch.dataSelectedColumns = [];
        patch.sheetNameSource = undefined;
      }
      next = setConfigFields(next, sourceNode.id, patch);
      // Khung mới để trống cột người nhận (file tự đặt tên cột): điền cột mặc định của kênh — panel đã nhắc cần cột đúng tên đó.
      if (!text(sendConfig[fields.column])) {
        next = setConfigFields(next, sendId, { [fields.column]: sendSubtype === 'send_email' ? 'email' : 'phone' });
      }
      break;
    }
    case 'landing':
      if (sourceNode) next = setConfigFields(next, sourceNode.id, { landingLeadsSlugs: list(audience.slugs).map(text).filter(Boolean) });
      break;
    case 'form': {
      if (!sourceNode) break;
      const ids = list(audience.formIds).map(Number).filter((id) => Number.isFinite(id) && id > 0);
      if (!sameValue(getFormIdsFromConfig(configOf(sourceNode)), ids)) {
        next = setConfigFields(next, sourceNode.id, {
          formIds: ids,
          formId: undefined,
          fieldMap: { nameKey: '', emailKey: '', phoneKey: '' },
          formColumnsSnapshot: [],
          formConsentEnabled: false,
        });
      }
      break;
    }
    case 'zalo_friends':
      if (sourceNode) next = setConfigFields(next, sourceNode.id, { zaloFriendSelectionMode: 'fixed', zaloSelectedFriendIds: list(audience.uids).map(text).filter(Boolean) });
      break;
    case 'zalo_groups': {
      if (!sourceNode) break;
      const ids = list(audience.groupIds).map(text).filter(Boolean);
      const current = list(configOf(sourceNode).zaloSelectedGroupIds).map(text).filter(Boolean);
      if (!sameValue(current, ids)) {
        // Người dùng chỉnh tay danh sách thì tắt "khoá snapshot chọn tất cả" (như hộp cài đặt nhóm); danh sách rỗng thì giữ khoá = 0 nhóm.
        next = setConfigFields(next, sourceNode.id, { zaloSelectedGroupIds: ids, zaloGroupSelectionSnapshotLocked: ids.length === 0 });
        const mirror = {};
        if (Object.prototype.hasOwnProperty.call(sendConfig, 'zaloGroupIds')) mirror.zaloGroupIds = ids;
        if (Object.prototype.hasOwnProperty.call(sendConfig, 'zaloSelectedGroupIds')) mirror.zaloSelectedGroupIds = ids;
        if (Object.keys(mirror).length > 0) next = setConfigFields(next, sendId, mirror);
      }
      break;
    }
    case 'telegram_groups':
    case 'whatsapp_groups':
      next = setConfigFields(next, sendId, {
        recipientKeys: list(audience.groups).map((group) => ({ recipientKey: text(group.recipientKey), display: text(group.display) || text(group.recipientKey) })),
      });
      break;
    default:
      break;
  }
  return next;
};

/**
 * Ghi nguồn người nhận. Cùng loại nguồn → chỉ vá trường dữ liệu; khác loại → đổi cấu trúc giữ nguyên mọi cài đặt khác
 * (`reshapeAudienceSource`), rồi vá dữ liệu panel.
 *
 * @returns {{ nodes: Array<object>, edges: Array<object> }  đồ thị mới
 *   | { rebuild: true }                                        cần dựng lại khung (vd Zalo cá nhân ⇄ nhóm) — nơi gọi hỏi xác nhận rồi gọi `buildAudienceGraph`
 *   | null}                                                    mục này không sửa được ở đây
 */
export function writeAudience(nodes, edges, audience, ctx) {
  const located = locateAudience(nodes, edges);
  if (located.state !== 'ok') return null;
  const detected = detectType(located);
  if (!detected.editable) return null;
  if (!AUDIENCE_TYPES_BY_CHANNEL[located.channel]?.includes(audience?.type)) return null;

  let graph = { nodes, edges };
  if (audience.type !== detected.type) {
    const reshaped = reshapeAudienceSource({
      nodes,
      edges,
      campaignType: ctx.campaignType,
      audienceType: audience.type,
      locale: ctx.locale || 'vi',
    });
    if (!reshaped) return { rebuild: true };
    graph = { nodes: reshaped.nodes, edges: reshaped.edges };
  }
  return { nodes: patchAudienceData(graph.nodes, graph.edges, audience), edges: graph.edges };
}

/** Có phải đổi nguồn mà cần dựng lại khung (mất các cài đặt khác) không — để hỏi xác nhận TRƯỚC khi ghi. */
export const audienceChangeNeedsRebuild = (nodes, edges, audienceType, ctx) => {
  const located = locateAudience(nodes, edges);
  if (located.state !== 'ok') return false;
  const detected = detectType(located);
  if (!detected.editable || detected.type === audienceType) return false;
  return reshapeAudienceSource({ nodes, edges, campaignType: ctx.campaignType, audienceType, locale: ctx.locale || 'vi' }) === null;
};

/**
 * Chiến dịch trống (hoặc dựng lại): dựng khung theo nguồn + tài khoản đã chọn, rồi điền dữ liệu panel vào khung.
 * @returns {{ nodes: Array<object>, edges: Array<object>, sendNodeId: string, sourceNodeId: string|null }}
 */
export function buildAudienceGraph({ campaignType, audience, sender = null, locale = 'vi' }) {
  const skeleton = buildSettingsSkeleton({ campaignType, audienceType: audience.type, locale, sender });
  return { ...skeleton, nodes: patchAudienceData(skeleton.nodes, skeleton.edges, audience) };
}

export const audienceChannelOf = (campaignType) => resolveCampaignChannel(campaignType);
