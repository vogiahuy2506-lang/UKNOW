import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  HiOutlineClipboardCopy,
  HiOutlineEye,
  HiOutlineEyeOff,
  HiOutlinePlus,
  HiOutlineRefresh,
  HiOutlineTrash,
  HiOutlinePencilAlt,
  HiOutlineReply,
  HiOutlineTag,
} from 'react-icons/hi';
import PageContainer from '../../components/common/PageContainer';
import Modal from '../../components/Modal';
import adminVouchersApiService from '../../features/admin/services/adminVouchersApi.service';
import { Field, FormSection, ModalShell } from '../../features/admin/plans/PlanModalsShared.jsx';
import { PriceInput } from '../../features/admin/plans/PlanInputs.jsx';
import { MODAL_FORM, renderModal } from '../../features/admin/plans/planUtils.jsx';
import adminPlansApiService from '../../features/admin/services/adminPlansApi.service';
import { useI18n } from '../../i18n';
import { getVoucherLifecycleStatus } from './voucherStatus.util.js';
import { toInputDate } from '../../utils/voucherDate.util.js';
import NumberInput from '../../components/common/NumberInput';

const fmtVnd = (n) => Number(n || 0).toLocaleString('vi-VN') + ' đ';
// Ngày luôn đủ 2 chữ số (01/09/2026): vi-VN mặc định ra "1/9/2026" nên cột ngày lệch độ rộng giữa các dòng.
const fmtDate = (d, locale = 'vi') => d
  ? new Date(d).toLocaleDateString(locale === 'en' ? 'en-US' : 'vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
  : '—';
const fmtDateTime = (d, locale = 'vi') => d
  ? new Date(d).toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : '—';
const fmtInt = (n) => Number(n || 0).toLocaleString('vi-VN');

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

/** Mức giảm tách 2 phần: `main` ("10%" / "50.000 đ") và `cap` ("tối đa 500.000 đ", chỉ khi giảm % có trần) để bảng xếp 2 dòng gọn. */
const discountParts = (voucher, t) => {
  if (voucher.discountType === 'percentage') {
    return {
      main: `${Number(voucher.discountValue || 0)}%`,
      cap: voucher.maxDiscountAmount ? `${t('voucherAdmin.maxDiscount')} ${fmtVnd(voucher.maxDiscountAmount)}` : '',
    };
  }
  return { main: fmtVnd(voucher.discountValue), cap: '' };
};

const resolveVoucherMode = (voucher) => voucher.offerMode || (voucher.autoApply ? 'automatic' : 'public_code');

/** Mã hiển thị ở bảng/modal: khuyến mãi tự động -> tên; mã bí mật -> che trừ khi đã bấm hiện. */
const getCodeDisplay = (voucher, mode, revealed, t) => {
  if (mode === 'automatic') return voucher.name || t('voucherAdmin.autoBadge');
  if (mode === 'private_code') return revealed ? voucher.code : `••••${String(voucher.code || '').slice(-4)}`;
  return voucher.code;
};

// Lớp `badge-yellow` / `badge-green` KHÔNG có trong index.css (chip mất màu, chữ xuống dòng) — dùng đúng các lớp có thật.
const MODE_BADGE_CLASS = {
  public_code: 'badge-info',
  private_code: 'badge-warning',
  automatic: 'bg-violet-100 text-violet-800 dark:bg-violet-950/40 dark:text-violet-300',
};

const ModeChip = ({ mode, t }) => (
  <span className={`badge shrink-0 whitespace-nowrap text-xs ${MODE_BADGE_CLASS[mode] || 'badge-gray'}`}>
    {t(`voucherAdmin.modeBadge.${mode}`)}
  </span>
);

const StatusChip = ({ status, t }) => (
  <span className={`badge whitespace-nowrap text-xs ${status === 'active' ? 'badge-success' : 'badge-gray'}`}>
    {t(`voucherAdmin.statusBadge.${status}`)}
  </span>
);

const UsageMeter = ({ voucher }) => {
  const used = Number(voucher.usedCount) || 0;
  const limit = Number(voucher.usageLimit) || 0;
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  return (
    <div className="min-w-[5rem]">
      <div className="whitespace-nowrap tabular-nums text-gray-900 dark:text-dk-text">
        <span className="font-semibold">{fmtInt(used)}</span>
        <span className="text-gray-400 dark:text-dk-text2"> / {limit > 0 ? fmtInt(limit) : '∞'}</span>
      </div>
      {limit > 0 && (
        <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-dk-strong" aria-hidden="true">
          <div className={`h-full rounded-full ${pct >= 100 ? 'bg-red-500' : 'bg-primary-500'}`} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
};

const ACTION_TONE = {
  primary: 'hover:text-primary-600 dark:hover:text-primary-400',
  danger: 'hover:text-red-600 dark:hover:text-red-400',
  success: 'hover:text-green-600 dark:hover:text-green-400',
};

/** Nút biểu tượng ở cột Hành động: luôn có `title` (rê chuột) và `aria-label` (trình đọc màn hình). */
const RowActionButton = ({ label, onClick, tone = 'primary', children }) => (
  <button
    type="button"
    className={`p-2 text-gray-400 dark:text-dk-muted ${ACTION_TONE[tone]}`}
    onClick={onClick}
    title={label}
    aria-label={label}
  >
    {children}
  </button>
);

const DetailRow = ({ label, children, testId }) => (
  <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-3 py-2 sm:grid-cols-[170px_minmax(0,1fr)]" data-testid={testId}>
    <dt className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-dk-text2">{label}</dt>
    <dd className="min-w-0 break-words text-sm text-gray-900 dark:text-dk-text">{children}</dd>
  </div>
);

const CodeChips = ({ items, fallback }) => (
  items.length === 0 ? (
    <span>{fallback}</span>
  ) : (
    <span className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <span key={item.key} className="rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 dark:bg-dk-raised dark:text-dk-text">
          {item.label}
        </span>
      ))}
    </span>
  )
);

// Modal chi tiết voucher — chỉ trình bày lại object voucher của dòng (không gọi API mới); "Sửa" mở form sửa sẵn có.
const VoucherDetailModal = ({ voucher, revealed, onToggleReveal, onCopy, onEdit, onClose, t, locale }) => {
  const mode = resolveVoucherMode(voucher);
  const status = getVoucherLifecycleStatus(voucher);
  const offer = discountParts(voucher, t);
  const planCodes = voucher.appliesToPlanCodes || [];
  const cycles = voucher.appliesToBillingPeriods || [];
  const hasCode = mode !== 'automatic' && Boolean(voucher.code);
  const hasLimit = Number(voucher.usageLimit) > 0;

  return (
    <Modal isOpen onClose={onClose} size="2xl" title={t('voucherAdmin.detail.title')}>
      <div className="space-y-4" data-testid="voucher-detail-modal">
        <div className="flex flex-wrap items-center gap-2">
          <ModeChip mode={mode} t={t} />
          <StatusChip status={status} t={t} />
        </div>

        <dl className="divide-y divide-gray-100 rounded-lg border border-gray-100 px-4 dark:divide-dk-border dark:border-dk-border dark:bg-dk-surface">
          <DetailRow label={t('voucherAdmin.voucherCode')} testId="voucher-detail-code">
            {hasCode ? (
              <span className="inline-flex flex-wrap items-center gap-2">
                <span className="font-mono font-semibold">{getCodeDisplay(voucher, mode, revealed, t)}</span>
                {mode === 'private_code' && (
                  <button
                    type="button"
                    onClick={onToggleReveal}
                    className="inline-flex items-center gap-1 text-xs text-primary-600 hover:underline dark:text-primary-400"
                  >
                    {revealed ? <HiOutlineEyeOff className="h-3.5 w-3.5" /> : <HiOutlineEye className="h-3.5 w-3.5" />}
                    {revealed ? t('voucherAdmin.hideCode') : t('voucherAdmin.revealCode')}
                  </button>
                )}
                <button
                  type="button"
                  onClick={onCopy}
                  className="inline-flex items-center gap-1 text-xs text-primary-600 hover:underline dark:text-primary-400"
                >
                  <HiOutlineClipboardCopy className="h-3.5 w-3.5" />
                  {t('common.copy')}
                </button>
              </span>
            ) : (
              <span className="text-gray-500 dark:text-dk-text2">{t('voucherAdmin.autoPromotion')}</span>
            )}
          </DetailRow>

          <DetailRow label={t('voucherAdmin.displayName')}>{voucher.name || '—'}</DetailRow>
          <DetailRow label={t('voucherAdmin.description')} testId="voucher-detail-description">
            {voucher.description
              ? <p className="whitespace-pre-wrap break-words">{voucher.description}</p>
              : <span className="text-gray-400 dark:text-dk-muted">—</span>}
          </DetailRow>

          <DetailRow label={t('voucherAdmin.tableOffer')} testId="voucher-detail-offer">
            <span className="font-semibold">{offer.main}</span>
            {offer.cap && <span className="text-gray-500 dark:text-dk-text2">{`, ${offer.cap}`}</span>}
          </DetailRow>

          <DetailRow label={t('voucherAdmin.minOrder')}>{fmtVnd(voucher.minOrderAmount)}</DetailRow>
          <DetailRow label={t('voucherAdmin.applicablePlans')} testId="voucher-detail-plans">
            <CodeChips
              items={planCodes.map((code) => ({ key: code, label: code }))}
              fallback={t('voucherAdmin.allPlans')}
            />
          </DetailRow>
          <DetailRow label={t('voucherAdmin.applicableCycles')} testId="voucher-detail-cycles">
            <CodeChips
              items={cycles.map((cycle) => ({
                key: cycle,
                label: cycle === 'monthly' || cycle === 'yearly' ? t(`voucherAdmin.${cycle}`) : cycle,
              }))}
              fallback={t('voucherAdmin.allCycles')}
            />
          </DetailRow>

          <DetailRow label={t('voucherAdmin.tableTime')} testId="voucher-detail-time">
            <span className="whitespace-nowrap tabular-nums">
              {voucher.startsAt ? fmtDate(voucher.startsAt, locale) : '—'}
              {' → '}
              {voucher.endsAt ? fmtDate(voucher.endsAt, locale) : t('voucherAdmin.noExpiry')}
            </span>
          </DetailRow>

          <DetailRow label={t('voucherAdmin.tableUsage')} testId="voucher-detail-usage">
            <span className="tabular-nums">
              {t('voucherAdmin.detail.usedOf', { used: fmtInt(voucher.usedCount), limit: hasLimit ? fmtInt(voucher.usageLimit) : t('voucherAdmin.unlimited') })}
            </span>
          </DetailRow>
          <DetailRow label={t('voucherAdmin.usagePerUser')}>
            {Number(voucher.usageLimitPerUser) > 0 ? fmtInt(voucher.usageLimitPerUser) : t('voucherAdmin.unlimited')}
          </DetailRow>

          {voucher.createdAt && <DetailRow label={t('voucherAdmin.detail.createdAt')}>{fmtDateTime(voucher.createdAt, locale)}</DetailRow>}
          {voucher.updatedAt && <DetailRow label={t('voucherAdmin.detail.updatedAt')}>{fmtDateTime(voucher.updatedAt, locale)}</DetailRow>}
        </dl>

        {/* Dính đáy vùng cuộn: mô tả dài làm modal phải cuộn thì nút Đóng/Sửa vẫn luôn thấy. */}
        <div className="sticky bottom-0 flex justify-end gap-3 border-t border-gray-100 bg-white pt-3 dark:border-dk-border dark:bg-dk-raised">
          <button type="button" className="btn btn-secondary" onClick={onClose}>{t('common.close')}</button>
          <button type="button" className="btn btn-primary" onClick={onEdit}>
            <HiOutlinePencilAlt className="mr-2 h-4 w-4" />
            {t('common.edit')}
          </button>
        </div>
      </div>
    </Modal>
  );
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

const SelectablePill = ({ checked, title, subtitle, onClick, disabled = false, disabledTitle }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    title={disabled ? disabledTitle : undefined}
    className={`rounded-xl border px-4 py-3 text-left transition-all ${
      checked
        ? 'border-orange-300 dark:border-orange-500/50 bg-orange-50 dark:bg-orange-950/30 text-orange-700 dark:text-orange-300 shadow-sm'
        : 'border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface text-slate-700 dark:text-dk-text hover:border-orange-200 dark:hover:border-orange-500/30 hover:bg-orange-50/60 dark:hover:bg-orange-950/20'
    } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
  >
    <span className="block text-sm font-bold">{title}</span>
    {subtitle && <span className="mt-1 block text-xs text-slate-500 dark:text-dk-text2">{subtitle}</span>}
  </button>
);

const VoucherForm = ({ editing, form, setForm, onCancel, onSubmit, saving, plans, t }) => {
  const offerMode = resolveFormOfferMode(form);
  const isAutomatic = offerMode === 'automatic';
  const isModeLocked = Boolean(editing?.hasOrderReference);
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
            disabled={isModeLocked}
            disabledTitle={t('voucherAdmin.modeLockedHint')}
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
            disabled={isModeLocked}
            disabledTitle={t('voucherAdmin.modeLockedHint')}
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
            disabled={isModeLocked}
            disabledTitle={t('voucherAdmin.modeLockedHint')}
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
        {editing && (
          <p className={`mt-3 text-xs ${isModeLocked ? 'text-amber-700 dark:text-amber-400' : 'text-slate-500 dark:text-dk-text2'}`}>
            {isModeLocked ? t('voucherAdmin.modeLockedHint') : t('voucherAdmin.modeEditableHint')}
          </p>
        )}
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
                <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-4 text-sm text-gray-400 dark:text-dk-muted">%</span>
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
                <p className="mt-1.5 text-xs text-amber-600 dark:text-amber-400">
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
            <NumberInput min={1} className="input w-full" value={form.usageLimit} onChange={(v) => setForm((p) => ({ ...p, usageLimit: v }))} placeholder={t('voucherAdmin.unlimited')} />
          </Field>
          <Field label={t('voucherAdmin.usagePerUser')} note={t('voucherAdmin.usagePerUserHint')}>
            <NumberInput min={1} className="input w-full" value={form.usageLimitPerUser} onChange={(v) => setForm((p) => ({ ...p, usageLimitPerUser: v }))} placeholder={t('voucherAdmin.unlimited')} />
          </Field>
        </div>
      </FormSection>

      <FormSection
        kicker="STATUS"
        title={t('voucherAdmin.status')}
        description={isAutomatic ? t('voucherAdmin.autoStatusDescription') : t('voucherAdmin.manualStatusDescription')}
      >
        <p className="mb-3 text-sm text-slate-500 dark:text-dk-text2">{t('voucherAdmin.oneCodePerOrder')}</p>
        <label className="flex items-center rounded-xl border border-slate-200 dark:border-dk-border bg-slate-50 dark:bg-dk-surface px-4 py-3 text-sm text-slate-700 dark:text-dk-text">
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
const OFFER_MODE_FILTERS = ['all', 'public_code', 'private_code', 'automatic'];

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
  const [offerModeFilter, setOfferModeFilter] = useState('all');
  const [revealedPrivateIds, setRevealedPrivateIds] = useState(() => new Set());
  const [detailVoucherId, setDetailVoucherId] = useState(null); // id voucher đang mở modal chi tiết

  const counts = useMemo(() => {
    const now = Date.now();
    return vouchers.reduce((acc, v) => {
      acc[getVoucherLifecycleStatus(v, now)] += 1;
      return acc;
    }, { active: 0, expired: 0, disabled: 0 });
  }, [vouchers]);

  const filtered = useMemo(() => {
    const now = Date.now();
    return vouchers.filter((voucher) => {
      const mode = voucher.offerMode || (voucher.autoApply ? 'automatic' : 'public_code');
      return getVoucherLifecycleStatus(voucher, now) === tab &&
        (offerModeFilter === 'all' || mode === offerModeFilter);
    });
  }, [vouchers, offerModeFilter, tab]);

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

  const detailVoucher = useMemo(
    () => (detailVoucherId == null ? null : vouchers.find((v) => v.id === detailVoucherId) || null),
    [detailVoucherId, vouchers],
  );

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

  const togglePrivateCode = (voucherId) => {
    setRevealedPrivateIds((current) => {
      const next = new Set(current);
      if (next.has(voucherId)) next.delete(voucherId);
      else next.add(voucherId);
      return next;
    });
  };

  const copyPrivateCode = async (code) => {
    try {
      await navigator.clipboard.writeText(String(code || ''));
      toast.success(t('voucherAdmin.codeCopied'));
    } catch {
      toast.error(t('voucherAdmin.copyCodeFailed'));
    }
  };

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
    <PageContainer
      title={t('voucherAdmin.title')}
      subtitle={t('voucherAdmin.subtitle')}
      icon={HiOutlineTag}
      actions={
        <div className="flex items-center gap-2">
          <button type="button" className="btn btn-secondary" onClick={fetchVouchers} disabled={loading}>
            <HiOutlineRefresh className="w-4 h-4 mr-2" /> {t('voucherAdmin.refresh')}
          </button>
          <button type="button" className="btn btn-primary" onClick={openCreate}>
            <HiOutlinePlus className="w-4 h-4 mr-2" /> {t('voucherAdmin.createButton')}
          </button>
        </div>
      }
    >

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card p-4 dark:bg-dk-surface dark:border-dk-border"><p className="text-xs text-gray-400 dark:text-dk-text2 uppercase">{t('voucherAdmin.activeVouchers')}</p><p className="text-2xl font-bold dark:text-dk-text">{counts.active}</p></div>
        <div className="card p-4 dark:bg-dk-surface dark:border-dk-border"><p className="text-xs text-gray-400 dark:text-dk-text2 uppercase">{t('voucherAdmin.expiredVouchers')}</p><p className="text-2xl font-bold dark:text-dk-text">{counts.expired}</p></div>
        <div className="card p-4 dark:bg-dk-surface dark:border-dk-border"><p className="text-xs text-gray-400 dark:text-dk-text2 uppercase">{t('voucherAdmin.disabledVouchers')}</p><p className="text-2xl font-bold dark:text-dk-text">{counts.disabled}</p></div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {TABS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                tab === key ? 'bg-primary-600 text-white' : 'bg-slate-100 dark:bg-dk-raised text-slate-700 dark:text-dk-text hover:bg-slate-200 dark:hover:bg-dk-strong'
              }`}
            >
              {t(`voucherAdmin.tab.${key}`)} ({counts[key]})
            </button>
          ))}
        </div>
        <select
          className="input min-w-44 text-sm"
          value={offerModeFilter}
          onChange={(event) => setOfferModeFilter(event.target.value)}
          aria-label={t('voucherAdmin.filterByMode')}
        >
          {OFFER_MODE_FILTERS.map((mode) => (
            <option key={mode} value={mode}>
              {mode === 'all' ? t('voucherAdmin.allModes') : t(`voucherAdmin.modeBadge.${mode}`)}
            </option>
          ))}
        </select>
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

      {detailVoucher && (
        <VoucherDetailModal
          voucher={detailVoucher}
          revealed={revealedPrivateIds.has(detailVoucher.id)}
          onToggleReveal={() => togglePrivateCode(detailVoucher.id)}
          onCopy={() => copyPrivateCode(detailVoucher.code)}
          onEdit={() => {
            setDetailVoucherId(null);
            openEdit(detailVoucher);
          }}
          onClose={() => setDetailVoucherId(null)}
          t={t}
          locale={locale}
        />
      )}

      <div className="card overflow-hidden dark:bg-dk-surface dark:border-dk-border">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-dk-raised border-b border-gray-200 dark:border-dk-border">
              <tr>
                {[
                  { key: 'code', label: t('voucherAdmin.tableCode') },
                  { key: 'offer', label: t('voucherAdmin.tableOffer') },
                  { key: 'usage', label: t('voucherAdmin.tableUsage') },
                  { key: 'expiry', label: t('voucherAdmin.tableExpiry') },
                  { key: 'status', label: t('voucherAdmin.tableStatus') },
                  { key: 'actions', label: t('voucherAdmin.tableActions'), right: true },
                ].map((col) => (
                  <th
                    key={col.key}
                    className={`px-4 py-3 text-xs font-semibold text-gray-500 dark:text-dk-text2 uppercase tracking-wide whitespace-nowrap ${col.right ? 'text-right' : 'text-left'}`}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-dk-border/60">
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400 dark:text-dk-muted">{t('voucherAdmin.loading')}</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400 dark:text-dk-muted">{t('voucherAdmin.empty')}</td></tr>
              ) : filtered.map((voucher) => {
                const status = getVoucherLifecycleStatus(voucher);
                const mode = resolveVoucherMode(voucher);
                const privateCodeRevealed = mode === 'private_code' && revealedPrivateIds.has(voucher.id);
                const codeDisplay = getCodeDisplay(voucher, mode, privateCodeRevealed, t);
                const offer = discountParts(voucher, t);
                // Dòng 2 của ô Mã: tên hiển thị (khuyến mãi tự động đã lấy tên làm "mã" ở dòng 1 nên dòng 2 là mô tả).
                const note = mode === 'automatic' ? (voucher.description || '') : (voucher.name || '');
                const noteTitle = [voucher.name, voucher.description].filter(Boolean).join('\n');
                return (
                  <tr key={voucher.id} className="hover:bg-gray-50 dark:hover:bg-dk-raised/40">
                    <td className="px-4 py-3">
                      <div className="max-w-[22rem]">
                        <div className="flex items-center gap-1">
                          <span className="min-w-0 truncate font-mono font-semibold text-gray-900 dark:text-dk-text" title={codeDisplay}>{codeDisplay}</span>
                          {mode === 'private_code' && (
                            <>
                              <button
                                type="button"
                                className="shrink-0 p-1 text-gray-400 dark:text-dk-muted hover:text-primary-600 dark:hover:text-primary-400"
                                onClick={() => togglePrivateCode(voucher.id)}
                                title={privateCodeRevealed ? t('voucherAdmin.hideCode') : t('voucherAdmin.revealCode')}
                                aria-label={privateCodeRevealed ? t('voucherAdmin.hideCode') : t('voucherAdmin.revealCode')}
                              >
                                {privateCodeRevealed ? <HiOutlineEyeOff /> : <HiOutlineEye />}
                              </button>
                              <button
                                type="button"
                                className="shrink-0 p-1 text-gray-400 dark:text-dk-muted hover:text-primary-600 dark:hover:text-primary-400"
                                onClick={() => copyPrivateCode(voucher.code)}
                                title={t('voucherAdmin.copyCode')}
                                aria-label={t('voucherAdmin.copyCode')}
                              >
                                <HiOutlineClipboardCopy />
                              </button>
                            </>
                          )}
                        </div>
                        <div className="mt-1 flex items-center gap-2">
                          <ModeChip mode={mode} t={t} />
                          {note && (
                            <span className="min-w-0 truncate text-xs text-gray-500 dark:text-dk-text2" title={noteTitle}>{note}</span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="font-semibold text-gray-900 dark:text-dk-text">{offer.main}</div>
                      {offer.cap && <div className="text-xs text-gray-500 dark:text-dk-text2">{offer.cap}</div>}
                    </td>
                    <td className="px-4 py-3"><UsageMeter voucher={voucher} /></td>
                    <td className="px-4 py-3 whitespace-nowrap tabular-nums text-gray-600 dark:text-dk-text">
                      {voucher.endsAt
                        ? fmtDate(voucher.endsAt, locale)
                        : <span className="text-gray-400 dark:text-dk-text2">{t('voucherAdmin.noExpiry')}</span>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap"><StatusChip status={status} t={t} /></td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <RowActionButton label={t('voucherAdmin.viewDetail')} onClick={() => setDetailVoucherId(voucher.id)}>
                        <HiOutlineEye />
                      </RowActionButton>
                      <RowActionButton label={t('voucherAdmin.editTitle')} onClick={() => openEdit(voucher)}>
                        <HiOutlinePencilAlt />
                      </RowActionButton>
                      {status === 'active' ? (
                        <RowActionButton label={t('voucherAdmin.deactivate')} tone="danger" onClick={() => handleDeactivate(voucher)}>
                          <HiOutlineTrash />
                        </RowActionButton>
                      ) : (
                        <>
                          <RowActionButton label={t('voucherAdmin.restore')} tone="success" onClick={() => handleRestore(voucher)}>
                            <HiOutlineReply />
                          </RowActionButton>
                          {Number(voucher.usedCount) === 0 && (
                            <RowActionButton label={t('voucherAdmin.hardDelete')} tone="danger" onClick={() => handleHardDelete(voucher)}>
                              <HiOutlineTrash />
                            </RowActionButton>
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
    </PageContainer>
  );
}
