import buildSettingsOrder from './buildSettingsOrder';
import describeNodeSettings from './describeNodeSettings';

/** Bốn dòng của checklist "Trước khi chạy", đúng thứ tự hiển thị. */
export const CHECKLIST_KEYS = Object.freeze(['sender', 'audience', 'content', 'timing']);

const MAX_SHOWN = 1;

/**
 * Checklist "Trước khi chạy" của tab Thiết lập — HÀM THUẦN. Gộp các dòng của `describeNodeSettings` theo trường `role`
 * (một nguồn sự thật: điều kiện "thiếu" là `tone: 'missing'` sẵn có, KHÔNG viết lại ở đây).
 *
 * - Vai không có khối nào (vd chiến dịch trống) → `missing`, `targetNodeId = null`.
 * - Có dòng thiếu → `missing`, `targetNodeId` = khối giữ dòng thiếu ĐẦU TIÊN theo thứ tự chạy; không thiếu → khối đầu tiên của vai.
 * - 'timing' luôn `ok` (chạy tay là hợp lệ); tóm tắt = lịch chạy của chiến dịch nếu có.
 *
 * @param {Array<object>} nodes
 * @param {Array<object>} edges
 * @param {object} lookups dữ liệu tra tên (như `describeNodeSettings`)
 * @param {(key: string, params?: object) => string} t
 * @param {{ scheduleSummary?: string }} [extras]
 * @returns {Array<{ key: string, status: 'ok'|'missing', summary: string, targetNodeId: string|null }>}
 */
export function buildSettingsChecklist(nodes, edges, lookups, t, extras = {}) {
  const { ordered, unconnected } = buildSettingsOrder(nodes, edges);
  const allNodes = [...ordered.map((entry) => entry.node), ...unconnected];
  const fullLookups = { ...(lookups || {}), nodes: Array.isArray(nodes) ? nodes : [] };

  const byRole = { sender: [], audience: [], content: [] };
  allNodes.forEach((node) => {
    describeNodeSettings(node, fullLookups, t).forEach((item) => {
      if (byRole[item.role]) byRole[item.role].push({ node, item });
    });
  });

  // Dòng Gửi từ / Gửi cho ai đã có tiêu đề ở checklist → chỉ in giá trị; Nội dung giữ nhãn "Tin N" để biết tin nào.
  const textOf = (key, item) => (key === 'content' ? `${item.label}: ${item.value}` : item.value);
  const summarize = (key, entries) => {
    const texts = [];
    entries.forEach(({ item }) => {
      const textValue = textOf(key, item);
      if (!texts.includes(textValue)) texts.push(textValue);
    });
    const rest = texts.length - MAX_SHOWN;
    return rest > 0 ? `${texts.slice(0, MAX_SHOWN).join(' · ')} +${rest}` : texts.join(' · ');
  };

  const rows = ['sender', 'audience', 'content'].map((key) => {
    const entries = byRole[key];
    if (entries.length === 0) {
      return { key, status: 'missing', summary: t('campaignSettings.checklist.none'), targetNodeId: null };
    }
    const firstMissing = entries.find(({ item }) => item.tone === 'missing');
    if (firstMissing) {
      return {
        key,
        status: 'missing',
        summary: textOf(key, firstMissing.item),
        targetNodeId: String(firstMissing.node.id),
      };
    }
    return { key, status: 'ok', summary: summarize(key, entries), targetNodeId: String(entries[0].node.id) };
  });

  rows.push({
    key: 'timing',
    status: 'ok',
    summary: extras.scheduleSummary || t('campaignSettings.checklist.timingManual'),
    targetNodeId: null,
  });
  return rows;
}

export default buildSettingsChecklist;
