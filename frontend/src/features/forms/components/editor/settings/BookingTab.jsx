import toast from 'react-hot-toast';
import { HiOutlineTrash } from 'react-icons/hi';
import { useI18n } from '../../../../../i18n';
import {
  WEEKDAY_KEYS,
  WEEKDAY_UI_ORDER,
  MAX_SLOTS_PER_DAY,
  MIN_SLOT_CAPACITY,
  MAX_SLOT_CAPACITY,
  MIN_DAYS_AHEAD,
  MAX_DAYS_AHEAD,
  MIN_NOTICE_MINUTES_MIN,
  MIN_NOTICE_MINUTES_MAX,
  MAX_CLOSED_DATES,
} from '../formEditorConstants';

/**
 * Tab "Đặt lịch hẹn" của modal Cài đặt. Chuyển NGUYÊN VĂN khối Đặt lịch hẹn + các handler khung giờ / ngày nghỉ của
 * trình soạn cũ (state `booking` vẫn nằm ở FormEditorPage để validate + dựng payload).
 */
export default function BookingTab({
  booking,
  setBooking,
  initialBookingHadConfig,
  confirmDisableBooking,
  setConfirmDisableBooking,
  errors,
  fields,
  settings,
}) {
  const { t } = useI18n();

  // Bật/tắt đặt lịch hẹn
  const handleToggleBookingEnabled = (checked) => {
    setBooking((prev) => ({ ...prev, enabled: checked }));
    if (checked) setConfirmDisableBooking(false);
  };

  const handleAddTimeSlot = (dayKey) => {
    setBooking((prev) => {
      const current = prev.weeklySlots[dayKey] || [];
      if (current.length >= MAX_SLOTS_PER_DAY) {
        toast.error(t('forms.editorPage.booking.maxSlotsPerDay'));
        return prev;
      }
      return { ...prev, weeklySlots: { ...prev.weeklySlots, [dayKey]: [...current, ''] } };
    });
  };

  const handleUpdateTimeSlot = (dayKey, idx, value) => {
    setBooking((prev) => {
      const current = [...(prev.weeklySlots[dayKey] || [])];
      current[idx] = value;
      return { ...prev, weeklySlots: { ...prev.weeklySlots, [dayKey]: current } };
    });
  };

  const handleRemoveTimeSlot = (dayKey, idx) => {
    setBooking((prev) => ({
      ...prev,
      weeklySlots: { ...prev.weeklySlots, [dayKey]: (prev.weeklySlots[dayKey] || []).filter((_, i) => i !== idx) },
    }));
  };

  // Áp khung giờ của Thứ 2 cho tất cả các ngày còn lại
  const handleApplyMondayToAll = () => {
    setBooking((prev) => {
      const mondaySlots = prev.weeklySlots['1'] || [];
      const next = {};
      for (const key of WEEKDAY_KEYS) next[key] = [...mondaySlots];
      return { ...prev, weeklySlots: next };
    });
  };

  const handleAddClosedDate = () => {
    setBooking((prev) => {
      if (prev.closedDates.length >= MAX_CLOSED_DATES) {
        toast.error(t('forms.editorPage.booking.maxClosedDates'));
        return prev;
      }
      return { ...prev, closedDates: [...prev.closedDates, ''] };
    });
  };

  const handleUpdateClosedDate = (idx, value) => {
    setBooking((prev) => {
      const next = [...prev.closedDates];
      next[idx] = value;
      return { ...prev, closedDates: next };
    });
  };

  const handleRemoveClosedDate = (idx) => {
    setBooking((prev) => ({ ...prev, closedDates: prev.closedDates.filter((_, i) => i !== idx) }));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 pb-3 border-b border-slate-100 dark:border-dk-border">
        <p className="text-xs text-slate-500 dark:text-dk-text2 mt-0.5">
          {t('forms.editorPage.booking.enableHelp')}
        </p>
        <label className="flex items-center gap-2 cursor-pointer select-none shrink-0 pt-1">
          <span className="text-xs font-semibold text-slate-700 dark:text-dk-text">
            {t('forms.editorPage.booking.enableLabel')}
          </span>
          <input
            type="checkbox"
            checked={booking.enabled}
            onChange={(e) => handleToggleBookingEnabled(e.target.checked)}
            className="h-4 w-4 rounded text-blue-600 dark:text-blue-400 focus:ring-blue-500 border-slate-300 dark:border-dk-border-strong"
          />
        </label>
      </div>

      {!booking.enabled && initialBookingHadConfig && (
        <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 text-amber-800 dark:text-amber-300 text-xs space-y-2">
          <p className="font-medium">{t('forms.editorPage.booking.disableWarning')}</p>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={confirmDisableBooking}
              onChange={(e) => setConfirmDisableBooking(e.target.checked)}
              className="h-4 w-4 rounded text-amber-600 dark:text-amber-400 focus:ring-amber-500 border-amber-300 dark:border-amber-700"
            />
            <span>{t('forms.editorPage.booking.disableConfirmCheckbox')}</span>
          </label>
          {errors.bookingDisableConfirm && (
            <p className="text-red-700 dark:text-red-400 font-medium">{errors.bookingDisableConfirm}</p>
          )}
        </div>
      )}

      {booking.enabled && (
        <div className="space-y-5">
          {(fields.every((f) => f.role !== 'email') || !settings.sendConfirmation) && (
            <p className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 text-blue-700 dark:text-blue-300 text-xs">
              {t('forms.editorPage.booking.emailHint')}
            </p>
          )}

          {errors.bookingSlots && (
            <p className="text-xs text-red-600 dark:text-red-400 p-3 bg-red-50 dark:bg-red-950/40 rounded-xl">{errors.bookingSlots}</p>
          )}

          {/* Khung giờ theo tuần */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700 dark:text-dk-text">
                {t('forms.editorPage.booking.weeklySlotsLabel')}
              </label>
              <button
                type="button"
                onClick={handleApplyMondayToAll}
                className="text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-medium"
              >
                {t('forms.editorPage.booking.applyMondayToAll')}
              </button>
            </div>
            <div className="space-y-2">
              {WEEKDAY_UI_ORDER.map((day) => (
                <div key={day.key} className="p-3 rounded-xl border border-gray-200 dark:border-dk-border bg-gray-50/50 dark:bg-dk-bg/50">
                  <div className="text-xs font-semibold text-gray-700 dark:text-dk-text mb-2">{t(day.labelKey)}</div>
                  <div className="flex flex-wrap items-center gap-2">
                    {(booking.weeklySlots[day.key] || []).map((time, idx) => (
                      <div key={idx} className="flex items-center gap-1">
                        <input
                          type="time"
                          value={time}
                          onChange={(e) => handleUpdateTimeSlot(day.key, idx, e.target.value)}
                          className="px-2 py-1.5 bg-white dark:bg-dk-bg rounded-lg border border-gray-300 dark:border-dk-border text-slate-900 dark:text-dk-text text-xs focus:outline-none focus:ring-1 focus:ring-primary-500"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveTimeSlot(day.key, idx)}
                          className="p-1 text-gray-400 dark:text-dk-muted hover:text-red-500 dark:hover:text-red-400 rounded"
                          title={t('forms.editorPage.booking.removeSlot')}
                        >
                          <HiOutlineTrash className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => handleAddTimeSlot(day.key)}
                      className="px-2.5 py-1.5 rounded-lg border border-dashed border-gray-300 dark:border-dk-border text-xs text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-950/30"
                    >
                      + {t('forms.editorPage.booking.addSlot')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Sức chứa / số ngày cho phép / báo trước tối thiểu */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-dk-text mb-1">
                {t('forms.editorPage.booking.capacityLabel')}
              </label>
              <input
                type="number"
                min={MIN_SLOT_CAPACITY}
                max={MAX_SLOT_CAPACITY}
                value={booking.slotCapacity}
                onChange={(e) => setBooking((prev) => ({ ...prev, slotCapacity: e.target.value }))}
                placeholder={t('forms.editorPage.booking.capacityPlaceholder')}
                className={`w-full px-3 py-2 bg-white dark:bg-dk-bg rounded-xl border text-sm text-slate-900 dark:text-dk-text focus:outline-none focus:ring-2 ${
                  errors.bookingCapacity
                    ? 'border-red-300 dark:border-red-500/60 focus:ring-red-200 dark:focus:ring-red-950/40'
                    : 'border-gray-300 dark:border-dk-border focus:border-primary-500 focus:ring-primary-100 dark:focus:ring-primary-950/40'
                }`}
              />
              {errors.bookingCapacity && (
                <p className="text-xs text-red-600 dark:text-red-400 mt-1">{errors.bookingCapacity}</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-dk-text mb-1">
                {t('forms.editorPage.booking.daysAheadLabel')}
              </label>
              <input
                type="number"
                min={MIN_DAYS_AHEAD}
                max={MAX_DAYS_AHEAD}
                value={booking.daysAhead}
                onChange={(e) => setBooking((prev) => ({ ...prev, daysAhead: e.target.value }))}
                className={`w-full px-3 py-2 bg-white dark:bg-dk-bg rounded-xl border text-sm text-slate-900 dark:text-dk-text focus:outline-none focus:ring-2 ${
                  errors.bookingDaysAhead
                    ? 'border-red-300 dark:border-red-500/60 focus:ring-red-200 dark:focus:ring-red-950/40'
                    : 'border-gray-300 dark:border-dk-border focus:border-primary-500 focus:ring-primary-100 dark:focus:ring-primary-950/40'
                }`}
              />
              {errors.bookingDaysAhead && (
                <p className="text-xs text-red-600 dark:text-red-400 mt-1">{errors.bookingDaysAhead}</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-dk-text mb-1">
                {t('forms.editorPage.booking.minNoticeLabel')}
              </label>
              <input
                type="number"
                min={MIN_NOTICE_MINUTES_MIN}
                max={MIN_NOTICE_MINUTES_MAX}
                value={booking.minNoticeMinutes}
                onChange={(e) => setBooking((prev) => ({ ...prev, minNoticeMinutes: e.target.value }))}
                className={`w-full px-3 py-2 bg-white dark:bg-dk-bg rounded-xl border text-sm text-slate-900 dark:text-dk-text focus:outline-none focus:ring-2 ${
                  errors.bookingMinNotice
                    ? 'border-red-300 dark:border-red-500/60 focus:ring-red-200 dark:focus:ring-red-950/40'
                    : 'border-gray-300 dark:border-dk-border focus:border-primary-500 focus:ring-primary-100 dark:focus:ring-primary-950/40'
                }`}
              />
              {errors.bookingMinNotice && (
                <p className="text-xs text-red-600 dark:text-red-400 mt-1">{errors.bookingMinNotice}</p>
              )}
            </div>
          </div>

          {/* Ngày nghỉ */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700 dark:text-dk-text">
                {t('forms.editorPage.booking.closedDatesLabel')}
              </label>
              <button
                type="button"
                onClick={handleAddClosedDate}
                className="text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-medium"
              >
                + {t('forms.editorPage.booking.addClosedDate')}
              </button>
            </div>
            {errors.bookingClosedDates && (
              <p className="text-xs text-red-600 dark:text-red-400">{errors.bookingClosedDates}</p>
            )}
            <div className="space-y-2">
              {booking.closedDates.map((d, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="date"
                    value={d}
                    onChange={(e) => handleUpdateClosedDate(idx, e.target.value)}
                    className="px-3 py-1.5 bg-white dark:bg-dk-bg rounded-lg border border-gray-300 dark:border-dk-border text-slate-900 dark:text-dk-text text-xs focus:outline-none focus:ring-1 focus:ring-primary-500"
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveClosedDate(idx)}
                    className="p-1.5 text-gray-400 dark:text-dk-muted hover:text-red-500 dark:hover:text-red-400 rounded"
                  >
                    <HiOutlineTrash className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
