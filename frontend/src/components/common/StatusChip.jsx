/**
 * Chip trạng thái/nhãn dùng chung — bo tròn, chữ 12px đậm, năm tông màu.
 *
 * @param {object} props
 * @param {'good'|'accent'|'muted'|'warning'|'danger'} [props.tone]
 * @param {string} [props.title] tooltip giải thích (thuộc tính title)
 * @param {React.ReactNode} props.children
 */
const TONE_STYLES = {
  good: 'text-emerald-700 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-950/60 dark:border dark:border-emerald-800/60',
  accent: 'text-orange-700 bg-orange-50 dark:text-orange-300 dark:bg-orange-950/60 dark:border dark:border-orange-800/60',
  muted: 'text-gray-500 bg-gray-100 border border-gray-200 dark:text-dk-text dark:bg-dk-raised/80 dark:border-dk-border',
  warning: 'text-amber-800 bg-amber-100 dark:text-amber-300 dark:bg-amber-950/60 dark:border dark:border-amber-800/60',
  danger: 'text-red-700 bg-red-100 dark:text-red-300 dark:bg-red-950/60 dark:border dark:border-red-800/60',
};

export default function StatusChip({ tone = 'muted', title, children }) {
  const toneClass = TONE_STYLES[tone] || TONE_STYLES.muted;
  return (
    <span title={title} className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${toneClass}`}>
      {children}
    </span>
  );
}
