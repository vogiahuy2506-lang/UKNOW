import {
  HiOutlineCalendar,
  HiOutlineExclamation,
  HiOutlineX,
} from 'react-icons/hi';
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
const scheduleClockUiLabel = (cronExpression) => {
  const clock = formatScheduleRunClockFromCron(cronExpression);
  return clock ? `Lúc ${clock}` : '—';
};

/**
 * Giá trị hiển thị cho cột thời gian chạy (lịch 1 lần: suy từ cron + ngày tạo khi có thể).
 *
 * @param {object} schedule bản ghi lịch chạy
 * @returns {string}
 */
const getScheduleNextRunUiLabel = (schedule) => {
  const at = resolveScheduleUiTimingDate(schedule);
  if (!at) return 'Chưa xác định';
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
}) => (
  <>
    {showRunConfirmModal && (
      <FullScreenOverlay isOpen={showRunConfirmModal}>
        <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
          <div className="flex items-center justify-between p-6 border-b">
            <h3 className="text-lg font-semibold text-gray-900">Xác nhận chạy chiến dịch</h3>
            <button onClick={closeRunConfirmModal} className="p-1 hover:bg-gray-100 rounded-lg">
              <HiOutlineX className="w-5 h-5" />
            </button>
          </div>
          <div className="p-6 space-y-4">
            <p className="text-sm text-gray-600">
              Bạn sắp chạy chiến dịch <span className="font-semibold text-gray-900">{runConfirmCampaign?.campaignName}</span>.
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tên lần chạy</label>
              <input
                type="text"
                value={runNameInput}
                onChange={(e) => setRunNameInput(e.target.value)}
                className="input"
                placeholder="Nhập tên lần chạy"
                disabled={isRunResumeLocked}
              />
            </div>
            {shouldShowRunContinuousOptions && (
              <div className="rounded-lg border border-gray-200 p-3 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <label htmlFor="run-continuous-mode" className="text-sm font-medium text-gray-700">
                    Chạy liên tục (quét khách mới theo chu kỳ)
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
                        Chu kỳ quét khách mới (phút)
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
                        Hệ thống random mặc định 120-300 phút, bạn có thể nhập chu kỳ khác trước khi chạy.
                      </p>
                      {isRunResumeLocked && (
                        <p className="text-xs text-amber-600 mt-1">
                          Đang chạy tiếp run continuous cũ nên chu kỳ quét và tên lượt chạy được khóa theo run đã chọn.
                        </p>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <label htmlFor="run-resume-mode" className="text-sm font-medium text-gray-700">
                        Chạy tiếp lượt continuous cũ
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
                          Chọn lượt continuous cần chạy tiếp
                        </label>
                        <select
                          value={runResumeFromId}
                          onChange={(e) => setRunResumeFromId(e.target.value)}
                          className="input"
                          disabled={isLoadingContinuousResumeOptions}
                        >
                          <option value="">
                            {isLoadingContinuousResumeOptions
                              ? 'Đang tải danh sách lượt continuous...'
                              : 'Chọn lượt continuous'}
                          </option>
                          {(Array.isArray(continuousResumeRunOptions) ? continuousResumeRunOptions : []).map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.label}
                            </option>
                          ))}
                        </select>
                        {!isLoadingContinuousResumeOptions && (!continuousResumeRunOptions || continuousResumeRunOptions.length === 0) && (
                          <p className="text-xs text-amber-600 mt-1">
                            Chưa có lượt continuous cũ để chạy tiếp.
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
              Hủy
            </button>
            <button onClick={handleRunNow} className="btn btn-primary" disabled={isSubmittingRun}>
              {isSubmittingRun ? 'Đang chạy...' : 'Xác nhận chạy'}
            </button>
          </div>
        </div>
      </FullScreenOverlay>
    )}

    {stopRunConfirmTarget && (
      <FullScreenOverlay isOpen={Boolean(stopRunConfirmTarget)}>
        <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
          <div className="flex items-center justify-between p-6 border-b">
            <h3 className="text-lg font-semibold text-gray-900">Xác nhận dừng lượt chạy</h3>
            <button onClick={closeStopRunConfirmModal} className="p-1 hover:bg-gray-100 rounded-lg">
              <HiOutlineX className="w-5 h-5" />
            </button>
          </div>
          <div className="p-6 space-y-4">
            <div className="flex items-start gap-3 rounded-lg border border-red-100 bg-red-50 p-3">
              <HiOutlineExclamation className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
              <div className="text-sm text-red-700">
                <p className="font-medium">Bạn sắp dừng một lượt chạy đang thực thi.</p>
                <p className="mt-1">
                  Sau khi dừng, lượt chạy sẽ ngừng xử lý các node tiếp theo.
                </p>
              </div>
            </div>
            <div className="text-sm text-gray-600 space-y-1">
              <p>
                <span className="font-medium text-gray-900">Tên lượt chạy:</span>{' '}
                {String(stopRunConfirmTarget?.runName || '').trim() || `#${stopRunConfirmTarget?.id}`}
              </p>
              <p>
                <span className="font-medium text-gray-900">ID lượt chạy:</span> {stopRunConfirmTarget?.id}
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-3 p-6 border-t bg-gray-50 rounded-b-xl">
            <button
              onClick={closeStopRunConfirmModal}
              className="btn btn-secondary"
              disabled={stoppingRunIds.has(Number(stopRunConfirmTarget?.id))}
            >
              Hủy
            </button>
            <button
              onClick={handleConfirmStopRun}
              className="btn btn-danger"
              disabled={stoppingRunIds.has(Number(stopRunConfirmTarget?.id))}
            >
              {stoppingRunIds.has(Number(stopRunConfirmTarget?.id)) ? 'Đang dừng...' : 'Xác nhận dừng'}
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
              Thiết lập lịch chạy - {selectedCampaign?.campaignName}
            </h3>
            <button onClick={closeScheduleModal} className="p-1 hover:bg-gray-100 rounded-lg">
              <HiOutlineX className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tên lịch chạy
              </label>
              <input
                type="text"
                value={scheduleForm.scheduleName}
                onChange={(e) => setScheduleForm({ ...scheduleForm, scheduleName: e.target.value })}
                className="input"
                placeholder="Nhập tên lịch chạy..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Loại lịch
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
                <option value="once">Chạy 1 lần</option>
                <option value="daily">Hàng ngày</option>
                <option value="weekly">Hàng tuần</option>
                <option value="monthly">Hàng tháng (Ngày 1)</option>
                <option value="custom">Tùy chỉnh: Mỗi N ngày</option>
                <option value="after_delay">Tùy chỉnh: Chạy sau N thời gian</option>
              </select>
            </div>

            {scheduleForm.scheduleType === 'weekly' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Chạy vào thứ
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
                  Ngày chạy
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
                  Cứ cách bao nhiêu ngày thì chạy lại (tính từ hôm nay)
                </label>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={scheduleForm.customIntervalDays}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, customIntervalDays: e.target.value })}
                  className="input"
                  placeholder="Ví dụ: 2"
                />
              </div>
            )}

            {(scheduleForm.scheduleType === 'after_delay') && (
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Chạy sau bao lâu kể từ hiện tại
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={scheduleForm.delayValue}
                      onChange={(e) => setScheduleForm({ ...scheduleForm, delayValue: e.target.value })}
                      className="input"
                      placeholder="Ví dụ: 2"
                    />
                    <select
                      value={scheduleForm.delayUnit}
                      onChange={(e) => setScheduleForm({ ...scheduleForm, delayUnit: e.target.value })}
                      className="input"
                    >
                      <option value="minutes">Phút</option>
                      <option value="hours">Giờ</option>
                      <option value="days">Ngày</option>
                    </select>
                  </div>
                </div>
                {scheduleForm.delayPreviewAt ? (
                  <p className="text-xs text-gray-500">
                    Dự kiến chạy lúc: {formatCampaignDateTime(scheduleForm.delayPreviewAt)}
                  </p>
                ) : (
                  <p className="text-xs text-amber-600">
                    Nhập số lượng thời gian hợp lệ để xem thời điểm chạy dự kiến.
                  </p>
                )}
              </div>
            )}

            {scheduleForm.scheduleType !== 'after_delay' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Thời gian chạy
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
                Kích hoạt lịch chạy
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-3 p-6 border-t bg-gray-50 rounded-b-xl">
            <button onClick={closeScheduleModal} className="btn btn-secondary">
              Hủy
            </button>
            <button onClick={handleSaveSchedule} className="btn btn-primary">
              <HiOutlineCalendar className="w-4 h-4 mr-2" />
              Tạo lịch
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
              Chi tiết lịch chạy - {selectedSchedule.scheduleName}
            </h3>
            <button onClick={closeScheduleDetailModal} className="p-1 hover:bg-gray-100 rounded-lg">
              <HiOutlineX className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6 space-y-6">
            <div className="bg-gray-50 rounded-lg p-4 space-y-2">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500">Chiến dịch</p>
                  <p className="font-medium text-gray-900">{selectedSchedule.campaignName}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Loại lịch</p>
                  <p className="font-medium text-gray-900">
                    {selectedSchedule.scheduleType === 'weekly'
                      ? `Hàng tuần (${getWeeklyDayLabel(getWeeklyDayFromCron(selectedSchedule.cronExpression))})`
                      : getScheduleTypeLabel(selectedSchedule.scheduleType)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Giờ chạy</p>
                  <p className="font-medium text-gray-900">
                    {scheduleClockUiLabel(selectedSchedule.cronExpression)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Biểu thức Cron</p>
                  <code className="text-xs bg-white px-2 py-1 rounded border">{selectedSchedule.cronExpression}</code>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Trạng thái</p>
                  <span className={`badge ${getScheduleStatusClassName(selectedSchedule)}`}>
                    {getScheduleStatusLabel(selectedSchedule)}
                  </span>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Số lần đã chạy</p>
                  <p className="font-medium text-gray-900">{selectedSchedule.runCount || 0} lần</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Lần chạy cuối</p>
                  <p className="font-medium text-gray-900">
                    {selectedSchedule.lastRunAt
                      ? formatCampaignDateTime(selectedSchedule.lastRunAt)
                      : 'Chưa chạy lần nào'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">{getScheduleRunTimingFieldLabelVi(selectedSchedule)}</p>
                  <p className="font-medium text-gray-900">
                    {getScheduleNextRunUiLabel(selectedSchedule)}
                  </p>
                </div>
              </div>
            </div>

            <div>
              <h4 className="text-md font-semibold text-gray-900 mb-3">Lịch sử chạy</h4>

              {scheduleRuns.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  Chưa có lịch sử chạy
                </div>
              ) : (
                <div className="overflow-x-auto border rounded-lg">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Thời gian bắt đầu</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Trạng thái</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Người nhận</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Thành công</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Thất bại</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Hoàn thành</th>
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
                              {run.status === 'completed' ? 'Hoàn thành' :
                               run.status === 'running' ? 'Đang chạy' :
                               run.status === 'failed' ? 'Thất bại' :
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
                  ? 'Tắt lịch'
                  : 'Bật lịch'}
            </button>
            <button onClick={closeScheduleDetailModal} className="btn btn-secondary">
              Đóng
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
              <h3 className="text-lg font-semibold text-gray-900">Lịch chạy đã thiết lập</h3>
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
              aria-label="Đóng"
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
                    Hiện không có lịch chạy nào gắn với chiến dịch này.
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
                          <span className="font-medium">Đã chạy:</span> {runTimes} lần
                        </p>
                        <p className="text-sm text-gray-800">
                          <span className="font-medium">{getScheduleRunTimingFieldLabelVi(sch)}:</span>{' '}
                          {getScheduleNextRunUiLabel(sch)}
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
              Đóng
            </button>
          </div>
        </div>
      </FullScreenOverlay>
    )}
  </>
);

export default CampaignRunModals;
