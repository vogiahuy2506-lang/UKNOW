import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  HiOutlineRefresh,
  HiOutlineMail,
  HiOutlinePhone,
  HiOutlineSearch,
  HiOutlineClipboard,
  HiOutlineCalendar,
  HiOutlineX,
  HiOutlineChevronLeft,
  HiOutlineChevronRight,
  HiOutlineEye,
  HiOutlineDownload,
  HiOutlineCollection,
} from 'react-icons/hi';
import { PageHeaderActions } from '../../components/common/PageContainer';
import useLandingLeadsList from '../../features/landing/hooks/useLandingLeadsList.js';
import { LandingLeadsAdminFilters } from '../../features/landing/components/LandingLeadsAdminFilters.jsx';
import {
  exportLandingLeadsAdminCsv,
} from '../../features/landing/services/landingLeadsAdminApi.service.js';
import LandingLeadConsentBadge from '../../features/landing/components/LandingLeadConsentBadge.jsx';
import LandingLeadDetailModal from '../../features/landing/components/LandingLeadDetailModal.jsx';
import {
  getCustomFieldEntries,
  getLeadFullName,
  getLeadInitials,
} from '../../features/landing/utils/leadFields.js';
import { useI18n } from '../../i18n';
import useCsvExport from '../../hooks/useCsvExport.js';

const UNKNOWN_SLUG = '__unknown__';

/**
 * Tab "Từ landing page" — GOM THEO TỪNG LANDING (thẻ + bảng cột động).
 * Mỗi thẻ = 1 landing (slug + tiêu đề + tổng + mới nhất). Bấm thẻ → bảng chỉ hiện
 * khách của landing đó, cột động = toàn bộ trường riêng của landing đó.
 */
export default function LandingLeadsTab() {
  const { t, locale } = useI18n();
  const { exportCsv, isExporting: isExportingCsv } = useCsvExport();
  const {
    draftFilters,
    setDraftFilters,
    appliedFilters,
    effectiveFilters,
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
    groups = [],
    groupDefs = [],
    groupsLoading = false,
    groupsError = '',
    selectedSlug = null,
    selectSlug = () => {},
  } = useLandingLeadsList();

  const customDefs = groupDefs;
  const [selectedLead, setSelectedLead] = useState(null);
  const closeLeadDetail = useCallback(() => setSelectedLead(null), []);

  const [quickSearch, setQuickSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(quickSearch.trim().toLowerCase()), 250);
    return () => clearTimeout(id);
  }, [quickSearch]);

  // Reset trang khi đổi thẻ.
  useEffect(() => {
    setQuickSearch('');
    setDebouncedSearch('');
  }, [selectedSlug]);

  const appliedCount = useMemo(() => {
    let n = 0;
    if (appliedFilters.landingLeadsUseDateRange) n += 1;
    if (Array.isArray(appliedFilters.landingLeadsCustomFilters) && appliedFilters.landingLeadsCustomFilters.length > 0) {
      n += appliedFilters.landingLeadsCustomFilters.length;
    }
    return n;
  }, [appliedFilters]);

  const selectedGroup = useMemo(
    () => (groups || []).find((g) => g.slug === selectedSlug) || null,
    [groups, selectedSlug]
  );
  const dynamicColumns = useMemo(
    () => (Array.isArray(selectedGroup?.customKeys) ? selectedGroup.customKeys : []),
    [selectedGroup]
  );

  const totalPages = pagination.totalPages || 1;
  const total = pagination.total ?? 0;

  const rowCustomMap = useCallback((row) => {
    const entries = getCustomFieldEntries(row?.customFields, customDefs, locale);
    const m = new Map();
    for (const e of entries) m.set(e.key, e.value);
    return m;
  }, [customDefs, locale]);

  const visibleItems = useMemo(() => {
    if (!debouncedSearch) return items;
    const q = debouncedSearch;
    return items.filter((row) => {
      const fullName = String(getLeadFullName(row) || '').toLowerCase();
      const email = String(row.email || '').toLowerCase();
      const phone = String(row.phone || '').toLowerCase();
      if (fullName.includes(q) || email.includes(q) || phone.includes(q)) return true;
      const cmap = rowCustomMap(row);
      for (const v of cmap.values()) {
        if (String(v || '').toLowerCase().includes(q)) return true;
      }
      const occ = String(row.occupation || '').toLowerCase();
      const interest = String(row.interestArea || '').toLowerCase();
      return occ.includes(q) || interest.includes(q);
    });
  }, [items, debouncedSearch, rowCustomMap]);

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

  const handleExportCsv = useCallback(
    () => exportCsv(() => exportLandingLeadsAdminCsv(effectiveFilters, locale), `khach-${selectedSlug || 'landing'}.csv`),
    [exportCsv, effectiveFilters, locale, selectedSlug]
  );

  const handleCopy = useCallback(
    async (text, label) => {
      try {
        await navigator.clipboard.writeText(text);
        toast.success(t('landingLeads.copiedToast', { label }));
      } catch {
        toast.error(t('landingLeads.copyFailed'));
      }
    },
    [t]
  );

  const dateRangeText = useMemo(() => {
    if (!appliedFilters.landingLeadsUseDateRange) return null;
    const from = appliedFilters.landingLeadsDateFrom;
    const to = appliedFilters.landingLeadsDateTo;
    if (!from && !to) return null;
    return `${from || '...'} → ${to || '...'}`;
  }, [appliedFilters.landingLeadsUseDateRange, appliedFilters.landingLeadsDateFrom, appliedFilters.landingLeadsDateTo]);

  const appliedChips = useMemo(() => buildAppliedChips(appliedFilters, customDefs, t, locale), [appliedFilters, customDefs, t, locale]);

  const fixedColCount = 7; // Họ tên, Email, SĐT, Nghề, Lĩnh vực, Đồng ý, Ngày ĐK
  const colSpan = fixedColCount + dynamicColumns.length + 1;

  return (
    <div className="space-y-6">
      <PageHeaderActions>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExport}
            disabled={isExporting || !selectedSlug}
            className="btn btn-secondary"
          >
            <HiOutlineDownload className="w-4 h-4 mr-1.5" aria-hidden="true" />
            <span>{isExporting ? t('landingLeads.exporting') : t('landingLeads.exportExcel')}</span>
          </button>
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={isExportingCsv || !selectedSlug}
            title={t('csvExport.buttonHint')}
            data-testid="landing-leads-export-csv"
            className="btn btn-secondary"
          >
            <HiOutlineDownload className="w-4 h-4 mr-1.5" aria-hidden="true" />
            <span>{isExportingCsv ? t('csvExport.exporting') : t('csvExport.button')}</span>
          </button>
        </div>
      </PageHeaderActions>

      {/* Thẻ từng Landing */}
      <section aria-label="Landing">
        {groupsError ? (
          <div className="rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/40 px-4 py-3 text-sm text-red-800 dark:text-red-300">
            {groupsError}
          </div>
        ) : null}
        {groupsLoading && groups.length === 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="rounded-2xl border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface p-4 animate-pulse">
                <div className="h-4 w-2/3 rounded bg-slate-200 dark:bg-dk-raised" />
                <div className="mt-2 h-3 w-1/3 rounded bg-slate-100 dark:bg-dk-raised" />
              </div>
            ))}
          </div>
        ) : null}
        {!groupsLoading && groups.length === 0 && !groupsError ? (
          <div className="rounded-2xl border border-dashed border-slate-300 dark:border-dk-border bg-white dark:bg-dk-surface px-6 py-10 text-center">
            <HiOutlineCollection className="w-10 h-10 text-slate-300 dark:text-dk-muted mx-auto mb-2" />
            <p className="text-sm text-slate-500 dark:text-dk-text2">{t('landingLeads.groupsEmpty')}</p>
          </div>
        ) : null}
        {groups.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3" role="listbox" aria-label={t('landingLeads.slugSourceLabel')}>
            {groups.map((g) => {
              const active = g.slug === selectedSlug;
              const isUnknown = g.slug === UNKNOWN_SLUG;
              const label = isUnknown ? t('landingLeads.unknownGroup') : (g.title || `/${g.slug}`);
              return (
                <button
                  key={g.slug}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => selectSlug(g.slug)}
                  className={`text-left rounded-2xl border p-4 transition-all shadow-2xs ${
                    active
                      ? 'border-orange-500 ring-2 ring-orange-500/20 bg-orange-50/60 dark:bg-orange-950/20'
                      : 'border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface hover:border-orange-300 hover:bg-orange-50/40 dark:hover:bg-dk-raised'
                  }`}
                >
                  <p className="text-sm font-bold text-slate-900 dark:text-dk-text truncate" title={label}>{label}</p>
                  {!isUnknown ? (
                    <p className="text-[11px] text-slate-400 dark:text-dk-muted truncate">/{g.slug}</p>
                  ) : (
                    <p className="text-[11px] text-slate-400 dark:text-dk-muted truncate">{t('landingLeads.unknownGroupHint')}</p>
                  )}
                  <div className="mt-2 flex items-center gap-2 text-xs text-slate-600 dark:text-dk-text2">
                    <span className="inline-flex items-center rounded-full bg-slate-100 dark:bg-dk-raised px-2 py-0.5 font-bold text-slate-800 dark:text-dk-text">
                      {Number(g.total || 0).toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN')} {t('landingLeads.customersUnit')}
                    </span>
                    {g.latestAt ? (
                      <span className="truncate">{t('landingLeads.latestShort', { time: formatRelativeTime(g.latestAt, locale) })}</span>
                    ) : null}
                  </div>
                  {Array.isArray(g.customKeys) && g.customKeys.length > 0 ? (
                    <p className="mt-1.5 text-[11px] text-slate-500 dark:text-dk-text2 truncate" title={g.customKeys.map((k) => cardFieldLabel(k, locale)).join(' · ')}>
                      {t('landingLeads.customKeysSummary', { count: g.customKeys.length, preview: g.customKeys.slice(0, 3).map((k) => cardFieldLabel(k, locale)).join(' · ') })}{g.customKeys.length > 3 ? ' …' : ''}
                    </p>
                  ) : (
                    <p className="mt-1.5 text-[11px] italic text-slate-400">{t('landingLeads.basicOnly')}</p>
                  )}
                </button>
              );
            })}
          </div>
        ) : null}
      </section>

      {/* Filter + tìm nhanh + làm mới (phạm vi thẻ đang chọn) */}
      <div className="flex flex-wrap items-center gap-2">
        <LandingLeadsAdminFilters
          draftFilters={draftFilters}
          setDraftFilters={setDraftFilters}
          onApply={applyFilters}
          onReset={resetFilters}
          appliedCount={appliedCount}
          hideSlugSource
        />
        <div className="flex w-full items-center gap-2 sm:ml-auto sm:w-auto">
          <div className="relative min-w-0 flex-1 sm:flex-none">
            <HiOutlineSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-dk-muted" />
            <input
              type="search"
              value={quickSearch}
              onChange={(e) => setQuickSearch(e.target.value)}
              placeholder={t('landingLeads.quickSearchPlaceholder')}
              className="w-full sm:w-64 rounded-xl border border-slate-200 dark:border-dk-border bg-slate-50 dark:bg-dk-inset hover:bg-slate-100/70 dark:hover:bg-dk-raised/50 focus:bg-white dark:focus:bg-dk-inset py-2 pl-9 pr-8 text-xs placeholder:text-slate-400 dark:placeholder:text-dk-muted text-slate-800 dark:text-dk-text focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all"
            />
            {quickSearch ? (
              <button
                type="button"
                onClick={() => setQuickSearch('')}
                aria-label={t('landingLeads.clearSearch')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-dk-text"
              >
                <HiOutlineX className="w-3.5 h-3.5" />
              </button>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => reload()}
            disabled={isLoading}
            className="inline-flex shrink-0 items-center justify-center gap-2 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-raised hover:bg-slate-50 dark:hover:bg-dk-surface text-xs font-semibold text-slate-700 dark:text-dk-text transition-colors shadow-2xs disabled:opacity-50"
          >
            <HiOutlineRefresh className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            <span>{t('landingLeads.refresh')}</span>
          </button>
        </div>
      </div>

      {appliedChips.length > 0 || dateRangeText ? (
        <div className="flex flex-wrap items-center gap-2 -mt-2">
          <span className="text-xs font-medium text-gray-500 dark:text-dk-text2 uppercase tracking-wide">{t('landingLeads.filteringLabel')}</span>
          {selectedGroup ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-orange-300 bg-orange-100 px-2.5 py-1 text-xs font-bold text-orange-800">
              {selectedGroup.slug === UNKNOWN_SLUG ? t('landingLeads.unknownGroup') : `/${selectedGroup.slug}`}
            </span>
          ) : null}
          {appliedChips.map((chip) => (
            <span
              key={chip.id}
              className="inline-flex items-center gap-1 rounded-full border border-orange-200 dark:border-orange-900/50 bg-orange-50 dark:bg-orange-950/30 px-2.5 py-1 text-xs text-orange-700 dark:text-orange-300"
            >
              <span className="font-medium">{chip.label}:</span>
              <span className="truncate max-w-[180px]">{chip.value}</span>
            </span>
          ))}
          {dateRangeText ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 dark:border-blue-900/50 bg-blue-50 dark:bg-blue-950/30 px-2.5 py-1 text-xs text-blue-700 dark:text-blue-300">
              <HiOutlineCalendar className="w-3 h-3" />
              {dateRangeText}
            </span>
          ) : null}
          <button
            type="button"
            onClick={resetFilters}
            className="text-xs text-gray-500 dark:text-dk-text2 hover:text-red-600 dark:hover:text-red-400 underline-offset-2 hover:underline"
          >
            {t('landingLeads.clearAll')}
          </button>
        </div>
      ) : null}

      {errorMessage ? (
        <div className="rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/40 px-4 py-3 text-sm text-red-800 dark:text-red-300">
          {errorMessage}
        </div>
      ) : null}

      {/* Bảng chi tiết của thẻ đang chọn — cột động theo form */}
      <div className="rounded-2xl border border-slate-200/90 dark:border-dk-border bg-white dark:bg-dk-surface shadow-2xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-dk-border flex items-center justify-between gap-3 bg-slate-50/50 dark:bg-dk-raised/30">
          <p className="text-xs sm:text-sm text-slate-600 dark:text-dk-text2">
            <span className="font-bold text-slate-900 dark:text-dk-text">{total.toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN')}</span> {t('landingLeads.records')}
            {selectedGroup ? (
              <span className="ml-2">· {selectedGroup.slug === UNKNOWN_SLUG ? t('landingLeads.unknownGroup') : `/${selectedGroup.slug}`}</span>
            ) : null}
            {debouncedSearch && visibleItems.length !== items.length ? (
              <span className="ml-2 text-xs text-slate-500 dark:text-dk-text2">
                · {t('landingLeads.showingOf', { shown: visibleItems.length, total: items.length })}
              </span>
            ) : null}
          </p>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-dk-text2 font-medium">
            {t('landingLeads.pageOf', { page, total: totalPages })}
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100 dark:divide-dk-border">
            <thead className="bg-slate-50/80 dark:bg-dk-raised/50">
              <tr>
                <th className="pl-6 pr-3 py-3.5 text-left text-[11px] font-bold text-slate-500 dark:text-dk-text2 uppercase tracking-wider">
                  {t('landingLeads.fullName')}
                </th>
                <th className="px-3 py-3.5 text-left text-[11px] font-bold text-slate-500 dark:text-dk-text2 uppercase tracking-wider">
                  {t('landingLeads.email')}
                </th>
                <th className="px-3 py-3.5 text-left text-[11px] font-bold text-slate-500 dark:text-dk-text2 uppercase tracking-wider">
                  {t('landingLeads.phone')}
                </th>
                <th className="px-3 py-3.5 text-left text-[11px] font-bold text-slate-500 dark:text-dk-text2 uppercase tracking-wider whitespace-nowrap">
                  {t('landingLeads.occupation')}
                </th>
                <th className="px-3 py-3.5 text-left text-[11px] font-bold text-slate-500 dark:text-dk-text2 uppercase tracking-wider whitespace-nowrap">
                  {t('landingLeads.interestArea')}
                </th>
                <th className="px-3 py-3.5 text-center text-[11px] font-bold text-slate-500 dark:text-dk-text2 uppercase tracking-wider whitespace-nowrap">
                  {t('forms.submissionsPage.colConsent', { defaultValue: 'Đồng ý tiếp thị' })}
                </th>
                <th className="px-3 py-3.5 text-left text-[11px] font-bold text-slate-500 dark:text-dk-text2 uppercase tracking-wider whitespace-nowrap">
                  {t('landingLeads.registrationTime')}
                </th>
                {dynamicColumns.map((col) => (
                  <th key={col.key} className="px-3 py-3.5 text-left text-[11px] font-bold text-slate-500 dark:text-dk-text2 uppercase tracking-wider whitespace-nowrap max-w-[220px] truncate" title={`${cardFieldLabel(col, locale)} (${col.key})`}>
                    {cardFieldLabel(col, locale)}
                  </th>
                ))}
                <th className="w-px pl-1 pr-5 py-3.5">
                  <span className="sr-only">{t('landingLeads.viewDetail')}</span>
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-dk-surface divide-y divide-slate-100 dark:divide-dk-border">
              {(isLoading || groupsLoading) && items.length === 0 ? (
                <tr>
                  <td colSpan={colSpan} className="px-6 py-12 text-center text-sm text-slate-500 dark:text-dk-text2">
                    <span className="inline-block w-4 h-4 mr-2 align-[-2px] border-2 border-slate-300 dark:border-dk-border-strong border-t-orange-500 rounded-full animate-spin" />
                    {t('landingLeads.loading')}
                  </td>
                </tr>
              ) : null}

              {!isLoading && !groupsLoading && visibleItems.length === 0 ? (
                <tr>
                  <td colSpan={colSpan} className="px-6 py-16 text-center">
                    <HiOutlineSearch className="w-10 h-10 text-slate-300 dark:text-dk-muted mx-auto mb-2" />
                    {debouncedSearch ? (
                      <>
                        <p className="text-sm text-slate-500 dark:text-dk-text2">
                          {t('landingLeads.noMatchInPage', { query: debouncedSearch })}
                        </p>
                        <button
                          type="button"
                          onClick={() => setQuickSearch('')}
                          className="mt-3 text-xs font-semibold text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300 hover:underline"
                        >
                          {t('landingLeads.clearSearch')}
                        </button>
                      </>
                    ) : (
                      <>
                        <p className="text-sm text-slate-500 dark:text-dk-text2">{t('landingLeads.noRecords')}</p>
                        {appliedChips.length > 0 ? (
                          <button
                            type="button"
                            onClick={resetFilters}
                            className="mt-3 text-xs font-semibold text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300 hover:underline"
                          >
                            {t('landingLeads.clearFiltersToSeeAll')}
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
                const cmap = rowCustomMap(row);
                return (
                  <tr
                    key={row.id ?? row.leadId}
                    tabIndex={0}
                    onClick={(event) => {
                      if (event.target.closest('a, button')) return;
                      setSelectedLead(row);
                    }}
                    onKeyDown={(event) => {
                      if (event.target !== event.currentTarget) return;
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setSelectedLead(row);
                      }
                    }}
                    className="cursor-pointer hover:bg-slate-50/70 dark:hover:bg-dk-raised/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange-500/40 transition-colors"
                  >
                    <td className="pl-6 pr-3 py-4 text-xs sm:text-sm whitespace-nowrap max-w-[210px]">
                      <div className="flex items-center gap-2.5">
                        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-gradient-to-br from-orange-400 to-amber-500 text-white text-[11px] font-semibold shrink-0 shadow-2xs">
                          {initials}
                        </span>
                        <div className="min-w-0">
                          <p className="text-slate-900 dark:text-dk-text font-semibold truncate">{fullName || '—'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-4 text-xs sm:text-sm text-slate-700 dark:text-dk-text max-w-[200px]">
                      {row.email ? (
                        <div className="flex items-center gap-1.5 group">
                          <HiOutlineMail className="w-3.5 h-3.5 text-slate-400 dark:text-dk-muted shrink-0" />
                          <span className="truncate font-medium text-slate-800 dark:text-dk-text" title={row.email}>{row.email}</span>
                          <button
                            type="button"
                            onClick={() => handleCopy(row.email, t('landingLeads.email'))}
                            className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded text-slate-400 hover:text-orange-600 dark:hover:text-orange-400"
                            title={`${t('landingLeads.copy')} ${t('landingLeads.email')}`}
                          >
                            <HiOutlineClipboard className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-3 py-4 text-xs sm:text-sm text-slate-700 dark:text-dk-text whitespace-nowrap">
                      {row.phone ? (
                        <div className="flex items-center gap-1.5 group">
                          <HiOutlinePhone className="w-3.5 h-3.5 text-slate-400 dark:text-dk-muted shrink-0" />
                          <span className="font-medium text-slate-800 dark:text-dk-text">{row.phone}</span>
                          <button
                            type="button"
                            onClick={() => handleCopy(row.phone, t('landingLeads.phone'))}
                            className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded text-slate-400 hover:text-orange-600 dark:hover:text-orange-400"
                            title={`${t('landingLeads.copy')} ${t('landingLeads.phone')}`}
                          >
                            <HiOutlineClipboard className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-3 py-4 text-xs sm:text-sm text-slate-700 dark:text-dk-text whitespace-nowrap max-w-[150px]">
                      <span className="block truncate" title={row.occupation || ''}>{row.occupation || '—'}</span>
                    </td>
                    <td className="px-3 py-4 text-xs sm:text-sm text-slate-700 dark:text-dk-text whitespace-nowrap max-w-[150px]">
                      <span className="block truncate" title={row.interestArea || ''}>{row.interestArea || '—'}</span>
                    </td>
                    <td className="px-3 py-4 text-xs sm:text-sm text-center whitespace-nowrap">
                      <LandingLeadConsentBadge row={row} />
                    </td>
                    <td className="px-3 py-4 text-xs sm:text-sm text-slate-600 dark:text-dk-text whitespace-nowrap">
                      {formatSubmittedAt(row.registrationTime || row.createdAt, locale)}
                    </td>
                    {dynamicColumns.map((col) => {
                      const v = cmap.get(col.key);
                      const text = v == null || v === '' ? '—' : String(v);
                      return (
                        <td key={col.key} className="px-3 py-4 text-xs sm:text-sm text-slate-700 dark:text-dk-text max-w-[220px]">
                          <span className="block truncate" title={text}>{text}</span>
                        </td>
                      );
                    })}
                    <td className="w-px pl-1 pr-5 py-4 whitespace-nowrap text-right">
                      <button
                        type="button"
                        onClick={() => setSelectedLead(row)}
                        className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface text-slate-500 dark:text-dk-text2 hover:text-orange-600 dark:hover:text-orange-400 hover:bg-slate-50 dark:hover:bg-dk-raised transition-colors"
                        title={t('landingLeads.viewDetail')}
                        aria-label={t('landingLeads.viewDetail')}
                      >
                        <HiOutlineEye className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {totalPages > 1 ? (
          <div className="px-6 py-4 border-t border-slate-100 dark:border-dk-border bg-slate-50/50 dark:bg-dk-raised/30 flex items-center justify-between gap-3">
            <button
              type="button"
              disabled={page <= 1 || isLoading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-raised hover:bg-slate-50 dark:hover:bg-dk-surface text-xs font-semibold text-slate-700 dark:text-dk-text disabled:opacity-40 transition-colors shadow-2xs"
            >
              <HiOutlineChevronLeft className="w-4 h-4" />
              {t('landingLeads.previousPage')}
            </button>
            <span className="text-xs sm:text-sm font-semibold text-slate-600 dark:text-dk-text2">
              {page} / {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages || isLoading}
              onClick={() => setPage((p) => p + 1)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-raised hover:bg-slate-50 dark:hover:bg-dk-surface text-xs font-semibold text-slate-700 dark:text-dk-text disabled:opacity-40 transition-colors shadow-2xs"
            >
              {t('landingLeads.nextPage')}
              <HiOutlineChevronRight className="w-4 h-4" />
            </button>
          </div>
        ) : null}
      </div>

      <LandingLeadDetailModal
        lead={selectedLead}
        customDefs={customDefs}
        onClose={closeLeadDetail}
        onCopy={handleCopy}
      />
    </div>
  );
}

/* ───────── helpers ───────── */

function cardFieldLabel(col, locale = 'vi') {
  if (!col) return '';
  if (locale === 'en') return col.labelEn || col.labelVi || col.key;
  return col.labelVi || col.labelEn || col.key;
}

function formatSubmittedAt(raw, locale = 'vi') {
  try {
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hourCycle: 'h23' });
  } catch {
    return '—';
  }
}

function formatRelativeTime(raw, locale = 'vi') {
  const isEn = locale === 'en';
  try {
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return '';
    const now = Date.now();
    const diff = Math.floor((now - d.getTime()) / 1000);
    if (diff < 60) return isEn ? 'just now' : 'vừa xong';
    if (diff < 3600) {
      const n = Math.floor(diff / 60);
      return isEn ? `${n}m ago` : `${n} phút trước`;
    }
    if (diff < 86400) {
      const n = Math.floor(diff / 3600);
      return isEn ? `${n}h ago` : `${n} giờ trước`;
    }
    if (diff < 86400 * 7) {
      const n = Math.floor(diff / 86400);
      return isEn ? `${n}d ago` : `${n} ngày trước`;
    }
    return d.toLocaleDateString(isEn ? 'en-US' : 'vi-VN');
  } catch {
    return '';
  }
}

/**
 * Chip bộ lọc đang áp (BỎ slug — slug giờ là thẻ đang chọn, không còn trong drawer).
 */
function buildAppliedChips(filters, customDefs, t, locale = 'vi') {
  const isEn = locale === 'en';
  const chips = [];
  const cfs = Array.isArray(filters.landingLeadsCustomFilters) ? filters.landingLeadsCustomFilters : [];
  for (const cf of cfs) {
    const def = customDefs.find((d) => d.key === cf.key);
    const label = isEn ? (def?.labelEn || def?.labelVi || cf.key) : (def?.labelVi || cf.key);
    let display = String(cf.value ?? '');
    if (def && (def.type === 'select' || def.type === 'radio') && Array.isArray(def.options)) {
      const opt = def.options.find((o) => o.value === cf.value);
      if (opt) display = (isEn ? (opt.labelEn || opt.labelVi) : opt.labelVi) || opt.value;
    } else if (cf.value === 'true') {
      display = t('landingLeads.yes');
    } else if (cf.value === 'false') {
      display = t('landingLeads.no');
    }
    chips.push({ id: `cf-${cf.key}`, label, value: display });
  }
  return chips;
}
