import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useI18n } from '../../i18n';
import { HiOutlinePlus, HiOutlineRefresh, HiOutlineSparkles } from 'react-icons/hi';
import adminPlansApiService from '../../features/admin/services/adminPlansApi.service';
import { renderModal, MODAL_SM } from '../../features/admin/plans/planUtils.jsx';
import { PlanCard, CustomPlanCard } from '../../features/admin/plans/PlanCards';
import { PlanFormModal, AssignModal, CustomPlanModal, CustomPlanEditModal } from '../../features/admin/plans/PlanModals';

const SkeletonGrid = () => (
  <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
    {[...Array(3)].map((_, i) => <div key={i} className="card p-5 h-52 animate-pulse bg-gray-50" />)}
  </div>
);

const buildPlanUpdatePayload = (plan, overrides = {}) => ({
  name: plan.name,
  price: Number(plan.price ?? 0),
  priceYearly: plan.priceYearly ?? '',
  description: plan.description || '',
  features: plan.features || [],
  maxEmployees: Number(plan.maxEmployees ?? 0),
  isActive: plan.isActive ?? true,
  durationDays: plan.durationDays ?? '',
  dailyEmailLimit: plan.dailyEmailLimit ?? '',
  monthlyEmailLimit: plan.monthlyEmailLimit ?? '',
  dailyZaloLimit: plan.dailyZaloLimit ?? '',
  monthlyZaloLimit: plan.monthlyZaloLimit ?? '',
  messagesPerPeriod: plan.messagesPerPeriod ?? '',
  isFupEnabled: plan.isFupEnabled ?? false,
  maxLandingPages: plan.maxLandingPages ?? '',
  maxCampaigns: plan.maxCampaigns ?? '',
  maxZaloCampaigns: plan.maxZaloCampaigns ?? '',
  maxZaloGroupCampaigns: plan.maxZaloGroupCampaigns ?? '',
  maxEmailCampaigns: plan.maxEmailCampaigns ?? '',
  maxZaloAccounts: plan.maxZaloAccounts ?? '',
  maxEmailAccounts: plan.maxEmailAccounts ?? '',
  maxEmailTemplates: plan.maxEmailTemplates ?? '',
  maxZaloTemplates: plan.maxZaloTemplates ?? '',
  maxChatbots: plan.maxChatbots ?? '',
  aiTokensPerPeriod: plan.aiTokensPerPeriod ?? '',
  ...overrides,
});

const AdminPlansPage = () => {
  const { t } = useI18n();
  const [tab, setTab]                 = useState('public');
  const [plans, setPlans]             = useState([]);
  const [customPlans, setCustomPlans] = useState([]);
  const [isLoading, setIsLoading]     = useState(true);
  const [editPlan, setEditPlan]       = useState(null);
  const [assignPlan, setAssignPlan]   = useState(null);
  const [deletePlan, setDeletePlan]   = useState(null);
  const [isDeleting, setIsDeleting]   = useState(false);
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [showHidden, setShowHidden]           = useState(false);

  const fetchPlans = async () => {
    setIsLoading(true);
    try {
      const res = await adminPlansApiService.getPlans();
      setPlans(res.data.data || []);
    } catch { toast.error(t('adminPlans.loadFailed')); }
    finally { setIsLoading(false); }
  };

  const fetchCustomPlans = async (hidden = showHidden) => {
    setIsLoading(true);
    try {
      const res = await adminPlansApiService.getCustomPlans(hidden);
      setCustomPlans(res.data.data || []);
    } catch { toast.error(t('adminPlans.loadCustomFailed')); }
    finally { setIsLoading(false); }
  };

  useEffect(() => {
    if (tab === 'public') fetchPlans();
    else fetchCustomPlans(showHidden);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchPlans/fetchCustomPlans stable trong scope
  }, [tab, showHidden]);

  const handleRefresh = () => tab === 'public' ? fetchPlans() : fetchCustomPlans();

  const handleActivate = async (plan) => {
    if (!plan.assignedEmail) return;
    try {
      await adminPlansApiService.assignPlan(plan.id, plan.assignedEmail);
      toast.success(`${t('adminPlans.activated')} "${plan.name}" cho ${plan.assignedEmail}`);
      fetchCustomPlans();
    } catch (err) {
      toast.error(err?.response?.data?.message || t('adminPlans.activateFailed'));
    }
  };

  const handleToggleVisibility = async (plan) => {
    try {
      await adminPlansApiService.updatePlan(plan.id, buildPlanUpdatePayload(plan, { isActive: !plan.isActive }));
      toast.success(plan.isActive ? t('adminPlans.planHidden') : t('adminPlans.planVisible'));
      fetchPlans();
    } catch (err) {
      toast.error(err?.response?.data?.message || t('adminPlans.updateStatusFailed'));
    }
  };

  const handleRestore = async (plan) => {
    try {
      await adminPlansApiService.updatePlan(plan.id, buildPlanUpdatePayload(plan, { isActive: true }));
      toast.success(`${t('adminPlans.restored')} "${plan.name}"`);
      fetchCustomPlans();
    } catch (err) {
      toast.error(err?.response?.data?.message || t('adminPlans.restoreFailed'));
    }
  };

  const handleDelete = async () => {
    try {
      setIsDeleting(true);
      const res = await adminPlansApiService.deletePlan(deletePlan.id);
      const data = res?.data;
      const isSoftDelete = data?.data?.mode === 'soft';
      const message = data?.message || (isSoftDelete ? 'Đã ẩn gói' : 'Đã xóa gói dịch vụ');
      if (isSoftDelete) {
        toast(message, { icon: 'ℹ️', duration: 5000 });
      } else {
        toast.success(message);
      }
      setDeletePlan(null);
      handleRefresh();
    } catch (err) {
      toast.error(err?.response?.data?.message || t('adminPlans.deleteFailed'));
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('adminPlans.title')}</h1>
          <p className="text-gray-500 mt-1">{t('adminPlans.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={handleRefresh} className="btn btn-secondary" disabled={isLoading}>
            <HiOutlineRefresh className="w-4 h-4 mr-2" />
            {t('common.refresh')}
          </button>
          {tab === 'custom' ? (
            <button type="button" onClick={() => setShowCustomModal(true)} className="btn btn-primary">
              <HiOutlineSparkles className="w-4 h-4 mr-2" />
              {t('adminPlans.createCustomPlan')}
            </button>
          ) : (
            <button type="button" onClick={() => setEditPlan('new')} className="btn btn-primary">
              <HiOutlinePlus className="w-4 h-4 mr-2" />
              {t('adminPlans.createPlan')}
            </button>
          )}
        </div>
      </div>

      {/* Toggle tabs */}
      <div className="flex bg-gray-100 rounded-lg p-1 w-fit">
        {[
          { key: 'public', label: t('adminPlans.tabPublicPlans') },
          { key: 'custom', label: t('adminPlans.tabCustomPlans'), count: customPlans.length },
        ].map(({ key, label, count }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`px-5 py-2 rounded-md text-sm font-medium transition-all ${tab === key ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
          >
            {label}
            {count > 0 && (
              <span className="ml-2 text-xs bg-primary-100 text-primary-700 px-1.5 py-0.5 rounded-full">
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab: Gói đại trà */}
      {tab === 'public' && (
        isLoading ? <SkeletonGrid /> :
        plans.length === 0 ? (
          <div className="card p-10 text-center text-gray-400">{t('adminPlans.noPlans')}</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {plans.map((plan) => (
              <PlanCard key={plan.id} plan={plan}
                onEdit={(p)   => setEditPlan(p)}
                onDelete={(p) => setDeletePlan(p)}
                onAssign={(p) => setAssignPlan(p)}
                onToggle={(p) => handleToggleVisibility(p)}
              />
            ))}
          </div>
        )
      )}

      {/* Tab: Gói riêng */}
      {tab === 'custom' && (
        <>
          <label className="flex items-center gap-2 cursor-pointer select-none w-fit">
            <input
              type="checkbox"
              className="w-4 h-4 text-primary-600 rounded"
              checked={showHidden}
              onChange={(e) => setShowHidden(e.target.checked)}
            />
            <span className="text-sm text-gray-500">{t('adminPlans.showHiddenPlans')}</span>
          </label>
          {isLoading ? <SkeletonGrid /> :
          customPlans.length === 0 ? (
            <div className="card p-10 text-center text-gray-400">
              <p>{t('adminPlans.noCustomPlans')}</p>
              <button type="button" onClick={() => setShowCustomModal(true)} className="btn btn-primary mt-4">
                <HiOutlineSparkles className="w-4 h-4 mr-2" />
                {t('adminPlans.createFirstCustom')}
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {customPlans.map((plan) => (
                <CustomPlanCard key={plan.id} plan={plan}
                  onEdit={(p)     => setEditPlan(p)}
                  onDelete={(p)   => setDeletePlan(p)}
                  onActivate={(p) => handleActivate(p)}
                  onRestore={(p)  => handleRestore(p)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Modals */}
      {showCustomModal && (
        <CustomPlanModal onClose={() => setShowCustomModal(false)} onSaved={fetchCustomPlans} />
      )}
      {editPlan && (
        editPlan !== 'new' && editPlan.is_custom
          ? <CustomPlanEditModal plan={editPlan} onClose={() => setEditPlan(null)} onSaved={handleRefresh} />
          : <PlanFormModal
              plan={editPlan === 'new' ? null : editPlan}
              existingPlanCodes={plans.map((plan) => plan.code)}
              onClose={() => setEditPlan(null)}
              onSaved={handleRefresh}
            />
      )}
      {assignPlan && (
        <AssignModal plan={assignPlan} onClose={() => setAssignPlan(null)} onAssigned={fetchPlans} />
      )}
      {deletePlan && renderModal(
        (() => {
          const isCustom = deletePlan.isCustom ?? deletePlan.is_custom;
          const hasUsers = (deletePlan.user_count > 0) || !!deletePlan.assignedEmail;
          return (
            <div>
              <h2 className="text-xl font-semibold text-gray-900">{t('adminPlans.confirmDelete')}</h2>
              <p className="text-sm text-gray-600 mt-2">
                {t('adminPlans.deletePlanConfirm')} <strong>{deletePlan.name}</strong>?
              </p>

              {isCustom && hasUsers && (
                <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm">
                  <p className="font-medium text-red-700">{t('adminPlans.customPlanWarning')}</p>
                  <p className="text-red-600 mt-1">
                    {deletePlan.assignedEmail
                      ? <>{t('adminPlans.customPlanUserImpact', { email: deletePlan.assignedEmail })}</>
                      : <>{deletePlan.user_count} {t('adminPlans.customPlanCountImpact')}</>}
                  </p>
                  <p className="text-gray-500 italic text-xs mt-2">
                    {t('adminPlans.orderHistoryPreserved')}
                  </p>
                </div>
              )}

              {!isCustom && hasUsers && (
                <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm">
                  <p className="font-medium text-amber-700">{t('adminPlans.standardPlanWarning')}</p>
                  <p className="text-amber-600 mt-1">
                    {deletePlan.user_count > 0 && <>{deletePlan.user_count} {t('adminPlans.standardPlanUserImpact')}</>}
                    {' '}{t('adminPlans.newCustomersCannotSee')}
                  </p>
                </div>
              )}

              {!hasUsers && (
                <p className="text-xs text-gray-400 italic mt-2">
                  {t('adminPlans.noUsersWarning')}
                </p>
              )}

              <div className="flex justify-end gap-2 mt-6">
                <button type="button" className="btn btn-secondary" onClick={() => setDeletePlan(null)} disabled={isDeleting}>{t('common.cancel')}</button>
                <button type="button"
                  className="btn btn-primary bg-red-600 hover:bg-red-700 border-red-600"
                  onClick={handleDelete} disabled={isDeleting}
                >
                  {isDeleting ? t('adminPlans.deleting') : (isCustom && hasUsers ? t('adminPlans.deleteAndTerminate') : t('adminPlans.confirmDeleteButton'))}
                </button>
              </div>
            </div>
          );
        })(),
        () => { if (!isDeleting) setDeletePlan(null); },
        MODAL_SM
      )}
    </div>
  );
};

export default AdminPlansPage;
