import { HiOutlineCheckCircle, HiOutlineChevronRight } from 'react-icons/hi';
import { SIMPLE_STEP_IDS } from './simpleCampaign.helpers';

/**
 * Thanh tiến trình kiểu Gửi nhanh (QuickSend.jsx): bước đang làm màu cam, bước đã qua màu xanh (bấm để quay lại),
 * bước chưa tới màu xám. Cuộn ngang trên màn hẹp.
 *
 * @param {object} props
 * @param {string} props.currentStepId
 * @param {(stepId: string) => void} props.onSelectStep chỉ được gọi cho bước đã qua (`freeJump`: cho mọi bước)
 * @param {boolean} [props.freeJump] chế độ sửa: dữ liệu đã đủ nên bấm bước nào cũng được
 * @param {(key: string, params?: object) => string} props.t
 */
export default function SimpleStepper({ currentStepId, onSelectStep, freeJump = false, t }) {
  const currentIndex = SIMPLE_STEP_IDS.indexOf(currentStepId);
  return (
    <nav aria-label={t('simpleCampaign.stepperLabel')} className="overflow-x-auto border-b border-gray-200 pb-4 dark:border-dk-border">
      <ol className="flex items-center gap-2">
        {SIMPLE_STEP_IDS.map((id, index) => {
          const isActive = index === currentIndex;
          const isDone = freeJump ? !isActive : index < currentIndex;
          const tone = isActive
            ? 'bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300'
            : isDone
              ? 'bg-green-100 text-green-700 hover:bg-green-200 dark:bg-emerald-950/40 dark:text-emerald-300'
              : 'bg-gray-100 text-gray-500 dark:bg-dk-raised dark:text-dk-text2';
          return (
            <li key={id} className="flex shrink-0 items-center" data-testid={`simple-step-${id}`} aria-current={isActive ? 'step' : undefined}>
              <button
                type="button"
                disabled={!isDone}
                onClick={() => onSelectStep(id)}
                className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition ${tone} ${isDone ? 'cursor-pointer' : 'cursor-default'}`}
              >
                {isDone ? (
                  <HiOutlineCheckCircle className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <span className="flex h-4 w-4 items-center justify-center text-xs font-bold" aria-hidden="true">{index + 1}</span>
                )}
                <span>{t(`simpleCampaign.steps.${id}`)}</span>
              </button>
              {index < SIMPLE_STEP_IDS.length - 1 && (
                <HiOutlineChevronRight className="mx-1 h-4 w-4 text-gray-300 dark:text-dk-muted" aria-hidden="true" />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
