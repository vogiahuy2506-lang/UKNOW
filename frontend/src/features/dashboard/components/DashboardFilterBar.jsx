import { useMemo } from 'react';
import { useI18n } from '../../../i18n';

const CAMPAIGN_TYPE_OPTIONS = (t) => [
  { value: 'all', label: t('dashboardFilterBar.allCampaignTypes') },
  { value: 'email', label: t('dashboardFilterBar.email') },
  { value: 'zalo', label: t('dashboardFilterBar.zalo') },
  { value: 'zalo_group', label: t('dashboardFilterBar.zaloGroup') },
];

const getCampaignTypeLabel = (type, t) => {
  const labels = {
    email: t('dashboardFilterBar.email'),
    zalo: t('dashboardFilterBar.zalo'),
    zalo_group: t('dashboardFilterBar.zaloGroup'),
  };
  return labels[type] || type;
};

/**
 * Filter bar for dashboard analytics.
 *
 * @param {object} props
 * @returns {JSX.Element}
 */
const DashboardFilterBar = ({ draftFilters, setDraftFilters, campaignOptions, onApply }) => {
  const { t } = useI18n();
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
          <label className="block text-xs font-medium text-gray-500 mb-1">{t('dashboardFilterBar.fromDate')}</label>
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
          <label className="block text-xs font-medium text-gray-500 mb-1">{t('dashboardFilterBar.toDate')}</label>
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
          <label className="block text-xs font-medium text-gray-500 mb-1">{t('dashboardFilterBar.campaignType')}</label>
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
            {CAMPAIGN_TYPE_OPTIONS(t).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="xl:col-span-2">
          <label className="block text-xs font-medium text-gray-500 mb-1">{t('dashboardFilterBar.campaigns')} {t('dashboardFilterBar.campaignsHint')}</label>
          <select
            className="input min-h-[120px]"
            multiple
            value={selectedCampaignValue}
            onChange={handleMultiCampaignChange}
          >
            {campaignOptions.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label} ({getCampaignTypeLabel(item.campaignType, t)})
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-400 mt-1">{t('dashboardFilterBar.selectMultipleHint')}</p>
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <button type="button" className="btn btn-primary" onClick={onApply}>
          {t('dashboardFilterBar.applyButton')}
        </button>
      </div>
    </div>
  );
};

export default DashboardFilterBar;
