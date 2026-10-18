/**
 * Mục "Nội dung" của tab Thiết lập (PLAN_THIET_LAP_BIEU_MAU_RIENG PR-E2): đọc / ghi chuỗi tin của MỖI khối gửi.
 *
 * Trường thật (đã đối chiếu `campaignCompiler.service.js`, `campaignSimple.service.js` `compileSimpleGraph`, `createNodeConfigFormData`,
 * `settingsGraph.js` và bộ chạy `campaignRun.service.js`):
 *  - email `emailSteps[]` · Zalo cá nhân `zaloPersonalTemplateSteps[]` · Zalo nhóm `zaloGroupTemplateSteps[]` · Telegram / WhatsApp `steps[]`.
 *  - Bước 1: `delayValue 0`. Email / Zalo: các bước sau `delayFrom 'prev'` (thiếu = runtime coi là 'start' → mọi bước cùng đến hạn một lúc);
 *    bước ĐANG là 'start' (dựng tay) giữ nguyên, hiện "sau tin đầu", KHÔNG tự đổi. Telegram / WhatsApp: không có `delayFrom`.
 *  - Chế độ gửi `sendMode` / `zaloPersonalSendMode` / `zaloGroupSendMode`: 'all' = gửi cả chuỗi ngay (độ trễ bị bỏ qua), 'schedule' = theo
 *    độ trễ từng bước. Thêm tin thứ 2 → 'schedule'. 'all' mà đã có từ 2 tin trở lên, hoặc chế độ lạ → KHÔNG sửa được ở đây.
 *  - Mẫu có sẵn: email / Zalo ghi `templateId` (nội dung do runtime đọc từ mẫu); Telegram / WhatsApp CHÉP chữ + tệp của mẫu vào bước
 *    (`message`, `attachments`) vì bộ chạy kênh adapter không tra mẫu.
 *  - `templateMappings` (biến mẫu): bộ biên dịch dựng bằng `buildCompilerTemplateMappings(text, nodeNguồn)` — mẫu có sẵn → text rỗng → `[]`
 *    (runtime tự ghép biến theo tên cột khi mảng rỗng); Zalo tự soạn → ghép theo biến trong chữ. Đổi nội dung bước → dựng lại như vậy;
 *    KHÔNG đổi nội dung bước → giữ NGUYÊN object cũ (kể cả mapping dựng tay).
 * Tự soạn email / Zalo cần có mẫu thật trước khi ghi (`contentTemplates.js` tạo mẫu rồi mới gọi `writeContent`); `writeContent` từ chối
 * (trả null) khi còn tin tự soạn chưa có mẫu — không bao giờ ghi nửa vời.
 */
import describeNodeSettings from '../describeNodeSettings';
import buildSettingsOrder from '../buildSettingsOrder';
import { SEND_SUBTYPES } from '../settingsGraph';
import { FOLLOW_UP_DELAY_UNITS, MAX_FOLLOW_UPS, isMessageContentComplete, isValidFollowUpDelay } from '../../simple/simpleCampaign.helpers';
import { MAX_CHANNEL_STEPS, MAX_CHANNEL_STEP_DELAY_MS } from '../../utils/channelSteps';
import { extractTemplateVariableNames } from '../../utils/templateVariableAutoMap';
import { configOf, idOf, list, setConfigFields, subtypeOf, text } from './sectionUtils';

/** Tin tự soạn: trần ký tự (khớp backend `MAX_CUSTOM_BODY_LENGTH` / `MAX_EMAIL_SUBJECT_LENGTH`). */
export const CUSTOM_BODY_MAX = Object.freeze({ email: 100000, zalo: 4000, telegram: 4000, whatsapp: 4096 });
export const CUSTOM_SUBJECT_MAX = 150;
export const MAX_FOLLOW_UP_DELAY_VALUE = 9999;

const DELAY_UNIT_MS = Object.freeze({ minutes: 60 * 1000, hours: 60 * 60 * 1000, days: 24 * 60 * 60 * 1000 });

/** Khối gửi → kênh của trình từng bước, tên trường chuỗi tin, trường chế độ gửi, trường chứa khối nguồn người nhận. */
export const CONTENT_SEND_SPEC = Object.freeze({
  send_email: { channel: 'email', kind: 'email', stepsField: 'emailSteps', modeField: 'sendMode', sourceField: 'recipientNodeId', legacyFields: ['emailTemplateId'] },
  send_zalo_personal: {
    channel: 'zalo', kind: 'zalo', stepsField: 'zaloPersonalTemplateSteps', modeField: 'zaloPersonalSendMode', sourceField: 'zaloRecipientNodeId',
    legacyFields: ['zaloMessage', 'zaloPersonalMessage', 'message'],
  },
  send_zalo_group: {
    channel: 'zalo', kind: 'zalo', stepsField: 'zaloGroupTemplateSteps', modeField: 'zaloGroupSendMode', sourceField: 'zaloGroupNodeId',
    legacyFields: ['zaloGroupMessage', 'message'],
  },
  send_telegram: { channel: 'telegram', kind: 'zalo', stepsField: 'steps', modeField: null, sourceField: null, legacyFields: [] },
  send_whatsapp: { channel: 'whatsapp', kind: 'zalo', stepsField: 'steps', modeField: null, sourceField: null, legacyFields: [] },
});

const isAdapter = (spec) => spec.channel === 'telegram' || spec.channel === 'whatsapp';
export const maxStepsOf = (channel) => (channel === 'telegram' || channel === 'whatsapp' ? MAX_CHANNEL_STEPS : MAX_FOLLOW_UPS + 1);

const hasText = (value) => text(value) !== '';

const lookupTemplate = (templates, id) => list(templates).find((item) => text(item?.id) === text(id));

/** Nội dung một bước đọc từ cấu hình (hình dạng của `MessageEditor` bên trình từng bước + vài trường chỉ để ghi). */
const readStepContent = (step, spec, lookups) => {
  const templateId = text(step?.templateId);
  if (templateId) {
    const found = lookupTemplate(spec.kind === 'email' ? lookups?.emailTemplates : lookups?.zaloTemplates, templateId);
    const content = {
      mode: 'template',
      templateId: Number(templateId) > 0 ? Number(templateId) : templateId,
      templateName: text(found?.templateName) || text(found?.name),
      subject: '',
      body: '',
    };
    if (isAdapter(spec)) {
      content.templateAttachments = Array.isArray(step?.attachments) ? step.attachments.filter(Boolean) : [];
      content.templateBodyLength = text(step?.message).length;
      content.templateBody = String(step?.message ?? '');
    } else {
      content.templateAttachments = null;
      content.templateBodyLength = null;
    }
    return content;
  }
  const body = String(step?.message ?? '');
  if (text(body)) return { mode: 'custom', templateId: null, templateName: '', templateAttachments: null, templateBodyLength: null, subject: '', body };
  return { mode: 'template', templateId: null, templateName: '', templateAttachments: null, templateBodyLength: null, subject: '', body: '' };
};

/** Chữ ký nội dung để biết "có đổi nội dung bước không" (không tính tên mẫu / tệp tải kèm). */
export const contentSignature = (content) => JSON.stringify([
  content?.mode || '',
  content?.mode === 'template' ? text(content?.templateId) : '',
  content?.mode === 'custom' ? String(content?.subject ?? '') : '',
  content?.mode === 'custom' ? String(content?.body ?? '') : '',
]);

/** Bước email tự soạn dở dang (chữ nằm thẳng trong bước, không có mẫu) hoặc bước Zalo có chữ mà thiếu mẫu: runtime không gửi được. */
const needsTemplate = (content, spec) => content.mode === 'custom' && !isAdapter(spec);

/**
 * Một bước dưới dạng giá trị của biểu mẫu. Trả `null` nếu bước có thứ biểu mẫu KHÔNG hiểu (không ghi đè được).
 */
const readStep = (step, index, spec, lookups) => {
  if (!step || typeof step !== 'object' || Array.isArray(step)) return null;
  // Bước email còn chữ nằm thẳng trong bước (HTML tự dựng): không có mẫu, ô tự soạn thuần chữ không biểu diễn được.
  if (spec.kind === 'email' && !hasText(step.templateId) && (hasText(step.emailBody) || hasText(step.emailSubject))) return null;
  const unit = text(step.delayUnit);
  if (index > 0 && unit && !FOLLOW_UP_DELAY_UNITS.includes(unit)) return null;
  const content = readStepContent(step, spec, lookups);
  const delayValue = index > 0 ? (Number.isFinite(Number(step.delayValue)) && text(step.delayValue) !== '' ? Number(step.delayValue) : 0) : 0;
  const delayUnit = FOLLOW_UP_DELAY_UNITS.includes(unit) ? unit : (isAdapter(spec) ? 'minutes' : 'days');
  return {
    origIndex: index,
    content,
    delayValue,
    delayUnit,
    // 'start' (hoặc thiếu) ở bước sau của email / Zalo = tính từ tin ĐẦU; kênh adapter luôn tính từ tin trước.
    delayFrom: isAdapter(spec) ? 'prev' : (text(step.delayFrom) === 'prev' ? 'prev' : 'start'),
    origDelay: { value: delayValue, unit: delayUnit },
    origSignature: contentSignature(content),
    needsTemplate: needsTemplate(content, spec),
  };
};

/** Khối gửi → giá trị biểu mẫu, hoặc lý do không sửa được. */
const readGroup = (node, lookups) => {
  const subtype = subtypeOf(node);
  const spec = CONTENT_SEND_SPEC[subtype];
  const base = { nodeId: idOf(node.id), subtype };
  if (!spec) return { ...base, editable: false, reasonIfNotEditable: 'unsupported', value: null };
  const config = configOf(node);
  const rawSteps = config[spec.stepsField];
  const stepsPresent = Array.isArray(rawSteps) && rawSteps.length > 0;
  if (!stepsPresent && spec.legacyFields.some((field) => hasText(config[field]))) {
    return { ...base, channel: spec.channel, editable: false, reasonIfNotEditable: 'legacy', value: null };
  }
  const mode = spec.modeField ? text(config[spec.modeField]) : '';
  if (spec.modeField && mode && mode !== 'all' && mode !== 'schedule') {
    return { ...base, channel: spec.channel, editable: false, reasonIfNotEditable: 'sendMode', value: null };
  }
  if (spec.modeField && mode !== 'schedule' && list(rawSteps).length > 1) {
    // "Gửi cả chuỗi ngay": độ trễ giữa các tin bị bỏ qua nên biểu mẫu "chờ N phút" sẽ nói sai điều máy chủ làm.
    return { ...base, channel: spec.channel, editable: false, reasonIfNotEditable: 'sendAll', value: null };
  }
  const sourceSteps = stepsPresent ? rawSteps : [null];
  const steps = [];
  for (let index = 0; index < sourceSteps.length; index += 1) {
    const step = sourceSteps[index] === null ? {} : sourceSteps[index];
    const read = readStep(step, index, spec, lookups);
    if (!read) return { ...base, channel: spec.channel, editable: false, reasonIfNotEditable: 'step', value: null };
    steps.push(read);
  }
  return {
    ...base,
    channel: spec.channel,
    editable: true,
    reasonIfNotEditable: null,
    value: { nodeId: base.nodeId, subtype, channel: spec.channel, kind: spec.kind, maxSteps: maxStepsOf(spec.channel), steps },
  };
};

const orderedNodes = (nodes, edges) => {
  const { ordered, unconnected } = buildSettingsOrder(nodes, edges);
  return [...ordered.map((entry) => entry.node), ...unconnected];
};

/**
 * @returns {{
 *   key: 'content', status: 'ok'|'missing'|'idle', summary: string, nodeIds: string[],
 *   items: Array<{ nodeId: string, subtype: string, channel?: string, lines: Array<object>, status: 'ok'|'missing', editable: boolean,
 *     reasonIfNotEditable: string|null, value: object|null }>,
 * }}
 */
export function readContent(nodes, edges, ctx) {
  const { lookups = {}, t } = ctx;
  const sends = orderedNodes(nodes, edges).filter((node) => SEND_SUBTYPES.includes(subtypeOf(node)));
  if (sends.length === 0) {
    return { key: 'content', status: 'idle', summary: t('campaignSettings.section.content.idle'), items: [], nodeIds: [] };
  }
  const items = sends.map((node) => {
    const lines = describeNodeSettings(node, { ...lookups, nodes }, t).filter((item) => item.role === 'content');
    const group = readGroup(node, lookups);
    return {
      nodeId: idOf(node.id),
      subtype: subtypeOf(node),
      channel: group.channel,
      lines: lines.map((item) => ({ label: item.label, value: item.value, tone: item.tone })),
      status: lines.some((item) => item.tone === 'missing') ? 'missing' : 'ok',
      editable: group.editable,
      reasonIfNotEditable: group.reasonIfNotEditable,
      value: group.value,
    };
  });
  const missing = items.some((item) => item.status === 'missing');
  const first = items[0].lines[0];
  return {
    key: 'content',
    status: missing ? 'missing' : 'ok',
    summary: first ? `${first.label}: ${first.value}` : '',
    items,
    nodeIds: items.map((item) => item.nodeId),
  };
}

/** Một bước của biểu mẫu trống (tin mới). */
export const createBlankContentStep = () => ({
  origIndex: null,
  content: { mode: 'template', templateId: null, templateName: '', templateAttachments: null, templateBodyLength: null, subject: '', body: '' },
  delayValue: 1,
  delayUnit: 'days',
  delayFrom: 'prev',
  origDelay: null,
  origSignature: '',
  needsTemplate: false,
});

// ── Kiểm hợp lệ ────────────────────────────────────────────────────────────────────────────────────────────────────────

/** @returns {''|'invalid'|'tooLong'} lỗi độ trễ của một bước sau (không báo lỗi nếu độ trễ giữ nguyên như đã lưu). */
export const delayProblemOf = (step, channel) => {
  if (step.origDelay && Number(step.delayValue) === Number(step.origDelay.value) && step.delayUnit === step.origDelay.unit) return '';
  if (!isValidFollowUpDelay(step.delayValue) || !FOLLOW_UP_DELAY_UNITS.includes(step.delayUnit)) return 'invalid';
  const value = Number(step.delayValue);
  if (value > MAX_FOLLOW_UP_DELAY_VALUE) return 'invalid';
  if ((channel === 'telegram' || channel === 'whatsapp') && value * DELAY_UNIT_MS[step.delayUnit] > MAX_CHANNEL_STEP_DELAY_MS) return 'tooLong';
  return '';
};

/** Nội dung một bước dùng được chưa (giới hạn ký tự Zalo / tiêu đề email kiểm thêm so với trình từng bước). */
export const contentProblemOf = (content, channel) => {
  if (!isMessageContentComplete(channel, content)) return 'incomplete';
  if (content.mode === 'custom') {
    if (String(content.body || '').trim().length > CUSTOM_BODY_MAX[channel]) return 'tooLong';
    if (channel === 'email' && String(content.subject || '').trim().replace(/\s+/g, ' ').length > CUSTOM_SUBJECT_MAX) return 'subjectTooLong';
  }
  return '';
};

/** @returns {{ ok: boolean, steps: Array<{ delay: string, content: string }> }} */
export const validateContentValue = (value) => {
  const steps = list(value?.steps).map((step, index) => ({
    delay: index === 0 ? '' : delayProblemOf(step, value.channel),
    content: contentProblemOf(step.content, value.channel),
  }));
  const ok = steps.length > 0 && steps.length <= value.maxSteps && steps.every((item) => !item.delay && !item.content);
  return { ok, steps };
};

/** Biểu mẫu có thay đổi gì so với bản đã đọc không (để bật nút Lưu / hỏi khi bỏ dở). */
export const isContentValueChanged = (value, initial) => {
  const a = list(value?.steps);
  const b = list(initial?.steps);
  if (a.length !== b.length) return true;
  return a.some((step, index) => {
    const base = b[index];
    return step.origIndex !== base.origIndex
      || contentSignature(step.content) !== contentSignature(base.content)
      || Number(step.delayValue) !== Number(base.delayValue)
      || step.delayUnit !== base.delayUnit;
  });
};

// ── Ghi ────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Ghép biến `{{…}}` của chữ vào cột cùng tên của khối nguồn — đúng `buildCompilerTemplateMappings`. */
export const buildTemplateMappings = (body, sourceNodeId) => {
  if (!text(body) || !text(sourceNodeId)) return [];
  return extractTemplateVariableNames(body).map((key) => ({ key, sourceType: 'node', nodeId: text(sourceNodeId), field: key }));
};

/** Bước mới đúng hình dạng bộ biên dịch (`compileSimpleGraph`: bước sau của email / Zalo có `delayFrom 'prev'`). */
const newStepShell = (spec, step) => {
  const delay = { delayValue: Number(step.delayValue), delayUnit: step.delayUnit };
  if (isAdapter(spec)) return { templateId: null, message: '', ...delay };
  const shell = { templateId: null, ...(spec.kind === 'email' ? { emailSubject: '', emailBody: '' } : { message: '' }), ...delay, delayFrom: 'prev' };
  if (spec.channel === 'email' || spec.stepsField === 'zaloPersonalTemplateSteps') shell.enableLinkTracking = true;
  shell.templateMappings = [];
  return shell;
};

/** Áp nội dung ĐÃ ĐỔI của một bước lên object bước (giữ mọi trường khác: tệp riêng, theo dõi link…). */
const applyContent = (base, spec, content, sourceNodeId) => {
  const next = { ...base };
  if (isAdapter(spec)) {
    if (content.mode === 'template') {
      next.templateId = Number(content.templateId);
      next.message = String(content.templateBody ?? '');
      next.attachments = Array.isArray(content.templateAttachments) ? content.templateAttachments.filter(Boolean) : [];
    } else {
      next.templateId = null;
      next.message = String(content.body ?? '').trim();
      // Đang dùng mẫu rồi chuyển sang tự soạn: bỏ tệp của mẫu. Tự soạn sửa tiếp: giữ tệp riêng của bước.
      if (text(base.templateId)) delete next.attachments;
    }
    return next;
  }
  next.templateId = Number(content.templateId);
  if (spec.kind === 'email') {
    next.emailSubject = '';
    next.emailBody = '';
    next.templateMappings = [];
  } else {
    // Mẫu vừa tạo từ chữ tự soạn: giữ chữ ở `message` + ghép biến như bộ biên dịch; mẫu có sẵn: `message` rỗng, mapping `[]`.
    const customBody = text(content.customBody);
    next.message = customBody ? String(content.customBody) : '';
    next.templateMappings = buildTemplateMappings(customBody, sourceNodeId);
  }
  return next;
};

const sameDelay = (original, step) => Number(original?.delayValue) === Number(step.delayValue) && text(original?.delayUnit) === text(step.delayUnit);

/**
 * Ghi chuỗi tin của MỘT khối gửi. CHỈ đổi các bước / trường mà biểu mẫu hiểu; bước không đổi trả lại đúng object cũ.
 * @param {Array<object>} nodes
 * @param {Array<object>} edges
 * @param {string} nodeId khối gửi
 * @param {object} value giá trị biểu mẫu (xem `readContent().items[].value`); tin tự soạn email / Zalo PHẢI đã có mẫu (`contentTemplates.js`)
 * @returns {{ nodes: Array<object>, edges: Array<object> }|null} null = không ghi được (khối không sửa được / còn tin chưa có mẫu / không hợp lệ)
 */
export function writeContent(nodes, edges, nodeId, value) {
  const node = list(nodes).find((item) => idOf(item.id) === idOf(nodeId));
  if (!node || !value) return null;
  const spec = CONTENT_SEND_SPEC[subtypeOf(node)];
  if (!spec) return null;
  const config = configOf(node);
  if (!readGroup(node, {}).editable) return null;
  const steps = list(value.steps);
  if (steps.length === 0 || steps.length > maxStepsOf(spec.channel)) return null;
  if (!validateContentValue({ ...value, channel: spec.channel, maxSteps: maxStepsOf(spec.channel) }).ok) return null;

  const rawSteps = Array.isArray(config[spec.stepsField]) ? config[spec.stepsField] : [];
  const sourceNodeId = spec.sourceField ? config[spec.sourceField] : '';
  const next = [];
  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index];
    const original = step.origIndex === null || step.origIndex === undefined ? null : rawSteps[step.origIndex];
    const changedContent = !original || step.needsTemplate || contentSignature(step.content) !== step.origSignature;
    // Tin tự soạn email / Zalo chưa được đổi thành mẫu thật thì dừng — ghi vào sơ đồ một bước không gửi được là tệ hơn không ghi.
    if (changedContent && step.content.mode === 'custom' && !isAdapter(spec)) return null;
    if (changedContent && step.content.mode === 'template' && !(Number(step.content.templateId) > 0)) return null;

    let touched = !original || changedContent;
    let result = original ? { ...original } : newStepShell(spec, step);
    if (changedContent) result = applyContent(result, spec, step.content, sourceNodeId);
    if (index === 0) {
      if (!original) result.delayValue = 0;
    } else if (!original || !sameDelay(original, step)) {
      // Chỉ chạm độ trễ khi người dùng đổi; `delayFrom` của bước cũ ('start' dựng tay) KHÔNG đụng tới — bước mới đã có 'prev' từ `newStepShell`.
      result.delayValue = Number(step.delayValue);
      result.delayUnit = step.delayUnit;
      touched = true;
    }
    next.push(touched ? result : original);
  }

  const patch = { [spec.stepsField]: next };
  if (spec.modeField && next.length > 1 && text(config[spec.modeField]) !== 'schedule') patch[spec.modeField] = 'schedule';
  const nextNodes = setConfigFields(nodes, node.id, patch);
  return { nodes: nextNodes, edges };
}
