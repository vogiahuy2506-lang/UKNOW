/**
 * Nhận diện các prompt do HỆ THỐNG tự sinh rồi gửi thay người dùng.
 *
 * Trợ lý gửi vài tin nhắn "role: user" mà người dùng chưa từng gõ — prompt xin kế hoạch
 * theo ngày, prompt soạn template cho từng slot. Lúc đang chat chúng được ẩn bằng cờ
 * `silentUser`, nhưng cờ đó chỉ sống trong bộ nhớ trình duyệt: backend lưu tin nhắn từ
 * `history` và không có cột nào cho nó.
 *
 * Hệ quả (báo ngày 25/08/2026): bấm "Chỉnh sửa" template rồi quay lại, hội thoại dựng lại
 * từ DB và nguyên đoạn "Tạo chi tiết template cho ngày 1, slot 1 (Email). Mục tiêu ngày:
 * … Khung giờ gửi: 08:30" hiện ra như thể người dùng vừa gõ. Bước dựng lại chỉ ẩn tin có
 * marker `[wizard]`, còn đây là văn bản thuần.
 *
 * Các chuỗi này do CHÍNH frontend sinh ra (AiChatbot.jsx — requestContentPlan và vòng lặp
 * soạn template theo slot), nên luật nhận diện thuộc về đây. Đổi câu chữ ở nơi sinh thì
 * phải đổi cả ở đây — test đi kèm dựng lại đúng chuỗi thật để bắt việc quên.
 */

/** "Hãy trả về content_plan JSON (…) cho: …" / "Return content_plan JSON only (…) for: …" */
const CONTENT_PLAN_REQUEST_RE = /^(?:Hãy trả về content_plan JSON|Return content_plan JSON only)/i;

/** "Tạo chi tiết template cho ngày 1, slot 1 (Email). …" */
const PLAN_TEMPLATE_PROMPT_RE = /^Tạo chi tiết template cho ngày\s*\d+/i;

/**
 * @param {string} content nội dung tin nhắn role=user
 * @returns {boolean} true nếu đây là prompt máy sinh, không được hiện cho người dùng
 */
export function isInternalAssistantPrompt(content = '') {
  const text = String(content || '').trim();
  if (!text) return false;
  return CONTENT_PLAN_REQUEST_RE.test(text) || PLAN_TEMPLATE_PROMPT_RE.test(text);
}

export const __testables = { CONTENT_PLAN_REQUEST_RE, PLAN_TEMPLATE_PROMPT_RE };
