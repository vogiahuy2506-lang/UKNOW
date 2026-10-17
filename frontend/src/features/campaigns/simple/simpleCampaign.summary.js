import { WEEKDAY_OPTIONS, parseManualRecipients, totalFollowUpMinutes } from './simpleCampaign.helpers';

const MAX_NAMES_SHOWN = 2;

const quote = (value) => `“${value}”`;

/** "2026-10-20" → "20/10/2026" (ngày người dùng chọn, không qua Date để khỏi lệch múi giờ). */
const formatPickedDate = (value) => {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : String(value || '');
};

/** "9:05" → "09:05". */
const formatPickedTime = (value) => {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})/);
  return match ? `${match[1].padStart(2, '0')}:${match[2]}` : String(value || '');
};

/**
 * Cụm từ nói về CÁCH GỬI, dùng ở câu tóm tắt (Xem lại) và màn "Đã hẹn gửi": "gửi ngay", "hẹn gửi lúc 08:30 ngày 20/10/2026",
 * "tự động gửi cho người mới (cứ 180 phút kiểm tra một lần)", "gửi lặp lại hằng tuần vào Thứ Hai lúc 09:00".
 *
 * @param {object} args
 * @param {object} args.schedule `state.schedule`
 * @param {(key: string, params?: object) => string} args.t
 * @returns {string}
 */
/**
 * Chu kỳ quét người mới nói bằng lời, làm tròn: từ 60 phút trở lên tính theo giờ ("khoảng 5 giờ"), dưới đó theo phút
 * ("khoảng 45 phút"). Chỉ để HIỂN THỊ — số gửi server vẫn là phút.
 *
 * @param {number|string} minutes
 * @param {(key: string, params?: object) => string} t
 */
export const formatPollInterval = (minutes, t) => {
  const total = Math.max(1, Math.round(Number(minutes) || 0));
  return total >= 60
    ? t('simpleCampaign.when.continuous.aboutHours', { n: Math.round(total / 60) })
    : t('simpleCampaign.when.continuous.aboutMinutes', { n: total });
};

export const describeWhen = ({ schedule, t, manual = false }) => {
  switch (schedule?.type) {
    case 'scheduled':
      return t('simpleCampaign.review.when.scheduled', { time: formatPickedTime(schedule.time), date: formatPickedDate(schedule.date) });
    case 'continuous':
      return t('simpleCampaign.review.when.continuous', { interval: formatPollInterval(schedule.pollIntervalMinutes, t) });
    case 'recurring': {
      const time = formatPickedTime(schedule.time);
      if (schedule.frequency === 'weekly') {
        const day = WEEKDAY_OPTIONS.find((item) => item.value === String(schedule.weeklyDay));
        return t('simpleCampaign.review.when.recurringWeekly', { day: day ? t(`campaigns.${day.key}`) : '', time });
      }
      return t(schedule.frequency === 'monthly' ? 'simpleCampaign.review.when.recurringMonthly' : 'simpleCampaign.review.when.recurringDaily', { time });
    }
    default:
      // Chế độ sửa: "không lịch" = chạy tay (không có nghĩa là sẽ gửi ngay).
      return t(manual ? 'simpleCampaign.review.when.manual' : 'simpleCampaign.review.when.now');
  }
};

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
 * @param {boolean} [args.manualWhen] chế độ sửa: không lịch = chạy tay
 * @returns {string}
 */
export const buildReviewSummary = ({ state, preview, t, locale, manualWhen = false }) => {
  const { channel, sender, audience, content, schedule } = state;

  let names = '';
  if (audience.type === 'form') names = joinNames(audience.formTitles, { withQuotes: true });
  else if (audience.type === 'landing') {
    // Nêu TÊN trang, không nêu slug; thiếu tên (state cũ) mới rơi về slug.
    names = joinNames(audience.landingTitles?.length ? audience.landingTitles : audience.slugs, { withQuotes: true });
  }

  const audienceLabel = t(`simpleCampaign.review.audience.${audience.type}`, { names });
  const count = resolveRecipientCount(state, preview);
  const formattedCount = count === null ? '' : Number(count).toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN');
  let audienceText = formattedCount ? `${formattedCount} ${audienceLabel}` : audienceLabel;
  if (schedule?.type === 'continuous') {
    // "Tự động": số người HIỆN CÓ chỉ là một phần; người mới sẽ tự được gửi. Không viết "0 người" kẻo hiểu nhầm là không gửi ai.
    const known = count === null ? 'unknown' : (Number(count) > 0 ? 'some' : 'none');
    audienceText = `${audienceLabel} ${t(`simpleCampaign.review.continuousCount.${known}`, { count: formattedCount })}`;
  }

  let contentText;
  if (content.mode === 'template') {
    contentText = t('simpleCampaign.review.content.template', { name: content.templateName || t('simpleCampaign.review.content.templateUnknown') });
  } else if (channel === 'email' && content.subject.trim()) {
    contentText = t('simpleCampaign.review.content.customWithSubject', { subject: content.subject.trim() });
  } else {
    contentText = t('simpleCampaign.review.content.custom');
  }

  const followUps = Array.isArray(state.followUps) ? state.followUps : [];
  if (followUps.length > 0) {
    // "chuỗi 3 tin trong 5 ngày": tổng độ trễ làm tròn lên ngày; dưới 1 ngày nêu giờ (làm tròn lên); dưới 1 giờ nêu phút.
    const minutes = Math.max(1, totalFollowUpMinutes(followUps));
    const spanKey = minutes >= 1440 ? 'days' : (minutes >= 60 ? 'hours' : 'minutes');
    const n = spanKey === 'days' ? Math.ceil(minutes / 1440) : (spanKey === 'hours' ? Math.ceil(minutes / 60) : minutes);
    const span = t(`simpleCampaign.review.content.span.${spanKey}${n === 1 ? 'One' : 'Many'}`, { n });
    contentText = t('simpleCampaign.review.content.chain', { first: contentText, count: followUps.length + 1, span });
  }

  return t('simpleCampaign.review.summary', {
    channel: t(`simpleCampaign.review.channelName.${channel}`),
    sender: sender?.label || '',
    audience: audienceText,
    content: contentText,
    when: describeWhen({ schedule, t, manual: manualWhen }),
  });
};
