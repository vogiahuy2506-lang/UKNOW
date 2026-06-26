import { useState } from 'react';
import toast from 'react-hot-toast';
import adminPlansApiService from '../services/adminPlansApi.service';
import { renderModal, MODAL_FORM } from './planUtils.jsx';
import { PriceInput, EmailAutocomplete, SendLimitsFields, EmployeeInput, ResourceLimitsFields, DurationInput, PeriodMessagesField, LimitInput } from './PlanInputs';
import { Field, FormSection, ModalShell, normalizePlanPayload } from './PlanModalsShared.jsx';
import { PaymentResultModal } from './PaymentResultModal.jsx';
import { useI18n } from '../../../i18n';

// ── CustomPlanModal — tạo gói riêng + gán ngay hoặc tạo link PayOS ───────────
export const CustomPlanModal = ({ onClose, onSaved }) => {
  const { t } = useI18n();
  const [form, setForm] = useState({
    userEmail: '', name: '', code: '', price: 0, priceYearly: '',
    description: '', maxEmployees: -1,
    durationDays: '',
    gracePeriodDays: '',
    dailyEmailLimit: '', monthlyEmailLimit: '',
    dailyZaloLimit: '', monthlyZaloLimit: '',
    messagesPerPeriod: '', isFupEnabled: false,
    maxLandingPages: '', maxCampaigns: '',
    maxZaloCampaigns: '', maxZaloGroupCampaigns: '', maxEmailCampaigns: '',
    maxZaloAccounts: '', maxEmailAccounts: '',
    maxEmailTemplates: '', maxZaloTemplates: '',
    maxChatbots: '', aiCreditsPerPeriod: '', aiTokensPerPeriod: '',
  });
  const [isSaving, setIsSaving] = useState(false);
  const [paymentResult, setPaymentResult] = useState(null);
  const set = (key, val) => setForm((p) => ({ ...p, [key]: val }));

  const validate = () => {
    if (!form.userEmail.trim()) { toast.error(t('adminMembers.emailRequired')); return false; }
    if (!form.name.trim()) { toast.error(t('adminPlans.planNameRequired')); return false; }
    return true;
  };

  const handleCreatePaymentLink = async () => {
    if (!validate()) return;
    if (!form.price || form.price <= 0) { toast.error(t('adminPlans.priceRequired')); return; }
    try {
      setIsSaving(true);
      const res = await adminPlansApiService.createCustomPlanWithPayment(normalizePlanPayload(form));
      onSaved();
      setPaymentResult({ ...res.data.data, planName: form.name, userEmail: form.userEmail });
    } catch (err) {
      toast.error(err?.response?.data?.message || t('adminPlans.cannotCreatePaymentLink'));
    } finally {
      setIsSaving(false);
    }
  };

  if (paymentResult) {
    return (
      <PaymentResultModal
        qrCode={paymentResult.qrCode}
        checkoutUrl={paymentResult.checkoutUrl}
        orderCode={paymentResult.orderCode}
        planName={paymentResult.planName}
        userEmail={paymentResult.userEmail}
        onClose={onClose}
        onPaid={onSaved}
      />
    );
  }

  return renderModal(
    <ModalShell
      onSubmit={(e) => e.preventDefault()}
      title={t('adminPlans.createCustomPlanTitle')}
      subtitle={t('adminPlans.customPlanSubtitle')}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={isSaving}>{t('common.cancel')}</button>
          <button type="button" onClick={handleCreatePaymentLink} disabled={isSaving} className="btn btn-primary px-6">
            {isSaving ? t('common.processing') : t('adminPlans.createPaymentLink')}
          </button>
        </>
      }
    >
      <FormSection
        kicker={t('adminPlans.sectionCustomer')}
        title={t('adminPlans.customerTargetTitle')}
        description={t('adminPlans.customerTargetDescription')}
      >
        <Field label={t('planInputs.customerEmailLabel')}>
          <EmailAutocomplete value={form.userEmail} onChange={(v) => set('userEmail', v)} placeholder="customer@example.com" excludeWithPlan />
        </Field>
      </FormSection>

      <FormSection
        kicker={t('adminPlans.sectionGeneral')}
        title={t('adminPlans.generalInfoTitle')}
        description={t('adminPlans.customPlanDescription')}
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label={`${t('planInputs.planName')} *`} className="md:col-span-2">
            <input type="text" className="input h-11 w-full" placeholder={t('adminPlans.customPlanNamePlaceholder')}
              value={form.name} onChange={(e) => set('name', e.target.value)} />
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
