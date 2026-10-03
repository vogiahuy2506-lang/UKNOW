import { useState } from 'react';
import { useI18n } from '../../../i18n';
import DashboardInsightOverview from './DashboardInsightOverview';
import DashboardInsightBlock from './DashboardInsightBlock';
import { renderBoldSegments } from './InsightMarkdownBody';
import { summarizeOverview, pickTopActions } from '../utils/dashboardInsightSummary.util';
import {
  getChannelEngagementInsightForChannel,
  getOrdersTrendInsightForMode,
} from '../utils/dashboardInsightStorage.util';

/**
 * Thẻ "Phân tích AI" gọn trên trang Báo cáo.
 *
 * Mặc định: tổng quan 1–3 câu + tối đa 3 việc "Nên làm gì" + dòng "Phân tích lúc …" (nếu là bản đã lưu).
 * "Xem chi tiết" mở phần đầy đủ (`DashboardInsightOverview` + nhận xét từng biểu đồ).
 * Chưa có phân tích: một dòng mời bấm nút; đang chạy: khung chờ gọn.
 *
 * @param {object} props
 * @param {object|null} props.insights - payload đã chuẩn hóa (null = chưa có / không áp dụng cho bộ lọc đang xem)
 * @param {boolean} [props.isLoading]
 * @param {string} [props.error]
 * @param {string} [props.savedAtLabel] - đã định dạng; rỗng khi là bản vừa tạo
 * @param {boolean} [props.showOrders] - chỉ khi true mới hiện nhận xét biểu đồ đơn hàng
 */
const DashboardAiInsightCard = ({ insights, isLoading = false, error = '', savedAtLabel = '', showOrders = false }) => {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);

  const title = <h3 className="text-base font-semibold text-gray-900">{t('dashboardReport.ai.title')}</h3>;

  if (isLoading) {
    return (
      <div className="card p-5" data-testid="ai-insight-card">
        {title}
        <div className="mt-3 h-12 rounded-xl bg-gray-100 animate-pulse" aria-busy="true" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="card p-5" data-testid="ai-insight-card">
        {title}
        <div className="mt-3 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
      </div>
    );
  }

  const overview = summarizeOverview(insights?.overview);
  const actions = pickTopActions(insights);

  if (!insights || (!overview && actions.length === 0 && !insights.key_metrics_analysis)) {
    return (
      <div className="card px-5 py-4" data-testid="ai-insight-card">
        <p className="text-sm text-gray-500">{t('dashboardReport.ai.empty')}</p>
      </div>
    );
  }

  const sentText = getChannelEngagementInsightForChannel(insights.charts, 'all');
  const ordersText = showOrders ? getOrdersTrendInsightForMode(insights.charts, 'summary') : '';

  return (
    <div className="card p-5" data-testid="ai-insight-card">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        {title}
        {savedAtLabel && (
          <span className="text-xs text-gray-400" data-testid="ai-insight-saved-at">
            {t('dashboardReport.ai.analyzedAt', { time: savedAtLabel })}
          </span>
        )}
      </div>

      {!expanded && (
        <div className="mt-3 space-y-3" data-testid="ai-insight-compact">
          {overview && <p className="text-sm text-gray-700 leading-relaxed">{renderBoldSegments(overview)}</p>}
          {actions.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{t('dashboardReport.ai.todo')}</p>
              <ul className="list-disc list-inside space-y-1 text-sm text-gray-700">
                {actions.map((a, idx) => (
                  <li key={idx}>{renderBoldSegments(a)}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {expanded && (
        <div className="mt-3" data-testid="ai-insight-detail">
          <DashboardInsightOverview insights={insights} />
          <DashboardInsightBlock title={t('dashboardReport.chart.insightTitle')} text={sentText} />
          {showOrders && <DashboardInsightBlock title={t('dashboard.insightOrdersOverTime')} text={ordersText} />}
        </div>
      )}

      <button
        type="button"
        className="mt-3 text-sm font-medium text-primary-600 hover:text-primary-700 hover:underline"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        {expanded ? t('dashboardReport.ai.hideDetail') : t('dashboardReport.ai.showDetail')}
      </button>
    </div>
  );
};

export default DashboardAiInsightCard;
