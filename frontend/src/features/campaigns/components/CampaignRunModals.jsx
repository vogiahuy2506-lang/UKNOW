import {
  HiOutlineCalendar,
  HiOutlineExclamation,
  HiOutlineX,
} from 'react-icons/hi';
import { useI18n } from '../../../i18n';
import FullScreenOverlay from '../../../components/FullScreenOverlay';
import {
  formatCampaignDateTime,
  getTodayDateInHanoiForInput,
} from '../utils/campaignDateTime.helpers';
import {
  filterSchedulesByCampaignId,
  formatScheduleRunClockFromCron,
  getSchedulePatternSummaryVi,
  getScheduleRunTimingFieldLabelVi,
  resolveScheduleUiTimingDate,
} from '../utils/campaignRunSchedule.helpers';

/**
 * Sinh nhãn giờ chạy hiển thị trên modal (đọc 2 trường đầu của cron 5 phần).
 *
 * @param {string} cronExpression biểu thức cron
 * @returns {string} dạng «Lúc HH:mm» hoặc «—» nếu không parse được
 */
const scheduleClockUiLabel = (cronExpression, t) => {
  const clock = formatScheduleRunClockFromCron(cronExpression);
  return clock ? t('campaignRunModals.atTime', { time: clock }) : '—';
};

/**
 * Giá trị hiển thị cho cột thời gian chạy (lịch 1 lần: suy từ cron + ngày tạo khi có thể).
 *
 * @param {object} schedule bản ghi lịch chạy
 * @returns {string}
 */
const getScheduleNextRunUiLabel = (schedule, t) => {
  const at = resolveScheduleUiTimingDate(schedule);
  if (!at) return t('campaignRunModals.undetermined');
  return formatCampaignDateTime(at);
};

const CampaignRunModals = ({
  weeklyDayOptions,
  showRunConfirmModal,
  closeRunConfirmModal,
  runConfirmCampaign,
  runNameInput,
  setRunNameInput,
  runContinuousMode,
  setRunContinuousMode,
  runPollIntervalMinutes,
  setRunPollIntervalMinutes,
  isRunResumeLocked = false,
  runResumeMode,
  setRunResumeMode,
  runResumeFromId,
  setRunResumeFromId,
  continuousResumeRunOptions,
  isLoadingContinuousResumeOptions,
  shouldShowRunContinuousOptions = true,
  isSubmittingRun,
  handleRunNow,
  stopRunConfirmTarget,
  closeStopRunConfirmModal,
  handleConfirmStopRun,
  stoppingRunIds,
  showScheduleModal,
  selectedCampaign,
  closeScheduleModal,
  scheduleForm,
  setScheduleForm,
  handleSaveSchedule,
  showScheduleDetailModal,
  selectedSchedule,
  closeScheduleDetailModal,
  getWeeklyDayLabel,
  getWeeklyDayFromCron,
  getScheduleTypeLabel,
  getScheduleStatusClassName,
  getScheduleStatusLabel,
  scheduleRuns,
  handleToggleSchedule,
  isReadonlyOnceSchedule,
  campaignSchedulesModalCampaign = null,
  closeCampaignSchedulesSummaryModal,
  allSchedules = [],
}) => {
  const { t } = useI18n();
  return (
    <>
    {showRunConfirmModal && (
      <FullScreenOverlay isOpen={showRunConfirmModal}>
        <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
          <div className="flex items-center justify-between p-6 border-b">
            <h3 className="text-lg font-semibold text-gray-900">{t('campaignRunModals.confirmRunCampaign')}</h3>
            <button onClick={closeRunConfirmModal} className="p-1 hover:bg-gray-100 rounded-lg">
              <HiOutlineX className="w-5 h-5" />
            </button>
          </div>
          <div className="p-6 space-y-4">
            <p className="text-sm text-gray-600">
              {t('campaignRunModals.aboutToRunCampaign')} <span className="font-semibold text-gray-900">{runConfirmCampaign?.campaignName}</span>.
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('campaignRunModals.runName')}</label>
              <input
                type="text"
                value={runNameInput}
                onChange={(e) => setRunNameInput(e.target.value)}
                className="input"
                placeholder={t('campaignRunModals.runNamePlaceholder')}
                disabled={isRunResumeLocked}
              />
            </div>
            {shouldShowRunContinuousOptions && (
              <div className="rounded-lg border border-gray-200 p-3 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <label htmlFor="run-continuous-mode" className="text-sm font-medium text-gray-700">
                    {t('campaignRunModals.continuousMode')}
                  </label>
                  <input
                    id="run-continuous-mode"
                    type="checkbox"
                    checked={Boolean(runContinuousMode)}
                    onChange={(e) => setRunContinuousMode(e.target.checked)}
                    className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
                  />
                </div>
                {runContinuousMode && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        {t('campaignRunModals.scanIntervalMinutes')}
                      </label>
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={runPollIntervalMinutes}
                        onChange={(e) => setRunPollIntervalMinutes(e.target.value)}
                        className="input"
                        disabled={isRunResumeLocked}
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        {t('campaignRunModals.scanIntervalHint')}
                      </p>
                      {isRunResumeLocked && (
                        <p className="text-xs text-amber-600 mt-1">
                          {t('campaignRunModals.resumeLockedHint')}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <label htmlFor="run-resume-mode" className="text-sm font-medium text-gray-700">
                        {t('campaignRunModals.resumeContinuous')}
                      </label>
                      <input
                        id="run-resume-mode"
                        type="checkbox"
                        checked={Boolean(runResumeMode)}
                        onChange={(e) => setRunResumeMode(e.target.checked)}
                        className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
                      />
                    </div>
                    {runResumeMode && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          {t('campaignRunModals.selectContinuousRun')}
                        </label>
                        <select
                          value={runResumeFromId}
                          onChange={(e) => setRunResumeFromId(e.target.value)}
                          className="input"
                          disabled={isLoadingContinuousResumeOptions}
                        >
                          <option value="">
                            {isLoadingContinuousResumeOptions
                              ? t('campaignRunModals.loadingContinuousRuns')
                              : t('campaignRunModals.selectContinuous')}
                          </option>
                          {(Array.isArray(continuousResumeRunOptions) ? continuousResumeRunOptions : []).map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.label}
                            </option>
                          ))}
                        </select>
                        {!isLoadingContinuousResumeOptions && (!continuousResumeRunOptions || continuousResumeRunOptions.length === 0) && (
                          <p className="text-xs text-amber-600 mt-1">
                            {t('campaignRunModals.noContinuousRuns')}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="flex justify-end gap-3 p-6 border-t bg-gray-50 rounded-b-xl">
            <button onClick={closeRunConfirmModal} className="btn btn-secondary" disabled={isSubmittingRun}>
              {t('campaignRunModals.cancel')}
            </button>
            <button onClick={handleRunNow} className="btn btn-primary" disabled={isSubmittingRun}>
              {isSubmittingRun ? t('campaignRunModals.running') : t('campaignRunModals.confirmingRun')}
            </button>
          </div>
        </div>
      </FullScreenOverlay>
    )}

    {stopRunConfirmTarget && (
      <FullScreenOverlay isOpen={Boolean(stopRunConfirmTarget)}>
        <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
          <div className="flex items-center justify-between p-6 border-b">
            <h3 className="text-lg font-semibold text-gray-900">{t('campaignRunModals.confirmStopRun')}</h3>
            <button onClick={closeStopRunConfirmModal} className="p-1 hover:bg-gray-100 rounded-lg">
              <HiOutlineX className="w-5 h-5" />
            </button>
          </div>
          <div className="p-6 space-y-4">
            <div className="flex items-start gap-3 rounded-lg border border-red-100 bg-red-50 p-3">
              <HiOutlineExclamation className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
              <div className="text-sm text-red-700">
                <p className="font-medium">{t('campaignRunModals.aboutToStopRun')}</p>
                <p className="mt-1">
                  {t('campaignRunModals.stopRunHint')}
                </p>
              </div>
            </div>
            <div className="text-sm text-gray-600 space-y-1">
              <p>
                <span className="font-medium text-gray-900">{t('campaignRunModals.runName2')}</span>{' '}
                {String(stopRunConfirmTarget?.runName || '').trim() || `#${stopRunConfirmTarget?.id}`}
              </p>
              <p>
                <span className="font-medium text-gray-900">{t('campaignRunModals.runId')}</span> {stopRunConfirmTarget?.id}
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-3 p-6 border-t bg-gray-50 rounded-b-xl">
            <button
              onClick={closeStopRunConfirmModal}
              className="btn btn-secondary"
              disabled={stoppingRunIds.has(Number(stopRunConfirmTarget?.id))}
            >
              {t('campaignRunModals.cancel')}
            </button>
            <button
              onClick={handleConfirmStopRun}
              className="btn btn-danger"
              disabled={stoppingRunIds.has(Number(stopRunConfirmTarget?.id))}
            >
              {stoppingRunIds.has(Number(stopRunConfirmTarget?.id)) ? t('campaignRunModals.stopping') : t('campaignRunModals.confirmingStop')}
            </button>
          </div>
        </div>
      </FullScreenOverlay>
    )}

    {showScheduleModal && (
      <FullScreenOverlay isOpen={showScheduleModal}>
        <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4">
          <div className="flex items-center justify-between p-6 border-b">
            <h3 className="text-lg font-semibold text-gray-900">
              {t('campaignRunModals.setupSchedule')} - {selectedCampaign?.campaignName}
            </h3>
            <button onClick={closeScheduleModal} className="p-1 hover:bg-gray-100 rounded-lg">
              <HiOutlineX className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('campaignRunModals.scheduleName')}
              </label>
              <input
                type="text"
                value={scheduleForm.scheduleName}
                onChange={(e) => setScheduleForm({ ...scheduleForm, scheduleName: e.target.value })}
                className="input"
                placeholder={t('campaignRunModals.scheduleNamePlaceholder')}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('campaignRunModals.scheduleType')}
              </label>
              <select
                value={scheduleForm.scheduleType}
                onChange={(e) =>
                  setScheduleForm({
                    ...scheduleForm,
                    scheduleType: e.target.value,
                    weeklyDay: e.target.value === 'weekly' ? (scheduleForm.weeklyDay || '1') : scheduleForm.weeklyDay,
                  })
                }
                className="input"
              >
                <option value="once">{t('campaignRunModals.runOnce')}</option>
                <option value="daily">{t('campaignRunModals.daily')}</option>
                <option value="weekly">{t('campaignRunModals.weekly')}</option>
                <option value="monthly">{t('campaignRunModals.monthly')}</option>
                <option value="custom">{t('campaignRunModals.customEveryNDays')}</option>
                <option value="after_delay">{t('campaignRunModals.customAfterDelay')}</option>
              </select>
            </div>

            {scheduleForm.scheduleType === 'weekly' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('campaignRunModals.runOnDay')}
                </label>
                <select
                  value={scheduleForm.weeklyDay || '1'}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, weeklyDay: e.target.value })}
                  className="input"
                >
                  {weeklyDayOptions.map((day) => (
                    <option key={day.value} value={day.value}>
                      {day.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {scheduleForm.scheduleType === 'once' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('campaignRunModals.runDate')}
                </label>
                <input
                  type="date"
                  value={scheduleForm.scheduleDate}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, scheduleDate: e.target.value })}
                  className="input"
                  min={getTodayDateInHanoiForInput()}
                />
              </div>
            )}

            {(scheduleForm.scheduleType === 'custom') && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('campaignRunModals.everyNthDay')}
                </label>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={scheduleForm.customIntervalDays}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, customIntervalDays: e.target.value })}
                  className="input"
                  placeholder={t('campaignRunModals.exampleValue')}
                />
              </div>
            )}

            {(scheduleForm.scheduleType === 'after_delay') && (
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('campaignRunModals.runAfterDelay')}
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={scheduleForm.delayValue}
                      onChange={(e) => setScheduleForm({ ...scheduleForm, delayValue: e.target.value })}
                      className="input"
                      placeholder={t('campaignRunModals.exampleValue')}
                    />
                    <select
                      value={scheduleForm.delayUnit}
                      onChange={(e) => setScheduleForm({ ...scheduleForm, delayUnit: e.target.value })}
                      className="input"
                    >
                      <option value="minutes">{t('campaignRunModals.minutes')}</option>
                      <option value="hours">{t('campaignRunModals.hours')}</option>
                      <option value="days">{t('campaignRunModals.days')}</option>
                    </select>
                  </div>
                </div>
                {scheduleForm.delayPreviewAt ? (
                  <p className="text-xs text-gray-500">
                    {t('campaignRunModals.estimatedRunTime')} {formatCampaignDateTime(scheduleForm.delayPreviewAt)}
                  </p>
                ) : (
                  <p className="text-xs text-amber-600">
                    {t('campaignRunModals.enterValidTime')}
                  </p>
                )}
              </div>
            )}

            {scheduleForm.scheduleType !== 'after_delay' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('campaignRunModals.runTime')}
                </label>
                <input
                  type="time"
                  value={scheduleForm.scheduleTime}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, scheduleTime: e.target.value })}
                  className="input"
                />
              </div>
            )}

            <div className="flex items-center">
              <input
                type="checkbox"
                id="enabled"
                checked={scheduleForm.enabled}
                onChange={(e) => setScheduleForm({ ...scheduleForm, enabled: e.target.checked })}
                className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
              />
              <label htmlFor="enabled" className="ml-2 text-sm text-gray-700">
                {t('campaignRunModals.enableSchedule')}
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-3 p-6 border-t bg-gray-50 rounded-b-xl">
            <button onClick={closeScheduleModal} className="btn btn-secondary">
              {t('campaignRunModals.cancel')}
            </button>
            <button onClick={handleSaveSchedule} className="btn btn-primary">
              <HiOutlineCalendar className="w-4 h-4 mr-2" />
              {t('campaignRunModals.createSchedule')}
            </button>
          </div>
        </div>
      </FullScreenOverlay>
    )}

    {showScheduleDetailModal && selectedSchedule && (
      <FullScreenOverlay isOpen={showScheduleDetailModal}>
        <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl mx-4 max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between p-6 border-b sticky top-0 bg-white z-10">
            <h3 className="text-lg font-semibold text-gray-900">
              {t('campaignRunModals.scheduleDetails')} - {selectedSchedule.scheduleName}
            </h3>
            <button onClick={closeScheduleDetailModal} className="p-1 hover:bg-gray-100 rounded-lg">
              <HiOutlineX className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6 space-y-6">
            <div className="bg-gray-50 rounded-lg p-4 space-y-2">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500">{t('campaignRunModals.campaign')}</p>
                  <p className="font-medium text-gray-900">{selectedSchedule.campaignName}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">{t('campaignRunModals.scheduleType2')}</p>
                  <p className="font-medium text-gray-900">
                    {selectedSchedule.scheduleType === 'weekly'
                      ? `${t('campaignRunModals.weekly')} (${getWeeklyDayLabel(getWeeklyDayFromCron(selectedSchedule.cronExpression))})`
                      : getScheduleTypeLabel(selectedSchedule.scheduleType)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">{t('campaignRunModals.runHour')}</p>
                  <p className="font-medium text-gray-900">
                    {scheduleClockUiLabel(selectedSchedule.cronExpression, t)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">{t('campaignRunModals.cronExpression')}</p>
                  <code className="text-xs bg-white px-2 py-1 rounded border">{selectedSchedule.cronExpression}</code>
                </div>
                <div>
                  <p className="text-sm text-gray-500">{t('campaignRunModals.status')}</p>
                  <span className={`badge ${getScheduleStatusClassName(selectedSchedule)}`}>
                    {getScheduleStatusLabel(selectedSchedule)}
                  </span>
                </div>
                <div>
                  <p className="text-sm text-gray-500">{t('campaignRunModals.runCount')}</p>
                  <p className="font-medium text-gray-900">{selectedSchedule.runCount || 0} {t('campaignRunModals.times')}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">{t('campaignRunModals.lastRun')}</p>
                  <p className="font-medium text-gray-900">
                    {selectedSchedule.lastRunAt
                      ? formatCampaignDateTime(selectedSchedule.lastRunAt)
                      : t('campaignRunModals.neverRun')}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">{getScheduleRunTimingFieldLabelVi(selectedSchedule)}</p>
                  <p className="font-medium text-gray-900">
                    {getScheduleNextRunUiLabel(selectedSchedule, t)}
                  </p>
                </div>
              </div>
            </div>

            <div>
              <h4 className="text-md font-semibold text-gray-900 mb-3">{t('campaignRunModals.runHistory')}</h4>

              {scheduleRuns.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  {t('campaignRunModals.noRunHistory')}
                </div>
              ) : (
                <div className="overflow-x-auto border rounded-lg">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('campaignRunModals.startTime')}</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('campaignRunModals.status')}</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('campaignRunModals.recipient')}</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('campaignRunModals.success')}</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('campaignRunModals.failed')}</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('campaignRunModals.completed')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {scheduleRuns.map((run) => (
                        <tr key={run.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm text-gray-900">
                            {formatCampaignDateTime(run.startedAt)}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`badge ${
                              run.status === 'completed' ? 'badge-success' :
                              run.status === 'running' ? 'badge-warning' :
                              run.status === 'failed' ? 'badge-error' :
                              'badge-gray'
                            }`}>
                              {run.status === 'completed' ? t('campaignRunModals.completed') :
                               run.status === 'running' ? t('campaignRunModals.inProgress') :
                               run.status === 'failed' ? t('campaignRunModals.failed') :
                               run.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900">
                            {run.totalRecipients || 0}
                          </td>
                          <td className="px-4 py-3 text-sm text-green-600">
                            {run.successfulSends || 0}
                          </td>
                          <td className="px-4 py-3 text-sm text-red-600">
                            {run.failedSends || 0}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500">
                            {formatCampaignDateTime(run.completedAt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-3 p-6 border-t bg-gray-50">
            <button
              onClick={() => handleToggleSchedule(selectedSchedule.id, selectedSchedule.enabled)}
              className={`btn ${
                isReadonlyOnceSchedule(selectedSchedule)
                  ? 'btn-secondary opacity-60 cursor-not-allowed'
                  : selectedSchedule.enabled
                    ? 'btn-secondary'
                    : 'btn-primary'
              }`}
              disabled={isReadonlyOnceSchedule(selectedSchedule)}
            >
              {isReadonlyOnceSchedule(selectedSchedule)
                ? getScheduleStatusLabel(selectedSchedule)
                : selectedSchedule.enabled
                  ? t('campaignRunModals.disableSchedule')
                  : t('campaignRunModals.enableSchedule2')}
            </button>
            <button onClick={closeScheduleDetailModal} className="btn btn-secondary">
              {t('campaignRunModals.close')}
            </button>
          </div>
        </div>
      </FullScreenOverlay>
    )}

    {campaignSchedulesModalCampaign && (
      <FullScreenOverlay isOpen={Boolean(campaignSchedulesModalCampaign)}>
        <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto">
          <div className="flex items-center justify-between p-6 border-b sticky top-0 bg-white z-10">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">{t('campaignRunModals.configuredSchedules')}</h3>
              <p className="text-sm text-gray-600 mt-0.5">
                {campaignSchedulesModalCampaign.campaignName}
                {campaignSchedulesModalCampaign.id != null && (
                  <span className="text-gray-400"> · ID {String(campaignSchedulesModalCampaign.id)}</span>
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={closeCampaignSchedulesSummaryModal}
              className="p-1 hover:bg-gray-100 rounded-lg"
              aria-label={t('campaignRunModals.closeAria')}
            >
              <HiOutlineX className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6 space-y-4">
            {(() => {
              const list = filterSchedulesByCampaignId(allSchedules, campaignSchedulesModalCampaign.id);
              if (list.length === 0) {
                return (
                  <p className="text-sm text-gray-500 text-center py-6">
                    {t('campaignRunModals.noSchedulesForCampaign')}
                  </p>
                );
              }
              return (
                <ul className="space-y-3">
                  {list.map((sch) => {
                    const pattern = getSchedulePatternSummaryVi(sch, getWeeklyDayFromCron, getWeeklyDayLabel);
                    const runTimesRaw = Number(sch?.runCount);
                    const runTimes = Number.isFinite(runTimesRaw) && runTimesRaw >= 0 ? runTimesRaw : 0;
                    return (
                      <li
                        key={sch.id}
                        className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-medium text-gray-900 text-sm">{sch.scheduleName}</p>
                          <span className={`badge shrink-0 ${getScheduleStatusClassName(sch)}`}>
                            {getScheduleStatusLabel(sch)}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600">{pattern}</p>
                        <p className="text-sm text-gray-800">
                          <span className="font-medium">{t('campaignRunModals.runs')}</span> {runTimes} {t('campaignRunModals.times')}
                        </p>
                        <p className="text-sm text-gray-800">
                          <span className="font-medium">{getScheduleRunTimingFieldLabelVi(sch)}:</span>{' '}
                          {getScheduleNextRunUiLabel(sch, t)}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              );
            })()}
          </div>

          <div className="flex justify-end gap-3 p-6 border-t bg-gray-50 rounded-b-xl">
            <button type="button" onClick={closeCampaignSchedulesSummaryModal} className="btn btn-secondary">
              {t('campaignRunModals.close')}
            </button>
          </div>
        </div>
      </FullScreenOverlay>
    )}
  </>
  );
};

export default CampaignRunModals;
