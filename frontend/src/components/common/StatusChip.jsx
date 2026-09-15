/**
 * Chip trạng thái/nhãn dùng chung — bo tròn, chữ 12px đậm, năm tông màu.
 *
 * @param {object} props
 * @param {'good'|'accent'|'muted'|'warning'|'danger'} [props.tone]
 * @param {React.ReactNode} props.children
 */
const TONE_STYLES = {
  good: 'text-emerald-700 bg-emerald-50',
  accent: 'text-orange-700 bg-orange-50',
  muted: 'text-gray-500 bg-gray-100 border border-gray-200',
  warning: 'text-amber-800 bg-amber-100',
  danger: 'text-red-700 bg-red-100',
};

export default function StatusChip({ tone = 'muted', children }) {
  const toneClass = TONE_STYLES[tone] || TONE_STYLES.muted;
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${toneClass}`}>
      {children}
    </span>
  );
}
