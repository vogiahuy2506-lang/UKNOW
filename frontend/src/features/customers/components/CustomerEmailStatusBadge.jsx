import { useI18n } from '../../../i18n';
import { formatDateOnly } from '../utils/customerDisplay.helpers';

/**
 * Trạng thái nhận email của một khách trong danh sách: bounce (địa chỉ chết) và/hoặc đã huỷ đăng ký là hai cờ
 * độc lập nên có thể hiện cả hai. Không có email thì không có trạng thái để nói.
 *
 * @param {{ customer: { email?: string, emailSubscribed?: boolean, emailHardBounced?: boolean, emailUnsubscribedAt?: string } }} props
 */
export default function CustomerEmailStatusBadge({ customer }) {
  const { t } = useI18n();
  if (!customer?.email) return <span className="text-gray-400 dark:text-dk-muted text-xs">--</span>;

  const bounced = Boolean(customer.emailHardBounced);
  const unsubscribed = customer.emailSubscribed === false;

  if (!bounced && !unsubscribed) {
    return <span className="badge badge-success">{t('customers.all.badgeSubscribed')}</span>;
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      {bounced && (
        <span className="badge badge-error" title={t('customers.all.badgeBouncedHint')} data-testid="badge-bounced">
          {t('customers.all.badgeBounced')}
        </span>
      )}
      {unsubscribed && (
        <span
          className="badge badge-warning"
          title={customer.emailUnsubscribedAt
            ? t('customers.all.badgeUnsubscribedAt', { date: formatDateOnly(customer.emailUnsubscribedAt) })
            : undefined}
          data-testid="badge-unsubscribed"
        >
          {t('customers.all.badgeUnsubscribed')}
        </span>
      )}
    </div>
  );
}
