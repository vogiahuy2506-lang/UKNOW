import { HiOutlineLockClosed } from 'react-icons/hi';
import { useI18n } from '../../i18n';

/**
 * Ổ khoá nhỏ ở góc thẻ/bước/loại chiến dịch của kênh chưa dùng được (xem ChannelUnavailableModal). Chỉ là dấu hiệu
 * thị giác: thẻ mới là phần tử bấm được (aria-disabled + mở modal), nên huy hiệu không nhận sự kiện chuột.
 *
 * @param {{ className?: string }} props `className` ghi đè vị trí mặc định (góc trên phải của thẻ `relative`).
 */
export default function ChannelLockBadge({ className = 'absolute top-2.5 right-2.5' }) {
  const { t } = useI18n();
  return (
    <span
      className={`${className} pointer-events-none flex h-4 w-4 items-center justify-center rounded-full bg-slate-500 text-white shadow-xs dark:bg-dk-strong dark:text-dk-text2`}
      data-testid="channel-lock-badge"
      title={t('channelUnavailable.lockedBadge')}
    >
      <HiOutlineLockClosed className="h-2.5 w-2.5" aria-hidden="true" />
    </span>
  );
}
