import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useForm } from 'react-hook-form';
import { useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
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

const DEFAULT_EMPLOYEE_PASSWORD = 'digiso@2026';

const PERMISSION_FIELDS = [
  { key: 'email_settings',   label: 'Quản lý Email' },
  { key: 'email_templates',  label: 'Mẫu Email' },
  { key: 'zalo_settings',    label: 'Quản lý Zalo' },
  { key: 'zalo_templates',   label: 'Mẫu Zalo' },
  { key: 'courses',          label: 'Khóa học' },
  { key: 'landing_pages',    label: 'Landing pages' },
  { key: 'campaigns_view',   label: 'Chiến dịch — xem' },
  { key: 'campaigns_create', label: 'Chiến dịch — tạo' },
  { key: 'campaigns_run',    label: 'Chiến dịch — chạy' },
  { key: 'customers',        label: 'Khách hàng' },
  { key: 'leads',            label: 'Leads landing page' },
];

const MODAL_OVERLAY = 'fixed inset-0 z-[9999] flex items-center justify-center p-4 md:p-6';
const MODAL_SM = 'relative z-10 w-full max-w-md  max-h-[85vh] rounded-xl bg-white shadow-xl p-6 overflow-y-auto';
const MODAL_MD = 'relative z-10 w-full max-w-2xl max-h-[85vh] rounded-xl bg-white shadow-xl overflow-hidden flex flex-col';
const MODAL_CREATE = 'relative z-10 w-full max-w-2xl max-h-[85vh] rounded-xl bg-white shadow-xl p-6 overflow-y-auto';

const renderModal = (content, onClose, panelClass = MODAL_MD) =>
  createPortal(
    <div className={MODAL_OVERLAY}>
      <button type="button" className="absolute inset-0 bg-black/50" onClick={onClose} aria-label="Đóng" />
      <div className={panelClass}>{content}</div>
    </div>,
    document.body
  );

const limitLabel = (val) => (val === null || val === undefined ? '∞' : String(val));

// ── LimitField ───────────────────────────────────────────────────────────────
const LimitField = ({ label, value, onChange }) => {
  const isUnlimited = value === null || value === undefined;
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-gray-700">{label}</p>
      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          className="w-4 h-4 text-primary-600 rounded"
          checked={isUnlimited}
          onChange={(e) => onChange(e.target.checked ? null : 0)}
        />
        <span className="text-sm text-gray-600">Không giới hạn</span>
      </label>
      <input
        type="number"
        min={0}
        className="input w-full"
        disabled={isUnlimited}
        value={isUnlimited ? '' : value}
        placeholder="Nhập số lượng..."
        onChange={(e) => {
          const n = parseInt(e.target.value, 10);
          onChange(isNaN(n) || n < 0 ? 0 : n);
        }}
      />
    </div>
  );
};

// ── Component chính ──────────────────────────────────────────────────────────
const EmployeeManagement = () => {
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

  // Inline actions
  const [statusUpdatingId, setStatusUpdatingId] = useState(null);
  const [resetConfirmEmp, setResetConfirmEmp]   = useState(null);
  const [isResetting, setIsResetting]           = useState(false);
  const [deleteConfirmEmp, setDeleteConfirmEmp] = useState(null);
  const [isDeleting, setIsDeleting]             = useState(false);

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
      toast.error(err?.response?.data?.message || 'Không thể tải danh sách nhân viên');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => { fetchEmployees(); }, []);

  // ── Mở modal chi tiết nhân viên ───────────────────────────────────────────
  const openEmployeeModal = (emp, tab = 'info') => {
    setSelectedEmployee(emp);
    setActiveTab(tab);
    editForm.reset({ fullName: emp.full_name || '', email: emp.email || '' });
    setPermState(emp.permissions || {});
    setLimitsState({
      dailyEmailLimit:   emp.daily_email_limit   ?? null,
      monthlyEmailLimit: emp.monthly_email_limit ?? null,
      dailyZaloLimit:    emp.daily_zalo_limit    ?? null,
      monthlyZaloLimit:  emp.monthly_zalo_limit  ?? null,
    });
    setActiveMenu(null);
  };

  // ── Tab Thông tin ──────────────────────────────────────────────────────────
  const onSubmitInfo = async (values) => {
    try {
      setIsSavingInfo(true);
      await userManagementApiService.updateEmployeeInfo(selectedEmployee.id, {
        fullName: values.fullName?.trim() || null,
        email:    values.email.trim(),
      });
      toast.success('Cập nhật thông tin thành công');
      fetchEmployees(true);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Không thể cập nhật thông tin');
    } finally {
      setIsSavingInfo(false);
    }
  };

  // ── Tab Phân quyền ────────────────────────────────────────────────────────
  const handleSavePermissions = async () => {
    try {
      setIsSavingPerm(true);
      await userManagementApiService.updateEmployeePermissions(selectedEmployee.id, permState);
      toast.success('Cập nhật quyền hạn thành công');
      fetchEmployees(true);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Không thể cập nhật quyền hạn');
    } finally {
      setIsSavingPerm(false);
    }
  };

  // ── Tab Giới hạn gửi ──────────────────────────────────────────────────────
  const handleSaveLimits = async () => {
    try {
      setIsSavingLimits(true);
      await userManagementApiService.updateSendLimits(selectedEmployee.id, limitsState);
      toast.success('Cập nhật giới hạn lượt gửi thành công');
      fetchEmployees(true);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Không thể cập nhật giới hạn lượt gửi');
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
        password: DEFAULT_EMPLOYEE_PASSWORD,
      });
      toast.success(`Tạo tài khoản thành công. Mật khẩu mặc định: ${DEFAULT_EMPLOYEE_PASSWORD}`);
      setShowCreateModal(false);
      createNewForm.reset();
      fetchEmployees(true);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Không thể tạo tài khoản nhân viên');
    } finally {
      setIsCreating(false);
    }
  };

  const onSubmitCreateLink = async (values) => {
    try {
      setIsCreating(true);
      await userManagementApiService.linkEmployee(values.email.trim());
      toast.success('Liên kết tài khoản nhân viên thành công');
      setShowCreateModal(false);
      createLinkForm.reset();
      fetchEmployees(true);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Không thể liên kết tài khoản');
    } finally {
      setIsCreating(false);
    }
  };

  // ── Khóa / Mở khóa ────────────────────────────────────────────────────────
  const handleToggleStatus = async (emp) => {
    const newStatus = emp.member_status === 'active' ? 'inactive' : 'active';
    try {
      setStatusUpdatingId(emp.id);
      await userManagementApiService.updateEmployeeStatus(emp.id, newStatus);
      toast.success('Cập nhật trạng thái thành công');
      fetchEmployees(true);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Không thể cập nhật trạng thái');
    } finally {
      setStatusUpdatingId(null);
    }
  };

  // ── Reset / Xóa ───────────────────────────────────────────────────────────
  const handleConfirmReset = async () => {
    try {
      setIsResetting(true);
      await userManagementApiService.resetEmployeePassword(resetConfirmEmp.id);
      toast.success(`Reset thành công. Mật khẩu mặc định: ${DEFAULT_EMPLOYEE_PASSWORD}`);
      setResetConfirmEmp(null);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Không thể reset mật khẩu');
    } finally {
      setIsResetting(false);
    }
  };

  const handleConfirmDelete = async () => {
    try {
      setIsDeleting(true);
      await userManagementApiService.deleteEmployee(deleteConfirmEmp.id);
      toast.success('Đã xóa nhân viên khỏi team');
      setDeleteConfirmEmp(null);
      if (selectedEmployee?.id === deleteConfirmEmp.id) setSelectedEmployee(null);
      fetchEmployees(true);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Không thể xóa nhân viên');
    } finally {
      setIsDeleting(false);
    }
  };

  const TABS = [
    { key: 'info',        label: 'Thông tin' },
    { key: 'permissions', label: 'Phân quyền' },
    { key: 'limits',      label: 'Giới hạn gửi' },
  ];

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Quản lý nhân viên</h1>
          <p className="text-gray-500 mt-1">Click vào nhân viên để chỉnh thông tin, quyền hạn và giới hạn gửi.</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => fetchEmployees(true)} className="btn btn-secondary" disabled={isRefreshing}>
            <HiOutlineRefresh className="w-5 h-5 mr-2" />
            Làm mới
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => { setCreateTab('new'); createNewForm.reset(); createLinkForm.reset(); setShowCreateModal(true); }}
          >
            <HiOutlinePlus className="w-5 h-5 mr-2" />
            Thêm nhân viên
          </button>
        </div>
      </div>

      {/* Bảng nhân viên */}
      <div className="card">
        {isLoading ? (
          <div className="h-56 flex items-center justify-center"><div className="spinner w-8 h-8" /></div>
        ) : employees.length === 0 ? (
          <div className="py-16 text-center text-gray-500">Chưa có tài khoản nhân viên nào.</div>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Tên đăng nhập</th>
                  <th>Họ tên</th>
                  <th>Email</th>
                  <th>Trạng thái</th>
                  <th>Giới hạn Email</th>
                  <th>Giới hạn Zalo</th>
                  <th>Ngày thêm</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((emp) => {
                  const isActive = emp.member_status === 'active';
                  return (
                    <tr
                      key={emp.id}
                      className="cursor-pointer hover:bg-primary-50/40 transition-colors"
                      onClick={() => openEmployeeModal(emp)}
                    >
                      <td className="font-medium text-primary-600">{emp.username}</td>
                      <td>{emp.full_name || <span className="text-gray-400">—</span>}</td>
                      <td className="text-sm text-gray-600">{emp.email}</td>
                      <td>
                        <span className={`badge ${isActive ? 'badge-success' : 'badge-gray'}`}>
                          {isActive ? 'Đang hoạt động' : 'Đã khóa'}
                        </span>
                      </td>
                      <td className="text-sm text-gray-500 whitespace-nowrap">
                        {limitLabel(emp.daily_email_limit)}/ngày
                        <span className="mx-1 text-gray-300">·</span>
                        {limitLabel(emp.monthly_email_limit)}/tháng
                      </td>
                      <td className="text-sm text-gray-500 whitespace-nowrap">
                        {limitLabel(emp.daily_zalo_limit)}/ngày
                        <span className="mx-1 text-gray-300">·</span>
                        {limitLabel(emp.monthly_zalo_limit)}/tháng
                      </td>
                      <td className="text-sm text-gray-500">
                        {emp.joined_at ? new Date(emp.joined_at).toLocaleDateString('vi-VN') : '—'}
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
              <h2 className="text-xl font-semibold text-gray-900">{selectedEmployee.full_name || selectedEmployee.username}</h2>
              <p className="text-sm text-gray-500 mt-0.5">@{selectedEmployee.username} · {selectedEmployee.email}</p>
            </div>
            <button
              type="button"
              className="btn btn-secondary shrink-0"
              onClick={() => setSelectedEmployee(null)}
            >
              Đóng
            </button>
          </div>

          {/* Tab switcher */}
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
                    <label className="block text-sm font-medium text-gray-700 mb-1">Tên đăng nhập</label>
                    <input type="text" className="input w-full bg-gray-50" value={selectedEmployee.username} disabled />
                    <p className="text-xs text-gray-400 mt-1">Tên đăng nhập không thể thay đổi.</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Họ tên</label>
                    <input type="text" className="input w-full" {...editForm.register('fullName')} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                    <input
                      type="email"
                      className="input w-full"
                      {...editForm.register('email', { required: 'Vui lòng nhập email' })}
                    />
                    {editForm.formState.errors.email && (
                      <p className="text-red-500 text-sm mt-1">{editForm.formState.errors.email.message}</p>
                    )}
                  </div>
                  <div className="flex justify-end">
                    <button type="submit" className="btn btn-primary" disabled={isSavingInfo}>
                      {isSavingInfo ? 'Đang lưu...' : 'Lưu thay đổi'}
                    </button>
                  </div>
                </form>

                {/* Quản lý tài khoản */}
                <div className="border-t border-gray-100 pt-5 space-y-3">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Quản lý tài khoản</p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => handleToggleStatus(selectedEmployee)}
                      disabled={statusUpdatingId === selectedEmployee.id}
                      className={`btn ${selectedEmployee.member_status === 'active' ? 'btn-secondary text-yellow-600' : 'btn-secondary text-green-600'}`}
                    >
                      {statusUpdatingId === selectedEmployee.id ? (
                        <div className="spinner w-4 h-4 mr-2" />
                      ) : selectedEmployee.member_status === 'active' ? (
                        <HiOutlineLockClosed className="w-4 h-4 mr-2" />
                      ) : (
                        <HiOutlineLockOpen className="w-4 h-4 mr-2" />
                      )}
                      {statusUpdatingId === selectedEmployee.id
                        ? 'Đang cập nhật...'
                        : selectedEmployee.member_status === 'active' ? 'Khóa tài khoản' : 'Mở khóa'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setResetConfirmEmp(selectedEmployee)}
                      className="btn btn-secondary"
                    >
                      <HiOutlineKey className="w-4 h-4 mr-2" />
                      Reset mật khẩu
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteConfirmEmp(selectedEmployee)}
                      className="btn btn-secondary text-red-600 hover:bg-red-50"
                    >
                      <HiOutlineTrash className="w-4 h-4 mr-2" />
                      Xóa khỏi team
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ── Tab Phân quyền ── */}
            {activeTab === 'permissions' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {PERMISSION_FIELDS.map(({ key, label }) => (
                    <label key={key} className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer">
                      <input
                        type="checkbox"
                        className="w-4 h-4 text-primary-600 rounded"
                        checked={permState[key] === true}
                        onChange={(e) => setPermState((prev) => ({ ...prev, [key]: e.target.checked }))}
                      />
                      <span className="text-sm text-gray-700">{label}</span>
                    </label>
                  ))}
                </div>
                <div className="flex justify-end pt-2">
                  <button type="button" className="btn btn-primary" onClick={handleSavePermissions} disabled={isSavingPerm}>
                    {isSavingPerm ? 'Đang lưu...' : 'Lưu quyền hạn'}
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
                    <h3 className="text-sm font-semibold text-gray-800 uppercase tracking-wide">Email</h3>
                  </div>
                  <div className="grid grid-cols-2 gap-6">
                    <LimitField
                      label="Giới hạn / ngày"
                      value={limitsState.dailyEmailLimit}
                      onChange={(v) => setLimitsState((p) => ({ ...p, dailyEmailLimit: v }))}
                    />
                    <LimitField
                      label="Giới hạn / tháng"
                      value={limitsState.monthlyEmailLimit}
                      onChange={(v) => setLimitsState((p) => ({ ...p, monthlyEmailLimit: v }))}
                    />
                  </div>
                </div>
                <div className="border-t border-gray-100" />
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <HiOutlineChat className="w-5 h-5 text-green-500" />
                    <h3 className="text-sm font-semibold text-gray-800 uppercase tracking-wide">Zalo</h3>
                  </div>
                  <div className="grid grid-cols-2 gap-6">
                    <LimitField
                      label="Giới hạn / ngày"
                      value={limitsState.dailyZaloLimit}
                      onChange={(v) => setLimitsState((p) => ({ ...p, dailyZaloLimit: v }))}
                    />
                    <LimitField
                      label="Giới hạn / tháng"
                      value={limitsState.monthlyZaloLimit}
                      onChange={(v) => setLimitsState((p) => ({ ...p, monthlyZaloLimit: v }))}
                    />
                  </div>
                </div>
                <div className="flex justify-end pt-2">
                  <button type="button" className="btn btn-primary" onClick={handleSaveLimits} disabled={isSavingLimits}>
                    {isSavingLimits ? 'Đang lưu...' : 'Lưu giới hạn'}
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
            <h2 className="text-xl font-semibold text-gray-900">Thêm nhân viên</h2>
            <button type="button" className="btn btn-secondary" onClick={() => setShowCreateModal(false)}>Đóng</button>
          </div>
          <div className="flex border-b border-gray-200 mb-5">
            {[{ key: 'new', label: 'Tạo tài khoản mới' }, { key: 'link', label: 'Link tài khoản có sẵn' }].map(({ key, label }) => (
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
                Dùng khi email <strong>chưa có</strong> trong hệ thống.
                Mật khẩu mặc định: <strong>{DEFAULT_EMPLOYEE_PASSWORD}</strong>
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tên đăng nhập *</label>
                  <input
                    type="text"
                    className="input w-full"
                    {...createNewForm.register('username', {
                      required: 'Vui lòng nhập tên đăng nhập',
                      minLength: { value: 3, message: 'Tối thiểu 3 ký tự' },
                      pattern: { value: /^[A-Za-z0-9]+$/, message: 'Chỉ được chứa chữ cái và số' },
                    })}
                  />
                  {createNewForm.formState.errors.username && (
                    <p className="text-red-500 text-sm mt-1">{createNewForm.formState.errors.username.message}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                  <input
                    type="email"
                    className="input w-full"
                    {...createNewForm.register('email', { required: 'Vui lòng nhập email' })}
                  />
                  {createNewForm.formState.errors.email && (
                    <p className="text-red-500 text-sm mt-1">{createNewForm.formState.errors.email.message}</p>
                  )}
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Họ tên</label>
                  <input type="text" className="input w-full" {...createNewForm.register('fullName')} />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" className="btn btn-secondary" onClick={() => setShowCreateModal(false)}>Hủy</button>
                <button type="submit" className="btn btn-primary" disabled={isCreating}>
                  {isCreating ? 'Đang tạo...' : 'Tạo tài khoản'}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={createLinkForm.handleSubmit(onSubmitCreateLink)} className="space-y-4">
              <p className="text-sm text-gray-500">
                Dùng khi email <strong>đã có</strong> trong hệ thống nhưng chưa thuộc team nào và chưa có gói dịch vụ riêng.
              </p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                <input
                  type="email"
                  className="input w-full"
                  placeholder="email@example.com"
                  {...createLinkForm.register('email', { required: 'Vui lòng nhập email' })}
                />
                {createLinkForm.formState.errors.email && (
                  <p className="text-red-500 text-sm mt-1">{createLinkForm.formState.errors.email.message}</p>
                )}
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" className="btn btn-secondary" onClick={() => setShowCreateModal(false)}>Hủy</button>
                <button type="submit" className="btn btn-primary" disabled={isCreating}>
                  {isCreating ? 'Đang liên kết...' : 'Liên kết tài khoản'}
                </button>
              </div>
            </form>
          )}
        </div>,
        () => { if (!isCreating) setShowCreateModal(false); },
        MODAL_CREATE
      )}

      {/* ── Modal confirm reset mật khẩu ─────────────────────────────────────── */}
      {resetConfirmEmp && renderModal(
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Xác nhận reset mật khẩu</h2>
          <p className="text-sm text-gray-500 mt-2">Reset mật khẩu cho <strong>{resetConfirmEmp.username}</strong>?</p>
          <p className="text-sm text-gray-500 mt-1">Mật khẩu sau khi reset: <strong>{DEFAULT_EMPLOYEE_PASSWORD}</strong></p>
          <div className="flex justify-end gap-2 mt-6">
            <button type="button" className="btn btn-secondary" onClick={() => setResetConfirmEmp(null)} disabled={isResetting}>Hủy</button>
            <button type="button" className="btn btn-primary" onClick={handleConfirmReset} disabled={isResetting}>
              {isResetting ? 'Đang reset...' : 'Xác nhận'}
            </button>
          </div>
        </div>,
        () => { if (!isResetting) setResetConfirmEmp(null); },
        MODAL_SM
      )}

      {/* ── Modal confirm xóa nhân viên ──────────────────────────────────────── */}
      {deleteConfirmEmp && renderModal(
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Xác nhận xóa nhân viên</h2>
          <p className="text-sm text-gray-500 mt-2">
            Xóa <strong>{deleteConfirmEmp.username}</strong> khỏi team?
            Tài khoản của họ vẫn còn nhưng sẽ không còn là nhân viên của bạn.
          </p>
          <div className="flex justify-end gap-2 mt-6">
            <button type="button" className="btn btn-secondary" onClick={() => setDeleteConfirmEmp(null)} disabled={isDeleting}>Hủy</button>
            <button
              type="button"
              className="btn btn-primary bg-red-600 hover:bg-red-700 border-red-600"
              onClick={handleConfirmDelete}
              disabled={isDeleting}
            >
              {isDeleting ? 'Đang xóa...' : 'Xác nhận xóa'}
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
