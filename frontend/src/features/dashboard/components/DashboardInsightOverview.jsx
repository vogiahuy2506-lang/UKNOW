import { normalizeDashboardInsightForUi } from '../utils/dashboardInsightStorage.util';
import InsightMarkdownBody, { renderBoldSegments } from './InsightMarkdownBody';

/**
 * Hiển thị khối insight tổng quan có cấu trúc (sau khi Gemini trả JSON đầy đủ).
 *
 * Luồng hoạt động:
 * - Chuẩn hóa payload (unwrap, merge charts, parse key_metrics nếu là chuỗi) để đồng bộ với lúc phân tích trực tiếp và khi đọc từ localStorage.
 * - Nếu có `key_metrics_analysis` / `insights` / `action_plan` → render theo section.
 * - Nếu chỉ có `overview` dạng chuỗi → hiển thị đoạn tóm tắt đơn giản.
 * - Chuỗi từ Gemini có thể chứa markdown nhẹ `**in đậm**` → dùng `InsightMarkdownBody` / `renderBoldSegments`.
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
          {renderBoldSegments(String(data.value))}
        </p>
      )}
      {data.benchmark != null && (
        <p className="text-gray-600 mt-0.5">
          <span className="text-gray-400">Tham chiếu: </span>
          {renderBoldSegments(String(data.benchmark))}
        </p>
      )}
      {data.assessment != null && (
        <p className="text-gray-600 mt-0.5">
          <span className="text-gray-400">Đánh giá: </span>
          {renderBoldSegments(String(data.assessment))}
        </p>
      )}
      {data.comment != null && (
        <div className="text-gray-700 mt-1.5 leading-relaxed">
          <InsightMarkdownBody text={String(data.comment)} />
        </div>
      )}
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
        <div className="text-sm text-gray-700 leading-relaxed">
          <InsightMarkdownBody text={text} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2 text-sm text-gray-700">
      {insightsNorm.overview && (
        <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 px-4 py-3">
          <p className="text-xs font-semibold text-indigo-700 mb-1 uppercase tracking-wide">Tóm tắt tổng quan</p>
          <div className="leading-relaxed text-gray-800">
            <InsightMarkdownBody text={String(insightsNorm.overview)} />
          </div>
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
                  <span className="font-semibold text-gray-800">
                    {renderBoldSegments(item.title || `Insight ${idx + 1}`)}
                  </span>
                  {item.type && (
                    <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">{item.type}</span>
                  )}
                  {item.priority && (
                    <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-800">{item.priority}</span>
                  )}
                </div>
                {item.detail && (
                  <div className="text-gray-700">
                    <InsightMarkdownBody text={String(item.detail)} />
                  </div>
                )}
                {item.impact && (
                  <div className="text-gray-500 mt-1">
                    <span className="text-gray-400">Tác động: </span>
                    {renderBoldSegments(String(item.impact))}
                  </div>
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
                {renderBoldSegments(String(insightsNorm.channel_analysis.best_channel))}
              </p>
            )}
            {insightsNorm.channel_analysis.underperforming_channel && (
              <p>
                <span className="text-gray-400">Kênh yếu: </span>
                {renderBoldSegments(String(insightsNorm.channel_analysis.underperforming_channel))}
              </p>
            )}
            {insightsNorm.channel_analysis.recommendation && (
              <div className="text-gray-700 leading-relaxed pt-1">
                <InsightMarkdownBody text={String(insightsNorm.channel_analysis.recommendation)} />
              </div>
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
                {renderBoldSegments(String(insightsNorm.funnel_analysis.bottleneck))}
              </p>
            )}
            {insightsNorm.funnel_analysis.drop_off_stage && (
              <p>
                <span className="text-gray-400">Rơi nhiều ở: </span>
                {renderBoldSegments(String(insightsNorm.funnel_analysis.drop_off_stage))}
              </p>
            )}
            {insightsNorm.funnel_analysis.suggestion && (
              <div className="text-gray-700 leading-relaxed pt-1">
                <InsightMarkdownBody text={String(insightsNorm.funnel_analysis.suggestion)} />
              </div>
            )}
          </div>
        </>
      )}

      {insightsNorm.top_product_insight && typeof insightsNorm.top_product_insight === 'object' && (
        <>
          <SectionTitle>Sản phẩm / khóa học</SectionTitle>
          <div className="rounded-lg border border-gray-100 bg-white px-3 py-2.5 text-xs space-y-1.5">
            {insightsNorm.top_product_insight.observation && (
              <div className="text-gray-700 leading-relaxed">
                <InsightMarkdownBody text={String(insightsNorm.top_product_insight.observation)} />
              </div>
            )}
            {insightsNorm.top_product_insight.action && (
              <div className="text-gray-600 flex flex-wrap items-baseline gap-x-1 gap-y-1">
                <span className="text-gray-400 shrink-0">Hành động:</span>
                <div className="min-w-0 flex-1">
                  <InsightMarkdownBody text={String(insightsNorm.top_product_insight.action)} />
                </div>
              </div>
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
                <div className="font-medium text-gray-800">
                  <InsightMarkdownBody text={String(ap.action || 'Hành động')} />
                </div>
                {ap.expected_result && (
                  <div className="text-gray-600 mt-1 flex flex-wrap items-baseline gap-x-1 gap-y-1">
                    <span className="text-gray-500 shrink-0">Kỳ vọng:</span>
                    <div className="min-w-0 flex-1">
                      <InsightMarkdownBody text={String(ap.expected_result)} />
                    </div>
                  </div>
                )}
                {ap.timeline && (
                  <div className="text-gray-500 mt-0.5">
                    <span className="text-gray-400">Thời gian: </span>
                    {renderBoldSegments(String(ap.timeline))}
                  </div>
                )}
              </li>
            ))}
          </ol>
        </>
      )}

      {insightsNorm.risk_warning && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
          <div className="flex flex-wrap items-baseline gap-x-1 gap-y-1">
            <span className="font-semibold shrink-0">Cảnh báo:</span>
            <div className="min-w-0 flex-1">
              <InsightMarkdownBody text={String(insightsNorm.risk_warning)} />
            </div>
          </div>
        </div>
      )}

      {Array.isArray(insightsNorm.notes) && insightsNorm.notes.length > 0 && (
        <div className="text-xs text-gray-500 space-y-1 pt-1">
          {insightsNorm.notes.map((n, idx) => (
            <div key={idx}>
              <span className="text-gray-400">• </span>
              {renderBoldSegments(String(n))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default DashboardInsightOverview;
