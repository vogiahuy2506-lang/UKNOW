import { HiOutlineSearch, HiOutlineEye, HiOutlineTrash } from 'react-icons/hi';
import { useI18n } from '../../../i18n';
import { formatCampaignDateTime } from '../utils/campaignDateTime.helpers';

/**
 * Bảng hiển thị danh sách lịch chạy đã thiết lập của chiến dịch.
 *
 * @param {Object} props
 * @param {Array} props.schedules Danh sách toàn bộ lịch chạy
 * @param {Array} props.filteredSchedules Danh sách lịch chạy sau khi lọc
 * @param {string} props.scheduledCampaignSearch Từ khóa tìm kiếm lịch
 * @param {Function} props.onScheduledCampaignSearchChange Handler cập nhật từ khóa tìm kiếm
 * @param {Function} props.isCampaignRunningById Hàm kiểm tra chiến dịch có đang chạy hay không
 * @param {Function} props.getWeeklyDayLabel Getter nhãn thứ trong tuần
 * @param {Function} props.getWeeklyDayFromCron Getter thứ trong tuần từ cron expression
 * @param {Function} props.getScheduleTypeLabel Getter nhãn loại lịch
 * @param {Function} props.getScheduleStatusClassName Getter class badge trạng thái
 * @param {Function} props.getScheduleStatusLabel Getter nhãn trạng thái lịch
 * @param {Function} props.isReadonlyOnceSchedule Hàm kiểm tra lịch một lần đã chạy
 * @param {Function} props.onOpenScheduleDetailModal Handler mở modal chi tiết lịch
 * @param {Function} props.onDeleteSchedule Handler xóa lịch
 * @param {Function} props.onToggleSchedule Handler bật/tắt lịch
 * @param {boolean} [props.canEdit=true] Quyền chỉnh sửa lịch (ẩn công tắc và nút xoá khi false)
 */
const CampaignSchedulesTable = ({
  schedules = [],
  filteredSchedules = [],
  scheduledCampaignSearch = '',
  onScheduledCampaignSearchChange = () => {},
  isCampaignRunningById = () => false,
  getWeeklyDayLabel = (v) => v,
  getWeeklyDayFromCron = () => '',
  getScheduleTypeLabel = (v) => v,
  getScheduleStatusClassName = () => 'badge-gray',
  getScheduleStatusLabel = (v) => v,
  isReadonlyOnceSchedule = () => false,
  onOpenScheduleDetailModal = () => {},
  onDeleteSchedule = () => {},
  onToggleSchedule = () => {},
  canEdit = true,
}) => {
  const { t } = useI18n();

  return (
    <div className="card">
      <div className="p-6 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900">{t('campaignRun.scheduledCampaigns')}</h2>
        <div className="mt-4">
          <div className="max-w-md flex items-center rounded-lg border border-gray-300 bg-white text-sm focus-within:border-primary-500 focus-within:ring-1 focus-within:ring-primary-500">
            <span className="pl-3 flex items-center text-gray-400" aria-hidden>
              <HiOutlineSearch className="w-5 h-5" />
            </span>
            <input
              type="text"
              value={scheduledCampaignSearch}
              onChange={(e) => onScheduledCampaignSearchChange(e.target.value)}
              placeholder={t('campaignRun.searchScheduleOrCampaign')}
              className="flex-1 min-w-0 py-2 pr-3 border-0 bg-transparent focus:ring-0 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {filteredSchedules.length === 0 ? (
        <div className="p-12 text-center">
          <p className="text-gray-500">
            {schedules.length === 0 ? t('campaignRun.noSchedules') : t('campaignRun.noMatchingCampaigns')}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('campaignRun.scheduleName')}</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('campaigns.title')}</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-28">{t('campaignRun.campaignId')}</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('campaignRun.scheduleType')}</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('campaignRun.lastRun')}</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('campaignRun.nextRun')}</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('common.status')}</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('campaignRun.toggleSchedule')}</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredSchedules.map((schedule) => {
                const isReadonly = isReadonlyOnceSchedule(schedule);
                const isCampaignRunning = Boolean(
                  schedule.campaignId && isCampaignRunningById && isCampaignRunningById(schedule.campaignId)
                );
                const cannotEnableWhileRunning = !schedule.enabled && isCampaignRunning;

                let toggleTooltip = '';
                if (isReadonly) {
                  toggleTooltip = t('campaignRun.scheduleLockedOneTimeTooltip');
                } else if (cannotEnableWhileRunning) {
                  toggleTooltip = t('campaignRun.scheduleCannotEnableRunningTooltip');
                }

                return (
                  <tr key={schedule.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="font-medium text-gray-900">{schedule.scheduleName}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900">{schedule.campaignName}</div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 tabular-nums">
                      {schedule.campaignId != null ? String(schedule.campaignId) : '—'}
                    </td>
                    <td className="px-6 py-4">
                      <span className="badge badge-info">
                        {schedule.scheduleType === 'weekly'
                          ? `${t('campaigns.scheduleWeekly')} (${getWeeklyDayLabel(getWeeklyDayFromCron(schedule.cronExpression))})`
                          : getScheduleTypeLabel(schedule.scheduleType)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {schedule.lastRunAt ? (
                        <div>
                          <div className="text-gray-900 font-medium">{formatCampaignDateTime(schedule.lastRunAt)}</div>
                          <div className="text-xs text-gray-500">
                            {schedule.runCount || 0} {t('campaignRun.times')}
                          </div>
                        </div>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {schedule.enabled && schedule.nextRunAt ? (
                        <span className="text-gray-900 font-medium">{formatCampaignDateTime(schedule.nextRunAt)}</span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`badge ${getScheduleStatusClassName(schedule)}`}>
                        {getScheduleStatusLabel(schedule)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {canEdit ? (
                        <div className="flex items-center gap-2" title={toggleTooltip || undefined}>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={Boolean(schedule.enabled)}
                            aria-label={schedule.enabled ? t('campaignRun.disableSchedule') : t('campaignRun.enableSchedule2')}
                            disabled={isReadonly}
                            onClick={() => {
                              if (isReadonly) return;
                              onToggleSchedule(schedule.id, schedule.enabled);
                            }}
                            className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 ${
                              isReadonly ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                            } ${schedule.enabled ? 'bg-primary-600' : 'bg-gray-200'}`}
                          >
                            <span
                              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                                schedule.enabled ? 'translate-x-6' : 'translate-x-1'
                              }`}
                            />
                          </button>
                          <span className={`text-xs font-medium select-none ${isReadonly ? 'text-gray-400' : 'text-gray-700'}`}>
                            {schedule.enabled ? t('campaignRun.switchOn') : t('campaignRun.switchOff')}
                          </span>
                        </div>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-3">
                        {canEdit && (
                          <button
                            type="button"
                            disabled={isReadonly}
                            title={toggleTooltip || undefined}
                            onClick={() => {
                              if (isReadonly) return;
                              onToggleSchedule(schedule.id, schedule.enabled);
                            }}
                            className={`text-xs font-medium hover:underline ${
                              isReadonly
                                ? 'text-gray-400 cursor-not-allowed opacity-60'
                                : schedule.enabled
                                  ? 'text-amber-600 hover:text-amber-800'
                                  : 'text-primary-600 hover:text-primary-800'
                            }`}
                          >
                            {schedule.enabled ? t('campaignRun.disableSchedule') : t('campaignRun.enableSchedule2')}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onOpenScheduleDetailModal(schedule)}
                          className="text-blue-600 hover:text-blue-800"
                          title={t('campaignRun.viewDetails')}
                        >
                          <HiOutlineEye className="w-5 h-5" />
                        </button>
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => onDeleteSchedule(schedule.id)}
                            className="text-red-600 hover:text-red-800"
                            title={t('campaignRun.deleteSchedule')}
                          >
                            <HiOutlineTrash className="w-5 h-5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default CampaignSchedulesTable;
