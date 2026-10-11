import { DEFAULT_ZOOM, MIN_ZOOM, MAX_ZOOM, ZOOM_STEP } from '../utils/deviceFrameConfig.js';
import { HiOutlinePlus, HiOutlineMinus } from 'react-icons/hi';

/**
 * Zoom control cho preview: Hỗ trợ phóng to, thu nhỏ, đặt lại 100% và chế độ "Vừa màn hình" (Fit).
 */
export default function ZoomControl({
  value,
  onChange,
  isFit = false,
  onToggleFit,
  fitPercent = null,
}) {
  const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value || DEFAULT_ZOOM));
  const percent = isFit && fitPercent ? fitPercent : Math.round(clamped * 100);

  const dec = () => {
    if (isFit && onToggleFit) onToggleFit();
    onChange?.(Math.round((clamped - ZOOM_STEP) * 100) / 100);
  };

  const inc = () => {
    if (isFit && onToggleFit) onToggleFit();
    onChange?.(Math.round((clamped + ZOOM_STEP) * 100) / 100);
  };

  const reset = () => {
    if (isFit && onToggleFit) onToggleFit();
    onChange?.(DEFAULT_ZOOM);
  };

  return (
    <div className="flex items-center gap-0.5 px-1 py-1 bg-gray-100/90 dark:bg-dk-raised/90 rounded-xl">
      <button
        type="button"
        onClick={dec}
        disabled={clamped <= MIN_ZOOM}
        className="p-1.5 rounded-lg text-gray-500 dark:text-dk-text2 hover:text-gray-900 dark:hover:text-dk-text disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white/60 dark:hover:bg-dk-strong/60 transition-colors"
        title="Thu nhỏ (-10%)"
      >
        <HiOutlineMinus className="w-3.5 h-3.5" />
      </button>

      {onToggleFit && (
        <button
          type="button"
          onClick={onToggleFit}
          className={`px-2 py-1 rounded-lg text-xs font-semibold transition-all ${
            isFit
              ? 'bg-white dark:bg-dk-surface text-orange-600 dark:text-orange-400 shadow-xs ring-1 ring-orange-500/20'
              : 'text-gray-600 dark:text-dk-text2 hover:text-gray-900 dark:hover:text-dk-text hover:bg-white/60 dark:hover:bg-dk-strong/60'
          }`}
          title="Tự động thu phóng vừa vặn toàn bộ màn hình"
        >
          {isFit ? `Fit (${percent}%)` : 'Fit'}
        </button>
      )}

      <button
        type="button"
        onClick={reset}
        className={`text-xs font-semibold px-2 py-1 rounded-lg transition-colors ${
          !isFit && percent === 100
            ? 'bg-white dark:bg-dk-surface text-orange-600 dark:text-orange-400 shadow-xs'
            : 'text-gray-700 dark:text-dk-text hover:text-orange-600 dark:hover:text-orange-400 hover:bg-white/60 dark:hover:bg-dk-strong/60'
        }`}
        title="Đặt lại zoom 100%"
      >
        {isFit ? '100%' : `${percent}%`}
      </button>

      <button
        type="button"
        onClick={inc}
        disabled={clamped >= MAX_ZOOM}
        className="p-1.5 rounded-lg text-gray-500 dark:text-dk-text2 hover:text-gray-900 dark:hover:text-dk-text disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white/60 dark:hover:bg-dk-strong/60 transition-colors"
        title="Phóng to (+10%)"
      >
        <HiOutlinePlus className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
