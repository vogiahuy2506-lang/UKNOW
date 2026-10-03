/**
 * Xác định tài khoản Zalo mà từng node của chiến dịch dùng — nguồn CHUNG cho preflight
 * (`campaignPreflight.service.js`) và bộ ước tính thời gian (`campaignEstimate.service.js`).
 *
 * Tách ra từ preflight (PLAN_UOC_TINH_THOI_GIAN 3.2: "đừng chép logic xác định nick — tách dùng chung";
 * tiền lệ PR-9: hai nơi tự chép rồi lệch). Luật ưu tiên bám engine `campaignRun.service.js`:
 * - select_zalo_account: pool bật + có id → danh sách pool; ngược lại `zaloAccountId`.
 * - send_zalo_personal / send_zalo_friend_request: pool từ node chọn tài khoản đứng trước (nếu có), ngược lại
 *   danh sách riêng của node (`zaloPersonalAccountIds` / `zaloFriendAccountIds`) khi cờ bật, ngược lại `zaloAccountId`.
 * - send_zalo_group: `zaloAccountId` (không có chế độ nhiều tài khoản).
 *
 * Thuần: không DB, không đồng hồ.
 */

/** Đọc cờ boolean từ config node an toàn (`Boolean("false") === true` là bẫy cũ) — cùng luật engine `isTruthyConfigFlag`. */
export const isTruthyConfigFlag = (cfg, key) => {
  if (!cfg || typeof cfg !== 'object') return false;
  const v = cfg[key];
  if (v === true || v === 1) return true;
  if (v === false || v === 0 || v == null) return false;
  const s = String(v).trim().toLowerCase();
  return s === 'true' || s === '1';
};

export const uniqueNonEmptyIds = (arr) => [...new Set(
  (Array.isArray(arr) ? arr : [])
    .map((id) => String(id || '').trim())
    .filter(Boolean)
)];

/**
 * Cấu hình tài khoản RIÊNG của một node (không xét node chọn tài khoản đứng trước).
 *
 * @param {{ node_subtype?: string, nodeSubtype?: string, config?: object }} node
 * @returns {{ multi: boolean, ids: string[] }|null} null nếu subtype không phải node Zalo có tài khoản gửi
 */
export function getNodeOwnZaloAccountSpec(node) {
  const subtype = String(node?.node_subtype ?? node?.nodeSubtype ?? '').trim();
  const config = node?.config || {};
  if (subtype === 'select_zalo_account') {
    const poolIds = uniqueNonEmptyIds(config.zaloPoolAccountIds);
    if (isTruthyConfigFlag(config, 'zaloPoolMultiAccountEnabled') && poolIds.length > 0) {
      return { multi: true, ids: poolIds };
    }
    return { multi: false, ids: [config.zaloAccountId] };
  }
  if (subtype === 'send_zalo_personal') {
    const multiIds = uniqueNonEmptyIds(config.zaloPersonalAccountIds);
    if (multiIds.length > 0 && isTruthyConfigFlag(config, 'zaloPersonalMultiAccountEnabled')) {
      return { multi: true, ids: multiIds };
    }
    return { multi: false, ids: [config.zaloAccountId] };
  }
  if (subtype === 'send_zalo_friend_request') {
    const multiIds = uniqueNonEmptyIds(config.zaloFriendAccountIds);
    if (multiIds.length > 0 && isTruthyConfigFlag(config, 'zaloFriendMultiAccountEnabled')) {
      return { multi: true, ids: multiIds };
    }
    return { multi: false, ids: [config.zaloAccountId] };
  }
  if (subtype === 'send_zalo_group') {
    return { multi: false, ids: [config.zaloAccountId] };
  }
  return null;
}

/**
 * Danh sách "mục tài khoản" mà preflight phải kiểm kết nối, theo đúng luật preflight (PR-4/PR-9):
 * `kind: 'single'` — id đơn lẻ, MỌI id phải dùng được; `kind: 'group'` — pool, ĐẠT nếu ít nhất một id dùng được.
 * `ids` giữ nguyên giá trị thô (người gọi tự parseInt).
 *
 * @param {Array<{ id?: any, node_subtype?: string, config?: object }>} nodes
 * @returns {Array<{ nodeId: any, subtype: string, kind: 'single'|'group', ids: any[] }>}
 */
export function resolveZaloAccountEntries(nodes) {
  const list = Array.isArray(nodes) ? nodes : [];
  const hasSelectZaloAccountNode = list.some(
    (node) => String(node.node_subtype || '').trim() === 'select_zalo_account'
  );
  const entries = [];
  for (const node of list) {
    const subtype = String(node.node_subtype || '').trim();
    const config = node.config || {};
    const push = (kind, ids) => entries.push({ nodeId: node.id, subtype, kind, ids });

    // select_zalo_account: pool bật + có id → nhóm (đạt nếu ít nhất một id đạt); ngược lại id đơn,
    // bỏ qua `zaloAccountId` còn sót khi pool đang bật.
    if (subtype === 'select_zalo_account') {
      const spec = getNodeOwnZaloAccountSpec(node);
      push(spec.multi ? 'group' : 'single', spec.ids);
      continue;
    }

    // Khi flow CÓ node chọn tài khoản, id riêng của các node gửi không phải id engine dùng
    // (đã kiểm ở nhánh select_zalo_account) → không đưa vào.
    if (subtype === 'send_zalo_personal' || subtype === 'send_zalo_friend_request' || subtype === 'send_zalo_group') {
      if (!hasSelectZaloAccountNode) {
        const spec = getNodeOwnZaloAccountSpec(node);
        push(spec.multi ? 'group' : 'single', spec.ids);
      }
      continue;
    }

    // get_all_friends/get_all_groups: nguồn tài khoản riêng qua node khác thì không giải tĩnh được.
    if (subtype === 'get_all_friends') {
      const accountSourceNodeId = String(config.zaloFriendAccountNodeId || '').trim();
      if (!accountSourceNodeId && !hasSelectZaloAccountNode) push('single', [config.zaloAccountId]);
      continue;
    }
    if (subtype === 'get_all_groups') {
      const accountSourceNodeId = String(config.zaloGroupAccountNodeId || '').trim();
      if (!accountSourceNodeId && !hasSelectZaloAccountNode) push('single', [config.zaloAccountId]);
      continue;
    }

    // Fallback: subtype zalo khác chưa mô hình hoá (vd `send_zalo` cũ) — giữ hành vi gom id như trước.
    if (subtype.startsWith('send_zalo')) {
      push('single', [config.zaloAccountId ?? config.accountId]);
    }
  }
  return entries;
}

export default { getNodeOwnZaloAccountSpec, resolveZaloAccountEntries, isTruthyConfigFlag, uniqueNonEmptyIds };
