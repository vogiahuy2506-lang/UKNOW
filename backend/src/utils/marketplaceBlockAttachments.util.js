/**
 * Tệp đính kèm CẤP KHỐI của chiến dịch đăng bán Marketplace (khác tệp đính kèm của MẪU — xem marketplaceCampaignContent.service.js).
 *
 * Ba chỗ cấu hình khối mang danh sách tệp, mỗi phần tử là `{ key, url, name, size, … }` trỏ khoá `uploads/<chủ>/…` trong kho:
 *  - `config.attachments`            — khối gửi email;
 *  - `config.zaloGroupAttachments`   — khối gửi Zalo nhóm;
 *  - `config.steps[].attachments`    — khối gửi Telegram / WhatsApp (mỗi bước một danh sách).
 *
 * Bộ chạy chỉ dùng tệp nằm trong không gian của CHỦ chiến dịch (`uploads/<chủ>/`), nên chiến dịch mua về mà vẫn mang khoá của người bán
 * thì người mua gửi THIẾU tệp mà không hay biết. Vì vậy:
 *  - ĐĂNG BÁN: chỉ giữ tệp thuộc người bán (khoá của chủ khác bị bỏ — như `ownedAttachments` của mẫu);
 *  - MUA: chép từng tệp (một lần cho mỗi khoá) sang `uploads/<người mua>/…`, ghi sổ dung lượng của người mua, rồi đổi khoá trong cấu hình;
 *    tệp không chép được (không thuộc người bán / không có trong bản đồ) bị bỏ khỏi danh sách.
 *
 * File này chỉ có hàm THUẦN trên cấu hình khối (không DB, không kho tệp).
 */
import { mapFlowJsonNodeConfigs } from './campaignTemplateReference.util.js';
import { resolveOwnedStorageKey } from './storageKey.util.js';

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const sameList = (a, b) => a.length === b.length && a.every((item, index) => item === b[index]);

/**
 * Áp `mapList(list)` lên MỌI danh sách tệp cấp khối của một cấu hình khối.
 *
 * @param {unknown} config cấu hình khối
 * @param {(list: Array<object>) => Array<object>} mapList nhận một mảng, trả mảng mới
 * @returns {unknown} cấu hình mới (sao chép khi có đổi) — GIỮ NGUYÊN tham chiếu nếu không có gì đổi hoặc config không phải object
 */
export function mapBlockAttachmentLists(config, mapList) {
  if (!isPlainObject(config)) return config;
  let next = config;
  for (const field of ['attachments', 'zaloGroupAttachments']) {
    if (!Array.isArray(config[field])) continue;
    const mapped = mapList(config[field]);
    if (!sameList(mapped, config[field])) {
      if (next === config) next = { ...config };
      next[field] = mapped;
    }
  }
  if (Array.isArray(config.steps)) {
    let stepsChanged = false;
    const steps = config.steps.map((step) => {
      if (!isPlainObject(step) || !Array.isArray(step.attachments)) return step;
      const mapped = mapList(step.attachments);
      if (sameList(mapped, step.attachments)) return step;
      stepsChanged = true;
      return { ...step, attachments: mapped };
    });
    if (stepsChanged) {
      if (next === config) next = { ...config };
      next.steps = steps;
    }
  }
  return next;
}

/** Mọi tệp cấp khối của một cấu hình khối (phẳng, theo thứ tự xuất hiện). */
export function collectBlockAttachments(config) {
  const found = [];
  mapBlockAttachmentLists(config, (list) => {
    found.push(...list);
    return list;
  });
  return found;
}

/**
 * ĐĂNG BÁN — giữ chỉ tệp thuộc `ownerId` (khoá đã chuẩn hoá), bỏ phần tử rác và khoá của chủ khác.
 *
 * @param {unknown} config
 * @param {number|string} ownerId chủ workspace của người bán
 */
export function keepOwnedBlockAttachments(config, ownerId) {
  return mapBlockAttachmentLists(config, (list) => {
    const kept = [];
    for (const attachment of list) {
      if (!isPlainObject(attachment)) continue;
      const key = resolveOwnedStorageKey(attachment, ownerId);
      if (!key) continue;
      kept.push(attachment.key === key ? attachment : { ...attachment, key });
    }
    return kept;
  });
}

/**
 * MUA — đổi từng tệp theo bản đồ `khoá người bán → tệp mới của người mua`. Tệp không có trong bản đồ (không thuộc người bán, không chép
 * được) bị BỎ: để lại khoá người bán thì bộ chạy bỏ qua tệp đó mà người mua không hay.
 *
 * @param {unknown} config
 * @param {number|string} sellerId
 * @param {Map<string, object>} keyMap khoá người bán đã chuẩn hoá → phần tử tệp mới
 */
export function remapBlockAttachments(config, sellerId, keyMap) {
  return mapBlockAttachmentLists(config, (list) => {
    const mapped = [];
    for (const attachment of list) {
      const key = resolveOwnedStorageKey(attachment, sellerId);
      const replacement = key ? keyMap?.get(key) : null;
      if (replacement) mapped.push(replacement);
    }
    return mapped;
  });
}

/** `keepOwnedBlockAttachments` cho `snapshot.nodes[]` (camelCase `config`). Khối không đổi giữ nguyên tham chiếu. */
export function keepOwnedBlockAttachmentsInNodes(nodes, ownerId) {
  if (!Array.isArray(nodes)) return nodes;
  return nodes.map((node) => {
    if (!isPlainObject(node) || !isPlainObject(node.config)) return node;
    const config = keepOwnedBlockAttachments(node.config, ownerId);
    return config === node.config ? node : { ...node, config };
  });
}

/** `keepOwnedBlockAttachments` cho `flow_json.nodes[].data.config`. */
export function keepOwnedBlockAttachmentsInFlowJson(flowJson, ownerId) {
  return mapFlowJsonNodeConfigs(flowJson, (_subtype, config) => keepOwnedBlockAttachments(config, ownerId));
}

/** `remapBlockAttachments` cho `flow_json.nodes[].data.config`. */
export function remapBlockAttachmentsInFlowJson(flowJson, sellerId, keyMap) {
  return mapFlowJsonNodeConfigs(flowJson, (_subtype, config) => remapBlockAttachments(config, sellerId, keyMap));
}

/**
 * Gom tệp cấp khối của một snapshot (cả `nodes[].config` lẫn `flowJson`) thành bản đồ `khoá chuẩn hoá của người bán → phần tử tệp`,
 * mỗi khoá một lần. Chỉ lấy tệp thuộc `sellerId`; số tệp ngoài không gian người bán được đếm ở `skipped`.
 *
 * @param {{ nodes?: unknown, flowJson?: unknown }} snapshot
 * @param {number|string} sellerId
 * @returns {{ files: Map<string, object>, skipped: number }}
 */
export function collectSellerBlockFiles(snapshot, sellerId) {
  const files = new Map();
  let skipped = 0;
  const visit = (config) => {
    for (const attachment of collectBlockAttachments(config)) {
      const key = resolveOwnedStorageKey(attachment, sellerId);
      if (!key) {
        skipped += 1;
        continue;
      }
      if (!files.has(key)) files.set(key, { ...attachment, key });
    }
  };
  const nodes = Array.isArray(snapshot?.nodes) ? snapshot.nodes : [];
  for (const node of nodes) {
    const config = typeof node?.config === 'string' ? safeParseObject(node.config) : node?.config;
    visit(config);
  }
  mapFlowJsonNodeConfigs(snapshot?.flowJson, (_subtype, config) => {
    visit(config);
    return config;
  });
  return { files, skipped };
}

function safeParseObject(text) {
  try {
    const parsed = JSON.parse(text);
    return isPlainObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export default {
  mapBlockAttachmentLists,
  collectBlockAttachments,
  keepOwnedBlockAttachments,
  remapBlockAttachments,
  keepOwnedBlockAttachmentsInNodes,
  keepOwnedBlockAttachmentsInFlowJson,
  remapBlockAttachmentsInFlowJson,
  collectSellerBlockFiles,
};
