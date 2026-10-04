/**
 * Trần chữ khách gõ vào AI sinh / sửa landing — PHẢI khớp backend `utils/landingAiInputLimits.util.js` (B-2).
 * Server chặn 400 trước khi gọi Gemini; ô nhập chặn sớm ở đây để khách không gõ/dán quá rồi mới bị báo.
 */
export const LANDING_AI_PROMPT_MAX_CHARS = 8000;
export const LANDING_AI_INSTRUCTION_MAX_CHARS = 4000;

/** Hiện câu nhắc khi đã dùng từ 90% trần. */
export const LANDING_AI_HINT_RATIO = 0.9;
