import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { HiOutlinePlus, HiOutlineRefresh, HiOutlineUserAdd } from 'react-icons/hi';
import userManagementApiService from '../../features/users/services/userManagementApi.service';

const DEFAULT_EMPLOYEE_PASSWORD = 'digiso@2026';
const EMPLOYEE_PAGE_MODAL_OVERLAY_CLASS = 'fixed inset-0 z-[9999] flex items-center justify-center p-4 md:p-6';
const EMPLOYEE_PAGE_MODAL_PANEL_COMPACT_CLASS =
  'relative z-10 w-full max-w-2xl max-h-[85vh] rounded-xl bg-white shadow-xl p-6 overflow-y-auto';
const EMPLOYEE_PAGE_MODAL_PANEL_WIDE_CLASS =
  'relative z-10 w-full max-w-3xl max-h-[85vh] rounded-xl bg-white shadow-xl p-6 overflow-y-auto';
const EMPLOYEE_LIMIT_FIELDS = [
  { key: 'maxCampaigns', label: 'Số chiến dịch tối đa' },
  { key: 'maxZaloAccounts', label: 'Số tài khoản Zalo quản lý tối đa' },
  { key: 'maxEmailAccounts', label: 'Số tài khoản Email quản lý tối đa' },
  { key: 'maxEmailTemplates', label: 'Số Email template tối đa' },
  { key: 'maxZaloTemplates', label: 'Số Zalo template tối đa' },
];

const buildLimitFormValues = (employee = null) => {
  const nextValues = {};
  EMPLOYEE_LIMIT_FIELDS.forEach(({ key }) => {
    const rawValue = employee?.[key];
    nextValues[key] = rawValue === null || rawValue === undefined ? '' : String(rawValue);
  });
  return nextValues;
};

/**
 * Trang quản lý nhân viên cho admin.
 *
 * Luồng hoạt động:
 * 1. Tải danh sách nhân viên từ API.
 * 2. Cho phép admin tạo tài khoản nhân viên mới.
 * 3. Cho phép khóa/mở tài khoản nhân viên ngay trên danh sách.
 */
const EmployeeManagement = () => {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [statusUpdatingEmployeeId, setStatusUpdatingEmployeeId] = useState(null);
  const [resettingPasswordEmployeeId, setResettingPasswordEmployeeId] = useState(null);
  const [resetPasswordConfirmEmployee, setResetPasswordConfirmEmployee] = useState(null);
  const [limitsModalEmployee, setLimitsModalEmployee] = useState(null);
  const [limitsFormValues, setLimitsFormValues] = useState(() => buildLimitFormValues());
  const [isSavingLimits, setIsSavingLimits] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({
    defaultValues: {
      username: '',
      email: '',
      fullName: '',
      phone: '',
    },
  });

  /**
   * Tải danh sách nhân viên từ backend.
   *
   * @param {boolean} [showRefreshState=false] bật trạng thái loading cho nút làm mới
   */
  const fetchEmployees = async (showRefreshState = false) => {
    if (showRefreshState) setIsRefreshing(true);
    if (!showRefreshState) setIsLoading(true);
    try {
      const response = await userManagementApiService.getEmployees();
      setEmployees(response.data?.data || []);
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Không thể tải danh sách nhân viên');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchEmployees();
  }, []);

  const onSubmitCreateEmployee = async (formValues) => {
    try {
      setIsCreating(true);
      await userManagementApiService.createEmployee({
        username: String(formValues.username || '').trim(),
        email: String(formValues.email || '').trim(),
        fullName: String(formValues.fullName || '').trim() || null,
        phone: String(formValues.phone || '').trim() || null,
      });
      toast.success(`Tạo tài khoản nhân viên thành công. Mật khẩu mặc định: ${DEFAULT_EMPLOYEE_PASSWORD}`);
      setShowCreateForm(false);
      reset();
      fetchEmployees(true);
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Không thể tạo tài khoản nhân viên');
    } finally {
      setIsCreating(false);
    }
  };

  const handleToggleEmployeeStatus = async (employee) => {
    const isActive = employee.status === 'active';
    try {
      setStatusUpdatingEmployeeId(employee.id);
      await userManagementApiService.updateEmployeeStatus(
        employee.id,
        isActive ? 'inactive' : 'active'
      );
      toast.success('Cập nhật trạng thái nhân viên thành công');
      fetchEmployees(true);
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Không thể cập nhật trạng thái nhân viên');
    } finally {
      setStatusUpdatingEmployeeId(null);
    }
  };

  /**
   * Mở popup xác nhận reset mật khẩu cho nhân viên.
   *
   * Luồng hoạt động:
   * 1. Lưu thông tin nhân viên được chọn vào state.
   * 2. Hiển thị modal xác nhận để tránh thao tác nhầm.
   *
   * @param {{id: number|string, username: string}} employee thông tin nhân viên cần reset mật khẩu
   */
  const openResetPasswordConfirmModal = (employee) => {
    setResetPasswordConfirmEmployee(employee);
  };

  /**
   * Đóng popup xác nhận reset mật khẩu.
   *
   * Luồng hoạt động:
   * 1. Chặn đóng khi đang chạy API để tránh trạng thái UI không đồng bộ.
   * 2. Xóa thông tin nhân viên đang chờ xác nhận.
   */
  const closeResetPasswordConfirmModal = () => {
    if (resettingPasswordEmployeeId) return;
    setResetPasswordConfirmEmployee(null);
  };

  /**
   * Xác nhận reset mật khẩu và gọi API backend.
   *
   * Luồng hoạt động:
   * 1. Kiểm tra có nhân viên đang được xác nhận hay không.
   * 2. Gọi API reset mật khẩu theo đúng employee id.
   * 3. Thông báo kết quả và đóng popup sau khi hoàn tất.
   */
  const handleConfirmResetEmployeePassword = async () => {
    if (!resetPasswordConfirmEmployee) return;

    try {
      setResettingPasswordEmployeeId(resetPasswordConfirmEmployee.id);
      await userManagementApiService.resetEmployeePassword(resetPasswordConfirmEmployee.id);
      toast.success(`Reset mật khẩu thành công. Mật khẩu mặc định: ${DEFAULT_EMPLOYEE_PASSWORD}`);
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Không thể reset mật khẩu nhân viên');
    } finally {
      setResettingPasswordEmployeeId(null);
      setResetPasswordConfirmEmployee(null);
    }
  };

  /**
   * Lưu giới hạn tài nguyên cho tài khoản nhân viên đang được chọn.
   *
   * Luồng hoạt động:
   * 1. Chuẩn hóa dữ liệu form: để trống => null (không giới hạn), có giá trị => số nguyên >= 0.
   * 2. Gọi API cập nhật giới hạn cho đúng nhân viên.
   * 3. Làm mới danh sách và đóng popup khi cập nhật thành công.
   */
  const handleSaveEmployeeLimits = async () => {
    if (!limitsModalEmployee) return;

    const payload = {};
    for (const field of EMPLOYEE_LIMIT_FIELDS) {
      const rawValue = String(limitsFormValues[field.key] || '').trim();
      if (!rawValue) {
        payload[field.key] = null;
        continue;
      }

      if (!/^\d+$/.test(rawValue)) {
        toast.error(`${field.label} phải là số nguyên lớn hơn hoặc bằng 0`);
        return;
      }

      payload[field.key] = Number.parseInt(rawValue, 10);
    }

    try {
      setIsSavingLimits(true);
      await userManagementApiService.updateEmployeeLimits(limitsModalEmployee.id, payload);
      toast.success('Cập nhật giới hạn tài khoản thành công');
      setLimitsModalEmployee(null);
      setLimitsFormValues(buildLimitFormValues());
      fetchEmployees(true);
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Không thể cập nhật giới hạn tài khoản');
    } finally {
      setIsSavingLimits(false);
    }
  };

  const openLimitsModal = (employee) => {
    setLimitsModalEmployee(employee);
    setLimitsFormValues(buildLimitFormValues(employee));
  };

  const closeLimitsModal = () => {
    if (isSavingLimits) return;
    setLimitsModalEmployee(null);
    setLimitsFormValues(buildLimitFormValues());
  };

  /**
   * Render modal qua portal để overlay luôn phủ toàn bộ viewport.
   *
   * Luồng hoạt động:
   * 1. Render lớp nền xám toàn màn hình ở `document.body`.
   * 2. Khi bấm ra ngoài modal sẽ gọi callback đóng tương ứng.
   * 3. Nội dung modal được truyền vào để tái sử dụng cho nhiều popup trong trang.
   *
   * @param {import('react').ReactNode} content nội dung thân modal
   * @param {() => void} onClose hàm đóng modal khi bấm nền
   * @param {string} overlayAriaLabel nhãn truy cập cho nút nền
   * @param {string} [panelClassName] className điều khiển kích thước modal
   * @returns {import('react').ReactPortal | null} portal modal hoặc null khi chưa có document
   */
  const renderEmployeePageModal = (
    content,
    onClose,
    overlayAriaLabel,
    panelClassName = EMPLOYEE_PAGE_MODAL_PANEL_WIDE_CLASS
  ) => {
    if (typeof document === 'undefined') return null;

    return createPortal(
      <div className={EMPLOYEE_PAGE_MODAL_OVERLAY_CLASS}>
        <button
          type="button"
          className="absolute inset-0 bg-black/50"
          onClick={onClose}
          aria-label={overlayAriaLabel}
        />
        <div className={panelClassName}>{content}</div>
      </div>,
      document.body
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Quản lý nhân viên</h1>
          <p className="text-gray-500 mt-1">
            Admin có thể tạo tài khoản nhân viên và khóa/mở trạng thái đăng nhập.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fetchEmployees(true)}
            className="btn btn-secondary"
            disabled={isRefreshing}
          >
            <HiOutlineRefresh className="w-5 h-5 mr-2" />
            Làm mới
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setShowCreateForm((prev) => !prev)}
          >
            <HiOutlinePlus className="w-5 h-5 mr-2" />
            {showCreateForm ? 'Đóng form' : 'Tạo tài khoản'}
          </button>
        </div>
      </div>

      {showCreateForm && (
        <div className="card p-5">
          <div className="flex items-center mb-4">
            <HiOutlineUserAdd className="w-5 h-5 text-primary-600 mr-2" />
            <h2 className="text-lg font-semibold text-gray-900">Tạo tài khoản nhân viên mới</h2>
          </div>
          <p className="text-sm text-gray-500 mb-4">
            Mật khẩu mặc định của tài khoản mới là <strong>{DEFAULT_EMPLOYEE_PASSWORD}</strong>.
          </p>

          <form onSubmit={handleSubmit(onSubmitCreateEmployee)} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tên đăng nhập *</label>
              <input
                type="text"
                className="input w-full"
                {...register('username', {
                  required: 'Vui lòng nhập tên đăng nhập',
                  minLength: { value: 3, message: 'Tên đăng nhập phải có ít nhất 3 ký tự' },
                  maxLength: { value: 50, message: 'Tên đăng nhập không được quá 50 ký tự' },
                  pattern: {
                    value: /^[A-Za-z0-9]+$/,
                    message:
                      'Tên đăng nhập chỉ được chứa chữ cái không dấu và số (không khoảng trắng, không ký tự đặc biệt)',
                  },
                })}
              />
              {errors.username && (
                <p className="text-red-500 text-sm mt-1">{errors.username.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
              <input
                type="email"
                className="input w-full"
                {...register('email', { required: 'Vui lòng nhập email' })}
              />
              {errors.email && <p className="text-red-500 text-sm mt-1">{errors.email.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Họ tên</label>
              <input type="text" className="input w-full" {...register('fullName')} />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Số điện thoại</label>
              <input type="text" className="input w-full" {...register('phone')} />
            </div>

            <div className="md:col-span-2 flex justify-end">
              <button
                type="submit"
                className="btn btn-primary"
                disabled={isCreating}
              >
                {isCreating ? 'Đang tạo...' : 'Tạo tài khoản nhân viên'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="card">
        {isLoading ? (
          <div className="h-56 flex items-center justify-center">
            <div className="spinner w-8 h-8" />
          </div>
        ) : employees.length === 0 ? (
          <div className="py-16 text-center text-gray-500">
            Chưa có tài khoản nhân viên nào.
          </div>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Tên đăng nhập</th>
                  <th>Họ tên</th>
                  <th>Email</th>
                  <th>Số điện thoại</th>
                  <th>Trạng thái</th>
                  <th>Lần đăng nhập cuối</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((employee) => {
                  const isActive = employee.status === 'active';
                  return (
                    <tr key={employee.id}>
                      <td>{employee.username}</td>
                      <td>{employee.fullName || '-'}</td>
                      <td>{employee.email}</td>
                      <td>{employee.phone || '-'}</td>
                      <td>
                        <span className={`badge ${isActive ? 'badge-success' : 'badge-gray'}`}>
                          {isActive ? 'Đang hoạt động' : 'Đã khóa'}
                        </span>
                      </td>
                      <td className="text-sm text-gray-500">
                        {employee.lastLoginAt
                          ? new Date(employee.lastLoginAt).toLocaleString('vi-VN')
                          : 'Chưa đăng nhập'}
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className={isActive ? 'btn btn-secondary' : 'btn btn-primary'}
                            disabled={statusUpdatingEmployeeId === employee.id}
                            onClick={() => handleToggleEmployeeStatus(employee)}
                          >
                            {statusUpdatingEmployeeId === employee.id
                              ? 'Đang cập nhật...'
                              : isActive
                                ? 'Khóa tài khoản'
                                : 'Mở khóa'}
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            disabled={resettingPasswordEmployeeId === employee.id}
                            onClick={() => openResetPasswordConfirmModal(employee)}
                          >
                            {resettingPasswordEmployeeId === employee.id
                              ? 'Đang reset...'
                              : 'Reset mật khẩu'}
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => openLimitsModal(employee)}
                          >
                            Thiết lập giới hạn
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {resetPasswordConfirmEmployee &&
        renderEmployeePageModal(
          <div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Xác nhận reset mật khẩu</h2>
              <p className="text-sm text-gray-500 mt-2">
                Bạn có chắc muốn reset mật khẩu cho tài khoản{' '}
                <strong>{resetPasswordConfirmEmployee.username}</strong>?
              </p>
              <p className="text-sm text-gray-500 mt-2">
                Mật khẩu sau khi reset: <strong>{DEFAULT_EMPLOYEE_PASSWORD}</strong>.
              </p>
            </div>

            <div className="pt-6 flex justify-end gap-2">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={closeResetPasswordConfirmModal}
                disabled={resettingPasswordEmployeeId === resetPasswordConfirmEmployee.id}
              >
                Hủy
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleConfirmResetEmployeePassword}
                disabled={resettingPasswordEmployeeId === resetPasswordConfirmEmployee.id}
              >
                {resettingPasswordEmployeeId === resetPasswordConfirmEmployee.id
                  ? 'Đang reset...'
                  : 'Xác nhận reset'}
              </button>
            </div>
          </div>,
          closeResetPasswordConfirmModal,
          'Đóng popup xác nhận reset mật khẩu',
          EMPLOYEE_PAGE_MODAL_PANEL_COMPACT_CLASS
        )}

      {limitsModalEmployee &&
        renderEmployeePageModal(
          <div>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Thiết lập giới hạn tài khoản</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Tài khoản: <strong>{limitsModalEmployee.username}</strong>
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  Để trống trường nghĩa là <strong>không giới hạn</strong>.
                </p>
              </div>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={closeLimitsModal}
                disabled={isSavingLimits}
              >
                Đóng
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
              {EMPLOYEE_LIMIT_FIELDS.map((field) => (
                <div key={field.key}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{field.label}</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    className="input w-full"
                    placeholder="Không giới hạn"
                    value={limitsFormValues[field.key]}
                    onChange={(event) => {
                      setLimitsFormValues((prev) => ({
                        ...prev,
                        [field.key]: event.target.value,
                      }));
                    }}
                  />
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={closeLimitsModal}
                disabled={isSavingLimits}
              >
                Hủy
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSaveEmployeeLimits}
                disabled={isSavingLimits}
              >
                {isSavingLimits ? 'Đang lưu...' : 'Lưu giới hạn'}
              </button>
            </div>
          </div>,
          closeLimitsModal,
          'Đóng popup thiết lập giới hạn',
          EMPLOYEE_PAGE_MODAL_PANEL_WIDE_CLASS
        )}
    </div>
  );
};

export default EmployeeManagement;
