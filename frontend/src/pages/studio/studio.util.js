/**
 * Studio helpers — pure helpers used by the playground (file validation,
 * brand theme resolution). Kept separate from the React component file so
 * Fast Refresh can reload StudioEmptyState without re-running these.
 */
import { MAX_UPLOAD_FILE_MB } from '../../constants/uploadLimits';

/**
 * Validate a single file client-side before sending it to the server.
 * Returns a user-facing error string (dịch qua `t` truyền vào), or null if the file passes.
 */
export function clientValidateFile(file, maxMb = MAX_UPLOAD_FILE_MB, t = (key) => key) {
  const name = file.name || '';
  const lower = name.toLowerCase();
  if (lower.endsWith('.doc') && !lower.endsWith('.docx')) {
    return t('chatbot.studio.errDocOnly');
  }
  if (lower.endsWith('.ppt') && !lower.endsWith('.pptx')) {
    return t('chatbot.studio.errPptOnly');
  }
  if (lower.endsWith('.svg')) {
    return t('chatbot.studio.errSvg');
  }
  const maxBytes = maxMb * 1024 * 1024;
  if (file.size > maxBytes) {
    return t('chatbot.studio.errFileTooBig', { max: maxMb });
  }
  return null;
}

/**
 * Resolve the chatbot's branding colors into CSS-ready values, falling
 * back to the Founder AI orange palette when the bot hasn't been themed.
 */
export function getChatbotTheme(chatbot) {
  const primaryColor = chatbot?.primary_color || '#ee7518';
  const accentColor = chatbot?.accent_color || '#f19342';
  const bgColor = chatbot?.background_color || '#FFFFFF';
  const textColor = chatbot?.text_color || '#0f172a';
  const gradientStyle = `linear-gradient(135deg, ${primaryColor}, ${accentColor})`;
  return { primaryColor, accentColor, bgColor, textColor, gradientStyle };
}

/**
 * Tóm tắt "chatbot đang chạy ở đâu" từ các số đếm của API danh sách (S-05): Web chỉ khi có hội thoại web gần đây,
 * các kênh nhắn tin theo số tài khoản đang BẬT chatbot này. Thiếu trường (bot vừa tạo) = 0 = chưa chạy ở đâu.
 *
 * @returns {Array<{ channel: 'web'|'zalo_personal'|'telegram'|'whatsapp', count: number }>}
 */
export function summarizeDeployment(bot) {
  const parts = [];
  if (bot?.web_active) parts.push({ channel: 'web', count: 1 });
  const zalo = Number(bot?.zalo_personal_count) || 0;
  const telegram = Number(bot?.telegram_count) || 0;
  const whatsapp = Number(bot?.whatsapp_count) || 0;
  if (zalo > 0) parts.push({ channel: 'zalo_personal', count: zalo });
  if (telegram > 0) parts.push({ channel: 'telegram', count: telegram });
  if (whatsapp > 0) parts.push({ channel: 'whatsapp', count: whatsapp });
  return parts;
}
