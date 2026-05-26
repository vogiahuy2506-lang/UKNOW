import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useForm } from 'react-hook-form';
import { useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useI18n } from '../../i18n';
import {
  HiOutlinePlus,
  HiOutlineRefresh,
  HiOutlineTrash,
  HiOutlineLockClosed,
  HiOutlineLockOpen,
  HiOutlineKey,
  HiOutlineMail,
  HiOutlineChat,
} from 'react-icons/hi';
import userManagementApiService from '../../features/users/services/userManagementApi.service';
import { getMyProfile } from '../../features/auth/services/authApi.service';

const PERMISSION_FIELDS = (t) => [
  { keys: ['email_settings', 'zalo_settings'], label: t('employee.permissions.channelManagement') },
  { keys: ['email_templates', 'zalo_templates'], label: t('employee.permissions.messageTemplates') },
  { keys: ['courses'],          label: t('employee.permissions.productManagement') },
  { keys: ['landing_pages'],    label: t('employee.permissions.landingPages') },
  { keys: ['campaigns_view'],   label: t('employee.permissions.campaignView') },
  { keys: ['campaigns_create'], label: t('employee.permissions.campaignCreate') },
  { keys: ['campaigns_run'],    label: t('employee.permissions.campaignRun') },
  { keys: ['customers'],        label: t('employee.permissions.customers') },
  { keys: ['leads'],            label: t('employee.permissions.leads') },
];

const MODAL_OVERLAY = 'fixed inset-0 z-[9999] flex items-center justify-center p-4 md:p-6';
const MODAL_SM = 'relative z-10 w-full max-w-md  max-h-[85vh] rounded-xl bg-white shadow-xl p-6 overflow-y-auto';
const MODAL_MD = 'relative z-10 w-full max-w-2xl max-h-[85vh] rounded-xl bg-white shadow-xl overflow-hidden flex flex-col';
const MODAL_CREATE = 'relative z-10 w-full max-w-2xl max-h-[85vh] rounded-xl bg-white shadow-xl p-6 overflow-y-auto';

const renderModal = (content, onClose, panelClass = MODAL_MD, t) =>
  createPortal(
    <div className={MODAL_OVERLAY}>
      <button type="button" className="absolute inset-0 bg-black/50" onClick={onClose} aria-label={t('common.close')} />
      <div className={panelClass}>{content}</div>
    </div>,
    document.body
  );

const limitLabel = (val) => (val === null || val === undefined ? '∞' : String(val));

// ── LimitField ───────────────────────────────────────────────────────────────
const LimitField = ({ label, value, onChange, max, t }) => {
  const isUnlimited = value === null || value === undefined;
  const [text, setText] = useState(isUnlimited ? '' : String(value));

  // Đồng bộ khi value thay đổi từ bên ngoài (vd: toggle unlimited)
  useEffect(() => {
    setText(isUnlimited ? '' : String(value ?? ''));
  }, [value, isUnlimited]);

  const handleCheck = (e) => {
    if (e.target.checked) {
      setText('');
      onChange(null);
    } else {
      setText('0');
      onChange(0);
    }
  };

  const handleChange = (e) => {
    const digits = e.target.value.replace(/\D/g, '');
    const normalized = digits === '' ? '' : String(parseInt(digits, 10));
    setText(normalized);
    onChange(normalized === '' ? 0 : parseInt(normalized, 10));
  };

  const handleBlur = () => {
    if (isUnlimited) return;
    let num = text === '' ? 0 : parseInt(text, 10);
    if (max !== undefined && num > max) num = max; // tự động cap khi rời ô
    setText(String(num));
    onChange(num);
  };

  const exceedsMax = max !== undefined && !isUnlimited && Number(text) > max;

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-gray-700">{label}</p>
      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          className="w-4 h-4 text-primary-600 rounded"
          checked={isUnlimited}
          onChange={handleCheck}
        />
        <span className="text-sm text-gray-600">{t('employee.unlimited')}</span>
      </label>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        className={`input w-full ${exceedsMax ? 'border-red-400 focus:ring-red-400' : ''}`}
        disabled={isUnlimited}
        value={text}
        placeholder={t('employee.enterQuantity')}
        onChange={handleChange}
        onBlur={handleBlur}
      />
      {exceedsMax && (
        <p className="text-xs text-red-500">{t('employee.exceedsMaxLimit', { max: max.toLocaleString() })}</p>
      )}
    </div>
  );
};

// ── Component chính ──────────────────────────────────────────────────────────
const EmployeeManagement = () => {
  const { t } = useI18n();
  const [employees, setEmployees]     = useState([]);
  const [isLoading, setIsLoading]     = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);


  // Modal thêm nhân viên (2 tab: tạo mới / link)
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createTab, setCreateTab]             = useState('new');
  const [isCreating, setIsCreating]           = useState(false);

  // Modal chi tiết nhân viên (3 tab: Thông tin / Phân quyền / Giới hạn gửi)
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [activeTab, setActiveTab]               = useState('info');
  const [isSavingInfo, setIsSavingInfo]         = useState(false);
  const [permState, setPermState]               = useState({});
  const [isSavingPerm, setIsSavingPerm]         = useState(false);
  const [limitsState, setLimitsState]           = useState({
    dailyEmailLimit: null, monthlyEmailLimit: null,
    dailyZaloLimit:  null, monthlyZaloLimit:  null,
  });
  const [isSavingLimits, setIsSavingLimits] = useState(false);
  const [planLimits, setPlanLimits] = useState({
    dailyEmail: null, monthlyEmail: null,
    dailyZalo:  null, monthlyZalo:  null,
  });

  // Inline actions
  const [statusUpdatingId, setStatusUpdatingId]   = useState(null);
  const [resetConfirmEmp, setResetConfirmEmp]     = useState(null);
  const [isResetting, setIsResetting]             = useState(false);
  const [deleteConfirmEmp, setDeleteConfirmEmp]   = useState(null);
  const [isDeleting, setIsDeleting]               = useState(false);
  const [resendingInviteId, setResendingInviteId] = useState(null);

  const location = useLocation();
  const navigate = useNavigate();

  const createNewForm  = useForm({ defaultValues: { username: '', email: '', fullName: '' } });
  const createLinkForm = useForm({ defaultValues: { email: '' } });
  const editForm       = useForm({ defaultValues: { fullName: '', email: '' } });

  // Mở modal tạo khi điều hướng từ sidebar
  useEffect(() => {
    if (!location.state?.openCreateEmployeeModal) return;
    setCreateTab('new');
    createNewForm.reset();
    createLinkForm.reset();
    setShowCreateModal(true);
    navigate(location.pathname, { replace: true, state: {} });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ phản ứng theo location.state
  }, [location.state]);

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchEmployees = async (showRefresh = false) => {
    if (showRefresh) setIsRefreshing(true);
    else setIsLoading(true);
    try {
      const res = await userManagementApiService.getEmployees();
      const list = res.data?.data || [];
      setEmployees(list);
      // Cập nhật lại selectedEmployee nếu modal đang mở
      if (selectedEmployee) {
        const updated = list.find((e) => e.id === selectedEmployee.id);
        if (updated) setSelectedEmployee(updated);
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || t('employee.loadFailed'));
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchEmployees();
    getMyProfile().then((res) => {
      const d = res?.data;
      if (!d) return;
      setPlanLimits({
        dailyEmail:   d.dailyEmailLimit   ?? null,
        monthlyEmail: d.monthlyEmailLimit ?? null,
        dailyZalo:    d.dailyZaloLimit    ?? null,
        monthlyZalo:  d.monthlyZaloLimit  ?? null,
      });
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ fetch 1 lần lúc mount
  }, []);

  // ── Mở modal chi tiết nhân viên ───────────────────────────────────────────
  const openEmployeeModal = (emp, tab = 'info') => {
    setSelectedEmployee(emp);
    setActiveTab(tab);
    editForm.reset({ fullName: emp.fullName || '', email: emp.email || '' });
    setPermState(emp.permissions || {});
    setLimitsState({
      dailyEmailLimit:   emp.dailyEmailLimit   ?? null,
      monthlyEmailLimit: emp.monthlyEmailLimit ?? null,
      dailyZaloLimit:    emp.dailyZaloLimit    ?? null,
      monthlyZaloLimit:  emp.monthlyZaloLimit  ?? null,
    });
  };

  // ── Tab Thông tin ──────────────────────────────────────────────────────────
  const onSubmitInfo = async (values) => {
    try {
      setIsSavingInfo(true);
      await userManagementApiService.updateEmployeeInfo(selectedEmployee.id, {
        fullName: values.fullName?.trim() || null,
        email:    values.email.trim(),
      });
      toast.success(t('employee.updateInfoSuccess'));
      fetchEmployees(true);
    } catch (err) {
      toast.error(err?.response?.data?.message || t('employee.updateInfoFailed'));
    } finally {
      setIsSavingInfo(false);
    }
  };

  // ── Tab Phân quyền ────────────────────────────────────────────────────────
  const handleSavePermissions = async () => {
    try {
      setIsSavingPerm(true);
      await userManagementApiService.updateEmployeePermissions(selectedEmployee.id, permState);
      toast.success(t('employee.updatePermSuccess'));
      fetchEmployees(true);
    } catch (err) {
      toast.error(err?.response?.data?.message || t('employee.updatePermFailed'));
    } finally {
      setIsSavingPerm(false);
    }
  };

  // ── Tab Giới hạn gửi ──────────────────────────────────────────────────────
  const handleSaveLimits = async () => {
    try {
      setIsSavingLimits(true);
      await userManagementApiService.updateSendLimits(selectedEmployee.id, limitsState);
      toast.success(t('employee.updateLimitsSuccess'));
      fetchEmployees(true);
    } catch (err) {
      toast.error(err?.response?.data?.message || t('employee.updateLimitsFailed'));
    } finally {
      setIsSavingLimits(false);
    }
  };

  // ── Thêm nhân viên mới ────────────────────────────────────────────────────
  const onSubmitCreateNew = async (values) => {
    try {
      setIsCreating(true);
      await userManagementApiService.createEmployee({
        username: values.username.trim(),
        email:    values.email.trim(),
        fullName: values.fullName?.trim() || null,
      });
      toast.success(t('employee.inviteSent'));
      setShowCreateModal(false);
      createNewForm.reset();
      fetchEmployees(true);
    } catch (err) {
      toast.error(err?.response?.data?.message || t('employee.createFailed'));
    } finally {
      setIsCreating(false);
    }
  };

  const onSubmitCreateLink = async (values) => {
    try {
      setIsCreating(true);
      await userManagementApiService.linkEmployee(values.email.trim());
      toast.success(t('employee.linkSuccess'));
      setShowCreateModal(false);
      createLinkForm.reset();
      fetchEmployees(true);
    } catch (err) {
      toast.error(err?.response?.data?.message || t('employee.linkFailed'));
    } finally {
      setIsCreating(false);
    }
  };

  // ── Khóa / Mở khóa ────────────────────────────────────────────────────────
  const handleToggleStatus = async (emp) => {
    const newStatus = emp.memberStatus === 'active' ? 'inactive' : 'active';
    try {
      setStatusUpdatingId(emp.id);
      await userManagementApiService.updateEmployeeStatus(emp.id, newStatus);
      toast.success(t('employee.updateStatusSuccess'));
      fetchEmployees(true);
    } catch (err) {
      toast.error(err?.response?.data?.message || t('employee.updateStatusFailed'));
    } finally {
      setStatusUpdatingId(null);
    }
  };

  // ── Reset / Xóa ───────────────────────────────────────────────────────────
  const handleConfirmReset = async () => {
    try {
      setIsResetting(true);
      await userManagementApiService.resetEmployeePassword(resetConfirmEmp.id);
      toast.success(t('employee.resetSuccess'));
      setResetConfirmEmp(null);
    } catch (err) {
      toast.error(err?.response?.data?.message || t('employee.resetFailed'));
    } finally {
      setIsResetting(false);
    }
  };

  const handleResendInvite = async (emp) => {
    try {
      setResendingInviteId(emp.id);
      await userManagementApiService.resendInvite(emp.id);
      toast.success(t('employee.resendInviteSuccess'));
    } catch (err) {
      toast.error(err?.response?.data?.message || t('employee.resendInviteFailed'));
    } finally {
      setResendingInviteId(null);
      fetchEmployees(true);
    }
  };

  const handleConfirmDelete = async () => {
    try {
      setIsDeleting(true);
      await userManagementApiService.deleteEmployee(deleteConfirmEmp.id);
      toast.success(t('employee.deleteSuccess'));
      setDeleteConfirmEmp(null);
      if (selectedEmployee?.id === deleteConfirmEmp.id) setSelectedEmployee(null);
      fetchEmployees(true);
    } catch (err) {
      toast.error(err?.response?.data?.message || t('employee.deleteFailed'));
    } finally {
      setIsDeleting(false);
    }
  };

  const TABS = [
    { key: 'info',        label: t('employee.infoTab') },
    { key: 'permissions', label: t('employee.permissionsTab') },
    { key: 'limits',      label: t('employee.limitsTab') },
  ];

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('employee.title')}</h1>
          <p className="text-gray-500 mt-1">{t('employee.description')}</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => fetchEmployees(true)} className="btn btn-secondary" disabled={isRefreshing}>
            <HiOutlineRefresh className="w-5 h-5 mr-2" />
            {t('employee.refresh')}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => { setCreateTab('new'); createNewForm.reset(); createLinkForm.reset(); setShowCreateModal(true); }}
          >
            <HiOutlinePlus className="w-5 h-5 mr-2" />
            {t('employee.addEmployee')}
          </button>
        </div>
      </div>

      {/* Bảng nhân viên */}
      <div className="card">
        {isLoading ? (
          <div className="h-56 flex items-center justify-center"><div className="spinner w-8 h-8" /></div>
        ) : employees.length === 0 ? (
          <div className="py-16 text-center text-gray-500">{t('employee.noEmployees')}</div>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('auth.username')}</th>
                  <th>{t('employee.fullName')}</th>
                  <th>{t('employee.email')}</th>
                  <th>{t('employee.status')}</th>
                  <th>{t('employee.emailLimit')}</th>
                  <th>{t('employee.zaloLimit')}</th>
                  <th>{t('employee.dateAdded')}</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((emp) => {
                  const isActive = emp.memberStatus === 'active';
                  return (
                    <tr
                      key={emp.id}
                      className="cursor-pointer hover:bg-primary-50/40 transition-colors"
                      onClick={() => openEmployeeModal(emp)}
                    >
                      <td className="font-medium text-primary-600">{emp.username}</td>
                      <td>{emp.fullName || <span className="text-gray-400">—</span>}</td>
                      <td className="text-sm text-gray-600">{emp.email}</td>
                      <td>
                        {emp.status === 'pending_activation' ? (
                          <span className="badge badge-warning">{t('employee.pendingActivation')}</span>
                        ) : (
                          <span className={`badge ${isActive ? 'badge-success' : 'badge-gray'}`}>
                            {isActive ? t('employee.statusActive') : t('employee.statusLocked')}
                          </span>
                        )}
                      </td>
                      <td className="text-sm text-gray-500 whitespace-nowrap">
                        {limitLabel(emp.dailyEmailLimit)}{t('employee.perDay')}
                        <span className="mx-1 text-gray-300">·</span>
                        {limitLabel(emp.monthlyEmailLimit)}{t('employee.perMonth')}
                      </td>
                      <td className="text-sm text-gray-500 whitespace-nowrap">
                        {limitLabel(emp.dailyZaloLimit)}{t('employee.perDay')}
                        <span className="mx-1 text-gray-300">·</span>
                        {limitLabel(emp.monthlyZaloLimit)}{t('employee.perMonth')}
                      </td>
                      <td className="text-sm text-gray-500">
                        {emp.joinedAt ? new Date(emp.joinedAt).toLocaleDateString('vi-VN') : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Modal chi tiết nhân viên (3 tab) ─────────────────────────────────── */}
      {selectedEmployee && renderModal(
        <div className="flex flex-col h-full">
          {/* Modal header */}
          <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-4 border-b border-gray-100">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">{selectedEmployee.fullName || selectedEmployee.username}</h2>
              <p className="text-sm text-gray-500 mt-0.5">@{selectedEmployee.username} · {selectedEmployee.email}</p>
            </div>
            <button
              type="button"
              className="btn btn-secondary shrink-0"
              onClick={() => setSelectedEmployee(null)}
            >
              {t('common.close')}
            </button>
          </div>
          <div className="flex border-b border-gray-200 px-6">
            {TABS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setActiveTab(key)}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px ${
                  activeTab === key
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto px-6 py-5">

            {/* ── Tab Thông tin ── */}
            {activeTab === 'info' && (
              <div className="space-y-6">
                {/* Form thông tin */}
                <form onSubmit={editForm.handleSubmit(onSubmitInfo)} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('auth.username')}</label>
                    <input type="text" className="input w-full bg-gray-50" value={selectedEmployee.username} disabled />
                    <p className="text-xs text-gray-400 mt-1">{t('employee.usernameCannotChange')}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('employee.fullName')}</label>
                    <input type="text" className="input w-full" {...editForm.register('fullName')} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('employee.email')} *</label>
                    <input
                      type="email"
                      className="input w-full"
                      {...editForm.register('email', { required: t('employee.emailRequired') })}
                    />
                    {editForm.formState.errors.email && (
                      <p className="text-red-500 text-sm mt-1">{editForm.formState.errors.email.message}</p>
                    )}
                  </div>
                  <div className="flex justify-end">
                    <button type="submit" className="btn btn-primary" disabled={isSavingInfo}>
                      {isSavingInfo ? t('employee.saving') : t('employee.save')}
                    </button>
                  </div>
                </form>

                {/* Quản lý tài khoản */}
                <div className="border-t border-gray-100 pt-5 space-y-3">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{t('employee.accountManagement')}</p>
                  <div className="flex flex-wrap gap-2">
                    {selectedEmployee.status !== 'pending_activation' && (
                      <button
                        type="button"
                        onClick={() => handleToggleStatus(selectedEmployee)}
                        disabled={statusUpdatingId === selectedEmployee.id}
                        className={`btn ${selectedEmployee.memberStatus === 'active' ? 'btn-secondary text-yellow-600' : 'btn-secondary text-green-600'}`}
                      >
                        {statusUpdatingId === selectedEmployee.id ? (
                          <div className="spinner w-4 h-4 mr-2" />
                        ) : selectedEmployee.member_status === 'active' ? (
                          <HiOutlineLockClosed className="w-4 h-4 mr-2" />
                        ) : (
                          <HiOutlineLockOpen className="w-4 h-4 mr-2" />
                        )}
                        {statusUpdatingId === selectedEmployee.id
                          ? t('employee.saving')
                          : selectedEmployee.memberStatus === 'active' ? t('employee.lockAccount') : t('employee.unlockAccount')}
                      </button>
                    )}
                    {selectedEmployee.status === 'pending_activation' ? (
                      <button
                        type="button"
                        onClick={() => handleResendInvite(selectedEmployee)}
                        disabled={resendingInviteId === selectedEmployee.id}
                        className="btn btn-secondary"
                      >
                        <HiOutlineMail className="w-4 h-4 mr-2" />
                        {resendingInviteId === selectedEmployee.id ? t('employee.sendingInvite') : t('employee.sendInviteAgain')}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setResetConfirmEmp(selectedEmployee)}
                        className="btn btn-secondary"
                      >
                        <HiOutlineKey className="w-4 h-4 mr-2" />
                        {t('employee.resetPassword')}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setDeleteConfirmEmp(selectedEmployee)}
                      className="btn btn-secondary text-red-600 hover:bg-red-50"
                    >
                      <HiOutlineTrash className="w-4 h-4 mr-2" />
                      {t('employee.removeFromTeam')}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ── Tab Phân quyền ── */}
            {activeTab === 'permissions' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {PERMISSION_FIELDS.map(({ keys, label }) => {
                    const isChecked = keys.some((k) => permState[k] === true);
                    return (
                      <label key={keys[0]} className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer">
                        <input
                          type="checkbox"
                          className="w-4 h-4 text-primary-600 rounded"
                          checked={isChecked}
                          onChange={(e) => setPermState((prev) => {
                            const next = { ...prev };
                            keys.forEach((k) => { next[k] = e.target.checked; });
                            return next;
                          })}
                        />
                        <span className="text-sm text-gray-700">{label}</span>
                      </label>
                    );
                  })}
                </div>
                <div className="flex justify-end pt-2">
                  <button type="button" className="btn btn-primary" onClick={handleSavePermissions} disabled={isSavingPerm}>
                    {isSavingPerm ? t('employee.saving') : t('employee.savePerm')}
                  </button>
                </div>
              </div>
            )}

            {/* ── Tab Giới hạn gửi ── */}
            {activeTab === 'limits' && (
              <div className="space-y-6">
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <HiOutlineMail className="w-5 h-5 text-blue-500" />
                    <h3 className="text-sm font-semibold text-gray-800 uppercase tracking-wide">{t('employee.emailLabel')}</h3>
                  </div>
                  <div className="grid grid-cols-2 gap-6">
                    <LimitField
                      t={t}
                      label={t('employee.limitPerDay')}
                      value={limitsState.dailyEmailLimit}
                      onChange={(v) => setLimitsState((p) => ({ ...p, dailyEmailLimit: v }))}
                      max={planLimits.dailyEmail ?? undefined}
                    />
                    <LimitField
                      t={t}
                      label={t('employee.limitPerMonth')}
                      value={limitsState.monthlyEmailLimit}
                      onChange={(v) => setLimitsState((p) => ({ ...p, monthlyEmailLimit: v }))}
                      max={planLimits.monthlyEmail ?? undefined}
                    />
                  </div>
                </div>
                <div className="border-t border-gray-100" />
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <HiOutlineChat className="w-5 h-5 text-green-500" />
                    <h3 className="text-sm font-semibold text-gray-800 uppercase tracking-wide">{t('employee.zaloLabel')}</h3>
                  </div>
                  <div className="grid grid-cols-2 gap-6">
                    <LimitField
                      t={t}
                      label={t('employee.limitPerDay')}
                      value={limitsState.dailyZaloLimit}
                      onChange={(v) => setLimitsState((p) => ({ ...p, dailyZaloLimit: v }))}
                      max={planLimits.dailyZalo ?? undefined}
                    />
                    <LimitField
                      t={t}
                      label={t('employee.limitPerMonth')}
                      value={limitsState.monthlyZaloLimit}
                      onChange={(v) => setLimitsState((p) => ({ ...p, monthlyZaloLimit: v }))}
                      max={planLimits.monthlyZalo ?? undefined}
                    />
                  </div>
                </div>
                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleSaveLimits}
                    disabled={isSavingLimits || [
                      [limitsState.dailyEmailLimit,   planLimits.dailyEmail],
                      [limitsState.monthlyEmailLimit, planLimits.monthlyEmail],
                      [limitsState.dailyZaloLimit,    planLimits.dailyZalo],
                      [limitsState.monthlyZaloLimit,  planLimits.monthlyZalo],
                    ].some(([v, m]) => m !== null && m !== undefined && v !== null && v > m)}
                  >
                    {isSavingLimits ? t('employee.saving') : t('employee.saveLimits')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>,
        () => setSelectedEmployee(null),
        t
      )}

      {/* ── Modal thêm nhân viên (2 tab) ──────────────────────────────────────── */}
      {showCreateModal && renderModal(
        <div>
          <div className="flex items-start justify-between gap-4 mb-5">
            <h2 className="text-xl font-semibold text-gray-900">{t('employee.addEmployeeTitle')}</h2>
            <button type="button" className="btn btn-secondary" onClick={() => setShowCreateModal(false)}>{t('employee.close')}</button>
          </div>
          <div className="flex border-b border-gray-200 mb-5">
            {[{ key: 'new', label: t('employee.createAccount') }, { key: 'link', label: t('employee.linkExistingAccount') }].map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setCreateTab(key)}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  createTab === key ? 'border-primary-500 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {createTab === 'new' ? (
            <form onSubmit={createNewForm.handleSubmit(onSubmitCreateNew)} className="space-y-4">
              <p className="text-sm text-gray-500">
              {t('employee.createNewAccountTip')}
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('auth.username')} *</label>
                  <input
                    type="text"
                    className="input w-full"
                    {...createNewForm.register('username', {
                      required: t('employee.usernameRequired'),
                      minLength: { value: 3, message: t('employee.usernameMinLength') },
                      pattern: { value: /^[A-Za-z0-9]+$/, message: t('employee.usernamePattern') },
                    })}
                  />
                  {createNewForm.formState.errors.username && (
                    <p className="text-red-500 text-sm mt-1">{createNewForm.formState.errors.username.message}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('employee.email')} *</label>
                  <input
                    type="email"
                    className="input w-full"
                      {...createNewForm.register('email', { required: t('employee.emailRequired') })}
                  />
                  {createNewForm.formState.errors.email && (
                    <p className="text-red-500 text-sm mt-1">{createNewForm.formState.errors.email.message}</p>
                  )}
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('employee.fullName')}</label>
                  <input type="text" className="input w-full" {...createNewForm.register('fullName')} />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" className="btn btn-secondary" onClick={() => setShowCreateModal(false)}>{t('common.cancel')}</button>
                <button type="submit" className="btn btn-primary" disabled={isCreating}>
                  {isCreating ? t('employee.creating') : t('employee.createAccount')}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={createLinkForm.handleSubmit(onSubmitCreateLink)} className="space-y-4">
              <p className="text-sm text-gray-500">
              {t('employee.linkAccountTip')}
              </p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('employee.email')} *</label>
                <input
                  type="email"
                  className="input w-full"
                  placeholder={t('employee.emailPlaceholder')}
                  {...createLinkForm.register('email', { required: t('employee.emailRequired') })}
                />
                {createLinkForm.formState.errors.email && (
                  <p className="text-red-500 text-sm mt-1">{createLinkForm.formState.errors.email.message}</p>
                )}
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" className="btn btn-secondary" onClick={() => setShowCreateModal(false)}>{t('common.cancel')}</button>
                <button type="submit" className="btn btn-primary" disabled={isCreating}>
                  {isCreating ? t('employee.linking') : t('employee.linkExistingAccount')}
                </button>
              </div>
            </form>
          )}
        </div>,
        () => { if (!isCreating) setShowCreateModal(false); },
        MODAL_CREATE,
        t
      )}

      {/* ── Modal confirm reset mật khẩu ─────────────────────────────────────── */}
      {resetConfirmEmp && renderModal(
        <div>
          <h2 className="text-xl font-semibold text-gray-900">{t('employee.confirmResetTitle')}</h2>
          <p className="text-sm text-gray-500 mt-2">{t('employee.confirmResetMessage')} <strong>{resetConfirmEmp.username}</strong>?</p>
          <p className="text-sm text-gray-500 mt-1">{t('employee.newPassword')}: <strong>{t('employee.defaultPassword')}</strong></p>
          <div className="flex justify-end gap-2 mt-6">
            <button type="button" className="btn btn-secondary" onClick={() => setResetConfirmEmp(null)} disabled={isResetting}>{t('common.cancel')}</button>
            <button type="button" className="btn btn-primary" onClick={handleConfirmReset} disabled={isResetting}>
              {isResetting ? t('employee.resetting') : t('employee.confirm')}
            </button>
          </div>
        </div>,
        () => { if (!isResetting) setResetConfirmEmp(null); },
        MODAL_SM,
        t
      )}

      {/* ── Modal confirm xóa nhân viên ──────────────────────────────────────── */}
      {deleteConfirmEmp && renderModal(
        <div>
          <h2 className="text-xl font-semibold text-gray-900">{t('employee.confirmDeleteTitle')}</h2>
          <p className="text-sm text-gray-500 mt-2">
            {t('employee.confirmDeleteMessage')} <strong>{deleteConfirmEmp.username}</strong>?
            {t('employee.deleteWarning')}
          </p>
          <div className="flex justify-end gap-2 mt-6">
            <button type="button" className="btn btn-secondary" onClick={() => setDeleteConfirmEmp(null)} disabled={isDeleting}>{t('common.cancel')}</button>
            <button
              type="button"
              className="btn btn-primary bg-red-600 hover:bg-red-700 border-red-600"
              onClick={handleConfirmDelete}
              disabled={isDeleting}
            >
              {isDeleting ? t('employee.deleting') : t('employee.confirmDelete')}
            </button>
          </div>
        </div>,
        () => { if (!isDeleting) setDeleteConfirmEmp(null); },
        MODAL_SM,
        t
      )}
    </div>
  );
};

export default EmployeeManagement;
