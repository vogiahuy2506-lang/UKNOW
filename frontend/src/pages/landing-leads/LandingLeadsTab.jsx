import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
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
  HiOutlineViewGrid,
  HiOutlineViewList,
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
 * Tab "Từ landing page" — MỖI THẺ = 1 LANDING.
 * Bấm vào thẻ → mở Modal chi tiết của landing đó, bên trong chọn 2 kiểu:
 * Thẻ (Cards) hoặc Danh sách (Table). Cột động = toàn bộ trường riêng của form
 * landing đó (bao nhiêu trường thì bấy nhiêu cột). Không còn cột cố định
 * Nghề nghiệp / Lĩnh vực quan tâm.
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
  // Modal chi tiết theo thẻ: bấm thẻ nào → mở modal của thẻ đó.
  const [groupModalSlug, setGroupModalSlug] = useState(null);
  const [groupViewMode, setGroupViewMode] = useState('table'); // 'table' | 'cards'
  const closeGroupModal = useCallback(() => setGroupModalSlug(null), []);

  const openGroupModal = useCallback((slug) => {
    selectSlug(slug);
    setGroupModalSlug(slug);
    setGroupViewMode('table');
  }, [selectSlug]);

  const [quickSearch, setQuickSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(quickSearch.trim().toLowerCase()), 250);
    return () => clearTimeout(id);
  }, [quickSearch]);

  // Reset tìm nhanh khi đổi thẻ / mở modal khác.
  useEffect(() => {
    setQuickSearch('');
    setDebouncedSearch('');
    setPage(1);
  }, [selectedSlug, groupModalSlug, setPage]);

  // Đóng modal nhóm bằng Escape.
  useEffect(() => {
    if (!groupModalSlug) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setGroupModalSlug(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [groupModalSlug]);

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
  const modalGroup = useMemo(
    () => (groups || []).find((g) => g.slug === groupModalSlug) || selectedGroup || null,
    [groups, groupModalSlug, selectedGroup]
  );
  const dynamicColumns = useMemo(
    () => (Array.isArray(modalGroup?.customKeys) ? modalGroup.customKeys : []),
    [modalGroup]
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
      return false;
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

  const fixedColCount = 5; // Họ tên, Email, SĐT, Đồng ý, Ngày ĐK (đã bỏ Nghề/Lĩnh vực)
  const colSpan = fixedColCount + dynamicColumns.length + 1;
  const modalTitle = modalGroup
    ? (modalGroup.slug === UNKNOWN_SLUG ? t('landingLeads.unknownGroup') : (modalGroup.title || `/${modalGroup.slug}`))
    : '';

  return (
    <div className="space-y-6">
      <PageHeaderActions>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => reload()}
            disabled={isLoading || groupsLoading}
            className="btn btn-secondary"
          >
            <HiOutlineRefresh className={`w-4 h-4 mr-1.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>{t('landingLeads.refresh')}</span>
          </button>
        </div>
      </PageHeaderActions>

      {/* Thẻ từng Landing — bấm vào để mở Modal chi tiết */}
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
                  onClick={() => openGroupModal(g.slug)}
                  title={t('landingLeads.openDetailTitle')}
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
                  <p className="mt-2 text-[11px] font-semibold text-orange-600 dark:text-orange-400">{t('landingLeads.openDetailTitle')} →</p>
                </button>
              );
            })}
          </div>
        ) : null}
      </section>

      {/* Modal chi tiết của thẻ đang chọn — 2 kiểu Thẻ / Danh sách */}
      {groupModalSlug ? createPortal(
        <div
          className="fixed inset-0 z-[9990] flex items-center justify-center p-3 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="landing-group-modal-title"
          data-testid="landing-group-modal"
        >
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={closeGroupModal} aria-hidden="true" />
          <div className="relative z-10 w-full max-w-6xl max-h-[90vh] flex flex-col rounded-2xl bg-white dark:bg-dk-surface border border-slate-200/90 dark:border-dk-border shadow-2xl overflow-hidden">
            {/* Header modal */}
            <div className="flex flex-wrap items-center gap-3 px-5 py-4 border-b border-slate-100 dark:border-dk-border bg-slate-50/80 dark:bg-dk-raised/60">
              <div className="min-w-0 flex-1">
                <h3 id="landing-group-modal-title" className="text-base font-bold text-slate-900 dark:text-dk-text truncate" title={modalTitle}>
                  {modalTitle}
                </h3>
                <p className="text-xs text-slate-500 dark:text-dk-text2">
                  <span className="font-bold text-slate-900 dark:text-dk-text">{total.toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN')}</span> {t('landingLeads.records')}
                  {modalGroup && modalGroup.slug !== UNKNOWN_SLUG ? <span className="ml-1">· /{modalGroup.slug}</span> : null}
                </p>
              </div>
              {/* Toggle Thẻ / Danh sách */}
              <div className="inline-flex rounded-xl border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-inset p-1" role="tablist" aria-label={t('landingLeads.viewModeLabel')}>
                <button
                  type="button"
                  role="tab"
                  aria-selected={groupViewMode === 'table'}
                  onClick={() => setGroupViewMode('table')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${groupViewMode === 'table' ? 'bg-orange-500 text-white shadow' : 'text-slate-600 dark:text-dk-text2 hover:bg-slate-100 dark:hover:bg-dk-raised'}`}
                >
                  <HiOutlineViewList className="w-4 h-4" />
                  {t('landingLeads.viewModeTable')}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={groupViewMode === 'cards'}
                  onClick={() => setGroupViewMode('cards')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${groupViewMode === 'cards' ? 'bg-orange-500 text-white shadow' : 'text-slate-600 dark:text-dk-text2 hover:bg-slate-100 dark:hover:bg-dk-raised'}`}
                >
                  <HiOutlineViewGrid className="w-4 h-4" />
                  {t('landingLeads.viewModeCards')}
                </button>
              </div>
              <button
                type="button"
                onClick={closeGroupModal}
                aria-label={t('common.close')}
                className="rounded-xl p-2 text-slate-400 dark:text-dk-muted hover:text-slate-700 dark:hover:text-dk-text hover:bg-slate-100 dark:hover:bg-dk-raised transition-colors"
              >
                <HiOutlineX className="w-5 h-5" />
              </button>
            </div>

            {/* Toolbar modal: tìm kiếm + lọc + xuất file */}
            <div className="flex flex-wrap items-center gap-2 px-5 py-3 border-b border-slate-100 dark:border-dk-border">
              <LandingLeadsAdminFilters
                draftFilters={draftFilters}
                setDraftFilters={setDraftFilters}
                onApply={applyFilters}
                onReset={resetFilters}
                appliedCount={appliedCount}
                hideSlugSource
              />
              <div className="relative min-w-0 flex-1 sm:max-w-xs sm:ml-auto">
                <HiOutlineSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-dk-muted" />
                <input
                  type="search"
                  value={quickSearch}
                  onChange={(e) => setQuickSearch(e.target.value)}
                  placeholder={t('landingLeads.quickSearchPlaceholder')}
                  className="w-full rounded-xl border border-slate-200 dark:border-dk-border bg-slate-50 dark:bg-dk-inset py-2 pl-9 pr-8 text-xs text-slate-800 dark:text-dk-text focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
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
              <button
                type="button"
                onClick={() => reload()}
                disabled={isLoading}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-dk-border text-xs font-semibold text-slate-700 dark:text-dk-text disabled:opacity-50"
              >
                <HiOutlineRefresh className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                <span>{t('landingLeads.refresh')}</span>
              </button>
            </div>

            {appliedChips.length > 0 || dateRangeText ? (
              <div className="flex flex-wrap items-center gap-2 px-5 py-2 border-b border-slate-100 dark:border-dk-border">
                <span className="text-xs font-medium text-gray-500 dark:text-dk-text2 uppercase tracking-wide">{t('landingLeads.filteringLabel')}</span>
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
                  {t('landingLeads.clearAll')}
                </button>
              </div>
            ) : null}

            {errorMessage ? (
              <div className="mx-5 mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                {errorMessage}
              </div>
            ) : null}

            {/* Nội dung modal: Thẻ hoặc Danh sách */}
            <div className="flex-1 overflow-y-auto">
              {groupViewMode === 'table' ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-100 dark:divide-dk-border">
                    <thead className="bg-slate-50/80 dark:bg-dk-raised/50 sticky top-0">
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
                            <span className="inline-block w-4 h-4 mr-2 align-[-2px] border-2 border-slate-300 border-t-orange-500 rounded-full animate-spin" />
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
                                  className="mt-3 text-xs font-semibold text-orange-600 hover:underline"
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
                                    className="mt-3 text-xs font-semibold text-orange-600 hover:underline"
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
                            className="cursor-pointer hover:bg-slate-50/70 dark:hover:bg-dk-raised/40 transition-colors"
                          >
                            <td className="pl-6 pr-3 py-4 text-xs sm:text-sm whitespace-nowrap max-w-[210px]">
                              <div className="flex items-center gap-2.5">
                                <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-gradient-to-br from-orange-400 to-amber-500 text-white text-[11px] font-semibold shrink-0 shadow-2xs">
                                  {initials}
                                </span>
                                <p className="text-slate-900 dark:text-dk-text font-semibold truncate">{fullName || '—'}</p>
                              </div>
                            </td>
                            <td className="px-3 py-4 text-xs sm:text-sm max-w-[200px]">
                              {row.email ? (
                                <div className="flex items-center gap-1.5 group">
                                  <HiOutlineMail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                  <span className="truncate font-medium text-slate-800 dark:text-dk-text" title={row.email}>{row.email}</span>
                                  <button
                                    type="button"
                                    onClick={() => handleCopy(row.email, t('landingLeads.email'))}
                                    className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded text-slate-400 hover:text-orange-600"
                                    title={`${t('landingLeads.copy')} ${t('landingLeads.email')}`}
                                  >
                                    <HiOutlineClipboard className="w-3 h-3" />
                                  </button>
                                </div>
                              ) : '—'}
                            </td>
                            <td className="px-3 py-4 text-xs sm:text-sm whitespace-nowrap">
                              {row.phone ? (
                                <div className="flex items-center gap-1.5 group">
                                  <HiOutlinePhone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                  <span className="font-medium text-slate-800 dark:text-dk-text">{row.phone}</span>
                                  <button
                                    type="button"
                                    onClick={() => handleCopy(row.phone, t('landingLeads.phone'))}
                                    className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded text-slate-400 hover:text-orange-600"
                                    title={`${t('landingLeads.copy')} ${t('landingLeads.phone')}`}
                                  >
                                    <HiOutlineClipboard className="w-3 h-3" />
                                  </button>
                                </div>
                              ) : '—'}
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
                                className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-slate-200 dark:border-dk-border text-slate-500 hover:text-orange-600 transition-colors"
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
              ) : (
                <div className="p-5 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                  {(isLoading || groupsLoading) && items.length === 0 ? (
                    <p className="col-span-full text-center text-sm text-slate-500 py-10">{t('landingLeads.loading')}</p>
                  ) : null}
                  {!isLoading && !groupsLoading && visibleItems.length === 0 ? (
                    <div className="col-span-full text-center py-12">
                      <HiOutlineSearch className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                      <p className="text-sm text-slate-500">{debouncedSearch ? t('landingLeads.noMatchInPage', { query: debouncedSearch }) : t('landingLeads.noRecords')}</p>
                    </div>
                  ) : null}
                  {visibleItems.map((row) => {
                    const fullName = getLeadFullName(row);
                    const initials = getLeadInitials(row);
                    const cmap = rowCustomMap(row);
                    return (
                      <button
                        key={row.id ?? row.leadId}
                        type="button"
                        onClick={() => setSelectedLead(row)}
                        className="text-left rounded-2xl border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface p-4 hover:border-orange-300 hover:bg-orange-50/40 transition-all"
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-gradient-to-br from-orange-400 to-amber-500 text-white text-xs font-bold shrink-0">
                            {initials}
                          </span>
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-slate-900 dark:text-dk-text truncate">{fullName || '—'}</p>
                            <p className="text-[11px] text-slate-400 truncate">{formatSubmittedAt(row.registrationTime || row.createdAt, locale)}</p>
                          </div>
                        </div>
                        {(row.email || row.phone) ? (
                          <p className="mt-2 text-xs text-slate-600 dark:text-dk-text2 truncate">
                            {[row.email, row.phone].filter(Boolean).join(' · ')}
                          </p>
                        ) : null}
                        <dl className="mt-2 space-y-1">
                          {dynamicColumns.map((col) => {
                            const v = cmap.get(col.key);
                            const text = v == null || v === '' ? '—' : String(v);
                            return (
                              <div key={col.key} className="flex gap-1.5 text-xs">
                                <dt className="shrink-0 font-semibold text-slate-500 dark:text-dk-text2 max-w-[45%] truncate" title={cardFieldLabel(col, locale)}>{cardFieldLabel(col, locale)}:</dt>
                                <dd className="min-w-0 flex-1 text-slate-800 dark:text-dk-text break-words" title={text}>{text}</dd>
                              </div>
                            );
                          })}
                          {dynamicColumns.length === 0 ? (
                            <p className="text-[11px] italic text-slate-400">{t('landingLeads.basicOnly')}</p>
                          ) : null}
                        </dl>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {totalPages > 1 ? (
              <div className="px-5 py-3 border-t border-slate-100 dark:border-dk-border bg-slate-50/50 flex items-center justify-between gap-3">
                <button
                  type="button"
                  disabled={page <= 1 || isLoading}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold disabled:opacity-40"
                >
                  <HiOutlineChevronLeft className="w-4 h-4" />
                  {t('landingLeads.previousPage')}
                </button>
                <span className="text-xs font-semibold text-slate-600">
                  {page} / {totalPages}
                </span>
                <button
                  type="button"
                  disabled={page >= totalPages || isLoading}
                  onClick={() => setPage((p) => p + 1)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold disabled:opacity-40"
                >
                  {t('landingLeads.nextPage')}
                  <HiOutlineChevronRight className="w-4 h-4" />
                </button>
              </div>
            ) : null}
          </div>
        </div>,
        document.body
      ) : null}

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
  if (typeof col === 'string') return col;
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
