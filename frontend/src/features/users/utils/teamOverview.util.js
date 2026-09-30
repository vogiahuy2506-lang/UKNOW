/**
 * Định dạng số của khối "Hoạt động nhóm" (trang Nhân viên) và thẻ "Tiến độ của bạn" (nhân viên) — PR-7
 * (PLAN_SO_LIEU_DUNG_GON_KHOP_2026-09-30). Hai màn dùng CHUNG các hàm này để cùng một con số luôn hiện cùng một chữ.
 * Hàm thuần, không React, không mạng. Nhãn chữ đi qua `t` do người gọi truyền vào (từ điển i18n).
 */

const VN_TZ = 'Asia/Ho_Chi_Minh';

/** Số có dấu chấm phân cách hàng nghìn kiểu Việt Nam: 1234 → "1.234". */
export function formatCount(value) {
  return (Number(value) || 0).toLocaleString('vi-VN');
}

/** Các phần ngày-giờ của một thời điểm theo GIỜ VN; null nếu thiếu hoặc không hợp lệ. */
function vnParts(iso) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: VN_TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  return Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
}

/** "dd/MM" theo giờ VN (ngày làm mới kỳ AI); null nếu không có. */
export function formatDayMonthVn(iso) {
  const p = vnParts(iso);
  return p ? `${p.day}/${p.month}` : null;
}

/** "dd/MM/yyyy HH:mm" theo giờ VN (hoạt động gần nhất); null nếu không có. */
export function formatDateTimeVn(iso) {
  const p = vnParts(iso);
  return p ? `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}` : null;
}

/** Chiến dịch đang chạy: "2 · 1 đang chờ" (chỉ nói "đang chờ" khi có), "0" khi không có. */
export function formatRunningCampaigns(row, t) {
  const running = Number(row?.runningCampaigns) || 0;
  const waiting = Number(row?.waitingCampaigns) || 0;
  const base = formatCount(running);
  return waiting > 0 ? `${base} · ${t('employee.teamWaiting', { count: formatCount(waiting) })}` : base;
}

/** Tin đã gửi tháng này: "1.234" hoặc "1.234 · 12 chưa gửi được" (đếm số ĐÍCH chưa gửi được, không phải số lần thử). */
export function formatSentThisMonth(row, t) {
  const sent = formatCount(row?.sentThisMonth);
  const failed = Number(row?.failedThisMonth) || 0;
  return failed > 0 ? `${sent} · ${t('employee.teamUnsent', { count: formatCount(failed) })}` : sent;
}

/**
 * Lượt AI kỳ này: "35 / 100" khi có hạn mức, "35" khi không đặt hạn mức, "—" khi chưa có kỳ (chủ chưa có gói).
 */
export function formatAiCredits(row) {
  if (row?.aiCreditsUsed == null) return '—';
  const used = formatCount(row.aiCreditsUsed);
  return row.aiCreditsLimit == null ? used : `${used} / ${formatCount(row.aiCreditsLimit)}`;
}

/** Chữ nhỏ dưới tiêu đề khối: "Tháng này · lượt AI tính theo kỳ gói (làm mới ngày dd/MM)"; không có kỳ → chỉ "Tháng này". */
export function formatPeriodNote(aiCycle, t) {
  const date = formatDayMonthVn(aiCycle?.end);
  return date ? t('employee.teamActivityPeriod', { date }) : t('employee.teamActivityPeriodNoCycle');
}
