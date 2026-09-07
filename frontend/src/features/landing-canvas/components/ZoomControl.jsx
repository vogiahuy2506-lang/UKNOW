import { DEFAULT_ZOOM, MIN_ZOOM, MAX_ZOOM, ZOOM_STEP } from '../utils/deviceFrameConfig.js';
import { HiOutlinePlus, HiOutlineMinus } from 'react-icons/hi';

/**
 * Zoom slider 50%-150% cho preview.
 * Style compact, fit trên toolbar ngang.
 */
export default function ZoomControl({ value, onChange }) {
  const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value || DEFAULT_ZOOM));
  const percent = Math.round(clamped * 100);

  const dec = () => onChange?.(Math.round((clamped - ZOOM_STEP) * 100) / 100);
  const inc = () => onChange?.(Math.round((clamped + ZOOM_STEP) * 100) / 100);
  const reset = () => onChange?.(DEFAULT_ZOOM);

  return (
    <div className="flex items-center gap-1 px-1.5 py-1 bg-gray-100 rounded-lg">
      <button
        type="button"
        onClick={dec}
        disabled={clamped <= MIN_ZOOM}
        className="p-1.5 rounded text-gray-500 hover:text-gray-900 disabled:opacity-40 disabled:cursor-not-allowed"
        title="Zoom out"
      >
        <HiOutlineMinus className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={reset}
        className="text-[13px] font-semibold text-gray-700 hover:text-orange-600 min-w-[52px] text-center px-1.5"
        title="Reset zoom"
      >
        {percent}%
      </button>
      <button
        type="button"
        onClick={inc}
        disabled={clamped >= MAX_ZOOM}
        className="p-1.5 rounded text-gray-500 hover:text-gray-900 disabled:opacity-40 disabled:cursor-not-allowed"
        title="Zoom in"
      >
        <HiOutlinePlus className="w-4 h-4" />
      </button>
    </div>
  );
}
