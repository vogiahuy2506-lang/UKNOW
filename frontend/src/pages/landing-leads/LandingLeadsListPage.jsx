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
} from 'react-icons/hi';
import useLandingLeadsList from '../../features/landing/hooks/useLandingLeadsList.js';
import { LandingLeadsAdminFilters } from '../../features/landing/components/LandingLeadsAdminFilters.jsx';
import { fetchLandingLeadsCustomFieldDefinitions } from '../../features/landing/services/landingLeadsAdminApi.service.js';
import {
  getLeadFullName,
  getLeadInitials,
  renderCustomFieldsSummary,
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
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">{t('landingLeads.pageTitle')}</h1>
          <p className="text-sm text-gray-500 mt-1">{t('landingLeads.pageDescription')}</p>
        </div>
        <div className="flex gap-2">
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
      </div>

      {/* Filter card */}
      <LandingLeadsAdminFilters
        draftFilters={draftFilters}
        setDraftFilters={setDraftFilters}
        onApply={applyFilters}
        onReset={resetFilters}
        onExportExcel={handleExport}
        isExporting={isExporting}
      />

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
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
          <p className="text-sm text-gray-600">
            <span className="font-semibold text-gray-900">{total.toLocaleString('vi-VN')}</span> {t('landingLeads.records')}
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
                  {t('landingLeads.extraInfo')}
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {isLoading && items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-sm text-gray-500">
                    <span className="inline-block w-4 h-4 mr-2 align-[-2px] border-2 border-gray-300 border-t-orange-500 rounded-full animate-spin" />
                    {t('landingLeads.loading')}
                  </td>
                </tr>
              ) : null}

              {!isLoading && items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-16 text-center">
                    <HiOutlineSearch className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-gray-500">{t('landingLeads.noRecords')}</p>
                    {appliedChips.length > 0 ? (
                      <button
                        type="button"
                        onClick={resetFilters}
                        className="mt-3 text-xs text-orange-600 hover:underline"
                      >
                        Xoá bộ lọc để thấy tất cả
                      </button>
                    ) : null}
                  </td>
                </tr>
              ) : null}

              {items.map((row) => {
                const fullName = getLeadFullName(row);
                const initials = getLeadInitials(row);
                const cfSummary = renderCustomFieldsSummary(row.customFields, customDefs, 'vi');
                const publicUrl = row.landingPageSlug
                  ? `${window.location.origin}/${row.landingPageSlug}`
                  : null;
                return (
                  <tr key={row.id ?? row.leadId} className="hover:bg-gray-50/80 transition-colors">
                    <td className="px-4 py-3 text-sm whitespace-nowrap">
                      <div className="flex items-center gap-2.5">
                        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-gradient-to-br from-orange-400 to-red-500 text-white text-[11px] font-semibold shrink-0">
                          {initials}
                        </span>
                        <div className="min-w-0">
                          <p className="text-gray-900 font-medium truncate">{fullName || '—'}</p>
                          {row.registrationTime || row.createdAt ? (
                            <p className="text-[11px] text-gray-400 truncate">
                              {formatRelativeTime(row.registrationTime || row.createdAt)}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 max-w-[240px]">
                      {row.email ? (
                        <div className="flex items-center gap-1.5 group">
                          <HiOutlineMail className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                          <span className="truncate" title={row.email}>{row.email}</span>
                          <button
                            type="button"
                            onClick={() => handleCopy(row.email, 'email')}
                            className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded text-gray-400 hover:text-orange-600"
                            title="Copy email"
                          >
                            <HiOutlineClipboard className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">
                      {row.phone ? (
                        <div className="flex items-center gap-1.5 group">
                          <HiOutlinePhone className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                          <span>{row.phone}</span>
                          <button
                            type="button"
                            onClick={() => handleCopy(row.phone, 'SĐT')}
                            className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded text-gray-400 hover:text-orange-600"
                            title="Copy SĐT"
                          >
                            <HiOutlineClipboard className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">
                      {row.landingPageSlug ? (
                        <a
                          href={publicUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-gray-100 hover:bg-orange-50 hover:text-orange-700 transition-colors font-medium"
                          title={publicUrl}
                        >
                          /{row.landingPageSlug}
                          <HiOutlineExternalLink className="w-3 h-3 opacity-60" />
                        </a>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 max-w-[280px]">
                      {cfSummary ? (
                        <p className="truncate" title={cfSummary}>{cfSummary}</p>
                      ) : (
                        <span className="text-gray-400 italic text-xs">{t('landingLeads.extraEmpty')}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {totalPages > 1 ? (
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
  const occLabels = {
    student: 'Sinh viên', freelancer: 'Freelancer', employee: 'Nhân viên',
    manager: 'Quản lý', founder: 'Founder', other: 'Khác',
  };
  const intLabels = {
    marketing: 'Marketing', tech: 'Tech / IT', design: 'Thiết kế',
    sales: 'Sales', content: 'Content / Sáng tạo', finance: 'Tài chính',
  };
  const occ = Array.isArray(filters.landingLeadsOccupations) ? filters.landingLeadsOccupations : [];
  if (occ.length > 0) {
    chips.push({
      id: 'occ',
      label: t('landingLeads.occupationLabel'),
      value: occ.map((v) => occLabels[v] || v).join(', '),
    });
  }
  const ints = Array.isArray(filters.landingLeadsInterests) ? filters.landingLeadsInterests : [];
  if (ints.length > 0) {
    chips.push({
      id: 'ints',
      label: t('landingLeads.interestLabel'),
      value: ints.map((v) => intLabels[v] || v).join(', '),
    });
  }
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
