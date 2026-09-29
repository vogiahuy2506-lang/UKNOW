import { useState, useEffect, useCallback } from 'react';
import { useI18n } from '../../i18n';
import affiliateService from '../../services/affiliate.service';
import StatusChip from '../../components/common/StatusChip';
import { formatVnd, formatDate } from './affiliateFormat.util';

const PAGE_SIZE = 20;

/**
 * Thẻ "Người đã dùng mã của bạn" — tự tải dữ liệu riêng (route GET /affiliate/referrals),
 * tách khỏi AffiliatePage vì đây là danh sách phân trang độc lập với overview.
 */
export default function ReferralsCard({ referralLink, onCopyLink }) {
  const { t } = useI18n();
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ items: [], total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchReferrals = useCallback(async (targetPage) => {
    try {
      setLoading(true);
      setError(null);
      const res = await affiliateService.getReferrals({ page: targetPage, limit: PAGE_SIZE });
      setData(res.data);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || t('affiliate.referralsLoadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchReferrals(page);
  }, [page, fetchReferrals]);

  const { items = [], total = 0, totalPages = 1 } = data || {};

  return (
    <div className="card overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100">
        <h2 className="text-sm font-bold text-gray-900">
          {t('affiliate.referralsSectionTitle', { count: total })}
        </h2>
      </div>

      {loading && (
        <div className="text-center py-8 text-sm text-gray-500">{t('common.loading')}</div>
      )}

      {!loading && error && (
        <div className="text-center py-8 text-sm text-red-600">{error}</div>
      )}

      {!loading && !error && items.length === 0 && (
        <div className="text-center py-8 px-6 space-y-3">
          <p className="text-sm text-gray-500">{t('affiliate.referralsEmpty')}</p>
          {referralLink && (
            <button type="button" onClick={onCopyLink} className="btn btn-primary text-sm">
              {t('affiliate.copyLink')}
            </button>
          )}
        </div>
      )}

      {!loading && !error && items.length > 0 && (
        <>
          <div className="table-container">
            <table className="table text-left">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase font-semibold">
                <tr>
                  <th className="px-6 py-3">{t('affiliate.referralsColName')}</th>
                  <th className="px-6 py-3">{t('affiliate.referralsColEmail')}</th>
                  <th className="px-6 py-3">{t('affiliate.referralsColJoinedAt')}</th>
                  <th className="px-6 py-3">{t('affiliate.referralsColStatus')}</th>
                  <th className="px-6 py-3 text-right">{t('affiliate.referralsColRevenue')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-gray-700">
                {items.map((item, idx) => (
                  <tr key={idx} className="hover:bg-gray-50/60">
                    <td className="px-6 py-3.5 font-medium text-gray-900">{item.name || '—'}</td>
                    <td className="px-6 py-3.5 text-xs font-mono">{item.emailMasked}</td>
                    <td className="px-6 py-3.5 text-xs text-gray-500">{formatDate(item.referredAt)}</td>
                    <td className="px-6 py-3.5">
                      {item.hasPurchased && item.awaitingPhone ? (
                        <StatusChip tone="warning" title={t('affiliate.referralsAwaitingPhoneHint')}>
                          {t('affiliate.referralsStatusAwaitingPhone')}
                        </StatusChip>
                      ) : (
                        <StatusChip tone={item.hasPurchased ? 'good' : 'muted'}>
                          {item.hasPurchased
                            ? t('affiliate.referralsStatusPurchased')
                            : t('affiliate.referralsStatusNotPurchased')}
                        </StatusChip>
                      )}
                    </td>
                    <td className="px-6 py-3.5 text-right tabular-nums font-semibold text-emerald-600">
                      {formatVnd(item.attributedRevenue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-6 py-3 border-t border-gray-100 text-sm">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="btn btn-secondary text-xs py-1.5 px-3 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t('common.previous')}
              </button>
              <span className="text-xs text-gray-500">
                {page} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="btn btn-secondary text-xs py-1.5 px-3 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t('common.next')}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
