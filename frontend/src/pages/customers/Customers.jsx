import { useSearchParams } from 'react-router-dom';
import { HiOutlineUsers } from 'react-icons/hi';
import { useI18n } from '../../i18n';
import PageContainer from '../../components/common/PageContainer';
import AllCustomersTab from '../../features/customers/components/AllCustomersTab';
import CampaignListTab from '../../features/customers/components/CampaignListTab';

const TABS = ['all', 'campaigns'];

/**
 * `/app/customers` — hai cách xem khách: "Tất cả khách" (mặc định, toàn bộ khách của không gian làm việc)
 * và "Theo chiến dịch" (chọn chiến dịch → `/app/customers/:campaignId`). Tab nằm trên URL (`?tab=campaigns`)
 * để F5 / chia sẻ link giữ nguyên.
 */
const Customers = () => {
  const { t } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = TABS.includes(searchParams.get('tab')) ? searchParams.get('tab') : 'all';

  const selectTab = (key) => {
    setSearchParams(key === 'all' ? {} : { tab: key }, { replace: true });
  };

  return (
    <PageContainer icon={HiOutlineUsers} title={t('customers.title')} subtitle={t('customers.subtitle')}>
      <div className="flex gap-1 border-b border-slate-200 dark:border-dk-border" role="tablist">
        {TABS.map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => selectTab(key)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold transition-colors ${
              tab === key
                ? 'border-orange-500 text-orange-600 dark:text-orange-400'
                : 'border-transparent text-slate-500 dark:text-dk-text2 hover:text-slate-700 dark:hover:text-dk-text'
            }`}
          >
            {t(`customers.tabs.${key}`)}
          </button>
        ))}
      </div>
      {tab === 'all' ? <AllCustomersTab /> : <CampaignListTab />}
    </PageContainer>
  );
};

export default Customers;
