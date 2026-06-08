import { useState, useEffect } from 'react';
import { HiOutlineRefresh, HiOutlineSearch, HiOutlineX } from 'react-icons/hi';
import useLandingLeadsList from '../../features/landing/hooks/useLandingLeadsList.js';
import { useI18n } from '../../i18n';

const LandingLeadsListPage = () => {
  const { t } = useI18n();
  const {
    search,
    setSearch,
    selectedSlug,
    setSelectedSlug,
    availableSlugs,
    page,
    setPage,
    items,
    pagination,
    isLoading,
    errorMessage,
    reload,
  } = useLandingLeadsList();

  const [inputValue, setInputValue] = useState(search);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(inputValue);
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [inputValue, setSearch, setPage]);

  const handleClearSearch = () => {
    setInputValue('');
    setSearch('');
    setPage(1);
  };

  const handleSlugChange = (e) => {
    setSelectedSlug(e.target.value);
    setPage(1);
  };

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

      {/* Search and Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <HiOutlineSearch className="h-5 w-5 text-gray-400" />
          </div>
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={t('landingLeads.searchPlaceholder') || 'Tìm kiếm họ tên, email, SĐT...'}
            className="block w-full pl-10 pr-10 py-2 border border-gray-200 rounded-lg text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
          {inputValue && (
            <button
              type="button"
              onClick={handleClearSearch}
              className="absolute inset-y-0 right-0 pr-3 flex items-center"
            >
              <HiOutlineX className="h-5 w-5 text-gray-400 hover:text-gray-600" />
            </button>
          )}
        </div>

        {/* Slug Filter */}
        <div className="w-full sm:w-64">
          <select
            value={selectedSlug}
            onChange={handleSlugChange}
            className="block w-full py-2 px-3 border border-gray-200 bg-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          >
            <option value="">{t('landingLeads.allSlugs') || 'Tất cả trang nguồn'}</option>
            {availableSlugs.map((slug) => (
              <option key={slug} value={slug}>
                {slug}
              </option>
            ))}
          </select>
        </div>
      </div>

      {errorMessage ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {errorMessage}
        </div>
      ) : null}

      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <p className="text-sm text-gray-600">
            <span className="font-medium text-gray-900">{total.toLocaleString('vi-VN')}</span> {t('landingLeads.records')}
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
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {isLoading && items.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-12 text-center text-sm text-gray-500">
                    {t('landingLeads.loading')}
                  </td>
                </tr>
              ) : null}
              {!isLoading && items.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-12 text-center text-sm text-gray-500">
                    {t('landingLeads.noRecords')}
                  </td>
                </tr>
              ) : null}
              {items.map((row) => (
                <tr key={row.id ?? row.leadId} className="hover:bg-gray-50/80">
                  <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap">
                    {row.fullName || `${row.lastName || ''} ${row.firstName || ''}`.trim() || '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700 max-w-[250px] truncate" title={row.email}>
                    {row.email || '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{row.phone || '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-700 font-medium whitespace-nowrap">
                    {row.landingPageSlug || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-between gap-3">
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
        )}
      </div>
    </div>
  );
};

export default LandingLeadsListPage;
