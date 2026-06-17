import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useI18n } from '../../i18n';
import emailSettingsApiService from '../../features/settings/services/emailSettingsApi.service';
import {
  HiOutlinePlus,
  HiOutlineMail,
  HiOutlineTrash,
  HiOutlineCheckCircle,
  HiOutlineClock,
  HiOutlineRefresh,
  HiOutlineUser,
  HiOutlineReply,
  HiOutlinePaperAirplane,
  HiOutlineSparkles,
} from 'react-icons/hi';

const PLATFORM_DOMAIN = import.meta.env.VITE_DEFAULT_FROM_DOMAIN || 'digiso.vn';

const EmailSettings = () => {
  const { t } = useI18n();
  const [emailSettings, setEmailSettings] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedEmail, setSelectedEmail] = useState(null);
  const [isAddingNew, setIsAddingNew] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    replyTo: '',
  });

  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(null);

  useEffect(() => {
    fetchEmailSettings();
  }, []);

  const fetchEmailSettings = async () => {
    try {
      const response = await emailSettingsApiService.listEmailSettings();
      const items = response.data?.data?.items;
      setEmailSettings(Array.isArray(items) ? items : []);
    } catch (error) {
      setEmailSettings([]);
      toast.error(t('emailSettings.loadFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validate required fields
    if (!formData.name?.trim()) {
      toast.error('Vui lòng nhập tên người gửi');
      return;
    }
    if (!formData.replyTo?.trim()) {
      toast.error('Vui lòng nhập email Reply-To');
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.replyTo)) {
      toast.error('Email Reply-To không hợp lệ');
      return;
    }

    setIsSaving(true);
    try {
      if (selectedEmail && !isAddingNew) {
        await emailSettingsApiService.updateEmailSetting(selectedEmail.id, formData);
        toast.success(t('emailSettings.updateSuccess'));
      } else {
        await emailSettingsApiService.createEmailSetting(formData);
        toast.success(t('emailSettings.addSuccess'));
      }
      fetchEmailSettings();
      setIsAddingNew(false);
      setSelectedEmail(null);
      resetForm();
    } catch (error) {
      toast.error(error.response?.data?.message || t('emailSettings.error'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleSelectEmail = async (email) => {
    try {
      setIsAddingNew(false);
      const response = await emailSettingsApiService.getEmailSetting(email.id);
      const item = response.data?.data;
      setSelectedEmail(email);
      setFormData({
        name: item?.name || email.name,
        replyTo: item?.replyTo || '',
      });
    } catch (error) {
      toast.error(t('emailSettings.loadDetailFailed'));
    }
  };

  const handleAddNew = () => {
    setIsAddingNew(true);
    setSelectedEmail(null);
    resetForm();
  };

  const handleDelete = async (id) => {
    if (!confirm(t('emailSettings.confirmDelete'))) return;
    setIsDeleting(id);
    try {
      await emailSettingsApiService.deleteEmailSetting(id);
      toast.success(t('emailSettings.deleted'));
      if (selectedEmail?.id === id) {
        setSelectedEmail(null);
        resetForm();
      }
      fetchEmailSettings();
    } catch (error) {
      toast.error(t('emailSettings.deleteFailed'));
    } finally {
      setIsDeleting(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      replyTo: '',
    });
  };

  const statusBadge = (status) => {
    const configs = {
      verified: { label: 'Đã xác thực', icon: HiOutlineCheckCircle, color: 'text-green-600 bg-green-50 border-green-200' },
      verifying: { label: 'Đang xác thực', icon: HiOutlineClock, color: 'text-yellow-600 bg-yellow-50 border-yellow-200' },
      pending: { label: 'Chờ xác thực', icon: HiOutlineClock, color: 'text-gray-600 bg-gray-50 border-gray-200' },
    };
    const config = configs[status] || { label: 'Đã xác thực', icon: HiOutlineCheckCircle, color: 'text-green-600 bg-green-50 border-green-200' };
    const Icon = config.icon;
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${config.color}`}>
        <Icon className="w-3 h-3" />
        {config.label}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('emailSettings.title')}</h1>
          <p className="text-sm text-gray-500 mt-1">{t('emailSettings.subtitle')}</p>
        </div>
        <button
          onClick={handleAddNew}
          className="btn btn-primary flex items-center gap-2"
        >
          <HiOutlinePlus className="w-4 h-4" />
          {t('emailSettings.addNewEmail')}
        </button>
      </div>

      {/* Info Banner */}
      <div className="bg-gradient-to-r from-violet-50 to-indigo-50 border border-violet-100 rounded-xl p-5">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0">
            <HiOutlinePaperAirplane className="w-5 h-5 text-violet-600" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 mb-1">Email gửi đi từ nền tảng</h3>
            <div className="text-sm text-gray-600 space-y-1">
              <p>
                <span className="font-medium text-violet-700">From:</span>{' '}
                <code className="bg-white/70 px-1.5 py-0.5 rounded text-violet-800 font-mono text-xs">
                  no-reply@{PLATFORM_DOMAIN}
                </code>
              </p>
              <p className="text-xs text-gray-500">
                Email gửi đi cố định. Bạn có thể tùy chỉnh <strong>tên người gửi</strong> và <strong>email Reply-To</strong> bên dưới.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left - Email List */}
        <div className="lg:col-span-1">
          <div className="card">
            <div className="p-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <HiOutlineMail className="w-4 h-4 text-gray-400" />
                Danh sách email
              </h3>
            </div>
            
            <div className="max-h-[500px] overflow-y-auto">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="spinner w-8 h-8"></div>
                </div>
              ) : emailSettings.length === 0 ? (
                <div className="p-8 text-center">
                  <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
                    <HiOutlineMail className="w-8 h-8 text-gray-300" />
                  </div>
                  <p className="text-sm text-gray-500 font-medium">{t('emailSettings.noEmails')}</p>
                  <p className="text-xs text-gray-400 mt-1">{t('emailSettings.addEmailToStart')}</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {emailSettings.map((email) => (
                    <div
                      key={email.id}
                      onClick={() => handleSelectEmail(email)}
                      className={`p-4 cursor-pointer hover:bg-gray-50 transition-all ${
                        selectedEmail?.id === email.id && !isAddingNew
                          ? 'bg-primary-50/50 border-l-4 border-primary-600'
                          : 'border-l-4 border-transparent'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3 min-w-0">
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                            selectedEmail?.id === email.id && !isAddingNew
                              ? 'bg-primary-100'
                              : 'bg-gray-100'
                          }`}>
                            <HiOutlineUser className={`w-4 h-4 ${
                              selectedEmail?.id === email.id && !isAddingNew
                                ? 'text-primary-600'
                                : 'text-gray-400'
                            }`} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-gray-900 truncate">
                              {email.name || 'Chưa có tên'}
                            </p>
                            <p className="text-xs text-gray-500 truncate flex items-center gap-1 mt-0.5">
                              <HiOutlineReply className="w-3 h-3" />
                              {email.replyTo || 'Chưa có Reply-To'}
                            </p>
                            {email.domainVerificationStatus && (
                              <div className="mt-1.5">
                                {statusBadge(email.domainVerificationStatus)}
                              </div>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(email.id);
                          }}
                          disabled={isDeleting === email.id}
                          className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors opacity-0 group-hover:opacity-100"
                          title={t('emailSettings.delete')}
                        >
                          {isDeleting === email.id ? (
                            <span className="w-4 h-4 border border-red-300 border-t-transparent rounded-full animate-spin"></span>
                          ) : (
                            <HiOutlineTrash className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right - Email Form */}
        <div className="lg:col-span-2">
          <div className="card">
            {!selectedEmail && !isAddingNew ? (
              <div className="flex flex-col items-center justify-center py-20 px-8">
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-violet-100 to-indigo-100 flex items-center justify-center mb-6">
                  <HiOutlineSparkles className="w-10 h-10 text-violet-400" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2 text-center">
                  {t('emailSettings.selectEmailToView')}
                </h3>
                <p className="text-sm text-gray-500 text-center max-w-md">
                  {t('emailSettings.selectEmailToEditTip')}
                </p>
              </div>
            ) : (
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                    <span className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center">
                      {isAddingNew ? (
                        <HiOutlinePlus className="w-4 h-4 text-primary-600" />
                      ) : (
                        <HiOutlineUser className="w-4 h-4 text-primary-600" />
                      )}
                    </span>
                    {isAddingNew ? t('emailSettings.addNewEmail') : t('emailSettings.editEmail')}
                  </h3>
                  {selectedEmail && !isAddingNew && (
                    <button
                      onClick={() => handleDelete(selectedEmail.id)}
                      disabled={isDeleting === selectedEmail.id}
                      className="p-2 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors"
                      title={t('emailSettings.delete')}
                    >
                      {isDeleting === selectedEmail.id ? (
                        <span className="w-5 h-5 border-2 border-red-300 border-t-transparent rounded-full animate-spin"></span>
                      ) : (
                        <HiOutlineTrash className="w-5 h-5" />
                      )}
                    </button>
                  )}
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                  {/* Sender Name */}
                  <div className="space-y-2">
                    <label className="label flex items-center gap-2">
                      <HiOutlineUser className="w-4 h-4 text-gray-400" />
                      {t('emailSettings.displayName')}
                      <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                      className="input"
                      placeholder="Ví dụ: UEF University, Support Team"
                      required
                    />
                    <p className="text-xs text-gray-500 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-violet-400"></span>
                      Tên này sẽ hiển thị trong hộp thư người nhận
                    </p>
                  </div>

                  {/* Reply-To Email */}
                  <div className="space-y-2">
                    <label className="label flex items-center gap-2">
                      <HiOutlineReply className="w-4 h-4 text-gray-400" />
                      Email Reply-To
                      <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="email"
                      value={formData.replyTo}
                      onChange={(e) => setFormData((prev) => ({ ...prev, replyTo: e.target.value }))}
                      className="input"
                      placeholder="Ví dụ: hello@uef.edu.vn, support@gmail.com"
                      required
                    />
                    <p className="text-xs text-gray-500 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-400"></span>
                      Khi khách hàng nhấn Reply, email sẽ gửi đến địa chỉ này
                    </p>
                  </div>

                  {/* Preview Card */}
                  <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-5 border border-gray-200">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">
                      Xem trước email
                    </p>
                    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center text-white font-semibold text-sm">
                          {(formData.name || 'A').charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900 text-sm">
                            {formData.name || 'Tên người gửi'}
                          </p>
                          <p className="text-xs text-gray-500">
                            no-reply@{PLATFORM_DOMAIN}
                          </p>
                        </div>
                      </div>
                      <p className="text-xs text-gray-500">
                        Reply-To: <span className="text-violet-600">{formData.replyTo || 'email@domain.com'}</span>
                      </p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedEmail(null);
                        setIsAddingNew(false);
                        resetForm();
                      }}
                      className="btn btn-secondary"
                    >
                      {t('common.cancel')}
                    </button>
                    <button
                      type="submit"
                      disabled={isSaving}
                      className="btn btn-primary flex items-center gap-2"
                    >
                      {isSaving ? (
                        <>
                          <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                          Đang lưu...
                        </>
                      ) : (
                        <>
                          <HiOutlineCheckCircle className="w-4 h-4" />
                          {isAddingNew ? t('emailSettings.addEmail') : t('common.save')}
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default EmailSettings;
