import { useState } from 'react';
import toast from 'react-hot-toast';
import adminPlansApiService from '../services/adminPlansApi.service';
import { renderModal, emptyForm, fmtVnd, MODAL_FORM } from './planUtils.jsx';
import { PriceInput, FeatureEditor, SendLimitsFields, EmployeeInput, ResourceLimitsFields, DurationInput, PeriodMessagesField } from './PlanInputs';
import { Field, FormSection, ModalShell, normalizePlanPayload, PLAN_PRESETS } from './PlanModalsShared.jsx';
import { useI18n } from '../../../i18n';

// ── PlanFormModal — tạo mới + chỉnh sửa gói đại trà ─────────────────────────
export const PlanFormModal = ({ plan, onClose, onSaved, existingPlanCodes = [] }) => {
  const { t } = useI18n();
  const isEdit = !!plan?.id;
  const [form, setForm] = useState(plan ? {
    code: plan.code || '',
    name: plan.name || '',
    price: plan.price ?? 0,
    priceYearly: plan.priceYearly ?? '',
    description: plan.description || '',
    maxEmployees: plan.maxEmployees ?? -1,
    isActive: plan.isActive ?? true,
    features: plan.features || [],
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
  } : emptyForm());
  const [isSaving, setIsSaving] = useState(false);
  const set = (key, val) => setForm((p) => ({ ...p, [key]: val }));
  const isContactPlanCode = String(form.code || '').trim().toLowerCase() === 'custom';
  const existingCodeSet = new Set(existingPlanCodes.map((code) => String(code || '').trim().toLowerCase()).filter(Boolean));
  const applyPreset = (preset) => {
    setForm((prev) => ({
      ...prev,
      ...preset,
      description: prev.description,
      features: prev.features,
      isActive: prev.isActive,
      code: isEdit ? prev.code : preset.code,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error(t('adminPlans.planNameRequired')); return; }
    const normalizedCode = String(form.code || '').trim().toLowerCase();
    if (!isEdit && normalizedCode && existingCodeSet.has(normalizedCode)) {
      toast.error(t('adminPlans.planCodeExists', { code: form.code.trim() }));
      return;
    }
    try {
      setIsSaving(true);
      const payload = normalizePlanPayload(form);
      if (isEdit) {
        await adminPlansApiService.updatePlan(plan.id, payload);
        toast.success(t('adminPlans.planUpdated'));
      } else {
        await adminPlansApiService.createPlan(payload);
        toast.success(t('adminPlans.planCreated'));
      }
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err?.response?.data?.message || t('adminPlans.saveFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  return renderModal(
    <ModalShell
      onSubmit={handleSubmit}
      title={isEdit ? t('adminPlans.editPlan') : t('adminPlans.createNewPlan')}
      subtitle={isEdit ? t('adminPlans.standardEditSubtitle') : t('adminPlans.standardCreateSubtitle')}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={isSaving}>{t('common.cancel')}</button>
          <button type="submit" className="btn btn-primary px-6" disabled={isSaving}>
            {isSaving ? t('common.processing') : isEdit ? t('adminPlans.saveChanges') : t('adminPlans.createPlan')}
          </button>
        </>
      }
    >
      {!isEdit && (
        <FormSection
          kicker={t('adminPlans.sectionFastSetup')}
          title={t('adminPlans.presetTitle')}
          description={t('adminPlans.presetDescription')}
        >
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {PLAN_PRESETS.map((preset) => (
              <button
                key={preset.code}
                type="button"
                onClick={() => applyPreset(preset)}
                className={`rounded-xl border px-4 py-3 text-left transition-all ${
                  form.code === preset.code
                    ? 'border-orange-300 bg-orange-50 text-orange-700 shadow-sm'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-orange-200 hover:bg-orange-50/60'
                }`}
              >
                <span className="block text-sm font-bold">{preset.name}</span>
                <span className="mt-1 block text-xs text-slate-500">{fmtVnd(preset.price)} / {preset.durationDays === 10 ? '10 ngày' : 'tháng'}</span>
              </button>
            ))}
          </div>
        </FormSection>
      )}

      <FormSection
        kicker={t('adminPlans.sectionGeneral')}
        title={t('adminPlans.generalInfoTitle')}
        description={t('adminPlans.generalInfoDescription')}
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label={`${t('planInputs.planName')} *`} className="md:col-span-2">
            <input type="text" className="input h-11 w-full" value={form.name}
              onChange={(e) => set('name', e.target.value)} placeholder={t('planInputs.planNamePlaceholder')} />
          </Field>
          <Field label={t('planInputs.planCodeLabel')} note={isEdit ? t('adminPlans.codeCannotChange') : null}>
            <input type="text" className="input h-11 w-full" value={form.code}
              onChange={(e) => set('code', e.target.value)} placeholder={t('planInputs.planCodePlaceholder')} disabled={isEdit} />
          </Field>
          <Field label={t('planInputs.durationLabel')}>
            <DurationInput value={form.durationDays} onChange={(v) => set('durationDays', v)} />
          </Field>
          <Field label={t('planInputs.descriptionLabel')} className="md:col-span-2">
            <textarea rows={3} className="input w-full resize-none" value={form.description}
              onChange={(e) => set('description', e.target.value)} placeholder={t('planInputs.descriptionPlaceholder')} />
          </Field>
        </div>
      </FormSection>

      <FormSection
        kicker={t('adminPlans.sectionCommerce')}
        title={t('adminPlans.pricingAndAccessTitle')}
        description={t('adminPlans.pricingAndAccessDescription')}
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label={t('planInputs.planPricePerMonth')} note={isContactPlanCode ? t('adminPlans.contactPlanPriceHint') : null}>
            <PriceInput value={form.price} onChange={(v) => set('price', v)} className="input h-11 w-full" />
          </Field>
          <Field label={t('planInputs.planPriceYearly')} note={t('adminPlans.yearlyPriceHint')}>
            <PriceInput value={form.priceYearly || 0} onChange={(v) => set('priceYearly', v > 0 ? v : '')} className="input h-11 w-full" />
          </Field>
          <Field label={t('planInputs.employeesLabel')}>
            <EmployeeInput value={form.maxEmployees} onChange={(v) => set('maxEmployees', v)} className="input h-11 w-full" />
          </Field>
          <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <input type="checkbox" id="isActive" className="h-4 w-4 rounded text-primary-600"
              checked={form.isActive} onChange={(e) => set('isActive', e.target.checked)} />
            <label htmlFor="isActive" className="ml-3 cursor-pointer">
              <span className="block text-sm font-semibold text-slate-800">{t('adminPlans.displayPublic')}</span>
              <span className="text-xs text-slate-500">{t('adminPlans.displayPublicHint')}</span>
            </label>
          </div>
        </div>
      </FormSection>

      <FormSection
        kicker={t('adminPlans.sectionLimits')}
        title={t('planInputs.sendLimits')}
        description={t('adminPlans.sendLimitsDescription')}
      >
        <SendLimitsFields form={form} set={set} hint={t('planInputs.hintEmailLimitsBackendBlocked')} />
        <div className="mt-5 border-t border-slate-100 pt-5">
          <PeriodMessagesField form={form} set={set} />
        </div>
      </FormSection>

      <FormSection
        kicker={t('adminPlans.sectionResources')}
        title={t('planInputs.resourceLimits')}
        description={t('adminPlans.resourceLimitsDescription')}
      >
        <ResourceLimitsFields form={form} set={set} hint={t('planInputs.hintResourceApplyImmediately')} />
      </FormSection>

      <FormSection
        kicker={t('adminPlans.sectionPricingPage')}
        title={t('planInputs.featuresLabel')}
        description={t('adminPlans.featuresDescription')}
      >
        <FeatureEditor features={form.features} onChange={(f) => set('features', f)} />
      </FormSection>
    </ModalShell>,
    () => { if (!isSaving) onClose(); },
    MODAL_FORM
  );
};
