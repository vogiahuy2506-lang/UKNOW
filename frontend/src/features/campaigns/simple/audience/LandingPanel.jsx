import { Link } from 'react-router-dom';
import { fetchLandingPagesAdminList } from '../../../landing-pages/services/landingPagesAdminApi.service';
import useAsyncResource from '../useAsyncResource';

/** Slug gửi server: chữ thường, bỏ dấu `/` hai đầu (cùng cách chuẩn hoá của bộ lọc landing ở builder). */
const normalizeSlug = (raw) => {
  const lowered = String(raw || '').trim().toLowerCase();
  return lowered.replace(/^\/+|\/+$/g, '') || lowered;
};

/**
 * Danh sách landing của người dùng: nhãn = tên trang (rỗng thì rơi về slug), kèm cờ chưa xuất bản.
 * KHÔNG có trang `l` của nền tảng (đó là trang nội bộ, không phải của người dùng) — vì thế không dùng
 * `fetchLandingLeadsSlugFilterOptions` (nó luôn chèn mục đó và hiện slug thay vì tên).
 */
const loadLandingOptions = async () => {
  const rows = await fetchLandingPagesAdminList();
  const seen = new Set();
  const options = [];
  for (const row of rows || []) {
    const value = normalizeSlug(row?.slug);
    if (!value || value === 'l' || seen.has(value)) continue;
    seen.add(value);
    options.push({ value, label: String(row.title || '').trim() || value, published: row.isPublished !== false });
  }
  return options;
};

/**
 * "Người để lại thông tin trên landing page": chọn một hoặc nhiều trang. Lưu cả slug (gửi server) lẫn tên trang
 * (`landingTitles`, song song với `slugs`) để câu tóm tắt ở bước Xem lại nêu TÊN trang.
 *
 * @param {object} props
 * @param {string[]} props.slugs
 * @param {string[]} props.landingTitles song song với `slugs`
 * @param {(patch: object) => void} props.patchAudience
 * @param {(key: string, params?: object) => string} props.t
 */
export default function LandingPanel({ slugs, landingTitles = [], patchAudience, t }) {
  const resource = useAsyncResource(loadLandingOptions, []);

  const toggle = (option) => {
    const index = slugs.indexOf(option.value);
    if (index >= 0) {
      patchAudience({
        slugs: slugs.filter((_, i) => i !== index),
        landingTitles: landingTitles.filter((_, i) => i !== index),
      });
      return;
    }
    patchAudience({ slugs: [...slugs, option.value], landingTitles: [...landingTitles, option.label] });
  };

  if (resource.status === 'loading') {
    return <p className="text-sm text-slate-500 dark:text-dk-text2" role="status">{t('simpleCampaign.audience.loading')}</p>;
  }
  if (resource.status === 'error') {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300" role="alert">
        <p>{resource.error || t('simpleCampaign.audience.landing.loadFailed')}</p>
        <button type="button" onClick={resource.reload} className="mt-2 font-semibold underline">{t('simpleCampaign.retry')}</button>
      </div>
    );
  }
  const options = resource.data || [];
  if (options.length === 0) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-200" data-testid="simple-landing-empty">
        <p>{t('simpleCampaign.audience.landing.empty')}</p>
        <Link to="/app/settings/landing-pages" className="mt-1 inline-block font-semibold underline">{t('simpleCampaign.audience.landing.create')}</Link>
      </div>
    );
  }
  return (
    <div>
      <p className="mb-2 text-sm text-slate-600 dark:text-dk-text2">{t('simpleCampaign.audience.landing.hint')}</p>
      <ul className="max-h-60 space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-1.5 dark:border-dk-border">
        {options.map((option) => (
          <li key={option.value}>
            <label className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 hover:bg-slate-50 dark:hover:bg-dk-raised">
              <input
                type="checkbox"
                checked={slugs.includes(option.value)}
                onChange={() => toggle(option)}
                className="h-4 w-4 shrink-0 rounded border-slate-300 text-orange-500 focus:ring-orange-500 dark:border-dk-border-strong dark:bg-dk-inset"
              />
              <span className="min-w-0 truncate text-sm text-slate-800 dark:text-dk-text">{option.label}</span>
              {!option.published && (
                <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:bg-dk-raised dark:text-dk-text2">
                  {t('simpleCampaign.audience.landing.unpublished')}
                </span>
              )}
            </label>
          </li>
        ))}
      </ul>
      {slugs.length > 0 && (
        <p className="mt-2 text-xs text-slate-500 dark:text-dk-text2">{t('simpleCampaign.audience.landing.selected', { count: slugs.length })}</p>
      )}
    </div>
  );
}
