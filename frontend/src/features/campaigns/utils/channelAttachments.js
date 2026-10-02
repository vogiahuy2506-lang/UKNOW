/**
 * P5 (PLAN_TG_WA_DAY_DU) — đính kèm ảnh/tài liệu cho tin Telegram/WhatsApp (node chiến dịch + gửi nhanh).
 *
 * Hằng số PHẢN CHIẾU backend `backend/src/utils/channelMediaSend.util.js` (CHANNEL_MEDIA_MAX_*,
 * TELEGRAM_PHOTO_EXTENSIONS, WHATSAPP_IMAGE_EXTENSIONS) — test `channelAttachments.spec.js` ghim đúng các giá trị đó.
 * Backend vẫn kiểm lại bằng byte thật; ở đây chỉ để báo sớm cho người dùng.
 */

export const CHANNEL_ATTACHMENT_LIMITS = Object.freeze({
  maxImages: 5,
  maxDocuments: 3,
  maxTotalBytes: 20 * 1024 * 1024,
});

/** Đuôi tệp được gửi như ẢNH theo kênh (còn lại gửi như tài liệu). */
export const CHANNEL_IMAGE_EXTENSIONS = Object.freeze({
  telegram: Object.freeze(['jpg', 'jpeg', 'png']),
  whatsapp: Object.freeze(['jpg', 'jpeg', 'png', 'webp']),
});

const extensionOf = (name) => {
  const text = String(name || '');
  const dot = text.lastIndexOf('.');
  return dot >= 0 ? text.slice(dot + 1).toLowerCase() : '';
};

/** Tên hiển thị của một tệp đính kèm (metadata mẫu tin hoặc kết quả tải lên gửi nhanh). */
export const getAttachmentDisplayName = (attachment) => String(
  attachment?.displayName
  || attachment?.originalName
  || attachment?.name
  || attachment?.fileName
  || String(attachment?.key || '').split('/').pop()
  || ''
);

/** 'image' | 'document' theo kênh. */
export const classifyChannelAttachment = (attachment, channel) => {
  const extensions = CHANNEL_IMAGE_EXTENSIONS[channel] || [];
  return extensions.includes(extensionOf(getAttachmentDisplayName(attachment))) ? 'image' : 'document';
};

/**
 * Kiểm số ảnh / số tài liệu / tổng dung lượng khai báo (`size`). Trả null nếu hợp lệ,
 * hoặc `{ code: 'images'|'documents'|'size', limit }` (thứ tự kiểm giống backend).
 */
export const validateChannelAttachments = (attachments, channel) => {
  const list = Array.isArray(attachments) ? attachments.filter(Boolean) : [];
  let images = 0;
  let documents = 0;
  let totalBytes = 0;
  list.forEach((attachment) => {
    if (classifyChannelAttachment(attachment, channel) === 'image') images += 1;
    else documents += 1;
    totalBytes += Number(attachment?.size) || 0;
  });
  if (images > CHANNEL_ATTACHMENT_LIMITS.maxImages) {
    return { code: 'images', limit: CHANNEL_ATTACHMENT_LIMITS.maxImages };
  }
  if (documents > CHANNEL_ATTACHMENT_LIMITS.maxDocuments) {
    return { code: 'documents', limit: CHANNEL_ATTACHMENT_LIMITS.maxDocuments };
  }
  if (totalBytes > CHANNEL_ATTACHMENT_LIMITS.maxTotalBytes) {
    return { code: 'size', limit: Math.round(CHANNEL_ATTACHMENT_LIMITS.maxTotalBytes / (1024 * 1024)) };
  }
  return null;
};

/**
 * Mẫu tin nhắn là kho DÙNG CHUNG Zalo / Telegram / WhatsApp, nhưng chỉ Telegram và WhatsApp có trần tệp mỗi tin
 * (Zalo thì không). Trả vấn đề đầu tiên của kênh nào vượt trần (Telegram trước, rồi WhatsApp) hoặc null.
 * Dùng để NHẮC trong trình soạn mẫu — không chặn lưu: mẫu vẫn dùng bình thường cho Zalo.
 */
export const findMessageTemplateChannelProblem = (attachments) => (
  validateChannelAttachments(attachments, 'telegram')
  || validateChannelAttachments(attachments, 'whatsapp')
);

/**
 * Áp một mẫu tin (kho mẫu Zalo: `bodyText`, `attachments`) vào bước của node: điền nội dung + sao chép đính kèm
 * (chụp tại thời điểm chọn — sửa mẫu về sau KHÔNG tự cập nhật khối đã lưu). Mẫu rỗng nội dung thì giữ nội dung đang soạn.
 */
export const applyTemplateToStep = (step, template) => ({
  ...(step || {}),
  templateId: String(template?.id ?? ''),
  message: String(template?.bodyText || '').trim() ? String(template.bodyText) : String(step?.message || ''),
  attachments: Array.isArray(template?.attachments) ? template.attachments.filter(Boolean) : [],
});

/** Bỏ mẫu đang chọn: giữ nội dung, xoá đính kèm của mẫu. */
export const clearTemplateFromStep = (step) => {
  const next = { ...(step || {}), templateId: '', attachments: [] };
  return next;
};
