import {
  HiOutlineCheckCircle,
  HiOutlineExclamation,
  HiOutlineExclamationCircle,
  HiOutlineInformationCircle,
} from 'react-icons/hi';
import { useI18n } from '../../../i18n';
import { formatRelativeTime } from '../utils/formatRelativeTime';
import { pickLocalizedText } from '../utils/pickLocalizedText';

const SEVERITY_STYLES = {
  info: { Icon: HiOutlineInformationCircle, wrap: 'bg-blue-50 text-blue-600' },
  success: { Icon: HiOutlineCheckCircle, wrap: 'bg-emerald-50 text-emerald-600' },
  warning: { Icon: HiOutlineExclamation, wrap: 'bg-amber-50 text-amber-600' },
  error: { Icon: HiOutlineExclamationCircle, wrap: 'bg-red-50 text-red-600' },
};

/**
 * Một dòng thông báo — dùng chung cho dropdown chuông và trang `/app/notifications`.
 * Nội dung là VĂN BẢN THUẦN (React tự escape); không bao giờ render HTML.
 *
 * @param {object} props
 * @param {object} props.item DTO thông báo từ `GET /api/notifications`
 * @param {(item: object) => void} props.onSelect gọi khi bấm dòng
 * @param {boolean} [props.compact] dropdown chuông: chữ nhỏ hơn
 */
export default function NotificationItem({ item, onSelect, compact = false }) {
  const { t, locale } = useI18n();
  const { title, message } = pickLocalizedText(item, locale);
  const { Icon, wrap } = SEVERITY_STYLES[item.severity] || SEVERITY_STYLES.info;
  const unread = !item.read;

  return (
    <button
      type="button"
      data-testid="notification-item"
      data-unread={unread ? 'true' : 'false'}
      onClick={() => onSelect(item)}
      className={`w-full flex items-start gap-3 text-left transition-colors hover:bg-gray-50 ${
        compact ? 'px-3 py-2.5' : 'px-4 py-3.5'
      } ${unread ? 'bg-orange-50/40' : ''}`}
    >
      <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${wrap}`}>
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={`block truncate text-[13px] leading-snug text-gray-900 ${unread ? 'font-semibold' : 'font-medium'}`}
        >
          {title}
        </span>
        {message && (
          <span className="mt-0.5 block whitespace-pre-line break-words text-[12px] leading-snug text-gray-500 line-clamp-2">
            {message}
          </span>
        )}
        <span className="mt-1 block text-[11px] text-gray-400">{formatRelativeTime(item.createdAt, t)}</span>
      </span>
      {unread && (
        <span
          data-testid="notification-unread-dot"
          role="img"
          aria-label={t('notifications.unread')}
          className="mt-2 h-2 w-2 shrink-0 rounded-full bg-orange-500"
        />
      )}
    </button>
  );
}
