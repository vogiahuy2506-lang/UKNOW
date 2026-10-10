import { HiOutlineBell, HiOutlineMail } from 'react-icons/hi';
import { useI18n } from '../../../i18n';
import {
  NOTIFICATION_CHANNEL_ORDER,
  isEmailLockedBroadcast,
  isValidBroadcastLink,
} from '../utils/notificationChannels.util';

/**
 * Kênh gửi của một bản tin admin (PLAN_TICKET_GOP_Y_VA_CHUONG_THONG_BAO_2026-10-10 mục 5): checkbox Email / Chuông.
 * Giá trị là mảng con của ['email', 'in_app'] theo thứ tự chuẩn (đúng dạng backend nhận/lưu).
 */

export default function NotificationChannelSelector({
  value,
  onChange,
  link,
  onLinkChange,
  type,
  priority,
  disabledChannels = [],
}) {
  const { t } = useI18n();
  const selected = Array.isArray(value) ? value : [];
  const inAppOn = selected.includes('in_app');
  const emailOn = selected.includes('email');
  const emailLocked = isEmailLockedBroadcast(type, priority);

  const toggle = (channel) => {
    if (disabledChannels.includes(channel)) return;
    const next = new Set(selected);
    if (next.has(channel)) next.delete(channel);
    else next.add(channel);
    onChange(NOTIFICATION_CHANNEL_ORDER.filter((item) => next.has(item)));
  };

  const options = [
    { id: 'email', Icon: HiOutlineMail, label: t('notificationCenter.channels.email'), desc: t('notificationCenter.channels.emailDesc'), on: emailOn },
    { id: 'in_app', Icon: HiOutlineBell, label: t('notificationCenter.channels.inApp'), desc: t('notificationCenter.channels.inAppDesc'), on: inAppOn },
  ];

  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium text-slate-800">{t('notificationCenter.channels.title')}</legend>
      <p className="text-xs text-slate-500">{t('notificationCenter.channels.hint')}</p>

      <div className="grid gap-3 sm:grid-cols-2">
        {options.map(({ id, Icon, label, desc, on }) => {
          const off = disabledChannels.includes(id);
          return (
          <div
            key={id}
            className={`rounded-lg border p-3 transition-colors ${
              off ? 'border-slate-200 bg-slate-50 opacity-70' : on ? 'border-orange-400 bg-orange-50' : 'border-slate-300 bg-white'
            }`}
          >
            <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-900">
              <input
                type="checkbox"
                checked={on && !off}
                disabled={off}
                onChange={() => toggle(id)}
                className="h-4 w-4 rounded border-slate-300 text-orange-600 focus:ring-orange-500"
              />
              <Icon className="h-4 w-4 text-orange-500" aria-hidden="true" />
              <span>{label}</span>
            </label>
            <p className="mt-1 pl-6 text-xs text-slate-500">{off ? t('notificationCenter.channels.disabledNote') : desc}</p>
          </div>
          );
        })}
      </div>

      {inAppOn ? (
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-slate-800" htmlFor="notification-broadcast-link">
            {t('notificationCenter.channels.linkLabel')}
          </label>
          <input
            id="notification-broadcast-link"
            value={link || ''}
            onChange={(event) => onLinkChange(event.target.value)}
            maxLength={500}
            placeholder={t('notificationCenter.channels.linkPlaceholder')}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
          />
          <p className="text-xs text-slate-500">{t('notificationCenter.channels.linkHint')}</p>
          {isValidBroadcastLink(link) ? null : (
            <p role="alert" className="text-xs font-medium text-red-600">{t('notificationCenter.channels.linkInvalid')}</p>
          )}
          <p className="text-xs text-slate-500">{t('notificationCenter.channels.sharedContentNote')}</p>
        </div>
      ) : null}

      {emailOn && emailLocked ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {t('notificationCenter.channels.emailLockedNote')}
        </p>
      ) : null}
    </fieldset>
  );
}
