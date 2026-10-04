import {
  buildEstimateView,
  describeEstimateWarning,
  formatEstimateDay,
  formatEstimateDateTime,
} from '../utils/campaignEstimate.helpers';

/**
 * Khối "Ước tính thời gian gửi" dùng chung cho hộp Chạy, hộp Đặt lịch và thẻ xác nhận của trợ lý AI.
 * Chỉ là phần hiển thị: không bao giờ chặn nút nào (lỗi tải → một câu nhẹ).
 *
 * @param {object} props
 * @param {'idle'|'loading'|'ready'|'error'} props.status trạng thái tải
 * @param {object|null} props.estimate `data` của `GET /campaigns/:id/estimate` (hoặc `estimate` của thẻ AI)
 * @param {(key: string, params?: object) => string} props.t hàm dịch
 * @returns {JSX.Element|null}
 */
const CampaignEstimatePanel = ({ status = 'ready', estimate = null, t }) => {
  if (status === 'idle') return null;
  if (status === 'loading') {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-500" data-testid="campaign-estimate-loading">
        {t('campaignEstimate.loading')}
      </div>
    );
  }
  const view = status === 'ready' ? buildEstimateView(estimate) : null;
  if (!view) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-500" data-testid="campaign-estimate-unavailable">
        {t('campaignEstimate.unavailable')}
      </div>
    );
  }

  const { duration } = view;
  const durationText = duration ? t(`campaignEstimate.duration.${duration.unit}`, { value: duration.value }) : '';
  const warnings = view.warnings.map((warning) => describeEstimateWarning(warning, t, view.accountLabel));
  const showFinish = Boolean(view.finishAtLatest) && view.totalActions > 0;
  const showTable = view.perDay.length > 0 && view.perDay.some((day) => day.rows.length > 0);

  return (
    <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 space-y-2" data-testid="campaign-estimate">
      <p className="text-sm font-semibold text-sky-900">{t('campaignEstimate.title')}</p>
      {showFinish && (
        <div className="text-sm text-gray-800">
          <p>
            <span className="font-medium">{t('campaignEstimate.expectedFinish')}:</span>{' '}
            <span className="font-semibold" data-testid="campaign-estimate-finish">{formatEstimateDateTime(view.finishAtLatest)}</span>
            {durationText && <span className="text-gray-600"> ({durationText})</span>}
          </p>
          {view.hasRange && (
            <p className="text-xs text-gray-600" data-testid="campaign-estimate-range">
              {t('campaignEstimate.range', {
                from: formatEstimateDateTime(view.finishAtEarliest),
                to: formatEstimateDateTime(view.finishAtLatest),
              })}
            </p>
          )}
          <p className="text-xs text-gray-600">{t('campaignEstimate.totalActions', { count: view.totalActions })}</p>
        </div>
      )}
      {showTable && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs" data-testid="campaign-estimate-table">
            <thead>
              <tr className="text-left text-gray-500">
                <th className="py-1 pr-3 font-medium">{t('campaignEstimate.colDate')}</th>
                <th className="py-1 pr-3 font-medium">{t('campaignEstimate.colAccount')}</th>
                <th className="py-1 font-medium text-right">{t('campaignEstimate.colActions')}</th>
              </tr>
            </thead>
            <tbody className="text-gray-800">
              {view.perDay.flatMap((day) => day.rows.map((row) => (
                <tr key={`${day.date}-${row.key}`}>
                  <td className="py-0.5 pr-3">{formatEstimateDay(day.date)}</td>
                  <td className="py-0.5 pr-3 break-words">{row.label}</td>
                  <td className="py-0.5 text-right">{row.actions}</td>
                </tr>
              )))}
            </tbody>
          </table>
        </div>
      )}
      {warnings.length > 0 && (
        <ul className="space-y-1" data-testid="campaign-estimate-warnings">
          {warnings.map((warning, index) => (
            <li
              key={`${warning.code}-${index}`}
              className={`text-xs ${warning.tone === 'warn' ? 'text-amber-700' : 'text-gray-600'}`}
            >
              {warning.text}
            </li>
          ))}
        </ul>
      )}
      {showFinish && <p className="text-[11px] text-gray-500">{t('campaignEstimate.longerNote')}</p>}
    </div>
  );
};

export default CampaignEstimatePanel;
