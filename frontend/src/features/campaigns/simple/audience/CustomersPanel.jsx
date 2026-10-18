import { useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import customerApiService from '../../../customers/services/customerApi.service';
import useAsyncResource from '../useAsyncResource';

/** Trần tag chọn một lúc — khớp trần `tagIds` của máy chủ (CUSTOMER_TAG_MAX_TAGS_PER_CALL). */
const MAX_TAGS = 50;

const sameList = (a, b) => a.length === b.length && a.every((item, index) => item === b[index]);

/**
 * "Khách hàng đã lưu": cho biết đang có bao nhiêu khách và (tuỳ chọn) chỉ gửi cho khách mang BẤT KỲ tag nào đã chọn
 * (PLAN_TAG_KHACH_HANG PR-T3). Danh sách thật do server lấy MỖI LẦN GỬI (khối động `interested_customers` loại `all`), nên khách
 * được gắn tag sau này cũng nhận. Không chọn tag = mọi khách như trước.
 *
 * @param {object} props
 * @param {{ tagIds?: number[], tagNames?: string[] }} [props.audience]
 * @param {(patch: object) => void} props.patchAudience
 * @param {(key: string, params?: object) => string} props.t
 * @param {string} props.locale
 */
export default function CustomersPanel({ audience, patchAudience, t, locale }) {
  const tagIds = useMemo(() => (Array.isArray(audience?.tagIds) ? audience.tagIds.map(Number) : []), [audience?.tagIds]);
  const tagNames = useMemo(() => (Array.isArray(audience?.tagNames) ? audience.tagNames : []), [audience?.tagNames]);
  const tagKey = tagIds.join(',');
  const numberLocale = locale === 'en' ? 'en-US' : 'vi-VN';

  const tags = useAsyncResource(async () => {
    const response = await customerApiService.getTags();
    return Array.isArray(response?.data?.data) ? response.data.data : [];
  }, []);

  const resource = useAsyncResource(async () => {
    const params = { page: 1, limit: 1 };
    if (tagKey) params.tagIds = tagKey;
    const response = await customerApiService.getCustomers(params);
    const total = Number(response?.data?.data?.pagination?.total);
    return Number.isFinite(total) ? total : null;
  }, [tagKey]);

  useEffect(() => {
    if (resource.status === 'ready') patchAudience({ customerTotal: resource.data });
    else if (resource.status === 'error') patchAudience({ customerTotal: null });
  }, [resource.status, resource.data, patchAudience]);

  const allTags = useMemo(() => (tags.status === 'ready' ? tags.data : []), [tags.status, tags.data]);

  // Đồng bộ TÊN tag đã chọn (chỉ để hiện ở tóm tắt): chiến dịch đã lưu chỉ có id; tag đã bị xoá thì hiện #id.
  useEffect(() => {
    if (tags.status !== 'ready' || tagIds.length === 0) return;
    const names = tagIds.map((id) => allTags.find((tag) => Number(tag.id) === id)?.name || `#${id}`);
    if (!sameList(names, tagNames)) patchAudience({ tagNames: names });
  }, [tags.status, allTags, tagIds, tagNames, patchAudience]);

  const toggleTag = (tag) => {
    const id = Number(tag.id);
    const nextIds = tagIds.includes(id) ? tagIds.filter((item) => item !== id) : [...tagIds, id];
    const nameOf = (tagId) => (tagId === id ? tag.name : allTags.find((item) => Number(item.id) === tagId)?.name || `#${tagId}`);
    patchAudience({ tagIds: nextIds, tagNames: nextIds.map(nameOf) });
  };
  const clearTags = () => patchAudience({ tagIds: [], tagNames: [] });

  const renderTags = () => {
    if (tags.status === 'loading') return null;
    if (tags.status === 'error') {
      return <p className="text-xs text-slate-500 dark:text-dk-text2" data-testid="simple-customers-tags-error">{t('simpleCampaign.audience.customers.tagsLoadFailed')}</p>;
    }
    if (allTags.length === 0 && tagIds.length === 0) {
      return (
        <p className="text-xs text-slate-600 dark:text-dk-text2" data-testid="simple-customers-tags-none">
          {t('simpleCampaign.audience.customers.tagsNone')}{' '}
          <Link to="/app/customers" className="font-semibold text-primary-600 underline dark:text-primary-300">{t('simpleCampaign.audience.customers.tagsNoneLink')}</Link>
        </p>
      );
    }
    // Tag đang chọn nhưng không còn trong danh sách (đã xoá): vẫn hiện để người dùng bỏ chọn được.
    const orphanIds = tagIds.filter((id) => !allTags.some((tag) => Number(tag.id) === id));
    const chips = [
      ...allTags,
      ...orphanIds.map((id) => ({ id, name: `#${id}`, customerCount: null, color: null })),
    ];
    return (
      <div className="min-w-0" data-testid="simple-customers-tags">
        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-slate-900 dark:text-dk-text">{t('simpleCampaign.audience.customers.tagsLabel')}</p>
          {tagIds.length > 0 && (
            <button
              type="button"
              onClick={clearTags}
              data-testid="simple-customers-tags-clear"
              className="text-xs font-medium text-primary-600 hover:underline dark:text-primary-300"
            >
              {t('simpleCampaign.audience.customers.tagsClear')}
            </button>
          )}
        </div>
        <ul className="flex flex-wrap gap-2">
          {chips.map((tag) => {
            const selected = tagIds.includes(Number(tag.id));
            const atLimit = !selected && tagIds.length >= MAX_TAGS;
            return (
              <li key={tag.id} className="max-w-full">
                <button
                  type="button"
                  aria-pressed={selected}
                  disabled={atLimit}
                  onClick={() => toggleTag(tag)}
                  data-testid={`simple-customers-tag-${tag.id}`}
                  className={`flex max-w-full items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50 ${selected ? 'border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-950/30 dark:text-primary-300' : 'border-slate-200 text-slate-700 hover:border-primary-300 hover:bg-slate-50 dark:border-dk-border dark:text-dk-text dark:hover:bg-dk-raised'}`}
                >
                  {tag.color && <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: tag.color }} />}
                  <span className="truncate">{tag.name}</span>
                  {tag.customerCount != null && (
                    <span className="shrink-0 text-slate-500 dark:text-dk-text2">{Number(tag.customerCount).toLocaleString(numberLocale)}</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
        <p className="mt-1.5 text-xs text-slate-500 dark:text-dk-text2">{t('simpleCampaign.audience.customers.tagsHint')}</p>
      </div>
    );
  };

  const renderCount = () => {
    if (resource.status === 'loading') {
      return <p className="text-sm text-slate-500 dark:text-dk-text2" role="status">{t('simpleCampaign.audience.loading')}</p>;
    }
    if (resource.status === 'ready' && resource.data === 0) {
      if (tagIds.length > 0) {
        return (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-200" data-testid="simple-customers-empty-tagged">
            <p>{t('simpleCampaign.audience.customers.emptyTagged')}</p>
            <Link to="/app/customers" className="mt-1 inline-block font-semibold underline">{t('simpleCampaign.audience.customers.tagsNoneLink')}</Link>
          </div>
        );
      }
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
          {t(tagIds.length > 0 ? 'simpleCampaign.audience.customers.countTagged' : 'simpleCampaign.audience.customers.count', { count: Number(resource.data).toLocaleString(numberLocale) })}
        </p>
      );
    }
    // Không đọc được số khách: không chặn — server sẽ tính lại ở bước Xem lại.
    return <p className="text-sm text-slate-600 dark:text-dk-text2">{t('simpleCampaign.audience.customers.unknown')}</p>;
  };

  // Chưa có khách nào (và không lọc tag): chỉ hiện hộp "chưa lưu khách", không bày chọn tag vô nghĩa.
  const noCustomersAtAll = resource.status === 'ready' && resource.data === 0 && tagIds.length === 0;
  return (
    <div className="min-w-0 space-y-3">
      {!noCustomersAtAll && renderTags()}
      {renderCount()}
    </div>
  );
}
