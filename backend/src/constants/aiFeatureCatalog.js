/**
 * Bảng ánh xạ MÃ tính năng AI → NHÓM tính năng, dùng chung cho mọi màn cần "tính năng nào tốn bao nhiêu"
 * (PLAN_SO_LIEU_DUNG_GON_KHOP_2026-09-30, PR-8; audit_ai.md C-21).
 *
 * Mã lấy từ `usage_logs.metadata.feature` của dòng `resource_type = 'ai_token'` — nơi ghi là `aiUsageMeter.record`
 * (`aiUsageMeter.service.js`) và `recordEmbeddingUsage` (`embeddingClient.util.js`, thêm `metadata.kind = 'embedding'`).
 * Dòng của khách vãng lai / hệ thống (chat tư vấn trang chủ, trợ giúp chưa đăng nhập) có `id_user = NULL` (migration 273).
 * Tên hiển thị (tiếng Việt/Anh) nằm ở i18n phía giao diện, khoá `adminAiUsage.group.<nhóm>` — backend chỉ trả MÃ NHÓM.
 *
 * Bộ mã TÍNH PHÍ (credit: `ai_assistant_chat`, `chatbot_zalo_personal`, …) là bộ tên khác; chưa nối vào đây vì
 * trang chi phí chỉ đọc dòng token. Khi cần nối token ↔ credit thì thêm bảng ánh xạ credit → nhóm ở file này.
 */

export const AI_FEATURE_GROUPS = Object.freeze({
  CHATBOT: 'chatbot',
  ASSISTANT: 'assistant',
  LANDING: 'landing',
  CAMPAIGN: 'campaign',
  INSIGHTS: 'insights',
  HELP: 'help',
  // Chat tư vấn trang chủ cho khách vãng lai (không có tài khoản, ghi id_user NULL) — chi phí tiếp thị, tách khỏi trợ giúp.
  HERO: 'hero',
  // "Nạp tài liệu": embedding VÀ đọc chữ trong ảnh/PDF (OCR) — chi phí lập chỉ mục, không phải lượt trả lời. Mã nhóm giữ
  // 'embedding' (đã có trong API + i18n); nhãn hiển thị là "Nạp tài liệu (không tính lượt)".
  EMBEDDING: 'embedding',
  OTHER: 'other',
});

/** Mã tính năng đã biết → nhóm. Mã lạ rơi về `other` (không bao giờ ném lỗi, không mất dòng chi phí). */
export const AI_FEATURE_GROUP_BY_CODE = Object.freeze({
  chatbot_reply: AI_FEATURE_GROUPS.CHATBOT,
  kb_chat: AI_FEATURE_GROUPS.CHATBOT,
  smart_chat: AI_FEATURE_GROUPS.ASSISTANT,
  // "AI viết hộ" chỉ dẫn cho chatbot (D-23, PR-10): trước đây ghi chung `smart_chat` — giữ nhóm "Trợ lý AI" để báo cáo không đứt mạch.
  ai_generate_system_instruction: AI_FEATURE_GROUPS.ASSISTANT,
  // Dịch dòng tính năng gói (công cụ ADMIN, D-22): nhóm trợ giúp/tư vấn gói — nhóm này không tính là "khách đang dùng AI" nên một admin bấm
  // dịch không làm số khách dùng AI nhích lên (rơi về `other` thì CÓ tính).
  admin_plan_translate: AI_FEATURE_GROUPS.HELP,
  landing_page: AI_FEATURE_GROUPS.LANDING,
  landing_template: AI_FEATURE_GROUPS.LANDING,
  campaign_script: AI_FEATURE_GROUPS.CAMPAIGN,
  campaign_registry: AI_FEATURE_GROUPS.CAMPAIGN,
  // Điền nội dung chiến dịch bằng LLM (campaignSlotFiller) — nằm trong 1 lượt sinh chiến dịch, cùng nhóm với kịch bản/registry.
  campaign_slots: AI_FEATURE_GROUPS.CAMPAIGN,
  dashboard_insights: AI_FEATURE_GROUPS.INSIGHTS,
  inbox_ai_summary: AI_FEATURE_GROUPS.INSIGHTS,
  // Đọc chữ trong ảnh / PDF quét khi nạp tài liệu vào kho kiến thức (fileExtractor): ghi cho chủ chatbot, không trừ credit.
  kb_ocr: AI_FEATURE_GROUPS.EMBEDDING,
  hero_consultation: AI_FEATURE_GROUPS.HERO,
});

/**
 * Nhóm của một dòng usage. Embedding nhận diện theo `kind = 'embedding'` HOẶC tiền tố `embedding` của mã
 * (`embedding_rag_query`, `embedding_kb_ingest`, …; mã mặc định khi người gọi không đặt là `embedding`).
 * Trợ giúp: tiền tố `help_` (`help_route`, `help_answer`, `help_answer_soft`, `help_plan_advice`, `help_translate`, `help_translate_caption`).
 *
 * @param {string|null|undefined} feature `metadata.feature`
 * @param {string|null|undefined} [kind] `metadata.kind`
 * @returns {string} một giá trị của AI_FEATURE_GROUPS
 */
export function resolveAiFeatureGroup(feature, kind = '') {
  const code = String(feature || '');
  if (String(kind || '') === 'embedding' || code.startsWith('embedding')) return AI_FEATURE_GROUPS.EMBEDDING;
  if (AI_FEATURE_GROUP_BY_CODE[code]) return AI_FEATURE_GROUP_BY_CODE[code];
  if (code.startsWith('help_')) return AI_FEATURE_GROUPS.HELP;
  return AI_FEATURE_GROUPS.OTHER;
}

/** Nhóm này có được đếm là "lượt gọi AI" không. Nạp tài liệu (embedding, OCR) KHÔNG phải lượt trả lời/soạn nội dung. */
export function groupCountsAsCall(group) {
  return group !== AI_FEATURE_GROUPS.EMBEDDING;
}

/**
 * Nhóm này có tính là "khách đang dùng AI" không: chủ chỉ nạp tài liệu hoặc chỉ hỏi trợ giúp thì chưa phải
 * khách dùng tính năng AI trả tiền; chat tư vấn trang chủ là khách vãng lai (không có tài khoản).
 */
export function groupCountsAsCustomerUse(group) {
  return group !== AI_FEATURE_GROUPS.EMBEDDING
    && group !== AI_FEATURE_GROUPS.HELP
    && group !== AI_FEATURE_GROUPS.HERO;
}
