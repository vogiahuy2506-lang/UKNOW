import { isTriggerNodeType } from '../utils/campaignBuilderFlow';

const idOf = (value) => String(value ?? '');
const subtypeOf = (node) => String(node?.data?.nodeType || node?.type || '');

/**
 * Sắp các khối theo THỨ TỰ CHẠY cho tab Thiết lập: đi từ khối khởi chạy theo cạnh (theo chiều rộng, giữ thứ tự cạnh đã nối),
 * mỗi khối một lần. Khối không với tới được từ khối khởi chạy xếp riêng vào `unconnected`.
 * Khối đi ra từ một cạnh có nhãn (nhánh của khối «Điều kiện») mang `branch = { label, fromId }`.
 * Khối `end` (kết thúc) không có gì để cài nên bị bỏ khỏi danh sách.
 *
 * @param {Array<object>} nodes khối ReactFlow
 * @param {Array<object>} edges cạnh ReactFlow `{ source, target, label }`
 * @returns {{ ordered: Array<{ node: object, step: number, branch: { label: string, fromId: string }|null }>, unconnected: Array<object> }}
 */
export default function buildSettingsOrder(nodes, edges) {
  const nodeList = (Array.isArray(nodes) ? nodes : []).filter((node) => node && node.type !== 'end');
  const edgeList = Array.isArray(edges) ? edges : [];
  const byId = new Map(nodeList.map((node) => [idOf(node.id), node]));

  const outgoing = new Map();
  const incomingCount = new Map();
  edgeList.forEach((edge) => {
    const source = idOf(edge.source);
    const target = idOf(edge.target);
    if (!byId.has(source) || !byId.has(target)) return;
    if (!outgoing.has(source)) outgoing.set(source, []);
    outgoing.get(source).push(edge);
    incomingCount.set(target, (incomingCount.get(target) || 0) + 1);
  });

  const triggers = nodeList.filter((node) => isTriggerNodeType(subtypeOf(node)));
  const roots = triggers.length > 0 ? triggers : nodeList.filter((node) => !incomingCount.get(idOf(node.id)));

  const visited = new Set();
  const ordered = [];
  const queue = roots.map((node) => ({ node, branch: null }));
  while (queue.length > 0) {
    const { node, branch } = queue.shift();
    const id = idOf(node.id);
    if (visited.has(id)) continue;
    visited.add(id);
    ordered.push({ node, step: ordered.length + 1, branch });
    (outgoing.get(id) || []).forEach((edge) => {
      const target = byId.get(idOf(edge.target));
      if (!target || visited.has(idOf(target.id))) return;
      const label = String(edge.label ?? '').trim();
      queue.push({ node: target, branch: label ? { label, fromId: id } : null });
    });
  }

  return { ordered, unconnected: nodeList.filter((node) => !visited.has(idOf(node.id))) };
}
