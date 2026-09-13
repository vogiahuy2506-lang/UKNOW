import { HiOutlineClock, HiOutlinePlus, HiOutlineSave, HiOutlineTrash } from 'react-icons/hi';

// PLAN_CAU_HINH_LICH_NHAC_HAN_2026-09-13.md, mục 5 (PR-2) — thành phần thuần hiển thị (props
// vào, callback ra), không tự gọi API/giữ state riêng. Toàn bộ state + validate + gọi API nằm ở
// AdminWelcomeEmailPage.jsx (container) để logic isDirty/chuyển tab canh được ở một nơi.
export default function AdminSubscriptionReminderScheduleSection({
  t,
  locale,
  isLoading,
  isSaving,
  draftDays,
  errors,
  isValid,
  isDirty,
  previewText,
  showEmptyWarning,
  updatedAt,
  onChangeDay,
  onAddDay,
  onRemoveDay,
  onSave,
}) {
  if (isLoading) {
    return <div className="py-16 text-center text-sm text-gray-400">{t('common.loading')}</div>;
  }

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <section className="space-y-5 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold text-gray-900">{t('adminSubscriptionReminderSchedule.title')}</h2>
          <button
            type="button"
            className="btn btn-primary inline-flex items-center gap-2"
            onClick={onSave}
            disabled={isSaving || !isDirty || !isValid}
          >
            <HiOutlineSave className="h-4 w-4" />
            {isSaving ? t('common.saving') : t('common.save')}
          </button>
        </div>
        <p className="text-sm text-gray-500">{t('adminSubscriptionReminderSchedule.subtitle')}</p>

        <div className="flex items-start gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
          <HiOutlineClock className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-400" />
          <span>{t('adminSubscriptionReminderSchedule.fixedTimeNote')}</span>
        </div>

        <div className="space-y-2">
          <span className="text-sm font-medium text-gray-700">{t('adminSubscriptionReminderSchedule.daysLabel')}</span>
          <p className="text-xs text-gray-500">{t('adminSubscriptionReminderSchedule.daysHint')}</p>

          <div className="space-y-2">
            {draftDays.map((day, index) => (
              <div key={index} className="flex items-center gap-2">
                <input
                  type="number"
                  aria-label={t('adminSubscriptionReminderSchedule.dayInputLabel', { index: index + 1 })}
                  value={day}
                  onChange={(event) => onChangeDay(index, event.target.value)}
                  min={1}
                  max={365}
                  className="w-28 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                />
                <span className="text-sm text-gray-500">{t('adminSubscriptionReminderSchedule.daysUnit')}</span>
                <button
                  type="button"
                  aria-label={t('adminSubscriptionReminderSchedule.removeDay')}
                  onClick={() => onRemoveDay(index)}
                  className="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                >
                  <HiOutlineTrash className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={onAddDay}
            className="btn btn-secondary inline-flex items-center gap-2"
          >
            <HiOutlinePlus className="h-4 w-4" />
            {t('adminSubscriptionReminderSchedule.addDay')}
          </button>
        </div>

        {errors.length > 0 && (
          <div role="alert" className="space-y-1 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {errors.map((message) => (
              <p key={message}>{message}</p>
            ))}
          </div>
        )}

        {showEmptyWarning && (
          <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <p className="font-semibold">{t('adminSubscriptionReminderSchedule.emptyWarningTitle')}</p>
            <p className="mt-1">{t('adminSubscriptionReminderSchedule.emptyWarningBody')}</p>
          </div>
        )}

        {updatedAt && (
          <p className="text-xs text-gray-400">
            {t('adminSubscriptionReminderSchedule.updatedAt', {
              time: new Date(updatedAt).toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN'),
            })}
          </p>
        )}
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="font-semibold text-gray-900">{t('adminSubscriptionReminderSchedule.previewTitle')}</h2>
        <p className="mt-3 rounded-lg bg-orange-50 p-4 text-sm text-orange-800">{previewText}</p>
      </section>
    </div>
  );
}
