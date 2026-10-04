import { normalizeMessageContent, getNormalizedMessageText } from './normalizeMessageContent';

/**
 * Dòng xem trước của một hội thoại / một tin (RA_SOAT_3_MAN H-08, H-30).
 *
 * Ảnh, tệp, video, GIF của Zalo được lưu dạng chuỗi JSON `{"title":"","href":"https://photo..."}` ngay trong `content`
 * (kiểu tin vẫn là `text`, `attachments` rỗng) — hiện nguyên văn sẽ in ra URL thô. Loại thật nằm ở
 * `metadata.msg_type_raw`, nên xem trước đi theo mã loại đó trước, rồi tới loại đính kèm, rồi mới tới nội dung.
 */

/** msg_type_raw của Zalo → khoá nhãn. */
export const RAW_TYPE_KINDS = {
  'chat.photo': 'image',
  'chat.gif': 'gif',
  'chat.video.msg': 'video',
  'share.file': 'file',
  'chat.location.new': 'location',
  'chat.voice': 'voice',
  'chat.sticker': 'sticker',
};

/** Loại tin nhắn nội bộ (`messageType` từ SSE / message_type) → khoá nhãn. */
const MESSAGE_TYPE_KINDS = {
  image: 'image',
  photo: 'image',
  sticker: 'sticker',
  file: 'file',
  doc: 'file',
  video: 'video',
  audio: 'voice',
  voice: 'voice',
  gif: 'gif',
  location: 'location',
};

const ATTACHMENT_TYPE_KINDS = {
  image: 'image',
  photo: 'image',
  sticker: 'sticker',
  video: 'video',
  audio: 'voice',
  voice: 'voice',
};

export const resolveMediaKind = ({ rawType, attachmentType, messageType } = {}) => {
  if (rawType && RAW_TYPE_KINDS[rawType]) return RAW_TYPE_KINDS[rawType];
  if (attachmentType) return ATTACHMENT_TYPE_KINDS[attachmentType] || 'file';
  if (messageType && MESSAGE_TYPE_KINDS[messageType]) return MESSAGE_TYPE_KINDS[messageType];
  return null;
};

/**
 * @param {object} parts
 * @param {*} parts.content            nội dung tin (chuỗi/JSON)
 * @param {string} [parts.rawType]     metadata.msg_type_raw
 * @param {string} [parts.attachmentType]
 * @param {string} [parts.messageType]
 * @param {string} [parts.sender]      tên người gửi (nhóm)
 * @param {boolean} [parts.isGroup]
 * @param {string} [parts.role]
 * @param {object} labels              { image, file, video, gif, location, voice, sticker, call, ...nhãn của normalizeMessageContent }
 */
export const getConversationPreview = (parts, labels) => {
  const { content, rawType, attachmentType, messageType, sender, isGroup, role } = parts || {};
  const normalized = normalizeMessageContent(content, labels);
  const kind = resolveMediaKind({ rawType, attachmentType, messageType });

  let body = '';
  if (kind === 'file') {
    // "[Tệp] hop-dong.pdf": tên tệp nằm ở `title` của thẻ JSON.
    const name = normalized.type === 'text' || normalized.type === 'link' ? (normalized.title || '') : '';
    body = name ? `${labels.file} ${name}` : labels.file;
  } else if (kind) {
    body = labels[kind] || '';
  } else {
    body = getNormalizedMessageText(normalized);
  }

  if (!body) return '';
  // Nhóm: "Hải: Dạ chạy được…" — chỉ tin KHÁCH mới có tên người gửi.
  if (isGroup && sender && (!role || role === 'visitor')) return `${sender}: ${body}`;
  return body;
};
