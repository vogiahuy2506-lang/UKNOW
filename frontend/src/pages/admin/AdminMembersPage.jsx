import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import { useI18n } from '../../i18n';

// ── Tooltip ───────────────────────────────────────────────────────────────────
const Tooltip = ({ label, children }) => (
  <div className="relative group inline-flex">
    {children}
    <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 text-xs text-white bg-gray-800 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-20">
      {label}
      <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-800" />
    </div>
  </div>
);
import {
  HiOutlineRefresh, HiOutlineSearch,
  HiOutlineLockClosed, HiOutlineLockOpen, HiOutlineShieldCheck, HiOutlineShieldExclamation,
  HiOutlineCurrencyDollar, HiOutlineXCircle, HiOutlineMailOpen, HiOutlineTrash, HiOutlineUsers, HiOutlineKey,
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
    className={`card p-4 text-left transition-colors ${active ? 'ring-2 ring-primary-500' : 'hover:bg-gray-50'}`}
  >
    <p className="text-xs text-gray-500">{label}</p>
    <p className="text-2xl font-bold text-gray-900 mt-0.5">{value}</p>
    {hint && <p className="text-xs text-gray-400 mt-0.5">{hint}</p>}
  </button>
);

const ExpiryBadge = ({ expiresAt, _hasPlan }) => {
  const { t } = useI18n();
  if (!expiresAt) return <span className="text-xs text-gray-400">—</span>;

  const now = Date.now();
  const exp = new Date(expiresAt);
  const daysLeft = Math.ceil((exp - now) / 86400000);

  if (exp < now) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-red-50 text-red-600 border border-red-200">
        {t('plans.expired')}
      </span>
    );
  }
  if (daysLeft <= 3) {
    return (
      <div>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-red-50 text-red-600 border border-red-200">
          ⚠ {t('plans.daysLeft', { n: daysLeft })}
        </span>
        <p className="text-xs text-gray-400 mt-0.5">{exp.toLocaleDateString('vi-VN')}</p>
      </div>
    );
  }
  if (daysLeft <= 7) {
    return (
      <div>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-amber-50 text-amber-600 border border-amber-200">
          ⚠ {t('plans.daysLeft', { n: daysLeft })}
        </span>
        <p className="text-xs text-gray-400 mt-0.5">{exp.toLocaleDateString('vi-VN')}</p>
      </div>
    );
  }
  return (
    <div>
      <span className="text-xs text-gray-600 font-medium">{exp.toLocaleDateString('vi-VN')}</span>
      <p className="text-xs text-gray-400">{t('plans.daysLeft', { n: daysLeft })}</p>
    </div>
  );
};

const MODAL_OVERLAY = 'fixed inset-0 z-[9999] flex items-center justify-center p-4';
const MODAL_SM = 'relative z-10 w-full max-w-md rounded-xl bg-white shadow-xl p-6';
const MODAL_MD = 'relative z-10 w-full max-w-lg rounded-xl bg-white shadow-xl p-6';

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
        <h2 className="text-xl font-semibold text-gray-900">{t('adminMembers.assignPlan')}</h2>
        <p className="text-sm text-gray-500 mt-1">
          {t('adminMembers.member')}: <strong>{member.fullName || member.username}</strong> ({member.email})
        </p>
        {member.planName && (
          <p className="text-sm text-gray-400 mt-0.5">{t('adminMembers.currentPlan')}: <strong>{member.planName}</strong></p>
        )}
      </div>
      <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
        {t('adminMembers.assignNote')}
      </p>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{t('adminMembers.selectPlan')}</label>
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
        <label className="block text-sm font-medium text-gray-700 mb-1">{t('adminMembers.billingPeriod')}</label>
        <select className="input w-full" value={billingPeriod} onChange={(e) => setBillingPeriod(e.target.value)}>
          <option value="monthly">{t('adminMembers.billingMonthly')}</option>
          <option value="yearly">{t('adminMembers.billingYearly')}</option>
        </select>
        {selectedPlan && (
          <p className="text-xs text-gray-500 mt-1">
            {billingPeriod === 'yearly' && selectedPlan.priceYearly
              ? `${Number(selectedPlan.priceYearly).toLocaleString('vi-VN')} đ/năm`
              : billingPeriod === 'yearly'
                ? `${(Number(selectedPlan.price) * 12).toLocaleString('vi-VN')} đ/năm (chưa cấu hình giá năm riêng)`
                : `${Number(selectedPlan.price).toLocaleString('vi-VN')} đ/tháng`}
          </p>
        )}
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{t('adminMembers.quantityLabel')}</label>
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
        <p className="text-xs text-gray-500 mt-1">{t('adminMembers.quantityHint')}</p>
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
  const iconBg = danger ? 'bg-red-100' : 'bg-amber-100';
  const iconColor = danger ? 'text-red-600' : 'text-amber-600';
  const btnClass = danger ? 'btn-primary bg-red-600 hover:bg-red-700 border-red-600' : 'btn-primary bg-amber-600 hover:bg-amber-700 border-amber-600';

  return renderModal(
    <div>
      <div className="flex items-center gap-3 mb-4">
        <div className={`w-10 h-10 rounded-full ${iconBg} flex items-center justify-center shrink-0`}>
          {danger ? <HiOutlineTrash className={`w-5 h-5 ${iconColor}`} /> : <HiOutlineMailOpen className={`w-5 h-5 ${iconColor}`} />}
        </div>
        <h2 className="text-xl font-semibold text-gray-900">{t(titleKey)}</h2>
      </div>
      <p className="text-sm text-gray-600 mb-1">
        <strong>{member.fullName || member.username}</strong> ({member.email})
      </p>
      <p className="text-sm text-gray-600">{t(warningKey)}</p>

      {showReleaseTrialOption && (
        <div className="mt-4 p-3 bg-amber-50/70 border border-amber-200 rounded-lg space-y-1.5">
          <label className="flex items-start gap-2.5 cursor-pointer text-sm text-gray-800 select-none">
            <input
              type="checkbox"
              className="mt-0.5 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
              checked={releaseTrialHistory}
              onChange={(e) => setReleaseTrialHistory(e.target.checked)}
            />
            <span className="font-medium">
              {t('adminMembers.releaseTrialHistoryLabel')}
            </span>
          </label>
          {releaseTrialHistory && (
            <p className="text-xs text-amber-700 pl-6">
              {t('adminMembers.releaseTrialHistoryWarning')}
            </p>
          )}
        </div>
      )}

      <div className="mt-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">
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

// ── Main Page ─────────────────────────────────────────────────────────────────
const AdminMembersPage = () => {
  const { t } = useI18n();
  const { user: currentUser, phoneOtpEnabled } = useAuthStore();
  const [members, setMembers]     = useState([]);
  const [plans, setPlans]         = useState([]);
  const [summary, setSummary]     = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // Filters
  const [search, setSearch]       = useState('');
  const [planFilter, setPlanFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [expiryFilter, setExpiryFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('user');
  // PR-9: danh sách mặc định CHỈ có khách; 'employee' / 'internal' / 'deleted' / 'all' xem nhóm còn lại.
  const [segmentFilter, setSegmentFilter] = useState('customer');
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

  const handleSegmentChange = (segment) => {
    setSegmentFilter(segment);
    fetchMembers({ segment });
  };

  // Bấm thẻ: lọc theo trạng thái gói của thẻ (bấm lại thẻ đang chọn = bỏ lọc). Thẻ "Khách" đưa danh sách về mặc định
  // (chỉ khách, không lọc trạng thái gói). Các thẻ đếm KHÁCH nên luôn chuyển về nhóm "Khách".
  const handleSummaryCardClick = (card) => {
    const next = card.filter && planStateFilter === card.filter ? '' : card.filter;
    setPlanStateFilter(next);
    setSegmentFilter('customer');
    fetchMembers({ planState: next, segment: 'customer' });
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
                active={card.filter ? planStateFilter === card.filter : !planStateFilter && segmentFilter === 'customer'}
                onClick={() => handleSummaryCardClick(card)}
              />
            );
          })}
        </div>
      )}

      {/* Filters — 1 hàng */}
      <div className="card p-3">
        <form onSubmit={handleSearch} className="flex items-center gap-2">
          <div className="flex rounded-lg border border-gray-300 overflow-hidden shrink-0">
            <button
              type="button"
              onClick={() => handleRoleFilterChange('user')}
              className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                roleFilter === 'user'
                  ? 'bg-primary-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              {t('adminMembers.roleFilterUser')}
            </button>
            <button
              type="button"
              onClick={() => handleRoleFilterChange('admin')}
              className={`px-3 py-1.5 text-sm font-medium transition-colors border-l border-gray-300 ${
                roleFilter === 'admin'
                  ? 'bg-primary-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              {t('adminMembers.roleFilterAdmin')}
            </button>
          </div>
          {!isAdminView && (
            <select
              className="input py-1.5 text-sm shrink-0"
              value={segmentFilter}
              onChange={(e) => handleSegmentChange(e.target.value)}
              aria-label={t('adminMembers.table.segment')}
            >
              <option value="customer">{t('adminMembers.segment.customer')}</option>
              <option value="employee">{t('adminMembers.segment.employee', { n: summary?.employees ?? 0 })}</option>
              <option value="internal">{t('adminMembers.segment.internal', { n: summary?.internal ?? 0 })}</option>
              <option value="deleted">{t('adminMembers.segment.deleted', { n: summary?.deleted ?? 0 })}</option>
              <option value="all">{t('adminMembers.segment.all')}</option>
            </select>
          )}
          <div className="flex flex-[2] min-w-0 items-center rounded-lg border border-gray-300 bg-white px-3 focus-within:border-primary-500 focus-within:ring-1 focus-within:ring-primary-500">
            <HiOutlineSearch className="w-4 h-4 text-gray-400 shrink-0" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('adminMembers.searchPlaceholder')}
              className="flex-1 py-1.5 pl-2 text-sm border-0 bg-transparent focus:ring-0 focus:outline-none"
            />
          </div>
          <select
            className="input py-1.5 text-sm flex-1 min-w-0"
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
              className="input py-1.5 text-sm flex-1 min-w-0"
              value={phoneVerifiedFilter}
              onChange={(e) => setPhoneVerifiedFilter(e.target.value)}
            >
              <option value="">{t('adminMembers.filter.phoneVerifiedAll')}</option>
              <option value="verified">{t('adminMembers.filter.phoneVerifiedYes')}</option>
              <option value="unverified">{t('adminMembers.filter.phoneVerifiedNo')}</option>
            </select>
          )}
          <select
            className="input py-1.5 text-sm flex-1 min-w-0"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">{t('adminMembers.filter.allStatuses')}</option>
            <option value="active">{t('adminMembers.filter.active')}</option>
            <option value="inactive">{t('adminMembers.filter.inactive')}</option>
          </select>
          <select
            className="input py-1.5 text-sm flex-1 min-w-0"
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
          <div className="py-16 text-center text-gray-400">{t('adminMembers.noMembersFound')}</div>
        ) : (
          <div className="table-container">
            <table className="table !min-w-0">
              <thead>
                <tr>
                  <th>{t('adminMembers.table.member')}</th>
                  <th>{t('adminMembers.table.segment')}</th>
                  <th>{t('adminMembers.table.servicePlan')}</th>
                  <th>{t('adminMembers.table.employees')}</th>
                  <th>{t('adminMembers.table.phone')}</th>
                  <th>{t('adminMembers.table.lastActivity')}</th>
                  <th>{t('adminMembers.table.churnRisk')}</th>
                  <th>{t('adminMembers.table.status')}</th>
                  <th>{t('adminMembers.table.expiry')}</th>
                  <th>{t('adminMembers.table.createdAt')}</th>
                  <th className="whitespace-nowrap w-px px-2">{t('adminMembers.table.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => {
                  const isActive = m.status === 'active';
                  return (
                    <tr key={m.id}>
                      <td>
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center shrink-0">
                            <span className="text-primary-600 text-sm font-semibold">
                              {(m.fullName || m.username || '?')[0].toUpperCase()}
                            </span>
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{m.fullName || m.username}</p>
                            <p className="text-xs text-gray-400 truncate">{m.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="text-sm text-gray-600">{segmentLabel(m)}</td>
                      <td>
                        {m.planName
                          ? <span className="badge badge-success">{m.planName}</span>
                          : <span className="badge badge-gray">{t('adminMembers.noPlan')}</span>
                        }
                        {(m.planState === 'paying' || m.planState === 'trial') && (
                          <p className="text-xs text-gray-400 mt-0.5">{t(`adminMembers.planState.${m.planState}`)}</p>
                        )}
                      </td>
                      <td className="text-sm text-gray-600">{m.employeeCount ?? 0}</td>
                      <td className="text-sm text-gray-600 whitespace-nowrap">
                        {m.phone || '—'}
                        {phoneOtpEnabled && m.phone && (
                          <div className="text-xs mt-0.5">
                            {m.phoneVerifiedAt
                              ? <span className="text-green-600">{t('adminMembers.phoneVerified', { date: fmtDate(m.phoneVerifiedAt) })}</span>
                              : <span className="text-amber-600">{t('adminMembers.phoneNotVerified')}</span>}
                          </div>
                        )}
                      </td>
                      <td className="text-sm text-gray-500 whitespace-nowrap">
                        {m.lastActivityAt ? new Date(m.lastActivityAt).toLocaleDateString('vi-VN') : '—'}
                      </td>
                      <td>
                        {m.churnRisk ? (
                          <div>
                            <span className="badge badge-warning">{t('adminMembers.table.churnRiskBadge')}</span>
                            {m.churnRiskReason && (
                              <p className="text-xs text-gray-500 mt-0.5">{t(`adminMembers.churnReason.${m.churnRiskReason}`)}</p>
                            )}
                          </div>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                      <td>
                        {m.status === 'deleted' ? (
                          <span className="badge badge-gray">{t('adminMembers.statusDeleted')}</span>
                        ) : (
                          <span className={`badge ${isActive ? 'badge-success' : 'badge-gray'}`}>
                            {isActive ? t('adminMembers.statusActive') : t('adminMembers.statusLocked')}
                          </span>
                        )}
                        {m.twoFactorEnabled && (
                          <p className="mt-1">
                            <span className="badge badge-success">{t('adminMembers.twoFactorBadge')}</span>
                          </p>
                        )}
                      </td>
                      <td>
                        <ExpiryBadge expiresAt={m.subscriptionExpiresAt} hasPlan={!!m.activePlanId} />
                      </td>
                      <td className="text-sm text-gray-500 whitespace-nowrap">{fmtDate(m.createdAt)}</td>
                      <td className="whitespace-nowrap w-px px-2">
                        <div className="flex items-center gap-1">
                          {/* Gán gói */}
                          <Tooltip label={t('adminMembers.assignPlan')}>
                            <button
                              onClick={() => setAssignMember(m)}
                              className="p-2 rounded hover:bg-gray-100 transition-colors text-gray-500 hover:text-primary-600"
                            >
                              <HiOutlineCurrencyDollar className="w-5 h-5" />
                            </button>
                          </Tooltip>

                          {/* Gỡ gói — chỉ hiện khi đang có gói */}
                          {m.activePlanId && (
                            <Tooltip label={t('adminMembers.unassignPlan')}>
                              <button
                                onClick={() => setUnassignConfirm(m)}
                                className="p-2 rounded hover:bg-red-50 transition-colors text-gray-400 hover:text-red-600"
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
                              className={`p-2 rounded hover:bg-gray-100 transition-colors ${isActive ? 'text-yellow-500 hover:text-yellow-600' : 'text-green-500 hover:text-green-600'}`}
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
                                className="p-2 rounded hover:bg-purple-50 transition-colors text-gray-400 hover:text-purple-600"
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
                                className="p-2 rounded hover:bg-orange-50 transition-colors text-gray-400 hover:text-orange-600"
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
                                className="p-2 rounded hover:bg-amber-50 transition-colors text-gray-400 hover:text-amber-600"
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
                                className="p-2 rounded hover:bg-amber-50 transition-colors text-gray-400 hover:text-amber-600"
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
                                className="p-2 rounded hover:bg-red-50 transition-colors text-gray-400 hover:text-red-700"
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
          <div className="px-5 py-3 border-t border-gray-100 text-sm text-gray-400">
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
            <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center shrink-0">
              <HiOutlineShieldCheck className="w-5 h-5 text-purple-600" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900">{t('adminMembers.promoteTitle')}</h2>
          </div>
          <p className="text-sm text-gray-600">
            {t('adminMembers.promoteWarning')} <strong>{promoteConfirm.fullName || promoteConfirm.username}</strong> ({promoteConfirm.email}) {t('adminMembers.promoteToAdminLevel')}
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
            <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center shrink-0">
              <HiOutlineShieldExclamation className="w-5 h-5 text-orange-600" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900">{t('adminMembers.demoteTitle')}</h2>
          </div>
          <p className="text-sm text-gray-600">
            {t('adminMembers.demoteWarning')} <strong>{demoteConfirm.fullName || demoteConfirm.username}</strong> ({demoteConfirm.email}) {t('adminMembers.demoteToUserLevel')}
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
            <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
              <HiOutlineXCircle className="w-5 h-5 text-red-600" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900">{t('adminMembers.unassignConfirmTitle')}</h2>
          </div>
          <p className="text-sm text-gray-600">
            {t('adminMembers.unassignWarning')}
          </p>
          <p className="text-sm text-gray-500 mt-2">
            <strong>{unassignConfirm.fullName || unassignConfirm.username}</strong> ({unassignConfirm.email})
            {unassignConfirm.planName && <> — {t('adminMembers.currentPlan')}: <strong>{unassignConfirm.planName}</strong></>}
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
    </PageContainer>
  );
};

export default AdminMembersPage;
