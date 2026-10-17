import { HiOutlineSparkles, HiOutlineViewGrid } from 'react-icons/hi';
import { useI18n } from '../../../i18n';

/**
 * Thanh tab dùng chung ở đầu hai màn của MỘT chiến dịch: `Từng bước` (`/app/campaigns/:id/simple`) và `Sơ đồ khối`
 * (`/app/campaigns/:id/builder`). PLAN_HAI_TAB_TUNG_BUOC_SO_DO_2026-10-17: mở chiến dịch luôn vào Từng bước trước
 * (người mới nhìn sơ đồ khối dễ bị ngợp); ai muốn chi tiết hơn thì tự qua Sơ đồ khối.
 *
 * Bấm tab KHÔNG tự điều hướng: cha quyết định (có thể hỏi "Lưu rồi chuyển / Bỏ thay đổi / Ở lại" khi còn thay đổi chưa lưu).
 *
 * @param {object} props
 * @param {'simple'|'builder'} props.active
 * @param {(tab: 'simple'|'builder') => void} props.onSelect
 * @param {boolean} [props.builderDisabled] thiếu quyền dựng chiến dịch (campaigns_create) → tab Sơ đồ khối mờ, không bấm được
 * @param {string} [props.className]
 */
export default function CampaignViewTabs({ active, onSelect, builderDisabled = false, className = '' }) {
  const { t } = useI18n();
  const tabs = [
    { id: 'simple', icon: HiOutlineSparkles, label: t('campaignTabs.simple'), disabled: false },
    { id: 'builder', icon: HiOutlineViewGrid, label: t('campaignTabs.builder'), disabled: builderDisabled },
  ];
  return (
    <div
      role="tablist"
      aria-label={t('campaignTabs.label')}
      className={`inline-flex max-w-full gap-1 rounded-xl border border-slate-200 bg-slate-100/80 p-1 dark:border-dk-border dark:bg-dk-inset ${className}`}
      data-testid="campaign-view-tabs"
    >
      {tabs.map(({ id, icon: Icon, label, disabled }) => {
        const selected = active === id;
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
            {label}
          </button>
        );
      })}
    </div>
  );
}
