import { Link } from 'react-router-dom';
import { HiOutlineLockClosed } from 'react-icons/hi';
import { useI18n } from '../../../i18n';

/**
 * P6 (PLAN_TG_WA_DAY_DU) — tài khoản kênh (Telegram/WhatsApp) đang bị khoá do vượt hạn mức gói (hạ gói / slot mua
 * thêm hết hạn). Backend trả cờ `isLocked` (WhatsApp) / `is_locked` (Telegram) ở danh sách tài khoản.
 * Khoá = không gửi chiến dịch, không trả lời; dữ liệu giữ nguyên. Hai lối thoát: mua thêm slot hoặc chọn giữ lại.
 */
export function ChannelAccountLockBadge() {
  const { t } = useI18n();
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700">
      <HiOutlineLockClosed className="h-3 w-3" aria-hidden="true" />
      {t('channelAccountLock.badge')}
    </span>
  );
}

export default function ChannelAccountLockNotice() {
  const { t } = useI18n();
  return (
    <div
      role="alert"
      className="mt-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800"
    >
      <p>{t('channelAccountLock.hint')}</p>
      <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 font-semibold">
        <Link to="/app/topup" className="underline hover:text-red-900">{t('channelAccountLock.buyMore')}</Link>
        <Link to="/app/billing?tab=locks" className="underline hover:text-red-900">{t('channelAccountLock.manage')}</Link>
      </p>
    </div>
  );
}
