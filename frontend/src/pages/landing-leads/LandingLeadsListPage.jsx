import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  HiOutlineRefresh,
  HiOutlineMail,
  HiOutlinePhone,
  HiOutlineExternalLink,
  HiOutlineSearch,
  HiOutlineClipboard,
  HiOutlineCalendar,
  HiOutlineX,
  HiOutlineUsers,
  HiOutlineChevronLeft,
  HiOutlineChevronRight,
} from 'react-icons/hi';
import PageHeader from '../../components/common/PageHeader';
import useLandingLeadsList from '../../features/landing/hooks/useLandingLeadsList.js';
import { LandingLeadsAdminFilters } from '../../features/landing/components/LandingLeadsAdminFilters.jsx';
import { fetchLandingLeadsCustomFieldDefinitions } from '../../features/landing/services/landingLeadsAdminApi.service.js';
import {
  getLeadFullName,
  getLeadInitials,
  renderLeadExtraInfo,
} from '../../features/landing/utils/leadFields.js';
import { useI18n } from '../../i18n';

// eslint-disable-next-line no-unused-vars
const PAGE_SIZE = 20;

/**
 * Trang quản lý Lead đổ về từ form landing (/embed/lead-form, snippet HTML, form trong landing page).
 *
 * Đồng bộ với:
 *  - Lead Form (LeadFormConfigPanel / useFounderLandingForm) — payload POST /api/public/leads.
 *  - Custom field definitions endpoint `/leads/custom-field-definitions` — để hiển thị label + options.
 */
export default function LandingLeadsListPage() {
  const { t } = useI18n();
  const {
    draftFilters,
    setDraftFilters,
    appliedFilters,
    applyFilters,
    resetFilters,
    exportExcel,
    isExporting,
    page,
    setPage,
    items,
    pagination,
    isLoading,
    errorMessage,
    reload,
  } = useLandingLeadsList();

  const [customDefs, setCustomDefs] = useState([]);

  // Quick search trong trang hiện tại (FE-only, không gọi lại API).
  // Backend chưa hỗ trợ filter theo text nên search chỉ áp dụng cho items đã load.
  const [quickSearch, setQuickSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(quickSearch.trim().toLowerCase()), 250);
    return () => clearTimeout(id);
  }, [quickSearch]);

  // Đếm số bộ lọc đang áp dụng (dùng cho badge trên trigger button).
  const appliedCount = useMemo(() => {
    let n = 0;
    if (appliedFilters.landingLeadsUseDateRange) n += 1;
    if (Array.isArray(appliedFilters.landingLeadsSlugs) && appliedFilters.landingLeadsSlugs.length > 0) n += 1;
    if (Array.isArray(appliedFilters.landingLeadsCustomFilters) && appliedFilters.landingLeadsCustomFilters.length > 0) {
      n += appliedFilters.landingLeadsCustomFilters.length;
    }
    return n;
  }, [appliedFilters]);

  // Lấy definitions để render label + options cho customFields trong từng dòng.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const items = await fetchLandingLeadsCustomFieldDefinitions();
        if (!cancelled) setCustomDefs(Array.isArray(items) ? items : []);
      } catch {
        if (!cancelled) setCustomDefs([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const totalPages = pagination.totalPages || 1;
  const total = pagination.total ?? 0;

  const visibleItems = useMemo(() => {
    if (!debouncedSearch) return items;
    const q = debouncedSearch;
    return items.filter((row) => {
      const fullName = String(getLeadFullName(row) || '').toLowerCase();
      const email = String(row.email || '').toLowerCase();
      const phone = String(row.phone || '').toLowerCase();
      return fullName.includes(q) || email.includes(q) || phone.includes(q);
    });
  }, [items, debouncedSearch]);

  const handleExport = useCallback(async () => {
    try {
      const result = await exportExcel();
      if (result?.truncated) {
        toast(t('landingLeads.exportTruncated'));
      } else {
        toast.success(t('landingLeads.exportSuccess'));
      }
    } catch (e) {
      toast.error(e?.response?.data?.message || e?.message || t('landingLeads.exportFailed'));
    }
  }, [exportExcel, t]);

  const handleCopy = useCallback(
    async (text, label) => {
      try {
        await navigator.clipboard.writeText(text);
        toast.success(`Đã copy ${label}`);
      } catch {
        toast.error('Không thể copy');
      }
    },
    []
  );

  const dateRangeText = useMemo(() => {
    if (!appliedFilters.landingLeadsUseDateRange) return null;
    const from = appliedFilters.landingLeadsDateFrom;
    const to = appliedFilters.landingLeadsDateTo;
    if (!from && !to) return null;
    return `${from || '...'} → ${to || '...'}`;
  }, [appliedFilters.landingLeadsUseDateRange, appliedFilters.landingLeadsDateFrom, appliedFilters.landingLeadsDateTo]);

  const appliedChips = useMemo(() => buildAppliedChips(appliedFilters, customDefs, t), [appliedFilters, customDefs, t]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        icon={HiOutlineUsers}
        title={t('landingLeads.pageTitle')}
        subtitle={t('landingLeads.pageDescription')}
        actions={
          <div className="flex items-center gap-2">
            <div className="relative">
              <HiOutlineSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="search"
                value={quickSearch}
                onChange={(e) => setQuickSearch(e.target.value)}
                placeholder={t('landingLeads.quickSearchPlaceholder')}
                className="w-full sm:w-64 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100/70 focus:bg-white py-2 pl-9 pr-8 text-xs placeholder:text-slate-400 text-slate-800 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all"
              />
              {quickSearch ? (
                <button
                  type="button"
                  onClick={() => setQuickSearch('')}
                  aria-label={t('landingLeads.clearSearch')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:text-slate-600"
                >
                  <HiOutlineX className="w-3.5 h-3.5" />
                </button>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => reload()}
              disabled={isLoading}
              className="inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 transition-colors shadow-2xs disabled:opacity-50"
            >
              <HiOutlineRefresh className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              <span>{t('landingLeads.refresh')}</span>
            </button>
          </div>
        }
      />

      {/* Filter trigger (drawer) + Export Excel */}
      <div className="flex flex-wrap items-center gap-2">
        <LandingLeadsAdminFilters
          draftFilters={draftFilters}
          setDraftFilters={setDraftFilters}
          onApply={applyFilters}
          onReset={resetFilters}
          onExportExcel={handleExport}
          isExporting={isExporting}
          appliedCount={appliedCount}
        />
      </div>

      {/* Applied filters summary */}
      {appliedChips.length > 0 || dateRangeText ? (
        <div className="flex flex-wrap items-center gap-2 -mt-2">
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Đang lọc:</span>
          {appliedChips.map((chip) => (
            <span
              key={chip.id}
              className="inline-flex items-center gap-1 rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-xs text-orange-700"
            >
              <span className="font-medium">{chip.label}:</span>
              <span className="truncate max-w-[180px]">{chip.value}</span>
            </span>
          ))}
          {dateRangeText ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs text-blue-700">
              <HiOutlineCalendar className="w-3 h-3" />
              {dateRangeText}
            </span>
          ) : null}
          <button
            type="button"
            onClick={resetFilters}
            className="text-xs text-gray-500 hover:text-red-600 underline-offset-2 hover:underline"
          >
            Xoá tất cả
          </button>
        </div>
      ) : null}

      {/* Error banner */}
      {errorMessage ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {errorMessage}
        </div>
      ) : null}

      {/* Table card */}
      <div className="rounded-2xl border border-slate-200/90 bg-white shadow-2xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between gap-3 bg-slate-50/50">
          <p className="text-xs sm:text-sm text-slate-600">
            <span className="font-bold text-slate-900">{total.toLocaleString('vi-VN')}</span> {t('landingLeads.records')}
            {debouncedSearch && visibleItems.length !== items.length ? (
              <span className="ml-2 text-xs text-slate-500">
                · {t('landingLeads.showingOf', { shown: visibleItems.length, total: items.length })}
              </span>
            ) : null}
          </p>
          <p className="text-xs sm:text-sm text-slate-500 font-medium">
            {t('landingLeads.pageOf', { page, total: totalPages })}
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100">
            <thead className="bg-slate-50/80">
              <tr>
                <th className="px-6 py-3.5 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  {t('landingLeads.fullName')}
                </th>
                <th className="px-6 py-3.5 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  {t('landingLeads.email')}
                </th>
                <th className="px-6 py-3.5 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  {t('landingLeads.phone')}
                </th>
                <th className="px-6 py-3.5 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  {t('landingLeads.landingSlug')}
                </th>
                <th className="px-6 py-3.5 text-center text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  {t('forms.submissionsPage.colConsent', { defaultValue: 'Đồng ý tiếp thị' })}
                </th>
                <th className="px-6 py-3.5 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  {t('landingLeads.extraInfo')}
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-100">
              {isLoading && items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-sm text-slate-500">
                    <span className="inline-block w-4 h-4 mr-2 align-[-2px] border-2 border-slate-300 border-t-orange-500 rounded-full animate-spin" />
                    {t('landingLeads.loading')}
                  </td>
                </tr>
              ) : null}

              {!isLoading && visibleItems.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-16 text-center">
                    <HiOutlineSearch className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                    {debouncedSearch ? (
                      <>
                        <p className="text-sm text-slate-500">
                          {t('landingLeads.noMatchInPage', { query: debouncedSearch })}
                        </p>
                        <button
                          type="button"
                          onClick={() => setQuickSearch('')}
                          className="mt-3 text-xs font-semibold text-orange-600 hover:text-orange-700 hover:underline"
                        >
                          {t('landingLeads.clearSearch')}
                        </button>
                      </>
                    ) : (
                      <>
                        <p className="text-sm text-slate-500">{t('landingLeads.noRecords')}</p>
                        {appliedChips.length > 0 ? (
                          <button
                            type="button"
                            onClick={resetFilters}
                            className="mt-3 text-xs font-semibold text-orange-600 hover:text-orange-700 hover:underline"
                          >
                            Xoá bộ lọc để thấy tất cả
                          </button>
                        ) : null}
                      </>
                    )}
                  </td>
                </tr>
              ) : null}

              {visibleItems.map((row) => {
                const fullName = getLeadFullName(row);
                const initials = getLeadInitials(row);
                const cfSummary = renderLeadExtraInfo(row, customDefs, 'vi');
                const publicUrl = row.landingPageSlug
                  ? `${window.location.origin}/${row.landingPageSlug}`
                  : null;
                return (
                  <tr key={row.id ?? row.leadId} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-6 py-4 text-xs sm:text-sm whitespace-nowrap">
                      <div className="flex items-center gap-2.5">
                        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-gradient-to-br from-orange-400 to-amber-500 text-white text-[11px] font-semibold shrink-0 shadow-2xs">
                          {initials}
                        </span>
                        <div className="min-w-0">
                          <p className="text-slate-900 font-semibold truncate">{fullName || '—'}</p>
                          {row.registrationTime || row.createdAt ? (
                            <p className="text-[11px] text-slate-400 truncate">
                              {formatRelativeTime(row.registrationTime || row.createdAt)}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-xs sm:text-sm text-slate-700 max-w-[240px]">
                      {row.email ? (
                        <div className="flex items-center gap-1.5 group">
                          <HiOutlineMail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="truncate font-medium text-slate-800" title={row.email}>{row.email}</span>
                          <button
                            type="button"
                            onClick={() => handleCopy(row.email, 'email')}
                            className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded text-slate-400 hover:text-orange-600"
                            title="Copy email"
                          >
                            <HiOutlineClipboard className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-6 py-4 text-xs sm:text-sm text-slate-700 whitespace-nowrap">
                      {row.phone ? (
                        <div className="flex items-center gap-1.5 group">
                          <HiOutlinePhone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="font-medium text-slate-800">{row.phone}</span>
                          <button
                            type="button"
                            onClick={() => handleCopy(row.phone, 'SĐT')}
                            className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded text-slate-400 hover:text-orange-600"
                            title="Copy SĐT"
                          >
                            <HiOutlineClipboard className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-6 py-4 text-xs sm:text-sm text-slate-700 whitespace-nowrap">
                      {row.landingPageSlug ? (
                        <a
                          href={publicUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-orange-50 hover:text-orange-700 border border-slate-200/60 transition-colors font-medium text-xs text-slate-700"
                          title={publicUrl}
                        >
                          /{row.landingPageSlug}
                          <HiOutlineExternalLink className="w-3 h-3 opacity-60" />
                        </a>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-xs sm:text-sm text-center whitespace-nowrap">
                      {row.consentWithdrawnAt ? (
                        <span
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200/80 shadow-2xs"
                          title={new Date(row.consentWithdrawnAt).toLocaleString('vi-VN')}
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                          {t('forms.submissionsPage.consentWithdrawn', {
                            date: new Date(row.consentWithdrawnAt).toLocaleDateString('vi-VN'),
                            defaultValue: `Đã rút · ${new Date(row.consentWithdrawnAt).toLocaleDateString('vi-VN')}`,
                          })}
                        </span>
                      ) : row.marketingConsent === true ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/80 shadow-2xs">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          {t('forms.submissionsPage.consentYes', { defaultValue: 'Có' })}
                        </span>
                      ) : row.marketingConsent === false ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200 shadow-2xs">
                          <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                          {t('forms.submissionsPage.consentNo', { defaultValue: 'Không' })}
                        </span>
                      ) : (
                        <span className="text-slate-400 font-medium">
                          {t('forms.submissionsPage.consentNone', { defaultValue: '—' })}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-xs sm:text-sm text-slate-600 max-w-[280px]">
                      {cfSummary ? (
                        <p className="truncate" title={cfSummary}>{cfSummary}</p>
                      ) : (
                        <span className="text-slate-400 italic text-xs">{t('landingLeads.extraEmpty')}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {totalPages > 1 ? (
          <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between gap-3">
            <button
              type="button"
              disabled={page <= 1 || isLoading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 disabled:opacity-40 transition-colors shadow-2xs"
            >
              <HiOutlineChevronLeft className="w-4 h-4" />
              {t('landingLeads.previousPage')}
            </button>
            <span className="text-xs sm:text-sm font-semibold text-slate-600">
              {page} / {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages || isLoading}
              onClick={() => setPage((p) => p + 1)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 disabled:opacity-40 transition-colors shadow-2xs"
            >
              {t('landingLeads.nextPage')}
              <HiOutlineChevronRight className="w-4 h-4" />
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ───────── helpers ───────── */

function formatRelativeTime(raw) {
  try {
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return '';
    const now = Date.now();
    const diff = Math.floor((now - d.getTime()) / 1000);
    if (diff < 60) return 'vừa xong';
    if (diff < 3600) return `${Math.floor(diff / 60)} phút trước`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} giờ trước`;
    if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} ngày trước`;
    return d.toLocaleDateString('vi-VN');
  } catch {
    return '';
  }
}

/**
 * Tạo chip tóm tắt bộ lọc đang áp dụng (hiển thị pill trên header để dễ kiểm tra).
 */
function buildAppliedChips(filters, customDefs, t) {
  const chips = [];
  const slugs = Array.isArray(filters.landingLeadsSlugs) ? filters.landingLeadsSlugs : [];
  if (slugs.length > 0) {
    chips.push({
      id: 'slugs',
      label: t('landingLeads.slugSourceLabel'),
      value: slugs.map((s) => `/${s}`).join(', '),
    });
  }
  const cfs = Array.isArray(filters.landingLeadsCustomFilters) ? filters.landingLeadsCustomFilters : [];
  for (const cf of cfs) {
    const def = customDefs.find((d) => d.key === cf.key);
    const label = def?.labelVi || cf.key;
    let display = String(cf.value ?? '');
    if (def && (def.type === 'select' || def.type === 'radio') && Array.isArray(def.options)) {
      const opt = def.options.find((o) => o.value === cf.value);
      if (opt) display = opt.labelVi || opt.value;
    } else if (cf.value === 'true') {
      display = t('landingLeads.yes');
    } else if (cf.value === 'false') {
      display = t('landingLeads.no');
    }
    chips.push({ id: `cf-${cf.key}`, label, value: display });
  }
  return chips;
}
