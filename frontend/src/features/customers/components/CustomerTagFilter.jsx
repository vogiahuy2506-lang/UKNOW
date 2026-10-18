import { useEffect, useRef, useState } from 'react';
import { HiOutlineChevronDown, HiOutlineTag } from 'react-icons/hi';
import { useI18n } from '../../../i18n';

/**
 * Bộ lọc nhiều tag: khách có BẤT KỲ tag nào được chọn. Nút hiện số tag đang lọc; danh sách tag mở dạng popover.
 *
 * @param {object} props
 * @param {{ id: number, name: string, color?: string|null }[]} props.tags
 * @param {number[]} props.value id tag đang lọc
 * @param {(ids: number[]) => void} props.onChange
 * @param {string} [props.className]
 */
export default function CustomerTagFilter({ tags, value, onChange, className = '' }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggle = (id) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  const label = value.length === 0 ? t('customers.tags.filterAll') : t('customers.tags.filterSelected', { count: value.length });

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={t('customers.tags.filterLabel')}
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-primary-500 focus:outline-none dark:border-dk-border dark:bg-dk-inset dark:text-dk-text"
      >
        <span className="flex min-w-0 items-center gap-2">
          <HiOutlineTag className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
          <span className="truncate">{label}</span>
        </span>
        <HiOutlineChevronDown className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
      </button>
      {open && (
        <div
          role="group"
          aria-label={t('customers.tags.filterLabel')}
          className="absolute left-0 right-0 z-30 mt-1 max-h-64 min-w-[220px] overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg dark:border-dk-border dark:bg-dk-surface"
        >
          {tags.length === 0 ? (
            <p className="px-2 py-2 text-xs text-gray-500 dark:text-dk-text2">{t('customers.tags.filterEmpty')}</p>
          ) : (
            tags.map((tag) => (
              <label
                key={tag.id}
                className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-50 dark:text-dk-text dark:hover:bg-dk-raised"
              >
                <input
                  type="checkbox"
                  checked={value.includes(tag.id)}
                  onChange={() => toggle(tag.id)}
                  className="h-4 w-4 rounded border-gray-300 text-primary-600"
                />
                <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: tag.color || '#94a3b8' }} />
                <span className="min-w-0 flex-1 truncate">{tag.name}</span>
                <span className="shrink-0 text-xs text-gray-400">{tag.customerCount ?? 0}</span>
              </label>
            ))
          )}
        </div>
      )}
    </div>
  );
}
