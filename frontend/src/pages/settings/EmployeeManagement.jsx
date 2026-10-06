import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useForm } from 'react-hook-form';
import { useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import PageHeader from '../../components/common/PageHeader';
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
  HiOutlineUserGroup,
} from 'react-icons/hi';
import userManagementApiService from '../../features/users/services/userManagementApi.service';
import TeamActivityCard from '../../features/users/components/TeamActivityCard';
import { getMyProfile } from '../../features/auth/services/authApi.service';
import NumberInput from '../../components/common/NumberInput';
import { formatIntVi } from '../../utils/formatNumber.util';
import {
  buildPermissionPreset,
  countGrantedPermissions,
  findEmployeeAfterAdd,
  getEmployeeErrorInfo,
  sameIdSet,
  toggleIdInList,
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

const limitLabel = (val) => (val === null || val === undefined ? '∞' : formatIntVi(val));

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

  // NumberInput đã lo dấu chấm hàng nghìn; ở đây luôn nhận số nguyên (hoặc '') nên API vẫn nhận số thuần.
  const handleChange = (num) => {
    setText(num === '' ? '' : String(num));
    onChange(num === '' ? 0 : num);
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
      <NumberInput
        className={`input w-full ${exceedsMax ? 'border-red-400 focus:ring-red-400' : ''}`}
        disabled={isUnlimited}
        value={text}
        placeholder={t('employee.enterQuantity')}
        onChange={handleChange}
        onBlur={handleBlur}
      />
      {exceedsMax && (
        <p className="text-xs text-red-500">{t('employee.exceedsMaxLimit', { max: formatIntVi(max) })}</p>
      )}
    </div>
  );
};

// ── Component chính ──────────────────────────────────────────────────────────
const EmployeeManagement = () => {
  const { t } = useI18n();
  const [employees, setEmployees]     = useState([]);
  const [limitMeta, setLimitMeta]     = useState(null); // { used, max, topupSlots, lockedCount, canBuySlot }
  const [isLoading, setIsLoading]     = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);


  // Modal thêm nhân viên (chỉ cần email)
  const [showCreateModal, setShowCreateModal] = useState(false);
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
  // Tab "Tài khoản Zalo" (giao từng tài khoản Zalo cá nhân cho nhân viên). `channelAccounts` null = chưa tải.
  const [channelAccounts, setChannelAccounts]   = useState(null);
  const [channelSelected, setChannelSelected]   = useState([]);
  const [channelSaved, setChannelSaved]         = useState([]);
  const [channelLoading, setChannelLoading]     = useState(false);
  const [channelLoadFailed, setChannelLoadFailed] = useState(false);
  const [isSavingChannels, setIsSavingChannels] = useState(false);
  const [planLimits, setPlanLimits] = useState({
    dailyEmail: null, monthlyEmail: null,
    dailyZalo:  null, monthlyZalo:  null,
  });

  // Team overview
  const [teamOverview, setTeamOverview] = useState(null);
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
  // PLAN_SUA_SAU_NGHIEM_THU_2026-09-29 PR-A — hộp xác nhận khi đóng modal nhân viên lúc còn thay đổi chưa lưu.
  const [showUnsavedConfirm, setShowUnsavedConfirm] = useState(false);

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

  const inviteForm     = useForm({ defaultValues: { email: '', fullName: '' } });
  const editForm       = useForm({ defaultValues: { fullName: '', email: '' } });

  const openCreateModal = () => {
    inviteForm.reset();
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
      setLimitMeta(res.data?.meta || null);
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
      const data = res.data?.data;
      setTeamOverview(data && Array.isArray(data.employees) ? data : null);
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
    setShowUnsavedConfirm(false);
    setChannelAccounts(null);
    setChannelSelected([]);
    setChannelSaved([]);
    setChannelLoadFailed(false);
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
      // PLAN_SUA_SAU_NGHIEM_THU_2026-09-29 PR-A — await: đóng modal ngay sau lưu (Việc 3 "Lưu rồi
      // đóng") phải chờ fetchEmployees xong, không thì setSelectedEmployee(updated) của nó chạy SAU
      // setSelectedEmployee(null) của người bấm đóng, làm modal tự mở lại.
      await fetchEmployees(true);
      return true;
    } catch (err) {
      toast.error(err?.response?.data?.message || t('employee.updatePermFailed'));
      return false;
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
      // Cùng lý do await ở handleSavePermissions phía trên.
      await fetchEmployees(true);
      return true;
    } catch (err) {
      toast.error(err?.response?.data?.message || t('employee.updateLimitsFailed'));
      return false;
    } finally {
      setIsSavingLimits(false);
    }
  };

  // ── Tab Tài khoản Zalo ────────────────────────────────────────────────────
  const loadChannelAccounts = async (employeeId) => {
    setChannelLoading(true);
    setChannelLoadFailed(false);
    try {
      const res = await userManagementApiService.getEmployeeChannelAccounts(employeeId);
      const list = res?.data?.data?.zaloAccounts;
      const accounts = Array.isArray(list) ? list : [];
      const assignedIds = accounts.filter((a) => a.assigned).map((a) => a.id);
      setChannelAccounts(accounts);
      setChannelSelected(assignedIds);
      setChannelSaved(assignedIds);
    } catch {
      setChannelLoadFailed(true);
    } finally {
      setChannelLoading(false);
    }
  };

  // Tải danh sách khi mở tab lần đầu cho nhân viên đang chọn (không tải sớm: chủ mở modal để sửa tên/quyền thì khỏi tốn một request).
  useEffect(() => {
    if (!selectedEmployee || activeTab !== 'channels') return;
    if (channelAccounts !== null || channelLoading || channelLoadFailed) return;
    loadChannelAccounts(selectedEmployee.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ phản ứng theo nhân viên + tab đang mở
  }, [selectedEmployee?.id, activeTab, channelAccounts, channelLoadFailed]);

  const handleSaveChannels = async () => {
    try {
      setIsSavingChannels(true);
      const res = await userManagementApiService.updateEmployeeChannelAccounts(selectedEmployee.id, channelSelected);
      toast.success(t('employee.updateZaloAccountsSuccess'));
      // Phản chiếu lại đúng thứ backend đã lưu (id của chủ khác bị loại, hàng giữ nguyên nguồn).
      const list = res?.data?.data?.zaloAccounts;
      if (Array.isArray(list)) {
        const assignedIds = list.filter((a) => a.assigned).map((a) => a.id);
        setChannelAccounts(list);
        setChannelSelected(assignedIds);
        setChannelSaved(assignedIds);
      } else {
        setChannelSaved(channelSelected);
      }
      return true;
    } catch (err) {
      toast.error(err?.response?.data?.message || t('employee.updateZaloAccountsFailed'));
      return false;
    } finally {
      setIsSavingChannels(false);
    }
  };

  // ── Thêm nhân viên mới ────────────────────────────────────────────────────
  // Nhân viên mới chỉ có sẵn hai quyền chỉ-xem (campaigns_view + reports_view, xem
  // `employeePermissionCatalog.js`) — mở thẳng tab Phân quyền để chủ cấp nốt phần việc
  // thật của người đó, không để họ tưởng "Đang hoạt động" là xong.
  const openAddedEmployeeForPermissions = (list, { id, email }) => {
    const added = findEmployeeAfterAdd(list, { id, email });
    if (added) openEmployeeModal(added, 'permissions');
  };

  const onSubmitInvite = async (values) => {
    const email = values.email?.trim();
    const fullName = values.fullName?.trim() || null;
    try {
      setIsCreating(true);
      const res = await userManagementApiService.inviteEmployee({ email, fullName });
      const data = res.data?.data;
      // invited_link: tài khoản có sẵn — chỉ CHỜ CHẤP NHẬN, không còn "liên kết thành công" ngay
      // (PLAN_VA_NHAN_VIEN_PHAN_QUYEN PR-2 — liên kết im lặng trước đây là đúng lỗ bị vá).
      if (data?.method === 'invited_link') {
        if (data?.invitationSent === false) {
          toast.error(res.data?.message || t('employee.linkNoticeFailed'), { duration: 8000 });
        } else {
          toast.success(t('employee.linkInviteSent'));
        }
      } else if (data?.invitationSent === false) {
        toast.error(res.data?.message || t('employee.inviteFailed'), { duration: 8000 });
      } else {
        toast.success(t('employee.inviteSent'));
      }
      setShowCreateModal(false);
      inviteForm.reset();
      const list = await fetchEmployees(true);
      openAddedEmployeeForPermissions(list, { id: data?.id, email });
    } catch (err) {
      const { message, canBuySlot } = getEmployeeErrorInfo(err);
      if (canBuySlot) {
        // Vượt trần NHƯNG đang bán slot — cho lối ra ngay, không chỉ báo lỗi trơn.
        toast.custom(
          (tst) => (
            <div className="flex flex-col gap-1.5 rounded-lg bg-white px-4 py-3 shadow-lg" style={{ opacity: tst.visible ? 1 : 0 }}>
              <p className="text-sm text-gray-800 m-0">{message}</p>
              <button
                type="button"
                onClick={() => { toast.dismiss(tst.id); setShowCreateModal(false); navigate('/app/topup'); }}
                className="self-start text-xs font-semibold text-primary-600 hover:text-primary-700"
              >
                {t('employee.buySlotCta')} →
              </button>
            </div>
          ),
          { id: 'employee-limit-buy-slot', duration: 8000 }
        );
      } else {
        toast.error(message || t('employee.createFailed'));
      }
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
    { key: 'channels',    label: t('employee.zaloAccountsTab') },
  ];

  // PLAN_SUA_SAU_NGHIEM_THU_2026-09-29 PR-A — so từng khoá (KHÔNG JSON.stringify: thứ tự khoá trả
  // về từ backend không cố định) để biết tab đang mở có thay đổi chưa lưu hay không.
  const isPermDirty = Boolean(selectedEmployee) && ALL_PERMISSION_KEYS.some(
    (k) => Boolean(permState[k]) !== Boolean(toPermissionState(selectedEmployee?.permissions)[k])
  );
  const LIMIT_STATE_FIELDS = [
    'dailyEmailLimit', 'monthlyEmailLimit', 'dailyZaloLimit', 'monthlyZaloLimit',
    'dailyAiCreditLimit', 'periodAiCreditLimit',
  ];
  const isLimitsDirty = Boolean(selectedEmployee) && LIMIT_STATE_FIELDS.some(
    (k) => (limitsState[k] ?? null) !== (selectedEmployee?.[k] ?? null)
  );
  // Tab Tài khoản Zalo chỉ có thể "bẩn" sau khi đã tải xong danh sách (channelAccounts !== null).
  const isChannelsDirty = Boolean(selectedEmployee) && channelAccounts !== null && !sameIdSet(channelSelected, channelSaved);
  // Review PR-A: tính trên MỌI tab — tick quyền rồi sang tab Giới hạn mà bấm Đóng từng mất im lặng.
  const isModalDirty = isPermDirty || isLimitsDirty || isChannelsDirty;

  const requestCloseEmployeeModal = () => {
    if (isModalDirty) {
      setShowUnsavedConfirm(true);
    } else {
      setSelectedEmployee(null);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        icon={HiOutlineUserGroup}
        title={t('employee.title')}
        subtitle={
          <>
            <span>{t('employee.description')}</span>
            {limitMeta && (
              <span className="block mt-1">
                <span>
                  {limitMeta.max === null
                    ? t('employee.slotUsageUnlimited', { used: limitMeta.used })
                    : t('employee.slotUsage', { used: limitMeta.used, max: limitMeta.max })}
                </span>
                {limitMeta.lockedCount > 0 && (
                  <span className="text-amber-600"> {t('employee.slotLockedSuffix', { count: limitMeta.lockedCount })}</span>
                )}
                {limitMeta.canBuySlot && (
                  <>
                    {' · '}
                    <button
                      type="button"
                      onClick={() => navigate('/app/topup')}
                      className="text-primary-600 hover:text-primary-700 font-medium"
                    >
                      {t('employee.buySlotCta')}
                    </button>
                  </>
                )}
              </span>
            )}
          </>
        }
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fetchEmployees(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 transition-colors shadow-2xs disabled:opacity-50"
              disabled={isRefreshing}
            >
              <HiOutlineRefresh className={`w-4 h-4 text-slate-500 ${isRefreshing ? 'animate-spin' : ''}`} />
              {t('employee.refresh')}
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white text-xs sm:text-sm font-bold shadow-sm hover:shadow transition-all duration-150"
              onClick={openCreateModal}
            >
              <HiOutlinePlus className="w-4 h-4" />
              {t('employee.addEmployee')}
            </button>
          </div>
        }
      />

      {/* Bảng nhân viên */}
      <div className="rounded-2xl border border-slate-200/90 bg-white shadow-2xs overflow-hidden">
        {isLoading ? (
          <div className="h-56 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-slate-200 border-t-orange-500 rounded-full animate-spin" />
          </div>
        ) : employees.length === 0 ? (
          <div className="py-16 text-center text-slate-500 text-sm">{t('employee.noEmployees')}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100">
              <thead className="bg-slate-50/80">
                <tr>
                  <th className="px-6 py-3.5 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">{t('employee.teamColEmployee')}</th>
                  <th className="px-6 py-3.5 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">{t('employee.status')}</th>
                  <th className="px-6 py-3.5 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">{t('employee.permissionsColumn')}</th>
                  <th className="px-6 py-3.5 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">{t('employee.sendLimitsColumn')}</th>
                  <th className="px-6 py-3.5 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">{t('employee.dateAdded')}</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-100">
                {employees.map((emp) => {
                  const isActive = emp.memberStatus === 'active';
                  const grantedCount = countGrantedPermissions(emp.permissions);
                  return (
                    <tr
                      key={emp.id}
                      className="cursor-pointer hover:bg-slate-50/70 transition-colors"
                      onClick={() => openEmployeeModal(emp)}
                    >
                      {/* Gộp tên đăng nhập + họ tên + email vào một cột */}
                      <td className="px-6 py-4 min-w-0">
                        <div className="text-xs sm:text-sm font-semibold text-slate-900">{emp.fullName || emp.username}</div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          <span className="font-medium text-orange-600">{emp.username}</span>
                          {emp.email && <span className="ml-1.5 break-all text-slate-400">{emp.email}</span>}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {emp.acceptedAt === null ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200/80 shadow-2xs">
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                            {t('employee.pendingAcceptance')}
                          </span>
                        ) : emp.status === 'pending_activation' ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200/80 shadow-2xs">
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                            {t('employee.pendingActivation')}
                          </span>
                        ) : (
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border shadow-2xs ${
                            isActive
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200/80'
                              : 'bg-slate-100 text-slate-600 border-slate-200'
                          }`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${isActive ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                            {isActive ? t('employee.statusActive') : t('employee.statusLocked')}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {grantedCount === 0 ? (
                          <button
                            type="button"
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200/80 shadow-2xs cursor-pointer hover:bg-amber-100/70 transition-colors"
                            onClick={(e) => { e.stopPropagation(); openEmployeeModal(emp, 'permissions'); }}
                          >
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                            {t('employee.noPermissionsBadge')}
                          </button>
                        ) : (
                          <span className="text-xs sm:text-sm font-medium text-slate-700">{t('employee.permissionsCount', { count: grantedCount })}</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-xs sm:text-sm text-slate-600 whitespace-nowrap">
                        <div>
                          <span className="font-medium text-slate-800">{t('employee.emailLabel')}:</span>{' '}
                          {limitLabel(emp.dailyEmailLimit)}{t('employee.perDay')}
                          <span className="mx-1 text-slate-300">·</span>
                          {limitLabel(emp.monthlyEmailLimit)}{t('employee.perMonth')}
                        </div>
                        <div className="mt-0.5">
                          <span className="font-medium text-slate-800">{t('employee.zaloLabel')}:</span>{' '}
                          {limitLabel(emp.dailyZaloLimit)}{t('employee.perDay')}
                          <span className="mx-1 text-slate-300">·</span>
                          {limitLabel(emp.monthlyZaloLimit)}{t('employee.perMonth')}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-xs sm:text-sm text-slate-500 whitespace-nowrap">
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
      <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-sm sm:text-base font-bold text-slate-900">
              {t('employee.approvalThreshold.title')}
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 max-w-2xl">
              {t('employee.approvalThreshold.description')}
            </p>
          </div>
          <form onSubmit={handleSaveThreshold} className="flex items-center gap-3 shrink-0">
            <div className="relative">
              <NumberInput
                value={approvalThreshold}
                onChange={(v) => setApprovalThreshold(String(v))}
                placeholder={t('employee.approvalThreshold.inputPlaceholder')}
                disabled={thresholdLoading || isSavingThreshold}
                className="w-40 px-3 py-2 text-xs sm:text-sm bg-slate-50 hover:bg-slate-100/70 focus:bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 font-semibold text-slate-800 transition-all"
              />
            </div>
            <button
              type="submit"
              disabled={thresholdLoading || isSavingThreshold}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white text-xs sm:text-sm font-bold shadow-sm hover:shadow transition-all duration-150 disabled:opacity-50"
            >
              {isSavingThreshold ? t('employee.saving') : t('employee.save')}
            </button>
          </form>
        </div>
        <div className="mt-2.5 text-xs text-slate-400">
          {approvalThreshold && Number(approvalThreshold) > 0
            ? t('employee.approvalThreshold.enabledTip', { count: Number(approvalThreshold).toLocaleString('vi-VN') })
            : t('employee.approvalThreshold.disabledTip')}
        </div>
      </div>

      {/* ── Hoạt động nhóm (tháng này) — PR-7: bảng 5 cột, số cộng khớp "Cả công ty" ─────────── */}
      <TeamActivityCard overview={teamOverview} loading={overviewLoading} />

      {/* ── Modal chi tiết nhân viên (3 tab) ─────────────────────────────────── */}
      {selectedEmployee && renderModal(
        // min-h-0 + flex-1 (không phải h-full): khung MODAL_MD chỉ có max-h-[85vh], không có chiều cao cố định,
        // nên h-full rơi về auto → khối này nở theo nội dung, khung cắt phần thừa và vùng cuộn bên dưới KHÔNG BAO
        // GIỜ cuộn — nút "Lưu quyền hạn" ở cuối tab bị cắt mất (sếp không lưu được quyền, 29/09). Đo bằng Chromium:
        // trước sửa scrollHeight = clientHeight (không cuộn), sau sửa cuộn được và thấy nút.
        <div className="flex flex-col min-h-0 flex-1">
          {/* Modal header */}
          <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-4 border-b border-gray-100">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">{selectedEmployee.fullName || selectedEmployee.username}</h2>
              <p className="text-sm text-gray-500 mt-0.5">@{selectedEmployee.username} · {selectedEmployee.email}</p>
            </div>
            <button
              type="button"
              className="btn btn-secondary shrink-0"
              onClick={requestCloseEmployeeModal}
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
          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5">

            {/* ── Tab Thông tin ── */}
            {activeTab === 'info' && (
              <div className="space-y-6">
                {/* Form thông tin — tài khoản origin='linked' (người đó tự đăng ký, chủ chỉ liên kết) chỉ đọc:
                    email đăng nhập là của họ, không phải chủ tạo ra (RA_SOAT_NHAN_VIEN_PHAN_QUYEN mục 1). */}
                {selectedEmployee.origin === 'linked' && (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    {t('employee.linkedAccountInfoHint')}
                  </p>
                )}
                <form onSubmit={editForm.handleSubmit(onSubmitInfo)} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('auth.username')}</label>
                    <input type="text" className="input w-full bg-gray-50" value={selectedEmployee.username} disabled />
                    <p className="text-xs text-gray-400 mt-1">{t('employee.usernameCannotChange')}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('employee.fullName')}</label>
                    <input
                      type="text"
                      className="input w-full"
                      disabled={selectedEmployee.origin === 'linked'}
                      {...editForm.register('fullName')}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('employee.email')} *</label>
                    <input
                      type="email"
                      className="input w-full"
                      disabled={selectedEmployee.origin === 'linked'}
                      {...editForm.register('email', { required: t('employee.emailRequired') })}
                    />
                    {editForm.formState.errors.email && (
                      <p className="text-red-500 text-sm mt-1">{editForm.formState.errors.email.message}</p>
                    )}
                  </div>
                  {selectedEmployee.origin !== 'linked' && (
                    <div className="flex justify-end">
                      <button type="submit" className="btn btn-primary" disabled={isSavingInfo}>
                        {isSavingInfo ? t('employee.saving') : t('employee.save')}
                      </button>
                    </div>
                  )}
                </form>

                {/* Quản lý tài khoản */}
                <div className="border-t border-gray-100 pt-5 space-y-3">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{t('employee.accountManagement')}</p>
                  <div className="flex flex-wrap gap-2">
                    {/* Trạng thái chờ kích hoạt nằm ở users.status (`status`), KHÔNG phải user_members.status
                        (`memberStatus`: active/inactive) — so nhầm khiến nút "Gửi lại lời mời" không bao giờ hiện.
                        acceptedAt null: chưa chấp nhận lời mời thì khoá/mở khoá không có ý nghĩa (backend 400). */}
                    {selectedEmployee.status !== 'pending_activation' && selectedEmployee.acceptedAt !== null && (
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
                    ) : selectedEmployee.origin !== 'linked' ? (
                      <button
                        type="button"
                        onClick={() => setResetConfirmEmp(selectedEmployee)}
                        className="btn btn-secondary"
                      >
                        <HiOutlineKey className="w-4 h-4 mr-2" />
                        {t('employee.resetPassword')}
                      </button>
                    ) : null}
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
                {isPermDirty && (
                  <p className="text-xs text-amber-700">{t('employee.presetTickedHint')}</p>
                )}
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
              </div>
            )}

            {/* ── Tab Tài khoản Zalo ── */}
            {activeTab === 'channels' && (
              <div className="space-y-4">
                <p className="text-sm text-gray-600">{t('employee.zaloAccountsHint')}</p>
                {channelLoading && <p className="text-sm text-gray-500">{t('employee.zaloAccountsLoading')}</p>}
                {channelLoadFailed && (
                  <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center justify-between gap-3">
                    <span>{t('employee.zaloAccountsLoadFailed')}</span>
                    <button
                      type="button"
                      className="btn btn-secondary text-sm"
                      onClick={() => { setChannelLoadFailed(false); }}
                    >
                      {t('employee.zaloAccountsRetry')}
                    </button>
                  </div>
                )}
                {channelAccounts !== null && channelAccounts.length === 0 && (
                  <p className="text-sm text-gray-500">{t('employee.zaloAccountsEmpty')}</p>
                )}
                {channelAccounts !== null && channelAccounts.length > 0 && (
                  <>
                    {channelSaved.length === 0 && (
                      <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                        {t('employee.zaloAccountsNoneAssignedBanner')}
                      </div>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        className="btn btn-secondary text-sm"
                        onClick={() => setChannelSelected(channelAccounts.map((a) => a.id))}
                      >
                        {t('employee.zaloAccountsSelectAll')}
                      </button>
                      <button type="button" className="btn btn-secondary text-sm" onClick={() => setChannelSelected([])}>
                        {t('employee.zaloAccountsSelectNone')}
                      </button>
                      <span className="text-sm text-gray-500 ml-auto">
                        {t('employee.zaloAccountsSelectedCount', { selected: channelSelected.length, total: channelAccounts.length })}
                      </span>
                    </div>
                    <div className="space-y-2">
                      {channelAccounts.map((account) => {
                        const isChecked = channelSelected.some((id) => String(id) === String(account.id));
                        const isConnected = account.status === 'connected' && account.isActive;
                        const title = account.displayName || account.zaloName || `#${account.id}`;
                        return (
                          <label
                            key={account.id}
                            className="flex items-start gap-3 p-3 rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              className="w-4 h-4 mt-1 text-primary-600 rounded"
                              checked={isChecked}
                              onChange={(e) => setChannelSelected((prev) => toggleIdInList(prev, account.id, e.target.checked))}
                            />
                            <span className="min-w-0 flex-1">
                              <span className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-medium text-gray-800 break-all">{title}</span>
                                {account.isDefault && (
                                  <span className="text-xs px-2 py-0.5 rounded-full bg-primary-100 text-primary-700">{t('employee.zaloAccountDefault')}</span>
                                )}
                                <span className={`text-xs px-2 py-0.5 rounded-full ${isConnected ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                  {isConnected ? t('employee.zaloAccountConnected') : t('employee.zaloAccountDisconnected')}
                                </span>
                                {account.source === 'legacy' && (
                                  <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">{t('employee.zaloAccountSourceLegacy')}</span>
                                )}
                                {account.source === 'self_login' && (
                                  <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">{t('employee.zaloAccountSourceSelfLogin')}</span>
                                )}
                              </span>
                              {(account.zaloPhone || account.zaloName) && (
                                <span className="block text-xs text-gray-500 mt-0.5">
                                  {[account.zaloName, account.zaloPhone].filter(Boolean).join(' · ')}
                                </span>
                              )}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                    {channelAccounts.some((a) => a.source === 'legacy') && (
                      <p className="text-xs text-gray-500">{t('employee.zaloAccountsLegacyHint')}</p>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
          {activeTab !== 'info' && (
            <div className="border-t border-gray-100 px-6 py-3 flex items-center justify-end gap-3">
              {isModalDirty && (
                <span className="text-sm text-amber-600 mr-auto">{t('employee.unsavedHint')}</span>
              )}
              {activeTab === 'permissions' && (
                <button type="button" className="btn btn-primary" onClick={handleSavePermissions} disabled={isSavingPerm}>
                  {isSavingPerm ? t('employee.saving') : t('employee.savePerm')}
                </button>
              )}
              {activeTab === 'channels' && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleSaveChannels}
                  disabled={isSavingChannels || channelAccounts === null}
                >
                  {isSavingChannels ? t('employee.saving') : t('employee.saveZaloAccounts')}
                </button>
              )}
              {activeTab === 'limits' && (
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
              )}
            </div>
          )}
        </div>,
        requestCloseEmployeeModal
      )}

      {/* ── Modal xác nhận: còn thay đổi chưa lưu khi đóng modal nhân viên ──────── */}
      {showUnsavedConfirm && renderModal(
        <div>
          <h2 className="text-xl font-semibold text-gray-900">{t('employee.unsavedTitle')}</h2>
          <p className="text-sm text-gray-500 mt-2">{t('employee.unsavedBody')}</p>
          <div className="flex justify-end gap-2 mt-6">
            <button type="button" className="btn btn-secondary" onClick={() => setShowUnsavedConfirm(false)}>
              {t('employee.backToEditing')}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setShowUnsavedConfirm(false);
                setSelectedEmployee(null);
              }}
            >
              {t('employee.discardChanges')}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={async () => {
                // Lưu MỌI tab còn thay đổi (không chỉ tab đang mở); dừng ở tab đầu tiên lưu hỏng.
                let ok = true;
                if (isPermDirty) ok = await handleSavePermissions();
                if (ok && isLimitsDirty) ok = await handleSaveLimits();
                if (ok && isChannelsDirty) ok = await handleSaveChannels();
                setShowUnsavedConfirm(false);
                if (ok) setSelectedEmployee(null);
              }}
            >
              {t('employee.saveAndClose')}
            </button>
          </div>
        </div>,
        () => setShowUnsavedConfirm(false),
        MODAL_SM
      )}

      {/* ── Modal thêm nhân viên (chỉ cần email) ─────────────────────────────── */}
      {showCreateModal && renderModal(
        <div>
          <div className="flex items-start justify-between gap-4 mb-5">
            <h2 className="text-xl font-semibold text-gray-900">{t('employee.addEmployeeTitle')}</h2>
            <button type="button" className="btn btn-secondary" onClick={() => setShowCreateModal(false)}>{t('employee.close')}</button>
          </div>
          <form onSubmit={inviteForm.handleSubmit(onSubmitInvite)} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('employee.email')} *</label>
              <input
                type="email"
                className="input w-full"
                placeholder={t('employee.emailPlaceholder')}
                {...inviteForm.register('email', { required: t('employee.emailRequired') })}
              />
              {inviteForm.formState.errors.email && (
                <p className="text-red-500 text-sm mt-1">{inviteForm.formState.errors.email.message}</p>
              )}
              <p className="text-xs text-gray-500 mt-1">{t('employee.inviteEmailHint')}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('employee.fullName')} <span className="text-xs text-gray-400 font-normal">({t('employee.optional')})</span>
              </label>
              <input type="text" className="input w-full" {...inviteForm.register('fullName')} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="btn btn-secondary" onClick={() => setShowCreateModal(false)}>{t('common.cancel')}</button>
              <button type="submit" className="btn btn-primary" disabled={isCreating}>
                {isCreating ? t('employee.creating') : t('employee.addEmployee')}
              </button>
            </div>
          </form>
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
