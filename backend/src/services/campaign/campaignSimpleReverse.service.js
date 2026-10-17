/**
 * Đọc ngược sơ đồ khối → form của trình TỪNG BƯỚC, và so khớp khứ hồi
 * (PLAN_HAI_TAB_TUNG_BUOC_SO_DO_2026-10-17, PR-A). Hàm thuần: không I/O.
 *
 * Vì sao tách khỏi `campaignIntentFromGraph.service.js`: hàm đó phục vụ backtest (chỉ ghi `{type:'drip', days}`, không ghi độ trễ
 * từng tin, không ghi nội dung, nguồn nhập tay chỉ là cờ). Ở đây cần ĐỦ dữ liệu để dựng lại đúng sơ đồ đang lưu, nên đọc thẳng
 * khối gửi + khối nguồn. Không sửa chữ ký `deriveIntentFromGraph`.
 *
 * CHỐT CHẶN MẤT DỮ LIỆU: lưu từ trình từng bước là GHI ĐÈ toàn bộ khối. Nên `editable` chỉ đúng khi dựng lại từ form cho ra sơ đồ
 * TƯƠNG ĐƯƠNG sơ đồ đang lưu (`isRoundTripEquivalent`). So khớp theo kiểu "mặc định nghiêm": mọi trường config của hai bên đều phải
 * bằng nhau, trừ danh sách miễn trừ ghi rõ lý do bên dưới. Thà báo chỉ-xem nhầm còn hơn cho sửa rồi lưu đè mất cấu hình.
 */
import { getNodeSubtype } from '../../utils/nodeSubtype.util.js';
import { normalizeFormIdList } from '../../utils/campaignFormIds.util.js';

export const READ_ONLY_REASON_CODES = Object.freeze({
  NOT_SIMPLE: 'not_simple',
  MULTIPLE_SEND_NODES: 'multiple_send_nodes',
  DELAY_FROM_START: 'delay_from_start',
  RUNNING: 'running',
  MULTIPLE_SCHEDULES: 'multiple_schedules',
  INLINE_CONTENT: 'inline_content',
  UNSUPPORTED_DELAY: 'unsupported_delay',
  FIRST_STEP_DELAY: 'first_step_delay',
  TOO_MANY_STEPS: 'too_many_steps',
  UNSUPPORTED_AUDIENCE: 'unsupported_audience',
  ADVANCED_SETTINGS: 'advanced_settings',
  NOT_OWNER: 'not_owner',
  CHANNEL_NOT_IN_PLAN: 'channel_not_in_plan',
});

const CODE = READ_ONLY_REASON_CODES;

/** Tối đa 10 tin (tin 1 + 9 tin tiếp theo) — khớp `MAX_FOLLOW_UPS` ở campaignSimple.service.js. */
const MAX_STEPS = 10;
const MAX_DELAY_VALUE = 9999;

const TRIGGER_SUBTYPES = new Set(['manual', 'manual_trigger']);
const AUDIENCE_SUBTYPES = new Set([
  'interested_customers',
  'read_landing_leads',
  'read_form_submissions',
  'read_sheet',
  'get_all_groups',
]);
const SEND_SUBTYPES = new Set(['send_email', 'send_zalo_personal', 'send_zalo_group']);
const SUPPORTED_SUBTYPES = new Set([...TRIGGER_SUBTYPES, ...AUDIENCE_SUBTYPES, ...SEND_SUBTYPES, 'select_zalo_account']);

const CHANNEL_BY_SEND_SUBTYPE = Object.freeze({
  send_email: 'email',
  send_zalo_personal: 'zalo',
  send_zalo_group: 'zalo_group',
});
const STEPS_FIELD_BY_CHANNEL = Object.freeze({
  email: 'emailSteps',
  zalo: 'zaloPersonalTemplateSteps',
  zalo_group: 'zaloGroupTemplateSteps',
});

const MESSAGES = Object.freeze({
  [CODE.MULTIPLE_SEND_NODES]: 'Chiến dịch có nhiều hơn một khối gửi tin. Trình từng bước chỉ sửa được chiến dịch có một khối gửi.',
  [CODE.DELAY_FROM_START]: 'Chuỗi tin đang đếm thời gian từ tin đầu tiên (dạng của Sơ đồ khối), không phải "sau tin trước". Trình từng bước chưa hiểu cách đếm này.',
  [CODE.RUNNING]: 'Chiến dịch đang chạy. Hãy đợi chạy xong hoặc dừng lượt chạy trước khi sửa.',
  [CODE.MULTIPLE_SCHEDULES]: 'Chiến dịch có nhiều lịch chạy nên phần "Khi nào gửi" chỉ xem được. Hãy sửa lịch ở trang Lịch chạy hoặc Sơ đồ khối.',
  [CODE.INLINE_CONTENT]: 'Có tin được soạn thẳng trong khối gửi, chưa gắn mẫu tin. Trình từng bước chỉ sửa được tin dùng mẫu.',
  [CODE.UNSUPPORTED_DELAY]: 'Thời gian chờ giữa các tin dùng đơn vị hoặc giá trị mà trình từng bước chưa hỗ trợ (chỉ nhận ngày hoặc giờ, số nguyên).',
  [CODE.FIRST_STEP_DELAY]: 'Tin đầu tiên đang được hẹn chờ một khoảng thời gian. Trình từng bước chỉ hiểu tin đầu gửi ngay.',
  [CODE.TOO_MANY_STEPS]: `Chuỗi có quá ${MAX_STEPS} tin. Trình từng bước chỉ sửa được chuỗi tối đa ${MAX_STEPS} tin.`,
  [CODE.UNSUPPORTED_AUDIENCE]: 'Nguồn người nhận của chiến dịch này chưa được trình từng bước hỗ trợ.',
  [CODE.NOT_OWNER]: 'Chiến dịch này do người khác chia sẻ cho bạn nên bạn không sửa được.',
  [CODE.CHANNEL_NOT_IN_PLAN]: 'Gói hiện tại không có kênh này nên chưa sửa được ở đây.',
});

const reason = (code, message, extra = {}) => ({ code, message: message || MESSAGES[code] || '', ...extra });

const asString = (value) => (value == null ? '' : String(value).trim());
const toPositiveInt = (value) => {
  const text = asString(value);
  if (!/^\d{1,15}$/.test(text)) return null;
  const n = Number(text);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
};
const toStringList = (value) => (Array.isArray(value) ? value.map((item) => asString(item)).filter(Boolean) : []);
const nodeConfig = (node) => (node?.config && typeof node.config === 'object' ? node.config : (node?.settings || {}));
const nodeId = (node) => asString(node?.id ?? node?.tempId);

// ---------------------------------------------------------------------------------------------------------------------
// Đường đi tuyến tính
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Kiểu nối THƯỜNG (không điều kiện). Trình dựng lưu cạnh React Flow là `custom`, compiler/trợ lý AI lưu `default` — đo prod
 * 17/10/2026: 100% cạnh là một trong hai, không cạnh nào có `condition_config`. Trước bản này `custom` bị coi là "nối điều
 * kiện" → 144/297 chiến dịch thật bị chỉ-xem oan.
 */
const PLAIN_CONNECTION_TYPES = new Set(['default', 'custom']);

/**
 * Bỏ khối `end` (Kết thúc) nằm CUỐI đường (không có cạnh đi ra) cùng cạnh trỏ vào nó. Khối này không làm gì lúc chạy;
 * trợ lý AI cũ hay thêm (79/297 chiến dịch prod 17/10/2026) → trước bản này bị coi là "khối nâng cao". Khối `end` ở giữa đường
 * (còn cạnh đi ra) giữ nguyên để bị từ chối như cũ. Lưu từ tab Từng bước thì sơ đồ mới không còn khối `end` — tương đương lúc chạy.
 *
 * @param {object[]} nodes
 * @param {object[]} connections
 * @returns {{ nodes: object[], connections: object[] }}
 */
export function stripTerminalEndNodes(nodes, connections) {
  const list = Array.isArray(nodes) ? nodes : [];
  const conns = Array.isArray(connections) ? connections : [];
  const endIds = new Set(
    list
      .filter((node) => getNodeSubtype(node) === 'end')
      .map((node) => nodeId(node))
      .filter((id) => !conns.some((conn) => asString(conn?.sourceNodeId) === id)),
  );
  if (endIds.size === 0) return { nodes: list, connections: conns };
  return {
    nodes: list.filter((node) => !endIds.has(nodeId(node))),
    connections: conns.filter((conn) => !endIds.has(asString(conn?.targetNodeId))),
  };
}

/**
 * Sắp các khối theo đường đi từ khối bắt đầu. Sơ đồ của trình từng bước luôn là MỘT đường thẳng
 * (trigger → [chọn tài khoản Zalo] → [nguồn] → gửi): có nhánh, khối rời, nối kiểu khác 'default' hoặc có điều kiện đều không phải.
 *
 * @returns {{ ok: true, ordered: object[] } | { ok: false, why: string }}
 */
export function orderLinearPath(nodes, connections) {
  const list = Array.isArray(nodes) ? nodes : [];
  const conns = Array.isArray(connections) ? connections : [];
  if (list.length === 0) return { ok: false, why: 'Sơ đồ chưa có khối nào.' };

  const byId = new Map(list.map((node) => [nodeId(node), node]));
  if (byId.size !== list.length) return { ok: false, why: 'Sơ đồ có khối trùng mã.' };

  const next = new Map();
  const incoming = new Map();
  for (const conn of conns) {
    const source = asString(conn?.sourceNodeId);
    const target = asString(conn?.targetNodeId);
    const type = asString(conn?.connectionType) || 'default';
    if (!PLAIN_CONNECTION_TYPES.has(type)) return { ok: false, why: 'Sơ đồ có đường nối điều kiện.' };
    const condition = conn?.conditionConfig;
    if (condition && typeof condition === 'object' && Object.keys(condition).length > 0) {
      return { ok: false, why: 'Sơ đồ có đường nối điều kiện.' };
    }
    if (!byId.has(source) || !byId.has(target)) return { ok: false, why: 'Sơ đồ có đường nối trỏ vào khối không tồn tại.' };
    if (next.has(source)) return { ok: false, why: 'Sơ đồ có khối rẽ nhiều nhánh.' };
    if (incoming.has(target)) return { ok: false, why: 'Sơ đồ có nhiều đường nối vào cùng một khối.' };
    next.set(source, target);
    incoming.set(target, source);
  }

  const starts = list.filter((node) => !incoming.has(nodeId(node)));
  if (starts.length !== 1) return { ok: false, why: 'Sơ đồ không phải một đường thẳng từ một khối bắt đầu.' };

  const ordered = [];
  const seen = new Set();
  let current = starts[0];
  while (current) {
    const id = nodeId(current);
    if (seen.has(id)) return { ok: false, why: 'Sơ đồ có vòng lặp.' };
    seen.add(id);
    ordered.push(current);
    current = byId.get(next.get(id));
  }
  if (ordered.length !== list.length) return { ok: false, why: 'Sơ đồ có khối rời, không nối vào đường chính.' };
  return { ok: true, ordered };
}

// ---------------------------------------------------------------------------------------------------------------------
// Đọc ngược
// ---------------------------------------------------------------------------------------------------------------------

function readAudience({ channel, audienceNode, sendConfig }) {
  const subtype = audienceNode ? getNodeSubtype(audienceNode) : '';
  const cfg = nodeConfig(audienceNode);

  if (channel === 'zalo_group') {
    if (subtype !== 'get_all_groups') return null;
    const groupIds = toStringList(cfg.zaloSelectedGroupIds?.length ? cfg.zaloSelectedGroupIds : cfg.zaloGroupIds);
    // Rỗng = "gửi MỌI nhóm của tài khoản" — trình từng bước bắt buộc chọn ≥ 1 nhóm nên không biểu diễn được.
    return groupIds.length > 0 ? { type: 'zalo_groups', groupIds } : null;
  }
  if (subtype === 'get_all_groups') return null;

  if (!audienceNode) {
    if (channel === 'email') {
      if (asString(sendConfig.recipientSource) !== 'manual') return null;
      const emails = toStringList(sendConfig.recipientEmails);
      return emails.length > 0 ? { type: 'manual', emails } : null;
    }
    if (asString(sendConfig.zaloRecipientSource) !== 'manual') return null;
    const values = toStringList(sendConfig.zaloRecipientPhones);
    if (values.length === 0) return null;
    return asString(sendConfig.zaloRecipientType) === 'uid'
      ? { type: 'zalo_friends', uids: values }
      : { type: 'manual', phones: values };
  }

  if (subtype === 'interested_customers') {
    return asString(cfg.interestedCustomerType).toLowerCase() === 'all' ? { type: 'customers' } : null;
  }
  if (subtype === 'read_landing_leads') {
    const slugs = toStringList(cfg.landingLeadsSlugs);
    return slugs.length > 0 ? { type: 'landing', slugs } : null;
  }
  if (subtype === 'read_form_submissions') {
    const formIds = normalizeFormIdList(cfg.formIds);
    const ids = formIds.length > 0 ? formIds : normalizeFormIdList(cfg.formId != null ? [cfg.formId] : []);
    return ids.length > 0 ? { type: 'form', formIds: ids } : null;
  }
  if (subtype === 'read_sheet') {
    const sheetUrl = asString(cfg.sheetUrl);
    if (!sheetUrl) return null;
    const sheetName = asString(cfg.sheetName);
    return { type: 'sheet', sheetUrl, ...(sheetName ? { sheetName } : {}) };
  }
  return null;
}

/** Lý do chặn mà vẫn cho XEM nội dung (`view`): đều chỉ vì nhịp chờ giữa các tin. */
const VIEW_ALLOWED_REASON_CODES = new Set([CODE.DELAY_FROM_START, CODE.UNSUPPORTED_DELAY, CODE.FIRST_STEP_DELAY, CODE.TOO_MANY_STEPS]);

/** Giá trị nhịp chờ giữ NGUYÊN như đã lưu (không quy đổi đơn vị / cách đếm). */
const viewDelay = (step) => {
  const raw = step?.delayValue;
  const num = Number(raw ?? 0);
  return {
    delayValue: Number.isFinite(num) ? num : asString(raw),
    delayUnit: asString(step?.delayUnit),
    delayFrom: asString(step?.delayFrom),
  };
};

/** Bản chỉ-xem của chuỗi tin: cùng hình dạng `form`, nhưng tin 1 có thể có nhịp chờ và mỗi tin sau mang nhịp chờ gốc. */
function buildView({ senderId, audience, steps, templateIds }) {
  return {
    senderId,
    audience,
    content: { mode: 'template', templateId: templateIds[0] },
    firstStepDelay: viewDelay(steps[0]),
    followUps: steps.slice(1).map((step, index) => ({
      ...viewDelay(step),
      content: { mode: 'template', templateId: templateIds[index + 1] },
    })),
  };
}

/**
 * Đọc sơ đồ đã lưu ra form của trình từng bước.
 *
 * @param {object[]} nodes khối đã lưu (`nodeSubtype`, `config`, `id`)
 * @param {object[]} connections `{ sourceNodeId, targetNodeId, connectionType }`
 * @returns {{
 *   channel: 'email'|'zalo'|'zalo_group'|null,
 *   form: { senderId: number, audience: object, content: object, followUps: object[] } | null,
 *   view?: object, // chỉ khi `form` null mà mọi lý do đều thuộc nhóm nhịp chờ — để XEM, không để sửa
 *   reasons: Array<{ code: string, message: string }>,
 * }} `form` null khi không đọc ngược được (kèm `reasons`)
 */
export function readSimpleFormFromGraph(rawNodes, rawConnections) {
  const { nodes, connections } = stripTerminalEndNodes(rawNodes, rawConnections);
  const list = nodes;
  const reasons = [];
  const fail = (code, message, extra) => reasons.push(reason(code, message, extra));

  if (list.length === 0) {
    fail(CODE.NOT_SIMPLE, 'Chiến dịch chưa có sơ đồ khối nào.');
    return { channel: null, form: null, reasons };
  }

  const unsupported = list.filter((node) => !SUPPORTED_SUBTYPES.has(getNodeSubtype(node)));
  if (unsupported.length > 0) {
    const labels = [...new Set(unsupported.map((node) => asString(node.nodeName) || getNodeSubtype(node) || 'khối không tên'))];
    fail(
      CODE.NOT_SIMPLE,
      `Chiến dịch có khối nâng cao mà trình từng bước chưa hiểu: ${labels.join(', ')}. Hãy sửa ở tab Sơ đồ khối.`,
      { subtypes: [...new Set(unsupported.map((node) => getNodeSubtype(node)))] },
    );
  }

  const sendNodes = list.filter((node) => SEND_SUBTYPES.has(getNodeSubtype(node)));
  if (sendNodes.length > 1) fail(CODE.MULTIPLE_SEND_NODES);
  if (sendNodes.length === 0 && unsupported.length === 0) {
    fail(CODE.NOT_SIMPLE, 'Chiến dịch chưa có khối gửi tin nào.');
  }
  if (reasons.length > 0) return { channel: null, form: null, reasons };

  const path = orderLinearPath(list, connections);
  if (!path.ok) {
    fail(CODE.NOT_SIMPLE, `${path.why} Trình từng bước chỉ hiểu sơ đồ một đường thẳng. Hãy sửa ở tab Sơ đồ khối.`);
    return { channel: null, form: null, reasons };
  }

  const sendNode = sendNodes[0];
  const channel = CHANNEL_BY_SEND_SUBTYPE[getNodeSubtype(sendNode)];
  const sendConfig = nodeConfig(sendNode);

  const audienceNodes = list.filter((node) => AUDIENCE_SUBTYPES.has(getNodeSubtype(node)));
  if (audienceNodes.length > 1) {
    fail(CODE.NOT_SIMPLE, 'Chiến dịch lấy người nhận từ nhiều khối nguồn. Trình từng bước chỉ hiểu một nguồn. Hãy sửa ở tab Sơ đồ khối.');
    return { channel, form: null, reasons };
  }

  // Tài khoản gửi. Zalo: có khối chọn tài khoản thì lấy ở khối đó — lúc chạy nó THẮNG `zaloAccountId` của khối gửi
  // (campaignRun: `selectedZaloAccount || config.zaloAccountId`). Trình dựng lưu khối gửi với `zaloAccountId: ''`
  // (114/118 chiến dịch Zalo prod 17/10/2026 bị chặn oan vì đòi hai khối trùng nhau).
  let senderId;
  if (channel === 'email') {
    senderId = toPositiveInt(sendConfig.fromEmailId);
  } else {
    const selectNode = list.find((node) => getNodeSubtype(node) === 'select_zalo_account');
    senderId = toPositiveInt(selectNode ? nodeConfig(selectNode).zaloAccountId : sendConfig.zaloAccountId);
  }
  if (!senderId) {
    fail(CODE.NOT_SIMPLE, 'Chiến dịch chưa chọn tài khoản gửi.');
    return { channel, form: null, reasons };
  }

  const audience = readAudience({ channel, audienceNode: audienceNodes[0] || null, sendConfig });
  if (!audience) {
    fail(CODE.UNSUPPORTED_AUDIENCE);
    return { channel, form: null, reasons };
  }

  const steps = Array.isArray(sendConfig[STEPS_FIELD_BY_CHANNEL[channel]]) ? sendConfig[STEPS_FIELD_BY_CHANNEL[channel]] : [];
  if (steps.length === 0) {
    fail(CODE.NOT_SIMPLE, 'Khối gửi chưa có tin nào.');
    return { channel, form: null, reasons };
  }
  // Quá nhiều tin: vẫn đọc tiếp để dựng `view` (chỉ xem) — bị chặn sửa bởi nhóm nhịp chờ thì vẫn xem được nội dung.
  if (steps.length > MAX_STEPS) fail(CODE.TOO_MANY_STEPS);

  const templateIds = steps.map((step) => toPositiveInt(step?.templateId));
  if (templateIds.some((id) => !id)) fail(CODE.INLINE_CONTENT);

  const followUps = [];
  steps.forEach((step, index) => {
    const value = Number(step?.delayValue ?? 0);
    if (index === 0) {
      if (Number.isFinite(value) && value !== 0) fail(CODE.FIRST_STEP_DELAY);
      return;
    }
    const unit = asString(step?.delayUnit);
    if (asString(step?.delayFrom) !== 'prev') {
      if (!reasons.some((item) => item.code === CODE.DELAY_FROM_START)) fail(CODE.DELAY_FROM_START);
    }
    if (!Number.isInteger(value) || value <= 0 || value > MAX_DELAY_VALUE || !['days', 'hours', 'minutes'].includes(unit)) {
      if (!reasons.some((item) => item.code === CODE.UNSUPPORTED_DELAY)) fail(CODE.UNSUPPORTED_DELAY);
      return;
    }
    followUps.push({ delayValue: value, delayUnit: unit, content: { mode: 'template', templateId: templateIds[index] } });
  });
  if (reasons.length > 0) {
    // `view` CHỈ khi mọi lý do chặn thuộc nhóm nhịp chờ — nội dung vẫn đọc được nguyên vẹn, chỉ là form chưa biểu diễn được.
    // Tin soạn thẳng (inline_content) không nằm trong nhóm này → không có view.
    const viewable = reasons.every((item) => VIEW_ALLOWED_REASON_CODES.has(item.code));
    return { channel, form: null, reasons, ...(viewable ? { view: buildView({ senderId, audience, steps, templateIds }) } : {}) };
  }

  return {
    channel,
    form: {
      senderId,
      audience,
      content: { mode: 'template', templateId: templateIds[0] },
      followUps,
    },
    reasons,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// So khớp khứ hồi
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Khoá config bị bỏ qua khi so khớp — đều là bản sao/dẫn xuất, không phải thứ form điều khiển:
 *  - `emailSenderId`: alias lịch sử của `fromEmailId`, không ai đọc ở runtime (xem campaignCompiler).
 *  - ở từng bước: `message` / `emailSubject` / `emailBody` (với bước dùng mẫu, nội dung sống ở bảng mẫu; Zalo còn giữ bản sao `message`
 *    sau khi tạo mẫu từ chữ tự soạn) và `templateMappings` (dẫn xuất từ chữ + mã khối nguồn).
 */
const IGNORED_CONFIG_KEYS = new Set(['emailSenderId']);

/**
 * Loại khối mà lúc chạy CHỈ đọc đúng các khoá này — mọi khoá khác (túi mặc định trình dựng ghi vào mọi khối: `bccEnabled`,
 * `conditions`, `saveCustomerFieldMap`…) không có tác dụng nên không đem ra so.
 *  - `select_zalo_account`: campaignRun nhánh `select_zalo_account` + `mergeZaloSelectPoolConfig` (gộp sang khối gửi).
 */
const RUNTIME_CONFIG_KEYS_BY_SUBTYPE = Object.freeze({
  select_zalo_account: Object.freeze(['zaloAccountId', 'zaloPoolMultiAccountEnabled', 'zaloPoolAccountIds']),
  //  - `get_all_groups`: campaignRun nhánh `get_all_groups` — `zaloGroupIds` của khối này KHÔNG được đọc (bản chép thừa của compiler).
  get_all_groups: Object.freeze(['zaloGroupAccountNodeId', 'zaloAccountId', 'zaloSelectedGroupIds', 'zaloGroupSelectionSnapshotLocked']),
  //  - `send_zalo_group`: campaignRun nhánh `send_zalo_group` + campaignEstimate. `zaloSelectedGroupIds` của khối gửi không ai đọc.
  send_zalo_group: Object.freeze([
    'zaloAccountId', 'zaloGroupSource', 'zaloGroupIds', 'zaloGroupNodeId', 'zaloGroupField', 'zaloGroupSendMode',
    'zaloGroupMessage', 'zaloGroupAttachments', 'zaloGroupTemplateSteps',
  ]),
});

/** Lúc chạy đọc dạng `config.x || 'mặc định'` → vắng / rỗng tương đương giá trị mặc định. */
const RUNTIME_DEFAULTS_BY_SUBTYPE = Object.freeze({
  send_zalo_group: Object.freeze({ zaloGroupField: 'groupId', zaloGroupSendMode: 'all' }),
});
// `id` của bước: trình dựng ghi, lúc chạy không chỗ nào đọc.
const IGNORED_STEP_KEYS = new Set(['message', 'emailSubject', 'emailBody', 'templateMappings', 'id']);
const STEP_FIELDS = new Set(Object.values(STEPS_FIELD_BY_CHANNEL));
const NUMERIC_ID_KEYS = new Set(['fromEmailId', 'zaloAccountId']);

const isEmptyValue = (value) => value === undefined
  || value === null
  || value === ''
  || (Array.isArray(value) && value.length === 0)
  || (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0);

/** Bỏ giá trị rỗng (đệ quy) để "vắng khoá" và "khoá rỗng" coi như nhau. */
function dropEmpty(value) {
  if (Array.isArray(value)) return value.map(dropEmpty).filter((item) => !isEmptyValue(item));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      const cleaned = dropEmpty(item);
      if (!isEmptyValue(cleaned)) out[key] = cleaned;
    }
    return out;
  }
  return value;
}

function normalizeStep(step, index) {
  const out = {};
  for (const [key, value] of Object.entries(step && typeof step === 'object' ? step : {})) {
    if (IGNORED_STEP_KEYS.has(key)) continue;
    out[key] = value;
  }
  out.templateId = toPositiveInt(out.templateId);
  // Lúc chạy đọc `step.enableLinkTracking !== false` (campaignRun, campaignEmailSender) → `true` cũng như vắng; `false` vẫn so.
  if (out.enableLinkTracking === true) delete out.enableLinkTracking;
  const delayValue = Number(out.delayValue ?? 0) || 0;
  out.delayValue = delayValue;
  if (index === 0 || delayValue === 0) {
    // Tin đầu / bước không chờ: đơn vị và cách đếm vô nghĩa (compiler Once ghi 'start', Drip ghi 'prev', Zalo nhóm bỏ trống).
    delete out.delayUnit;
    delete out.delayFrom;
  } else {
    out.delayFrom = asString(out.delayFrom) === 'prev' ? 'prev' : 'start';
  }
  return out;
}

/** Config của một khối → dạng so khớp được: bỏ khoá miễn trừ, mã khối → số thứ tự trên đường đi, số hoá id, chuẩn hoá bước. */
function normalizeConfigForCompare(config, idToIndex) {
  const out = {};
  for (const [key, value] of Object.entries(config && typeof config === 'object' ? config : {})) {
    if (IGNORED_CONFIG_KEYS.has(key)) continue;
    if (STEP_FIELDS.has(key) && Array.isArray(value)) {
      out[key] = value.map((step, index) => normalizeStep(step, index));
    } else if (/NodeId$/.test(key) && typeof value !== 'object') {
      const text = asString(value);
      out[key] = text ? (idToIndex.has(text) ? `#${idToIndex.get(text)}` : `?${text}`) : '';
    } else if (NUMERIC_ID_KEYS.has(key)) {
      out[key] = toPositiveInt(value);
    } else {
      out[key] = value;
    }
  }
  return dropEmpty(out);
}

function flatten(value, prefix, into) {
  if (Array.isArray(value)) {
    if (value.length === 0) into.set(prefix, '[]');
    value.forEach((item, index) => flatten(item, `${prefix}[${index}]`, into));
  } else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) flatten(item, prefix ? `${prefix}.${key}` : key, into);
  } else {
    into.set(prefix, JSON.stringify(value));
  }
  return into;
}

function canonicalGraph(graph) {
  const stripped = stripTerminalEndNodes(graph?.nodes, graph?.connections);
  const path = orderLinearPath(stripped.nodes, stripped.connections);
  if (!path.ok) return { ok: false, why: path.why };
  const idToIndex = new Map(path.ordered.map((node, index) => [nodeId(node), index]));
  const selectIndex = path.ordered.findIndex((node) => getNodeSubtype(node) === 'select_zalo_account');
  return {
    ok: true,
    nodes: path.ordered.map((node, index) => {
      const subtype = getNodeSubtype(node);
      let config = nodeConfig(node);
      const runtimeKeys = RUNTIME_CONFIG_KEYS_BY_SUBTYPE[subtype];
      if (runtimeKeys) {
        // `false` cũng như vắng: lúc chạy các cờ này được đọc bằng Boolean / isTruthyConfigFlag.
        config = Object.fromEntries(Object.entries(config).filter(([key, value]) => runtimeKeys.includes(key) && value !== false));
      }
      config = { ...config };
      for (const [key, fallback] of Object.entries(RUNTIME_DEFAULTS_BY_SUBTYPE[subtype] || {})) {
        if (isEmptyValue(config[key])) config[key] = fallback;
      }
      if (subtype === 'send_zalo_group' && (asString(config.zaloGroupSource) || 'manual') !== 'manual') {
        // Nguồn nhóm là khối phía trước → danh sách nhập tay không được đọc (collectEntriesFromSource).
        delete config.zaloGroupIds;
      }
      const afterSelect = selectIndex >= 0 && selectIndex < index;
      if (afterSelect && (SEND_SUBTYPES.has(subtype) || subtype === 'get_all_groups')) {
        // Khối chọn tài khoản đứng trước thì `zaloAccountId` ở đây không có tác dụng lúc chạy (`selectedZaloAccount` thắng).
        delete config.zaloAccountId;
      }
      if (afterSelect && subtype === 'get_all_groups') {
        // Trỏ vào chính khối chọn tài khoản, để trống, hay trỏ vào khối không còn trên sơ đồ (`pickNodeItems` ra rỗng) đều rơi về
        // `selectedZaloAccount` — cùng một tài khoản.
        const ref = asString(config.zaloGroupAccountNodeId);
        if (!ref || ref === nodeId(path.ordered[selectIndex]) || !idToIndex.has(ref)) delete config.zaloGroupAccountNodeId;
      }
      return {
        subtype: subtype === 'manual_trigger' ? 'manual' : subtype,
        config: normalizeConfigForCompare(config, idToIndex),
      };
    }),
  };
}

/**
 * So sơ đồ đã lưu với sơ đồ dựng lại từ form: thứ tự khối (theo đường đi), nối khối, và MỌI trường config — tài khoản gửi, nguồn +
 * cấu hình nguồn, nhóm/danh sách, `templateId`, `delayValue` / `delayUnit` / `delayFrom` từng bước, số bước, chế độ gửi.
 * Khác nhau ở bất kỳ trường nào → `ok: false` kèm danh sách khác biệt (đọc được, dùng để log/điều tra; KHÔNG đưa nguyên cho người dùng).
 *
 * @param {{ nodes: object[], connections: object[] }} stored
 * @param {{ nodes: object[], connections: object[] }} rebuilt
 * @returns {{ ok: boolean, diffs: string[] }}
 */
export function isRoundTripEquivalent(stored, rebuilt) {
  const left = canonicalGraph(stored);
  const right = canonicalGraph(rebuilt);
  if (!left.ok) return { ok: false, diffs: [`stored: ${left.why}`] };
  if (!right.ok) return { ok: false, diffs: [`rebuilt: ${right.why}`] };

  const diffs = [];
  if (left.nodes.length !== right.nodes.length) {
    diffs.push(`số khối: stored=${left.nodes.length} rebuilt=${right.nodes.length}`);
  }
  const shared = Math.min(left.nodes.length, right.nodes.length);
  for (let index = 0; index < shared; index += 1) {
    const a = left.nodes[index];
    const b = right.nodes[index];
    if (a.subtype !== b.subtype) {
      diffs.push(`khối #${index}: stored=${a.subtype} rebuilt=${b.subtype}`);
      continue;
    }
    const flatA = flatten(a.config, '', new Map());
    const flatB = flatten(b.config, '', new Map());
    const keys = new Set([...flatA.keys(), ...flatB.keys()]);
    for (const key of [...keys].sort()) {
      if (flatA.get(key) !== flatB.get(key)) {
        diffs.push(`${a.subtype}#${index}.${key}: stored=${flatA.get(key) ?? '(vắng)'} rebuilt=${flatB.get(key) ?? '(vắng)'}`);
      }
    }
  }
  return { ok: diffs.length === 0, diffs };
}

/**
 * Giữ lựa chọn "tắt theo dõi link" khi dựng lại sơ đồ từ form (form không có ô này). Trình dựng mặc định BẬT, nên `false` là người
 * dùng tự tắt — lưu ở tab Từng bước không được lặng lẽ bật lại. Chỉ chép khi MỌI tin của chuỗi đã lưu đều tắt: áp cho mọi tin của bản
 * dựng lại (kể cả tin mới thêm). Chuỗi trộn bật/tắt thì không chép → so khớp lệch → chỉ xem (thêm/xoá tin sẽ làm lệch vị trí).
 * Sửa `rebuiltNodes` tại chỗ. 20 chiến dịch nhóm Zalo prod 17/10/2026 chỉ vướng đúng điều này.
 *
 * @param {object[]} storedNodes
 * @param {object[]} rebuiltNodes
 */
export function carryOverLinkTracking(storedNodes, rebuiltNodes) {
  const sendOf = (list) => (Array.isArray(list) ? list : []).find((node) => SEND_SUBTYPES.has(getNodeSubtype(node)));
  const storedSend = sendOf(storedNodes);
  const rebuiltSend = sendOf(rebuiltNodes);
  if (!storedSend || !rebuiltSend) return;
  const field = STEPS_FIELD_BY_CHANNEL[CHANNEL_BY_SEND_SUBTYPE[getNodeSubtype(storedSend)]];
  const storedSteps = nodeConfig(storedSend)[field];
  const rebuiltSteps = rebuiltSend.config?.[field];
  if (!Array.isArray(storedSteps) || storedSteps.length === 0 || !Array.isArray(rebuiltSteps)) return;
  if (!storedSteps.every((step) => step?.enableLinkTracking === false)) return;
  rebuiltSteps.forEach((step) => { step.enableLinkTracking = false; });
}

export default {
  readSimpleFormFromGraph, isRoundTripEquivalent, orderLinearPath, stripTerminalEndNodes, carryOverLinkTracking, READ_ONLY_REASON_CODES,
};
