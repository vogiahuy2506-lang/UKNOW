import CampaignExecutionLogWorkspace from '../../../components/campaigns/CampaignExecutionLogWorkspace';
import { Link } from 'react-router-dom';
import { useI18n } from '../../../i18n';
import { formatCampaignDateTime } from '../utils/campaignDateTime.helpers';
import { getActiveRunPause, getRunPauseI18nKey } from '../utils/campaignQuotaPause.helpers';
import { getRunStatusLabel } from '../utils/campaignRunStatus.helpers';

const CampaignRunLogsPanel = ({
  selectedCampaignForLogs,
  isLoadingRunDetail,
  selectedRunDetail,
  workspaceLogs,
  selectedExecutionLogId,
  onSelectExecutionLogId,
  campaignRunHistory,
  onViewRunDetail,
}) => {
  const { t } = useI18n();
  if (!selectedCampaignForLogs) return null;
  const isContinuousMode = Boolean(selectedRunDetail?.runMetadata?.continuousMode);
  const pollIntervalMs = Number.parseInt(selectedRunDetail?.runMetadata?.pollIntervalMs, 10);
  const pollIntervalMinutes = Number.isFinite(pollIntervalMs)
    ? Math.max(1, Math.round(pollIntervalMs / 60000))
    : null;
  const activePause = getActiveRunPause(selectedRunDetail?.runMetadata);

  return (
    <div className="card">
      <div className="p-6 border-b border-gray-200 dark:border-dk-border">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-dk-text">Log chạy chiến dịch</h2>
        <p className="text-sm text-gray-500 mt-1 dark:text-dk-text2">
          Theo dõi log theo từng node và xem tracking hiệu quả theo lượt chạy.
        </p>
      </div>
      <div className="p-6 space-y-4">
        {isLoadingRunDetail ? (
          <div className="flex items-center justify-center h-32">
            <div className="spinner w-8 h-8"></div>
          </div>
        ) : !selectedRunDetail ? (
          <div className="text-sm text-gray-500 dark:text-dk-text2">
            {selectedCampaignForLogs
              ? `Chiến dịch "${selectedCampaignForLogs.campaignName}" chưa có lượt chạy.`
              : 'Chọn Xem log ở bất kỳ chiến dịch nào để xem chi tiết.'}
          </div>
        ) : (
          <>
            {activePause && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 dark:bg-amber-950/40 dark:border-amber-800">
                <span className="text-sm font-medium text-amber-900 dark:text-amber-300">
                  {t(getRunPauseI18nKey(activePause), {
                    until: formatCampaignDateTime(activePause.untilIso),
                    account: activePause.accountName || t('campaignRun.zaloAccountFallback'),
                  })}
                </span>
                {activePause.kind === 'plan_quota' && (
                  <Link
                    to="/app/topup"
                    className="text-sm font-medium text-primary-600 hover:text-primary-800 hover:underline dark:text-primary-400 dark:hover:text-primary-300"
                  >
                    {t('campaignRun.buyTopup')}
                  </Link>
                )}
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="p-3 rounded-lg bg-gray-50 dark:bg-dk-raised">
                <p className="text-xs text-gray-500 dark:text-dk-text2">Chiến dịch / lần chạy</p>
                <p className="text-sm font-semibold text-gray-900 dark:text-dk-text">
                  {selectedRunDetail.campaignName}
                  {selectedRunDetail.runName ? ` / ${selectedRunDetail.runName}` : ''}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-gray-50 dark:bg-dk-raised">
                <p className="text-xs text-gray-500 dark:text-dk-text2">Trạng thái</p>
                <p className="text-sm font-semibold text-gray-900 dark:text-dk-text">{getRunStatusLabel(t, selectedRunDetail.status)}</p>
                {isContinuousMode && (
                  <p className="text-xs text-emerald-600 mt-1 dark:text-emerald-400">
                    Đang chạy liên tục{pollIntervalMinutes ? ` • ${pollIntervalMinutes} phút/lần` : ''}
                  </p>
                )}
              </div>
              <div className="p-3 rounded-lg bg-gray-50 dark:bg-dk-raised">
                <p className="text-xs text-gray-500 dark:text-dk-text2">Tracking link click</p>
                <p className="text-sm font-semibold text-gray-900 dark:text-dk-text">
                  {selectedRunDetail.linkClickCount || 0} lượt click
                </p>
              </div>
              <div className="p-3 rounded-lg bg-gray-50 dark:bg-dk-raised">
                <p className="text-xs text-gray-500 dark:text-dk-text2">Tracking đơn hàng</p>
                <p className="text-sm font-semibold text-gray-900 dark:text-dk-text">
                  {selectedRunDetail.pendingCount || 0} chờ / {selectedRunDetail.purchaseCount || 0} đã đặt
                </p>
                <p className="text-xs text-gray-500 mt-1 dark:text-dk-text2">
                  {selectedRunDetail.customerWithOrderCount || 0} khách có đơn
                </p>
              </div>
            </div>

            <div className="border rounded-lg p-3 h-[420px] min-h-[420px] overflow-hidden dark:border-dk-border">
              <div className="h-full overflow-auto">
                <CampaignExecutionLogWorkspace
                  logs={workspaceLogs}
                  selectedLogId={selectedExecutionLogId}
                  onSelectLogId={onSelectExecutionLogId}
                  emptyListText="Chưa có log node cho lần chạy này."
                  emptyDetailText="Chọn 1 log để xem chi tiết kết quả."
                  listWidth={280}
                  minListWidth={220}
                  minDetailWidth={280}
                />
              </div>
            </div>

            <div className="overflow-x-auto border rounded-lg dark:border-dk-border">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200 dark:bg-dk-raised dark:border-dk-border">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-dk-text2">Run ID</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-dk-text2">Tên lần chạy</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-dk-text2">Bắt đầu</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-dk-text2">Trạng thái</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white dark:bg-dk-surface dark:divide-dk-border">
                  {campaignRunHistory.map((run) => (
                    <tr
                      key={run.id}
                      className={`cursor-pointer hover:bg-gray-50 ${
                        selectedRunDetail?.id === run.id ? 'bg-primary-50 dark:bg-primary-950/40' : ''
                      } dark:hover:bg-dk-raised`}
                      onClick={() => onViewRunDetail(run.id, run.campaignId)}
                    >
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-dk-text">#{run.id}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-dk-text">
                        {run.runName || run.campaignName || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-dk-text">
                        {formatCampaignDateTime(run.startedAt)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-dk-text">{getRunStatusLabel(t, run.status)}</td>
                    </tr>
                  ))}
                  {campaignRunHistory.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-6 text-center text-sm text-gray-500 dark:text-dk-text2">
                        Chưa có lịch sử chạy.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default CampaignRunLogsPanel;
