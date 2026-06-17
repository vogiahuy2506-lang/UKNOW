import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useI18n } from '../../i18n';
import emailSettingsApiService from '../../features/settings/services/emailSettingsApi.service';
import {
  HiOutlinePlus,
  HiOutlineMail,
  HiOutlineTrash,
  HiOutlineCheckCircle,
  HiOutlineXCircle,
  HiOutlineClock,
  HiOutlineRefresh,
  HiOutlineExternalLink,
} from 'react-icons/hi';

const PLATFORM_DOMAIN = import.meta.env.VITE_DEFAULT_FROM_DOMAIN || 'founderai.biz';

const EmailSettings = () => {
  const { t } = useI18n();
  const [emailSettings, setEmailSettings] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedEmail, setSelectedEmail] = useState(null);
  const [isAddingNew, setIsAddingNew] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    replyTo: '',
  });

  // Domain verification state
  const [verificationStatus, setVerificationStatus] = useState(null);
  const [verificationLoading, setVerificationLoading] = useState(false);
  const [dnsRecords, setDnsRecords] = useState(null);

  useEffect(() => {
    fetchEmailSettings();
  }, []);

  useEffect(() => {
    if (selectedEmail) {
      loadVerificationStatus(selectedEmail.id);
    } else {
      setVerificationStatus(null);
      setDnsRecords(null);
    }
  }, [selectedEmail?.id]);

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
  }, [t]);

  useEffect(() => {
    fetchEmailSettings();
  }, [fetchEmailSettings]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Block @gmail.com as from address
    const emailDomain = formData.email.split('@')[1]?.toLowerCase();
    if (emailDomain === 'gmail.com') {
      toast.error('Không thể sử dụng @gmail.com làm địa chỉ gửi. Vui lòng dùng email riêng (VD: hello@' + PLATFORM_DOMAIN + ')');
      return;
    }

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
        replyTo: item?.replyTo || '',
      });
      // Load detail to get verification info
      if (item?.domainVerificationStatus) {
        setVerificationStatus(item.domainVerificationStatus);
        setDnsRecords(item?.domainDnsRecords || null);
      }
    } catch (error) {
      toast.error(t('emailSettings.loadDetailFailed'));
    }
  };

  const handleAddNew = () => {
    setIsAddingNew(true);
    setSelectedEmail(null);
    resetForm();
    setVerificationStatus(null);
    setDnsRecords(null);
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

  const resetForm = () => {
    setFormData({
      name: '',
      email: '',
      replyTo: '',
    });
    setVerificationStatus(null);
    setDnsRecords(null);
  };

  // Domain verification helpers
  const loadVerificationStatus = async (id) => {
    try {
      const response = await emailSettingsApiService.getDomainVerificationStatus(id);
      const data = response.data?.data;
      if (data) {
        setVerificationStatus(data.status);
        if (data.dnsRecords) setDnsRecords(data.dnsRecords);
      }
    } catch {
      // Silently fail — status check is optional
    }
  };

  const handleInitiateVerification = async () => {
    if (!selectedEmail?.id) return;
    setVerificationLoading(true);
    try {
      const response = await emailSettingsApiService.initiateDomainVerification(selectedEmail.id);
      const data = response.data?.data;
      if (data?.success) {
        setDnsRecords(data.dnsRecords || null);
        setVerificationStatus(data.step === 'already_verified' ? 'verified' : 'pending');
        if (data.step === 'manual' || data.step === 'cf_dns_setup') {
          toast.success(data.message);
        } else {
          toast.success(data.message || 'Đã khởi tạo xác thực domain');
        }
        // Refresh to get updated status
        await loadVerificationStatus(selectedEmail.id);
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Khởi tạo xác thực thất bại');
    } finally {
      setVerificationLoading(false);
    }
  };

  const handleCheckStatus = async () => {
    if (!selectedEmail?.id) return;
    setVerificationLoading(true);
    try {
      const response = await emailSettingsApiService.getDomainVerificationStatus(selectedEmail.id);
      const data = response.data?.data;
      if (data) {
        setVerificationStatus(data.status);
        if (data.status === 'verified') {
          toast.success('Domain đã được xác thực thành công!');
        }
      }
    } catch (error) {
      toast.error('Kiểm tra trạng thái thất bại');
    } finally {
      setVerificationLoading(false);
    }
  };

  const emailDomain = formData.email.split('@')[1]?.toLowerCase();
  const isPlatformDomain = emailDomain === PLATFORM_DOMAIN;
  const isGmailDomain = emailDomain === 'gmail.com';
  const needsVerification = emailDomain && !isPlatformDomain && !isGmailDomain;

  const statusBadge = (status) => {
    const configs = {
      verified: { label: 'Đã xác thực', icon: HiOutlineCheckCircle, color: 'text-green-600 bg-green-50 border-green-200' },
      verifying: { label: 'Đang xác thực', icon: HiOutlineClock, color: 'text-yellow-600 bg-yellow-50 border-yellow-200' },
      dns_records_created: { label: 'DNS đã tạo', icon: HiOutlineClock, color: 'text-blue-600 bg-blue-50 border-blue-200' },
      pending: { label: 'Chờ xác thực', icon: HiOutlineClock, color: 'text-gray-600 bg-gray-50 border-gray-200' },
      failed: { label: 'Thất bại', icon: HiOutlineXCircle, color: 'text-red-600 bg-red-50 border-red-200' },
      not_required: { label: 'Không cần xác thực', icon: HiOutlineCheckCircle, color: 'text-green-600 bg-green-50 border-green-200' },
    };
    const config = configs[status] || { label: status || 'Không rõ', icon: HiOutlineClock, color: 'text-gray-600 bg-gray-50 border-gray-200' };
    const Icon = config.icon;
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${config.color}`}>
        <Icon className="w-3 h-3" />
        {config.label}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('emailSettings.title')}</h1>
          <p className="text-sm text-gray-500 mt-1">{t('emailSettings.subtitle')}</p>
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
                          {email.domainVerificationStatus && (
                            <div className="mt-1">
                              {statusBadge(email.domainVerificationStatus)}
                            </div>
                          )}
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
                <div className="max-w-xl mx-auto">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-semibold text-gray-900">
                      {isAddingNew ? t('emailSettings.addNewEmail') : t('emailSettings.editEmail')}
                    </h3>
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

                  <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                      <label className="label">{t('emailSettings.displayName')}</label>
                      <input
                        type="text"
                        value={formData.name}
                        onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                        className="input"
                        placeholder="Ví dụ: Support Team"
                        required
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        {t('emailSettings.displayNameHint')}
                      </p>
                    </div>

                    <div>
                      <label className="label">{t('emailSettings.fromEmail')}</label>
                      <input
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
                        className={`input ${isGmailDomain ? 'border-red-300 focus:border-red-500 focus:ring-red-500' : ''}`}
                        placeholder={`Ví dụ: hello@${PLATFORM_DOMAIN}`}
                        required
                      />
                      {isGmailDomain ? (
                        <p className="text-xs text-red-600 mt-1">
                          Không thể sử dụng @gmail.com làm địa chỉ gửi.
                        </p>
                      ) : needsVerification ? (
                        <p className="text-xs text-yellow-600 mt-1">
                          Email sẽ được gửi từ no-reply@{PLATFORM_DOMAIN}.
                          Nhấn "Xác thực domain" để dùng email riêng.
                        </p>
                      ) : (
                        <p className="text-xs text-gray-500 mt-1">
                          {t('emailSettings.fromEmailHint')}
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="label">Reply-To (tuỳ chọn)</label>
                      <input
                        type="email"
                        value={formData.replyTo}
                        onChange={(e) => setFormData((prev) => ({ ...prev, replyTo: e.target.value }))}
                        className="input"
                        placeholder="Email nhận phản hồi (mặc định = địa chỉ gửi)"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Khi khách hàng nhấn Reply, email sẽ gửi đến địa chỉ này.
                      </p>
                    </div>

                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <p className="text-sm text-blue-800">
                        <strong>Thông báo:</strong> Hệ thống sử dụng SMTP mặc định (SendGrid) để gửi email.
                        Email gửi đi sẽ luôn từ <strong>no-reply@{PLATFORM_DOMAIN}</strong>.
                        Reply-To mặc định là email bạn nhập ở trên.
                      </p>
                    </div>

                    {/* Domain verification section */}
                    {selectedEmail && !isAddingNew && needsVerification && (
                      <div className="border border-gray-200 rounded-lg p-4 space-y-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="text-sm font-semibold text-gray-900">Xác thực Domain</h4>
                            <p className="text-xs text-gray-500 mt-0.5">
                              Dùng domain riêng để email gửi từ @{emailDomain}
                            </p>
                          </div>
                          {verificationStatus && statusBadge(verificationStatus)}
                        </div>

                        {dnsRecords && (
                          <div className="bg-gray-50 rounded-lg p-3 space-y-2 text-xs">
                            <p className="font-medium text-gray-700">DNS Records cần thêm:</p>
                            {dnsRecords.spf && (
                              <div>
                                <span className="font-mono text-gray-500">SPF (TXT): </span>
                                <code className="font-mono text-gray-800 break-all">{dnsRecords.spf}</code>
                              </div>
                            )}
                            {dnsRecords.dkim_cname && (
                              <div>
                                <span className="font-mono text-gray-500">DKIM (CNAME): </span>
                                <code className="font-mono text-gray-800 break-all">{dnsRecords.dkim_cname}</code>
                              </div>
                            )}
                          </div>
                        )}

                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={handleInitiateVerification}
                            disabled={verificationLoading || verificationStatus === 'verifying' || verificationStatus === 'verified'}
                            className="btn btn-primary btn-sm"
                          >
                            {verificationLoading && verificationStatus !== 'verified' ? (
                              <span className="flex items-center gap-1">
                                <span className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin"></span>
                                Đang xử lý...
                              </span>
                            ) : (
                              <span className="flex items-center gap-1">
                                <HiOutlineCheckCircle className="w-4 h-4" />
                                Xác thực domain
                              </span>
                            )}
                          </button>
                          {(verificationStatus === 'pending' || verificationStatus === 'dns_records_created' || verificationStatus === 'verifying') && (
                            <button
                              type="button"
                              onClick={handleCheckStatus}
                              disabled={verificationLoading}
                              className="btn btn-secondary btn-sm"
                            >
                              <HiOutlineRefresh className="w-4 h-4 mr-1" />
                              Kiểm tra
                            </button>
                          )}
                          {dnsRecords && dnsRecords.dns_setup_method === 'manual' && (
                            <a
                              href={`https://app.sendgrid.com/settings/whitelabel`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="btn btn-secondary btn-sm"
                            >
                              <HiOutlineExternalLink className="w-4 h-4 mr-1" />
                              SendGrid
                            </a>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Verified domain info */}
                    {selectedEmail && !isAddingNew && isPlatformDomain && (
                      <div className="border border-green-200 bg-green-50 rounded-lg p-4">
                        <div className="flex items-center gap-2">
                          <HiOutlineCheckCircle className="w-5 h-5 text-green-600" />
                          <span className="text-sm font-medium text-green-800">
                            Email từ @{PLATFORM_DOMAIN} — không cần xác thực thêm
                          </span>
                        </div>
                      </div>
                    )}

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
