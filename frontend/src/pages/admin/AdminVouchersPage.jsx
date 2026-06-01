import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { HiOutlinePlus, HiOutlineRefresh, HiOutlineTrash, HiOutlinePencilAlt } from 'react-icons/hi';
import adminVouchersApiService from '../../features/admin/services/adminVouchersApi.service';
import { Field, FormSection, ModalShell } from '../../features/admin/plans/PlanModalsShared.jsx';
import { MODAL_FORM, renderModal } from '../../features/admin/plans/planUtils.jsx';
import adminPlansApiService from '../../features/admin/services/adminPlansApi.service';
import { useI18n } from '../../i18n';

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
  appliesToBillingPeriods: '',
  startsAt: '',
  endsAt: '',
  usageLimit: '',
  usageLimitPerUser: 1,
  autoApply: false,
  stackable: false,
  isActive: true,
};

const toInputDate = (value) => value ? String(value).slice(0, 10) : '';

const normalizeCsv = (value) => String(value || '').split(',').map((item) => item.trim()).filter(Boolean);

const toPayload = (form) => ({
  ...form,
  code: String(form.code || '').trim().toUpperCase(),
  discountValue: Number(form.discountValue || 0),
  maxDiscountAmount: form.maxDiscountAmount === '' ? null : Number(form.maxDiscountAmount),
  minOrderAmount: form.minOrderAmount === '' ? 0 : Number(form.minOrderAmount),
  usageLimit: form.usageLimit === '' ? null : Number(form.usageLimit),
  usageLimitPerUser: form.usageLimitPerUser === '' ? null : Number(form.usageLimitPerUser),
  appliesToPlanCodes: normalizeCsv(form.appliesToPlanCodes),
  appliesToBillingPeriods: normalizeCsv(form.appliesToBillingPeriods),
  startsAt: form.startsAt ? `${form.startsAt}T00:00:00` : null,
  endsAt: form.endsAt ? `${form.endsAt}T23:59:59` : null,
});

const fromVoucher = (voucher) => ({
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
  autoApply: Boolean(voucher.autoApply),
  stackable: Boolean(voucher.stackable),
  isActive: Boolean(voucher.isActive),
});

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
};

const getVoucherErrorMessage = (err, t, fallbackKey) => {
  const message = err?.response?.data?.message;
  const key = voucherErrorKeyMap[message];
  return key ? t(key) : (message || t(fallbackKey));
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
  const selectedPlanCodes = normalizeCsv(form.appliesToPlanCodes).map(normalizeCode);
  const selectedPeriods = normalizeCsv(form.appliesToBillingPeriods).map(normalizeCode);
  const allPlansSelected = selectedPlanCodes.length === 0;
  const allPeriodsSelected = selectedPeriods.length === 0;

  return (
  renderModal(
    <ModalShell
      onSubmit={onSubmit}
      title={editing ? t('voucherAdmin.editTitle') : t('voucherAdmin.createTitle')}
      subtitle={t('voucherAdmin.formSubtitle')}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>{t('voucherAdmin.cancel')}</button>
          <button className="btn btn-primary px-6" disabled={saving}>{saving ? t('voucherAdmin.saving') : t('voucherAdmin.saveVoucher')}</button>
        </>
      }
    >
      <FormSection
        kicker="TYPE"
        title={t('voucherAdmin.offerType')}
        description={t('voucherAdmin.offerTypeDescription')}
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <SelectablePill
            checked={!form.autoApply}
            title={t('voucherAdmin.manualCode')}
            subtitle={t('voucherAdmin.manualCodeSubtitle')}
            onClick={() => setForm((p) => ({ ...p, autoApply: false }))}
          />
          <SelectablePill
            checked={form.autoApply}
            title={t('voucherAdmin.autoPromotion')}
            subtitle={t('voucherAdmin.autoPromotionSubtitle')}
            onClick={() => setForm((p) => ({ ...p, autoApply: true }))}
          />
        </div>
      </FormSection>

      <FormSection
        kicker="DISCOUNT"
        title={t('voucherAdmin.discountInfo')}
        description={form.autoApply ? t('voucherAdmin.autoDiscountDescription') : t('voucherAdmin.manualDiscountDescription')}
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Field label={t('voucherAdmin.voucherCode')}>
        <input className="input w-full uppercase" value={form.code} onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))} placeholder="WELCOME20" />
          </Field>
          <Field label={t('voucherAdmin.displayName')} className="md:col-span-2">
        <input className="input w-full" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder={t('voucherAdmin.displayNamePlaceholder')} />
          </Field>
          <Field label={t('voucherAdmin.description')} className="md:col-span-3">
        <input className="input w-full" value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} placeholder={t('voucherAdmin.descriptionPlaceholder')} />
          </Field>
          <Field label={t('voucherAdmin.discountType')}>
        <select className="input w-full" value={form.discountType} onChange={(e) => setForm((p) => ({ ...p, discountType: e.target.value }))}>
          <option value="fixed_amount">{t('voucherAdmin.fixedAmount')}</option>
          <option value="percentage">{t('voucherAdmin.percentage')}</option>
        </select>
          </Field>
          <Field label={t('voucherAdmin.value')}>
        <input type="number" min="0" className="input w-full" value={form.discountValue} onChange={(e) => setForm((p) => ({ ...p, discountValue: e.target.value }))} />
          </Field>
          <Field label={t('voucherAdmin.maxDiscountField')} note={t('voucherAdmin.maxDiscountNote')}>
        <input type="number" min="0" className="input w-full" value={form.maxDiscountAmount} onChange={(e) => setForm((p) => ({ ...p, maxDiscountAmount: e.target.value }))} placeholder={t('voucherAdmin.maxDiscountPlaceholder')} />
          </Field>
        </div>
      </FormSection>

      <FormSection
        kicker="RULES"
        title={t('voucherAdmin.rules')}
        description={form.autoApply ? t('voucherAdmin.autoRulesDescription') : t('voucherAdmin.manualRulesDescription')}
      >
        <div className="space-y-5">
          <Field label={t('voucherAdmin.minOrder')}>
            <input type="number" min="0" className="input w-full md:max-w-xs" value={form.minOrderAmount} onChange={(e) => setForm((p) => ({ ...p, minOrderAmount: e.target.value }))} placeholder="500000" />
          </Field>

          <div>
            <p className="mb-2 text-sm font-semibold text-slate-700">{t('voucherAdmin.applicablePlans')}</p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <SelectablePill
                checked={allPlansSelected}
                title={t('voucherAdmin.allPlans')}
                subtitle={t('voucherAdmin.allPlansSubtitle')}
                onClick={() => setForm((p) => ({ ...p, appliesToPlanCodes: '' }))}
              />
              {plans.map((plan) => {
                const code = normalizeCode(plan.code);
                return (
                  <SelectablePill
                    key={plan.id || code}
                    checked={!allPlansSelected && selectedPlanCodes.includes(code)}
                    title={plan.name}
                    subtitle={code}
                    onClick={() => setForm((p) => ({ ...p, appliesToPlanCodes: toggleCsvValue(p.appliesToPlanCodes, code) }))}
                  />
                );
              })}
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold text-slate-700">{t('voucherAdmin.applicableCycles')}</p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <SelectablePill
                checked={allPeriodsSelected}
                title={t('voucherAdmin.allCycles')}
                subtitle={t('voucherAdmin.monthAndYear')}
                onClick={() => setForm((p) => ({ ...p, appliesToBillingPeriods: '' }))}
              />
              <SelectablePill
                checked={!allPeriodsSelected && selectedPeriods.includes('monthly')}
                title={t('voucherAdmin.monthly')}
                subtitle="monthly"
                onClick={() => setForm((p) => ({ ...p, appliesToBillingPeriods: toggleCsvValue(p.appliesToBillingPeriods, 'monthly') }))}
              />
              <SelectablePill
                checked={!allPeriodsSelected && selectedPeriods.includes('yearly')}
                title={t('voucherAdmin.yearly')}
                subtitle="yearly"
                onClick={() => setForm((p) => ({ ...p, appliesToBillingPeriods: toggleCsvValue(p.appliesToBillingPeriods, 'yearly') }))}
              />
            </div>
          </div>
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
          <Field label={t('voucherAdmin.endsAt')}>
        <input type="date" className="input w-full" value={form.endsAt} onChange={(e) => setForm((p) => ({ ...p, endsAt: e.target.value }))} />
          </Field>
          <Field label={t('voucherAdmin.usageLimit')}>
        <input type="number" min="0" className="input w-full" value={form.usageLimit} onChange={(e) => setForm((p) => ({ ...p, usageLimit: e.target.value }))} placeholder={t('voucherAdmin.unlimited')} />
          </Field>
          <Field label={t('voucherAdmin.usagePerUser')}>
        <input type="number" min="0" className="input w-full" value={form.usageLimitPerUser} onChange={(e) => setForm((p) => ({ ...p, usageLimitPerUser: e.target.value }))} />
          </Field>
        </div>
      </FormSection>

      <FormSection
        kicker="STATUS"
        title={t('voucherAdmin.status')}
        description={form.autoApply ? t('voucherAdmin.autoStatusDescription') : t('voucherAdmin.manualStatusDescription')}
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="flex items-center rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            <input type="checkbox" className="h-4 w-4 rounded text-primary-600" checked={form.isActive} onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.checked }))} />
            <span className="ml-3 font-semibold">{t('voucherAdmin.active')}</span>
          </label>
          <label className="flex items-center rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            <input type="checkbox" className="h-4 w-4 rounded text-primary-600" checked={form.stackable} onChange={(e) => setForm((p) => ({ ...p, stackable: e.target.checked }))} />
            <span className="ml-3 font-semibold">{t('voucherAdmin.stackable')}</span>
          </label>
        </div>
      </FormSection>
    </ModalShell>,
    onCancel,
    MODAL_FORM
  )
  );
};

export default function AdminVouchersPage() {
  const { t, locale } = useI18n();
  const [vouchers, setVouchers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [plans, setPlans] = useState([]);

  const activeCount = useMemo(() => vouchers.filter((v) => v.isActive).length, [vouchers]);

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

  const handleDelete = async (voucher) => {
    if (!window.confirm(t('voucherAdmin.deleteConfirm', { code: voucher.code }))) return;
    try {
      await adminVouchersApiService.deleteVoucher(voucher.id);
      toast.success(t('voucherAdmin.deleteSuccess'));
      fetchVouchers();
    } catch (err) {
      toast.error(getVoucherErrorMessage(err, t, 'voucherAdmin.deleteFailed'));
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
        <div className="card p-4"><p className="text-xs text-gray-400 uppercase">{t('voucherAdmin.totalVouchers')}</p><p className="text-2xl font-bold">{vouchers.length}</p></div>
        <div className="card p-4"><p className="text-xs text-gray-400 uppercase">{t('voucherAdmin.activeVouchers')}</p><p className="text-2xl font-bold">{activeCount}</p></div>
        <div className="card p-4"><p className="text-xs text-gray-400 uppercase">{t('voucherAdmin.autoApplyCount')}</p><p className="text-2xl font-bold">{vouchers.filter((v) => v.autoApply).length}</p></div>
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
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-400">{t('voucherAdmin.loading')}</td></tr>
              ) : vouchers.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-400">{t('voucherAdmin.empty')}</td></tr>
              ) : vouchers.map((voucher) => (
                <tr key={voucher.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="font-mono font-semibold text-gray-900">{voucher.code}</div>
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
                      <span className={`badge text-xs ${voucher.isActive ? 'badge-green' : 'badge-gray'}`}>{voucher.isActive ? t('voucherAdmin.activeBadge') : t('voucherAdmin.offBadge')}</span>
                      {voucher.autoApply && <span className="badge badge-yellow text-xs">{t('voucherAdmin.autoBadge')}</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button type="button" className="p-2 text-gray-400 hover:text-primary-600" onClick={() => openEdit(voucher)}><HiOutlinePencilAlt /></button>
                    <button type="button" className="p-2 text-gray-400 hover:text-red-600" onClick={() => handleDelete(voucher)}><HiOutlineTrash /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
