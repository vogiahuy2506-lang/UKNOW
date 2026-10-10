import StatusChip from '../../../components/common/StatusChip';
import { useI18n } from '../../../i18n';
import { STATUS_TONES } from '../utils/supportConstants';

/** Chip trạng thái ticket (open / awaiting_user / closed). */
export default function SupportStatusChip({ status }) {
  const { t } = useI18n();
  return <StatusChip tone={STATUS_TONES[status] || 'muted'}>{t(`support.status.${status}`)}</StatusChip>;
}
