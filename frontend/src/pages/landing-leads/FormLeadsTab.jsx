import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  HiOutlineChevronLeft,
  HiOutlineChevronRight,
  HiOutlineEye,
  HiOutlineInbox,
  HiOutlineRefresh,
  HiOutlineX,
} from 'react-icons/hi';
import { useI18n } from '../../i18n';
import { fetchForms, fetchWorkspaceSubmissions } from '../../features/forms/services/formAdminApi.service.js';
import FormLeadDetailModal from './FormLeadDetailModal.jsx';
import FormLeadStatusBadge from './FormLeadStatusBadge.jsx';

const PAGE_SIZE = 20;
const VIETNAM_TIME_ZONE = 'Asia/Ho_Chi_Minh';

const FILTER_INPUT_CLASS =
  'w-full rounded-xl border border-slate-200 dark:border-dk-border bg-slate-50 dark:bg-dk-inset py-2 px-3 text-xs text-slate-800 dark:text-dk-text focus:border-orange-500 focus:bg-white dark:focus:bg-dk-inset focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all';

function formatSubmittedAt(raw) {
  if (!raw) return '—';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return '—';
  // Luôn theo giờ Việt Nam, không phụ thuộc múi giờ trình duyệt (khớp bộ lọc ngày ở backend).
  return date.toLocaleString('vi-VN', {
    timeZone: VIETNAM_TIME_ZONE,
    hourCycle: 'h23',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const TH_CLASS = 'px-3 py-3.5 text-left text-[11px] font-bold text-slate-500 dark:text-dk-text2 uppercase tracking-wider';

/**
 * Tab "Từ biểu mẫu" của màn "Khách để lại thông tin": bài nộp của MỌI biểu mẫu trong workspace
 * (`GET /api/forms/submissions`), mới nhất trước. Bảng gọn — Thời gian · Người nộp · Biểu mẫu · Nguồn ·
 * Trạng thái · Hành động — chi tiết đầy đủ (mọi câu trả lời theo nhãn trường) nằm trong modal.
 */
export default function FormLeadsTab() {
  const { t } = useI18n();

  const [forms, setForms] = useState([]);
  const [formFilter, setFormFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);

  const [data, setData] = useState({ items: [], total: 0, page: 1, limit: PAGE_SIZE });
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
  const [selected, setSelected] = useState(null);
  const closeDetail = useCallback(() => setSelected(null), []);

  // Danh sách biểu mẫu: vừa làm ô lọc vừa tra nhãn/thứ tự trường cho modal. Lỗi thì thôi — bảng vẫn dùng được.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await fetchForms();
        if (!cancelled) setForms(Array.isArray(list) ? list : []);
      } catch {
        if (!cancelled) setForms([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const hasInvalidRange = Boolean(dateFrom && dateTo && dateFrom > dateTo);

  useEffect(() => {
    if (hasInvalidRange) {
      setIsLoading(false);
      return undefined;
    }
    let cancelled = false;
    setIsLoading(true);
    setErrorMessage('');
    (async () => {
      try {
        const result = await fetchWorkspaceSubmissions({
          page,
          limit: PAGE_SIZE,
          formId: formFilter || undefined,
          from: dateFrom || undefined,
          to: dateTo || undefined,
        });
        if (cancelled) return;
        setData({
          items: Array.isArray(result.items) ? result.items : [],
          total: Number(result.total) || 0,
          page: Number(result.page) || page,
          limit: Number(result.limit) || PAGE_SIZE,
        });
      } catch (error) {
        if (cancelled) return;
        setData({ items: [], total: 0, page, limit: PAGE_SIZE });
        setErrorMessage(error?.response?.data?.message || t('landingLeads.formsTab.loadError'));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [page, formFilter, dateFrom, dateTo, hasInvalidRange, reloadToken, t]);

  const formsById = useMemo(() => new Map(forms.map((form) => [String(form.id), form])), [forms]);
  const selectedFormFields = selected ? formsById.get(String(selected.formId))?.fields : undefined;

  const totalPages = Math.max(1, Math.ceil(data.total / (data.limit || PAGE_SIZE)));
  const hasFilters = Boolean(formFilter || dateFrom || dateTo);

  const changeFormFilter = (value) => {
    setFormFilter(value);
    setPage(1);
  };
  const changeDateFrom = (value) => {
    setDateFrom(value);
    setPage(1);
  };
  const changeDateTo = (value) => {
    setDateTo(value);
    setPage(1);
  };
  const resetFilters = () => {
    setFormFilter('');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  };

  return (
    <div className="space-y-6">
      {/* Bộ lọc: biểu mẫu · khoảng ngày (giờ VN) */}
      <div className="flex flex-wrap items-end gap-3">
        <label className="block min-w-0 w-full sm:w-64">
          <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-dk-text2">
            {t('landingLeads.formsTab.filterForm')}
          </span>
          <select
            value={formFilter}
            onChange={(e) => changeFormFilter(e.target.value)}
            className={FILTER_INPUT_CLASS}
          >
            <option value="">{t('landingLeads.formsTab.allForms')}</option>
            {forms.map((form) => (
              <option key={form.id} value={String(form.id)}>
                {form.title}
              </option>
            ))}
          </select>
        </label>
        <label className="block w-[calc(50%-0.375rem)] sm:w-40">
          <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-dk-text2">
            {t('landingLeads.formsTab.filterFrom')}
          </span>
          <input
            type="date"
            value={dateFrom}
            max={dateTo || undefined}
            onChange={(e) => changeDateFrom(e.target.value)}
            className={FILTER_INPUT_CLASS}
          />
        </label>
        <label className="block w-[calc(50%-0.375rem)] sm:w-40">
          <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-dk-text2">
            {t('landingLeads.formsTab.filterTo')}
          </span>
          <input
            type="date"
            value={dateTo}
            min={dateFrom || undefined}
            onChange={(e) => changeDateTo(e.target.value)}
            className={FILTER_INPUT_CLASS}
          />
        </label>
        {hasFilters ? (
          <button
            type="button"
            onClick={resetFilters}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-raised hover:bg-slate-50 dark:hover:bg-dk-surface text-xs font-semibold text-slate-700 dark:text-dk-text transition-colors"
          >
            <HiOutlineX className="w-3.5 h-3.5" />
            {t('landingLeads.formsTab.clearFilters')}
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => setReloadToken((n) => n + 1)}
          disabled={isLoading}
          className="inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-raised hover:bg-slate-50 dark:hover:bg-dk-surface text-xs font-semibold text-slate-700 dark:text-dk-text transition-colors shadow-2xs disabled:opacity-50 sm:ml-auto"
        >
          <HiOutlineRefresh className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          <span>{t('landingLeads.refresh')}</span>
        </button>
      </div>

      {hasInvalidRange ? (
        <div role="alert" className="rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
          {t('landingLeads.formsTab.invalidRange')}
        </div>
      ) : null}

      {errorMessage ? (
        <div role="alert" className="rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/40 px-4 py-3 text-sm text-red-800 dark:text-red-300">
          {errorMessage}
        </div>
      ) : null}

      <div className="rounded-2xl border border-slate-200/90 dark:border-dk-border bg-white dark:bg-dk-surface shadow-2xs overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b border-slate-100 dark:border-dk-border flex items-center justify-between gap-3 bg-slate-50/50 dark:bg-dk-raised/30">
          <p className="text-xs sm:text-sm text-slate-600 dark:text-dk-text2">
            <span className="font-bold text-slate-900 dark:text-dk-text">{data.total.toLocaleString('vi-VN')}</span>{' '}
            {t('landingLeads.records')}
          </p>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-dk-text2 font-medium">
            {t('landingLeads.pageOf', { page, total: totalPages })}
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100 dark:divide-dk-border">
            <thead className="bg-slate-50/80 dark:bg-dk-raised/50">
              <tr>
                <th className={`pl-6 ${TH_CLASS} whitespace-nowrap hidden sm:table-cell`}>{t('landingLeads.formsTab.colTime')}</th>
                <th className={`pl-4 sm:pl-3 ${TH_CLASS}`}>{t('landingLeads.formsTab.colRespondent')}</th>
                <th className={`${TH_CLASS} hidden xl:table-cell`}>{t('landingLeads.formsTab.colForm')}</th>
                <th className={`${TH_CLASS} hidden xl:table-cell`}>{t('landingLeads.formsTab.colSource')}</th>
                <th className={`${TH_CLASS} hidden sm:table-cell`}>{t('landingLeads.formsTab.colStatus')}</th>
                <th className={`${TH_CLASS} pr-4 sm:pr-6 text-right whitespace-nowrap`}>{t('landingLeads.formsTab.colActions')}</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-dk-surface divide-y divide-slate-100 dark:divide-dk-border">
              {isLoading && data.items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-sm text-slate-500 dark:text-dk-text2">
                    <span className="inline-block w-4 h-4 mr-2 align-[-2px] border-2 border-slate-300 dark:border-dk-border-strong border-t-orange-500 rounded-full animate-spin" />
                    {t('landingLeads.formsTab.loading')}
                  </td>
                </tr>
              ) : null}

              {!isLoading && data.items.length === 0 && !hasInvalidRange ? (
                <tr>
                  <td colSpan={6} className="px-6 py-16 text-center">
                    <HiOutlineInbox className="w-10 h-10 text-slate-300 dark:text-dk-muted mx-auto mb-2" />
                    <p className="text-sm text-slate-500 dark:text-dk-text2">
                      {hasFilters ? t('landingLeads.formsTab.emptyFiltered') : t('landingLeads.formsTab.empty')}
                    </p>
                    {hasFilters ? (
                      <button
                        type="button"
                        onClick={resetFilters}
                        className="mt-3 text-xs font-semibold text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300 hover:underline"
                      >
                        {t('landingLeads.formsTab.clearFilters')}
                      </button>
                    ) : null}
                  </td>
                </tr>
              ) : null}

              {data.items.map((row) => (
                <tr
                  key={row.id}
                  tabIndex={0}
                  data-testid="form-lead-row"
                  onClick={(event) => {
                    // Bấm vào link/nút trong dòng thì để chúng tự xử lý.
                    if (event.target.closest('a, button')) return;
                    setSelected(row);
                  }}
                  onKeyDown={(event) => {
                    if (event.target !== event.currentTarget) return;
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setSelected(row);
                    }
                  }}
                  className="cursor-pointer hover:bg-slate-50/70 dark:hover:bg-dk-raised/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange-500/40 transition-colors"
                >
                  <td className="pl-6 pr-3 py-4 text-xs text-slate-500 dark:text-dk-text2 whitespace-nowrap hidden sm:table-cell">
                    {formatSubmittedAt(row.createdAt)}
                  </td>
                  <td className="pl-4 sm:pl-3 pr-3 py-4 text-xs sm:text-sm max-w-[220px]">
                    <p className="truncate font-semibold text-slate-900 dark:text-dk-text">
                      {row.respondentName || (
                        <span className="italic font-normal text-slate-400 dark:text-dk-muted">{t('landingLeads.formsTab.notProvided')}</span>
                      )}
                    </p>
                    {row.respondentEmail || row.respondentPhone ? (
                      <p className="truncate text-[11px] text-slate-500 dark:text-dk-text2" title={row.respondentEmail || row.respondentPhone}>
                        {[row.respondentEmail, row.respondentPhone].filter(Boolean).join(' · ')}
                      </p>
                    ) : null}
                    <p className="truncate text-[11px] text-slate-400 dark:text-dk-muted xl:hidden">{row.formTitle}</p>
                    <p className="text-[11px] text-slate-400 dark:text-dk-muted sm:hidden">{formatSubmittedAt(row.createdAt)}</p>
                    {/* Điện thoại: bảng chỉ còn 2 cột (Người nộp · Hành động) nên trạng thái xuống dưới tên, khỏi phải cuộn ngang. */}
                    <div className="mt-1 sm:hidden">
                      <FormLeadStatusBadge submission={row} />
                    </div>
                  </td>
                  <td className="px-3 py-4 text-xs sm:text-sm text-slate-700 dark:text-dk-text max-w-[160px] hidden xl:table-cell">
                    <p className="truncate" title={row.formTitle}>{row.formTitle || '—'}</p>
                  </td>
                  <td className="px-3 py-4 text-xs text-slate-700 dark:text-dk-text max-w-[140px] hidden xl:table-cell">
                    {row.landingPageSlug || row.utmSource ? (
                      <div className="min-w-0 space-y-0.5">
                        {row.landingPageSlug ? (
                          <p className="truncate font-mono" title={row.landingPageSlug}>/{row.landingPageSlug}</p>
                        ) : null}
                        {row.utmSource ? (
                          <p className="truncate text-[11px] text-slate-500 dark:text-dk-text2">{row.utmSource}</p>
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-slate-400 dark:text-dk-muted">—</span>
                    )}
                  </td>
                  <td className="px-3 py-4 whitespace-nowrap hidden sm:table-cell">
                    <FormLeadStatusBadge submission={row} />
                  </td>
                  <td className="pl-1 pr-4 sm:pr-6 py-4 whitespace-nowrap text-right">
                    <button
                      type="button"
                      onClick={() => setSelected(row)}
                      className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface text-slate-500 dark:text-dk-text2 hover:text-orange-600 dark:hover:text-orange-400 hover:bg-slate-50 dark:hover:bg-dk-raised transition-colors"
                      title={t('landingLeads.formsTab.viewDetail')}
                      aria-label={t('landingLeads.formsTab.viewDetail')}
                    >
                      <HiOutlineEye className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 ? (
          <div className="px-4 sm:px-6 py-4 border-t border-slate-100 dark:border-dk-border bg-slate-50/50 dark:bg-dk-raised/30 flex items-center justify-between gap-3">
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

      <FormLeadDetailModal submission={selected} formFields={selectedFormFields} onClose={closeDetail} />
    </div>
  );
}
