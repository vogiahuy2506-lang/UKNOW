import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { HiOutlineSparkles, HiOutlineTemplate, HiOutlineX } from 'react-icons/hi';
import { useI18n } from '../../../i18n';
import SimpleChoiceCard from './SimpleChoiceCard';

/**
 * Hộp "Bạn muốn tạo chiến dịch theo cách nào?" mở từ nút "Tạo" ở trang Chiến dịch (header + trạng thái rỗng).
 * Hai thẻ lớn: "Từng bước" (Dễ — khuyên dùng) → trang `/app/campaigns/simple`; "Sơ đồ khối" (Nâng cao) → modal chọn loại hiện có,
 * phía sau KHÔNG đổi.
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {() => void} props.onStepByStep
 * @param {() => void} props.onBlocks
 */
export default function CreateMethodModal({ open, onClose, onStepByStep, onBlocks }) {
  const { t } = useI18n();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onCloseRef.current?.();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm" data-testid="create-method-modal">
      <div className="absolute inset-0" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-method-title"
        className="relative max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-100 bg-white shadow-2xl dark:border-dk-border dark:bg-dk-surface"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-dk-border/80 sm:px-6 sm:py-5">
          <div>
            <h3 id="create-method-title" className="text-lg font-bold text-slate-900 dark:text-dk-text">{t('simpleCampaign.entry.title')}</h3>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-dk-text2">{t('simpleCampaign.entry.subtitle')}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-dk-raised dark:hover:text-dk-text"
            aria-label={t('common.close')}
          >
            <HiOutlineX className="h-5 w-5" />
          </button>
        </div>
        <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2 sm:p-6">
          <SimpleChoiceCard
            testId="create-method-step"
            icon={HiOutlineSparkles}
            tone="orange"
            title={t('simpleCampaign.entry.step.title')}
            badge={t('simpleCampaign.entry.step.badge')}
            description={t('simpleCampaign.entry.step.desc')}
            onClick={onStepByStep}
            autoFocus
          />
          <SimpleChoiceCard
            testId="create-method-blocks"
            icon={HiOutlineTemplate}
            tone="slate"
            title={t('simpleCampaign.entry.blocks.title')}
            badge={t('simpleCampaign.entry.blocks.badge')}
            badgeTone="slate"
            description={t('simpleCampaign.entry.blocks.desc')}
            onClick={onBlocks}
          />
        </div>
      </div>
    </div>,
    document.body
  );
}
