import { useState } from 'react';
import { HiOutlineLockClosed, HiOutlineEye, HiOutlineEyeOff, HiOutlineX } from 'react-icons/hi';
import { changePassword } from '../services/authApi.service';

/**
 * Modal đổi mật khẩu cho người dùng đang đăng nhập.
 *
 * @param {{ isOpen: boolean, onClose: () => void }} props
 */
const ChangePasswordModal = ({ isOpen, onClose }) => {
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [showPasswords, setShowPasswords] = useState({ current: false, new: false, confirm: false });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  if (!isOpen) return null;

  const handleChange = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
    setError('');
    setSuccess('');
  };

  const toggleShow = (field) =>
    setShowPasswords((prev) => ({ ...prev, [field]: !prev[field] }));

  const handleClose = () => {
    setForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    setError('');
    setSuccess('');
    onClose();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!form.currentPassword || !form.newPassword || !form.confirmPassword) {
      setError('Vui lòng điền đầy đủ thông tin.');
      return;
    }
    if (form.newPassword.length < 6) {
      setError('Mật khẩu mới phải có ít nhất 6 ký tự.');
      return;
    }
    if (form.newPassword !== form.confirmPassword) {
      setError('Xác nhận mật khẩu không khớp.');
      return;
    }

    setLoading(true);
    try {
      const res = await changePassword({
        currentPassword: form.currentPassword,
        newPassword: form.newPassword,
      });
      if (res.success) {
        setSuccess('Đổi mật khẩu thành công!');
        setForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      } else {
        setError(res.message || 'Đổi mật khẩu thất bại.');
      }
    } catch (err) {
      setError(err?.response?.data?.message || 'Đã xảy ra lỗi. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  const fields = [
    { key: 'currentPassword', label: 'Mật khẩu hiện tại', showKey: 'current' },
    { key: 'newPassword', label: 'Mật khẩu mới', showKey: 'new' },
    { key: 'confirmPassword', label: 'Xác nhận mật khẩu mới', showKey: 'confirm' },
  ];

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div
        className="modal-content modal-content-animate w-full max-w-md mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <HiOutlineLockClosed className="w-5 h-5 text-primary-600" />
            <h2 className="text-base font-semibold text-gray-900">Đổi mật khẩu</h2>
          </div>
          <button
            onClick={handleClose}
            className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <HiOutlineX className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {fields.map(({ key, label, showKey }) => (
            <div key={key}>
              <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
              <div className="relative">
                <input
                  type={showPasswords[showKey] ? 'text' : 'password'}
                  value={form[key]}
                  onChange={handleChange(key)}
                  className="w-full pr-10 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  placeholder={label}
                  autoComplete={key === 'currentPassword' ? 'current-password' : 'new-password'}
                />
                <button
                  type="button"
                  onClick={() => toggleShow(showKey)}
                  className="absolute inset-y-0 right-3 flex items-center text-gray-400 hover:text-gray-600"
                  tabIndex={-1}
                >
                  {showPasswords[showKey]
                    ? <HiOutlineEyeOff className="w-4 h-4" />
                    : <HiOutlineEye className="w-4 h-4" />
                  }
                </button>
              </div>
            </div>
          ))}

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

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={handleClose} className="btn btn-secondary">
              Hủy
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Đang lưu...' : 'Đổi mật khẩu'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ChangePasswordModal;
