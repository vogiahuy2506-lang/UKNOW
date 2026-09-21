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
import {
  EMAIL_ALREADY_REGISTERED_CODE,
  USERNAME_TAKEN_CODE,
  buildPermissionPreset,
  countGrantedPermissions,
  findEmployeeAfterAdd,
  getEmployeeErrorInfo,
  toPermissionState,
} from './employeeManagement.helpers';

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
  { keys: ['forms'],            label: t('employee.permissions.forms') },
  { keys: ['chatbots_manage'],  label: t('employee.permissions.chatbotsManage') },
  { keys: ['chatbot_channels_manage'], label: t('employee.permissions.chatbotChannelsManage') },
  { keys: ['inbox_view'],       label: t('employee.permissions.inboxView') },
  { keys: ['inbox_reply'],      label: t('employee.permissions.inboxReply') },
  { keys: ['inbox_manage'],     label: t('employee.permissions.inboxManage') },
  { keys: ['media_library_view'], label: t('employee.permissions.mediaLibraryView') },
  { keys: ['media_library_manage'], label: t('employee.permissions.mediaLibraryManage') },
  { keys: ['reports_view'],     label: t('employee.permissions.reportsView') },
  { keys: ['ai_assistant_use'], label: t('employee.permissions.aiAssistantUse') },
  { keys: ['marketplace_manage'], label: t('employee.permissions.marketplaceManage') },
  { keys: ['marketplace_purchase'], label: t('employee.permissions.marketplacePurchase') },
  { keys: ['integrations_manage'], label: t('employee.permissions.integrationsManage') },
];

const ALL_PERMISSION_KEYS = PERMISSION_FIELDS((key) => key).flatMap((field) => field.keys);

const MODAL_OVERLAY ='fixed inset-0 z-[9999] flex items-center justify-center p-4 md:p-6';
const MODAL_SM = 'relative z-10 w-full max-w-md  max-h-[85vh] rounded-xl bg-white shadow-xl p-6 overflow-y-auto';
const MODAL_MD = 'relative z-10 w-full max-w-2xl max-h-[85vh] rounded-xl bg-white shadow-xl overflow-hidden flex flex-col';
const MODAL_CREATE = 'relative z-10 w-full max-w-2xl max-h-[85vh] rounded-xl bg-white shadow-xl p-6 overflow-y-auto';

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
  // Gợi ý (không phải lỗi đỏ) ở tab Link, vd email vừa nhập đã có tài khoản.
  const [createHint, setCreateHint]           = useState('');

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

  // Team overview
  const [teamOverview, setTeamOverview] = useState([]);
  const [overviewLoading, setOverviewLoading] = useState(false);

  // Approval threshold (workspace level)
  const [approvalThreshold, setApprovalThreshold] = useState('');
  const [thresholdLoading, setThresholdLoading] = useState(false);
  const [isSavingThreshold, setIsSavingThreshold] = useState(false);

  // Inline actions
  const [statusUpdatingId, setStatusUpdatingId]   = useState(null);
  const [resetConfirmEmp, setResetConfirmEmp]     = useState(null);
  const [isResetting, setIsResetting]             = useState(false);
  // Mật khẩu tạm backend trả sau khi reset — chỉ giữ trong bộ nhớ, hiện đúng một lần.
  const [tempPasswordInfo, setTempPasswordInfo]   = useState(null);
  const [deleteConfirmEmp, setDeleteConfirmEmp]   = useState(null);
  const [isDeleting, setIsDeleting]               = useState(false);
  const [resendingInviteId, setResendingInviteId] = useState(null);

  const location = useLocation();
  const navigate = useNavigate();

  // Modal helper - defined inside component so it has access to `t`
  const renderModal = (content, onClose, panelClass = MODAL_MD) =>
    createPortal(
      <div className={MODAL_OVERLAY}>
        <button type="button" className="absolute inset-0 bg-black/50" onClick={onClose} aria-label={t('common.close')} />
        <div className={panelClass}>{content}</div>
      </div>,
      document.body
    );

  const createNewForm  = useForm({ defaultValues: { username: '', email: '', fullName: '' } });
  const createLinkForm = useForm({ defaultValues: { email: '' } });
  const editForm       = useForm({ defaultValues: { fullName: '', email: '' } });

  const openCreateModal = () => {
    setCreateTab('new');
    setCreateHint('');
    createNewForm.reset();
    createLinkForm.reset();
    setShowCreateModal(true);
  };

  // Mở modal tạo khi điều hướng từ sidebar
  useEffect(() => {
    if (!location.state?.openCreateEmployeeModal) return;
    openCreateModal();
    navigate(location.pathname, { replace: true, state: {} });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ phản ứng theo location.state
  }, [location.state]);

  // ── Fetch ──────────────────────────────────────────────────────────────────
  // Trả về danh sách vừa tải (null nếu lỗi) để chỗ gọi mở đúng nhân viên vừa thêm.
  const fetchEmployees = async (showRefresh = false) => {
    if (showRefresh) setIsRefreshing(true);
    else setIsLoading(true);
    let loaded = null;
    try {
      const res = await userManagementApiService.getEmployees();
      const list = res.data?.data || [];
      loaded = list;
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
    return loaded;
  };

  const fetchTeamOverview = async () => {
    setOverviewLoading(true);
    try {
      const res = await userManagementApiService.getTeamOverview();
      setTeamOverview(res.data?.data || []);
    } catch {
      // non-critical, ignore
    } finally {
      setOverviewLoading(false);
    }
  };

  const fetchApprovalThreshold = async () => {
    setThresholdLoading(true);
    try {
      const res = await userManagementApiService.getCampaignApprovalThreshold();
      const val = res.data?.data?.threshold;
      setApprovalThreshold(val != null ? String(val) : '');
    } catch (err) {
      console.error('Failed to fetch approval threshold:', err);
    } finally {
      setThresholdLoading(false);
    }
  };

  const handleSaveThreshold = async (e) => {
    e?.preventDefault?.();
    try {
      setIsSavingThreshold(true);
      const trimmed = approvalThreshold.trim();
      const val = trimmed === '' || trimmed === '0' ? null : Number(trimmed);
      if (val !== null && (!Number.isInteger(val) || val < 0)) {
        toast.error(t('employee.approvalThreshold.inputPlaceholder') || 'Vui lòng nhập số nguyên dương hợp lệ');
        return;
      }
      const res = await userManagementApiService.updateCampaignApprovalThreshold(val);
      const updatedVal = res.data?.data?.threshold;
      setApprovalThreshold(updatedVal != null ? String(updatedVal) : '');
      toast.success(t('employee.approvalThreshold.saveSuccess'));
    } catch (err) {
      toast.error(err.response?.data?.message || t('employee.approvalThreshold.saveFailed'));
    } finally {
      setIsSavingThreshold(false);
    }
  };

  useEffect(() => {
    fetchEmployees();
    fetchTeamOverview();
    fetchApprovalThreshold();
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
    // Nhân viên mới có permissions = [] (mảng rỗng) — nạp thành {} để không gửi lại `[]` khi lưu.
    setPermState(toPermissionState(emp.permissions));
    setLimitsState({
      dailyEmailLimit:     emp.dailyEmailLimit     ?? null,
      monthlyEmailLimit:   emp.monthlyEmailLimit   ?? null,
      dailyZaloLimit:      emp.dailyZaloLimit      ?? null,
      monthlyZaloLimit:    emp.monthlyZaloLimit    ?? null,
      dailyAiCreditLimit:  emp.dailyAiCreditLimit  ?? null,
      periodAiCreditLimit: emp.periodAiCreditLimit ?? null,
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
      const res = await userManagementApiService.updateEmployeePermissions(selectedEmployee.id, permState);
      toast.success(t('employee.updatePermSuccess'));
      // Backend kéo thêm quyền phụ thuộc (vd tạo chiến dịch → xem chiến dịch): phản chiếu lại để ô tick khớp DB.
      const saved = res?.data?.data?.permissions;
      if (saved && typeof saved === 'object' && !Array.isArray(saved)) setPermState(saved);
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
  // Thêm xong là nhân viên mới có 0 quyền (mặc định cố ý) — mở thẳng tab Phân quyền để chủ cấp luôn,
  // không để họ tưởng "Đang hoạt động" là xong.
  const openAddedEmployeeForPermissions = (list, { id, email }) => {
    const added = findEmployeeAfterAdd(list, { id, email });
    if (added) openEmployeeModal(added, 'permissions');
  };

  const onSubmitCreateNew = async (values) => {
    const email = values.email.trim();
    try {
      setIsCreating(true);
      const res = await userManagementApiService.createEmployee({
        username: values.username.trim(),
        email,
        fullName: values.fullName?.trim() || null,
      });
      const created = res.data?.data;
      // Tài khoản đã tạo nhưng thư mời hỏng: backend đã viết sẵn câu nói thật — đừng đè bằng toast "đã gửi".
      if (created?.invitationSent === false) {
        toast.error(res.data?.message || t('employee.inviteFailed'), { duration: 8000 });
      } else {
        toast.success(t('employee.inviteSent'));
      }
      setShowCreateModal(false);
      createNewForm.reset();
      const list = await fetchEmployees(true);
      openAddedEmployeeForPermissions(list, { id: created?.id, email });
    } catch (err) {
      const { code, message } = getEmployeeErrorInfo(err);
      if (code === EMAIL_ALREADY_REGISTERED_CODE) {
        // Người này đã có tài khoản → lối ra là tab Link: chuyển sang đó, điền sẵn email, gợi ý (không toast đỏ).
        createLinkForm.setValue('email', email);
        setCreateHint(message || t('employee.emailAlreadyRegisteredHint'));
        setCreateTab('link');
      } else if (code === USERNAME_TAKEN_CODE) {
        createNewForm.setError('username', { type: 'server', message: message || t('employee.usernameTaken') });
      } else {
        toast.error(message || t('employee.createFailed'));
      }
    } finally {
      setIsCreating(false);
    }
  };

  const onSubmitCreateLink = async (values) => {
    const email = values.email.trim();
    try {
      setIsCreating(true);
      setCreateHint('');
      const res = await userManagementApiService.linkEmployee(email);
      toast.success(t('employee.linkSuccess'));
      setShowCreateModal(false);
      createLinkForm.reset();
      const list = await fetchEmployees(true);
      openAddedEmployeeForPermissions(list, { id: res.data?.data?.id, email });
    } catch (err) {
      toast.error(err?.response?.data?.message || t('employee.linkFailed'));
    } finally {
      setIsCreating(false);
    }
  };

  // Chọn nhanh bộ quyền: chỉ tick ô, KHÔNG lưu — chủ xem lại rồi bấm "Lưu quyền hạn".
  const handleApplyPreset = (preset) => {
    setPermState(buildPermissionPreset(preset, ALL_PERMISSION_KEYS));
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
      const target = resetConfirmEmp;
      const res = await userManagementApiService.resetEmployeePassword(target.id);
      // Mật khẩu tạm do backend sinh ngẫu nhiên và chỉ trả một lần — phải hiện ra cho chủ đọc lại cho
      // nhân viên. Bản cũ vứt response và ghi cứng một mật khẩu mặc định, trong khi thực tế mật khẩu đã khác.
      const tempPassword = res?.data?.data?.tempPassword;
      setResetConfirmEmp(null);
      if (tempPassword) {
        setTempPasswordInfo({ username: target.username, password: tempPassword });
      } else {
        toast.success(t('employee.resetSuccess'));
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || t('employee.resetFailed'));
    } finally {
      setIsResetting(false);
    }
  };

  const handleCopyTempPassword = async () => {
    try {
      await navigator.clipboard.writeText(tempPasswordInfo.password);
      toast.success(t('employee.copied'));
    } catch {
      toast.error(t('employee.copyFailed'));
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
            onClick={openCreateModal}
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
                  <th>{t('employee.permissionsColumn')}</th>
                  <th>{t('employee.emailLimit')}</th>
                  <th>{t('employee.zaloLimit')}</th>
                  <th>{t('employee.dateAdded')}</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((emp) => {
                  const isActive = emp.memberStatus === 'active';
                  const grantedCount = countGrantedPermissions(emp.permissions);
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
                      <td className="whitespace-nowrap">
                        {grantedCount === 0 ? (
                          // Nhân viên mới có 0 quyền: nhãn "Đang hoạt động" một mình dễ làm chủ tưởng đã xong.
                          <button
                            type="button"
                            className="badge badge-warning cursor-pointer"
                            onClick={(e) => { e.stopPropagation(); openEmployeeModal(emp, 'permissions'); }}
                          >
                            {t('employee.noPermissionsBadge')}
                          </button>
                        ) : (
                          <span className="text-sm text-gray-600">{t('employee.permissionsCount', { count: grantedCount })}</span>
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

      {/* ── Thiết lập duyệt chiến dịch lớn (Workspace Level) ── */}
      <div className="card p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-gray-900">
              {t('employee.approvalThreshold.title')}
            </h2>
            <p className="text-sm text-gray-500 max-w-2xl">
              {t('employee.approvalThreshold.description')}
            </p>
          </div>
          <form onSubmit={handleSaveThreshold} className="flex items-center gap-3 shrink-0">
            <div className="relative">
              <input
                type="number"
                min="0"
                step="1"
                value={approvalThreshold}
                onChange={(e) => setApprovalThreshold(e.target.value)}
                placeholder={t('employee.approvalThreshold.inputPlaceholder')}
                disabled={thresholdLoading || isSavingThreshold}
                className="input w-40 text-sm font-medium"
              />
            </div>
            <button
              type="submit"
              disabled={thresholdLoading || isSavingThreshold}
              className="btn btn-primary"
            >
              {isSavingThreshold ? t('employee.saving') : t('employee.save')}
            </button>
          </form>
        </div>
        <div className="mt-3 text-xs text-gray-400">
          {approvalThreshold && Number(approvalThreshold) > 0
            ? t('employee.approvalThreshold.enabledTip', { count: Number(approvalThreshold).toLocaleString('vi-VN') })
            : t('employee.approvalThreshold.disabledTip')}
        </div>
      </div>

      {/* ── Hoạt động team (tháng này) ───────────────────────────────────────── */}
      {(teamOverview.length > 0 || overviewLoading) && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-800">{t('employee.teamActivity')}</h2>
            <span className="text-xs text-gray-400">{t('employee.teamActivityPeriod')}</span>
          </div>
          {overviewLoading ? (
            <div className="h-32 flex items-center justify-center"><div className="spinner w-6 h-6" /></div>
          ) : (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('employee.fullName')}</th>
                    <th className="text-center">{t('employee.runningCampaigns')}</th>
                    <th className="text-center">{t('employee.campaignsThisMonth')}</th>
                    <th className="text-center">Tỉ lệ thành công</th>
                    <th className="text-center">{t('employee.sendsThisMonth')}</th>
                    <th className="text-center">{t('employee.failedThisMonth')}</th>
                    <th className="text-center">Mẫu đã soạn</th>
                    <th className="text-center">Tín dụng AI</th>
                    <th>{t('employee.lastActive')}</th>
                  </tr>
                </thead>
                <tbody>
                  {teamOverview.map((emp) => (
                    <tr key={emp.id} className="hover:bg-gray-50">
                      <td>
                        <div className="font-medium text-gray-800">{emp.fullName || emp.username}</div>
                        <div className="text-xs text-gray-400">@{emp.username}</div>
                        <div className="text-[10px] text-amber-600 mt-0.5">{emp.attributionNote || 'Theo người tạo chiến dịch'}</div>
                      </td>
                      <td className="text-center">
                        {emp.runningCampaigns > 0 ? (
                          <span className="inline-flex items-center gap-1 text-green-700 font-semibold">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                            {emp.runningCampaigns}
                          </span>
                        ) : (
                          <span className="text-gray-400">0</span>
                        )}
                      </td>
                      <td className="text-center text-sm text-gray-700">{emp.campaignsThisMonth}</td>
                      <td className="text-center text-sm font-semibold text-gray-800">
                        {emp.successRate != null ? `${emp.successRate}%` : '—'}
                      </td>
                      <td className="text-center text-sm text-gray-500">{emp.sendsThisMonth.toLocaleString('vi-VN')}</td>
                      <td className="text-center text-sm">
                        {emp.failedThisMonth > 0 ? (
                          <span className="text-red-500 font-medium">{emp.failedThisMonth.toLocaleString('vi-VN')}</span>
                        ) : (
                          <span className="text-gray-400">0</span>
                        )}
                      </td>
                      <td className="text-center text-sm text-gray-700">{emp.templatesThisMonth ?? 0}</td>
                      <td className="text-center text-sm text-gray-700">{emp.aiCreditsThisMonth ?? 0}</td>
                      <td className="text-sm text-gray-500">
                        {emp.lastActiveAt
                          ? new Date(emp.lastActiveAt).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
                          : <span className="text-gray-300">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

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
                    {/* Trạng thái chờ kích hoạt nằm ở users.status (`status`), KHÔNG phải user_members.status
                        (`memberStatus`: active/inactive) — so nhầm khiến nút "Gửi lại lời mời" không bao giờ hiện. */}
                    {selectedEmployee.status !== 'pending_activation' && (
                      <button
                        type="button"
                        onClick={() => handleToggleStatus(selectedEmployee)}
                        disabled={statusUpdatingId === selectedEmployee.id}
                        className={`btn ${selectedEmployee.memberStatus === 'active' ? 'btn-secondary text-yellow-600' : 'btn-secondary text-green-600'}`}
                      >
                        {statusUpdatingId === selectedEmployee.id ? (
                          <div className="spinner w-4 h-4 mr-2" />
                        ) : selectedEmployee.memberStatus === 'active' ? (
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
                {countGrantedPermissions(selectedEmployee.permissions) === 0 && (
                  <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    {t('employee.noPermissionsBanner', { name: selectedEmployee.fullName || selectedEmployee.username })}
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-gray-600">{t('employee.presetsLabel')}</span>
                  {[
                    { key: 'viewOnly', label: t('employee.presetViewOnly') },
                    { key: 'marketing', label: t('employee.presetMarketing') },
                    { key: 'all', label: t('employee.presetAll') },
                    { key: 'none', label: t('employee.presetNone') },
                  ].map(({ key, label }) => (
                    <button key={key} type="button" className="btn btn-secondary text-sm" onClick={() => handleApplyPreset(key)}>
                      {label}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {PERMISSION_FIELDS(t).map(({ keys, label }) => {
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
                <div className="border-t border-gray-100" />
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <HiOutlineKey className="w-5 h-5 text-purple-500" />
                    <h3 className="text-sm font-semibold text-gray-800 uppercase tracking-wide">{t('employee.aiCreditsLabel')}</h3>
                  </div>
                  <div className="grid grid-cols-2 gap-6">
                    <LimitField
                      t={t}
                      label={t('employee.limitPerDay')}
                      value={limitsState.dailyAiCreditLimit}
                      onChange={(v) => setLimitsState((p) => ({ ...p, dailyAiCreditLimit: v }))}
                    />
                    <LimitField
                      t={t}
                      label={t('employee.limitPerPeriod')}
                      value={limitsState.periodAiCreditLimit}
                      onChange={(v) => setLimitsState((p) => ({ ...p, periodAiCreditLimit: v }))}
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
        () => setSelectedEmployee(null)
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
                onClick={() => { setCreateTab(key); setCreateHint(''); }}
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
                    <p role="alert" className="text-red-500 text-sm mt-1">{createNewForm.formState.errors.username.message}</p>
                  )}
                  <p className="text-xs text-gray-400 mt-1">{t('employee.usernameHint')}</p>
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
              {createHint && (
                <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  {createHint}
                </div>
              )}
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
          <p className="text-sm text-gray-500 mt-1">{t('employee.resetTempPasswordNote')}</p>
          <div className="flex justify-end gap-2 mt-6">
            <button type="button" className="btn btn-secondary" onClick={() => setResetConfirmEmp(null)} disabled={isResetting}>{t('common.cancel')}</button>
            <button type="button" className="btn btn-primary" onClick={handleConfirmReset} disabled={isResetting}>
              {isResetting ? t('employee.resetting') : t('employee.confirm')}
            </button>
          </div>
        </div>,
        () => { if (!isResetting) setResetConfirmEmp(null); },
        MODAL_SM
      )}

      {/* ── Modal hiện mật khẩu tạm sau khi reset — chỉ hiện một lần ─────────── */}
      {tempPasswordInfo && renderModal(
        <div>
          <h2 className="text-xl font-semibold text-gray-900">{t('employee.resetResultTitle', { username: tempPasswordInfo.username })}</h2>
          <p className="text-sm text-gray-500 mt-2">{t('employee.resetResultOnce')}</p>
          <div className="mt-4 flex items-center gap-2">
            <code
              data-testid="temp-password"
              className="flex-1 select-all rounded-lg bg-gray-100 px-4 py-3 text-lg font-mono tracking-wider text-gray-900"
            >
              {tempPasswordInfo.password}
            </code>
            <button type="button" className="btn btn-secondary" onClick={handleCopyTempPassword}>{t('employee.copy')}</button>
          </div>
          <div className="flex justify-end mt-6">
            <button type="button" className="btn btn-primary" onClick={() => setTempPasswordInfo(null)}>{t('common.close')}</button>
          </div>
        </div>,
        // Bấm ra ngoài KHÔNG đóng: mật khẩu chỉ hiện một lần, lỡ tay là mất (phải reset lại).
        () => {},
        MODAL_SM
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
        MODAL_SM
      )}
    </div>
  );
};

export default EmployeeManagement;
