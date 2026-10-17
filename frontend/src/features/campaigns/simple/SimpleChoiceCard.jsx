import { HiCheck } from 'react-icons/hi';
import ChannelLockBadge from '../../../components/common/ChannelLockBadge';

const TONES = {
  blue: 'bg-blue-50 text-blue-600 border-blue-100 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900/60',
  sky: 'bg-sky-50 text-sky-600 border-sky-100 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-900/60',
  violet: 'bg-violet-50 text-violet-600 border-violet-100 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-900/60',
  orange: 'bg-orange-50 text-orange-600 border-orange-100 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-900/60',
  emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/60',
  slate: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-dk-raised dark:text-dk-text2 dark:border-dk-border',
};

const BADGE_TONES = {
  green: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
  slate: 'bg-slate-100 text-slate-600 dark:bg-dk-raised dark:text-dk-text2',
};

/**
 * Thẻ lớn để bấm của trình "Từng bước": biểu tượng + tiêu đề + một câu giải thích.
 * - `locked`: kênh chưa dùng được theo gói → mờ + ổ khoá + `aria-disabled`, NHƯNG vẫn bấm được để cha mở modal giải thích/gợi ý mua
 *   (quyết định 11/10/2026: không ẩn, khoá + gợi ý mua).
 *
 * @param {object} props
 * @param {React.ComponentType<{className?: string}>} props.icon
 * @param {string} props.title
 * @param {string} [props.description]
 * @param {boolean} [props.selected]
 * @param {boolean} [props.locked]
 * @param {keyof typeof TONES} [props.tone]
 * @param {string} [props.badge] nhãn nhỏ cạnh tiêu đề (vd "Dễ — khuyên dùng")
 * @param {'green'|'slate'} [props.badgeTone] màu nhãn: xanh cho lựa chọn khuyên dùng, xám cho phần nâng cao
 * @param {string} [props.testId]
 * @param {() => void} props.onClick
 * @param {boolean} [props.autoFocus]
 */
export default function SimpleChoiceCard({
  icon: Icon,
  title,
  description,
  selected = false,
  locked = false,
  tone = 'slate',
  badge,
  badgeTone = 'green',
  testId,
  onClick,
  autoFocus = false,
}) {
  const active = selected && !locked;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-disabled={locked ? 'true' : undefined}
      data-testid={testId}
      autoFocus={autoFocus}
      className={`group relative flex w-full items-start gap-3.5 rounded-2xl border-2 p-4 text-left transition-all focus:outline-none focus-visible:ring-4 focus-visible:ring-orange-500/20 sm:p-5 ${
        active
          ? 'border-orange-500 bg-orange-50/70 shadow-sm shadow-orange-500/10 dark:bg-orange-950/30'
          : 'border-slate-200 bg-white hover:border-orange-300 hover:bg-slate-50/80 dark:border-dk-border dark:bg-dk-surface dark:hover:border-orange-500/50 dark:hover:bg-dk-raised'
      } ${locked ? 'opacity-60' : ''}`}
    >
      {Icon && (
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${TONES[tone] || TONES.slate}`} aria-hidden="true">
          <Icon className="h-6 w-6" />
        </span>
      )}
      <span className="min-w-0 flex-1 pr-6">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-base font-bold leading-snug text-slate-900 dark:text-dk-text">{title}</span>
          {badge && (
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${BADGE_TONES[badgeTone] || BADGE_TONES.green}`}>
              {badge}
            </span>
          )}
        </span>
        {description && (
          <span className="mt-1 block text-sm leading-snug text-slate-500 dark:text-dk-text2">{description}</span>
        )}
      </span>
      {locked ? (
        <ChannelLockBadge className="absolute right-3 top-3" />
      ) : (
        active && (
          <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-orange-500 text-white shadow-xs" aria-hidden="true">
            <HiCheck className="h-3 w-3 stroke-[2.5]" />
          </span>
        )
      )}
    </button>
  );
}
