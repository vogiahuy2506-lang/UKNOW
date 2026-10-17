import { HiOutlineCalendar, HiOutlineExclamation, HiOutlineLightningBolt, HiOutlineRefresh, HiOutlineUserAdd } from 'react-icons/hi';
import SimpleChoiceCard from './SimpleChoiceCard';
import { formatPollInterval } from './simpleCampaign.summary';
import {
  RECURRING_FREQUENCIES,
  WEEKDAY_OPTIONS,
  getAvailableWhenOptions,
  isAdapterChannel,
  todayInVietnam,
  validateSchedule,
} from './simpleCampaign.helpers';

/**
 * Cách vẽ từng lựa chọn của bước "Khi nào gửi?". Thẻ nào có mặt do `getAvailableWhenOptions` (helpers) quyết định theo kênh +
 * nguồn người nhận; thẻ chưa dùng được thì KHÔNG hiện (không hiện "Sắp có").
 */
const WHEN_CARDS = Object.freeze({
  now: { icon: HiOutlineLightningBolt, tone: 'rose' },
  scheduled: { icon: HiOutlineCalendar, tone: 'blue' },
  continuous: { icon: HiOutlineUserAdd, tone: 'emerald' },
  recurring: { icon: HiOutlineRefresh, tone: 'violet' },
});

const INPUT_CLASS =
  'w-full rounded-xl border border-slate-200 bg-slate-50/60 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 hover:bg-white focus:border-orange-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-orange-500/10 dark:border-dk-border dark:bg-dk-inset dark:text-dk-text dark:placeholder:text-dk-muted dark:hover:bg-dk-surface dark:focus:bg-dk-inset';

const PANEL_CLASS = 'mt-4 rounded-2xl border border-slate-200 bg-slate-50/60 p-4 dark:border-dk-border dark:bg-dk-inset sm:p-5';

/**
 * Cảnh báo vàng của "Lặp lại định kỳ": sổ người nhận gắn theo từng lượt chạy nên MỖI lần lặp gửi lại cho TOÀN BỘ danh sách.
 * Luôn hiện thành dòng chữ (không ẩn sau tooltip); dùng cả ở bước chọn và ở màn Xem lại.
 *
 * @param {object} props
 * @param {(key: string, params?: object) => string} props.t
 * @param {string} [props.channel] Telegram/WhatsApp không có "Tự động gửi cho người mới" nên câu gợi ý đó được bỏ
 */
export function RecurringWarning({ t, channel }) {
  return (
    <div
      className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-200"
      role="note"
      data-testid="simple-recurring-warning"
    >
      <HiOutlineExclamation className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
      <p>
        <strong className="font-bold">{t('simpleCampaign.when.recurring.warningStrong')}</strong>
        {' '}
        {t(isAdapterChannel(channel) ? 'simpleCampaign.when.recurring.warningRestNoAuto' : 'simpleCampaign.when.recurring.warningRest')}
      </p>
    </div>
  );
}

function ScheduledPanel({ schedule, patchSchedule, t }) {
  const check = validateSchedule(schedule, new Date());
  return (
    <div className={PANEL_CLASS} data-testid="simple-when-scheduled-panel">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="simple-schedule-date" className="block text-sm font-semibold text-slate-800 dark:text-dk-text">
            {t('simpleCampaign.when.scheduled.dateLabel')}
          </label>
          <input
            id="simple-schedule-date"
            type="date"
            min={todayInVietnam()}
            value={schedule.date}
            onChange={(event) => patchSchedule({ date: event.target.value })}
            className={`mt-2 ${INPUT_CLASS}`}
          />
        </div>
        <div>
          <label htmlFor="simple-schedule-time" className="block text-sm font-semibold text-slate-800 dark:text-dk-text">
            {t('simpleCampaign.when.scheduled.timeLabel')}
          </label>
          <input
            id="simple-schedule-time"
            type="time"
            value={schedule.time}
            onChange={(event) => patchSchedule({ time: event.target.value })}
            className={`mt-2 ${INPUT_CLASS}`}
          />
        </div>
      </div>
      <p className="mt-2 text-xs text-slate-500 dark:text-dk-text2">{t('simpleCampaign.when.scheduled.vnNote')}</p>
      {!check.ok && check.reason === 'too_soon' && (
        <p className="mt-2 text-sm font-semibold text-red-700 dark:text-red-300" role="alert" data-testid="simple-schedule-too-soon">
          {t('simpleCampaign.when.scheduled.tooSoon')}
        </p>
      )}
      {!check.ok && check.reason === 'invalid' && (
        <p className="mt-2 text-sm font-semibold text-red-700 dark:text-red-300" role="alert">
          {t('simpleCampaign.when.scheduled.invalid')}
        </p>
      )}
    </div>
  );
}

function ContinuousPanel({ schedule, t }) {
  return (
    <div className={PANEL_CLASS} data-testid="simple-when-continuous-panel">
      <p className="text-sm text-slate-700 dark:text-dk-text">
        {t('simpleCampaign.when.continuous.panel', { interval: formatPollInterval(schedule.pollIntervalMinutes, t) })}
      </p>
    </div>
  );
}

function RecurringPanel({ schedule, patchSchedule, t, channel }) {
  return (
    <div className={PANEL_CLASS} data-testid="simple-when-recurring-panel">
      <div role="group" aria-label={t('simpleCampaign.when.recurring.frequencyLabel')} className="flex flex-wrap gap-2">
        {RECURRING_FREQUENCIES.map((frequency) => {
          const active = schedule.frequency === frequency;
          return (
            <button
              key={frequency}
              type="button"
              aria-pressed={active}
              data-testid={`simple-frequency-${frequency}`}
              onClick={() => patchSchedule({ frequency })}
              className={`rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
                active
                  ? 'border-orange-500 bg-orange-50 text-orange-700 dark:bg-orange-950/30 dark:text-orange-300'
                  : 'border-slate-300 bg-white text-slate-700 hover:border-orange-300 dark:border-dk-border dark:bg-dk-surface dark:text-dk-text'
              }`}
            >
              {t(`simpleCampaign.when.recurring.frequency.${frequency}`)}
            </button>
          );
        })}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {schedule.frequency === 'weekly' && (
          <div>
            <label htmlFor="simple-recurring-day" className="block text-sm font-semibold text-slate-800 dark:text-dk-text">
              {t('simpleCampaign.when.recurring.dayLabel')}
            </label>
            <select
              id="simple-recurring-day"
              value={schedule.weeklyDay}
              onChange={(event) => patchSchedule({ weeklyDay: event.target.value })}
              className={`mt-2 ${INPUT_CLASS}`}
            >
              {WEEKDAY_OPTIONS.map((day) => (
                <option key={day.value} value={day.value}>{t(`campaigns.${day.key}`)}</option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label htmlFor="simple-recurring-time" className="block text-sm font-semibold text-slate-800 dark:text-dk-text">
            {t('simpleCampaign.when.recurring.timeLabel')}
          </label>
          <input
            id="simple-recurring-time"
            type="time"
            value={schedule.time}
            onChange={(event) => patchSchedule({ time: event.target.value })}
            className={`mt-2 ${INPUT_CLASS}`}
          />
        </div>
      </div>
      {schedule.frequency === 'monthly' && (
        <p className="mt-2 text-xs text-slate-500 dark:text-dk-text2">{t('simpleCampaign.when.recurring.monthlyNote')}</p>
      )}
      <p className="mt-2 text-xs text-slate-500 dark:text-dk-text2">{t('simpleCampaign.when.scheduled.vnNote')}</p>

      <div className="mt-4">
        <RecurringWarning t={t} channel={channel} />
      </div>
    </div>
  );
}

/**
 * Bước 4 — "Khi nào gửi?". Gửi ngay (chọn sẵn) · Hẹn một thời điểm · Tự động gửi cho người mới (chỉ nguồn landing / biểu mẫu /
 * Google Sheet và kênh khác Zalo nhóm) · Lặp lại định kỳ. Chọn thẻ nào thì mở ngay phần nhập của thẻ đó bên dưới.
 *
 * @param {object} props
 * @param {object} props.wizard kết quả `useSimpleCampaignWizard`
 * @param {(key: string, params?: object) => string} props.t
 */
export default function WhenStep({ wizard, t }) {
  const { state, selectWhen, patchSchedule } = wizard;
  const { schedule } = state;
  const options = getAvailableWhenOptions(state);
  return (
    <div>
      <h2 className="text-xl font-extrabold tracking-tight text-slate-900 dark:text-dk-text sm:text-2xl">{t('simpleCampaign.when.title')}</h2>
      <p className="mt-1 text-sm text-slate-500 dark:text-dk-text2">{t('simpleCampaign.when.hint')}</p>
      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {options.map((id) => (
          <SimpleChoiceCard
            key={id}
            testId={`simple-when-${id}`}
            icon={WHEN_CARDS[id].icon}
            tone={WHEN_CARDS[id].tone}
            title={t(`simpleCampaign.when.${id}.title`)}
            description={t(`simpleCampaign.when.${id}.desc`)}
            selected={schedule?.type === id}
            onClick={() => selectWhen(id)}
          />
        ))}
      </div>

      {schedule?.type === 'scheduled' && <ScheduledPanel schedule={schedule} patchSchedule={patchSchedule} t={t} />}
      {schedule?.type === 'continuous' && <ContinuousPanel schedule={schedule} t={t} />}
      {schedule?.type === 'recurring' && <RecurringPanel schedule={schedule} patchSchedule={patchSchedule} t={t} channel={state.channel} />}
    </div>
  );
}
