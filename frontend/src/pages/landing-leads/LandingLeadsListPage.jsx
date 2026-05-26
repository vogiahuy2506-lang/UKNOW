import { HiOutlineRefresh } from 'react-icons/hi';
import useLandingLeadsList from '../../features/landing/hooks/useLandingLeadsList.js';
import { LandingLeadsAdminFilters } from '../../features/landing/components/LandingLeadsAdminFilters.jsx';
import { useI18n } from '../../i18n';

/**
 * Định dạng ngày giờ hiển thị (ISO → tiếng Việt).
 *
 * @param {string|Date|null|undefined} raw
 * @returns {string}
 */
function formatDateTimeVi(raw) {
  if (!raw) return '—';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Trang danh sách khách đăng ký qua form landing công khai (`/l`) — có bộ lọc và phân trang.
 *
 * Luồng hoạt động:
 * 1. Hook `useLandingLeadsList` gọi GET `/api/leads` khi đổi trang hoặc áp dụng lọc.
 * 2. Bảng hiển thị dữ liệu đã map từ backend (họ tên, liên hệ, slug landing, nghề, lĩnh vực, đồng ý marketing, thời gian).
 */
const LandingLeadsListPage = () => {
  const { t } = useI18n();
  const {
    draftFilters,
    setDraftFilters,
    appliedFilters,
    page,
    setPage,
    items,
    pagination,
    isLoading,
    errorMessage,
    applyFilters,
    resetFilters,
    reload,
    exportToExcel,
    isExporting,
  } = useLandingLeadsList();

  const totalPages = pagination.totalPages || 1;
  const total = pagination.total ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">
            {t('landingLeads.pageTitle')}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {t('landingLeads.pageDescription')}
          </p>
        </div>
        <button
          type="button"
          onClick={() => reload()}
          disabled={isLoading}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
        >
          <HiOutlineRefresh className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
          {t('landingLeads.refresh')}
        </button>
      </div>

      <LandingLeadsAdminFilters
        draftFilters={draftFilters}
        setDraftFilters={setDraftFilters}
        onApply={applyFilters}
        onReset={resetFilters}
        onExportExcel={exportToExcel}
        isExporting={isExporting}
      />

      {errorMessage ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {errorMessage}
        </div>
      ) : null}

      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-gray-600">
            <span className="font-medium text-gray-900">{total.toLocaleString('vi-VN')}</span> {t('landingLeads.records')}
            {appliedFilters.landingLeadsUseDateRange ? (
              <span className="text-gray-500">
                {' '}
                ({t('landingLeads.dateRange', {
                  from: appliedFilters.landingLeadsDateFrom || '…',
                  to: appliedFilters.landingLeadsDateTo || '…',
                })})
              </span>
            ) : null}
          </p>
          <p className="text-sm text-gray-500">
            {t('landingLeads.pageOf', { page, total: totalPages })}
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('landingLeads.fullName')}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('landingLeads.email')}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('landingLeads.phone')}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('landingLeads.landingSlug')}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('landingLeads.occupation')}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('landingLeads.interestArea')}
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('landingLeads.marketingConsent')}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('landingLeads.registrationTime')}
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {isLoading && items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-sm text-gray-500">
                    {t('landingLeads.loading')}
                  </td>
                </tr>
              ) : null}
              {!isLoading && items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-sm text-gray-500">
                    {t('landingLeads.noRecords')}
                  </td>
                </tr>
              ) : null}
              {items.map((row) => (
                <tr key={row.id ?? row.leadId} className="hover:bg-gray-50/80">
                  <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap">
                    {row.fullName || `${row.lastName || ''} ${row.firstName || ''}`.trim() || '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700 max-w-[200px] truncate" title={row.email}>
                    {row.email || '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{row.phone || '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-700 font-mono text-xs whitespace-nowrap">
                    {row.landingPageSlug || '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 max-w-[160px]">
                    {row.occupation || '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 max-w-[200px]">
                    {row.interestArea || '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-center text-gray-700">
                    {row.marketingConsent ? t('landingLeads.yes') : t('landingLeads.no')}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                    {formatDateTimeVi(row.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 ? (
          <div className="px-5 py-4 border-t border-gray-100 flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              disabled={page <= 1 || isLoading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {t('landingLeads.previousPage')}
            </button>
            <span className="text-sm text-gray-600">
              {page} / {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages || isLoading}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {t('landingLeads.nextPage')}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default LandingLeadsListPage;
