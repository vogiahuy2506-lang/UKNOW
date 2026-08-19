/**
 * Danh mục feature_key của bài hướng dẫn — nguồn duy nhất cho cả 3 nơi dùng:
 *  1. Dropdown chọn chủ đề ở màn quản trị bài viết
 *  2. Nhóm bài ở sidebar /huong-dan
 *  3. Icon "?" trên header (HelpHintLink) — key phải khớp thì mới ra bài
 *
 * Nhãn hiển thị nằm ở i18n `helpDocs.featureGroups.<key>` (vi.js / en.js).
 * Thêm key mới thì thêm ở CẢ hai chỗ, và thêm luật đường dẫn trong HelpHintLink
 * nếu muốn icon "?" trỏ tới bài đó.
 */
export const HELP_FEATURE_KEYS = Object.freeze({
  GETTING_STARTED: 'getting-started',
  AI_PROFILE: 'ai-profile',
  CHANNELS: 'channels',
  QUICK_SEND: 'quick-send',
  CAMPAIGN_CREATE: 'campaign-create',
  CUSTOMERS: 'khach-hang',
  CHATBOT: 'chatbot',
  INBOX: 'inbox',
  LANDING_PAGE: 'landing-page',
  PLAN_AND_BILLING: 'plan-and-billing',
  EMPLOYEES: 'nhan-vien',
  OTHER: 'khac',
});

/** Thứ tự hiển thị trong dropdown. */
export const HELP_FEATURE_KEY_LIST = Object.freeze([
  HELP_FEATURE_KEYS.GETTING_STARTED,
  HELP_FEATURE_KEYS.AI_PROFILE,
  HELP_FEATURE_KEYS.CHANNELS,
  HELP_FEATURE_KEYS.QUICK_SEND,
  HELP_FEATURE_KEYS.CAMPAIGN_CREATE,
  HELP_FEATURE_KEYS.CUSTOMERS,
  HELP_FEATURE_KEYS.CHATBOT,
  HELP_FEATURE_KEYS.INBOX,
  HELP_FEATURE_KEYS.LANDING_PAGE,
  HELP_FEATURE_KEYS.PLAN_AND_BILLING,
  HELP_FEATURE_KEYS.EMPLOYEES,
  HELP_FEATURE_KEYS.OTHER,
]);

/**
 * Nhãn tiếng Việt cho một feature key. Key lạ (bài cũ) thì trả lại chính nó
 * để không giấu mất dữ liệu đang có.
 * @param {(key: string) => string} t hàm dịch
 * @param {string} key
 */
export function helpFeatureKeyLabel(t, key) {
  if (!key) return '';
  const path = `helpDocs.featureGroups.${key}`;
  const translated = t(path);
  return translated === path ? key : translated;
}
