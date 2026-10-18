/**
 * Áp cấu hình một khối vào đồ thị — hàm THUẦN, dùng chung cho hộp cấu hình của Sơ đồ khối (`handleNodeConfigSave`) và
 * thẻ khối sửa tại chỗ ở tab Thiết lập. Tách riêng để đường "Lưu ở thẻ = áp + lưu chiến dịch" lưu đúng bộ `nodes/edges`
 * MỚI (gọi `setNodes` rồi `handleSave()` cùng nhịp sẽ lưu bản cũ vì `handleSave` đọc state qua closure).
 *
 * Logic gỡ khối `get_all_friends` khi bật pool nhiều tài khoản giữ nguyên như trước khi tách.
 *
 * @param {object} params
 * @param {Array<object>} params.nodes
 * @param {Array<object>} params.edges
 * @param {object} params.node khối đang cấu hình
 * @param {object} params.formData form đã lưu (`label` + toàn bộ config)
 * @returns {{ nodes: Array<object>, edges: Array<object>, updatedNode: object, strippedFriendNodeIds: string[] }}
 *   `edges` giữ NGUYÊN tham chiếu khi không có cạnh nào bị gỡ
 */
export const applyNodeConfigToGraph = ({ nodes, edges, node, formData }) => {
  const nodeList = Array.isArray(nodes) ? nodes : [];
  const edgeList = Array.isArray(edges) ? edges : [];
  const savedNodeType = node?.data?.nodeType || node?.type;
  const poolOn = savedNodeType === 'select_zalo_account' && Boolean(formData?.zaloPoolMultiAccountEnabled);
  const poolIds = Array.isArray(formData?.zaloPoolAccountIds)
    ? formData.zaloPoolAccountIds.map((value) => String(value || '').trim()).filter(Boolean)
    : [];
  const shouldStripFriendListNodes = poolOn && poolIds.length > 0;

  const strippedFriendNodeIds = shouldStripFriendListNodes
    ? nodeList.filter((n) => (n.data?.nodeType || n.type) === 'get_all_friends').map((n) => n.id)
    : [];

  const updatedNode = {
    ...node,
    data: { ...node.data, label: formData.label, config: formData },
  };

  const mapped = nodeList.map((n) => (n.id === node.id ? updatedNode : n));
  const nextNodes = shouldStripFriendListNodes
    ? mapped.filter((n) => (n.data?.nodeType || n.type) !== 'get_all_friends')
    : mapped;
  const nextEdges = shouldStripFriendListNodes && strippedFriendNodeIds.length > 0
    ? edgeList.filter((e) => !strippedFriendNodeIds.includes(e.source) && !strippedFriendNodeIds.includes(e.target))
    : edges;

  return { nodes: nextNodes, edges: nextEdges, updatedNode, strippedFriendNodeIds };
};

export default applyNodeConfigToGraph;
