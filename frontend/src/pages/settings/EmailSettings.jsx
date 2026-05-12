import { useState, useEffect } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import {
  HiOutlinePlus,
  HiOutlineMail,
  HiOutlineTrash,
} from 'react-icons/hi';

const SENDGRID_SMTP_DEFAULTS = {
  smtpHost: 'smtp.sendgrid.net',
  smtpPort: '587',
  smtpUsername: 'apikey',
  useTls: true,
};

/**
 * Áp dụng nhanh cấu hình SMTP chuẩn cho SendGrid để giảm thao tác nhập tay.
 *
 * Luồng hoạt động:
 * 1. Giữ lại toàn bộ dữ liệu hiện có của form (name/email/password...).
 * 2. Ghi đè host/port/username sang giá trị chuẩn SendGrid.
 * 3. Bật TLS mặc định để phù hợp cổng 587.
 *
 * @param {object} currentForm dữ liệu form hiện tại
 * @returns {object} dữ liệu form sau khi merge mặc định SendGrid
 */
const applySendGridDefaults = (currentForm = {}) => ({
  ...currentForm,
  ...SENDGRID_SMTP_DEFAULTS,
});

const EmailSettings = () => {
  const [emailSettings, setEmailSettings] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedEmail, setSelectedEmail] = useState(null);
  const [isAddingNew, setIsAddingNew] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    smtpHost: SENDGRID_SMTP_DEFAULTS.smtpHost,
    smtpPort: SENDGRID_SMTP_DEFAULTS.smtpPort,
    smtpUsername: SENDGRID_SMTP_DEFAULTS.smtpUsername,
    smtpPassword: '',
    useTls: SENDGRID_SMTP_DEFAULTS.useTls,
  });

  useEffect(() => {
    fetchEmailSettings();
  }, []);

  const fetchEmailSettings = async () => {
    try {
      const response = await api.get('/email-settings');
      const items = response.data?.data?.items;
      setEmailSettings(Array.isArray(items) ? items : []);
    } catch (error) {
      setEmailSettings([]);
      toast.error('Không thể tải cài đặt email');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (selectedEmail && !isAddingNew) {
        await api.put(`/email-settings/${selectedEmail.id}`, formData);
        toast.success('Cập nhật email thành công');
      } else {
        await api.post('/email-settings', formData);
        toast.success('Thêm email thành công');
      }
      fetchEmailSettings();
      setIsAddingNew(false);
      setSelectedEmail(null);
      resetForm();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Có lỗi xảy ra');
    }
  };

  const handleSelectEmail = async (email) => {
    try {
      setIsAddingNew(false);
      const response = await api.get(`/email-settings/${email.id}`);
      const item = response.data?.data;
      setSelectedEmail(email);
      setFormData({
        name: item?.name || email.name,
        email: item?.email || email.email,
        smtpHost: item?.smtpHost || email.smtpHost,
        smtpPort: String(item?.smtpPort ?? email.smtpPort ?? '587'),
        smtpUsername: item?.smtpUsername || '',
        smtpPassword: '',
        useTls: item?.useTls ?? email.useTls ?? true,
      });
    } catch (error) {
      toast.error('Không thể tải chi tiết email');
    }
  };

  const handleAddNew = () => {
    setIsAddingNew(true);
    setSelectedEmail(null);
    resetForm(true);
  };

  const handleDelete = async (id) => {
    if (!confirm('Bạn có chắc chắn muốn xóa email này?')) return;
    try {
      await api.delete(`/email-settings/${id}`);
      toast.success('Đã xóa email');
      fetchEmailSettings();
    } catch (error) {
      toast.error('Không thể xóa email');
    }
  };

  const resetForm = (preferSendGrid = false) => {
    const emptyForm = {
      name: '',
      email: '',
      smtpHost: '',
      smtpPort: '587',
      smtpUsername: '',
      smtpPassword: '',
      useTls: true,
    };
    setFormData(preferSendGrid ? applySendGridDefaults(emptyForm) : emptyForm);
  };

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cài đặt email</h1>
        </div>
      </div>

      <div className="card">
        <div className="flex flex-col md:flex-row min-h-[500px] md:min-h-[600px]">
            {/* Left sidebar - Email list */}
            <div className="w-full md:w-80 shrink-0 border-b md:border-b-0 md:border-r border-gray-200 flex flex-col">
              <div className="p-4 border-b border-gray-200">
                <button
                  onClick={handleAddNew}
                  className="btn btn-primary w-full"
                >
                  <HiOutlinePlus className="w-4 h-4 mr-2" />
                  Thêm email mới
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto">
                {isLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="spinner w-8 h-8"></div>
                  </div>
                ) : emailSettings.length === 0 ? (
                  <div className="p-6 text-center text-gray-500">
                    <HiOutlineMail className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                    <p className="text-sm">Chưa có email nào</p>
                    <p className="text-xs mt-1">Thêm email để bắt đầu</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {emailSettings.map((email) => (
                      <div
                        key={email.id}
                        onClick={() => handleSelectEmail(email)}
                        className={`p-4 cursor-pointer hover:bg-gray-50 transition-colors ${
                          selectedEmail?.id === email.id && !isAddingNew
                            ? 'bg-primary-50 border-l-4 border-primary-600'
                            : ''
                        }`}
                      >
                        <div className="flex items-start">
                          <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center mr-3 flex-shrink-0">
                            <HiOutlineMail className="w-5 h-5 text-primary-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-gray-900 truncate">
                              {email.name}
                            </p>
                            <p className="text-sm text-gray-600 truncate">
                              {email.email}
                            </p>
                            <p className="text-xs text-gray-500 truncate mt-1">
                              Người tạo: {email?.createdBy?.name || email?.creatorName || 'Không xác định'}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right panel - Email details/form */}
            <div className="flex-1 overflow-y-auto">
              {!selectedEmail && !isAddingNew ? (
                <div className="flex items-center justify-center h-full p-8">
                  <div className="text-center">
                    <HiOutlineMail className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">
                      Chọn một email để xem chi tiết
                    </h3>
                    <p className="text-sm text-gray-500 max-w-md">
                      Chọn một email từ danh sách bên trái để xem và chỉnh sửa thông tin chi tiết
                    </p>
                  </div>
                </div>
              ) : (
                <div className="p-8">
                  <div className="max-w-3xl">
                    <div className="flex items-center justify-between mb-6">
                      <h3 className="text-lg font-semibold text-gray-900">
                        {isAddingNew ? 'Thêm email mới' : 'Chỉnh sửa email'}
                      </h3>
                      <div className="flex items-center space-x-2">
                        <button
                          type="button"
                          onClick={() => setFormData((prev) => applySendGridDefaults(prev))}
                          className="btn btn-secondary"
                        >
                          Dùng mặc định SendGrid
                        </button>
                        {selectedEmail && !isAddingNew && (
                          <button
                            onClick={() => handleDelete(selectedEmail.id)}
                            className="p-2 rounded-lg hover:bg-red-50 text-gray-500 hover:text-red-600"
                            title="Xóa"
                          >
                            <HiOutlineTrash className="w-5 h-5" />
                          </button>
                        )}
                      </div>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-6">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="label">Tên hiển thị</label>
                          <input
                            type="text"
                            value={formData.name}
                            onChange={(e) =>
                              setFormData((prev) => ({
                                ...prev,
                                name: e.target.value,
                              }))
                            }
                            className="input"
                            placeholder="Founder AI"
                            required
                          />
                        </div>
                        <div>
                          <label className="label">Email gửi</label>
                          <input
                            type="email"
                            value={formData.email}
                            onChange={(e) =>
                              setFormData((prev) => ({
                                ...prev,
                                email: e.target.value,
                              }))
                            }
                            className="input"
                            placeholder="noreply@Founder AI.vn"
                            required
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="label">SMTP Host</label>
                          <input
                            type="text"
                            value={formData.smtpHost}
                            onChange={(e) =>
                              setFormData((prev) => ({
                                ...prev,
                                smtpHost: e.target.value,
                              }))
                            }
                            className="input"
                            placeholder="smtp.sendgrid.net"
                            required
                          />
                        </div>
                        <div>
                          <label className="label">SMTP Port</label>
                          <input
                            type="text"
                            value={formData.smtpPort}
                            onChange={(e) =>
                              setFormData((prev) => ({
                                ...prev,
                                smtpPort: e.target.value,
                              }))
                            }
                            className="input"
                            placeholder="587"
                            required
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="label">SMTP Username</label>
                          <input
                            type="text"
                            value={formData.smtpUsername}
                            onChange={(e) =>
                              setFormData((prev) => ({
                                ...prev,
                                smtpUsername: e.target.value,
                              }))
                            }
                            className="input"
                            placeholder="apikey"
                            required
                          />
                        </div>
                        <div>
                          <label className="label">SMTP Password</label>
                          <input
                            type="password"
                            value={formData.smtpPassword}
                            onChange={(e) =>
                              setFormData((prev) => ({
                                ...prev,
                                smtpPassword: e.target.value,
                              }))
                            }
                            className="input"
                            placeholder="Nhập SMTP password"
                            autoComplete="new-password"
                            spellCheck={false}
                            required
                          />
                          <p className="text-xs text-gray-500 mt-1">
                            Bắt buộc nhập SMTP password khi thêm mới hoặc chỉnh sửa.
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            Với SendGrid SMTP: username dùng <strong>apikey</strong>, password là API key bắt đầu bằng <strong>SG.</strong>
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center">
                        <input
                          type="checkbox"
                          id="useTls"
                          checked={formData.useTls}
                          onChange={(e) =>
                            setFormData((prev) => ({ ...prev, useTls: e.target.checked }))
                          }
                          className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                        />
                        <label htmlFor="useTls" className="ml-2 text-sm text-gray-700">
                          Sử dụng TLS/SSL
                        </label>
                      </div>

                      <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedEmail(null);
                            setIsAddingNew(false);
                            resetForm();
                          }}
                          className="btn btn-secondary"
                        >
                          Hủy
                        </button>
                        <button type="submit" className="btn btn-primary">
                          {isAddingNew ? 'Thêm email' : 'Cập nhật'}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
            </div>
          </div>
      </div>
    </div>
  );
};

export default EmailSettings;
