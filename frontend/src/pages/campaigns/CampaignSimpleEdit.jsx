import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { HiOutlineSparkles } from 'react-icons/hi';
import { useI18n } from '../../i18n';
import { useAuthStore } from '../../stores/authStore';
import PageHeader from '../../components/common/PageHeader';
import SimpleCampaignWizard from '../../features/campaigns/simple/SimpleCampaignWizard';
import useSimpleCampaignWizard from '../../features/campaigns/simple/useSimpleCampaignWizard';
import CampaignViewTabs, { LEGACY_SIMPLE_TABS } from '../../features/campaigns/components/CampaignViewTabs';
import CampaignTabSwitchModal from '../../features/campaigns/components/CampaignTabSwitchModal';
import { useBrowserRouterBlocker } from '../../features/campaigns/hooks/useBrowserRouterBlocker';

/**
 * `/app/campaigns/:id/simple` — tab "Từng bước" của MỘT chiến dịch đã có (PLAN_HAI_TAB_TUNG_BUOC_SO_DO_2026-10-17).
 * `/app/campaigns/:id` chuyển thẳng về đây: người mới nhìn sơ đồ khối dễ bị ngợp nên luôn mở Từng bước trước, ai cần chi tiết hơn thì
 * qua tab "Sơ đồ khối". Hai tab chỉ đồng bộ qua server: còn thay đổi chưa lưu mà đổi tab thì hỏi Lưu rồi chuyển / Bỏ thay đổi / Ở lại.
 */
export default function CampaignSimpleEdit() {
  const { id } = useParams();
  const { t } = useI18n();
  const navigate = useNavigate();
  const { activeContext } = useAuthStore();
  // Cùng công thức PermissionRoute: chủ tài khoản luôn được; nhân viên cần quyền cụ thể.
  const isEmployeeCtx = activeContext?.type === 'employee';
  const canSave = !isEmployeeCtx || activeContext?.permissions?.campaigns_create === true;
  const canRun = !isEmployeeCtx || activeContext?.permissions?.campaigns_run === true;

  const wizard = useSimpleCampaignWizard({ campaignId: id });
  const { isDirty } = wizard;
  const blocker = useBrowserRouterBlocker(isDirty);
  /** null | 'builder' (bấm tab) | 'blocked' (rời trang bằng đường khác: menu, nút Back…). */
  const [pendingLeave, setPendingLeave] = useState(null);
  const [isSavingBeforeLeave, setIsSavingBeforeLeave] = useState(false);

  useEffect(() => {
    if (blocker.state === 'blocked') setPendingLeave('blocked');
  }, [blocker.state]);

  useEffect(() => {
    if (!isDirty) return undefined;
    const handleBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  const builderPath = `/app/campaigns/${id}/builder`;

  const goBuilder = useCallback(() => {
    // `when` của bộ chặn còn true đến lần vẽ kế → cho qua đúng một lần điều hướng này.
    blocker.allowNext();
    navigate(builderPath);
  }, [blocker, navigate, builderPath]);

  const handleSelectTab = (tab) => {
    if (tab !== 'builder') return;
    if (isDirty) setPendingLeave('builder');
    else navigate(builderPath);
  };

  const handleStay = useCallback(() => {
    if (pendingLeave === 'blocked') blocker.reset();
    setPendingLeave(null);
  }, [pendingLeave, blocker]);

  const handleDiscard = () => {
    const kind = pendingLeave;
    setPendingLeave(null);
    if (kind === 'blocked') blocker.proceed();
    else goBuilder();
  };

  const handleSaveThenLeave = async () => {
    const kind = pendingLeave;
    setIsSavingBeforeLeave(true);
    const saved = await wizard.saveEdit('save');
    setIsSavingBeforeLeave(false);
    if (!saved) {
      // Lỗi cụ thể nằm ở màn Xem lại: đưa người dùng tới đó, ở lại trang.
      if (kind === 'blocked') blocker.reset();
      setPendingLeave(null);
      wizard.goToStep('review');
      toast.error(t('campaignTabs.saveFailed'));
      return;
    }
    setPendingLeave(null);
    if (kind === 'blocked') blocker.proceed();
    else goBuilder();
  };

  const title = wizard.editInfo?.campaignName || wizard.state.campaignName || t('simpleCampaign.edit.titleFallback');

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <PageHeader
        icon={HiOutlineSparkles}
        title={title}
        subtitle={t(wizard.isReadOnly || !canSave ? 'simpleCampaign.edit.subtitleReadOnly' : 'simpleCampaign.edit.subtitle')}
        onBack={() => navigate('/app/campaigns')}
        backLabel={t('simpleCampaign.backToList')}
      />
      <div className="flex flex-wrap items-center gap-3">
        <CampaignViewTabs active="simple" tabs={LEGACY_SIMPLE_TABS} onSelect={handleSelectTab} flowDisabled={!canSave} />
        {isDirty && (
          <span className="text-sm font-semibold text-amber-600 dark:text-amber-400" data-testid="simple-edit-dirty">
            {t('campaignTabs.unsaved')}
          </span>
        )}
      </div>
      <SimpleCampaignWizard
        wizard={wizard}
        permissions={{ canSave, canRun }}
        onOpenBuilder={() => (isDirty ? setPendingLeave('builder') : navigate(builderPath))}
      />
      <CampaignTabSwitchModal
        isOpen={pendingLeave !== null}
        isSaving={isSavingBeforeLeave}
        onSave={handleSaveThenLeave}
        onDiscard={handleDiscard}
        onStay={handleStay}
      />
    </div>
  );
}
