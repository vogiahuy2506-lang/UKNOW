import { useNavigate } from 'react-router-dom';
import { HiOutlineSparkles } from 'react-icons/hi';
import { useI18n } from '../../i18n';
import PageHeader from '../../components/common/PageHeader';
import SimpleCampaignWizard from '../../features/campaigns/simple/SimpleCampaignWizard';

/**
 * `/app/campaigns/simple` — tạo chiến dịch bằng cách trả lời vài câu hỏi (thay cho trình dựng sơ đồ khối).
 * Trang chỉ có tiêu đề; toàn bộ logic ở `features/campaigns/simple/`. Xem PLAN_TAO_CHIEN_DICH_TUNG_BUOC_2026-10-14.
 */
const SimpleCampaign = () => {
  const { t } = useI18n();
  const navigate = useNavigate();
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <PageHeader
        icon={HiOutlineSparkles}
        title={t('simpleCampaign.title')}
        subtitle={t('simpleCampaign.subtitle')}
        onBack={() => navigate('/app/campaigns')}
        backLabel={t('simpleCampaign.backToList')}
      />
      <SimpleCampaignWizard />
    </div>
  );
};

export default SimpleCampaign;
