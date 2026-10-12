import { HiOutlineClock, HiOutlinePlus, HiOutlineSave, HiOutlineTrash } from 'react-icons/hi';

// PLAN_CAU_HINH_LICH_NHAC_HAN_2026-09-13.md, mục 5 (PR-2) — thành phần thuần hiển thị (props
// vào, callback ra), không tự gọi API/giữ state riêng. Toàn bộ state + validate + gọi API nằm ở
// AdminWelcomeEmailPage.jsx (container) để logic isDirty/chuyển tab canh được ở một nơi.
//
// PLAN_MOC_NHAC_HAN_THEO_KY_2026-10-12.md, B5 — hai danh sách mốc cùng kiểu nhập/kiểm: "Gói tháng" (props draftDays...)
// và "Gói năm" (props yearly...). Lưu một lần cả hai ở nút Lưu của container.
function ReminderDaysList({
  t,
  title,
  hint,
  inputLabelKey,
  addLabel,
  removeLabel,
  draftDays,
  errors,
  showEmptyWarning,
  emptyTitle,
  emptyBody,
  onChangeDay,
  onAddDay,
  onRemoveDay,
}) {
  return (
    <div className="space-y-2">
      <div>
        <span className="text-sm font-medium text-gray-700 dark:text-dk-text">{title}</span>
        <p className="text-xs text-gray-500 dark:text-dk-text2">{hint}</p>
      </div>

      <div className="space-y-2">
        {draftDays.map((day, index) => (
          <div key={index} className="flex items-center gap-2">
            <input
              type="number"
              aria-label={t(inputLabelKey, { index: index + 1 })}
              value={day}
              onChange={(event) => onChangeDay(index, event.target.value)}
              min={1}
              max={365}
              className="w-28 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20 dark:border-dk-border dark:bg-dk-inset dark:text-dk-text"
            />
            <span className="text-sm text-gray-500 dark:text-dk-text2">{t('adminSubscriptionReminderSchedule.daysUnit')}</span>
            <button
              type="button"
              aria-label={removeLabel}
              onClick={() => onRemoveDay(index)}
              className="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:text-dk-muted dark:hover:bg-red-950/40 dark:hover:text-red-400"
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
        {addLabel}
      </button>

      {errors.length > 0 && (
        <div role="alert" className="space-y-1 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          {errors.map((message) => (
            <p key={message}>{message}</p>
          ))}
        </div>
      )}

      {showEmptyWarning && (
        <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
          <p className="font-semibold">{emptyTitle}</p>
          <p className="mt-1">{emptyBody}</p>
        </div>
      )}
    </div>
  );
}

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
  yearlyDraftDays,
  yearlyErrors,
  yearlyPreviewText,
  showYearlyEmptyWarning,
  updatedAt,
  onChangeDay,
  onAddDay,
  onRemoveDay,
  onChangeYearlyDay,
  onAddYearlyDay,
  onRemoveYearlyDay,
  onSave,
}) {
  if (isLoading) {
    return <div className="py-16 text-center text-sm text-gray-400 dark:text-dk-muted">{t('common.loading')}</div>;
  }

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <section className="space-y-5 rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-dk-border dark:bg-dk-surface">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold text-gray-900 dark:text-dk-text">{t('adminSubscriptionReminderSchedule.title')}</h2>
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
        <p className="text-sm text-gray-500 dark:text-dk-text2">{t('adminSubscriptionReminderSchedule.subtitle')}</p>

        <div className="flex items-start gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600 dark:border-dk-border dark:bg-dk-raised dark:text-dk-text">
          <HiOutlineClock className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-400 dark:text-dk-muted" />
          <span>{t('adminSubscriptionReminderSchedule.fixedTimeNote')}</span>
        </div>

        <div className="space-y-1">
          <span className="text-sm font-medium text-gray-700 dark:text-dk-text">{t('adminSubscriptionReminderSchedule.daysLabel')}</span>
          <p className="text-xs text-gray-500 dark:text-dk-text2">{t('adminSubscriptionReminderSchedule.daysHint')}</p>
        </div>

        <ReminderDaysList
          t={t}
          title={t('adminSubscriptionReminderSchedule.monthlyTitle')}
          hint={t('adminSubscriptionReminderSchedule.monthlyHint')}
          inputLabelKey="adminSubscriptionReminderSchedule.dayInputLabel"
          addLabel={t('adminSubscriptionReminderSchedule.addDay')}
          removeLabel={t('adminSubscriptionReminderSchedule.removeDay')}
          draftDays={draftDays}
          errors={errors}
          showEmptyWarning={showEmptyWarning}
          emptyTitle={t('adminSubscriptionReminderSchedule.emptyWarningTitle')}
          emptyBody={t('adminSubscriptionReminderSchedule.emptyWarningBody')}
          onChangeDay={onChangeDay}
          onAddDay={onAddDay}
          onRemoveDay={onRemoveDay}
        />

        <ReminderDaysList
          t={t}
          title={t('adminSubscriptionReminderSchedule.yearlyTitle')}
          hint={t('adminSubscriptionReminderSchedule.yearlyHint')}
          inputLabelKey="adminSubscriptionReminderSchedule.dayInputLabelYearly"
          addLabel={t('adminSubscriptionReminderSchedule.addDayYearly')}
          removeLabel={t('adminSubscriptionReminderSchedule.removeDayYearly')}
          draftDays={yearlyDraftDays}
          errors={yearlyErrors}
          showEmptyWarning={showYearlyEmptyWarning}
          emptyTitle={t('adminSubscriptionReminderSchedule.emptyWarningYearlyTitle')}
          emptyBody={t('adminSubscriptionReminderSchedule.emptyWarningYearlyBody')}
          onChangeDay={onChangeYearlyDay}
          onAddDay={onAddYearlyDay}
          onRemoveDay={onRemoveYearlyDay}
        />

        {updatedAt && (
          <p className="text-xs text-gray-400 dark:text-dk-muted">
            {t('adminSubscriptionReminderSchedule.updatedAt', {
              time: new Date(updatedAt).toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN'),
            })}
          </p>
        )}
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-dk-border dark:bg-dk-surface">
        <h2 className="font-semibold text-gray-900 dark:text-dk-text">{t('adminSubscriptionReminderSchedule.previewTitle')}</h2>
        <div className="mt-3 space-y-2">
          <p className="rounded-lg bg-orange-50 p-4 text-sm text-orange-800 dark:border dark:border-orange-900/50 dark:bg-orange-950/30 dark:text-orange-300">{previewText}</p>
          <p className="rounded-lg bg-orange-50 p-4 text-sm text-orange-800 dark:border dark:border-orange-900/50 dark:bg-orange-950/30 dark:text-orange-300">{yearlyPreviewText}</p>
        </div>
      </section>
    </div>
  );
}
