import { memo, startTransition, useCallback, useEffect, useMemo, useState } from 'react';
import { UKNOW_INTEREST_OPTIONS, UKNOW_OCCUPATION_OPTIONS } from '../../landing/constants/uknowLandingOptions.js';
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
  const occupations = Array.isArray(formData.landingLeadsOccupations) ? formData.landingLeadsOccupations : [];
  const interests = Array.isArray(formData.landingLeadsInterests) ? formData.landingLeadsInterests : [];
  const slugs = Array.isArray(formData.landingLeadsSlugs) ? formData.landingLeadsSlugs : [];

  const [slugOptions, setSlugOptions] = useState([{ value: 'l', label: 'Landing React (/l)' }]);

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
        Lấy lead đã gửi từ form landing công khai. Để trống bộ lọc nghề/lĩnh vực / landing slug nghĩa là{' '}
        <strong>không lọc</strong> theo tiêu đó (vẫn áp dụng khoảng ngày nếu bật).
      </p>
      <p className="rounded-lg border border-amber-100 bg-amber-50/90 p-3 text-sm text-amber-950">
        <strong>Chiến dịch chạy liên tục (continuous):</strong> node này được hỗ trợ. Mỗi chu kỳ hệ thống đọc lại
        cơ sở dữ liệu và chỉ đưa vào các bước sau những lead <em>chưa</em> xuất hiện ở các chu kỳ trước (theo{' '}
        <code className="rounded bg-white/80 px-1">leadId</code> hoặc cặp email + điện thoại). Chu kỳ đầu lấy đủ bản
        ghi khớp bộ lọc; các chu kỳ sau chỉ lead mới. Slug trong form nhúng (
        <code className="rounded bg-white/80 px-1">?slug=…</code>) phải trùng slug lưu trên lead (vd landing cố định{' '}
        <code className="rounded bg-white/80 px-1">l</code>).
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
          Giới hạn theo ngày gửi (từ — đến)
        </label>
      </div>

      {formData.landingLeadsUseDateRange ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Từ ngày</label>
            <input
              type="date"
              value={formData.landingLeadsDateFrom || ''}
              onChange={(e) => setFormData((prev) => ({ ...prev, landingLeadsDateFrom: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Đến ngày</label>
            <input
              type="date"
              value={formData.landingLeadsDateTo || ''}
              onChange={(e) => setFormData((prev) => ({ ...prev, landingLeadsDateTo: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
        </div>
      ) : (
        <p className="text-xs text-gray-500">Đang lấy toàn bộ lead (theo thứ tự mới nhất), trừ khi bật lọc ngày ở trên.</p>
      )}

      <LandingLeadsMultiFilterBlock
        title="Lọc theo nghề nghiệp (có thể chọn nhiều)"
        options={UKNOW_OCCUPATION_OPTIONS.map((o) => ({ value: o.value, label: o.labelVi }))}
        fieldKey="landingLeadsOccupations"
        selected={occupations}
        setFormData={setFormData}
      />

      <LandingLeadsMultiFilterBlock
        title="Lọc theo landing / slug nguồn (để trống = tất cả slug)"
        options={slugOptions}
        fieldKey="landingLeadsSlugs"
        selected={slugs}
        setFormData={setFormData}
      />

      <LandingLeadsMultiFilterBlock
        title="Lọc theo lĩnh vực quan tâm (có thể chọn nhiều)"
        options={UKNOW_INTEREST_OPTIONS.map((o) => ({ value: o.value, label: o.labelVi }))}
        fieldKey="landingLeadsInterests"
        selected={interests}
        setFormData={setFormData}
      />

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          Số bản ghi tối đa (1–{LANDING_LEADS_MAX_RECORDS.toLocaleString('vi-VN')})
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
        title="Chỉ giữ các trường lead cần dùng"
        options={LANDING_LEAD_COLUMN_OPTIONS}
        selectedKeys={Array.isArray(formData.dataSelectedColumns) ? formData.dataSelectedColumns : []}
        setFormData={setFormData}
        formField="dataSelectedColumns"
        hint="Truy vấn DB vẫn lấy đủ cột; server chỉ giữ các trường đã chọn khi chạy flow. Luôn giữ thêm leadId và id."
      />
    </div>
  );
}
