/**
 * Danh sách mã + cách lấy nhãn cho trang Nhật ký hoạt động (tách khỏi AuditLogsPage.jsx vì file component
 * chỉ nên export component — quy tắc react-refresh/only-export-components).
 */

/**
 * Hành động có thể xuất hiện trong nhật ký của MỘT workspace (backend ghi bằng `logWorkspace`), xếp theo
 * nhóm để ô lọc dễ dò. Hành động cấp hệ thống (đăng nhập, gói, voucher, hoá đơn…) không nằm ở đây — chúng chỉ
 * có ở trang nhật ký của quản trị. Nhãn lấy từ `auditLogs.actions.*` trong i18n; mã nào có trong backend mà
 * thiếu nhãn thì `src/i18n/__tests__/auditLogLabels.spec.js` đỏ.
 */
export const WORKSPACE_AUDIT_ACTIONS = [
  'EMPLOYEE_ADDED', 'EMPLOYEE_REMOVED', 'EMPLOYEE_PERMISSIONS_UPDATED', 'EMPLOYEE_LIMITS_UPDATED',
  'EMPLOYEE_STATUS_UPDATED', 'EMPLOYEE_PASSWORD_RESET',
  'CAMPAIGN_CREATED', 'CAMPAIGN_UPDATED', 'CAMPAIGN_DELETED', 'CAMPAIGN_RUN_STARTED', 'CAMPAIGN_PAUSED',
  'CAMPAIGN_ACTIVATED',
  'CAMPAIGN_SCHEDULE_CREATED', 'CAMPAIGN_SCHEDULE_UPDATED', 'CAMPAIGN_SCHEDULE_TOGGLED', 'CAMPAIGN_SCHEDULE_DELETED',
  'CAMPAIGN_APPROVAL_REQUESTED', 'CAMPAIGN_APPROVAL_APPROVED', 'CAMPAIGN_APPROVAL_REJECTED',
  'CAMPAIGN_APPROVAL_THRESHOLD_UPDATED',
  'EMAIL_ACCOUNT_CONNECTED', 'ZALO_ACCOUNT_CONNECTED',
  'EMAIL_ACCOUNT_SEND_LIMIT_UPDATED', 'ZALO_ACCOUNT_SEND_LIMIT_UPDATED',
  'EMAIL_TEMPLATE_CREATED', 'EMAIL_TEMPLATE_UPDATED', 'EMAIL_TEMPLATE_DELETED',
  'ZALO_TEMPLATE_CREATED', 'ZALO_TEMPLATE_UPDATED', 'ZALO_TEMPLATE_DELETED',
  'CUSTOMER_CREATED', 'CUSTOMER_BULK_UPSERTED', 'CUSTOMER_UPDATED', 'CUSTOMER_DELETED',
  'LANDING_PAGE_CREATED', 'LANDING_PAGE_UPDATED', 'LANDING_PAGE_DELETED',
  'LANDING_DOMAIN_UPDATED', 'LANDING_DOMAIN_VERIFIED', 'LANDING_DOMAIN_SSL_PROVISIONED', 'LANDING_DOMAIN_DELETED',
  'LANDING_VERSION_RESTORED', 'LANDING_VERSION_DELETED',
  'FORM_PAYMENT_CONFIG_UPDATED',
  'CHATBOT_CREATED', 'CHATBOT_UPDATED', 'CHATBOT_DELETED',
  'CHATBOT_CHANNEL_CONNECTED', 'CHATBOT_CHANNEL_UPDATED', 'CHATBOT_CHANNEL_DISCONNECTED',
  'KNOWLEDGE_BASE_CREATED', 'KNOWLEDGE_BASE_UPDATED', 'KNOWLEDGE_BASE_DELETED',
  'KNOWLEDGE_DOCUMENT_CREATED', 'KNOWLEDGE_DOCUMENT_DELETED', 'KNOWLEDGE_DOCUMENT_REPROCESSED',
  'INBOX_REPLY_SENT', 'INBOX_REPLY_RETRIED', 'INBOX_CONVERSATION_DELETED', 'INBOX_AI_PAUSE_UPDATED',
  'MEDIA_UPLOADED', 'MEDIA_DELETED',
];

export const WORKSPACE_AUDIT_ENTITIES = [
  'employee', 'campaign', 'email_setting', 'zalo_setting', 'email_template', 'zalo_template', 'customer',
  'landing_page', 'landing_page_domain', 'landing_page_version', 'form',
  'chatbot', 'chatbot_channel', 'knowledge_base', 'knowledge_document',
  'inbox_conversation', 'inbox_message', 'media_object',
];

/** "SOME_NEW_ACTION" → "Some new action": lưới cuối cho mã chưa kịp có nhãn, để khách không thấy khoá dịch. */
const humanizeCode = (code) => {
  const text = String(code || '').replace(/_/g, ' ').trim().toLowerCase();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : '—';
};

/**
 * `t()` trả lại CHÍNH chuỗi khoá khi thiếu bản dịch, mà chuỗi đó là truthy — nên kiểu `t(key) || dự_phòng`
 * không bao giờ rơi xuống dự phòng và khách thấy nguyên "auditLogs.actions.LANDING_PAGE_CREATED".
 */
export function auditLabel(t, namespace, code) {
  if (!code) return '—';
  const key = `auditLogs.${namespace}.${code}`;
  const text = typeof t === 'function' ? t(key) : null;
  return text && text !== key ? text : humanizeCode(code);
}
