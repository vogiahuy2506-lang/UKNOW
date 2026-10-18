/**
 * Hàm dùng chung của lớp đọc/ghi theo MỤC của tab Thiết lập (PLAN_THIET_LAP_BIEU_MAU_RIENG PR-E1). Thuần: không React, không mạng.
 * Nguyên tắc ghi: CHỈ đổi đúng các trường mà mục hiểu, giữ nguyên object config còn lại; không có gì đổi → trả lại NGUYÊN mảng cũ.
 */

export const idOf = (value) => String(value ?? '');
export const subtypeOf = (node) => String(node?.data?.nodeType || node?.type || '');
export const text = (value) => String(value ?? '').trim();
export const list = (value) => (Array.isArray(value) ? value : []);

/** So sánh giá trị cấu hình theo nội dung (mảng / object lồng nhau). */
export const sameValue = (a, b) => {
  if (a === b) return true;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
};

export const configOf = (node) => (node?.data?.config && typeof node.data.config === 'object' ? node.data.config : {});

/**
 * Vá `patch` vào config của MỘT khối. Giá trị `undefined` = xoá trường. Không trường nào đổi → trả đúng mảng `nodes` cũ.
 * @returns {Array<object>}
 */
export const setConfigFields = (nodes, nodeId, patch) => {
  const id = idOf(nodeId);
  const index = list(nodes).findIndex((node) => idOf(node.id) === id);
  if (index < 0) return nodes;
  const node = nodes[index];
  const config = configOf(node);
  const changed = Object.entries(patch).some(([key, value]) => (
    value === undefined ? Object.prototype.hasOwnProperty.call(config, key) : !sameValue(config[key], value)
  ));
  if (!changed) return nodes;
  const nextConfig = { ...config };
  Object.entries(patch).forEach(([key, value]) => {
    if (value === undefined) delete nextConfig[key];
    else nextConfig[key] = value;
  });
  const next = nodes.slice();
  next[index] = { ...node, data: { ...node.data, config: nextConfig } };
  return next;
};

export const isFlagOn = (value) => value === true || value === 1 || text(value).toLowerCase() === 'true' || text(value) === '1';
