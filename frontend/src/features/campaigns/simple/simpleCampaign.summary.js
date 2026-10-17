import { parseManualRecipients } from './simpleCampaign.helpers';

const MAX_NAMES_SHOWN = 2;

const quote = (value) => `“${value}”`;

/** "A", "B" +3 — không để câu tóm tắt dài vô hạn khi chọn nhiều biểu mẫu/trang. */
const joinNames = (names, { withQuotes }) => {
  const clean = names.map((name) => String(name || '').trim()).filter(Boolean);
  const shown = clean.slice(0, MAX_NAMES_SHOWN).map((name) => (withQuotes ? quote(name) : name));
  const rest = clean.length - shown.length;
  return rest > 0 ? `${shown.join(', ')} +${rest}` : shown.join(', ');
};

/** Số người nhận để in vào câu: ưu tiên số server đếm, rơi về số đã biết ở phía trình duyệt. */
const resolveRecipientCount = (state, preview) => {
  const { audience, channel } = state;
  if (audience.type === 'zalo_groups') return audience.groupIds.length;
  if (preview?.recipientCount !== null && preview?.recipientCount !== undefined) return preview.recipientCount;
  if (audience.type === 'zalo_friends') return audience.uids.length;
  if (audience.type === 'manual') {
    return parseManualRecipients(audience.manualText, channel === 'email' ? 'email' : 'phone').valid.length;
  }
  return null;
};

/**
 * Câu tóm tắt MỘT dòng ở bước Xem lại, ví dụ:
 * "Gửi **email** từ **shop@abc.vn** tới **1.234 người điền biểu mẫu “Đăng ký học thử”**, nội dung **“Ưu đãi tháng 10”**, **gửi ngay**."
 * Dựng từ chính các lựa chọn người dùng vừa bấm (tên tài khoản, biểu mẫu, mẫu tin) nên luôn khớp với màn hình, chỉ mượn số người nhận
 * từ server. Phần in đậm bọc trong `**…**` (xem `RichSummary`).
 *
 * @param {object} args
 * @param {object} args.state trạng thái trình
 * @param {{ recipientCount: number|null }|null} args.preview phản hồi preview đã chuẩn hoá (null khi chưa có)
 * @param {(key: string, params?: object) => string} args.t
 * @param {string} args.locale
 * @returns {string}
 */
export const buildReviewSummary = ({ state, preview, t, locale }) => {
  const { channel, sender, audience, content, schedule } = state;

  let names = '';
  if (audience.type === 'form') names = joinNames(audience.formTitles, { withQuotes: true });
  else if (audience.type === 'landing') names = joinNames(audience.slugs, { withQuotes: false });

  const audienceLabel = t(`simpleCampaign.review.audience.${audience.type}`, { names });
  const count = resolveRecipientCount(state, preview);
  const formattedCount = count === null ? '' : Number(count).toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN');
  const audienceText = formattedCount ? `${formattedCount} ${audienceLabel}` : audienceLabel;

  let contentText;
  if (content.mode === 'template') {
    contentText = t('simpleCampaign.review.content.template', { name: content.templateName || `#${content.templateId}` });
  } else if (channel === 'email' && content.subject.trim()) {
    contentText = t('simpleCampaign.review.content.customWithSubject', { subject: content.subject.trim() });
  } else {
    contentText = t('simpleCampaign.review.content.custom');
  }

  return t('simpleCampaign.review.summary', {
    channel: t(`simpleCampaign.review.channelName.${channel}`),
    sender: sender?.label || '',
    audience: audienceText,
    content: contentText,
    when: t(`simpleCampaign.review.when.${schedule?.type || 'now'}`),
  });
};
