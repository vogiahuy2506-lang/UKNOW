import { useEffect, useMemo, useState } from 'react';
import { HiOutlineUserCircle, HiOutlineX, HiOutlineBadgeCheck } from 'react-icons/hi';
import { useAuthStore } from '../../../stores/authStore';
import { getMyProfile, updateMyProfile } from '../services/authApi.service';

const EMPLOYEE_LIMIT_ITEMS = [
  { key: 'maxCampaigns', label: 'Chiến dịch tối đa' },
  { key: 'maxZaloAccounts', label: 'Tài khoản Zalo tối đa' },
  { key: 'maxEmailAccounts', label: 'Tài khoản Email tối đa' },
  { key: 'maxEmailTemplates', label: 'Email template tối đa' },
  { key: 'maxZaloTemplates', label: 'Zalo template tối đa' },
];

const PROFILE_FORM_INITIAL_STATE = {
  fullName: '',
  email: '',
  phone: '',
};

/**
 * Hiển thị popup thông tin tài khoản và cho phép cập nhật hồ sơ cá nhân.
 *
 * Luồng hoạt động:
 * 1. Mỗi lần mở modal sẽ gọi API profile để lấy dữ liệu mới nhất.
 * 2. Người dùng được chỉnh sửa full name, email, số điện thoại.
 * 3. Nếu role là employee thì hiển thị thêm nhóm giới hạn tài nguyên ở dạng chỉ đọc.
 *
 * @param {{ isOpen: boolean, onClose: () => void }} props
 * @returns {JSX.Element|null}
 */
const AccountProfileModal = ({ isOpen, onClose }) => {
  const { user, updateUser } = useAuthStore();
  const [formValues, setFormValues] = useState(PROFILE_FORM_INITIAL_STATE);
  const [profileData, setProfileData] = useState(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const isEmployee = String(profileData?.roleCode || user?.roleCode || '').trim().toLowerCase() === 'employee';

  const employeeLimits = useMemo(
    () => EMPLOYEE_LIMIT_ITEMS.map((item) => ({ ...item, value: profileData?.[item.key] ?? null })),
    [profileData]
  );

  useEffect(() => {
    if (!isOpen) return;

    /**
     * Đồng bộ dữ liệu profile mới nhất khi mở popup.
     * Dùng cờ `isCancelled` để tránh setState sau khi modal đóng nhanh.
     */
    let isCancelled = false;
    const loadProfile = async () => {
      setIsLoadingProfile(true);
      setError('');
      setSuccess('');
      try {
        const response = await getMyProfile();
        const nextProfile = response?.data || null;
        if (isCancelled || !nextProfile) return;
        setProfileData(nextProfile);
        setFormValues({
          fullName: String(nextProfile.fullName || ''),
          email: String(nextProfile.email || ''),
          phone: String(nextProfile.phone || ''),
        });
      } catch (loadError) {
        if (!isCancelled) {
          setError(loadError?.response?.data?.message || 'Không thể tải thông tin tài khoản');
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingProfile(false);
        }
      }
    };

    loadProfile();
    return () => {
      isCancelled = true;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleClose = () => {
    if (isSaving) return;
    setError('');
    setSuccess('');
    onClose();
  };

  const handleInputChange = (fieldName) => (event) => {
    setFormValues((prev) => ({ ...prev, [fieldName]: event.target.value }));
    setError('');
    setSuccess('');
  };

  /**
   * Chuẩn hóa payload trước khi gửi API để dữ liệu lưu nhất quán.
   *
   * @returns {{ fullName: string, email: string, phone?: string }}
   */
  const buildSubmitPayload = () => {
    const normalizedFullName = String(formValues.fullName || '').trim();
    const normalizedEmail = String(formValues.email || '').trim();
    const normalizedPhone = String(formValues.phone || '').trim();

    return {
      fullName: normalizedFullName,
      email: normalizedEmail,
      ...(normalizedPhone ? { phone: normalizedPhone } : {}),
    };
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    const payload = buildSubmitPayload();
    if (!payload.email) {
      setError('Email không được để trống.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
      setError('Email không hợp lệ.');
      return;
    }
    if (payload.phone && !/^[0-9]{10,11}$/.test(payload.phone)) {
      setError('Số điện thoại phải gồm 10-11 chữ số.');
      return;
    }

    try {
      setIsSaving(true);
      const response = await updateMyProfile(payload);
      const updatedProfile = response?.data || null;
      if (!updatedProfile) {
        setError('Không nhận được dữ liệu cập nhật. Vui lòng thử lại.');
        return;
      }

      setProfileData(updatedProfile);
      setFormValues({
        fullName: String(updatedProfile.fullName || ''),
        email: String(updatedProfile.email || ''),
        phone: String(updatedProfile.phone || ''),
      });

      // Cập nhật nhanh auth store để sidebar/header phản ánh dữ liệu mới ngay lập tức.
      updateUser({
        ...user,
        ...updatedProfile,
      });
      setSuccess(response?.message || 'Cập nhật thông tin tài khoản thành công.');
    } catch (saveError) {
      setError(saveError?.response?.data?.message || 'Không thể cập nhật thông tin tài khoản');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div
        className="modal-content modal-content-animate w-full max-w-2xl mx-4"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <HiOutlineUserCircle className="w-6 h-6 text-primary-600" />
            <h2 className="text-base font-semibold text-gray-900">Thông tin tài khoản</h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <HiOutlineX className="w-5 h-5" />
          </button>
        </div>

        {isLoadingProfile ? (
          <div className="py-14 flex justify-center">
            <div className="spinner w-8 h-8" />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tên đăng nhập</label>
                <input
                  type="text"
                  className="input w-full bg-gray-50 text-gray-600"
                  value={profileData?.username || user?.username || ''}
                  disabled
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Vai trò</label>
                <input
                  type="text"
                  className="input w-full bg-gray-50 text-gray-600"
                  value={profileData?.roleName || user?.roleName || 'Người dùng'}
                  disabled
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Họ và tên</label>
                <input
                  type="text"
                  className="input w-full"
                  value={formValues.fullName}
                  onChange={handleInputChange('fullName')}
                  placeholder="Nhập họ và tên"
                  maxLength={255}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  className="input w-full"
                  value={formValues.email}
                  onChange={handleInputChange('email')}
                  placeholder="Nhập email"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Số điện thoại</label>
                <input
                  type="text"
                  className="input w-full"
                  value={formValues.phone}
                  onChange={handleInputChange('phone')}
                  placeholder="Nhập số điện thoại"
                />
              </div>
            </div>

            {isEmployee && (
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <div className="flex items-center gap-2">
                  <HiOutlineBadgeCheck className="w-5 h-5 text-primary-600" />
                  <h3 className="text-sm font-semibold text-gray-900">Mức độ giới hạn tài khoản</h3>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Giá trị trống nghĩa là tài khoản của bạn không bị giới hạn ở mục đó.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                  {employeeLimits.map((limitItem) => (
                    <div
                      key={limitItem.key}
                      className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2"
                    >
                      <span className="text-sm text-gray-600">{limitItem.label}</span>
                      <span className="text-sm font-semibold text-gray-900">
                        {limitItem.value === null ? 'Không giới hạn' : limitItem.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                {error}
              </p>
            )}
            {success && (
              <p className="text-sm text-green-700 bg-green-50 border border-green-100 rounded-lg px-3 py-2">
                {success}
              </p>
            )}

            <div className="flex justify-end gap-3">
              <button type="button" className="btn btn-secondary" onClick={handleClose} disabled={isSaving}>
                Đóng
              </button>
              <button type="submit" className="btn btn-primary" disabled={isSaving}>
                {isSaving ? 'Đang lưu...' : 'Lưu thông tin'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default AccountProfileModal;
