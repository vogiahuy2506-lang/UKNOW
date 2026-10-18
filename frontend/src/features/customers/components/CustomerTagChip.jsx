import { HiOutlineX } from 'react-icons/hi';
import { useI18n } from '../../../i18n';

/**
 * Chip tag: chấm màu + tên. Nền/viền trung tính để đọc được cả sáng lẫn tối; màu của tag chỉ ở chấm.
 *
 * @param {object} props
 * @param {{ id: number, name: string, color?: string|null }} props.tag
 * @param {() => void} [props.onRemove] có thì hiện nút gỡ
 */
export default function CustomerTagChip({ tag, onRemove }) {
  const { t } = useI18n();
  return (
    <span
      data-testid="customer-tag-chip"
      className="inline-flex max-w-[160px] items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-700 dark:border-dk-border dark:bg-dk-raised dark:text-dk-text"
      title={tag.name}
    >
      <span
        aria-hidden="true"
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: tag.color || '#94a3b8' }}
      />
      <span className="truncate">{tag.name}</span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={t('customers.tags.removeTag', { name: tag.name })}
          className="-mr-0.5 shrink-0 rounded-full p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-dk-strong dark:hover:text-dk-text"
        >
          <HiOutlineX className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}
