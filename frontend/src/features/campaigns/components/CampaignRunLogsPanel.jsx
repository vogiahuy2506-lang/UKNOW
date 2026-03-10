import CampaignExecutionLogWorkspace from '../../../components/campaigns/CampaignExecutionLogWorkspace';
import { formatCampaignDateTime } from '../utils/campaignDateTime.helpers';

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
  if (!selectedCampaignForLogs) return null;
  const isContinuousMode = Boolean(selectedRunDetail?.runMetadata?.continuousMode);
  const pollIntervalMs = Number.parseInt(selectedRunDetail?.runMetadata?.pollIntervalMs, 10);
  const pollIntervalMinutes = Number.isFinite(pollIntervalMs)
    ? Math.max(1, Math.round(pollIntervalMs / 60000))
    : null;

  return (
    <div className="card">
      <div className="p-6 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900">Log chạy chiến dịch</h2>
        <p className="text-sm text-gray-500 mt-1">
          Theo dõi log theo từng node và xem tracking hiệu quả theo lượt chạy.
        </p>
      </div>
      <div className="p-6 space-y-4">
        {isLoadingRunDetail ? (
          <div className="flex items-center justify-center h-32">
            <div className="spinner w-8 h-8"></div>
          </div>
        ) : !selectedRunDetail ? (
          <div className="text-sm text-gray-500">
            {selectedCampaignForLogs
              ? `Chiến dịch "${selectedCampaignForLogs.campaignName}" chưa có lượt chạy.`
              : 'Chọn Xem log ở bất kỳ chiến dịch nào để xem chi tiết.'}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="p-3 rounded-lg bg-gray-50">
                <p className="text-xs text-gray-500">Chiến dịch / lần chạy</p>
                <p className="text-sm font-semibold text-gray-900">
                  {selectedRunDetail.campaignName}
                  {selectedRunDetail.runName ? ` / ${selectedRunDetail.runName}` : ''}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-gray-50">
                <p className="text-xs text-gray-500">Trạng thái</p>
                <p className="text-sm font-semibold text-gray-900">{selectedRunDetail.status}</p>
                {isContinuousMode && (
                  <p className="text-xs text-emerald-600 mt-1">
                    Đang chạy liên tục{pollIntervalMinutes ? ` • ${pollIntervalMinutes} phút/lần` : ''}
                  </p>
                )}
              </div>
              <div className="p-3 rounded-lg bg-gray-50">
                <p className="text-xs text-gray-500">Tracking link click</p>
                <p className="text-sm font-semibold text-gray-900">
                  {selectedRunDetail.linkClickCount || 0} lượt click
                </p>
              </div>
              <div className="p-3 rounded-lg bg-gray-50">
                <p className="text-xs text-gray-500">Tracking đơn hàng</p>
                <p className="text-sm font-semibold text-gray-900">
                  {selectedRunDetail.pendingCount || 0} chờ / {selectedRunDetail.purchaseCount || 0} đã đặt
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {selectedRunDetail.customerWithOrderCount || 0} khách có đơn
                </p>
              </div>
            </div>

            <div className="border rounded-lg p-3 h-[420px] min-h-[420px] overflow-hidden">
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

            <div className="overflow-x-auto border rounded-lg">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Run ID</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tên lần chạy</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Bắt đầu</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Trạng thái</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {campaignRunHistory.map((run) => (
                    <tr
                      key={run.id}
                      className={`cursor-pointer hover:bg-gray-50 ${
                        selectedRunDetail?.id === run.id ? 'bg-primary-50' : ''
                      }`}
                      onClick={() => onViewRunDetail(run.id, run.campaignId)}
                    >
                      <td className="px-4 py-3 text-sm text-gray-900">#{run.id}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        {run.runName || run.campaignName || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        {formatCampaignDateTime(run.startedAt)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">{run.status}</td>
                    </tr>
                  ))}
                  {campaignRunHistory.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-6 text-center text-sm text-gray-500">
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
