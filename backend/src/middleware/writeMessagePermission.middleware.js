import { requirePermission } from './authorization.middleware.js';

// "Viết bằng AI" (POST /ai/write-message) dùng một route cho hai nơi gọi, nên khoá quyền theo nơi gọi (PLAN_AI_VIET_MAU_TIN_2026-10-19.md):
// - context 'campaign' (mục Nội dung của chiến dịch) → campaigns_create, như chỗ lưu chiến dịch;
// - context 'template' (trang mẫu tin) → email_templates cho email, zalo_templates cho các kênh tin nhắn (đúng khoá của routes/emailTemplate + zaloTemplate).
// context thiếu → coi là 'template'. Giá trị lạ → 400 (không để lọt sang quyền lỏng hơn). Kiểm quyền chạy TRƯỚC kiểm hạn mức credit.
const CHANNELS = ['email', 'zalo', 'telegram', 'whatsapp'];
const checkers = {
  campaign: requirePermission('campaigns_create'),
  email: requirePermission('email_templates'),
  message: requirePermission('zalo_templates'),
};

export function requireWriteMessagePermission(req, res, next) {
  const context = req.body?.context ?? 'template';
  const channel = req.body?.channel;
  if (context !== 'template' && context !== 'campaign') {
    return res.status(400).json({ success: false, message: 'context không hợp lệ', code: 'invalid_context' });
  }
  if (!CHANNELS.includes(channel)) {
    return res.status(400).json({ success: false, message: 'channel không hợp lệ', code: 'invalid_channel' });
  }
  const key = context === 'campaign' ? 'campaign' : (channel === 'email' ? 'email' : 'message');
  return checkers[key](req, res, next);
}

export default requireWriteMessagePermission;
