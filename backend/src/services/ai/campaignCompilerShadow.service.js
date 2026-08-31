/**
 * Campaign Compiler Shadow Compare Service (Giai đoạn 2 & 3 - Việc 2.3 & 3.2)
 *
 * Nhiệm vụ: Chạy song song compiler mới với hệ thống sinh script cũ,
 * so sánh cấu trúc đồ thị (nodes, connections, configs cốt lõi) và ghi log an toàn.
 * KHÔNG thay đổi kết quả trả về cho người dùng.
 */

import { compileCampaign } from './campaignCompiler.service.js';
import { deriveIntent, isCompilableIntent } from './campaignIntent.schema.js';

/**
 * Lấy subtype chuẩn của node từ compiler (chỉ chấp nhận nodeSubtype dạng camelCase).
 * @param {object} node
 * @returns {string}
 */
/**
 * Chuẩn hoá zaloAccountId trước khi so sánh.
 *
 * KHÔNG dùng `Number(a) !== Number(b)` trực tiếp: khi cả hai phía đều thiếu trường này —
 * đúng trạng thái bình thường của node gửi, vì tài khoản nằm ở `select_zalo_account` —
 * thì cả hai thành `NaN`, và `NaN !== NaN` luôn ĐÚNG. Bộ so sánh sẽ báo lệch cho hai
 * giá trị giống hệt nhau.
 *
 * @param {unknown} value
 * @returns {number|null} null nếu thiếu/rỗng/không phải số
 */
function normalizeAccountId(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

/**
 * Tài khoản Zalo mà RUNTIME thật sự dùng cho một node gửi.
 *
 * Đo trên production 31/08: 100% chiến dịch thật để trống `zaloAccountId` ở node gửi —
 * tài khoản chỉ nằm ở `select_zalo_account` phía trên, và node gửi thừa hưởng từ đó
 * (run 364 chạy trót lọt đúng theo cách này). Compiler thì ghi tường minh vào node gửi
 * vì registry khai `required: true` (campaignNodeRegistry.service.js:324-326).
 *
 * Hai dạng TƯƠNG ĐƯƠNG về ngữ nghĩa. So sánh thô từng trường sẽ báo lệch cho 106/110
 * campaign trong backtest 31/08 mà không có khác biệt thật nào về hành vi. Nên so
 * giá trị hiệu dụng: lấy ở node gửi, thiếu thì lấy ở `select_zalo_account`.
 *
 * @param {object} sendNode node gửi (đã có config)
 * @param {object[]} allNodes toàn bộ node cùng phía để tra ngược
 * @param {(n: object) => string} getSubtype hàm lấy subtype đúng cho phía đó
 * @returns {number|null}
 */
function resolveEffectiveZaloAccountId(sendNode, allNodes, getSubtype) {
  const own = normalizeAccountId((sendNode?.config || sendNode?.settings || {}).zaloAccountId);
  if (own !== null) return own;
  const selectNode = allNodes.find((n) => getSubtype(n) === 'select_zalo_account');
  return normalizeAccountId((selectNode?.config || selectNode?.settings || {}).zaloAccountId);
}

export function getCompiledNodeSubtype(node) {
  return String(node?.nodeSubtype || '');
}

/**
 * Lấy subtype từ node hệ thống cũ (chấp nhận nodeSubtype, node_subtype hoặc subtype).
 * Không fallback sang type hay node_type để tránh nhầm lẫn giữa loại cấp 1 và cấp 2.
 * @param {object} node
 * @returns {string}
 */
export function getLegacyNodeSubtype(node) {
  const sub = String(node?.nodeSubtype || node?.node_subtype || node?.subtype || '');
  if (sub === 'manual_trigger') return 'manual';
  return sub;
}

/**
 * So sánh đồ thị do compiler sinh ra với đồ thị do hệ thống cũ sinh ra.
 *
 * @param {object} compiledGraph - { nodes, connections, contentSlots }
 * @param {object} legacyScript - { nodes, connections }
 * @returns {{ match: boolean, differences: string[], summary: object }}
 */
export function compareCompiledWithLegacy(compiledGraph, legacyScript) {
  const differences = [];

  const rawCompiledNodes = Array.isArray(compiledGraph?.nodes) ? compiledGraph.nodes : [];
  const rawLegacyNodes = Array.isArray(legacyScript?.nodes) ? legacyScript.nodes : [];

  const rawCompiledConns = Array.isArray(compiledGraph?.connections) ? compiledGraph.connections : [];
  const rawLegacyConns = Array.isArray(legacyScript?.connections) ? legacyScript.connections : [];

  // Lọc bỏ node `end` ở cả 2 phía trước khi so sánh (Việc 2 - PLAN_SUA_SAU_BACKTEST)
  const compiledNodes = rawCompiledNodes.filter((n) => getCompiledNodeSubtype(n) !== 'end');
  const legacyNodes = rawLegacyNodes.filter((n) => getLegacyNodeSubtype(n) !== 'end');

  const compiledEndIds = new Set(
    rawCompiledNodes.filter((n) => getCompiledNodeSubtype(n) === 'end').map((n) => String(n.id || n.tempId))
  );
  const legacyEndIds = new Set(
    rawLegacyNodes.filter((n) => getLegacyNodeSubtype(n) === 'end').map((n) => String(n.id || n.tempId))
  );

  const compiledConns = rawCompiledConns.filter((c) => {
    const src = String(c.sourceNodeId ?? c.source_node_id ?? c.source ?? c.from ?? '');
    const tgt = String(c.targetNodeId ?? c.target_node_id ?? c.target ?? c.to ?? '');
    return !compiledEndIds.has(src) && !compiledEndIds.has(tgt);
  });
  const legacyConns = rawLegacyConns.filter((c) => {
    const src = String(c.sourceNodeId ?? c.source_node_id ?? c.source ?? c.from ?? '');
    const tgt = String(c.targetNodeId ?? c.target_node_id ?? c.target ?? c.to ?? '');
    return !legacyEndIds.has(src) && !legacyEndIds.has(tgt);
  });

  // 1. So sánh số lượng nodes
  if (compiledNodes.length !== legacyNodes.length) {
    differences.push(`Số lượng nodes không khớp: compiler=${compiledNodes.length}, legacy=${legacyNodes.length}`);
  }

  // 2. So sánh danh sách subtypes của nodes (siết chặt, không fallback mơ hồ)
  const compiledSubtypes = compiledNodes.map(getCompiledNodeSubtype).sort();
  const legacySubtypes = legacyNodes.map(getLegacyNodeSubtype).sort();

  if (JSON.stringify(compiledSubtypes) !== JSON.stringify(legacySubtypes)) {
    differences.push(
      `Danh sách node subtypes khác nhau: compiler=[${compiledSubtypes.join(', ')}], legacy=[${legacySubtypes.join(', ')}]`
    );
  }

  // 3. So sánh config của send node (Email)
  const compiledSendEmail = compiledNodes.find((n) => getCompiledNodeSubtype(n) === 'send_email');
  const legacySendEmail = legacyNodes.find((n) => getLegacyNodeSubtype(n) === 'send_email');

  if (compiledSendEmail && legacySendEmail) {
    const cCfg = compiledSendEmail.config || {};
    const lCfg = legacySendEmail.config || legacySendEmail.settings || {};

    if (Number(cCfg.fromEmailId) !== Number(lCfg.fromEmailId)) {
      differences.push(`fromEmailId khác nhau: compiler=${cCfg.fromEmailId}, legacy=${lCfg.fromEmailId}`);
    }

    if (cCfg.recipientSource !== (lCfg.recipientSource || 'node')) {
      differences.push(`recipientSource khác nhau: compiler=${cCfg.recipientSource}, legacy=${lCfg.recipientSource}`);
    }
  }

  // 4. So sánh config của send node (Zalo cá nhân)
  const compiledSendZalo = compiledNodes.find((n) => getCompiledNodeSubtype(n) === 'send_zalo_personal');
  const legacySendZalo = legacyNodes.find((n) => getLegacyNodeSubtype(n) === 'send_zalo_personal');

  if (compiledSendZalo && legacySendZalo) {
    const cAcc = resolveEffectiveZaloAccountId(compiledSendZalo, compiledNodes, getCompiledNodeSubtype);
    const lAcc = resolveEffectiveZaloAccountId(legacySendZalo, legacyNodes, getLegacyNodeSubtype);
    if (cAcc !== lAcc) {
      differences.push(`zaloAccountId hiệu dụng khác nhau: compiler=${cAcc}, legacy=${lAcc}`);
    }
  }

  // 5. So sánh config của send node (Zalo nhóm)
  const compiledSendZaloGroup = compiledNodes.find((n) => getCompiledNodeSubtype(n) === 'send_zalo_group');
  const legacySendZaloGroup = legacyNodes.find((n) => getLegacyNodeSubtype(n) === 'send_zalo_group');

  if (compiledSendZaloGroup && legacySendZaloGroup) {
    const cAcc = resolveEffectiveZaloAccountId(compiledSendZaloGroup, compiledNodes, getCompiledNodeSubtype);
    const lAcc = resolveEffectiveZaloAccountId(legacySendZaloGroup, legacyNodes, getLegacyNodeSubtype);
    if (cAcc !== lAcc) {
      differences.push(`zaloAccountId hiệu dụng khác nhau (nhóm): compiler=${cAcc}, legacy=${lAcc}`);
    }
  }

  // 6. So sánh số lượng connections
  if (compiledConns.length !== legacyConns.length) {
    differences.push(`Số lượng connections không khớp: compiler=${compiledConns.length}, legacy=${legacyConns.length}`);
  }

  const match = differences.length === 0;

  return {
    match,
    differences,
    summary: {
      compiledNodeCount: compiledNodes.length,
      legacyNodeCount: legacyNodes.length,
      compiledConnectionCount: compiledConns.length,
      legacyConnectionCount: legacyConns.length,
    },
  };
}

/**
 * Chạy shadow compare an toàn cho một campaign draft.
 *
 * @param {object} params
 * @param {object} params.legacyScript
 * @param {object} params.gateState
 * @param {object} [params.brief]
 * @returns {{ executed: boolean, match?: boolean, differences?: string[], error?: string }}
 */
export function runCompilerShadowCompare({ legacyScript, gateState, brief = null }) {
  try {
    const { intent } = deriveIntent(gateState, brief);
    const check = isCompilableIntent(intent);

    if (!check.ok) {
      return { executed: false, reason: `Intent chưa đủ điều kiện compile: missing [${check.missing.join(', ')}]` };
    }

    const compiledGraph = compileCampaign(intent);
    const result = compareCompiledWithLegacy(compiledGraph, legacyScript);

    if (!result.match) {
      console.log(
        `[Compiler Shadow Compare] Phát hiện khác biệt (${intent.channel}-${intent.schedule?.type}):`,
        result.differences
      );
    } else {
      console.log(`[Compiler Shadow Compare] ✅ Graph hoàn toàn khớp (${intent.channel}-${intent.schedule?.type})`);
    }

    return {
      executed: true,
      match: result.match,
      differences: result.differences,
    };
  } catch (err) {
    console.warn('[Compiler Shadow Compare] Lỗi khi chạy shadow compare (không ảnh hưởng user):', err.message);
    return { executed: false, error: err.message };
  }
}

export default {
  getCompiledNodeSubtype,
  getLegacyNodeSubtype,
  compareCompiledWithLegacy,
  runCompilerShadowCompare,
};
