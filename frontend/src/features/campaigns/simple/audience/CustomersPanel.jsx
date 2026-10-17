import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import customerApiService from '../../../customers/services/customerApi.service';
import useAsyncResource from '../useAsyncResource';

/**
 * "Khách hàng đã lưu": chỉ cho biết đang có bao nhiêu khách. Danh sách thật do server lấy lúc tạo
 * (khách có email/số điện thoại hợp lệ) — KHÔNG dùng nguồn `db` của trình dựng vì nó gần như luôn ra 0 người (PLAN §1).
 *
 * @param {object} props
 * @param {(patch: object) => void} props.patchAudience
 * @param {(key: string, params?: object) => string} props.t
 * @param {string} props.locale
 */
export default function CustomersPanel({ patchAudience, t, locale }) {
  const resource = useAsyncResource(async () => {
    const response = await customerApiService.getCustomers({ page: 1, limit: 1 });
    const total = Number(response?.data?.data?.pagination?.total);
    return Number.isFinite(total) ? total : null;
  }, []);

  useEffect(() => {
    if (resource.status === 'ready') patchAudience({ customerTotal: resource.data });
    else if (resource.status === 'error') patchAudience({ customerTotal: null });
  }, [resource.status, resource.data, patchAudience]);

  if (resource.status === 'loading') {
    return <p className="text-sm text-slate-500 dark:text-dk-text2" role="status">{t('simpleCampaign.audience.loading')}</p>;
  }
  if (resource.status === 'ready' && resource.data === 0) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-200" data-testid="simple-customers-empty">
        <p>{t('simpleCampaign.audience.customers.empty')}</p>
        <Link to="/app/customers" className="mt-1 inline-block font-semibold underline">{t('simpleCampaign.audience.customers.add')}</Link>
      </div>
    );
  }
  if (resource.status === 'ready' && resource.data > 0) {
    return (
      <p className="text-sm text-slate-700 dark:text-dk-text" data-testid="simple-customers-count">
        {t('simpleCampaign.audience.customers.count', { count: Number(resource.data).toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN') })}
      </p>
    );
  }
  // Không đọc được số khách: không chặn — server sẽ tính lại ở bước Xem lại.
  return <p className="text-sm text-slate-600 dark:text-dk-text2">{t('simpleCampaign.audience.customers.unknown')}</p>;
}
