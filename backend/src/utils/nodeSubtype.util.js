/**
 * Trích xuất chuẩn hoá node subtype của một node trong kịch bản chiến dịch.
 *
 * Chấp nhận đúng 3 biến thể khoá: nodeSubtype (camelCase), node_subtype (snake_case), subtype.
 * Tuyệt đối KHÔNG đọc node_type / nodeType / type vì đó là phân loại cấp 1 (trigger, action, data, end),
 * không phải phân loại cấp 2 (send_email, send_zalo_personal...).
 *
 * @param {object|null|undefined} node
 * @returns {string} Chuỗi subtype viết thường, đã trim khoảng trắng
 */
export function getNodeSubtype(node) {
  return String(node?.nodeSubtype || node?.node_subtype || node?.subtype || '')
    .trim()
    .toLowerCase();
}
