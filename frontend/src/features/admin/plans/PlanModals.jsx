import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import toast from 'react-hot-toast';
import { HiOutlineDuplicate, HiOutlineCheck } from 'react-icons/hi';
import adminPlansApiService from '../services/adminPlansApi.service';
import { renderModal, emptyForm, fmtVnd, MODAL_SM, MODAL_PANEL, MODAL_FORM } from './planUtils.jsx';
import { PriceInput, FeatureEditor, EmailAutocomplete, SendLimitsFields, EmployeeInput, ResourceLimitsFields, DurationInput } from './PlanInputs';
import { useI18n } from '../../../i18n';

const PLAN_PRESETS = [
  {
    code: 'trial',
    name: 'Gói Dùng thử',
    price: 0,
    priceYearly: '',
    durationDays: 10,
    maxEmployees: 1,
    dailyEmailLimit: -1,
    monthlyEmailLimit: -1,
    dailyZaloLimit: '',
    monthlyZaloLimit: 100,
    maxLandingPages: 5,
    maxCampaigns: '',
    maxZaloCampaigns: 5,
    maxZaloGroupCampaigns: 5,
    maxEmailCampaigns: -1,
    maxZaloAccounts: 1,
    maxEmailAccounts: -1,
    maxEmailTemplates: '',
    maxZaloTemplates: '',
  },
  {
    code: 'basic',
    name: 'Gói Basic',
    price: 199000,
    priceYearly: 1990000,
    durationDays: 30,
    maxEmployees: 1,
    dailyEmailLimit: -1,
    monthlyEmailLimit: -1,
    dailyZaloLimit: '',
    monthlyZaloLimit: 100,
    maxLandingPages: 5,
    maxCampaigns: '',
    maxZaloCampaigns: 5,
    maxZaloGroupCampaigns: 5,
    maxEmailCampaigns: -1,
    maxZaloAccounts: 1,
    maxEmailAccounts: -1,
    maxEmailTemplates: '',
    maxZaloTemplates: '',
  },
  {
    code: 'pro',
    name: 'Gói Pro',
    price: 499000,
    priceYearly: 4990000,
    durationDays: 30,
    maxEmployees: 1,
    dailyEmailLimit: '',
    monthlyEmailLimit: 500,
    dailyZaloLimit: '',
    monthlyZaloLimit: 2000,
    maxLandingPages: 15,
    maxCampaigns: '',
    maxZaloCampaigns: 30,
    maxZaloGroupCampaigns: 30,
    maxEmailCampaigns: 30,
    maxZaloAccounts: 5,
    maxEmailAccounts: 5,
    maxEmailTemplates: '',
    maxZaloTemplates: '',
  },
  {
    code: 'team',
    name: 'Gói Team',
    price: 999000,
    priceYearly: 9990000,
    durationDays: 30,
    maxEmployees: -1,
    dailyEmailLimit: '',
    monthlyEmailLimit: 30000,
    dailyZaloLimit: '',
    monthlyZaloLimit: '',
    maxLandingPages: '',
    maxCampaigns: '',
    maxZaloCampaigns: '',
    maxZaloGroupCampaigns: '',
    maxEmailCampaigns: '',
    maxZaloAccounts: '',
    maxEmailAccounts: '',
    maxEmailTemplates: '',
    maxZaloTemplates: '',
  },
  {
    code: 'custom',
    name: 'Gói Tùy chọn',
    price: 0,
    priceYearly: '',
    durationDays: 30,
    maxEmployees: -1,
    dailyEmailLimit: '',
    monthlyEmailLimit: '',
    dailyZaloLimit: '',
    monthlyZaloLimit: '',
    maxLandingPages: '',
    maxCampaigns: '',
    maxZaloCampaigns: '',
    maxZaloGroupCampaigns: '',
    maxEmailCampaigns: '',
    maxZaloAccounts: '',
    maxEmailAccounts: '',
    maxEmailTemplates: '',
    maxZaloTemplates: '',
  },
];

const Field = ({ label, children, note, className = '' }) => (
  <div className={className}>
    <label className="block text-sm font-semibold text-slate-700 mb-1.5">{label}</label>
    {children}
    {note && <p className="mt-1.5 text-xs text-slate-400">{note}</p>}
  </div>
);

const FormSection = ({ kicker, title, description, children }) => (
  <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="mb-5">
      {kicker && <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-orange-600">{kicker}</p>}
      <h3 className="mt-1 text-base font-bold text-slate-900">{title}</h3>
      {description && <p className="mt-1 text-sm leading-relaxed text-slate-500">{description}</p>}
    </div>
    {children}
  </section>
);

const ModalShell = ({ title, subtitle, children, footer, onSubmit }) => (
  <form onSubmit={onSubmit} className="flex max-h-[92vh] flex-col">
    <div className="border-b border-slate-200 bg-slate-50/80 px-6 py-5">
      <h2 className="text-2xl font-black tracking-tight text-slate-950">{title}</h2>
      {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
    </div>
    <div className="flex-1 overflow-y-auto bg-slate-50 px-6 py-5">
      <div className="space-y-5">{children}</div>
    </div>
    <div className="flex justify-end gap-3 border-t border-slate-200 bg-white px-6 py-4">
      {footer}
    </div>
  </form>
);

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
      if (isEdit) {
        await adminPlansApiService.updatePlan(plan.id, form);
        toast.success(t('adminPlans.planUpdated'));
      } else {
        await adminPlansApiService.createPlan(form);
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

// ── AssignModal — gán gói đại trà cho 1 user ─────────────────────────────────
export const AssignModal = ({ plan, onClose, onAssigned }) => {
  const { t } = useI18n();
  const [email, setEmail]               = useState('');
  const [paymentMethod, setPaymentMethod] = useState('free');
  const [note, setNote]                 = useState('');
  const [isLoading, setIsLoading]       = useState(false);

  const handleAssign = async (e) => {
    e.preventDefault();
    if (!email.trim()) { toast.error(t('adminMembers.emailRequired')); return; }
    try {
      setIsLoading(true);
      const res = await adminPlansApiService.assignPlan(plan.id, email.trim(), {
        paymentMethod,
        note: note.trim() || null,
      });
      toast.success(`Đã gán gói "${plan.name}" cho ${res.data.data.email}`);
      onAssigned();
      onClose();
    } catch (err) {
      toast.error(err?.response?.data?.message || t('adminMembers.assignFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  return renderModal(
    <form onSubmit={handleAssign} className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">{t('adminMembers.assignPlan')}</h2>
        <p className="text-sm text-gray-500 mt-1">Gói: <strong>{plan.name}</strong> · {fmtVnd(plan.price)}</p>
      </div>
      <p className="text-sm text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
        Thao tác này sẽ gán gói trực tiếp, bỏ qua quy trình thanh toán.
      </p>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{t('adminMembers.emailLabel')} *</label>
        <EmailAutocomplete value={email} onChange={setEmail} />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{t('adminMembers.paymentMethod')}</label>
        <select className="input w-full" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
          <option value="free">{t('adminMembers.freeDemo')}</option>
          <option value="manual">{t('adminMembers.manualPayment')}</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{t('adminMembers.note')}</label>
        <input
          className="input w-full"
          placeholder={t('adminMembers.placeholderNote')}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" className="btn btn-secondary" onClick={onClose} disabled={isLoading}>{t('common.cancel')}</button>
        <button type="submit" className="btn btn-primary" disabled={isLoading}>
          {isLoading ? t('adminMembers.confirming') : t('adminMembers.confirmAssign')}
        </button>
      </div>
    </form>,
    () => { if (!isLoading) onClose(); },
    MODAL_SM
  );
};

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
    maxLandingPages: plan.maxLandingPages ?? '',
    maxCampaigns: plan.maxCampaigns ?? '',
    maxZaloCampaigns: plan.maxZaloCampaigns ?? '',
    maxZaloGroupCampaigns: plan.maxZaloGroupCampaigns ?? '',
    maxEmailCampaigns: plan.maxEmailCampaigns ?? '',
    maxZaloAccounts: plan.maxZaloAccounts ?? '',
    maxEmailAccounts: plan.maxEmailAccounts ?? '',
    maxEmailTemplates: plan.maxEmailTemplates ?? '',
    maxZaloTemplates: plan.maxZaloTemplates ?? '',
  });
  const [isSaving, setIsSaving] = useState(false);
  const set = (key, val) => setForm((p) => ({ ...p, [key]: val }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error(t('adminPlans.planNameRequired')); return; }
    try {
      setIsSaving(true);
      await adminPlansApiService.updatePlan(plan.id, { ...form, isActive: false, features: [] });
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

// ── PaymentResultModal — hiển thị QR thanh toán sau khi tạo link PayOS ────────
const PaymentResultModal = ({ qrCode, checkoutUrl, orderCode, planName, userEmail, onClose, onPaid }) => {
  const [qrImageUrl, setQrImageUrl] = useState(null);
  const [copied, setCopied] = useState(false);
  // Trạng thái đơn hàng được poll từ backend: pending | success | cancelled
  const [paymentStatus, setPaymentStatus] = useState('pending');

  useEffect(() => {
    if (qrCode) {
      QRCode.toDataURL(qrCode, { width: 200, margin: 1 }).then(setQrImageUrl);
    }
  }, [qrCode]);

  // Polling mỗi 3s để biết khách đã thanh toán hay chưa
  useEffect(() => {
    if (!orderCode || paymentStatus !== 'pending') return;
    const intervalId = setInterval(async () => {
      try {
        const res = await fetch(`/api/payments/status/${orderCode}`);
        const data = await res.json();
        if (data.status === 'success') {
          setPaymentStatus('success');
          toast.success(`Khách hàng ${userEmail} đã thanh toán thành công!`, { duration: 6000 });
          onPaid?.();
        } else if (data.status === 'cancelled') {
          setPaymentStatus('cancelled');
          toast.error('Khách hàng đã huỷ giao dịch');
        }
      } catch {
        // Bỏ qua lỗi mạng tạm thời, tiếp tục poll
      }
    }, 3000);
    return () => clearInterval(intervalId);
  }, [orderCode, paymentStatus, userEmail, onPaid]);

  const handleCopy = () => {
    navigator.clipboard.writeText(checkoutUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const isPaid = paymentStatus === 'success';
  const isCancelled = paymentStatus === 'cancelled';

  return renderModal(
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">
          {isPaid ? 'Đã thanh toán thành công' : isCancelled ? 'Giao dịch đã huỷ' : 'Link thanh toán đã sẵn sàng'}
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          Gói <strong>{planName}</strong> — {isPaid
            ? <>đã kích hoạt cho <strong>{userEmail}</strong>.</>
            : <>gửi QR hoặc link này cho <strong>{userEmail}</strong> qua Zalo.</>}
        </p>
      </div>

      {/* Trạng thái polling — chỉ hiện khi chưa thanh toán */}
      {!isPaid && !isCancelled && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm text-amber-700">
          <div className="w-3 h-3 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          <span>Đang chờ khách hàng thanh toán… (tự cập nhật mỗi 3s)</span>
        </div>
      )}

      {isPaid && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-3 text-sm text-green-700">
          <HiOutlineCheck className="w-5 h-5 shrink-0" />
          <span>Gói đã được gán cho khách hàng. Đóng modal này để xem lại trong danh sách gói.</span>
        </div>
      )}

      {/* QR code — chỉ hiện khi chưa thanh toán */}
      {!isPaid && (
        <div className="flex flex-col items-center gap-3">
          <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm w-52 h-52 flex items-center justify-center">
            {qrImageUrl
              ? <img src={qrImageUrl} alt="QR thanh toán" className="w-44 h-44 rounded-lg" />
              : <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
            }
          </div>
          <p className="text-xs text-gray-400 font-medium uppercase tracking-widest">Quét để thanh toán</p>
        </div>
      )}

      {/* Order code */}
      <div
        onClick={() => { navigator.clipboard.writeText(String(orderCode)); toast.success('Đã copy mã đơn hàng'); }}
        className={`cursor-pointer flex items-center justify-between text-white rounded-xl px-4 py-3 ${
          isPaid ? 'bg-green-600' : isCancelled ? 'bg-gray-500' : 'bg-orange-500'
        }`}
      >
        <div>
          <p className="text-[10px] font-bold text-white/70 uppercase mb-0.5">Mã đơn hàng</p>
          <p className="font-bold text-lg">{orderCode}</p>
        </div>
        <HiOutlineDuplicate className="w-5 h-5 text-white/70" />
      </div>

      {/* Checkout URL — chỉ hiện khi chưa thanh toán */}
      {!isPaid && (
        <div className="flex items-center gap-2">
          <input
            readOnly
            value={checkoutUrl}
            className="input flex-1 text-xs text-gray-500 truncate"
          />
          <button type="button" onClick={handleCopy} className={`btn shrink-0 ${copied ? 'btn-primary' : 'btn-secondary'}`}>
            {copied
              ? <><HiOutlineCheck className="w-4 h-4 mr-1" />Đã copy</>
              : <><HiOutlineDuplicate className="w-4 h-4 mr-1" />Copy link</>
            }
          </button>
        </div>
      )}

      <button type="button" className={`btn w-full ${isPaid ? 'btn-primary bg-green-600 hover:bg-green-700 border-green-600' : 'btn-primary'}`} onClick={onClose}>
        {isPaid ? 'Đóng' : 'Đóng (tiếp tục chờ ở background)'}
      </button>
    </div>,
    onClose,
    MODAL_PANEL
  );
};

// ── CustomPlanModal — tạo gói riêng + gán ngay hoặc tạo link PayOS ───────────
export const CustomPlanModal = ({ onClose, onSaved }) => {
  const { t } = useI18n();
  const [form, setForm] = useState({
    userEmail: '', name: '', code: '', price: 0, priceYearly: '',
    description: '', maxEmployees: -1,
    durationDays: '',
    dailyEmailLimit: '', monthlyEmailLimit: '',
    dailyZaloLimit: '', monthlyZaloLimit: '',
    maxLandingPages: '', maxCampaigns: '',
    maxZaloCampaigns: '', maxZaloGroupCampaigns: '', maxEmailCampaigns: '',
    maxZaloAccounts: '', maxEmailAccounts: '',
    maxEmailTemplates: '', maxZaloTemplates: '',
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
      const res = await adminPlansApiService.createCustomPlanWithPayment(form);
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
