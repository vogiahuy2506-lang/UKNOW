/**
 * Nhãn "tệp đang dùng ở đâu" của Thư viện media, dịch theo ngôn ngữ người dùng.
 *
 * Backend (`REFERENCE_CONFIGS` ở storageReference.service.js) trả `referenceType` + nhãn tiếng Việt cứng; frontend dịch theo
 * `referenceType` (cùng kiểu `STORAGE_QUOTA_EXCEEDED` ở api.js) để người dùng tiếng Anh không đọc tiếng Việt. Bảng khoá là
 * hằng số tĩnh (không `t(\`...${type}\`)` động) để phép quét khoá của translationKeys.spec nhìn thấy; spec
 * storageReferenceLabels.spec.js đối chiếu với mã nguồn backend — thêm kiểu tham chiếu mà quên dòng ở đây là đỏ.
 */
export const REFERENCE_LABEL_KEYS = Object.freeze({
  business_profile: 'mediaLibrary.reference.business_profile',
  campaign_node: 'mediaLibrary.reference.campaign_node',
  chat_attachment: 'mediaLibrary.reference.chat_attachment',
  custom_chatbot: 'mediaLibrary.reference.custom_chatbot',
  email_template: 'mediaLibrary.reference.email_template',
  form: 'mediaLibrary.reference.form',
  form_payment_receipt: 'mediaLibrary.reference.form_payment_receipt',
  help_article: 'mediaLibrary.reference.help_article',
  landing: 'mediaLibrary.reference.landing',
  landing_page: 'mediaLibrary.reference.landing_page',
  landing_page_version: 'mediaLibrary.reference.landing_page_version',
  landing_featured_course: 'mediaLibrary.reference.landing_featured_course',
  landing_page_section: 'mediaLibrary.reference.landing_page_section',
  landing_page_template: 'mediaLibrary.reference.landing_page_template',
  landing_testimonial: 'mediaLibrary.reference.landing_testimonial',
  sub_assistant: 'mediaLibrary.reference.sub_assistant',
  template_file: 'mediaLibrary.reference.template_file',
  web_widget_config: 'mediaLibrary.reference.web_widget_config',
  zalo_template: 'mediaLibrary.reference.zalo_template',
});

/** Nguồn của tệp chat (`chat_attachments.source`). `inbox_outbound` lấy theo tên menu Hộp thư (nav.inbox) nên không có ở đây. */
export const SOURCE_LABEL_KEYS = Object.freeze({
  ai_assistant: 'mediaLibrary.source.ai_assistant',
  chatbot_studio: 'mediaLibrary.source.chatbot_studio',
  chatbot_web: 'mediaLibrary.source.chatbot_web',
});

/**
 * Nhãn của một kiểu tham chiếu. `t()` trả CHÍNH KHOÁ khi thiếu bản dịch (không trả rỗng), nên so với khoá để biết có
 * dịch được không; kiểu lạ thì dùng nhãn backend gửi kèm, cuối cùng mới đến mã thô (để thấy mà bổ sung).
 */
export function resolveReferenceLabel(referenceType, backendLabel, t) {
  const key = REFERENCE_LABEL_KEYS[referenceType];
  if (key) {
    const text = t(key);
    if (text && text !== key) return text;
  }
  return backendLabel || referenceType || '';
}

/** Nhãn nguồn tệp chat; nguồn lạ → null (không hiện dòng nguồn thay vì in mã thô). */
export function resolveSourceLabel(source, t) {
  if (source === 'inbox_outbound') return t('nav.inbox');
  const key = SOURCE_LABEL_KEYS[source];
  if (!key) return null;
  const text = t(key);
  return text && text !== key ? text : null;
}
