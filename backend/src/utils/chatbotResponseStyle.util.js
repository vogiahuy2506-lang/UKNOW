/**
 * Cau huong dan "phong cach tra loi" cua chatbot (custom_chatbots.response_style).
 * Dung chung cho chatRouter.buildSystemPrompt (Zalo/Telegram/WhatsApp/OA/Facebook) va
 * customChat.service.chat (widget web / iFrame / Public Link) de moi kenh cung mot cau chu.
 */
export const RESPONSE_STYLE_INSTRUCTIONS = {
  friendly: 'Than thien, gan gui, dung emoji phu hop.',
  professional: 'Chuyen nghiep, ngan gon, suc tich.',
  casual: 'Than thien nhung thoai mai, co the dung tieng long nhe.',
  empathetic: 'Thau hieu, an can, chu dao, dong cam voi khach.',
  concise: 'Tra loi dung trong tam, it thua, khong dai dong.',
  creative: 'Y tuong moi, goi mo, da dang.',
};

export function getResponseStyleInstruction(style) {
  return RESPONSE_STYLE_INSTRUCTIONS[style] || RESPONSE_STYLE_INSTRUCTIONS.friendly;
}
