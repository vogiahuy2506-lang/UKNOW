import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { useI18n } from '../../i18n';
import emailSettingsApiService from '../../features/settings/services/emailSettingsApi.service';
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
  const { t } = useI18n();
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
      if (!error._upgradeToastShown) {
        toast.error(error.response?.data?.message || t('emailSettings.error'));
      }
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
        email: item?.email || email.email,
        smtpHost: item?.smtpHost || email.smtpHost,
        smtpPort: String(item?.smtpPort ?? email.smtpPort ?? '587'),
        smtpUsername: item?.smtpUsername || '',
        smtpPassword: '',
        useTls: item?.useTls ?? email.useTls ?? true,
      });
    } catch (error) {
      toast.error(t('emailSettings.loadDetailFailed'));
    }
  };

  const handleAddNew = () => {
    setIsAddingNew(true);
    setSelectedEmail(null);
    resetForm(true);
  };

  const handleDelete = async (id) => {
    if (!confirm(t('emailSettings.confirmDelete'))) return;
    try {
      await emailSettingsApiService.deleteEmailSetting(id);
      toast.success(t('emailSettings.deleted'));
      fetchEmailSettings();
    } catch (error) {
      toast.error(t('emailSettings.deleteFailed'));
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
          <h1 className="text-2xl font-bold text-gray-900">{t('emailSettings.title')}</h1>
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
                  {t('emailSettings.addNewEmail')}
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
                    <p className="text-sm">{t('emailSettings.noEmails')}</p>
                    <p className="text-xs mt-1">{t('emailSettings.addEmailToStart')}</p>
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
                              {t('emailSettings.createdBy')}: {email?.createdBy?.name || email?.creatorName || t('emailSettings.unknown')}
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
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                      {t('emailSettings.selectEmailToView')}
                    </h3>
                    <p className="text-sm text-gray-500 max-w-md">
                      {t('emailSettings.selectEmailToEditTip')}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="p-8">
                  <div className="max-w-3xl">
                    <div className="flex items-center justify-between mb-6">
                      <h3 className="text-lg font-semibold text-gray-900">
                        {isAddingNew ? t('emailSettings.addNewEmail') : t('emailSettings.editEmail')}
                      </h3>
                      <div className="flex items-center space-x-2">
                        <button
                          type="button"
                          onClick={() => setFormData((prev) => applySendGridDefaults(prev))}
                          className="btn btn-secondary"
                        >
                          {t('emailSettings.useSendGridDefault')}
                        </button>
                        {selectedEmail && !isAddingNew && (
                          <button
                            onClick={() => handleDelete(selectedEmail.id)}
                            className="p-2 rounded-lg hover:bg-red-50 text-gray-500 hover:text-red-600"
                            title={t('emailSettings.delete')}
                          >
                            <HiOutlineTrash className="w-5 h-5" />
                          </button>
                        )}
                      </div>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-6">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="label">{t('emailSettings.displayName')}</label>
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
                          placeholder={t('emailSettings.displayNamePlaceholder')}
                          required
                          />
                        </div>
                        <div>
                          <label className="label">{t('emailSettings.fromEmail')}</label>
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
                            placeholder={t('emailSettings.fromEmailPlaceholder')}
                            required
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="label">{t('emailSettings.smtpHost')}</label>
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
                            placeholder={t('emailSettings.smtpHostPlaceholder')}
                            required
                          />
                        </div>
                        <div>
                          <label className="label">{t('emailSettings.smtpPort')}</label>
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
                            placeholder={t('emailSettings.smtpPortPlaceholder')}
                            required
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="label">{t('emailSettings.smtpUsername')}</label>
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
                            placeholder={t('emailSettings.smtpUsernamePlaceholder')}
                            required
                          />
                        </div>
                        <div>
                          <label className="label">{t('emailSettings.smtpPassword')}</label>
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
                            placeholder={t('emailSettings.smtpPasswordPlaceholder')}
                            autoComplete="new-password"
                            spellCheck={false}
                            required
                          />
                          <p className="text-xs text-gray-500 mt-1">
                            {t('emailSettings.smtpPasswordRequired')}
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            {t('emailSettings.smtpPasswordSendGridHint')}
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
                          {t('emailSettings.useTlsSsl')}
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
                          {t('common.cancel')}
                        </button>
                        <button type="submit" className="btn btn-primary">
                          {isAddingNew ? t('emailSettings.addEmail') : t('common.save')}
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
