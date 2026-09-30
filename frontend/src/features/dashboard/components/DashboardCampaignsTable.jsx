import { useI18n } from '../../../i18n';
import { getCampaignTypeMeta } from '../../../utils/campaignTypeDisplay';

/**
 * Bảng "Chiến dịch trong kỳ": 10 chiến dịch nhiều tin đã gửi nhất trong khoảng ngày đang chọn.
 * Số đọc từ `/dashboard/campaigns` — cùng nguồn (bảng tin) với các thẻ nên không lệch: Đã gửi · Chưa gửi được · Mở ·
 * Nhấp · Đã mua. Gộp thay cho bảng top-list riêng (top theo đơn / theo click).
 *
 * @param {object} props
 * @param {Array<{ campaignId: number|null, campaignName: string|null, campaignType: string|null, sent: number,
 *   failed: number, opened: number, clicked: number, purchased: number }>} props.campaigns
 * @returns {JSX.Element}
 */
const DashboardCampaignsTable = ({ campaigns = [] }) => {
  const { t, locale } = useI18n();
  const fn = (value) => Number(value || 0).toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN');

  const nameOf = (row) => {
    if (row.campaignName) return row.campaignName;
    if (row.campaignId == null) return t('dashboardReport.campaigns.deleted');
    return t('dashboardReport.campaigns.unnamed', { id: row.campaignId });
  };

  return (
    <div className="card" data-testid="dashboard-campaigns-table">
      <div className="p-5 border-b border-gray-100">
        <h3 className="text-base font-semibold text-gray-900">{t('dashboardReport.campaigns.title')}</h3>
        <p className="text-xs text-gray-400 mt-0.5">{t('dashboardReport.campaigns.subtitle')}</p>
      </div>

      {campaigns.length === 0 ? (
        <div className="px-5 py-10 text-center text-sm text-gray-400">
          {t('dashboardReport.campaigns.empty')}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-gray-400 border-b border-gray-100">
                <th className="px-5 py-3 font-semibold">{t('dashboardReport.campaigns.col.campaign')}</th>
                <th className="px-3 py-3 font-semibold text-right">{t('dashboardReport.campaigns.col.sent')}</th>
                <th className="px-3 py-3 font-semibold text-right">{t('dashboardReport.campaigns.col.failed')}</th>
                <th className="px-3 py-3 font-semibold text-right">{t('dashboardReport.campaigns.col.opened')}</th>
                <th className="px-3 py-3 font-semibold text-right">{t('dashboardReport.campaigns.col.clicked')}</th>
                <th className="px-5 py-3 font-semibold text-right">{t('dashboardReport.campaigns.col.purchased')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {campaigns.map((row) => {
                const meta = row.campaignType ? getCampaignTypeMeta(row.campaignType) : null;
                return (
                  <tr key={row.campaignId ?? 'deleted'} data-testid="campaign-row" className="hover:bg-gray-50/60">
                    <td className="px-5 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-gray-800">{nameOf(row)}</span>
                        {meta && (
                          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${meta.className}`}>
                            {meta.label}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums font-semibold text-gray-900">{fn(row.sent)}</td>
                    <td className={`px-3 py-3 text-right tabular-nums ${row.failed > 0 ? 'font-semibold text-rose-600' : 'text-gray-500'}`}>{fn(row.failed)}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-gray-700">{fn(row.opened)}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-gray-700">{fn(row.clicked)}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-gray-700">{fn(row.purchased)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default DashboardCampaignsTable;
