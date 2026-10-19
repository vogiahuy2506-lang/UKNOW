/**
 * Tham chiếu giữa các khối trong chiến dịch (`config.zaloGroupNodeId`, `recipientNodeId`, `templateMappings[].nodeId`…).
 *
 * Hai việc, đều thuần (không DB, không HTTP):
 * 1. `remapNodeReferencesDeep` — đổi id tham chiếu khi NHÂN BẢN chiến dịch / mua marketplace (id khối đổi theo bản sao).
 * 2. `findDanglingNodeReferences` — tìm tham chiếu "cứng" trỏ vào khối không còn / không đi tới được (dùng chung cho
 *    preflight và lưới runtime): trước đây run kết thúc "completed" 0/0 trong im lặng.
 *
 * Tách khỏi `campaignFlow.service.js` có chủ đích: ~35 spec của engine mock cả module đó bằng đối tượng cụt; để các hàm này ở đó
 * thì mọi spec phải thêm mock mới. Module này chỉ mượn hai hàm dựng đồ thị (`buildExecutionOrderMap`, `buildFlowNodeIdMap`) —
 * đúng hai hàm engine đã gọi, nên mock nào chạy được engine thì chạy được ở đây.
 */
import campaignFlowService from './campaignFlow.service.js';

const REFERENCE_KEY_PATTERN = /nodeid$/i;

/**
 * `config` của khối có thể về dạng object (jsonb) hoặc chuỗi JSON (cột json/text cũ) — đưa về object; không đọc được thì null.
 *
 * @param {unknown} config
 * @returns {object|null}
 */
export function parseNodeConfig(config) {
  if (config && typeof config === 'object') return config;
  if (typeof config === 'string') {
    try {
      const parsed = JSON.parse(config);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Đổi mọi tham chiếu tới id khối trong cấu hình một khối. Khoá kết thúc bằng `NodeId`/`nodeId` (`recipientNodeId`,
 * `zaloGroupNodeId`, `saveCustomerNodeId`, `templateMappings[].nodeId`, `saveCustomerFieldMap.*.nodeId`…); duyệt sâu mảng/object
 * thay vì liệt kê tay từng trường — KHÁC `normalizeNodeReferenceConfig` (liệt kê tay, dễ sót; runtime đang chạy đúng với nó nên
 * không đụng). Chép logic `frontend/src/features/campaigns/settings/settingsGraph.js` `remapNodeReferences`.
 *
 * @param {unknown} value cấu hình (hoặc một phần của nó)
 * @param {Map<string, string>} idMap id cũ → id mới; khoá và giá trị đều là CHUỖI (BIGSERIAL pg trả chuỗi)
 * @returns {unknown} giá trị mới; GIỮ NGUYÊN tham chiếu (cùng object) khi không có gì đổi
 */
export function remapNodeReferencesDeep(value, idMap) {
  if (!(idMap instanceof Map) || idMap.size === 0) return value;
  if (Array.isArray(value)) {
    let changed = false;
    const mapped = value.map((item) => {
      const next = remapNodeReferencesDeep(item, idMap);
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
      if (REFERENCE_KEY_PATTERN.test(key) && typeof item === 'string' && idMap.has(item)) next = idMap.get(item);
      else if (REFERENCE_KEY_PATTERN.test(key) && typeof item === 'number' && idMap.has(String(item))) next = idMap.get(String(item));
      else if (item && typeof item === 'object') next = remapNodeReferencesDeep(item, idMap);
      if (next !== item) changed = true;
      mapped[key] = next;
    });
    return changed ? mapped : value;
  }
  return value;
}

/**
 * Các tham chiếu khối mà runtime THẬT SỰ đọc để lấy người nhận / nhóm / khách (chỉ trường "cứng": trỏ hụt thì khối gửi nhận
 * danh sách rỗng và run vẫn "completed" 0/0). Trường "mềm" (`get_all_groups.zaloGroupAccountNodeId`, `templateMappings[].nodeId`,
 * `tagSourceNodeId`, `attributeSourceNodeId`, cc/bcc) có đường lui trong engine nên KHÔNG nằm ở đây.
 *
 * `blockWhenEmpty`: chế độ lấy từ khối mà chưa chọn khối nào có bị coi là lỗi không. Zalo cá nhân / nhóm / kết bạn: rỗng → danh
 * sách rỗng (lỗi). Email và Telegram/WhatsApp: rỗng → engine lui về đầu ra khối liền trước (`lastOutputItems`, hợp lệ).
 *
 * @param {string} nodeSubtype
 * @param {unknown} config cấu hình khối (id còn ở dạng thô, chưa chuẩn hoá)
 * @returns {Array<{ field: string, ref: string, blockWhenEmpty: boolean }>}
 */
export function collectBlockingNodeReferences(nodeSubtype, config) {
  const cfg = parseNodeConfig(config) || {};
  const text = (value) => String(value ?? '').trim();
  switch (text(nodeSubtype)) {
    case 'send_zalo_group':
      if (text(cfg.zaloGroupSource || 'manual') !== 'node') return [];
      return [{ field: 'zaloGroupNodeId', ref: text(cfg.zaloGroupNodeId), blockWhenEmpty: true }];
    case 'send_email':
      if (text(cfg.recipientSource) !== 'node') return [];
      return [{ field: 'recipientNodeId', ref: text(cfg.recipientNodeId), blockWhenEmpty: false }];
    case 'send_zalo_personal': {
      if (text(cfg.zaloRecipientSource || cfg.recipientSource || 'manual') !== 'node') return [];
      // Runtime: `config.zaloRecipientNodeId || config.recipientNodeId`.
      const field = text(cfg.zaloRecipientNodeId) ? 'zaloRecipientNodeId' : 'recipientNodeId';
      return [{ field, ref: text(cfg[field]), blockWhenEmpty: true }];
    }
    case 'send_zalo_friend_request':
      if (text(cfg.zaloFriendSource || 'manual') !== 'node') return [];
      return [{ field: 'zaloFriendNodeId', ref: text(cfg.zaloFriendNodeId), blockWhenEmpty: true }];
    case 'send_telegram':
    case 'send_whatsapp':
      if (text(cfg.recipientSource) !== 'node') return [];
      return [{ field: 'recipientNodeId', ref: text(cfg.recipientNodeId), blockWhenEmpty: false }];
    case 'save_customer':
      if (!text(cfg.saveCustomerNodeId)) return [];
      return [{ field: 'saveCustomerNodeId', ref: text(cfg.saveCustomerNodeId), blockWhenEmpty: false }];
    default:
      return [];
  }
}

/**
 * Tìm tham chiếu khối "cứng" bị hụt — phân giải ĐÚNG như runtime (`campaignRun.service.js`): chỉ khối ĐI TỚI ĐƯỢC từ trigger,
 * đổi id sơ đồ (`flow_json`) sang id DB bằng subtype+nhãn (`buildFlowNodeIdMap`), rồi kiểm id đã phân giải có thuộc tập khối đi
 * tới được không. Bỏ bước `buildFlowNodeIdMap` sẽ báo nhầm các tham chiếu runtime vẫn cứu được.
 *
 * @param {{ flowJson?: object|string|null, nodes: Array<object>, connections: Array<object> }} input
 *   nodes: hàng `campaign_nodes` (id, node_subtype, node_name, execution_order, config);
 *   connections: hàng `campaign_connections` (source_node_id, target_node_id)
 * @returns {Array<{ nodeId: string, nodeName: string, nodeSubtype: string, field: string, ref: string, reason: 'missing'|'dangling' }>}
 */
export function findDanglingNodeReferences({ flowJson = null, nodes = [], connections = [] } = {}) {
  const safeNodes = Array.isArray(nodes) ? nodes : [];
  if (safeNodes.length === 0) return [];
  // Không có khối nào thuộc diện kiểm thì khỏi dựng đồ thị.
  const candidates = safeNodes.filter(
    (node) => collectBlockingNodeReferences(node?.node_subtype, node?.config).length > 0
  );
  if (candidates.length === 0) return [];

  const orderMap = campaignFlowService.buildExecutionOrderMap(safeNodes, connections || [], {
    nodeIdKey: 'id',
    sourceKey: 'source_node_id',
    targetKey: 'target_node_id',
  });
  const reachableNodes = safeNodes
    .filter((node) => orderMap.has(String(node.id)))
    .sort((a, b) => (orderMap.get(String(a.id)) || 0) - (orderMap.get(String(b.id)) || 0));
  const reachableIds = new Set(reachableNodes.map((node) => String(node.id)));
  const flowNodeIdMap = campaignFlowService.buildFlowNodeIdMap(flowJson, reachableNodes);

  const findings = [];
  reachableNodes.forEach((node) => {
    const subtype = String(node.node_subtype || '').trim();
    collectBlockingNodeReferences(subtype, node.config).forEach((rule) => {
      const base = {
        nodeId: String(node.id),
        nodeName: String(node.node_name || '').trim() || subtype,
        nodeSubtype: subtype,
        field: rule.field,
        ref: rule.ref,
      };
      if (!rule.ref) {
        if (rule.blockWhenEmpty) findings.push({ ...base, reason: 'missing' });
        return;
      }
      // Cùng phép phân giải với `resolveNodeId` của engine: không khớp bản đồ sơ đồ thì giữ nguyên id.
      const resolved = flowNodeIdMap.get(rule.ref) || rule.ref;
      if (!reachableIds.has(resolved)) findings.push({ ...base, reason: 'dangling' });
    });
  });
  return findings;
}

/**
 * Thông báo tiếng Việt cho khách khi có tham chiếu khối hụt (preflight + lưới runtime dùng chung).
 *
 * @param {Array<{ nodeName: string, reason: string }>} findings kết quả `findDanglingNodeReferences` (không rỗng)
 * @returns {string}
 */
export function buildDanglingReferenceMessage(findings) {
  const list = Array.isArray(findings) ? findings : [];
  const first = list[0];
  if (!first) return '';
  const more = list.length > 1 ? ` (và ${list.length - 1} khối khác cũng bị tương tự)` : '';
  if (first.reason === 'missing') {
    return `Khối "${first.nodeName}" đang để lấy dữ liệu từ khối khác nhưng chưa chọn khối dữ liệu${more}. Mở khối này, chọn khối dữ liệu rồi lưu chiến dịch.`;
  }
  return `Khối "${first.nodeName}" đang lấy dữ liệu từ một khối không còn tồn tại (thường gặp sau khi nhân bản chiến dịch)${more}. Mở khối này, chọn lại khối dữ liệu rồi lưu chiến dịch.`;
}

export default {
  parseNodeConfig,
  remapNodeReferencesDeep,
  collectBlockingNodeReferences,
  findDanglingNodeReferences,
  buildDanglingReferenceMessage,
};
