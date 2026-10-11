import InsightMarkdownBody from './InsightMarkdownBody';
import { useI18n } from '../../../i18n';

/**
 * Khối hiển thị insight (text) dưới biểu đồ/tổng quan.
 *
 * Quy ước:
 * - Ưu tiên markdown nhẹ: gạch đầu dòng `- ` và **in đậm** (xem `InsightMarkdownBody`).
 * - Văn bản thuần vẫn hiển thị được (parser gom thành đoạn).
 */
const DashboardInsightBlock = ({ title, text, isLoading = false, error = '' }) => {
  const { t } = useI18n();
  const _title = title || t('dashboardInsightOverview.title');

  if (isLoading) {
    return (
      <div className="mt-3 rounded-xl border border-gray-100 dark:border-dk-border bg-gray-50 dark:bg-dk-raised px-4 py-3 text-sm text-gray-500 dark:text-dk-text2 animate-pulse">
        {t('dashboardInsightOverview.analyzingLoading')}
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-3 rounded-xl border border-red-100 dark:border-red-800 bg-red-50 dark:bg-red-950/40 px-4 py-3 text-sm text-red-600 dark:text-red-400">
        {error}
      </div>
    );
  }

  if (!text) return null;

  return (
    <div className="mt-3 rounded-xl border border-gray-100 dark:border-dk-border bg-gray-50 dark:bg-dk-raised px-4 py-3">
      <p className="text-xs font-semibold text-gray-500 dark:text-dk-text2 mb-1.5 uppercase tracking-wide">{_title}</p>
      <InsightMarkdownBody text={text} />
    </div>
  );
};

export default DashboardInsightBlock;

