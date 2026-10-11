import { CHAT_QUICK_PICKS } from '../utils/chatPromptTemplates.js';
import { useI18n } from '../../../i18n';

/**
 * Quick-pick chips hiển thị khi chat rỗng.
 * Click 1 chip → auto-fill composer + gửi luôn.
 */
export default function ChatQuickPicks({ onPick, disabled = false }) {
  const tc = useI18n('landingCanvas.chat');
  return (
    <div className="px-3 pb-3 shrink-0">
      <p className="text-[11px] font-semibold text-gray-400 dark:text-dk-muted uppercase tracking-wider mb-2">
        {tc('quickPicksTitle')}
      </p>
      <div className="grid grid-cols-2 gap-2">
        {CHAT_QUICK_PICKS.map((pick) => (
          <button
            key={pick.id}
            type="button"
            onClick={() => onPick?.(pick)}
            disabled={disabled}
            className="flex items-center gap-2 px-2.5 py-2 rounded-lg border border-gray-200 dark:border-dk-border bg-white dark:bg-dk-surface hover:border-orange-300 dark:hover:border-orange-700 hover:bg-orange-50 dark:hover:bg-orange-950/60 text-left text-[12px] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className="text-lg shrink-0 leading-none" aria-hidden>
              {pick.icon}
            </span>
            <span className="font-medium text-gray-700 dark:text-dk-text truncate">{pick.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
