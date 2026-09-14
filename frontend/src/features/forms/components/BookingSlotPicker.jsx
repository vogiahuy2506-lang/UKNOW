import { useI18n } from '../../../i18n';
import { formatSlotDateLabel } from '../utils/bookingFormat.util';

/**
 * BookingSlotPicker: hiển thị lưới khung giờ đặt lịch theo tuần, thuần trình bày (presentational).
 * Không tự gọi API — nhận `slots` đã tải sẵn từ component cha (FormRenderer), vốn nhận
 * `loadSlots` từ PublicFormPage. Giữ FormRenderer decoupled khỏi axios/publicClient để PR-4
 * (preview) và PR-5 (nhúng) tái dùng được.
 *
 * @param {object} props
 * @param {string} props.weekStart - Ngày đầu tuần đang xem (YYYY-MM-DD)
 * @param {Array<{date: string, time: string, remaining: number|null}>} props.slots
 * @param {boolean} [props.isLoading]
 * @param {string} [props.loadError]
 * @param {{date: string, time: string}|null} props.selected
 * @param {(date: string, time: string) => void} props.onSelect
 * @param {() => void} props.onPrevWeek
 * @param {() => void} props.onNextWeek
 * @param {boolean} props.canGoPrev
 * @param {boolean} props.canGoNext
 * @param {boolean} [props.disabled]
 * @param {boolean} [props.mock] - Chế độ xem trước (preview), không có dữ liệu thật
 * @param {string} [props.error] - Lỗi validate "chưa chọn khung giờ"
 */
export default function BookingSlotPicker({
  slots = [],
  isLoading = false,
  loadError = '',
  selected = null,
  onSelect,
  onPrevWeek,
  onNextWeek,
  canGoPrev = false,
  canGoNext = false,
  disabled = false,
  mock = false,
  error = '',
}) {
  const { t, locale } = useI18n();

  const slotsByDate = new Map();
  for (const slot of slots) {
    if (!slotsByDate.has(slot.date)) slotsByDate.set(slot.date, []);
    slotsByDate.get(slot.date).push(slot);
  }
  const dates = Array.from(slotsByDate.keys()).sort();

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <label className="block text-sm font-medium text-gray-800">
          {t('publicForm.booking.pickerTitle')}
          <span className="text-red-500 ml-1">*</span>
        </label>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onPrevWeek}
            disabled={disabled || mock || !canGoPrev}
            className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {t('publicForm.booking.prevWeek')}
          </button>
          <button
            type="button"
            onClick={onNextWeek}
            disabled={disabled || mock || !canGoNext}
            className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {t('publicForm.booking.nextWeek')}
          </button>
        </div>
      </div>

      <p className="text-xs text-gray-500">{t('publicForm.booking.timezoneNote')}</p>

      {mock ? (
        <div className="p-4 rounded-xl border border-dashed border-gray-300 bg-gray-50 text-center text-xs text-gray-500">
          {t('publicForm.booking.previewLocked')}
        </div>
      ) : isLoading ? (
        <div className="p-6 text-center text-gray-400 text-sm">
          <div className="inline-block animate-spin rounded-full h-5 w-5 border-2 border-gray-200 border-t-primary-600" />
        </div>
      ) : loadError ? (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs">
          {loadError}
        </div>
      ) : dates.length === 0 ? (
        <div className="p-4 rounded-xl border border-gray-200 bg-gray-50 text-center text-xs text-gray-500">
          {t('publicForm.booking.noSlotsThisWeek')}
        </div>
      ) : (
        <div className="space-y-3">
          {dates.map((date) => {
            const daySlots = slotsByDate.get(date) || [];
            return (
              <div key={date} className="rounded-xl border border-gray-200 p-3">
                <div className="text-xs font-semibold text-gray-700 mb-2 capitalize">
                  {formatSlotDateLabel(date, locale)}
                </div>
                <div className="flex flex-wrap gap-2">
                  {daySlots.map((slot) => {
                    const isFull = slot.remaining === 0;
                    const isSelected = selected?.date === slot.date && selected?.time === slot.time;
                    return (
                      <button
                        key={`${slot.date}_${slot.time}`}
                        type="button"
                        disabled={disabled || isFull}
                        onClick={() => onSelect(slot.date, slot.time)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                          isFull
                            ? 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed line-through'
                            : isSelected
                              ? 'border-primary-600 bg-primary-600 text-white'
                              : 'border-gray-300 text-gray-700 hover:bg-primary-50 hover:border-primary-300'
                        }`}
                      >
                        {slot.time}
                        {isFull
                          ? ` (${t('publicForm.booking.full')})`
                          : typeof slot.remaining === 'number'
                            ? ` (${t('publicForm.booking.remaining', { count: slot.remaining })})`
                            : ''}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
