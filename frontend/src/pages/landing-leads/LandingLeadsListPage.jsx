import { useSearchParams } from 'react-router-dom';
import { HiOutlineUsers } from 'react-icons/hi';
import PageContainer from '../../components/common/PageContainer';
import { useAuthStore } from '../../stores/authStore';
import { useI18n } from '../../i18n';
import LandingLeadsTab from './LandingLeadsTab.jsx';
import FormLeadsTab from './FormLeadsTab.jsx';

// Mỗi tab cần một quyền nhân viên riêng: khách từ landing page → `leads`, bài nộp biểu mẫu → `forms`.
// Chủ tài khoản (ngữ cảnh self) luôn thấy cả hai.
const TABS = [
  { key: 'landing', permission: 'leads', labelKey: 'landingLeads.tabLanding' },
  { key: 'forms', permission: 'forms', labelKey: 'landingLeads.tabForms' },
];

/**
 * `/app/landing-leads` — màn "Khách để lại thông tin": gom khách từ MỌI nguồn vào một chỗ, hai tab con vì một
 * landing page có thể có cả form viết trong HTML (bảng `leads`) lẫn nhiều biểu mẫu (bảng `form_submissions`).
 *
 *  - "Từ landing page" (mặc định, `leads`): nội dung của trang cũ, giữ nguyên.
 *  - "Từ biểu mẫu" (`forms`): bài nộp của mọi biểu mẫu trong workspace.
 *
 * Tab nằm trên URL (`?tab=forms`) để F5 / chia sẻ link giữ nguyên. Thiếu quyền tab nào thì ẩn tab đó, và
 * `?tab=` trỏ vào tab không được phép thì rơi về tab đầu tiên còn xem được (cổng route chỉ cần MỘT trong hai quyền).
 */
export default function LandingLeadsListPage() {
  const { t } = useI18n();
  const activeContext = useAuthStore((state) => state.activeContext);
  const [searchParams, setSearchParams] = useSearchParams();

  const isEmployee = activeContext?.type === 'employee';
  const visibleTabs = TABS.filter((tab) => !isEmployee || activeContext?.permissions?.[tab.permission] === true);
  const requestedTab = searchParams.get('tab');
  const activeTab = (visibleTabs.find((tab) => tab.key === requestedTab) || visibleTabs[0] || null)?.key ?? null;

  const selectTab = (key) => {
    setSearchParams(key === TABS[0].key ? {} : { tab: key }, { replace: true });
  };

  return (
    <PageContainer
      icon={HiOutlineUsers}
      title={t('landingLeads.pageTitle')}
      subtitle={t('landingLeads.pageDescription')}
    >
      {visibleTabs.length > 1 ? (
        <div
          className="flex gap-1 border-b border-slate-200 dark:border-dk-border"
          role="tablist"
          aria-label={t('landingLeads.tabsLabel')}
        >
          {visibleTabs.map((tab) => (
            <button
              key={tab.key}
              id={`leads-tab-${tab.key}`}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.key}
              aria-controls={`leads-tabpanel-${tab.key}`}
              onClick={() => selectTab(tab.key)}
              className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold transition-colors ${
                activeTab === tab.key
                  ? 'border-orange-500 text-orange-600 dark:text-orange-400'
                  : 'border-transparent text-slate-500 dark:text-dk-text2 hover:text-slate-700 dark:hover:text-dk-text'
              }`}
            >
              {t(tab.labelKey)}
            </button>
          ))}
        </div>
      ) : null}

      {activeTab ? (
        <div role="tabpanel" id={`leads-tabpanel-${activeTab}`} aria-labelledby={visibleTabs.length > 1 ? `leads-tab-${activeTab}` : undefined}>
          {activeTab === 'forms' ? <FormLeadsTab /> : <LandingLeadsTab />}
        </div>
      ) : null}
    </PageContainer>
  );
}
