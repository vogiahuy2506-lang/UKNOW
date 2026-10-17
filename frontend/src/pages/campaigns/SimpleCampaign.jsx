import { useNavigate } from 'react-router-dom';
import { HiOutlineSparkles } from 'react-icons/hi';
import { useI18n } from '../../i18n';
import PageHeader from '../../components/common/PageHeader';
import SimpleCampaignWizard from '../../features/campaigns/simple/SimpleCampaignWizard';
import useSimpleCampaignWizard from '../../features/campaigns/simple/useSimpleCampaignWizard';

/**
 * `/app/campaigns/simple` — tạo chiến dịch (toàn màn hình, không header toàn cục) bằng cách trả lời vài câu hỏi (thay cho trình dựng sơ đồ khối).
 * Trang chỉ có tiêu đề; toàn bộ logic ở `features/campaigns/simple/`. Xem PLAN_TAO_CHIEN_DICH_TUNG_BUOC_2026-10-14.
 * Mở/sửa một chiến dịch đã có: `CampaignSimpleEdit` (`/app/campaigns/:id/simple`).
 */
const SimpleCampaign = () => {
  const { t } = useI18n();
  const navigate = useNavigate();
  const wizard = useSimpleCampaignWizard();
  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
      <PageHeader
        icon={HiOutlineSparkles}
        title={t('simpleCampaign.title')}
        subtitle={t('simpleCampaign.subtitle')}
        onBack={() => navigate('/app/campaigns')}
        backLabel={t('simpleCampaign.backToList')}
      />
      <SimpleCampaignWizard wizard={wizard} />
    </div>
  );
};

export default SimpleCampaign;
