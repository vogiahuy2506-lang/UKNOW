import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import { useI18n } from '../../i18n';

// ── Tooltip ───────────────────────────────────────────────────────────────────
const Tooltip = ({ label, children }) => (
  <div className="relative group inline-flex">
    {children}
    {/* hidden (display:none) thay opacity-0: chú thích ẩn của nút ngoài cùng bên phải vẫn tính vào vùng cuộn ngang của bảng */}
    <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 text-xs text-white bg-gray-800 rounded whitespace-nowrap hidden group-hover:block z-20">
      {label}
      <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-800" />
    </div>
  </div>
);
import {
  HiOutlineRefresh, HiOutlineSearch,
  HiOutlineLockClosed, HiOutlineLockOpen, HiOutlineShieldCheck, HiOutlineShieldExclamation,
  HiOutlineCurrencyDollar, HiOutlineXCircle, HiOutlineMailOpen, HiOutlineTrash, HiOutlineUsers, HiOutlineKey,
  HiOutlineEye, HiOutlineClipboardCopy, HiOutlineUser, HiOutlineX,
} from 'react-icons/hi';
import PageContainer from '../../components/common/PageContainer';
import adminMembersApiService from '../../features/admin/services/adminMembersApi.service';
import adminPlansApiService from '../../features/admin/services/adminPlansApi.service';
import { useAuthStore } from '../../stores/authStore';
import { isPlaceholderPlan } from '../../utils/placeholderPlan.util';

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('vi-VN') : '—';

// Thẻ đầu trang (PR-9): bấm thẻ = lọc danh sách đúng theo điều kiện đã đếm. `filter` là giá trị planState gửi lên API
// ('' = không lọc theo trạng thái gói).
const SUMMARY_CARDS = [
  { key: 'customers', filter: '' },
  { key: 'paying', filter: 'paying' },
  { key: 'trial', filter: 'trial' },
  { key: 'expiring7d', filter: 'expiring' },
  { key: 'expired30d', filter: 'expired30' },
];

const SummaryCard = ({ cardKey, value, hint, active, onClick, label }) => (
  <button
    type="button"
    onClick={onClick}
    data-testid={`members-summary-${cardKey}`}
    className={`card p-4 text-left transition-colors ${active ? 'ring-2 ring-primary-500' : 'hover:bg-gray-50 dark:hover:bg-dk-raised/40'}`}
  >
    <p className="text-xs text-gray-500 dark:text-dk-text2">{label}</p>
    <p className="text-2xl font-bold text-gray-900 dark:text-dk-text mt-0.5">{value}</p>
    {hint && <p className="text-xs text-gray-400 dark:text-dk-muted mt-0.5">{hint}</p>}
  </button>
);

const ExpiryBadge = ({ expiresAt, _hasPlan }) => {
  const { t } = useI18n();
  if (!expiresAt) return <span className="text-xs text-gray-400 dark:text-dk-muted">—</span>;

  const now = Date.now();
  const exp = new Date(expiresAt);
  const daysLeft = Math.ceil((exp - now) / 86400000);

  if (exp < now) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/40">
        {t('plans.expired')}
      </span>
    );
  }
  if (daysLeft <= 3) {
    return (
      <div>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/40">
          ⚠ {t('plans.daysLeft', { n: daysLeft })}
        </span>
        <p className="text-xs text-gray-400 dark:text-dk-muted mt-0.5">{exp.toLocaleDateString('vi-VN')}</p>
      </div>
    );
  }
  if (daysLeft <= 7) {
    return (
      <div>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-900/40">
          ⚠ {t('plans.daysLeft', { n: daysLeft })}
        </span>
        <p className="text-xs text-gray-400 dark:text-dk-muted mt-0.5">{exp.toLocaleDateString('vi-VN')}</p>
      </div>
    );
  }
  return (
    <div>
      <span className="text-xs text-gray-600 dark:text-dk-text font-medium">{exp.toLocaleDateString('vi-VN')}</span>
      <p className="text-xs text-gray-400 dark:text-dk-muted">{t('plans.daysLeft', { n: daysLeft })}</p>
    </div>
  );
};

const MODAL_OVERLAY = 'fixed inset-0 z-[9999] flex items-center justify-center p-4';
const MODAL_SM = 'relative z-10 w-full max-w-md rounded-xl bg-white dark:bg-dk-surface shadow-xl p-6 border border-transparent dark:border-dk-border text-gray-900 dark:text-dk-text';
const MODAL_MD = 'relative z-10 w-full max-w-lg rounded-xl bg-white dark:bg-dk-surface shadow-xl p-6 border border-transparent dark:border-dk-border text-gray-900 dark:text-dk-text';
const MODAL_LG = 'relative z-10 w-full max-w-2xl rounded-2xl bg-white dark:bg-dk-surface shadow-2xl p-6 border border-slate-200/80 dark:border-dk-border text-gray-900 dark:text-dk-text max-h-[90vh] overflow-y-auto';

const renderModal = (content, onClose, cls = MODAL_SM) =>
  createPortal(
    <div className={MODAL_OVERLAY}>
      <button type="button" className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className={cls}>{content}</div>
    </div>,
    document.body
  );

// ── AssignPlanModal ───────────────────────────────────────────────────────────
const AssignPlanModal = ({ member, plans, onClose, onDone }) => {
  const { t } = useI18n();
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [billingPeriod, setBillingPeriod]   = useState('monthly');
  const [paymentMethod, setPaymentMethod]   = useState('free');
  const [note, setNote]                     = useState('');
  const [quantity, setQuantity]             = useState(1);
  const [isSaving, setIsSaving]             = useState(false);

  const selectedPlan = plans.find((p) => String(p.id) === String(selectedPlanId));

  const handleAssign = async () => {
    if (!selectedPlanId) { toast.error(t('adminMembers.selectPlanRequired')); return; }
    try {
      setIsSaving(true);
      await adminPlansApiService.assignPlan(Number(selectedPlanId), member.email, {
        paymentMethod,
        note: note.trim() || null,
        billingPeriod,
        quantity,
      });
      toast.success(t('adminMembers.assignSuccess'));
      onDone();
      onClose();
    } catch (err) {
      toast.error(err?.response?.data?.message || t('adminMembers.assignFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  return renderModal(
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-dk-text">{t('adminMembers.assignPlan')}</h2>
        <p className="text-sm text-gray-500 dark:text-dk-text2 mt-1">
          {t('adminMembers.member')}: <strong className="text-gray-900 dark:text-dk-text">{member.fullName || member.username}</strong> ({member.email})
        </p>
        {member.planName && (
          <p className="text-sm text-gray-400 dark:text-dk-text2 mt-0.5">{t('adminMembers.currentPlan')}: <strong className="text-gray-800 dark:text-dk-text">{member.planName}</strong></p>
        )}
      </div>
      <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border border-transparent dark:border-amber-900/40 rounded-lg px-3 py-2">
        {t('adminMembers.assignNote')}
      </p>
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-dk-text mb-1">{t('adminMembers.selectPlan')}</label>
        <select className="input w-full" value={selectedPlanId} onChange={(e) => setSelectedPlanId(e.target.value)}>
          <option value="">{t('adminMembers.selectPlanPlaceholder')}</option>
          {/* Gói giữ chỗ "Tùy chọn"/"Liên hệ" không gán được (backend trả 400 PLACEHOLDER_PLAN_NOT_ASSIGNABLE) — loại khỏi danh sách chọn. */}
          {plans.filter((p) => !isPlaceholderPlan({ code: p.code, isCustom: p.isCustom })).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} {p.price > 0 ? `— ${Number(p.price).toLocaleString('vi-VN')} đ/tháng` : t('adminMembers.free')}
              {!p.is_active ? ` ${t('adminMembers.hidden')}` : ''}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-dk-text mb-1">{t('adminMembers.billingPeriod')}</label>
        <select className="input w-full" value={billingPeriod} onChange={(e) => setBillingPeriod(e.target.value)}>
          <option value="monthly">{t('adminMembers.billingMonthly')}</option>
          <option value="yearly">{t('adminMembers.billingYearly')}</option>
        </select>
        {selectedPlan && (
          <p className="text-xs text-gray-500 dark:text-dk-text2 mt-1">
            {billingPeriod === 'yearly' && selectedPlan.priceYearly
              ? `${Number(selectedPlan.priceYearly).toLocaleString('vi-VN')} đ/năm`
              : billingPeriod === 'yearly'
                ? `${(Number(selectedPlan.price) * 12).toLocaleString('vi-VN')} đ/năm (chưa cấu hình giá năm riêng)`
                : `${Number(selectedPlan.price).toLocaleString('vi-VN')} đ/tháng`}
          </p>
        )}
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-dk-text mb-1">{t('adminMembers.quantityLabel')}</label>
        <input
          type="number"
          className="input w-full"
          min={1}
          max={36}
          value={quantity}
          onChange={(e) => {
            const val = e.target.value;
            if (val === '') {
              setQuantity('');
            } else {
              setQuantity(Math.max(1, Math.min(36, Number(val))));
            }
          }}
        />
        <p className="text-xs text-gray-500 dark:text-dk-text2 mt-1">{t('adminMembers.quantityHint')}</p>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-dk-text mb-1">{t('adminMembers.paymentMethod')}</label>
        <select className="input w-full" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
          <option value="free">{t('adminMembers.freeDemo')}</option>
          <option value="manual">{t('adminMembers.manualPayment')}</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-dk-text mb-1">{t('adminMembers.note')}</label>
        <input
          className="input w-full"
          placeholder={t('adminMembers.placeholderNote')}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" className="btn btn-secondary" onClick={onClose} disabled={isSaving}>{t('common.cancel')}</button>
        <button type="button" className="btn btn-primary" onClick={handleAssign} disabled={isSaving || quantity === ''}>
          {isSaving ? t('adminMembers.confirming') : t('adminMembers.confirmAssign')}
        </button>
      </div>
    </div>,
    () => { if (!isSaving) onClose(); },
    MODAL_MD
  );
};

// ── TypeToConfirmModal — bắt gõ lại email mới cho bấm, dùng cho thao tác không
// hoàn tác được (gỡ email / xoá vĩnh viễn) ─────────────────────────────────────
const TypeToConfirmModal = ({
  member,
  titleKey,
  warningKey,
  confirmBtnKey,
  danger,
  isBusy,
  onConfirm,
  onClose,
  showReleaseTrialOption = false,
}) => {
  const { t } = useI18n();
  const [typed, setTyped] = useState('');
  const [releaseTrialHistory, setReleaseTrialHistory] = useState(false);
  const matches = typed.trim().toLowerCase() === (member.email || '').trim().toLowerCase();
  const iconBg = danger ? 'bg-red-100 dark:bg-red-950/60' : 'bg-amber-100 dark:bg-amber-950/60';
  const iconColor = danger ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400';
  const btnClass = danger ? 'btn-primary bg-red-600 hover:bg-red-700 border-red-600' : 'btn-primary bg-amber-600 hover:bg-amber-700 border-amber-600';

  return renderModal(
    <div>
      <div className="flex items-center gap-3 mb-4">
        <div className={`w-10 h-10 rounded-full ${iconBg} flex items-center justify-center shrink-0`}>
          {danger ? <HiOutlineTrash className={`w-5 h-5 ${iconColor}`} /> : <HiOutlineMailOpen className={`w-5 h-5 ${iconColor}`} />}
        </div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-dk-text">{t(titleKey)}</h2>
      </div>
      <p className="text-sm text-gray-600 dark:text-dk-text mb-1">
        <strong className="text-gray-900 dark:text-dk-text">{member.fullName || member.username}</strong> ({member.email})
      </p>
      <p className="text-sm text-gray-600 dark:text-dk-text">{t(warningKey)}</p>

      {showReleaseTrialOption && (
        <div className="mt-4 p-3 bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 rounded-lg space-y-1.5">
          <label className="flex items-start gap-2.5 cursor-pointer text-sm text-gray-800 dark:text-dk-text select-none">
            <input
              type="checkbox"
              className="mt-0.5 rounded border-gray-300 dark:border-dk-border text-amber-600 focus:ring-amber-500"
              checked={releaseTrialHistory}
              onChange={(e) => setReleaseTrialHistory(e.target.checked)}
            />
            <span className="font-medium">
              {t('adminMembers.releaseTrialHistoryLabel')}
            </span>
          </label>
          {releaseTrialHistory && (
            <p className="text-xs text-amber-700 dark:text-amber-300 pl-6">
              {t('adminMembers.releaseTrialHistoryWarning')}
            </p>
          )}
        </div>
      )}

      <div className="mt-4">
        <label className="block text-sm font-medium text-gray-700 dark:text-dk-text mb-1">
          {t('adminMembers.typeEmailToConfirm', { email: member.email })}
        </label>
        <input
          type="text"
          className="input w-full"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={member.email}
          autoComplete="off"
        />
      </div>
      <div className="flex justify-end gap-2 mt-6">
        <button type="button" className="btn btn-secondary" onClick={onClose} disabled={isBusy}>{t('common.cancel')}</button>
        <button
          type="button"
          className={`btn ${btnClass}`}
          onClick={() => onConfirm(typed.trim(), releaseTrialHistory)}
          disabled={isBusy || !matches}
        >
          {isBusy ? t('adminMembers.confirming') : t(confirmBtnKey)}
        </button>
      </div>
    </div>,
    () => { if (!isBusy) onClose(); }
  );
};

// ── MemberDetailModal ─────────────────────────────────────────────────────────
const MemberDetailModal = ({
  member,
  phoneOtpEnabled,
  segmentLabel,
  onClose,
  onOpenAssignPlan,
  onToggleStatus,
  statusUpdating,
}) => {
  const { t } = useI18n();
  const [copiedId, setCopiedId] = useState(false);
  const [copiedEmail, setCopiedEmail] = useState(false);

  if (!member) return null;

  const isActive = member.status === 'active';
  const handleCopy = (text, type) => {
    if (!text) return;
    navigator.clipboard.writeText(String(text))
      .then(() => {
        if (type === 'id') {
          setCopiedId(true);
          toast.success(t('adminMembers.memberDetailModal.copiedId', 'Đã sao chép ID'));
          setTimeout(() => setCopiedId(false), 2000);
        } else {
          setCopiedEmail(true);
          toast.success(t('common.copied', 'Đã sao chép'));
          setTimeout(() => setCopiedEmail(false), 2000);
        }
      })
      .catch((err) => {
        console.error(err);
        toast.error(t('common.copyFailed', 'Sao chép thất bại'));
      });
  };

  return renderModal(
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 pb-3 border-b border-gray-100 dark:border-dk-border">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-primary-500 to-amber-500 flex items-center justify-center text-white text-lg font-bold shadow-md shrink-0">
            {(member.fullName || member.username || '?')[0].toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-primary-600 dark:text-primary-400 uppercase tracking-wider">
              {t('adminMembers.memberDetailModal.title')}
            </p>
            <h2 className="text-lg font-bold text-gray-900 dark:text-dk-text truncate">
              {member.fullName || member.username}
            </h2>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span className="text-xs text-gray-500 dark:text-dk-text2 font-mono">
                {member.email}
              </span>
              <button
                type="button"
                onClick={() => handleCopy(member.email, 'email')}
                className="text-[11px] text-primary-600 dark:text-primary-400 hover:underline inline-flex items-center gap-0.5"
                title={t('common.copy', 'Sao chép')}
              >
                <HiOutlineClipboardCopy className="w-3.5 h-3.5" />
                <span>{copiedEmail ? t('common.copied', 'Đã sao chép') : t('common.copy', 'Sao chép')}</span>
              </button>
            </div>
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              <span className="badge badge-gray text-[10px]">
                {member.role === 'admin' ? t('adminMembers.roles.admin', 'Admin') : t('adminMembers.roles.user', 'User')}
              </span>
              <span className="badge badge-primary text-[10px]">
                {segmentLabel ? segmentLabel(member) : member.segment}
              </span>
              {member.status === 'deleted' ? (
                <span className="badge badge-gray text-[10px]">{t('adminMembers.statusDeleted')}</span>
              ) : (
                <span className={`badge ${isActive ? 'badge-success' : 'badge-gray'} text-[10px]`}>
                  {isActive ? t('adminMembers.statusActive') : t('adminMembers.statusLocked')}
                </span>
              )}
              {member.twoFactorEnabled && (
                <span className="badge badge-success text-[10px]">{t('adminMembers.twoFactorBadge')}</span>
              )}
              {member.churnRisk && (
                <span className="badge badge-warning text-[10px]">{t('adminMembers.table.churnRiskBadge')}</span>
              )}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-dk-text hover:bg-gray-100 dark:hover:bg-dk-raised transition-colors"
          title={t('common.close', 'Đóng')}
        >
          <HiOutlineX className="w-5 h-5" />
        </button>
      </div>

      {/* 4 Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {/* Card 1: Account Profile */}
        <div className="p-3.5 rounded-xl bg-gray-50/70 dark:bg-dk-bg/40 border border-gray-100 dark:border-dk-border/80 space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-gray-900 dark:text-dk-text uppercase tracking-wider pb-1 border-b border-gray-200/50 dark:border-dk-border">
            <HiOutlineUser className="w-4 h-4 text-primary-500" />
            <span>{t('adminMembers.memberDetailModal.sectionProfile')}</span>
          </div>
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between items-center py-0.5">
              <span className="text-gray-500 dark:text-dk-text2">{t('adminMembers.memberDetailModal.userId')}:</span>
              <div className="flex items-center gap-1.5 font-mono text-gray-800 dark:text-dk-text font-medium">
                <span>#{member.id}</span>
                <button
                  type="button"
                  onClick={() => handleCopy(member.id, 'id')}
                  className="p-1 hover:text-primary-600 dark:hover:text-primary-400 transition-colors inline-flex items-center gap-0.5"
                  title={t('adminMembers.memberDetailModal.copyId')}
                >
                  <HiOutlineClipboardCopy className="w-3.5 h-3.5" />
                  {copiedId && (
                    <span className="text-[10px] text-primary-600 font-sans font-normal">
                      {t('common.copied', 'Đã sao chép')}
                    </span>
                  )}
                </button>
              </div>
            </div>
            <div className="flex justify-between items-center py-0.5">
              <span className="text-gray-500 dark:text-dk-text2">{t('adminMembers.memberDetailModal.fullName')}:</span>
              <span className="text-gray-900 dark:text-dk-text font-medium">{member.fullName || '—'}</span>
            </div>
            <div className="flex justify-between items-center py-0.5">
              <span className="text-gray-500 dark:text-dk-text2">{t('adminMembers.memberDetailModal.username')}:</span>
              <span className="font-mono text-gray-800 dark:text-dk-text">{member.username || '—'}</span>
            </div>
            <div className="flex justify-between items-start py-0.5">
              <span className="text-gray-500 dark:text-dk-text2">{t('adminMembers.memberDetailModal.phone')}:</span>
              <div className="text-right">
                <span className="font-mono text-gray-900 dark:text-dk-text font-medium">{member.phone || '—'}</span>
                {phoneOtpEnabled && member.phone && (
                  <div className="text-[11px] mt-0.5">
                    {member.phoneVerifiedAt ? (
                      <span className="text-green-600 dark:text-green-400 font-medium">
                        ✓ {t('adminMembers.phoneVerified', { date: fmtDate(member.phoneVerifiedAt) })}
                      </span>
                    ) : (
                      <span className="text-amber-600 dark:text-amber-400 font-medium">
                        ! {t('adminMembers.phoneNotVerified')}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="flex justify-between items-center py-0.5">
              <span className="text-gray-500 dark:text-dk-text2">{t('adminMembers.memberDetailModal.createdAt')}:</span>
              <span className="text-gray-700 dark:text-dk-text">{fmtDate(member.createdAt)}</span>
            </div>
            <div className="flex justify-between items-center py-0.5">
              <span className="text-gray-500 dark:text-dk-text2">{t('adminMembers.memberDetailModal.lastActivity')}:</span>
              <span className="text-gray-700 dark:text-dk-text">
                {member.lastActivityAt ? new Date(member.lastActivityAt).toLocaleDateString('vi-VN') : '—'}
              </span>
            </div>
          </div>
        </div>

        {/* Card 2: Service Plan */}
        <div className="p-3.5 rounded-xl bg-gray-50/70 dark:bg-dk-bg/40 border border-gray-100 dark:border-dk-border/80 space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-gray-900 dark:text-dk-text uppercase tracking-wider pb-1 border-b border-gray-200/50 dark:border-dk-border">
            <HiOutlineCurrencyDollar className="w-4 h-4 text-emerald-500" />
            <span>{t('adminMembers.memberDetailModal.sectionPlan')}</span>
          </div>
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between items-center py-0.5">
              <span className="text-gray-500 dark:text-dk-text2">{t('adminMembers.memberDetailModal.planName')}:</span>
              {member.planName ? (
                <span className="badge badge-success font-semibold">{member.planName}</span>
              ) : (
                <span className="badge badge-gray">{t('adminMembers.noPlan')}</span>
              )}
            </div>
            <div className="flex justify-between items-center py-0.5">
              <span className="text-gray-500 dark:text-dk-text2">{t('adminMembers.memberDetailModal.planState')}:</span>
              <span className="text-gray-800 dark:text-dk-text font-medium">
                {member.planState ? t(`adminMembers.planState.${member.planState}`, member.planState) : '—'}
              </span>
            </div>
            <div className="flex justify-between items-start py-0.5">
              <span className="text-gray-500 dark:text-dk-text2">{t('adminMembers.memberDetailModal.subscriptionExpiry')}:</span>
              <div className="text-right">
                <ExpiryBadge expiresAt={member.subscriptionExpiresAt} hasPlan={!!member.activePlanId} />
              </div>
            </div>
          </div>
        </div>

        {/* Card 3: Team & Organization */}
        <div className="p-3.5 rounded-xl bg-gray-50/70 dark:bg-dk-bg/40 border border-gray-100 dark:border-dk-border/80 space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-gray-900 dark:text-dk-text uppercase tracking-wider pb-1 border-b border-gray-200/50 dark:border-dk-border">
            <HiOutlineUsers className="w-4 h-4 text-blue-500" />
            <span>{t('adminMembers.memberDetailModal.sectionTeam')}</span>
          </div>
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between items-center py-0.5">
              <span className="text-gray-500 dark:text-dk-text2">{t('adminMembers.memberDetailModal.employeeCount')}:</span>
              <span className="text-base font-bold text-gray-900 dark:text-dk-text">
                {member.employeeCount ?? 0}
              </span>
            </div>
            <div className="flex justify-between items-center py-0.5">
              <span className="text-gray-500 dark:text-dk-text2">{t('adminMembers.memberDetailModal.segment')}:</span>
              <span className="text-gray-800 dark:text-dk-text font-medium">{segmentLabel ? segmentLabel(member) : member.segment}</span>
            </div>
          </div>
        </div>

        {/* Card 4: Security & Risk */}
        <div className="p-3.5 rounded-xl bg-gray-50/70 dark:bg-dk-bg/40 border border-gray-100 dark:border-dk-border/80 space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-gray-900 dark:text-dk-text uppercase tracking-wider pb-1 border-b border-gray-200/50 dark:border-dk-border">
            <HiOutlineShieldCheck className="w-4 h-4 text-purple-500" />
            <span>{t('adminMembers.memberDetailModal.sectionSecurity')}</span>
          </div>
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between items-center py-0.5">
              <span className="text-gray-500 dark:text-dk-text2">{t('adminMembers.memberDetailModal.accountStatus')}:</span>
              <span className={`badge ${isActive ? 'badge-success' : 'badge-gray'} font-medium`}>
                {member.status === 'deleted'
                  ? t('adminMembers.statusDeleted')
                  : isActive
                  ? t('adminMembers.statusActive')
                  : t('adminMembers.statusLocked')}
              </span>
            </div>
            <div className="flex justify-between items-center py-0.5">
              <span className="text-gray-500 dark:text-dk-text2">{t('adminMembers.memberDetailModal.twoFactor')}:</span>
              <span className={member.twoFactorEnabled ? 'text-green-600 dark:text-green-400 font-medium' : 'text-gray-400 dark:text-dk-muted'}>
                {member.twoFactorEnabled ? t('adminMembers.memberDetailModal.twoFactorEnabled') : t('adminMembers.memberDetailModal.twoFactorDisabled')}
              </span>
            </div>
            <div className="flex justify-between items-start py-0.5">
              <span className="text-gray-500 dark:text-dk-text2">{t('adminMembers.memberDetailModal.churnRisk')}:</span>
              <div className="text-right">
                {member.churnRisk ? (
                  <div>
                    <span className="badge badge-warning">{t('adminMembers.memberDetailModal.churnRiskWarning')}</span>
                    {member.churnRiskReason && (
                      <p className="text-[11px] text-gray-500 dark:text-dk-text2 mt-0.5">
                        {t(`adminMembers.churnReason.${member.churnRiskReason}`)}
                      </p>
                    )}
                  </div>
                ) : (
                  <span className="text-gray-500 dark:text-dk-text2">{t('adminMembers.memberDetailModal.churnRiskSafe')}</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="flex items-center justify-between gap-3 pt-3 border-t border-gray-100 dark:border-dk-border">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenAssignPlan(member);
            }}
            className="btn btn-secondary text-xs flex items-center gap-1.5"
          >
            <HiOutlineCurrencyDollar className="w-4 h-4 text-emerald-500" />
            <span>{t('adminMembers.memberDetailModal.assignPlanBtn')}</span>
          </button>
          <button
            type="button"
            disabled={statusUpdating}
            onClick={() => onToggleStatus(member)}
            className={`btn text-xs flex items-center gap-1.5 ${
              isActive
                ? 'btn-secondary text-yellow-600 dark:text-yellow-400 hover:text-yellow-700'
                : 'btn-secondary text-green-600 dark:text-green-400 hover:text-green-700'
            }`}
          >
            {isActive ? <HiOutlineLockClosed className="w-4 h-4" /> : <HiOutlineLockOpen className="w-4 h-4" />}
            <span>{isActive ? t('adminMembers.memberDetailModal.lockAccountBtn') : t('adminMembers.memberDetailModal.unlockAccountBtn')}</span>
          </button>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="btn btn-primary text-xs"
        >
          {t('adminMembers.memberDetailModal.close')}
        </button>
      </div>
    </div>,
    onClose,
    MODAL_LG
  );
};

// ── Main Page ─────────────────────────────────────────────────────────────────
const AdminMembersPage = () => {
  const { t } = useI18n();
  const { user: currentUser, phoneOtpEnabled } = useAuthStore();
  const [members, setMembers]     = useState([]);
  const [plans, setPlans]         = useState([]);
  const [summary, setSummary]     = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [detailMemberId, setDetailMemberId] = useState(null);
  const detailMember = useMemo(
    () => members.find((m) => m.id === detailMemberId) || null,
    [members, detailMemberId]
  );

  // Filters
  const [search, setSearch]       = useState('');
  const [planFilter, setPlanFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [expiryFilter, setExpiryFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('user');
  // Mặc định 'all' (không có ô chọn nhóm). Chỉ các thẻ đầu trang đổi sang 'customer' vì thẻ đếm khách.
  const [segmentFilter, setSegmentFilter] = useState('all');
  // Bộ lọc theo thẻ đầu trang: '' | paying | trial | expiring | expired30.
  const [planStateFilter, setPlanStateFilter] = useState('');
  // Chỉ có ý nghĩa khi phoneOtpEnabled — UI lọc này không render lúc cờ tắt (xem JSX),
  // nên state không bao giờ đổi khỏi '' trong trường hợp đó.
  const [phoneVerifiedFilter, setPhoneVerifiedFilter] = useState('');


  // Modals
  const [assignMember, setAssignMember]   = useState(null);
  const [promoteConfirm, setPromoteConfirm] = useState(null);
  const [demoteConfirm, setDemoteConfirm] = useState(null);
  const [unassignConfirm, setUnassignConfirm] = useState(null);
  const [detachEmailConfirm, setDetachEmailConfirm] = useState(null);
  const [resetTwoFactorConfirm, setResetTwoFactorConfirm] = useState(null);
  const [isResettingTwoFactor, setIsResettingTwoFactor] = useState(false);
  const [purgeConfirm, setPurgeConfirm]   = useState(null);
  const [isPromoting, setIsPromoting]     = useState(false);
  const [isDemoting, setIsDemoting]       = useState(false);
  const [isUnassigning, setIsUnassigning] = useState(false);
  const [isDetaching, setIsDetaching]     = useState(false);
  const [isPurging, setIsPurging]         = useState(false);
  const [statusUpdatingId, setStatusUpdatingId] = useState(null);

  // Số đầu trang không phụ thuộc bộ lọc của danh sách; lỗi tải số không được làm hỏng danh sách.
  const fetchSummary = async () => {
    try {
      const res = await adminMembersApiService.getSummary();
      setSummary(res?.data?.data || null);
    } catch {
      setSummary(null);
    }
  };

  const fetchMembers = async (overrides = {}) => {
    setIsLoading(true);
    fetchSummary();
    try {
      const params = {};
      const role = overrides.role ?? roleFilter;
      const segment = overrides.segment ?? segmentFilter;
      const planState = overrides.planState ?? planStateFilter;
      if (role) params.role = role;
      if (role !== 'admin') {
        if (segment) params.segment = segment;
        if (planState) params.planState = planState;
      }
      if (search)       params.search = search;
      if (planFilter)   params.planId = planFilter;
      if (statusFilter) params.status = statusFilter;
      if (expiryFilter) params.expiry = expiryFilter;
      if (phoneOtpEnabled && phoneVerifiedFilter) params.phoneVerified = phoneVerifiedFilter;
      const res = await adminMembersApiService.getMembers(params);
      setMembers(res.data.data || []);
    } catch {
      toast.error(t('adminMembers.loadFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  const fetchPlans = async () => {
    try {
      const res = await adminPlansApiService.getPlans();
      setPlans(res.data.data || []);
    } catch { /* plans không bắt buộc */ }
  };

  useEffect(() => {
    fetchMembers();
    fetchPlans();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ fetch 1 lần lúc mount
  }, []);

  // Re-fetch khi filter thay đổi (debounce không cần thiết ở đây vì có nút tìm kiếm)
  const handleSearch = (e) => {
    e.preventDefault();
    fetchMembers();
  };

  const handleToggleStatus = async (member) => {
    try {
      setStatusUpdatingId(member.id);
      await adminMembersApiService.toggleStatus(member.id);
      toast.success(t('adminMembers.updateStatusSuccess'));
      fetchMembers();
    } catch (err) {
      toast.error(err?.response?.data?.message || t('adminMembers.updateStatusFailed'));
    } finally {
      setStatusUpdatingId(null);
    }
  };

  const handlePromote = async () => {
    try {
      setIsPromoting(true);
      const res = await adminMembersApiService.promote(promoteConfirm.id);
      toast.success(res.data.message);
      setPromoteConfirm(null);
      fetchMembers();
    } catch (err) {
      toast.error(err?.response?.data?.message || t('adminMembers.promoteFailed'));
    } finally {
      setIsPromoting(false);
    }
  };

  const handleDemote = async () => {
    try {
      setIsDemoting(true);
      const res = await adminMembersApiService.demote(demoteConfirm.id);
      toast.success(res.data.message);
      setDemoteConfirm(null);
      fetchMembers();
    } catch (err) {
      toast.error(err?.response?.data?.message || t('adminMembers.demoteFailed'));
    } finally {
      setIsDemoting(false);
    }
  };

  const handleUnassign = async () => {
    try {
      setIsUnassigning(true);
      const res = await adminPlansApiService.removeUserPlan(unassignConfirm.id);
      toast.success(res.data.message || t('adminMembers.unassignSuccess'));
      setUnassignConfirm(null);
      fetchMembers();
    } catch (err) {
      toast.error(err?.response?.data?.message || t('adminMembers.unassignFailed'));
    } finally {
      setIsUnassigning(false);
    }
  };

  const handleDetachEmail = async (typedEmail, releaseTrialHistory = false) => {
    try {
      setIsDetaching(true);
      const res = await adminMembersApiService.detachEmail(detachEmailConfirm.id, typedEmail, releaseTrialHistory);
      toast.success(res.data.message || t('adminMembers.detachEmailSuccess'));
      setDetachEmailConfirm(null);
      fetchMembers();
    } catch (err) {
      toast.error(err?.response?.data?.message || t('adminMembers.detachEmailFailed'));
    } finally {
      setIsDetaching(false);
    }
  };

  const handleResetTwoFactor = async (typedEmail) => {
    try {
      setIsResettingTwoFactor(true);
      const res = await adminMembersApiService.resetTwoFactor(resetTwoFactorConfirm.id, typedEmail);
      toast.success(res.data.message || t('adminMembers.resetTwoFactorSuccess'));
      setResetTwoFactorConfirm(null);
      fetchMembers();
    } catch (err) {
      toast.error(err?.response?.data?.message || t('adminMembers.resetTwoFactorFailed'));
    } finally {
      setIsResettingTwoFactor(false);
    }
  };

  const handlePurge = async (typedEmail) => {
    try {
      setIsPurging(true);
      const res = await adminMembersApiService.purge(purgeConfirm.id, typedEmail);
      toast.success(res.data.message || t('adminMembers.purgeSuccess'));
      setPurgeConfirm(null);
      fetchMembers();
    } catch (err) {
      toast.error(err?.response?.data?.message || t('adminMembers.purgeFailed'));
    } finally {
      setIsPurging(false);
    }
  };

  const handleRoleFilterChange = (role) => {
    setRoleFilter(role);
    fetchMembers({ role });
  };

  const isSummaryCardActive = (card) => (
    card.filter ? planStateFilter === card.filter : !planStateFilter && segmentFilter === 'customer'
  );

  // Bấm thẻ: thẻ đếm KHÁCH nên lọc nhóm "Khách" (+ trạng thái gói của thẻ). Bấm lại thẻ đang chọn = về "tất cả".
  const handleSummaryCardClick = (card) => {
    const reset = isSummaryCardActive(card);
    const planState = reset ? '' : card.filter;
    const segment = reset ? 'all' : 'customer';
    setPlanStateFilter(planState);
    setSegmentFilter(segment);
    fetchMembers({ planState, segment });
  };

  const isAdminView = roleFilter === 'admin';

  const segmentLabel = (member) => {
    if (isAdminView) return t('adminMembers.segment.adminLabel');
    switch (member.segment) {
      case 'employee': return t('adminMembers.segment.employeeLabel');
      case 'internal': return t('adminMembers.segment.internalLabel');
      case 'deleted': return t('adminMembers.segment.deletedLabel');
      default: return t('adminMembers.segment.customer');
    }
  };

  return (
    <PageContainer
      title={t('adminMembers.title')}
      subtitle={t('adminMembers.systemAccountsDescription')}
      icon={HiOutlineUsers}
      actions={
        <button type="button" onClick={() => { fetchMembers(); fetchPlans(); }} className="btn btn-secondary" disabled={isLoading}>
          <HiOutlineRefresh className="w-4 h-4 mr-2" />
          {t('common.refresh')}
        </button>
      }
    >

      {/* Năm số đầu trang — theo định nghĩa "khách" (customerDefinitions.js); bấm thẻ để lọc danh sách */}
      {!isAdminView && summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {SUMMARY_CARDS.map((card) => {
            const hints = {
              customers: t('adminMembers.summary.customersHint'),
              trial: t('adminMembers.summary.trialHint'),
              expiring7d: t('adminMembers.summary.expiring7dHint', { n: Number(summary.expiring7dPaying || 0).toLocaleString('vi-VN') }),
            };
            return (
              <SummaryCard
                key={card.key}
                cardKey={card.key}
                label={t(`adminMembers.summary.${card.key}`)}
                value={Number(summary[card.key] || 0).toLocaleString('vi-VN')}
                hint={hints[card.key]}
                active={isSummaryCardActive(card)}
                onClick={() => handleSummaryCardClick(card)}
              />
            );
          })}
        </div>
      )}

      {/* Filters — 1 hàng */}
      <div className="card p-3">
        <form onSubmit={handleSearch} className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-gray-300 dark:border-dk-border overflow-hidden shrink-0">
            <button
              type="button"
              onClick={() => handleRoleFilterChange('user')}
              className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                roleFilter === 'user'
                  ? 'bg-primary-600 text-white'
                  : 'bg-white dark:bg-dk-raised text-gray-600 dark:text-dk-text hover:bg-gray-50 dark:hover:bg-dk-strong'
              }`}
            >
              {t('adminMembers.roleFilterUser')}
            </button>
            <button
              type="button"
              onClick={() => handleRoleFilterChange('admin')}
              className={`px-3 py-1.5 text-sm font-medium transition-colors border-l border-gray-300 dark:border-dk-border ${
                roleFilter === 'admin'
                  ? 'bg-primary-600 text-white'
                  : 'bg-white dark:bg-dk-raised text-gray-600 dark:text-dk-text hover:bg-gray-50 dark:hover:bg-dk-strong'
              }`}
            >
              {t('adminMembers.roleFilterAdmin')}
            </button>
          </div>
          <div className="flex flex-[2] min-w-[140px] items-center rounded-lg border border-gray-300 dark:border-dk-border bg-white dark:bg-dk-raised px-3 focus-within:border-primary-500 focus-within:ring-1 focus-within:ring-primary-500">
            <HiOutlineSearch className="w-4 h-4 text-gray-400 dark:text-dk-muted shrink-0" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('adminMembers.searchPlaceholder')}
              className="flex-1 py-1.5 pl-2 text-sm border-0 bg-transparent text-gray-900 dark:text-dk-text placeholder-gray-400 dark:placeholder-dk-muted focus:ring-0 focus:outline-none"
            />
          </div>
          <select
            className="input py-1.5 text-sm flex-1 min-w-[130px]"
            value={planFilter}
            onChange={(e) => setPlanFilter(e.target.value)}
          >
            <option value="">{t('adminMembers.filter.allPlans')}</option>
            <option value="none">{t('adminMembers.filter.noPlan')}</option>
            <option value="custom">{t('adminMembers.filter.enterprise')}</option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          {phoneOtpEnabled && (
            <select
              className="input py-1.5 text-sm flex-1 min-w-[130px]"
              value={phoneVerifiedFilter}
              onChange={(e) => setPhoneVerifiedFilter(e.target.value)}
            >
              <option value="">{t('adminMembers.filter.phoneVerifiedAll')}</option>
              <option value="verified">{t('adminMembers.filter.phoneVerifiedYes')}</option>
              <option value="unverified">{t('adminMembers.filter.phoneVerifiedNo')}</option>
            </select>
          )}
          <select
            className="input py-1.5 text-sm flex-1 min-w-[130px]"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">{t('adminMembers.filter.allStatuses')}</option>
            <option value="active">{t('adminMembers.filter.active')}</option>
            <option value="inactive">{t('adminMembers.filter.inactive')}</option>
          </select>
          <select
            className="input py-1.5 text-sm flex-1 min-w-[130px]"
            value={expiryFilter}
            onChange={(e) => setExpiryFilter(e.target.value)}
          >
            <option value="">{t('adminMembers.filter.allExpiry')}</option>
            <option value="expiring">{t('adminMembers.filter.expiring')}</option>
            <option value="expired">{t('adminMembers.filter.expired')}</option>
          </select>
          <button type="submit" className="btn btn-primary py-1.5 text-sm whitespace-nowrap shrink-0">{t('common.search')}</button>
        </form>
      </div>

      {/* Table */}
      <div className="card">
        {isLoading ? (
          <div className="h-56 flex items-center justify-center"><div className="spinner w-8 h-8" /></div>
        ) : members.length === 0 ? (
          <div className="py-16 text-center text-gray-400 dark:text-dk-muted">{t('adminMembers.noMembersFound')}</div>
        ) : (
          <div className="table-container">
            <table className="table !min-w-0 [&_th]:!px-3 [&_td]:!px-3">
              <thead>
                <tr>
                  <th className="whitespace-nowrap">{t('adminMembers.table.member')}</th>
                  <th className="whitespace-nowrap">{t('adminMembers.table.segment')}</th>
                  <th className="whitespace-nowrap">{t('adminMembers.table.servicePlan')}</th>
                  <th className="whitespace-nowrap">{t('adminMembers.table.lastActivity')}</th>
                  <th className="whitespace-nowrap">{t('adminMembers.table.status')}</th>
                  <th className="whitespace-nowrap">{t('adminMembers.table.expiry')}</th>
                  <th className="whitespace-nowrap w-px px-2">{t('adminMembers.table.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => {
                  const isActive = m.status === 'active';
                  return (
                    <tr
                      key={m.id}
                      className="hover:bg-gray-50/60 dark:hover:bg-dk-raised/30 transition-colors cursor-pointer"
                      onClick={() => setDetailMemberId(m.id)}
                    >
                      <td>
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-950/60 flex items-center justify-center shrink-0">
                            <span className="text-primary-600 dark:text-primary-400 text-sm font-semibold">
                              {(m.fullName || m.username || '?')[0].toUpperCase()}
                            </span>
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900 dark:text-dk-text truncate hover:text-primary-600 dark:hover:text-primary-400">
                              {m.fullName || m.username}
                            </p>
                            <p className="text-xs text-gray-400 dark:text-dk-text2 truncate">{m.email}</p>
                            {m.phone && (
                              <div className="text-xs text-gray-500 dark:text-dk-text2 flex flex-wrap items-center gap-x-1.5 mt-0.5">
                                <span className="font-mono">{m.phone}</span>
                                {phoneOtpEnabled && (
                                  m.phoneVerifiedAt ? (
                                    <span className="text-green-600 dark:text-green-400 text-[11px] whitespace-nowrap">
                                      {t('adminMembers.phoneVerified', { date: fmtDate(m.phoneVerifiedAt) })}
                                    </span>
                                  ) : (
                                    <span className="text-amber-600 dark:text-amber-400 text-[11px] whitespace-nowrap">
                                      {t('adminMembers.phoneNotVerified')}
                                    </span>
                                  )
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="text-sm text-gray-600 dark:text-dk-text whitespace-nowrap">{segmentLabel(m)}</td>
                      <td className="whitespace-nowrap">
                        {m.planName
                          ? <span className="badge badge-success whitespace-nowrap">{m.planName}</span>
                          : <span className="badge badge-gray whitespace-nowrap">{t('adminMembers.noPlan')}</span>
                        }
                        {(m.planState === 'paying' || m.planState === 'trial') && (
                          <p className="text-xs text-gray-400 dark:text-dk-text2 mt-0.5">{t(`adminMembers.planState.${m.planState}`)}</p>
                        )}
                      </td>
                      <td className="text-sm text-gray-500 dark:text-dk-text2 whitespace-nowrap">
                        {m.lastActivityAt ? new Date(m.lastActivityAt).toLocaleDateString('vi-VN') : '—'}
                      </td>
                      <td>
                        <div className="flex flex-nowrap items-center gap-1.5">
                          {m.status === 'deleted' ? (
                            <span className="badge badge-gray whitespace-nowrap">{t('adminMembers.statusDeleted')}</span>
                          ) : (
                            <span className={`badge ${isActive ? 'badge-success' : 'badge-gray'} whitespace-nowrap`}>
                              {isActive ? t('adminMembers.statusActive') : t('adminMembers.statusLocked')}
                            </span>
                          )}
                          {m.twoFactorEnabled && (
                            <span className="badge badge-success whitespace-nowrap">{t('adminMembers.twoFactorBadge')}</span>
                          )}
                          {m.churnRisk && (
                            <span
                              className="badge badge-warning whitespace-nowrap"
                              title={m.churnRiskReason ? t(`adminMembers.churnReason.${m.churnRiskReason}`) : undefined}
                            >
                              {t('adminMembers.table.churnRiskBadge')}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="whitespace-nowrap">
                        <ExpiryBadge expiresAt={m.subscriptionExpiresAt} hasPlan={!!m.activePlanId} />
                      </td>
                      <td className="whitespace-nowrap w-px px-2" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-0.5">
                          {/* Gán gói */}
                          <Tooltip label={t('adminMembers.assignPlan')}>
                            <button
                              onClick={() => setAssignMember(m)}
                              className="p-1 rounded hover:bg-gray-100 dark:hover:bg-dk-raised transition-colors text-gray-500 dark:text-dk-text2 hover:text-primary-600 dark:hover:text-primary-400"
                            >
                              <HiOutlineCurrencyDollar className="w-5 h-5" />
                            </button>
                          </Tooltip>

                          {/* Chi tiết người dùng */}
                          <Tooltip label={t('adminMembers.viewDetails')}>
                            <button
                              onClick={() => setDetailMemberId(m.id)}
                              className="p-1 rounded hover:bg-gray-100 dark:hover:bg-dk-raised transition-colors text-gray-500 dark:text-dk-text2 hover:text-primary-600 dark:hover:text-primary-400"
                            >
                              <HiOutlineEye className="w-5 h-5" />
                            </button>
                          </Tooltip>

                          {/* Gỡ gói — chỉ hiện khi đang có gói */}
                          {m.activePlanId && (
                            <Tooltip label={t('adminMembers.unassignPlan')}>
                              <button
                                onClick={() => setUnassignConfirm(m)}
                                className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors text-gray-400 dark:text-dk-text2 hover:text-red-600 dark:hover:text-red-400"
                              >
                                <HiOutlineXCircle className="w-5 h-5" />
                              </button>
                            </Tooltip>
                          )}

                          {/* Khóa / Mở khóa */}
                          <Tooltip label={isActive ? t('adminMembers.lockAccount') : t('adminMembers.unlockAccount')}>
                            <button
                              onClick={() => handleToggleStatus(m)}
                              disabled={statusUpdatingId === m.id}
                              className={`p-1 rounded hover:bg-gray-100 dark:hover:bg-dk-raised transition-colors ${isActive ? 'text-yellow-500 hover:text-yellow-600 dark:text-yellow-400 dark:hover:text-yellow-300' : 'text-green-500 hover:text-green-600 dark:text-green-400 dark:hover:text-green-300'}`}
                            >
                              {statusUpdatingId === m.id
                                ? <div className="spinner w-5 h-5" />
                                : isActive
                                  ? <HiOutlineLockClosed className="w-5 h-5" />
                                  : <HiOutlineLockOpen className="w-5 h-5" />
                              }
                            </button>
                          </Tooltip>

                          {/* Nâng Super Admin — chỉ hiện ở tab Người dùng */}
                          {!isAdminView && (
                            <Tooltip label={t('adminMembers.promoteToAdmin')}>
                              <button
                                onClick={() => setPromoteConfirm(m)}
                                className="p-1 rounded hover:bg-purple-50 dark:hover:bg-purple-950/40 transition-colors text-gray-400 dark:text-dk-text2 hover:text-purple-600 dark:hover:text-purple-400"
                              >
                                <HiOutlineShieldCheck className="w-5 h-5" />
                              </button>
                            </Tooltip>
                          )}

                          {/* Hạ quyền — chỉ hiện ở tab Admin, ẩn với chính mình */}
                          {isAdminView && m.id !== currentUser?.id && (
                            <Tooltip label={t('adminMembers.demote')}>
                              <button
                                onClick={() => setDemoteConfirm(m)}
                                className="p-1 rounded hover:bg-orange-50 dark:hover:bg-orange-950/40 transition-colors text-gray-400 dark:text-dk-text2 hover:text-orange-600 dark:hover:text-orange-400"
                              >
                                <HiOutlineShieldExclamation className="w-5 h-5" />
                              </button>
                            </Tooltip>
                          )}

                          {/* Đặt lại 2FA — chỉ hiện khi tài khoản đang bật 2FA */}
                          {m.twoFactorEnabled && (
                            <Tooltip label={t('adminMembers.resetTwoFactor')}>
                              <button
                                onClick={() => setResetTwoFactorConfirm(m)}
                                className="p-1 rounded hover:bg-amber-50 dark:hover:bg-amber-950/40 transition-colors text-gray-400 dark:text-dk-text2 hover:text-amber-600 dark:hover:text-amber-400"
                              >
                                <HiOutlineKey className="w-5 h-5" />
                              </button>
                            </Tooltip>
                          )}

                          {/* Gỡ email — chỉ tab Người dùng, ẩn nếu đã gỡ rồi */}
                          {!isAdminView && m.status !== 'deleted' && (
                            <Tooltip label={t('adminMembers.detachEmail')}>
                              <button
                                onClick={() => setDetachEmailConfirm(m)}
                                className="p-1 rounded hover:bg-amber-50 dark:hover:bg-amber-950/40 transition-colors text-gray-400 dark:text-dk-text2 hover:text-amber-600 dark:hover:text-amber-400"
                              >
                                <HiOutlineMailOpen className="w-5 h-5" />
                              </button>
                            </Tooltip>
                          )}

                          {/* Xoá vĩnh viễn — chỉ tab Người dùng; backend tự chặn nếu còn dữ liệu */}
                          {!isAdminView && (
                            <Tooltip label={t('adminMembers.purge')}>
                              <button
                                onClick={() => setPurgeConfirm(m)}
                                className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors text-gray-400 dark:text-dk-text2 hover:text-red-700 dark:hover:text-red-400"
                              >
                                <HiOutlineTrash className="w-5 h-5" />
                              </button>
                            </Tooltip>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Summary */}
        {!isLoading && members.length > 0 && (
          <div className="px-5 py-3 border-t border-gray-100 dark:border-dk-border text-sm text-gray-400 dark:text-dk-muted">
            {members.length} {t('adminMembers.table.member').toLowerCase()}
          </div>
        )}
      </div>

      {/* Modal gán gói */}
      {assignMember && (
        <AssignPlanModal
          member={assignMember}
          plans={plans}
          onClose={() => setAssignMember(null)}
          onDone={fetchMembers}
        />
      )}

      {/* Modal confirm nâng super_admin */}
      {promoteConfirm && renderModal(
        <div>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-950/60 flex items-center justify-center shrink-0">
              <HiOutlineShieldCheck className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-dk-text">{t('adminMembers.promoteTitle')}</h2>
          </div>
          <p className="text-sm text-gray-600 dark:text-dk-text">
            {t('adminMembers.promoteWarning')} <strong className="text-gray-900 dark:text-dk-text">{promoteConfirm.fullName || promoteConfirm.username}</strong> ({promoteConfirm.email}) {t('adminMembers.promoteToAdminLevel')}
          </p>
          <div className="flex justify-end gap-2 mt-6">
            <button type="button" className="btn btn-secondary" onClick={() => setPromoteConfirm(null)} disabled={isPromoting}>{t('common.cancel')}</button>
            <button
              type="button"
              className="btn btn-primary bg-purple-600 hover:bg-purple-700 border-purple-600"
              onClick={handlePromote}
              disabled={isPromoting}
            >
              {isPromoting ? t('adminMembers.promoting') : t('adminMembers.promoteConfirmBtn')}
            </button>
          </div>
        </div>,
        () => { if (!isPromoting) setPromoteConfirm(null); }
      )}

      {/* Modal confirm hạ super_admin */}
      {demoteConfirm && renderModal(
        <div>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-orange-100 dark:bg-orange-950/60 flex items-center justify-center shrink-0">
              <HiOutlineShieldExclamation className="w-5 h-5 text-orange-600 dark:text-orange-400" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-dk-text">{t('adminMembers.demoteTitle')}</h2>
          </div>
          <p className="text-sm text-gray-600 dark:text-dk-text">
            {t('adminMembers.demoteWarning')} <strong className="text-gray-900 dark:text-dk-text">{demoteConfirm.fullName || demoteConfirm.username}</strong> ({demoteConfirm.email}) {t('adminMembers.demoteToUserLevel')}
          </p>
          <div className="flex justify-end gap-2 mt-6">
            <button type="button" className="btn btn-secondary" onClick={() => setDemoteConfirm(null)} disabled={isDemoting}>{t('common.cancel')}</button>
            <button
              type="button"
              className="btn btn-primary bg-orange-600 hover:bg-orange-700 border-orange-600"
              onClick={handleDemote}
              disabled={isDemoting}
            >
              {isDemoting ? t('adminMembers.demoting') : t('adminMembers.demoteConfirmBtn')}
            </button>
          </div>
        </div>,
        () => { if (!isDemoting) setDemoteConfirm(null); }
      )}

      {/* Modal confirm gỡ gói */}
      {unassignConfirm && renderModal(
        <div>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-950/60 flex items-center justify-center shrink-0">
              <HiOutlineXCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-dk-text">{t('adminMembers.unassignConfirmTitle')}</h2>
          </div>
          <p className="text-sm text-gray-600 dark:text-dk-text">
            {t('adminMembers.unassignWarning')}
          </p>
          <p className="text-sm text-gray-500 dark:text-dk-text2 mt-2">
            <strong className="text-gray-900 dark:text-dk-text">{unassignConfirm.fullName || unassignConfirm.username}</strong> ({unassignConfirm.email})
            {unassignConfirm.planName && <> — {t('adminMembers.currentPlan')}: <strong className="text-gray-800 dark:text-dk-text">{unassignConfirm.planName}</strong></>}
          </p>
          <div className="flex justify-end gap-2 mt-6">
            <button type="button" className="btn btn-secondary" onClick={() => setUnassignConfirm(null)} disabled={isUnassigning}>{t('common.cancel')}</button>
            <button
              type="button"
              className="btn btn-primary bg-red-600 hover:bg-red-700 border-red-600"
              onClick={handleUnassign}
              disabled={isUnassigning}
            >
              {isUnassigning ? t('adminMembers.confirming') : t('adminMembers.unassignConfirmBtn')}
            </button>
          </div>
        </div>,
        () => { if (!isUnassigning) setUnassignConfirm(null); }
      )}

      {/* Modal gỡ email khỏi tài khoản (Mức 1) */}
      {detachEmailConfirm && (
        <TypeToConfirmModal
          member={detachEmailConfirm}
          titleKey="adminMembers.detachEmailConfirmTitle"
          warningKey="adminMembers.detachEmailWarning"
          confirmBtnKey="adminMembers.detachEmailConfirmBtn"
          danger={false}
          isBusy={isDetaching}
          showReleaseTrialOption
          onConfirm={handleDetachEmail}
          onClose={() => setDetachEmailConfirm(null)}
        />
      )}

      {/* Modal đặt lại 2FA — gõ lại email để xác nhận */}
      {resetTwoFactorConfirm && (
        <TypeToConfirmModal
          member={resetTwoFactorConfirm}
          titleKey="adminMembers.resetTwoFactorConfirmTitle"
          warningKey="adminMembers.resetTwoFactorWarning"
          confirmBtnKey="adminMembers.resetTwoFactorConfirmBtn"
          danger={false}
          isBusy={isResettingTwoFactor}
          onConfirm={handleResetTwoFactor}
          onClose={() => setResetTwoFactorConfirm(null)}
        />
      )}

      {/* Modal xoá vĩnh viễn (Mức 2) */}
      {purgeConfirm && (
        <TypeToConfirmModal
          member={purgeConfirm}
          titleKey="adminMembers.purgeConfirmTitle"
          warningKey="adminMembers.purgeWarning"
          confirmBtnKey="adminMembers.purgeConfirmBtn"
          danger
          isBusy={isPurging}
          onConfirm={handlePurge}
          onClose={() => setPurgeConfirm(null)}
        />
      )}

      {/* Modal chi tiết người dùng */}
      {detailMember && (
        <MemberDetailModal
          member={detailMember}
          phoneOtpEnabled={phoneOtpEnabled}
          segmentLabel={segmentLabel}
          onClose={() => setDetailMemberId(null)}
          onOpenAssignPlan={(m) => setAssignMember(m)}
          onToggleStatus={handleToggleStatus}
          statusUpdating={statusUpdatingId === detailMember.id}
        />
      )}
    </PageContainer>
  );
};

export default AdminMembersPage;
