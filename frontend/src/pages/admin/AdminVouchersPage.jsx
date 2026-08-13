import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { HiOutlinePlus, HiOutlineRefresh, HiOutlineTrash, HiOutlinePencilAlt, HiOutlineReply } from 'react-icons/hi';
import adminVouchersApiService from '../../features/admin/services/adminVouchersApi.service';
import { Field, FormSection, ModalShell } from '../../features/admin/plans/PlanModalsShared.jsx';
import { PriceInput } from '../../features/admin/plans/PlanInputs.jsx';
import { MODAL_FORM, renderModal } from '../../features/admin/plans/planUtils.jsx';
import adminPlansApiService from '../../features/admin/services/adminPlansApi.service';
import { useI18n } from '../../i18n';
import { getVoucherLifecycleStatus } from './voucherStatus.util.js';

const fmtVnd = (n) => Number(n || 0).toLocaleString('vi-VN') + ' đ';
const fmtDate = (d, locale = 'vi') => d ? new Date(d).toLocaleDateString(locale === 'en' ? 'en-US' : 'vi-VN') : '—';

const emptyForm = {
  code: '',
  name: '',
  description: '',
  discountType: 'fixed_amount',
  discountValue: '',
  maxDiscountAmount: '',
  minOrderAmount: '',
  appliesToPlanCodes: '',
  appliesToBillingPeriods: 'monthly, yearly',
  startsAt: '',
  endsAt: '',
  usageLimit: '',
  usageLimitPerUser: 1,
  offerMode: 'public_code',
  isActive: true,
  originalOfferMode: null,
  legacyAllPlans: false,
  legacyAllCycles: false,
  legacyNoEndDate: false,
};

const toInputDate = (value) => value ? String(value).slice(0, 10) : '';

const normalizeCsv = (value) => String(value || '').split(',').map((item) => item.trim()).filter(Boolean);

const resolveFormOfferMode = (form) => {
  if (['public_code', 'private_code', 'automatic'].includes(form.offerMode)) return form.offerMode;
  return form.autoApply ? 'automatic' : 'public_code';
};

const toPayload = (form) => {
  const offerMode = resolveFormOfferMode(form);
  const payload = {
    ...form,
    offerMode,
    autoApply: offerMode === 'automatic',
    discountValue: Number(form.discountValue || 0),
    maxDiscountAmount: form.discountType === 'percentage' && form.maxDiscountAmount !== ''
      ? Number(form.maxDiscountAmount)
      : null,
    minOrderAmount: form.minOrderAmount === '' ? 0 : Number(form.minOrderAmount),
    usageLimit: form.usageLimit === '' ? null : Number(form.usageLimit),
    usageLimitPerUser: form.usageLimitPerUser === '' ? null : Number(form.usageLimitPerUser),
    appliesToPlanCodes: normalizeCsv(form.appliesToPlanCodes),
    appliesToBillingPeriods: normalizeCsv(form.appliesToBillingPeriods),
    startsAt: form.startsAt ? `${form.startsAt}T00:00:00` : null,
    endsAt: form.endsAt ? `${form.endsAt}T23:59:59` : null,
  };
  delete payload.originalOfferMode;
  delete payload.legacyAllPlans;
  delete payload.legacyAllCycles;
  delete payload.legacyNoEndDate;
  if (offerMode === 'automatic') {
    delete payload.code;
    if (form.legacyAllPlans && !normalizeCsv(form.appliesToPlanCodes).length) {
      delete payload.appliesToPlanCodes;
    }
    if (form.legacyAllCycles && !normalizeCsv(form.appliesToBillingPeriods).length) {
      delete payload.appliesToBillingPeriods;
    }
    if (form.legacyNoEndDate && !form.endsAt) {
      delete payload.endsAt;
    }
  } else {
    payload.code = String(form.code || '').trim().toUpperCase();
  }
  return payload;
};

const fromVoucher = (voucher) => {
  const offerMode = voucher.offerMode || (voucher.autoApply ? 'automatic' : 'public_code');
  const isAutomatic = offerMode === 'automatic';
  return {
    code: voucher.code || '',
    name: voucher.name || '',
    description: voucher.description || '',
    discountType: voucher.discountType || 'fixed_amount',
    discountValue: voucher.discountValue ?? '',
    maxDiscountAmount: voucher.maxDiscountAmount ?? '',
    minOrderAmount: voucher.minOrderAmount ?? '',
    appliesToPlanCodes: (voucher.appliesToPlanCodes || []).join(', '),
    appliesToBillingPeriods: (voucher.appliesToBillingPeriods || []).join(', '),
    startsAt: toInputDate(voucher.startsAt),
    endsAt: toInputDate(voucher.endsAt),
    usageLimit: voucher.usageLimit ?? '',
    usageLimitPerUser: voucher.usageLimitPerUser ?? '',
    offerMode,
    isActive: Boolean(voucher.isActive),
    originalOfferMode: offerMode,
    legacyAllPlans: isAutomatic && !voucher.appliesToPlanCodes?.length,
    legacyAllCycles: isAutomatic && !voucher.appliesToBillingPeriods?.length,
    legacyNoEndDate: isAutomatic && !voucher.endsAt,
  };
};

const discountLabel = (voucher, t) => {
  if (voucher.discountType === 'percentage') {
    return `${Number(voucher.discountValue || 0)}%${voucher.maxDiscountAmount ? `, ${t('voucherAdmin.maxDiscount')} ${fmtVnd(voucher.maxDiscountAmount)}` : ''}`;
  }
  return fmtVnd(voucher.discountValue);
};

const normalizeCode = (value) => String(value || '').trim().toLowerCase();

const toggleCsvValue = (csv, value) => {
  const normalizedValue = normalizeCode(value);
  const current = normalizeCsv(csv).map(normalizeCode);
  const next = current.includes(normalizedValue)
    ? current.filter((item) => item !== normalizedValue)
    : [...current, normalizedValue];
  return next.join(', ');
};

/** Derived admin status moved to ./voucherStatus.util.js — see PLAN_VOUCHER V-2b. */

const voucherErrorKeyMap = {
  'Mã voucher không được để trống': 'voucherAdmin.errorCodeRequired',
  'Tên voucher không được để trống': 'voucherAdmin.errorNameRequired',
  'Loại giảm giá không hợp lệ': 'voucherAdmin.errorDiscountType',
  'Giá trị giảm phải lớn hơn 0': 'voucherAdmin.errorDiscountValue',
  'Giảm theo % không được vượt quá 100%': 'voucherAdmin.errorPercentageMax',
  'Điều kiện đơn tối thiểu không hợp lệ': 'voucherAdmin.errorMinOrder',
  'Mã voucher đã tồn tại': 'voucherAdmin.errorDuplicateCode',
  'Không tìm thấy voucher': 'voucherAdmin.errorNotFound',
  'Lỗi server': 'voucherAdmin.errorServer',
  'Ngày bắt đầu phải trước ngày kết thúc': 'voucherAdmin.errorDateOrder',
  'Tổng lượt dùng = 0 không hợp lệ — để trống nếu không giới hạn': 'voucherAdmin.errorUsageLimitZero',
  'Lượt/user = 0 không hợp lệ — để trống nếu không giới hạn': 'voucherAdmin.errorUsagePerUserZero',
  'Phải đặt ngày kết thúc trong tương lai (hoặc để trống) trước khi khôi phục': 'voucherAdmin.errorRestoreEndsAt',
};

const getVoucherErrorMessage = (err, t, fallbackKey) => {
  const message = err?.response?.data?.message;
  if (!message) return t(fallbackKey);
  const key = voucherErrorKeyMap[message];
  if (key) return t(key);
  if (message.startsWith('Mã ') && message.includes('hiện đang được dùng')) return message;
  if (message.startsWith('Tổng lượt dùng') || message.startsWith('Lượt/user')) return message;
  return message || t(fallbackKey);
};

const SelectablePill = ({ checked, title, subtitle, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`rounded-xl border px-4 py-3 text-left transition-all ${
      checked
        ? 'border-orange-300 bg-orange-50 text-orange-700 shadow-sm'
        : 'border-slate-200 bg-white text-slate-700 hover:border-orange-200 hover:bg-orange-50/60'
    }`}
  >
    <span className="block text-sm font-bold">{title}</span>
    {subtitle && <span className="mt-1 block text-xs text-slate-500">{subtitle}</span>}
  </button>
);

const VoucherForm = ({ editing, form, setForm, onCancel, onSubmit, saving, plans, t }) => {
  const offerMode = resolveFormOfferMode(form);
  const isAutomatic = offerMode === 'automatic';
  const publicPlans = plans.filter(
    (plan) =>
      plan &&
      plan.isCustom !== true &&
      plan.is_custom !== true &&
      plan.isActive !== false &&
      plan.is_active !== false
  );

  return renderModal(
    <ModalShell
      title={editing ? t('voucherAdmin.editTitle') : t('voucherAdmin.createTitle')}
      subtitle={t('voucherAdmin.formSubtitle')}
      onSubmit={onSubmit}
      footer={(
        <>
          <button type="button" className="btn btn-secondary" onClick={onCancel}>{t('voucherAdmin.cancel')}</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? t('voucherAdmin.saving') : t('voucherAdmin.saveVoucher')}
          </button>
        </>
      )}
    >
      <FormSection
        kicker="OFFER"
        title={t('voucherAdmin.offerType')}
        description={t('voucherAdmin.offerTypeDescription')}
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <SelectablePill
            checked={offerMode === 'public_code'}
            title={t('voucherAdmin.publicCode')}
            subtitle={t('voucherAdmin.publicCodeSubtitle')}
            onClick={() => setForm((p) => ({
              ...p,
              offerMode: 'public_code',
              code: resolveFormOfferMode(p) === 'automatic' ? '' : p.code,
            }))}
          />
          <SelectablePill
            checked={offerMode === 'private_code'}
            title={t('voucherAdmin.privateCode')}
            subtitle={t('voucherAdmin.privateCodeSubtitle')}
            onClick={() => setForm((p) => ({
              ...p,
              offerMode: 'private_code',
              code: resolveFormOfferMode(p) === 'automatic' ? '' : p.code,
            }))}
          />
          <SelectablePill
            checked={offerMode === 'automatic'}
            title={t('voucherAdmin.autoPromotion')}
            subtitle={t('voucherAdmin.autoPromotionSubtitle')}
            onClick={() => setForm((p) => ({
              ...p,
              offerMode: 'automatic',
              appliesToBillingPeriods:
                p.legacyAllCycles || p.appliesToBillingPeriods
                  ? p.appliesToBillingPeriods
                  : 'monthly, yearly',
            }))}
          />
        </div>
      </FormSection>

      <FormSection
        kicker="DISCOUNT"
        title={t('voucherAdmin.discountInfo')}
        description={isAutomatic ? t('voucherAdmin.autoDiscountDescription') : t('voucherAdmin.manualDiscountDescription')}
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {!isAutomatic && (
            <Field label={t('voucherAdmin.voucherCode')}>
              <input
                className="input w-full font-mono uppercase"
                value={form.code}
                onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))}
                required
                disabled={Boolean(editing && form.originalOfferMode !== 'automatic')}
              />
            </Field>
          )}
          <Field label={t('voucherAdmin.displayName')}>
            <input className="input w-full" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder={t('voucherAdmin.displayNamePlaceholder')} required />
          </Field>
          <Field label={t('voucherAdmin.description')} className="md:col-span-2">
            <textarea className="input w-full min-h-[80px]" value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} placeholder={t('voucherAdmin.descriptionPlaceholder')} />
          </Field>
          <Field label={t('voucherAdmin.discountType')}>
            <select
              className="input w-full"
              value={form.discountType}
              onChange={(e) => setForm((p) => ({
                ...p,
                discountType: e.target.value,
                discountValue: '',
                maxDiscountAmount: '',
              }))}
            >
              <option value="fixed_amount">{t('voucherAdmin.fixedAmount')}</option>
              <option value="percentage">{t('voucherAdmin.percentage')}</option>
            </select>
          </Field>
          <Field label={t('voucherAdmin.value')}>
            {form.discountType === 'percentage' ? (
              <div className="relative">
                <input
                  type="number"
                  min="1"
                  max="100"
                  className="input w-full pr-14"
                  value={form.discountValue}
                  onChange={(e) => setForm((p) => ({ ...p, discountValue: e.target.value }))}
                />
                <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-4 text-sm text-gray-400">%</span>
              </div>
            ) : (
              <PriceInput
                value={form.discountValue}
                onChange={(v) => setForm((p) => ({ ...p, discountValue: v }))}
                className="input w-full"
                suffix="đ"
                allowEmpty
              />
            )}
          </Field>
          {form.discountType === 'percentage' && (
            <Field label={t('voucherAdmin.maxDiscountField')} note={t('voucherAdmin.maxDiscountNote')}>
              <PriceInput
                value={form.maxDiscountAmount}
                onChange={(v) => setForm((p) => ({ ...p, maxDiscountAmount: v }))}
                className="input w-full"
                suffix="đ"
                allowEmpty
                placeholder={t('voucherAdmin.maxDiscountPlaceholder')}
              />
              {Number(form.maxDiscountAmount) > 0 && Number(form.maxDiscountAmount) < 1000 && (
                <p className="mt-1.5 text-xs text-amber-600">
                  {t('voucherAdmin.maxDiscountLowWarning', { amount: fmtVnd(form.maxDiscountAmount) })}
                </p>
              )}
            </Field>
          )}
        </div>
      </FormSection>

      <FormSection
        kicker="RULES"
        title={t('voucherAdmin.rules')}
        description={isAutomatic ? t('voucherAdmin.autoRulesDescription') : t('voucherAdmin.manualRulesDescription')}
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label={t('voucherAdmin.minOrder')}>
            <PriceInput
              value={form.minOrderAmount}
              onChange={(v) => setForm((p) => ({ ...p, minOrderAmount: v }))}
              className="input w-full"
              suffix="đ"
              allowEmpty
            />
          </Field>
          <div />
          <Field label={t('voucherAdmin.applicablePlans')} className="md:col-span-2">
            <div className="flex flex-wrap gap-2">
              {(!isAutomatic || form.legacyAllPlans) && (
                <SelectablePill
                  checked={!normalizeCsv(form.appliesToPlanCodes).length}
                  title={t('voucherAdmin.allPlans')}
                  subtitle={t('voucherAdmin.allPlansSubtitle')}
                  onClick={() => {
                    if (!isAutomatic) setForm((p) => ({ ...p, appliesToPlanCodes: '' }));
                  }}
                />
              )}
              {publicPlans.map((plan) => (
                <SelectablePill
                  key={plan.id || plan.code}
                  checked={normalizeCsv(form.appliesToPlanCodes).map(normalizeCode).includes(normalizeCode(plan.code))}
                  title={plan.name || plan.code}
                  subtitle={plan.code}
                  onClick={() => setForm((p) => ({
                    ...p,
                    legacyAllPlans: false,
                    appliesToPlanCodes: toggleCsvValue(p.appliesToPlanCodes, plan.code),
                  }))}
                />
              ))}
            </div>
          </Field>
          <Field label={t('voucherAdmin.applicableCycles')} className="md:col-span-2">
            <div className="flex flex-wrap gap-2">
              {(!isAutomatic || form.legacyAllCycles) && (
                <SelectablePill
                  checked={!normalizeCsv(form.appliesToBillingPeriods).length}
                  title={t('voucherAdmin.allCycles')}
                  subtitle={t('voucherAdmin.monthAndYear')}
                  onClick={() => {
                    if (!isAutomatic) setForm((p) => ({ ...p, appliesToBillingPeriods: '' }));
                  }}
                />
              )}
              {['monthly', 'yearly'].map((period) => (
                <SelectablePill
                  key={period}
                  checked={normalizeCsv(form.appliesToBillingPeriods).map(normalizeCode).includes(period)}
                  title={t(`voucherAdmin.${period}`)}
                  onClick={() => setForm((p) => ({
                    ...p,
                    legacyAllCycles: false,
                    appliesToBillingPeriods: toggleCsvValue(p.appliesToBillingPeriods, period),
                  }))}
                />
              ))}
            </div>
          </Field>
        </div>
      </FormSection>

      <FormSection
        kicker="SCHEDULE"
        title={t('voucherAdmin.scheduleAndLimits')}
        description={t('voucherAdmin.scheduleDescription')}
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <Field label={t('voucherAdmin.startsAt')}>
            <input type="date" className="input w-full" value={form.startsAt} onChange={(e) => setForm((p) => ({ ...p, startsAt: e.target.value }))} />
          </Field>
          <Field label={t('voucherAdmin.endsAt')} note={isAutomatic ? t('voucherAdmin.endsAtRequiredNote') : undefined}>
            <input
              type="date"
              className="input w-full"
              value={form.endsAt}
              onChange={(e) => setForm((p) => ({
                ...p,
                endsAt: e.target.value,
                legacyNoEndDate: false,
              }))}
              required={isAutomatic && !form.legacyNoEndDate}
            />
          </Field>
          <Field label={t('voucherAdmin.usageLimit')} note={t('voucherAdmin.unlimitedHint')}>
            <input type="number" min="1" className="input w-full" value={form.usageLimit} onChange={(e) => setForm((p) => ({ ...p, usageLimit: e.target.value }))} placeholder={t('voucherAdmin.unlimited')} />
          </Field>
          <Field label={t('voucherAdmin.usagePerUser')} note={t('voucherAdmin.usagePerUserHint')}>
            <input type="number" min="1" className="input w-full" value={form.usageLimitPerUser} onChange={(e) => setForm((p) => ({ ...p, usageLimitPerUser: e.target.value }))} placeholder={t('voucherAdmin.unlimited')} />
          </Field>
        </div>
      </FormSection>

      <FormSection
        kicker="STATUS"
        title={t('voucherAdmin.status')}
        description={isAutomatic ? t('voucherAdmin.autoStatusDescription') : t('voucherAdmin.manualStatusDescription')}
      >
        <p className="mb-3 text-sm text-slate-500">{t('voucherAdmin.oneCodePerOrder')}</p>
        <label className="flex items-center rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          <input type="checkbox" className="h-4 w-4 rounded text-primary-600" checked={form.isActive} onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.checked }))} />
          <span className="ml-3 font-semibold">{t('voucherAdmin.active')}</span>
        </label>
      </FormSection>
    </ModalShell>,
    onCancel,
    MODAL_FORM
  );
};

const TABS = ['active', 'expired', 'disabled'];

export default function AdminVouchersPage() {
  const { t, locale } = useI18n();
  const [vouchers, setVouchers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [plans, setPlans] = useState([]);
  const [tab, setTab] = useState('active');

  const counts = useMemo(() => {
    const now = Date.now();
    return vouchers.reduce((acc, v) => {
      acc[getVoucherLifecycleStatus(v, now)] += 1;
      return acc;
    }, { active: 0, expired: 0, disabled: 0 });
  }, [vouchers]);

  const filtered = useMemo(() => {
    const now = Date.now();
    return vouchers.filter((v) => getVoucherLifecycleStatus(v, now) === tab);
  }, [vouchers, tab]);

  const fetchVouchers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminVouchersApiService.getVouchers();
      setVouchers(res.data.data || []);
    } catch {
      toast.error(t('voucherAdmin.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { fetchVouchers(); }, [fetchVouchers]);

  useEffect(() => {
    adminPlansApiService.getPlans()
      .then((res) => setPlans(res.data.data || []))
      .catch(() => setPlans([]));
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setShowForm(true);
  };

  const openEdit = (voucher) => {
    setEditing(voucher);
    setForm(fromVoucher(voucher));
    setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const offerMode = resolveFormOfferMode(form);
    const discountValue = Number(form.discountValue);
    if (form.discountValue === '' || !Number.isFinite(discountValue) || discountValue <= 0) {
      toast.error(t('voucherAdmin.errorDiscountValue'));
      return;
    }
    if (form.discountType === 'percentage' && discountValue > 100) {
      toast.error(t('voucherAdmin.errorPercentageMax'));
      return;
    }
    if (offerMode !== 'automatic' && !String(form.code || '').trim()) {
      toast.error(t('voucherAdmin.errorCodeRequired'));
      return;
    }
    if (offerMode === 'automatic') {
      if (!normalizeCsv(form.appliesToPlanCodes).length && !form.legacyAllPlans) {
        toast.error(t('voucherAdmin.errorPlansRequired'));
        return;
      }
      if (!normalizeCsv(form.appliesToBillingPeriods).length && !form.legacyAllCycles) {
        toast.error(t('voucherAdmin.errorCyclesRequired'));
        return;
      }
      if (!form.endsAt && !form.legacyNoEndDate) {
        toast.error(t('voucherAdmin.errorEndsAtRequired'));
        return;
      }
    }
    setSaving(true);
    try {
      if (editing) {
        await adminVouchersApiService.updateVoucher(editing.id, toPayload(form));
        toast.success(t('voucherAdmin.updateSuccess'));
      } else {
        await adminVouchersApiService.createVoucher(toPayload(form));
        toast.success(t('voucherAdmin.createSuccess'));
      }
      setShowForm(false);
      fetchVouchers();
    } catch (err) {
      toast.error(getVoucherErrorMessage(err, t, 'voucherAdmin.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const voucherLabel = (voucher) => voucher.name || voucher.code || `#${voucher.id}`;

  const handleDeactivate = async (voucher) => {
    if (!window.confirm(t('voucherAdmin.deactivateConfirm', { code: voucherLabel(voucher) }))) return;
    try {
      await adminVouchersApiService.deleteVoucher(voucher.id);
      toast.success(t('voucherAdmin.deactivateSuccess'));
      fetchVouchers();
    } catch (err) {
      toast.error(getVoucherErrorMessage(err, t, 'voucherAdmin.deactivateFailed'));
    }
  };

  const handleRestore = async (voucher) => {
    if (!window.confirm(t('voucherAdmin.restoreConfirm', { code: voucherLabel(voucher) }))) return;
    const needsNewEnd = voucher.endsAt && new Date(voucher.endsAt).getTime() <= Date.now();
    let endsAt;
    if (needsNewEnd) {
      const input = window.prompt(t('voucherAdmin.restoreEndsAtPrompt'), '');
      if (input === null) return;
      const trimmed = String(input).trim();
      if (!trimmed) {
        toast.error(t('voucherAdmin.errorRestoreEndsAt'));
        return;
      }
      endsAt = trimmed.includes('T') ? trimmed : `${trimmed}T23:59:59`;
    }
    try {
      await adminVouchersApiService.restoreVoucher(voucher.id, endsAt !== undefined ? { endsAt } : {});
      toast.success(t('voucherAdmin.restoreSuccess'));
      setTab('active');
      fetchVouchers();
    } catch (err) {
      toast.error(getVoucherErrorMessage(err, t, 'voucherAdmin.restoreFailed'));
    }
  };

  const handleHardDelete = async (voucher) => {
    if (Number(voucher.usedCount) > 0) {
      toast.error(t('voucherAdmin.hardDeleteBlocked'));
      return;
    }
    if (!window.confirm(t('voucherAdmin.hardDeleteConfirm', { code: voucherLabel(voucher) }))) return;
    try {
      await adminVouchersApiService.hardDeleteVoucher(voucher.id);
      toast.success(t('voucherAdmin.hardDeleteSuccess'));
      fetchVouchers();
    } catch (err) {
      toast.error(getVoucherErrorMessage(err, t, 'voucherAdmin.hardDeleteFailed'));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('voucherAdmin.title')}</h1>
          <p className="text-gray-500 mt-1">{t('voucherAdmin.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="btn btn-secondary" onClick={fetchVouchers} disabled={loading}>
            <HiOutlineRefresh className="w-4 h-4 mr-2" /> {t('voucherAdmin.refresh')}
          </button>
          <button type="button" className="btn btn-primary" onClick={openCreate}>
            <HiOutlinePlus className="w-4 h-4 mr-2" /> {t('voucherAdmin.createButton')}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card p-4"><p className="text-xs text-gray-400 uppercase">{t('voucherAdmin.activeVouchers')}</p><p className="text-2xl font-bold">{counts.active}</p></div>
        <div className="card p-4"><p className="text-xs text-gray-400 uppercase">{t('voucherAdmin.expiredVouchers')}</p><p className="text-2xl font-bold">{counts.expired}</p></div>
        <div className="card p-4"><p className="text-xs text-gray-400 uppercase">{t('voucherAdmin.disabledVouchers')}</p><p className="text-2xl font-bold">{counts.disabled}</p></div>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`rounded-lg px-4 py-2 text-sm font-semibold ${
              tab === key ? 'bg-primary-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            {t(`voucherAdmin.tab.${key}`)} ({counts[key]})
          </button>
        ))}
      </div>

      {showForm && (
        <VoucherForm
          editing={editing}
          form={form}
          setForm={setForm}
          saving={saving}
          plans={plans}
          t={t}
          onCancel={() => setShowForm(false)}
          onSubmit={handleSubmit}
        />
      )}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {[
                  t('voucherAdmin.tableCode'),
                  t('voucherAdmin.tableOffer'),
                  t('voucherAdmin.tableCondition'),
                  t('voucherAdmin.tableTime'),
                  t('voucherAdmin.tableUsage'),
                  t('voucherAdmin.tableStatus'),
                  '',
                ].map((h) => (
                  <th key={h || 'actions'} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-400">{t('voucherAdmin.loading')}</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-400">{t('voucherAdmin.empty')}</td></tr>
              ) : filtered.map((voucher) => {
                const status = getVoucherLifecycleStatus(voucher);
                const mode = voucher.offerMode || (voucher.autoApply ? 'automatic' : 'public_code');
                const codeDisplay = mode === 'automatic'
                  ? (voucher.name || t('voucherAdmin.autoBadge'))
                  : mode === 'private_code'
                    ? `••••${String(voucher.code || '').slice(-4)}`
                    : voucher.code;
                return (
                  <tr key={voucher.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-mono font-semibold text-gray-900">{codeDisplay}</div>
                      <div className="text-xs text-gray-500">{voucher.name}</div>
                    </td>
                    <td className="px-4 py-3 font-semibold text-gray-900">{discountLabel(voucher, t)}</td>
                    <td className="px-4 py-3 text-gray-600">
                      <div>{t('voucherAdmin.orderFrom', { amount: fmtVnd(voucher.minOrderAmount) })}</div>
                      <div className="text-xs text-gray-400">{(voucher.appliesToPlanCodes || []).join(', ') || t('voucherAdmin.anyPlan')} · {(voucher.appliesToBillingPeriods || []).join(', ') || t('voucherAdmin.anyCycle')}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{fmtDate(voucher.startsAt, locale)} → {fmtDate(voucher.endsAt, locale)}</td>
                    <td className="px-4 py-3 text-gray-600">{voucher.usedCount || 0}{voucher.usageLimit ? ` / ${voucher.usageLimit}` : ''}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        <span className={`badge text-xs ${status === 'active' ? 'badge-green' : 'badge-gray'}`}>
                          {t(`voucherAdmin.statusBadge.${status}`)}
                        </span>
                        <span className="badge badge-yellow text-xs">{t(`voucherAdmin.modeBadge.${mode}`)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button type="button" className="p-2 text-gray-400 hover:text-primary-600" onClick={() => openEdit(voucher)} title={t('voucherAdmin.editTitle')}><HiOutlinePencilAlt /></button>
                      {status === 'active' ? (
                        <button type="button" className="p-2 text-gray-400 hover:text-red-600" onClick={() => handleDeactivate(voucher)} title={t('voucherAdmin.deactivate')}>
                          <HiOutlineTrash />
                        </button>
                      ) : (
                        <>
                          <button type="button" className="p-2 text-gray-400 hover:text-green-600" onClick={() => handleRestore(voucher)} title={t('voucherAdmin.restore')}>
                            <HiOutlineReply />
                          </button>
                          {Number(voucher.usedCount) === 0 && (
                            <button type="button" className="p-2 text-gray-400 hover:text-red-600" onClick={() => handleHardDelete(voucher)} title={t('voucherAdmin.hardDelete')}>
                              <HiOutlineTrash />
                            </button>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
