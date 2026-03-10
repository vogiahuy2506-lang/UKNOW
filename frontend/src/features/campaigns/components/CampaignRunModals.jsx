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
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Chu kỳ quét khách mới (phút)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={1440}
                    step={1}
                    value={runPollIntervalMinutes}
                    onChange={(e) => setRunPollIntervalMinutes(e.target.value)}
                    className="input"
                    disabled={!runContinuousMode}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Khuyến nghị 120 phút. Hệ thống chỉ gửi cho khách mới hoặc bước tiếp theo chưa hoàn tất.
                  </p>
                </div>
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
  </>
);

export default CampaignRunModals;
