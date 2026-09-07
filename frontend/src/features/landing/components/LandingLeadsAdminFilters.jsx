import {
  memo,
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  HiOutlineFilter,
  HiOutlineX,
  HiOutlineSearch,
  HiOutlineCalendar,
} from 'react-icons/hi';
import { fetchLandingLeadsSlugFilterOptions } from '../utils/landingLeadsSlugFilterOptions.js';
import { fetchLandingLeadsCustomFieldDefinitions } from '../services/landingLeadsAdminApi.service.js';
import { useI18n } from '../../../i18n';

/* ───────────────────────── atoms ───────────────────────── */

/**
 * Một dòng checkbox — tách memo để giảm re-render cho danh sách dài.
 */
const FilterCheckboxRow = memo(function FilterCheckboxRow({ value, label, checked, onToggle }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
      <input
        type="checkbox"
        checked={checked}
        onChange={() => onToggle(value)}
        className="h-4 w-4 shrink-0 rounded border-gray-300"
      />
      <span className="min-w-0 break-words">{label}</span>
    </label>
  );
});

/**
 * Nhãn hiển thị (Đang chọn / Tổng) cho từng khối lọc nhiều lựa chọn.
 */
function CounterBadge({ selected, total }) {
  return (
    <span className="ml-1.5 text-[11px] font-normal text-gray-400">
      ({selected}/{total})
    </span>
  );
}

/* ───────────────── multi-select block ───────────────── */

/**
 * Khối lọc nhiều lựa chọn với ô tìm nhanh + chọn tất cả / bỏ chọn.
 *
 * @param {object} props
 * @param {string} props.title
 * @param {{ value: string, labelVi: string }[]} props.options
 * @param {'landingLeadsSlugs'} props.fieldKey
 * @param {string[]} props.selected
 * @param {function} props.setDraftFilters
 * @param {boolean} [props.searchable]
 */
function MultiFilterBlock({
  title,
  options,
  fieldKey,
  selected,
  setDraftFilters,
  isLoading = false,
  searchable = false,
}) {
  const { t } = useI18n();
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const total = options.length;

  const [search, setSearch] = useState('');
  const visibleOptions = useMemo(() => {
    if (!searchable || !search.trim()) return options;
    const q = search.trim().toLowerCase();
    return options.filter((o) => String(o.labelVi || o.value).toLowerCase().includes(q));
  }, [options, search, searchable]);

  const toggleOne = useCallback(
    (value) => {
      setDraftFilters((prev) => {
        const arr = Array.isArray(prev[fieldKey]) ? [...prev[fieldKey]] : [];
        const i = arr.indexOf(value);
        if (i >= 0) arr.splice(i, 1);
        else arr.push(value);
        return { ...prev, [fieldKey]: arr };
      });
    },
    [fieldKey, setDraftFilters]
  );

  const selectAll = useCallback(() => {
    startTransition(() => {
      setDraftFilters((prev) => ({ ...prev, [fieldKey]: options.map((o) => o.value) }));
    });
  }, [fieldKey, options, setDraftFilters]);

  const clearAll = useCallback(() => {
    startTransition(() => {
      setDraftFilters((prev) => ({ ...prev, [fieldKey]: [] }));
    });
  }, [fieldKey, setDraftFilters]);

  const isAllSelected = total > 0 && selectedSet.size === total;

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium text-gray-700">
          {title}
          <CounterBadge selected={selectedSet.size} total={total} />
        </span>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={isAllSelected ? clearAll : selectAll}
            disabled={isLoading || total === 0}
            className="rounded border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-40"
          >
            {isAllSelected ? t('landingLeads.deselectAll') : t('landingLeads.selectAll')}
          </button>
          {selectedSet.size > 0 ? (
            <button
              type="button"
              onClick={clearAll}
              className="rounded border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-500 shadow-sm hover:bg-gray-50"
            >
              {t('landingLeads.clearThis')}
            </button>
          ) : null}
        </div>
      </div>

      {searchable && options.length > 6 ? (
        <div className="relative mb-2">
          <HiOutlineSearch className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('landingLeads.searchOptionPlaceholder')}
            className="w-full rounded-lg border border-gray-200 bg-white py-1.5 pl-8 pr-2 text-xs placeholder-gray-400 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-200"
          />
        </div>
      ) : null}

      <div className="max-h-44 space-y-2 overflow-y-auto rounded-lg border border-gray-200 p-3 [content-visibility:auto]">
        {isLoading ? (
          <p className="text-xs text-gray-400 italic py-2 text-center">{t('landingLeads.loadingOptions')}</p>
        ) : visibleOptions.length === 0 ? (
          <p className="text-xs text-gray-400 italic py-2 text-center">{t('landingLeads.noOptionsMatch')}</p>
        ) : (
          visibleOptions.map((opt) => (
            <FilterCheckboxRow
              key={opt.value}
              value={opt.value}
              label={opt.labelVi}
              checked={selectedSet.has(opt.value)}
              onToggle={toggleOne}
            />
          ))
        )}
      </div>
    </div>
  );
}

/* ───────────────── date presets ───────────────── */

/**
 * Quick presets cho khoảng ngày: hôm nay / 7 ngày / 30 ngày / xoá.
 *
 * Trả về object `{ from, to }` theo timezone local (YYYY-MM-DD).
 */
function buildDateRange(preset) {
  const today = new Date();
  const fmt = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  const to = fmt(today);
  if (preset === 'today') return { from: to, to };
  const days = preset === '7d' ? 6 : preset === '30d' ? 29 : null;
  if (days == null) return { from: '', to: '' };
  const from = new Date(today.getTime() - days * 86400 * 1000);
  return { from: fmt(from), to };
}

/* ───────────────── main export ───────────────── */

/**
 * Bộ lọc danh sách lead landing — UI dạng Drawer mở từ nút trigger.
 *
 * Cách dùng (không đổi so với phiên bản card trước):
 *   <LandingLeadsAdminFilters
 *     draftFilters={draftFilters}
 *     setDraftFilters={setDraftFilters}
 *     onApply={applyFilters}
 *     onReset={resetFilters}
 *     onExportExcel={handleExport}
 *     isExporting={isExporting}
 *   />
 *
 * @param {object} props
 * @param {object} props.draftFilters
 * @param {function} props.setDraftFilters
 * @param {function} props.onApply
 * @param {function} props.onReset
 * @param {function} [props.onExportExcel]
 * @param {boolean} [props.isExporting]
 * @param {number} [props.appliedCount] Số chip đang áp dụng (để hiện badge trên trigger)
 */
export function LandingLeadsAdminFilters({
  draftFilters,
  setDraftFilters,
  onApply,
  onReset,
  onExportExcel,
  isExporting = false,
  appliedCount = 0,
}) {
  const { t } = useI18n();
  const slugs = Array.isArray(draftFilters.landingLeadsSlugs) ? draftFilters.landingLeadsSlugs : [];
  const customFilters = Array.isArray(draftFilters.landingLeadsCustomFilters)
    ? draftFilters.landingLeadsCustomFilters
    : [];

  const [isOpen, setIsOpen] = useState(false);
  const [slugOptions, setSlugOptions] = useState([{ value: 'l', labelVi: 'Landing React (/l)' }]);
  const [customDefs, setCustomDefs] = useState([]);
  const [slugsLoading, setSlugsLoading] = useState(true);
  const [customDefsLoading, setCustomDefsLoading] = useState(true);

  // Ref để trap focus + đóng drawer bằng Escape
  const drawerRef = useRef(null);
  const triggerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setSlugsLoading(true);
    (async () => {
      try {
        const raw = await fetchLandingLeadsSlugFilterOptions();
        if (cancelled) return;
        setSlugOptions(raw.map((o) => ({ value: o.value, labelVi: o.label })));
      } finally {
        if (!cancelled) setSlugsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setCustomDefsLoading(true);
    (async () => {
      try {
        const items = await fetchLandingLeadsCustomFieldDefinitions();
        if (!cancelled) setCustomDefs(Array.isArray(items) ? items : []);
      } catch {
        if (!cancelled) setCustomDefs([]);
      } finally {
        if (!cancelled) setCustomDefsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Khóa scroll body + đóng bằng Escape khi drawer mở
  useEffect(() => {
    if (!isOpen) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('keydown', onKey);
    };
  }, [isOpen]);

  const handleApply = useCallback(() => {
    setIsOpen(false);
    onApply?.();
  }, [onApply]);

  const handleReset = useCallback(() => {
    onReset?.();
  }, [onReset]);

  const handlePreset = useCallback(
    (preset) => {
      const { from, to } = buildDateRange(preset);
      setDraftFilters((prev) => ({
        ...prev,
        landingLeadsUseDateRange: true,
        landingLeadsDateFrom: from,
        landingLeadsDateTo: to,
      }));
    },
    [setDraftFilters]
  );

  const clearDateRange = useCallback(() => {
    setDraftFilters((prev) => ({
      ...prev,
      landingLeadsUseDateRange: false,
      landingLeadsDateFrom: '',
      landingLeadsDateTo: '',
    }));
  }, [setDraftFilters]);

  const presets = [
    { id: 'today', label: t('landingLeads.presetToday') },
    { id: '7d', label: t('landingLeads.preset7Days') },
    { id: '30d', label: t('landingLeads.preset30Days') },
  ];

  // Detect preset đang khớp để highlight
  const activePreset = useMemo(() => {
    if (!draftFilters.landingLeadsUseDateRange) return null;
    for (const p of presets) {
      const { from, to } = buildDateRange(p.id);
      if (from === draftFilters.landingLeadsDateFrom && to === draftFilters.landingLeadsDateTo) return p.id;
    }
    return null;
  }, [draftFilters, presets]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
      >
        <HiOutlineFilter className="w-5 h-5" />
        <span>{t('landingLeads.filterTitle')}</span>
        {appliedCount > 0 ? (
          <span className="ml-1 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-orange-500 text-white text-[11px] font-semibold">
            {appliedCount}
          </span>
        ) : null}
      </button>

      {typeof onExportExcel === 'function' ? (
        <button
          type="button"
          onClick={() => onExportExcel()}
          disabled={isExporting}
          className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-800 shadow-sm hover:bg-emerald-100 disabled:opacity-50"
        >
          {isExporting ? t('landingLeads.exporting') : t('landingLeads.exportExcel')}
        </button>
      ) : null}

      {isOpen ? (
        <div
          className="fixed inset-0 z-50 flex"
          role="dialog"
          aria-modal="true"
          aria-label={t('landingLeads.filterTitle')}
        >
          {/* Backdrop */}
          <button
            type="button"
            aria-label={t('landingLeads.closeFilter')}
            onClick={() => setIsOpen(false)}
            className="flex-1 bg-black/40 backdrop-blur-[1px] animate-[fadeIn_120ms_ease-out]"
          />

          {/* Drawer panel */}
          <aside
            ref={drawerRef}
            className="w-full max-w-md bg-white shadow-xl flex flex-col animate-[slideInRight_180ms_ease-out]"
          >
            <header className="flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-4">
              <div>
                <h2 className="text-base font-semibold text-gray-900">{t('landingLeads.filterTitle')}</h2>
                <p className="text-sm text-gray-500 mt-0.5">{t('landingLeads.filterDescription')}</p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                aria-label={t('landingLeads.closeFilter')}
              >
                <HiOutlineX className="w-5 h-5" />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
              {/* Date filter */}
              <section>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-gray-700">
                    <input
                      type="checkbox"
                      checked={Boolean(draftFilters.landingLeadsUseDateRange)}
                      onChange={(e) =>
                        setDraftFilters((prev) => ({
                          ...prev,
                          landingLeadsUseDateRange: e.target.checked,
                        }))
                      }
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    <HiOutlineCalendar className="w-4 h-4 text-gray-500" />
                    <span>{t('landingLeads.filterByDateRange')}</span>
                  </label>
                  {draftFilters.landingLeadsUseDateRange ? (
                    <button
                      type="button"
                      onClick={clearDateRange}
                      className="text-xs text-gray-500 hover:text-red-600 underline-offset-2 hover:underline"
                    >
                      {t('landingLeads.clearThis')}
                    </button>
                  ) : null}
                </div>

                {draftFilters.landingLeadsUseDateRange ? (
                  <>
                    <div className="flex flex-wrap gap-3 mb-2">
                      {presets.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => handlePreset(p.id)}
                          className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                            activePreset === p.id
                              ? 'border-orange-300 bg-orange-50 text-orange-700'
                              : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                          }`}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <div className="flex-1 min-w-[140px]">
                        <label className="block text-xs font-medium text-gray-500 mb-1">
                          {t('landingLeads.fromDate')}
                        </label>
                        <input
                          type="date"
                          value={draftFilters.landingLeadsDateFrom || ''}
                          onChange={(e) =>
                            setDraftFilters((prev) => ({ ...prev, landingLeadsDateFrom: e.target.value }))
                          }
                          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                        />
                      </div>
                      <div className="flex-1 min-w-[140px]">
                        <label className="block text-xs font-medium text-gray-500 mb-1">
                          {t('landingLeads.toDate')}
                        </label>
                        <input
                          type="date"
                          value={draftFilters.landingLeadsDateTo || ''}
                          onChange={(e) =>
                            setDraftFilters((prev) => ({ ...prev, landingLeadsDateTo: e.target.value }))
                          }
                          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                        />
                      </div>
                    </div>
                  </>
                ) : null}
              </section>

              {/* Slug filter */}
              <section>
                <MultiFilterBlock
                  title={t('landingLeads.slugSourceLabel')}
                  options={slugOptions}
                  fieldKey="landingLeadsSlugs"
                  selected={slugs}
                  setDraftFilters={setDraftFilters}
                  isLoading={slugsLoading}
                  searchable
                />
              </section>

              {/* Custom fields */}
              {customDefs.length > 0 || customDefsLoading ? (
                <section className="space-y-3">
                  <span className="text-sm font-medium text-gray-700">
                    {t('landingLeads.customFieldsLabel')}
                  </span>
                  {customDefsLoading ? (
                    <div className="rounded-lg border border-gray-200 p-3 text-xs text-gray-400 italic">
                      {t('landingLeads.loadingCustomFields')}
                    </div>
                  ) : null}
                  {customDefs.map((field) => {
                    const current = customFilters.find((f) => f.key === field.key) || null;
                    const isChoice =
                      field.type === 'select' || field.type === 'radio' || field.type === 'checkbox';
                    return (
                      <div key={field.key} className="rounded-lg border border-gray-200 p-3 space-y-2">
                        <div className="text-sm text-gray-800">{field.labelVi || field.key}</div>
                        {isChoice ? (
                          <select
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                            value={current?.values?.[0] || current?.value || ''}
                            onChange={(e) => {
                              const value = e.target.value;
                              setDraftFilters((prev) => {
                                const rest = (Array.isArray(prev.landingLeadsCustomFilters)
                                  ? prev.landingLeadsCustomFilters
                                  : []
                                ).filter((f) => f.key !== field.key);
                                if (!value) return { ...prev, landingLeadsCustomFilters: rest };
                                return {
                                  ...prev,
                                  landingLeadsCustomFilters: [
                                    ...rest,
                                    { key: field.key, operator: 'eq', value },
                                  ],
                                };
                              });
                            }}
                          >
                            <option value="">—</option>
                            {(field.options || []).map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.labelVi || opt.value}
                              </option>
                            ))}
                            {field.type === 'checkbox' ? (
                              <>
                                <option value="true">{t('landingLeads.yes')}</option>
                                <option value="false">{t('landingLeads.no')}</option>
                              </>
                            ) : null}
                          </select>
                        ) : (
                          <input
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                            placeholder={field.labelVi}
                            value={current?.value || ''}
                            onChange={(e) => {
                              const value = e.target.value;
                              setDraftFilters((prev) => {
                                const rest = (Array.isArray(prev.landingLeadsCustomFilters)
                                  ? prev.landingLeadsCustomFilters
                                  : []
                                ).filter((f) => f.key !== field.key);
                                if (!value.trim()) return { ...prev, landingLeadsCustomFilters: rest };
                                return {
                                  ...prev,
                                  landingLeadsCustomFilters: [
                                    ...rest,
                                    { key: field.key, operator: 'contains', value },
                                  ],
                                };
                              });
                            }}
                          />
                        )}
                      </div>
                    );
                  })}
                </section>
              ) : null}
            </div>

            <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-gray-100 bg-gray-50 px-5 py-3">
              <button
                type="button"
                onClick={handleReset}
                className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
              >
                {t('landingLeads.clearFilters')}
              </button>
              <button
                type="button"
                onClick={handleApply}
                className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-700"
              >
                {t('landingLeads.applyFilters')}
              </button>
            </footer>
          </aside>
        </div>
      ) : null}

      {/* Tailwind keyframes cho drawer (chèn 1 lần, idempotent qua SSR-safe check). */}
      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideInRight { from { transform: translateX(100%) } to { transform: translateX(0) } }
      `}</style>
    </>
  );
}
