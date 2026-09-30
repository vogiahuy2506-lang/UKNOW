import { Link } from 'react-router-dom';
import { HiOutlineLockClosed } from 'react-icons/hi';
import { useI18n } from '../../../i18n';

/**
 * P9 (PLAN_TG_WA_DAY_DU) — gói hiện tại KHÔNG có kênh (trần tài khoản kênh = 0): thay cho nút kết nối/quét QR.
 * Lối thoát: mua thêm slot (Nạp thêm) hoặc nâng gói.
 * @param {{channel: 'telegram'|'whatsapp'}} props
 */
export default function ChannelNotInPlanNotice({ channel }) {
  const { t } = useI18n();
  const name = channel === 'telegram' ? 'Telegram' : 'WhatsApp';
  return (
    <div
      role="alert"
      data-testid="channel-not-in-plan"
      className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900"
    >
      <p className="flex items-center gap-2 font-semibold">
        <HiOutlineLockClosed className="h-4 w-4 shrink-0" aria-hidden="true" />
        {t('channelNotInPlan.title', { channel: name })}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-amber-800">{t('channelNotInPlan.hint', { channel: name })}</p>
      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold">
        <Link to="/app/topup" className="underline hover:text-amber-950">{t('channelNotInPlan.buyMore')}</Link>
        <Link to="/app/billing" className="underline hover:text-amber-950">{t('channelNotInPlan.upgrade')}</Link>
      </p>
    </div>
  );
}
