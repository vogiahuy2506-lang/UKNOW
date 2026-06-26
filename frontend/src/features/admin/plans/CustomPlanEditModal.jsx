import { useState } from 'react';
import toast from 'react-hot-toast';
import adminPlansApiService from '../services/adminPlansApi.service';
import { renderModal, MODAL_FORM } from './planUtils.jsx';
import { PriceInput, SendLimitsFields, EmployeeInput, ResourceLimitsFields, DurationInput, PeriodMessagesField, LimitInput } from './PlanInputs';
import { Field, FormSection, ModalShell, normalizePlanPayload } from './PlanModalsShared.jsx';
import { useI18n } from '../../../i18n';

// ── CustomPlanEditModal — chỉnh sửa gói riêng (không có code / tính năng) ────
export const CustomPlanEditModal = ({ plan, onClose, onSaved }) => {
  const { t } = useI18n();
  const [form, setForm] = useState({
    name: plan.name || '',
    price: plan.price ?? 0,
    priceYearly: plan.priceYearly ?? '',
    description: plan.description || '',
    maxEmployees: plan.maxEmployees ?? -1,
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
    aiCreditsPerPeriod: plan.aiCreditsPerPeriod ?? '',
    gracePeriodDays: plan.gracePeriodDays ?? '',
  });
  const [isSaving, setIsSaving] = useState(false);
  const set = (key, val) => setForm((p) => ({ ...p, [key]: val }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error(t('adminPlans.planNameRequired')); return; }
    try {
      setIsSaving(true);
      await adminPlansApiService.updatePlan(plan.id, { ...normalizePlanPayload(form), isActive: plan.isActive ?? true, features: [] });
      toast.success(t('adminPlans.planUpdated'));
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
      title={t('adminPlans.editPlan')}
      subtitle={plan.assignedEmail
        ? `${t('adminPlans.enterprise')}: ${plan.assignedName || plan.assignedEmail}`
        : t('adminPlans.customPlanEditSubtitle')}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={isSaving}>{t('common.cancel')}</button>
          <button type="submit" className="btn btn-primary px-6" disabled={isSaving}>
            {isSaving ? t('common.processing') : t('adminPlans.saveChanges')}
          </button>
        </>
      }
    >
      <FormSection
        kicker={t('adminPlans.sectionGeneral')}
        title={t('adminPlans.generalInfoTitle')}
        description={t('adminPlans.customPlanEditDescription')}
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label={t('planInputs.planName')} className="md:col-span-2">
            <input type="text" className="input h-11 w-full" value={form.name}
              onChange={(e) => set('name', e.target.value)} />
          </Field>
          <Field label={t('planInputs.planPricePerMonth')}>
            <PriceInput value={form.price} onChange={(v) => set('price', v)} className="input h-11 w-full" />
          </Field>
          <Field label={t('planInputs.planPriceYearly')} note={t('adminPlans.yearlyPriceHint')}>
            <PriceInput value={form.priceYearly || 0} onChange={(v) => set('priceYearly', v > 0 ? v : '')} className="input h-11 w-full" />
          </Field>
          <Field label={t('planInputs.employeesLabel')}>
            <EmployeeInput value={form.maxEmployees} onChange={(v) => set('maxEmployees', v)} className="input h-11 w-full" />
          </Field>
          <Field label={t('planInputs.durationLabel')}>
            <DurationInput value={form.durationDays} onChange={(v) => set('durationDays', v)} />
          </Field>
          <Field label="Số ngày ân hạn sau hết hạn" note="0 = chặn ngay khi hết hạn gói">
            <LimitInput value={form.gracePeriodDays ?? ''} onChange={(v) => set('gracePeriodDays', v)} />
          </Field>
          <Field label={t('planInputs.descriptionNotesLabel')} className="md:col-span-2">
            <textarea rows={3} className="input w-full resize-none" placeholder={t('planInputs.descriptionNotesPlaceholder')}
              value={form.description} onChange={(e) => set('description', e.target.value)} />
          </Field>
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
    </ModalShell>,
    () => { if (!isSaving) onClose(); },
    MODAL_FORM
  );
};
