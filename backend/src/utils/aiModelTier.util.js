/**
 * Model dự phòng cuối cùng — chỉ dùng khi KHÔNG đọc được model hệ thống (danh mục ai_models rỗng
 * hoặc CSDL lỗi). Đường bình thường luôn là model super admin chọn (aiModelPolicy.resolveAllowedModel).
 *
 * Đây vẫn là một tên viết cứng và sẽ lỗi thời như mọi tên viết cứng khác. Còn sống tới 24/09/2026
 * (danh mục đồng bộ đêm vẫn thấy Google liệt kê). Model dự phòng do admin chọn — xem
 * _internal/PLAN_MODEL_DU_PHONG_2026-09-24.md — là thứ thay được nó.
 */
export const DEFAULT_AI_MODEL = 'gemini-2.5-flash';

/**
 * @param {string|null|undefined} model
 * @returns {string}
 */
export function normalizeModelId(model) {
  return String(model || '').trim().toLowerCase();
}

// Từng có ở đây: AI_MODEL_TIERS (bảng thứ hạng 2.0-flash-lite → 1.5-flash → 2.0-flash → 2.5-flash →
// 2.5-pro) cùng 6 hàm xếp hạng/hạ model theo gói. Chúng thuộc chính sách "model theo gói" đã bị thay
// ngày 12/07/2026 bằng "1 model hệ thống do super admin chọn", và tới 24/09 không còn nơi nào gọi.
// Bảng đó chứa hai model Google đã khai tử: 1.5-flash và 2.0-flash (ngừng liệt kê từ 10/08).
// Đừng khôi phục — muốn bán model theo gói thì viết lại trên danh mục ai_models, không trên tên cứng.
