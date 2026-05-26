import { memo, startTransition, useCallback, useEffect, useMemo, useState } from 'react';
import { useI18n } from '../../../i18n';
import { founder_INTEREST_OPTIONS, founder_OCCUPATION_OPTIONS } from '../../landing/constants/founder-landing-options.js';
import { LANDING_LEADS_MAX_RECORDS, clampLandingLeadsLimitUi } from '../constants/landingLeadsNodeLimits.js';
import { LANDING_LEAD_COLUMN_OPTIONS } from '../constants/dataNodeColumnOptions.js';
import { NodeConfigDataColumnPicker } from './NodeConfigDataColumnPicker';
import { fetchLandingLeadsSlugFilterOptions } from '../../landing/utils/landingLeadsSlugFilterOptions.js';

/**
 * Một dòng checkbox trong danh sách lọc — tách riêng để React bỏ qua re-render khi prop ổn định.
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
 * Khối lọc nhiều lựa chọn + chọn tất cả / bỏ chọn; vùng cuộn dùng content-visibility để giảm chi phí paint khi danh sách dài.
 *
 * @param {object} props
 * @param {string} props.title
 * @param {{ value: string, label: string }[]} props.options
 * @param {string} props.fieldKey key trong formData (landingLeadsOccupations | landingLeadsInterests)
 * @param {string[]} props.selected
 * @param {function} props.setFormData
 */
function LandingLeadsMultiFilterBlock({ title, options, fieldKey, selected, setFormData }) {
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const toggleOne = useCallback(
    (value) => {
      setFormData((prev) => {
        const arr = Array.isArray(prev[fieldKey]) ? [...prev[fieldKey]] : [];
        const i = arr.indexOf(value);
        if (i >= 0) arr.splice(i, 1);
        else arr.push(value);
        return { ...prev, [fieldKey]: arr };
      });
    },
    [fieldKey, setFormData]
  );

  const selectAll = useCallback(() => {
    startTransition(() => {
      setFormData((prev) => ({ ...prev, [fieldKey]: options.map((o) => o.value) }));
    });
  }, [fieldKey, options, setFormData]);

  const clearAll = useCallback(() => {
    startTransition(() => {
      setFormData((prev) => ({ ...prev, [fieldKey]: [] }));
    });
  }, [fieldKey, setFormData]);

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
            {t('nodeConfig.selectAll')}
          </button>
          <button
            type="button"
            onClick={clearAll}
            className="rounded border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50"
          >
            {t('nodeConfig.deselectAll')}
          </button>
        </div>
      </div>
      <div
        className="max-h-40 space-y-2 overflow-y-auto rounded-lg border border-gray-200 p-3 [content-visibility:auto] [contain-intrinsic-size:120px]"
        style={{ contain: 'layout paint' }}
      >
        {options.map((opt) => (
          <FilterCheckboxRow
            key={opt.value}
            value={opt.value}
            label={opt.label}
            checked={selectedSet.has(opt.value)}
            onToggle={toggleOne}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Cấu hình node «Dữ liệu landing page»: lọc ngày, nghề, lĩnh vực, giới hạn số bản ghi (tối đa 10.000).
 *
 * @param {object} props
 * @param {object} props.formData
 * @param {function} props.setFormData
 */
export function NodeConfigReadLandingLeadsSection({ formData, setFormData }) {
  const { t } = useI18n();
  const occupations = Array.isArray(formData.landingLeadsOccupations) ? formData.landingLeadsOccupations : [];
  const interests = Array.isArray(formData.landingLeadsInterests) ? formData.landingLeadsInterests : [];
  const slugs = Array.isArray(formData.landingLeadsSlugs) ? formData.landingLeadsSlugs : [];

  const [slugOptions, setSlugOptions] = useState([{ value: 'l', label: t('nodeConfigLanding.landingReactSlug', { defaultValue: 'Landing React (/l)' }) }]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const merged = await fetchLandingLeadsSlugFilterOptions();
      if (!cancelled) setSlugOptions(merged);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-600">
        {t('nodeConfigLanding.pageDescription')}
      </p>
      <p className="rounded-lg border border-amber-100 bg-amber-50/90 p-3 text-sm text-amber-950">
        <strong>{t('nodeConfigLanding.continuousCampaignNote')}</strong>
      </p>

      <div className="flex items-center gap-2">
        <input
          id="landing-use-dates"
          type="checkbox"
          checked={Boolean(formData.landingLeadsUseDateRange)}
          onChange={(e) => setFormData((prev) => ({ ...prev, landingLeadsUseDateRange: e.target.checked }))}
          className="h-4 w-4 rounded border-gray-300 text-primary-600"
        />
        <label htmlFor="landing-use-dates" className="text-sm font-medium text-gray-800">
          {t('nodeConfigLanding.limitByDate')}
        </label>
      </div>

      {formData.landingLeadsUseDateRange ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">{t('nodeConfigLanding.fromDate')}</label>
            <input
              type="date"
              value={formData.landingLeadsDateFrom || ''}
              onChange={(e) => setFormData((prev) => ({ ...prev, landingLeadsDateFrom: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">{t('nodeConfigLanding.toDate')}</label>
            <input
              type="date"
              value={formData.landingLeadsDateTo || ''}
              onChange={(e) => setFormData((prev) => ({ ...prev, landingLeadsDateTo: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
        </div>
      ) : (
        <p className="text-xs text-gray-500">{t('nodeConfigLanding.takingAllLeads')}</p>
      )}

      <LandingLeadsMultiFilterBlock
        title={t('nodeConfigLanding.filterByOccupation')}
        options={founder_OCCUPATION_OPTIONS.map((o) => ({ value: o.value, label: o.labelVi }))}
        fieldKey="landingLeadsOccupations"
        selected={occupations}
        setFormData={setFormData}
      />

      <LandingLeadsMultiFilterBlock
        title={t('nodeConfigLanding.filterBySlug')}
        options={slugOptions}
        fieldKey="landingLeadsSlugs"
        selected={slugs}
        setFormData={setFormData}
      />

      <LandingLeadsMultiFilterBlock
        title={t('nodeConfigLanding.filterByInterest')}
        options={founder_INTEREST_OPTIONS.map((o) => ({ value: o.value, label: o.labelVi }))}
        fieldKey="landingLeadsInterests"
        selected={interests}
        setFormData={setFormData}
      />

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          {t('nodeConfigLanding.maxRecords', { max: LANDING_LEADS_MAX_RECORDS.toLocaleString('vi-VN') })}
        </label>
        <input
          type="number"
          min={1}
          max={LANDING_LEADS_MAX_RECORDS}
          value={formData.landingLeadsLimit || 1000}
          onChange={(e) =>
            setFormData((prev) => ({
              ...prev,
              landingLeadsLimit: clampLandingLeadsLimitUi(e.target.value, 1000),
            }))
          }
          className="w-full max-w-xs rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
      </div>

      <NodeConfigDataColumnPicker
        title={t('nodeConfigLanding.keepFields')}
        options={LANDING_LEAD_COLUMN_OPTIONS}
        selectedKeys={Array.isArray(formData.dataSelectedColumns) ? formData.dataSelectedColumns : []}
        setFormData={setFormData}
        formField="dataSelectedColumns"
        hint={t('nodeConfigLanding.keepFieldsHint')}
      />
    </div>
  );
}
