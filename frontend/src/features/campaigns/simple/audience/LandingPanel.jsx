import { fetchLandingLeadsSlugFilterOptions } from '../../../landing/utils/landingLeadsSlugFilterOptions';
import useAsyncResource from '../useAsyncResource';

/**
 * "Người để lại thông tin trên landing page": chọn một hoặc nhiều trang. `fetchLandingLeadsSlugFilterOptions` tự nuốt lỗi
 * mạng (rơi về trang mặc định `l`), nên bước này không bao giờ trống vì lỗi tải.
 *
 * @param {object} props
 * @param {string[]} props.slugs
 * @param {(patch: object) => void} props.patchAudience
 * @param {(key: string, params?: object) => string} props.t
 */
export default function LandingPanel({ slugs, patchAudience, t }) {
  const resource = useAsyncResource(() => fetchLandingLeadsSlugFilterOptions(), []);

  const toggle = (value) => {
    patchAudience({ slugs: slugs.includes(value) ? slugs.filter((item) => item !== value) : [...slugs, value] });
  };

  if (resource.status === 'loading') {
    return <p className="text-sm text-slate-500 dark:text-dk-text2" role="status">{t('simpleCampaign.audience.loading')}</p>;
  }
  const options = Array.isArray(resource.data) ? resource.data : [];
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
                onChange={() => toggle(option.value)}
                className="h-4 w-4 shrink-0 rounded border-slate-300 text-orange-500 focus:ring-orange-500 dark:border-dk-border-strong dark:bg-dk-inset"
              />
              <span className="min-w-0 truncate text-sm text-slate-800 dark:text-dk-text">{option.label}</span>
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
