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
  HiOutlineCurrencyDollar, HiOutlineXCircle, HiOutlineMailOpen, HiOutlineTrash,
} from 'react-icons/hi';
import adminMembersApiService from '../../features/admin/services/adminMembersApi.service';
import adminPlansApiService from '../../features/admin/services/adminPlansApi.service';
import { useAuthStore } from '../../stores/authStore';

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('vi-VN') : '—';

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
          {plans.map((p) => (
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
  const { user: currentUser } = useAuthStore();
  const [members, setMembers]     = useState([]);
  const [plans, setPlans]         = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filters
  const [search, setSearch]       = useState('');
  const [planFilter, setPlanFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [expiryFilter, setExpiryFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('user');


  // Modals
  const [assignMember, setAssignMember]   = useState(null);
  const [promoteConfirm, setPromoteConfirm] = useState(null);
  const [demoteConfirm, setDemoteConfirm] = useState(null);
  const [unassignConfirm, setUnassignConfirm] = useState(null);
  const [detachEmailConfirm, setDetachEmailConfirm] = useState(null);
  const [purgeConfirm, setPurgeConfirm]   = useState(null);
  const [isPromoting, setIsPromoting]     = useState(false);
  const [isDemoting, setIsDemoting]       = useState(false);
  const [isUnassigning, setIsUnassigning] = useState(false);
  const [isDetaching, setIsDetaching]     = useState(false);
  const [isPurging, setIsPurging]         = useState(false);
  const [statusUpdatingId, setStatusUpdatingId] = useState(null);

  const fetchMembers = async (overrides = {}) => {
    setIsLoading(true);
    try {
      const params = {};
      const role = overrides.role ?? roleFilter;
      if (role) params.role = role;
      if (search)       params.search = search;
      if (planFilter)   params.planId = planFilter;
      if (statusFilter) params.status = statusFilter;
      if (expiryFilter) params.expiry = expiryFilter;
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

  const isAdminView = roleFilter === 'admin';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('adminMembers.title')}</h1>
          <p className="text-gray-500 mt-1">{t('adminMembers.systemAccountsDescription')}</p>
        </div>
        <button type="button" onClick={() => { fetchMembers(); fetchPlans(); }} className="btn btn-secondary" disabled={isLoading}>
          <HiOutlineRefresh className="w-4 h-4 mr-2" />
          {t('common.refresh')}
        </button>
      </div>

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
                  <th>{t('adminMembers.table.role')}</th>
                  <th>{t('adminMembers.table.servicePlan')}</th>
                  <th>{t('adminMembers.table.employees')}</th>
                  <th>Đăng nhập gần nhất</th>
                  <th>% AI</th>
                  <th>Fail 30d</th>
                  <th>Rủi ro</th>
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
                      <td className="text-sm text-gray-600">
                        {isAdminView ? t('adminMembers.roleBadgeAdmin') : t('adminMembers.roleFilterUser')}
                      </td>
                      <td>
                        {m.planName
                          ? <span className="badge badge-success">{m.planName}</span>
                          : <span className="badge badge-gray">{t('adminMembers.noPlan')}</span>
                        }
                      </td>
                      <td className="text-sm text-gray-600">{m.employeeCount ?? 0}</td>
                      <td className="text-sm text-gray-500 whitespace-nowrap">
                        {m.lastLoginAt ? new Date(m.lastLoginAt).toLocaleDateString('vi-VN') : '—'}
                      </td>
                      <td className="text-sm text-gray-600">
                        {m.aiCreditsLimit > 0
                          ? `${Math.min(100, Math.round((Number(m.aiCreditsUsedThisMonth || 0) / m.aiCreditsLimit) * 100))}%`
                          : '—'}
                      </td>
                      <td className={`text-sm ${Number(m.failedSends30d) > 0 ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
                        {m.failedSends30d ?? 0}
                      </td>
                      <td>
                        {m.churnRisk
                          ? <span className="badge badge-warning">Nguy cơ</span>
                          : <span className="text-gray-300">—</span>}
                      </td>
                      <td>
                        <span className={`badge ${isActive ? 'badge-success' : 'badge-gray'}`}>
                          {isActive ? t('adminMembers.statusActive') : t('adminMembers.statusLocked')}
                        </span>
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
    </div>
  );
};

export default AdminMembersPage;
