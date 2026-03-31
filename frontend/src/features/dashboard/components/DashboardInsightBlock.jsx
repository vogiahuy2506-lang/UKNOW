/**
 * Khối hiển thị insight (text) dưới biểu đồ/tổng quan.
 *
 * Quy ước:
 * - Render dạng text thuần, hỗ trợ xuống dòng bằng `whitespace-pre-line`.
 * - Dùng tone UI nhẹ, không lấn át biểu đồ chính.
 */
const DashboardInsightBlock = ({ title = 'Insight', text, isLoading = false, error = '' }) => {
  if (isLoading) {
    return (
      <div className="mt-3 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm text-gray-500 animate-pulse">
        Đang phân tích insight…
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-3 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
        {error}
      </div>
    );
  }

  if (!text) return null;

  return (
    <div className="mt-3 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
      <p className="text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">{title}</p>
      <div className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">
        {text}
      </div>
    </div>
  );
};

export default DashboardInsightBlock;

