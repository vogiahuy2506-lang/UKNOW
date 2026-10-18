/**
 * Khối của bảng khối (Sơ đồ) mà máy chủ CHƯA chạy thật: `campaignRun.service.js` ghi "Node chưa có logic chạy riêng, bỏ qua". Bảng khối vẫn
 * hiện nhưng khoá nhãn "Sắp có" và không kéo thả được, để không ai dựng chiến dịch dựa vào khối không có tác dụng. Chiến dịch cũ đã có khối này
 * giữ nguyên trên sơ đồ. `tag_contact` đã chạy thật từ PLAN_TAG_KHACH_HANG PR-T2 nên KHÔNG nằm trong danh sách này.
 *
 * Khi máy chủ chạy thêm một khối ở đây, gỡ nó khỏi danh sách (và khỏi `NOT_RUN_SIDE_STEP_SUBTYPES` nếu là bước phụ ở tab Thiết lập).
 */
export const COMING_SOON_NODE_TYPES = Object.freeze(['condition', 'update_attribute']);

export const isComingSoonNodeType = (nodeType) => COMING_SOON_NODE_TYPES.includes(String(nodeType || ''));
