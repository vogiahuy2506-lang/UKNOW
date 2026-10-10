/**
 * Helper hiển thị "Ước tính thời gian gửi chiến dịch" (PLAN_UOC_TINH_THOI_GIAN_CHIEN_DICH_2026-10-04, PR-3).
 * Hình dạng dữ liệu theo HỢP ĐỒNG API của `GET /api/campaigns/:id/estimate` (backend
 * `campaignEstimate.service.js` + `campaignSendEstimate.util.js`). Mọi hàm ở đây thuần, không gọi mạng.
 */

const HANOI_TIME_ZONE = 'Asia/Ho_Chi_Minh';
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

/** Mã cảnh báo trong hợp đồng → khoá i18n `campaignEstimate.warning.<mã>`. Mã lạ rơi về `unknown`. */
export const KNOWN_ESTIMATE_WARNING_CODES = Object.freeze([
  'multi_day',
  'zalo_over_safe_daily',
  'account_daily_limit',
  'continuous_mode',
  'estimate_incomplete',
  'recipient_count_unknown',
  'account_unavailable',
  'sender_missing',
  'no_send_node',
  'plan_quota_insufficient',
  'shared_account',
  'zalo_phone_lookup_unmodeled',
  'email_provider_rate_limited',
]);

/** Cảnh báo chỉ để biết (không đáng lo) → hiện tông xám thay vì vàng. */
const INFO_ONLY_WARNING_CODES = new Set(['continuous_mode', 'zalo_phone_lookup_unmodeled']);

/** Gợi ý khi lịch chồng nhau (409 `SCHEDULE_OVERLAP`) → khoá i18n `campaignEstimate.suggestion.<mã>`. */
export const KNOWN_OVERLAP_SUGGESTIONS = Object.freeze(['use_steps', 'add_accounts', 'spread_schedule']);

const toDate = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

/**
 * Định dạng "dd/MM/yyyy HH:mm" theo giờ Việt Nam (Asia/Ho_Chi_Minh), KHÔNG phụ thuộc múi giờ trình duyệt.
 *
 * @param {string|Date|null|undefined} value mốc thời gian (ISO UTC từ API)
 * @returns {string} chuỗi dạng "07/10/2026 22:52" hoặc '' nếu không hợp lệ
 */
export const formatEstimateDateTime = (value) => {
  const date = toDate(value);
  if (!date) return '';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: HANOI_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const pick = (type) => parts.find((p) => p.type === type)?.value || '';
  return `${pick('day')}/${pick('month')}/${pick('year')} ${pick('hour')}:${pick('minute')}`;
};

/**
 * "YYYY-MM-DD" (ngày VN do server trả trong `perDay`) → "dd/MM".
 *
 * @param {string} dateKey
 * @returns {string}
 */
export const formatEstimateDay = (dateKey) => {
  const m = String(dateKey || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}` : String(dateKey || '');
};

/**
 * Độ dài từ lúc bắt đầu tới `finishAtLatest` → số + đơn vị để dịch ("khoảng N ngày/giờ/phút").
 * Từ 1 ngày trở lên làm tròn LÊN theo ngày (cùng cách backend tính `multi_day.days`).
 *
 * @param {string} startAt ISO
 * @param {string} finishAt ISO
 * @returns {{ unit: 'days'|'hours'|'minutes'|'lessThanMinute', value: number }|null}
 */
export const describeEstimateDuration = (startAt, finishAt) => {
  const start = toDate(startAt);
  const finish = toDate(finishAt);
  if (!start || !finish) return null;
  const elapsed = Math.max(0, finish.getTime() - start.getTime());
  if (elapsed >= DAY_MS) return { unit: 'days', value: Math.ceil(elapsed / DAY_MS) };
  if (elapsed >= HOUR_MS) return { unit: 'hours', value: Math.round(elapsed / HOUR_MS) };
  if (elapsed >= MINUTE_MS) return { unit: 'minutes', value: Math.max(1, Math.round(elapsed / MINUTE_MS)) };
  return { unit: 'lessThanMinute', value: 0 };
};

/**
 * Chuẩn hoá đầu ra API về một dạng hiển thị an toàn: mọi mảng thiếu → [].
 * Số chính là `finishAtLatest` (kịch bản chậm, cùng mốc backend dùng để chặn lịch chồng); khoảng nhanh–chậm
 * chỉ hiện khi hai mốc thật sự khác nhau. Trả null khi đầu vào không phải object.
 *
 * @param {object|null|undefined} estimate `data` của API (hoặc trường `estimate` của thẻ xác nhận AI)
 * @returns {object|null}
 */
export const buildEstimateView = (estimate) => {
  if (!estimate || typeof estimate !== 'object') return null;
  const finishAtLatest = estimate.finishAtLatest || null;
  const finishAtEarliest = estimate.finishAtEarliest || null;
  const accounts = Array.isArray(estimate.accounts) ? estimate.accounts : [];
  const accountLabel = (key) => accounts.find((a) => a?.key === key)?.label || key;
  const hasRange = Boolean(
    finishAtLatest && finishAtEarliest
    && formatEstimateDateTime(finishAtLatest) !== formatEstimateDateTime(finishAtEarliest),
  );
  const perDay = (Array.isArray(estimate.perDay) ? estimate.perDay : []).map((day) => ({
    date: day.date,
    actions: Number(day.actions) || 0,
    rows: Object.entries(day.perAccount || {}).map(([key, count]) => ({
      key,
      label: accountLabel(key),
      actions: Number(count) || 0,
    })),
  }));
  return {
    startAt: estimate.startAt || null,
    finishAtLatest,
    finishAtEarliest,
    hasRange,
    duration: describeEstimateDuration(estimate.startAt, finishAtLatest),
    totalActions: Number(estimate.totalActions) || 0,
    perDay,
    warnings: (Array.isArray(estimate.warnings) ? estimate.warnings : []).filter((w) => w && typeof w === 'object'),
    accountLabel,
  };
};

/**
 * Dịch một cảnh báo (mã ổn định + params) thành câu; mã lạ → câu chung `unknown` (không vỡ khi backend thêm mã).
 *
 * @param {{ code: string, params?: object }} warning
 * @param {(key: string, params?: object) => string} t hàm dịch
 * @param {(key: string) => string} accountLabel nhãn tài khoản từ `accounts[].label`
 * @returns {{ code: string, text: string, tone: 'warn'|'info' }}
 */
export const describeEstimateWarning = (warning, t, accountLabel = (key) => key) => {
  const code = String(warning?.code || '');
  const p = warning?.params && typeof warning.params === 'object' ? warning.params : {};
  if (!KNOWN_ESTIMATE_WARNING_CODES.includes(code)) {
    return { code, text: t('campaignEstimate.warning.unknown'), tone: 'info' };
  }
  const tone = INFO_ONLY_WARNING_CODES.has(code) ? 'info' : 'warn';
  const key = `campaignEstimate.warning.${code}`;
  switch (code) {
    case 'multi_day':
      return {
        code,
        tone,
        text: t(key, { days: p.days ?? '', finishAt: formatEstimateDateTime(p.finishAtLatest) }),
      };
    case 'zalo_over_safe_daily': {
      const accountKeys = Array.isArray(p.accounts) && p.accounts.length > 0 ? p.accounts : [p.accountKey];
      return {
        code,
        tone,
        text: t(key, {
          accounts: accountKeys.filter(Boolean).map(accountLabel).join(', '),
          days: p.days ?? '',
          actions: p.actions ?? '',
          safeLimit: p.safeLimit ?? '',
        }),
      };
    }
    case 'account_daily_limit':
      return {
        code,
        tone,
        text: t(Number(p.limit) === 0 ? 'campaignEstimate.warning.account_daily_limit_zero' : key, {
          account: accountLabel(p.accountKey),
          limit: p.limit ?? '',
        }),
      };
    case 'account_unavailable':
      return { code, tone, text: t(key, { account: accountLabel(p.accountKey) }) };
    case 'email_provider_rate_limited':
      return {
        code,
        tone,
        text: t(key, {
          account: accountLabel(p.accountKey),
          events30d: p.events30d ?? '',
          lastAt: formatEstimateDateTime(p.lastAt),
        }),
      };
    case 'plan_quota_insufficient':
      return { code, tone, text: t(key, { required: p.required ?? '' }) };
    case 'shared_account': {
      const campaigns = (Array.isArray(p.campaigns) ? p.campaigns : [])
        .map((c) => `#${c.id}${c.name ? ` ${c.name}` : ''}`)
        .join(', ');
      return { code, tone, text: t(key, { account: p.label || accountLabel(p.accountKey), campaigns }) };
    }
    default:
      return { code, tone, text: t(key) };
  }
};

/**
 * Dịch các gợi ý của 409 `SCHEDULE_OVERLAP`; gợi ý lạ bị bỏ (không hiện khoá trần).
 *
 * @param {string[]} suggestions `data.suggestions` của 409
 * @param {(key: string) => string} t
 * @returns {string[]}
 */
export const describeOverlapSuggestions = (suggestions, t) =>
  (Array.isArray(suggestions) ? suggestions : [])
    .filter((code) => KNOWN_OVERLAP_SUGGESTIONS.includes(code))
    .map((code) => t(`campaignEstimate.suggestion.${code}`));

/**
 * Lấy lỗi 409 `SCHEDULE_OVERLAP` từ lỗi axios: message của server + gợi ý. Không phải 409 này → null.
 *
 * @param {object} error lỗi axios
 * @returns {{ message: string, suggestions: string[] }|null}
 */
export const extractScheduleOverlapError = (error) => {
  const body = error?.response?.data;
  if (error?.response?.status !== 409 || !body) return null;
  const code = body.code || body.error?.code || body.errorCode;
  const suggestions = Array.isArray(body.suggestions)
    ? body.suggestions
    : (Array.isArray(body.data?.suggestions) ? body.data.suggestions : []);
  // Mã chuẩn là `code: 'SCHEDULE_OVERLAP'` (cùng kiểu CAMPAIGN_NOT_ACTIVE); 409 khác mà không có mã thì phải kèm
  // `suggestions` mới coi là chồng lịch — còn lại để luồng lỗi chung xử lý.
  if (code !== 'SCHEDULE_OVERLAP' && !(code == null && suggestions.length > 0)) return null;
  return {
    message: typeof body.message === 'string' ? body.message : '',
    suggestions,
  };
};

/**
 * Mốc `startAt` (ISO UTC) cho ước tính theo biểu mẫu đặt lịch, hiểu ngày/giờ là giờ tường Việt Nam.
 *  - `once`: ngày + giờ đã chọn;
 *  - `after_delay`: bây giờ + (số, đơn vị) làm tròn xuống phút;
 *  - lịch lặp: lần nổ kế tiếp do `resolveNextRunAt` (helper lịch sẵn có) tính từ cron;
 *  - thiếu dữ liệu → null (hộp ước tính không gọi API).
 *
 * @param {object} scheduleForm biểu mẫu đặt lịch
 * @param {{ buildCron: (form: object) => string, resolveNextRunAt: (schedule: object) => Date|null,
 *   buildDelayedRunDate: (value: number|string, unit: string) => Date|null }} deps
 * @returns {string|null}
 */
export const resolveScheduleEstimateStartAt = (scheduleForm, deps) => {
  if (!scheduleForm) return null;
  const type = scheduleForm.scheduleType;
  if (type === 'after_delay') {
    // Không dùng `delayPreviewAt` (đổi theo từng mili giây ở form) — tính lại từ số + đơn vị, làm tròn xuống PHÚT
    // để `startAt` ổn định giữa các lần render, tránh gọi lại API liên tục.
    const delayed = deps.buildDelayedRunDate(scheduleForm.delayValue, scheduleForm.delayUnit);
    if (!delayed || Number.isNaN(delayed.getTime())) return null;
    return new Date(Math.floor(delayed.getTime() / MINUTE_MS) * MINUTE_MS).toISOString();
  }
  if (!scheduleForm.scheduleTime) return null;
  if (type === 'once') {
    const ymd = String(scheduleForm.scheduleDate || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const hm = String(scheduleForm.scheduleTime).trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!ymd || !hm) return null;
    // Giờ tường VN = UTC+7 cố định (không có DST).
    const ms = Date.UTC(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]), Number(hm[1]) - 7, Number(hm[2]), 0);
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  const cronExpression = deps.buildCron(scheduleForm);
  if (!cronExpression) return null;
  const next = deps.resolveNextRunAt({ scheduleType: type, cronExpression });
  return next && !Number.isNaN(next.getTime()) ? next.toISOString() : null;
};
