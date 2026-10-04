/**
 * Rà soát C P2-7 (04/10/2026) — lưới CUỐI cho nguồn người nhận "lead của landing" trong chiến dịch do trợ lý AI dựng.
 *
 * Node `read_landing_leads` với `landingLeadsSlugs: []` đọc MỌI lead của MỌI landing trong workspace (lead.service.js lọc theo slug
 * chỉ khi mảng không rỗng). Trước đây hai đường dựng ra mảng rỗng mà người dùng không hề chọn: (1) model viết node không có slug,
 * (2) FE vá node khách DB thành `read_landing_leads` với `landingLeadsSlugs: []`. Tin gửi nhầm người không thu hồi được.
 *
 * Hàm thuần (không I/O) để test trực tiếp và dùng đúng một chỗ trong `processSmartChat`:
 *  - người dùng ĐÃ chọn (≥ 1 slug, hoặc "Tất cả landing" tường minh) → ghi lựa chọn đó lên MỌI node `read_landing_leads` (đè giá
 *    trị model tự điền) và, nếu model dựng nguồn "khách trong DB" thay vì landing, đổi node đó thành `read_landing_leads`;
 *  - CHƯA chọn mà script có node `read_landing_leads` slug rỗng → `needs_choice` (nơi gọi hỏi lại cổng chọn landing).
 */

const subtypeOf = (node) => String(node?.nodeSubtype || node?.node_subtype || node?.subtype || '').toLowerCase();

const configOf = (node) => node?.config || node?.nodeConfig || node?.settings || {};

const slugListOf = (node) => {
  const raw = configOf(node).landingLeadsSlugs;
  return (Array.isArray(raw) ? raw : []).map((slug) => String(slug ?? '').trim()).filter(Boolean);
};

/** Người dùng đã chọn nguồn lead landing chưa (≥ 1 slug, hoặc "Tất cả landing" tường minh). */
export const landingSelectionOf = (state) => {
  const slugs = Array.isArray(state?.landingLeadsSlugs)
    ? state.landingLeadsSlugs.map((slug) => String(slug ?? '').trim()).filter(Boolean)
    : [];
  const all = state?.landingLeadsAll === true;
  return { chosen: all || slugs.length > 0, all, slugs: all ? [] : slugs };
};

/**
 * @param {{ nodes?: Array<object> }|null} script
 * @param {{ dataSource?: string|null, channel?: string|null, landingLeadsSlugs?: string[], landingLeadsAll?: boolean }} state wizard gates
 * @returns {{ status: 'none'|'applied'|'needs_choice', updatedNodes: number, convertedNodes: number }}
 */
export function resolveLandingAudienceChoice(script, state) {
  const result = { status: 'none', updatedNodes: 0, convertedNodes: 0 };
  const nodes = Array.isArray(script?.nodes) ? script.nodes : null;
  if (!nodes) return result;

  const landingNodes = nodes.filter((node) => subtypeOf(node) === 'read_landing_leads');
  const selection = landingSelectionOf(state);

  if (!selection.chosen) {
    if (landingNodes.some((node) => slugListOf(node).length === 0)) result.status = 'needs_choice';
    return result;
  }

  // Dấu hiệu "người dùng đã chọn TƯỜNG MINH Tất cả landing" đi cùng script qua vòng frontend → thẻ xác nhận (campaignConfirmation
  // .service.js) chỉ chấp nhận node lead landing slug rỗng khi có dấu này.
  if (selection.all) script.landingLeadsAll = true;
  else delete script.landingLeadsAll;

  for (const node of landingNodes) {
    node.config = { ...configOf(node), landingLeadsSlugs: [...selection.slugs] };
    result.updatedNodes += 1;
  }

  // Model bỏ qua dataSource="landing" mà dựng "khách trong DB" → người nhận sẽ là MỌI khách trong DB, không phải người đã đăng ký
  // landing đã chọn. Đổi nguồn đó thành node lead landing (cùng id nên các node gửi vẫn trỏ đúng). Chỉ khi chưa có node nguồn landing/
  // biểu mẫu nào — có rồi thì không thêm nguồn thứ hai.
  const hasLandingOrFormSource = landingNodes.length > 0
    || nodes.some((node) => subtypeOf(node) === 'read_form_submissions');
  if (state?.dataSource === 'landing' && !hasLandingOrFormSource) {
    for (const node of nodes) {
      if (subtypeOf(node) !== 'interested_customers') continue;
      node.nodeSubtype = 'read_landing_leads';
      if (node.node_subtype !== undefined) node.node_subtype = 'read_landing_leads';
      node.nodeName = 'Lead từ Landing Page';
      if (node.node_name !== undefined) node.node_name = 'Lead từ Landing Page';
      node.nodeDescription = 'Danh sách đăng ký từ Landing Page.';
      if (node.node_description !== undefined) node.node_description = 'Danh sách đăng ký từ Landing Page.';
      node.config = { landingLeadsSlugs: [...selection.slugs] };
      result.convertedNodes += 1;
    }
  }

  result.status = result.updatedNodes + result.convertedNodes > 0 ? 'applied' : 'none';
  return result;
}
