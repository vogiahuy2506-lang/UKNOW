import { normalizeDashboardInsightForUi } from '../utils/dashboardInsightStorage.util';

/**
 * Hiển thị khối insight tổng quan có cấu trúc (sau khi Gemini trả JSON đầy đủ).
 *
 * Luồng hoạt động:
 * - Chuẩn hóa payload (unwrap, merge charts, parse key_metrics nếu là chuỗi) để đồng bộ với lúc phân tích trực tiếp và khi đọc từ localStorage.
 * - Nếu có `key_metrics_analysis` / `insights` / `action_plan` → render theo section.
 * - Nếu chỉ có `overview` dạng chuỗi → hiển thị đoạn tóm tắt đơn giản.
 */

const SectionTitle = ({ children }) => (
  <h4 className="text-sm font-semibold text-gray-800 mt-4 first:mt-0">{children}</h4>
);

const MetricCard = ({ label, data }) => {
  if (!data || typeof data !== 'object') return null;
  return (
    <div className="rounded-lg border border-gray-100 bg-white px-3 py-2.5 text-xs">
      <p className="font-medium text-gray-700 mb-1">{label}</p>
      {data.value != null && (
        <p className="text-gray-600">
          <span className="text-gray-400">Giá trị: </span>
          {String(data.value)}
        </p>
      )}
      {data.benchmark != null && (
        <p className="text-gray-600 mt-0.5">
          <span className="text-gray-400">Tham chiếu: </span>
          {String(data.benchmark)}
        </p>
      )}
      {data.assessment != null && (
        <p className="text-gray-600 mt-0.5">
          <span className="text-gray-400">Đánh giá: </span>
          {String(data.assessment)}
        </p>
      )}
      {data.comment != null && <p className="text-gray-700 mt-1.5 leading-relaxed">{String(data.comment)}</p>}
    </div>
  );
};

const DashboardInsightOverview = ({ insights, isLoading = false, error = '' }) => {
  if (isLoading) {
    return (
      <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm text-gray-500 animate-pulse">
        Đang phân tích insight…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
    );
  }

  if (!insights) return null;

  /** Cùng logic chuẩn hóa với khi lưu/đọc insight — tránh tổng quan rơi nhánh “Tóm tắt” trong khi vẫn có charts. */
  const insightsNorm = normalizeDashboardInsightForUi(insights) ?? insights;

  const km = insightsNorm.key_metrics_analysis;
  const hasStructured = km && typeof km === 'object';

  if (!hasStructured) {
    const text = typeof insightsNorm.overview === 'string' ? insightsNorm.overview : '';
    if (!text) return null;
    return (
      <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
        <p className="text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Tóm tắt</p>
        <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">{text}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 text-sm text-gray-700">
      {insightsNorm.overview && (
        <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 px-4 py-3">
          <p className="text-xs font-semibold text-indigo-700 mb-1 uppercase tracking-wide">Tóm tắt tổng quan</p>
          <p className="leading-relaxed whitespace-pre-line">{String(insightsNorm.overview)}</p>
        </div>
      )}

      <SectionTitle>Chỉ số chính</SectionTitle>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <MetricCard label="Mở / Open" data={km.open_rate} />
        <MetricCard label="Click / Gửi" data={km.click_rate} />
        <MetricCard label="Chuyển đổi (click → mua)" data={km.conversion_rate} />
      </div>

      {Array.isArray(insightsNorm.insights) && insightsNorm.insights.length > 0 && (
        <>
          <SectionTitle>Insight nổi bật</SectionTitle>
          <ul className="space-y-2">
            {insightsNorm.insights.map((item, idx) => (
              <li
                key={idx}
                className="rounded-lg border border-gray-100 bg-white px-3 py-2.5 text-xs leading-relaxed"
              >
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className="font-semibold text-gray-800">{item.title || `Insight ${idx + 1}`}</span>
                  {item.type && (
                    <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">{item.type}</span>
                  )}
                  {item.priority && (
                    <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-800">{item.priority}</span>
                  )}
                </div>
                {item.detail && <p className="text-gray-700">{item.detail}</p>}
                {item.impact && (
                  <p className="text-gray-500 mt-1">
                    <span className="text-gray-400">Tác động: </span>
                    {item.impact}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {insightsNorm.channel_analysis && typeof insightsNorm.channel_analysis === 'object' && (
        <>
          <SectionTitle>Phân tích theo kênh</SectionTitle>
          <div className="rounded-lg border border-gray-100 bg-white px-3 py-2.5 text-xs space-y-1.5">
            {insightsNorm.channel_analysis.best_channel && (
              <p>
                <span className="text-gray-400">Kênh nổi bật: </span>
                {insightsNorm.channel_analysis.best_channel}
              </p>
            )}
            {insightsNorm.channel_analysis.underperforming_channel && (
              <p>
                <span className="text-gray-400">Kênh yếu: </span>
                {insightsNorm.channel_analysis.underperforming_channel}
              </p>
            )}
            {insightsNorm.channel_analysis.recommendation && (
              <p className="text-gray-700 leading-relaxed pt-1">{insightsNorm.channel_analysis.recommendation}</p>
            )}
          </div>
        </>
      )}

      {insightsNorm.funnel_analysis && typeof insightsNorm.funnel_analysis === 'object' && (
        <>
          <SectionTitle>Phễu (funnel)</SectionTitle>
          <div className="rounded-lg border border-gray-100 bg-white px-3 py-2.5 text-xs space-y-1.5">
            {insightsNorm.funnel_analysis.bottleneck && (
              <p>
                <span className="text-gray-400">Nút thắt: </span>
                {insightsNorm.funnel_analysis.bottleneck}
              </p>
            )}
            {insightsNorm.funnel_analysis.drop_off_stage && (
              <p>
                <span className="text-gray-400">Rơi nhiều ở: </span>
                {insightsNorm.funnel_analysis.drop_off_stage}
              </p>
            )}
            {insightsNorm.funnel_analysis.suggestion && (
              <p className="text-gray-700 leading-relaxed pt-1">{insightsNorm.funnel_analysis.suggestion}</p>
            )}
          </div>
        </>
      )}

      {insightsNorm.top_product_insight && typeof insightsNorm.top_product_insight === 'object' && (
        <>
          <SectionTitle>Sản phẩm / khóa học</SectionTitle>
          <div className="rounded-lg border border-gray-100 bg-white px-3 py-2.5 text-xs space-y-1.5">
            {insightsNorm.top_product_insight.observation && (
              <p className="text-gray-700 leading-relaxed">{insightsNorm.top_product_insight.observation}</p>
            )}
            {insightsNorm.top_product_insight.action && (
              <p className="text-gray-600">
                <span className="text-gray-400">Hành động: </span>
                {insightsNorm.top_product_insight.action}
              </p>
            )}
          </div>
        </>
      )}

      {Array.isArray(insightsNorm.action_plan) && insightsNorm.action_plan.length > 0 && (
        <>
          <SectionTitle>Kế hoạch hành động</SectionTitle>
          <ol className="list-decimal list-inside space-y-2 text-xs">
            {insightsNorm.action_plan.map((ap, idx) => (
              <li key={idx} className="rounded-lg border border-gray-100 bg-white px-3 py-2">
                <span className="font-medium text-gray-800">{ap.action || 'Hành động'}</span>
                {ap.expected_result && (
                  <p className="text-gray-600 mt-1">Kỳ vọng: {ap.expected_result}</p>
                )}
                {ap.timeline && <p className="text-gray-500 mt-0.5">Thời gian: {ap.timeline}</p>}
              </li>
            ))}
          </ol>
        </>
      )}

      {insightsNorm.risk_warning && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
          <span className="font-semibold">Cảnh báo: </span>
          {String(insightsNorm.risk_warning)}
        </div>
      )}

      {Array.isArray(insightsNorm.notes) && insightsNorm.notes.length > 0 && (
        <div className="text-xs text-gray-500 space-y-1 pt-1">
          {insightsNorm.notes.map((n, idx) => (
            <div key={idx}>• {n}</div>
          ))}
        </div>
      )}
    </div>
  );
};

export default DashboardInsightOverview;
