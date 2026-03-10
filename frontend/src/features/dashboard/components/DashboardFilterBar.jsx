import { useMemo } from 'react';

const CAMPAIGN_TYPE_OPTIONS = [
  { value: 'all', label: 'Tất cả loại chiến dịch' },
  { value: 'email', label: 'Email' },
  { value: 'zalo', label: 'Zalo' },
  { value: 'zalo_group', label: 'Zalo group' },
];

/**
 * Filter bar for dashboard analytics.
 *
 * @param {object} props
 * @returns {JSX.Element}
 */
const DashboardFilterBar = ({ draftFilters, setDraftFilters, campaignOptions, onApply }) => {
  const selectedCampaignValue = useMemo(
    () => (draftFilters?.campaignIds || []).map((item) => String(item)),
    [draftFilters?.campaignIds]
  );

  const handleMultiCampaignChange = (event) => {
    const values = Array.from(event.target.selectedOptions || [])
      .map((option) => Number.parseInt(option.value, 10))
      .filter(Number.isFinite);

    setDraftFilters((prev) => ({
      ...prev,
      campaignIds: values,
    }));
  };

  return (
    <div className="card p-4 md:p-5">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Từ ngày</label>
          <input
            type="date"
            className="input"
            value={draftFilters.startDate}
            onChange={(event) =>
              setDraftFilters((prev) => ({
                ...prev,
                startDate: event.target.value,
              }))
            }
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Đến ngày</label>
          <input
            type="date"
            className="input"
            value={draftFilters.endDate}
            onChange={(event) =>
              setDraftFilters((prev) => ({
                ...prev,
                endDate: event.target.value,
              }))
            }
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Loại chiến dịch</label>
          <select
            className="input"
            value={draftFilters.campaignType}
            onChange={(event) =>
              setDraftFilters((prev) => ({
                ...prev,
                campaignType: event.target.value,
              }))
            }
          >
            {CAMPAIGN_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="xl:col-span-2">
          <label className="block text-xs font-medium text-gray-500 mb-1">Chiến dịch (chọn 1 hoặc nhiều)</label>
          <select
            className="input min-h-[120px]"
            multiple
            value={selectedCampaignValue}
            onChange={handleMultiCampaignChange}
          >
            {campaignOptions.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label} ({item.campaignType})
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-400 mt-1">Giữ Ctrl (Windows) hoặc Cmd (Mac) để chọn nhiều chiến dịch.</p>
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <button type="button" className="btn btn-primary" onClick={onApply}>
          Áp dụng bộ lọc
        </button>
      </div>
    </div>
  );
};

export default DashboardFilterBar;
