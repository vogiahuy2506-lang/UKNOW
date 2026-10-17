import { Link } from 'react-router-dom';
import { HiOutlineCalendar, HiOutlineCheckCircle, HiOutlineClock } from 'react-icons/hi';
import { describeWhen } from './simpleCampaign.summary';

const PRIMARY_LINK =
  'inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 px-5 py-3 text-sm font-bold text-white shadow-md shadow-orange-500/20 hover:from-orange-600 hover:to-amber-600';
const SECONDARY_LINK =
  'inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-dk-border dark:bg-dk-surface dark:text-dk-text dark:hover:bg-dk-raised';

/**
 * Màn "Đang gửi": chiến dịch đã tạo và đã được nhận lệnh chạy.
 *
 * @param {object} props
 * @param {{ campaignId: number, campaignName: string, channel: string }} props.result
 * @param {() => void} props.onCreateAnother
 * @param {(key: string, params?: object) => string} props.t
 */
export function DoneScreen({ result, onCreateAnother, t }) {
  return (
    <div className="mx-auto max-w-xl py-6 text-center" data-testid="simple-done">
      <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300" aria-hidden="true">
        <HiOutlineCheckCircle className="h-9 w-9" />
      </span>
      <h2 className="mt-4 text-2xl font-extrabold text-slate-900 dark:text-dk-text">{t('simpleCampaign.done.title')}</h2>
      <p className="mt-2 text-sm text-slate-600 dark:text-dk-text2">{t('simpleCampaign.done.body', { name: result.campaignName })}</p>
      {result.channel !== 'email' && (
        <p className="mt-2 text-xs text-slate-500 dark:text-dk-text2">{t('simpleCampaign.done.zaloNote')}</p>
      )}
      <div className="mt-6 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
        <Link to="/app/delivery-monitor" className={PRIMARY_LINK} data-testid="simple-done-progress">{t('simpleCampaign.done.viewProgress')}</Link>
        <Link to={`/app/campaigns/${result.campaignId}/builder`} className={SECONDARY_LINK} data-testid="simple-done-builder">{t('simpleCampaign.done.openBuilder')}</Link>
      </div>
      <button type="button" onClick={onCreateAnother} className="mt-5 text-sm font-semibold text-orange-600 underline dark:text-orange-400">
        {t('simpleCampaign.createAnother')}
      </button>
    </div>
  );
}

/**
 * Màn "Đã gửi chủ tài khoản duyệt": server trả 200 `requiresApproval:true` — chiến dịch CHƯA gửi, đang chờ chủ duyệt.
 * Tuyệt đối không dùng chữ "đang gửi" ở đây.
 *
 * @param {object} props
 * @param {{ campaignId: number, campaignName: string }} props.result
 * @param {() => void} props.onCreateAnother
 * @param {(key: string, params?: object) => string} props.t
 */
export function ApprovalScreen({ result, onCreateAnother, t }) {
  return (
    <div className="mx-auto max-w-xl py-6 text-center" data-testid="simple-approval">
      <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300" aria-hidden="true">
        <HiOutlineClock className="h-9 w-9" />
      </span>
      <h2 className="mt-4 text-2xl font-extrabold text-slate-900 dark:text-dk-text">{t('simpleCampaign.approval.title')}</h2>
      <p className="mt-2 text-sm text-slate-600 dark:text-dk-text2">{t('simpleCampaign.approval.body', { name: result.campaignName })}</p>
      <div className="mt-6 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
        <Link to="/app/campaigns" className={PRIMARY_LINK} data-testid="simple-approval-list">{t('simpleCampaign.backToList')}</Link>
      </div>
      <button type="button" onClick={onCreateAnother} className="mt-5 text-sm font-semibold text-orange-600 underline dark:text-orange-400">
        {t('simpleCampaign.createAnother')}
      </button>
    </div>
  );
}

/**
 * Màn "Đã hẹn gửi": lịch (hẹn giờ / lặp lại) đã được tạo và bật — chiến dịch CHƯA gửi, sẽ chạy đúng giờ. Có link tới tab Lịch chạy
 * để xem / tắt / xoá lịch.
 *
 * @param {object} props
 * @param {{ campaignId: number, campaignName: string, schedule: object }} props.result
 * @param {() => void} props.onCreateAnother
 * @param {(key: string, params?: object) => string} props.t
 */
export function ScheduledScreen({ result, onCreateAnother, t }) {
  return (
    <div className="mx-auto max-w-xl py-6 text-center" data-testid="simple-scheduled">
      <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300" aria-hidden="true">
        <HiOutlineCalendar className="h-9 w-9" />
      </span>
      <h2 className="mt-4 text-2xl font-extrabold text-slate-900 dark:text-dk-text">{t('simpleCampaign.scheduled.title')}</h2>
      <p className="mt-2 text-sm text-slate-600 dark:text-dk-text2" data-testid="simple-scheduled-when">
        {t('simpleCampaign.scheduled.body', { name: result.campaignName, when: describeWhen({ schedule: result.schedule, t }) })}
      </p>
      {result.schedule?.type === 'recurring' && (
        <p className="mt-2 text-xs text-slate-500 dark:text-dk-text2">{t('simpleCampaign.scheduled.recurringNote')}</p>
      )}
      <div className="mt-6 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
        <Link to="/app/campaigns?tab=schedules" className={PRIMARY_LINK} data-testid="simple-scheduled-list">{t('simpleCampaign.scheduled.viewSchedules')}</Link>
        <Link to={`/app/campaigns/${result.campaignId}/builder`} className={SECONDARY_LINK} data-testid="simple-scheduled-builder">{t('simpleCampaign.done.openBuilder')}</Link>
      </div>
      <button type="button" onClick={onCreateAnother} className="mt-5 text-sm font-semibold text-orange-600 underline dark:text-orange-400">
        {t('simpleCampaign.createAnother')}
      </button>
    </div>
  );
}
