/**
 * Studio helpers — pure helpers used by the playground (file validation,
 * brand theme resolution). Kept separate from the React component file so
 * Fast Refresh can reload StudioEmptyState without re-running these.
 */
import { MAX_UPLOAD_FILE_MB } from '../../constants/uploadLimits';

/**
 * Validate a single file client-side before sending it to the server.
 * Returns a user-facing error string, or null if the file passes.
 */
export function clientValidateFile(file, maxMb = MAX_UPLOAD_FILE_MB) {
  const name = file.name || '';
  const lower = name.toLowerCase();
  if (lower.endsWith('.doc') && !lower.endsWith('.docx')) {
    return 'Chỉ nhận .docx, hãy Lưu thành .docx rồi gửi lại';
  }
  if (lower.endsWith('.ppt') && !lower.endsWith('.pptx')) {
    return 'Chỉ nhận .pptx, hãy Lưu thành .pptx rồi gửi lại';
  }
  if (lower.endsWith('.svg')) {
    return 'Không nhận file SVG';
  }
  const maxBytes = maxMb * 1024 * 1024;
  if (file.size > maxBytes) {
    return `File vượt dung lượng tối đa ${maxMb} MB`;
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
