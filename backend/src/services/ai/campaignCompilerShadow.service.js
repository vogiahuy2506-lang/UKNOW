/**
 * Campaign Compiler Shadow Compare Service (Giai đoạn 2 - Việc 2.3)
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
  return String(node?.nodeSubtype || node?.node_subtype || node?.subtype || '');
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

  const compiledNodes = Array.isArray(compiledGraph?.nodes) ? compiledGraph.nodes : [];
  const legacyNodes = Array.isArray(legacyScript?.nodes) ? legacyScript.nodes : [];

  const compiledConns = Array.isArray(compiledGraph?.connections) ? compiledGraph.connections : [];
  const legacyConns = Array.isArray(legacyScript?.connections) ? legacyScript.connections : [];

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

  // 3. So sánh config của send node (email/zalo)
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

  // 4. So sánh số lượng connections
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

    // Chỉ shadow compare cho các luồng đã hỗ trợ trong compiler (email-once, email-drip)
    if (intent.channel !== 'email') {
      return { executed: false, reason: `Luồng channel="${intent.channel}" chưa bật shadow compare` };
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
