import { HiOutlineAdjustments, HiOutlineSparkles, HiOutlineViewGrid } from 'react-icons/hi';
import { useI18n } from '../../../i18n';

/** Hai tab của chi tiết MỘT chiến dịch: `Thiết lập` (mọi cài đặt viết tường minh) và `Sơ đồ khối` (kéo thả). */
export const CAMPAIGN_DETAIL_TABS = Object.freeze([
  { id: 'settings', icon: HiOutlineAdjustments, labelKey: 'campaignTabs.settings', gated: false },
  { id: 'flow', icon: HiOutlineViewGrid, labelKey: 'campaignTabs.flow', gated: true },
]);

/**
 * Cặp tab cũ `Từng bước` ⇄ `Sơ đồ khối` của màn `CampaignSimpleEdit`. Màn đó đã gỡ khỏi route (PLAN_THIET_LAP_VA_SO_DO_2026-10-17,
 * PR-2) và sẽ bị xoá ở PR-3; giữ tạm để file đó còn biên dịch và test của nó còn chạy.
 */
export const LEGACY_SIMPLE_TABS = Object.freeze([
  { id: 'simple', icon: HiOutlineSparkles, labelKey: 'campaignTabs.simple', gated: false },
  { id: 'builder', icon: HiOutlineViewGrid, labelKey: 'campaignTabs.builder', gated: true },
]);

/**
 * Thanh tab dùng chung ở đầu trang chi tiết MỘT chiến dịch: `Thiết lập` | `Sơ đồ khối`.
 * Bấm tab KHÔNG tự điều hướng: cha quyết định (đặt `?tab=` trên URL). Hai tab dùng chung dữ liệu nên không cần hỏi "lưu rồi chuyển".
 *
 * @param {object} props
 * @param {'settings'|'flow'} props.active
 * @param {(tab: 'settings'|'flow') => void} props.onSelect
 * @param {boolean} [props.flowDisabled] thiếu quyền dựng chiến dịch (campaigns_create) → tab Sơ đồ khối mờ, không bấm được
 * @param {Array<object>} [props.tabs] danh sách tab (mặc định {@link CAMPAIGN_DETAIL_TABS})
 * @param {string} [props.className]
 */
export default function CampaignViewTabs({ active, onSelect, flowDisabled = false, tabs = CAMPAIGN_DETAIL_TABS, className = '' }) {
  const { t } = useI18n();
  return (
    <div
      role="tablist"
      aria-label={t('campaignTabs.label')}
      className={`inline-flex max-w-full gap-1 rounded-xl border border-slate-200 bg-slate-100/80 p-1 dark:border-dk-border dark:bg-dk-inset ${className}`}
      data-testid="campaign-view-tabs"
    >
      {tabs.map(({ id, icon: Icon, labelKey, gated }) => {
        const selected = active === id;
        const disabled = gated && flowDisabled;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-disabled={disabled || undefined}
            disabled={disabled}
            title={disabled ? t('campaignTabs.builderNoPermission') : undefined}
            data-testid={`campaign-tab-${id}`}
            onClick={() => {
              if (!selected && !disabled) onSelect(id);
            }}
            className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 py-1.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
              selected
                ? 'bg-white text-orange-700 shadow-sm dark:bg-dk-surface dark:text-orange-300'
                : 'text-slate-600 hover:text-slate-900 dark:text-dk-text2 dark:hover:text-dk-text'
            }`}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {t(labelKey)}
          </button>
        );
      })}
    </div>
  );
}
