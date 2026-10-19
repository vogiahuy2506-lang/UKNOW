/**
 * Tham chiếu MẪU (email / Zalo) trong `config` các khối gửi của chiến dịch — MỘT nơi định nghĩa "khối nào trỏ mẫu nào, ở trường
 * nào", dùng cho Marketplace: đăng bán (kiểm kê mẫu cần chụp), mua (đổi id mẫu của người bán sang bản sao của người mua), và script
 * bù dữ liệu cũ. Hàm thuần: không DB, không HTTP.
 *
 * Mỗi "ô" (slot) chứa một id mẫu có hai loại:
 *  - `required`: engine THẬT SỰ đọc ô này lúc gửi (luật khớp `campaignRun.service.js` / `emailTemplateReference.util.js`):
 *      · send_email: các bước `emailSteps[]` có `templateId` đọc được thành số; không có bước nào thì `emailTemplateId || templateId`.
 *      · send_zalo_personal / send_zalo_group: các bước `zaloPersonalTemplateSteps[]` / `zaloGroupTemplateSteps[]` có `templateId`
 *        `parseInt` hữu hạn.
 *      · send_zalo_friend_request: `zaloFriendTemplateId`, CHỈ khi `zaloFriendContentMode === 'template'` và không có
 *        `zaloFriendTemplateBody` (còn lại engine dùng nội dung soạn thẳng).
 *  - `optional`: id còn sót lại mà engine KHÔNG đọc (bước email khác `emailSteps` hợp lệ, `emailTemplateId` thừa khi đã có bước,
 *    `zaloFriendTemplateId` khi nội dung soạn tay, `templateId` của bước Telegram/WhatsApp — ở hai kênh này `templateId` chỉ là gợi ý
 *    giao diện, nội dung đã nằm sẵn trong bước). Ô này không bắt buộc có mẫu, nhưng id của người bán KHÔNG được để lọt sang người mua.
 *
 * Cột `campaign_nodes.id_email_template` / `id_zalo_template` không được ứng dụng ghi và engine không đọc — không nằm ở đây.
 */
import { parseEmailTemplateId } from './emailTemplateReference.util.js';

export const TEMPLATE_CHANNEL = Object.freeze({ EMAIL: 'email', ZALO: 'zalo' });

const ZALO_STEP_FIELD_BY_SUBTYPE = Object.freeze({
  send_zalo_personal: 'zaloPersonalTemplateSteps',
  send_zalo_group: 'zaloGroupTemplateSteps',
});

const ADAPTER_STEP_SUBTYPES = new Set(['send_telegram', 'send_whatsapp']);

const isBlank = (raw) => raw === null || raw === undefined || String(raw).trim() === '';

/** Cùng phép đọc với engine Zalo (`parseInt` hữu hạn) nhưng chỉ nhận số nguyên dương an toàn. */
export function parseZaloTemplateId(raw) {
  const id = Number.parseInt(raw, 10);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/** `config` của khối có thể là object hoặc chuỗi JSON (cột cũ) — object thì giữ nguyên, chuỗi đọc được thì parse, còn lại null. */
function readConfigObject(config) {
  if (config && typeof config === 'object' && !Array.isArray(config)) return config;
  if (typeof config === 'string') {
    try {
      const parsed = JSON.parse(config);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Duyệt MỌI ô chứa id mẫu của một khối; `visit({ channel, required, raw, id })` trả `{ value }` để thay giá trị ô, hoặc `undefined`
 * để giữ nguyên. Trả về config mới (sao chép khi có đổi) — GIỮ NGUYÊN tham chiếu khi không có gì đổi.
 *
 * @param {string} subtype
 * @param {unknown} config
 * @param {(slot: { channel: 'email'|'zalo', required: boolean, raw: unknown, id: number|null }) => ({ value: unknown }|undefined)} visit
 * @returns {unknown}
 */
function visitTemplateSlots(subtype, config, visit) {
  const cfg = readConfigObject(config);
  if (!cfg) return config;
  let next = cfg;
  const ensureCopy = () => {
    if (next === cfg) next = { ...cfg };
  };
  const setTop = (key, value) => {
    ensureCopy();
    next[key] = value;
  };
  const setStep = (arrayKey, index, value) => {
    ensureCopy();
    if (next[arrayKey] === cfg[arrayKey]) next[arrayKey] = [...cfg[arrayKey]];
    next[arrayKey][index] = { ...cfg[arrayKey][index], templateId: value };
  };
  const apply = (slot, write) => {
    const outcome = visit(slot);
    if (outcome && Object.prototype.hasOwnProperty.call(outcome, 'value') && outcome.value !== slot.raw) write(outcome.value);
  };

  const kind = String(subtype || '').trim();
  // Không đổi gì thì trả đúng giá trị người gọi đưa vào (kể cả khi đó là chuỗi JSON).
  const done = () => (next === cfg ? config : next);

  if (kind === 'send_email') {
    const steps = Array.isArray(cfg.emailSteps) ? cfg.emailSteps : [];
    // Luật engine: chỉ bước có templateId đọc được thành số (parseInt hữu hạn) mới được giữ; còn bước nào thì MỖI bước dùng mẫu riêng.
    const usedStepIndexes = new Set();
    steps.forEach((step, index) => {
      if (Number.isFinite(Number.parseInt(step?.templateId, 10))) usedStepIndexes.add(index);
    });
    steps.forEach((step, index) => {
      const raw = step?.templateId;
      if (isBlank(raw)) return;
      apply(
        { channel: TEMPLATE_CHANNEL.EMAIL, required: usedStepIndexes.has(index), raw, id: parseEmailTemplateId(raw) },
        (value) => setStep('emailSteps', index, value)
      );
    });
    // Không có bước hợp lệ nào thì cả node dùng một mẫu: `emailTemplateId || templateId` (ô nào truthy trước là ô engine đọc).
    const usedTopKey = usedStepIndexes.size === 0 ? (cfg.emailTemplateId ? 'emailTemplateId' : 'templateId') : null;
    ['emailTemplateId', 'templateId'].forEach((key) => {
      const raw = cfg[key];
      if (isBlank(raw)) return;
      apply(
        { channel: TEMPLATE_CHANNEL.EMAIL, required: key === usedTopKey, raw, id: parseEmailTemplateId(raw) },
        (value) => setTop(key, value)
      );
    });
    return done();
  }

  const zaloStepField = ZALO_STEP_FIELD_BY_SUBTYPE[kind];
  if (zaloStepField) {
    const steps = Array.isArray(cfg[zaloStepField]) ? cfg[zaloStepField] : [];
    steps.forEach((step, index) => {
      const raw = step?.templateId;
      if (isBlank(raw)) return;
      const required = Number.isFinite(Number.parseInt(raw, 10));
      apply(
        { channel: TEMPLATE_CHANNEL.ZALO, required, raw, id: parseZaloTemplateId(raw) },
        (value) => setStep(zaloStepField, index, value)
      );
    });
    return done();
  }

  if (kind === 'send_zalo_friend_request') {
    const raw = cfg.zaloFriendTemplateId;
    if (isBlank(raw)) return done();
    const contentMode = String(cfg.zaloFriendContentMode || 'manual').trim();
    const hasInlineBody = String(cfg.zaloFriendTemplateBody || '').trim() !== '';
    const required = contentMode === 'template' && !hasInlineBody;
    apply(
      { channel: TEMPLATE_CHANNEL.ZALO, required, raw, id: parseZaloTemplateId(raw) },
      (value) => setTop('zaloFriendTemplateId', value)
    );
    return done();
  }

  if (ADAPTER_STEP_SUBTYPES.has(kind)) {
    const steps = Array.isArray(cfg.steps) ? cfg.steps : [];
    steps.forEach((step, index) => {
      const raw = step?.templateId;
      if (isBlank(raw)) return;
      // Gợi ý giao diện (mẫu Zalo đã được chép vào bước lúc chọn) — engine không đọc.
      apply(
        { channel: TEMPLATE_CHANNEL.ZALO, required: false, raw, id: parseZaloTemplateId(raw) },
        (value) => setStep('steps', index, value)
      );
    });
    return done();
  }

  return done();
}

/**
 * Các tham chiếu mẫu mà các khối THẬT SỰ dùng lúc chạy.
 *
 * @param {Array<{ id?: unknown, nodeName?: string, nodeSubtype?: string, node_subtype?: string, node_name?: string, config?: unknown }>} nodes
 *   hàng `campaign_nodes` (snake_case) hoặc khối trong snapshot (camelCase)
 * @returns {Array<{ nodeId: unknown, nodeName: string, nodeSubtype: string, channel: 'email'|'zalo', raw: string, id: number|null }>}
 *   `id` null = có tham chiếu nhưng không phải id hợp lệ (coi như mẫu không tồn tại)
 */
export function collectRequiredTemplateReferences(nodes) {
  const found = [];
  for (const node of Array.isArray(nodes) ? nodes : []) {
    const subtype = String(node?.nodeSubtype ?? node?.node_subtype ?? '').trim();
    if (!subtype) continue;
    const nodeName = String(node?.nodeName ?? node?.node_name ?? '').trim() || subtype;
    visitTemplateSlots(subtype, node?.config, (slot) => {
      if (slot.required) {
        found.push({
          nodeId: node?.id ?? null,
          nodeName,
          nodeSubtype: subtype,
          channel: slot.channel,
          raw: String(slot.raw).trim(),
          id: slot.id,
        });
      }
      return undefined;
    });
  }
  return found;
}

/** Bản đồ id cũ → id mới cho từng kênh. Khoá là CHUỖI (BIGSERIAL pg trả chuỗi, snapshot có thể lưu số). */
export function createTemplateIdMaps() {
  return { email: new Map(), zalo: new Map() };
}

/**
 * Đổi id mẫu của người bán sang id bản sao của người mua trong config MỘT khối.
 *  - ô có id nằm trong bản đồ → id mới (giữ kiểu số/chuỗi như giá trị cũ);
 *  - ô `optional` còn id không có trong bản đồ → null (id của người bán không được lọt sang người mua);
 *  - ô `required` mà không có trong bản đồ → GIỮ NGUYÊN (fail-closed: preflight/engine báo mẫu không tồn tại thay vì gửi nội dung
 *    mặc định khi mất tham chiếu).
 * Giữ nguyên tham chiếu object khi không có gì đổi.
 *
 * @param {string} subtype
 * @param {unknown} config
 * @param {{ email?: Map<string, string|number>, zalo?: Map<string, string|number> }} maps
 * @returns {unknown}
 */
export function remapTemplateIdsInConfig(subtype, config, maps = {}) {
  const emailMap = maps.email instanceof Map ? maps.email : new Map();
  const zaloMap = maps.zalo instanceof Map ? maps.zalo : new Map();
  return visitTemplateSlots(subtype, config, ({ channel, required, raw, id }) => {
    const map = channel === TEMPLATE_CHANNEL.EMAIL ? emailMap : zaloMap;
    const mapped = id != null ? map.get(String(id)) : undefined;
    if (mapped !== undefined && mapped !== null) {
      return { value: typeof raw === 'number' ? Number(mapped) : String(mapped) };
    }
    return required ? undefined : { value: null };
  });
}

/**
 * Như `remapTemplateIdsInConfig` nhưng cho cả sơ đồ `flow_json` (`nodes[].data.config`, subtype = `data.nodeType || type`).
 * Giữ nguyên tham chiếu khi không có gì đổi. Không đụng id khối / cạnh.
 *
 * @param {unknown} flowJson
 * @param {{ email?: Map<string, string|number>, zalo?: Map<string, string|number> }} maps
 * @returns {unknown}
 */
export function remapTemplateIdsInFlowJson(flowJson, maps = {}) {
  return mapFlowJsonNodeConfigs(flowJson, (subtype, config) => remapTemplateIdsInConfig(subtype, config, maps));
}

/**
 * Áp một hàm biến đổi config lên từng khối của `flow_json`. Chuỗi JSON được parse (đọc không được thì trả nguyên văn); giữ nguyên
 * tham chiếu khi hàm biến đổi không đổi gì.
 *
 * @param {unknown} flowJson
 * @param {(subtype: string, config: unknown) => unknown} transform
 * @returns {unknown}
 */
export function mapFlowJsonNodeConfigs(flowJson, transform) {
  let flow = flowJson;
  if (typeof flow === 'string') {
    try {
      flow = JSON.parse(flow);
    } catch {
      return flowJson;
    }
  }
  if (!flow || typeof flow !== 'object' || !Array.isArray(flow.nodes)) return flowJson;
  let changed = false;
  const nodes = flow.nodes.map((node) => {
    const config = node?.data?.config;
    if (!config || typeof config !== 'object') return node;
    const subtype = String(node?.data?.nodeType || node?.type || '').trim();
    const nextConfig = transform(subtype, config);
    if (nextConfig === config) return node;
    changed = true;
    return { ...node, data: { ...node.data, config: nextConfig } };
  });
  if (!changed) return flowJson;
  return { ...flow, nodes };
}

export default {
  TEMPLATE_CHANNEL,
  parseZaloTemplateId,
  collectRequiredTemplateReferences,
  createTemplateIdMaps,
  remapTemplateIdsInConfig,
  remapTemplateIdsInFlowJson,
  mapFlowJsonNodeConfigs,
};
