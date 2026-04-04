import { memo, startTransition, useCallback, useEffect, useMemo, useState } from 'react';
import { fetchLandingLeadsSlugFilterOptions } from '../utils/landingLeadsSlugFilterOptions.js';
import { UKNOW_INTEREST_OPTIONS, UKNOW_OCCUPATION_OPTIONS } from '../constants/uknowLandingOptions.js';

/**
 * Một dòng checkbox trong danh sách lọc — tách để giảm re-render.
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
 * Khối lọc nhiều lựa chọn (nghề / lĩnh vực) — cùng logic form landing.
 *
 * @param {object} props
 * @param {string} props.title
 * @param {{ value: string, labelVi: string }[]} props.options
 * @param {'landingLeadsOccupations' | 'landingLeadsInterests' | 'landingLeadsSlugs'} props.fieldKey
 * @param {string[]} props.selected
 * @param {function} props.setDraftFilters
 */
function MultiFilterBlock({ title, options, fieldKey, selected, setDraftFilters }) {
  const selectedSet = useMemo(() => new Set(selected), [selected]);

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

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium text-gray-700">{title}</span>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={selectAll}
            className="rounded border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50"
          >
            Chọn tất cả
          </button>
          <button
            type="button"
            onClick={clearAll}
            className="rounded border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50"
          >
            Bỏ chọn
          </button>
        </div>
      </div>
      <div className="max-h-40 space-y-2 overflow-y-auto rounded-lg border border-gray-200 p-3 [content-visibility:auto]">
        {options.map((opt) => (
          <FilterCheckboxRow
            key={opt.value}
            value={opt.value}
            label={opt.labelVi}
            checked={selectedSet.has(opt.value)}
            onToggle={toggleOne}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Bộ lọc danh sách lead landing (ngày, nghề, lĩnh vực, slug landing).
 *
 * @param {object} props
 * @param {object} props.draftFilters
 * @param {function} props.setDraftFilters
 * @param {function} props.onApply
 * @param {function} props.onReset
 * @param {function} [props.onExportExcel] Xuất Excel theo bộ lọc đã áp dụng (không theo bản nháp)
 * @param {boolean} [props.isExporting]
 */
export function LandingLeadsAdminFilters({
  draftFilters,
  setDraftFilters,
  onApply,
  onReset,
  onExportExcel,
  isExporting = false,
}) {
  const occupations = Array.isArray(draftFilters.landingLeadsOccupations)
    ? draftFilters.landingLeadsOccupations
    : [];
  const interests = Array.isArray(draftFilters.landingLeadsInterests)
    ? draftFilters.landingLeadsInterests
    : [];
  const slugs = Array.isArray(draftFilters.landingLeadsSlugs) ? draftFilters.landingLeadsSlugs : [];

  const [slugOptions, setSlugOptions] = useState([{ value: 'l', labelVi: 'Landing React (/l)' }]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const raw = await fetchLandingLeadsSlugFilterOptions();
      if (cancelled) return;
      setSlugOptions(raw.map((o) => ({ value: o.value, labelVi: o.label })));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="card p-5 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 pb-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Bộ lọc</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Lọc theo ngày gửi, landing/slug, nghề nghiệp và lĩnh vực (để trống nghĩa là không lọc theo mục đó).
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onReset}
            className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
          >
            Xóa bộ lọc
          </button>
          {typeof onExportExcel === 'function' ? (
            <button
              type="button"
              onClick={() => onExportExcel()}
              disabled={isExporting}
              className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-800 shadow-sm hover:bg-emerald-100 disabled:opacity-50"
            >
              {isExporting ? 'Đang xuất…' : 'Xuất Excel'}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onApply}
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-700"
          >
            Áp dụng bộ lọc
          </button>
        </div>
      </div>

      <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-800">
        <input
          type="checkbox"
          checked={Boolean(draftFilters.landingLeadsUseDateRange)}
          onChange={(e) =>
            setDraftFilters((prev) => ({ ...prev, landingLeadsUseDateRange: e.target.checked }))
          }
          className="h-4 w-4 rounded border-gray-300"
        />
        <span>Lọc theo khoảng ngày đăng ký</span>
      </label>

      {draftFilters.landingLeadsUseDateRange ? (
        <div className="flex flex-wrap gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Từ ngày</label>
            <input
              type="date"
              value={draftFilters.landingLeadsDateFrom || ''}
              onChange={(e) =>
                setDraftFilters((prev) => ({ ...prev, landingLeadsDateFrom: e.target.value }))
              }
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Đến ngày</label>
            <input
              type="date"
              value={draftFilters.landingLeadsDateTo || ''}
              onChange={(e) =>
                setDraftFilters((prev) => ({ ...prev, landingLeadsDateTo: e.target.value }))
              }
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
          </div>
        </div>
      ) : null}

      <div className="grid gap-6 md:grid-cols-2">
        <MultiFilterBlock
          title="Nghề nghiệp"
          options={UKNOW_OCCUPATION_OPTIONS}
          fieldKey="landingLeadsOccupations"
          selected={occupations}
          setDraftFilters={setDraftFilters}
        />
        <MultiFilterBlock
          title="Lĩnh vực quan tâm"
          options={UKNOW_INTEREST_OPTIONS}
          fieldKey="landingLeadsInterests"
          selected={interests}
          setDraftFilters={setDraftFilters}
        />
      </div>

      <MultiFilterBlock
        title="Landing / slug nguồn (để trống = tất cả)"
        options={slugOptions}
        fieldKey="landingLeadsSlugs"
        selected={slugs}
        setDraftFilters={setDraftFilters}
      />
    </div>
  );
}
