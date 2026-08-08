import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  HiOutlineUserCircle,
  HiOutlineX,
  HiOutlineMail,
  HiOutlineChatAlt2,
  HiOutlineCalendar,
  HiOutlineClock,
  HiOutlineCheckCircle,
  HiOutlineBan,
  HiOutlineShieldCheck,
} from 'react-icons/hi';
import { useAuthStore } from '../../../stores/authStore';
import { getMyProfile, updateMyProfile } from '../services/authApi.service';
import { useI18n } from '../../../i18n';
import PlanSection from '../../billing/PlanSection';
import OrderHistoryTab from '../../billing/OrderHistoryTab';

const PROFILE_FORM_INITIAL_STATE = { fullName: '', email: '', phone: '' };

function formatDate(isoString, _t) {
  if (!isoString) return '—';
  return new Date(isoString).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

const PERMISSION_LABELS = {
  manage_campaigns: 'manageCampaigns',
  manage_contacts: 'manageContacts',
  manage_templates: 'manageTemplates',
  manage_channels: 'manageChannels',
  manage_landing_pages: 'manageLandingPages',
  view_analytics: 'viewAnalytics',
};

/** Tab hiển thị quyền hạn và giới hạn gửi khi đang trong employee context */
function EmployeeContextTab({ activeContext, t }) {
  const permissions = activeContext?.permissions || {};
  const grantedPerms = Object.entries(permissions).filter(([, v]) => v);
  const deniedPerms  = Object.entries(permissions).filter(([, v]) => !v);

  const hasEmailLimit = activeContext?.dailyEmailLimit !== null || activeContext?.monthlyEmailLimit !== null;
  const hasZaloLimit  = activeContext?.dailyZaloLimit !== null || activeContext?.monthlyZaloLimit !== null;
  const hasAnyLimit   = hasEmailLimit || hasZaloLimit;

  const getPermLabel = (key) => {
    const labelKey = PERMISSION_LABELS[key];
    return labelKey ? t(`accountProfileModal.${labelKey}`) : key;
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
        <HiOutlineShieldCheck className="w-5 h-5 text-blue-500 shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-blue-800">
            {t('accountProfileModal.workingAt', { name: activeContext?.ownerName })}
          </p>
          <p className="text-xs text-blue-500 mt-0.5">
            {t('accountProfileModal.permissionsGrantedByBusiness')}
          </p>
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">{t('accountProfileModal.grantedPermissions')}</p>
        {grantedPerms.length === 0 ? (
          <p className="text-sm text-gray-400 italic">{t('accountProfileModal.noPermissionsGranted')}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {grantedPerms.map(([key]) => (
              <span
                key={key}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full bg-green-50 text-green-700 border border-green-200"
              >
                <HiOutlineCheckCircle className="w-3.5 h-3.5" />
                {getPermLabel(key)}
              </span>
            ))}
          </div>
        )}
        {deniedPerms.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {deniedPerms.map(([key]) => (
              <span
                key={key}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full bg-gray-50 text-gray-400 border border-gray-200"
              >
                <HiOutlineBan className="w-3.5 h-3.5" />
                {getPermLabel(key)}
              </span>
            ))}
          </div>
        )}
      </div>

      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">{t('accountProfileModal.grantedSendLimits')}</p>
        {!hasAnyLimit ? (
          <p className="text-sm text-gray-400 italic">{t('accountProfileModal.noSendLimits')}</p>
        ) : (
          <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-2">
            {hasEmailLimit && (
              <>
                <div className="flex items-center justify-between py-1">
                  <span className="flex items-center gap-1.5 text-sm text-gray-600">
                    <HiOutlineMail className="w-3.5 h-3.5 text-gray-400" />
                    {t('accountProfileModal.emailPerDayShort')}
                  </span>
                  <span className="text-sm font-semibold text-gray-800 tabular-nums">
                    {activeContext?.dailyEmailLimit === null ? t('accountProfileModal.unlimited') : activeContext.dailyEmailLimit.toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center justify-between py-1">
                  <span className="flex items-center gap-1.5 text-sm text-gray-600">
                    <HiOutlineMail className="w-3.5 h-3.5 text-gray-400" />
                    {t('accountProfileModal.emailPerMonthShort')}
                  </span>
                  <span className="text-sm font-semibold text-gray-800 tabular-nums">
                    {activeContext?.monthlyEmailLimit === null ? t('accountProfileModal.unlimited') : activeContext.monthlyEmailLimit.toLocaleString()}
                  </span>
                </div>
              </>
            )}
            {hasZaloLimit && (
              <>
                <div className="flex items-center justify-between py-1">
                  <span className="flex items-center gap-1.5 text-sm text-gray-600">
                    <HiOutlineChatAlt2 className="w-3.5 h-3.5 text-gray-400" />
                    {t('accountProfileModal.zaloPerDayShort')}
                  </span>
                  <span className="text-sm font-semibold text-gray-800 tabular-nums">
                    {activeContext?.dailyZaloLimit === null ? t('accountProfileModal.unlimited') : activeContext.dailyZaloLimit.toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center justify-between py-1">
                  <span className="flex items-center gap-1.5 text-sm text-gray-600">
                    <HiOutlineChatAlt2 className="w-3.5 h-3.5 text-gray-400" />
                    {t('accountProfileModal.zaloPerMonthShort')}
                  </span>
                  <span className="text-sm font-semibold text-gray-800 tabular-nums">
                    {activeContext?.monthlyZaloLimit === null ? t('accountProfileModal.unlimited') : activeContext.monthlyZaloLimit.toLocaleString()}
                  </span>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const ROLE_LABELS = {
  admin: 'systemAdmin',
  member: 'member',
  employee: 'employee',
  user: 'user',
};

const AccountProfileModal = ({ isOpen, onClose }) => {
  const { t } = useI18n();
  const { user, updateUser, activeContext, fetchAiCredits, syncBillingFromProfile } = useAuthStore();
  const isEmployeeCtx = activeContext?.type === 'employee';

  const TABS = isEmployeeCtx
    ? [
        { key: 'profile', label: t('accountProfileModal.tabProfile') },
        { key: 'permissions', label: t('accountProfileModal.tabPermissions') },
      ]
    : user?.role === 'user'
      ? [
          { key: 'profile', label: t('accountProfileModal.tabProfile') },
          { key: 'orders',  label: t('accountProfileModal.tabOrderHistory') },
        ]
      : [{ key: 'profile', label: t('accountProfileModal.tabProfile') }];

  const [activeTab, setActiveTab] = useState('profile');
  const [formValues, setFormValues] = useState(PROFILE_FORM_INITIAL_STATE);
  const [profileData, setProfileData] = useState(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const isUserAdmin = !isEmployeeCtx && user?.role === 'user';

  const getRoleLabel = (role) => {
    const labelKey = ROLE_LABELS[role];
    return labelKey ? t(`accountProfileModal.${labelKey}`) : t('accountProfileModal.user');
  };

  useEffect(() => {
    setActiveTab('profile');
  }, [isEmployeeCtx]);

  useEffect(() => {
    if (!isOpen) return;

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
        syncBillingFromProfile(nextProfile);
        setFormValues({
          fullName: String(nextProfile.fullName || ''),
          email: String(nextProfile.email || ''),
          phone: String(nextProfile.phone || ''),
        });
      } catch (loadError) {
        if (!isCancelled) {
          setError(loadError?.response?.data?.message || t('accountProfileModal.loadError'));
        }
      } finally {
        if (!isCancelled) setIsLoadingProfile(false);
      }
    };

    loadProfile();
    return () => { isCancelled = true; };
  }, [isOpen, t, syncBillingFromProfile]);

  if (!isOpen) return null;

  const handleClose = () => {
    if (isSaving) return;
    setError('');
    setSuccess('');
    setActiveTab('profile');
    fetchAiCredits?.().catch(() => {});
    onClose();
  };

  const handleInputChange = (fieldName) => (event) => {
    setFormValues((prev) => ({ ...prev, [fieldName]: event.target.value }));
    setError('');
    setSuccess('');
  };

  const buildSubmitPayload = () => {
    const fullName = String(formValues.fullName || '').trim();
    const email = String(formValues.email || '').trim();
    const phone = String(formValues.phone || '').trim();
    return { fullName, email, ...(phone ? { phone } : {}) };
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    const payload = buildSubmitPayload();
    if (!payload.email) { setError(t('accountProfileModal.emailRequired')); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) { setError(t('accountProfileModal.emailInvalid')); return; }
    if (payload.phone && !/^[0-9]{10,11}$/.test(payload.phone)) {
      setError(t('accountProfileModal.phoneInvalid'));
      return;
    }

    try {
      setIsSaving(true);
      const response = await updateMyProfile(payload);
      const updatedProfile = response?.data || null;
      if (!updatedProfile) { setError(t('accountProfileModal.noDataError')); return; }

      setProfileData((prev) => ({ ...prev, ...updatedProfile }));
      setFormValues({
        fullName: String(updatedProfile.fullName || ''),
        email: String(updatedProfile.email || ''),
        phone: String(updatedProfile.phone || ''),
      });
      updateUser({ ...user, ...updatedProfile });
      setSuccess(response?.message || t('accountProfileModal.updateSuccess'));
    } catch (saveError) {
      setError(saveError?.response?.data?.message || t('accountProfileModal.updateError'));
    } finally {
      setIsSaving(false);
    }
  };

  return createPortal(
    <div className="modal-overlay" onClick={handleClose}>
      <div
        className="modal-content modal-content-animate w-full max-w-2xl mx-4 flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0">
          <div className="flex items-center justify-between px-6 py-4">
            <div className="flex items-center gap-2">
              <HiOutlineUserCircle className="w-6 h-6 text-primary-600" />
              <h2 className="text-base font-semibold text-gray-900">{t('accountProfileModal.tabProfile')}</h2>
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            >
              <HiOutlineX className="w-5 h-5" />
            </button>
          </div>
          <div className="flex border-b border-gray-100 px-6 gap-1">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
                  activeTab === tab.key
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {isLoadingProfile ? (
          <div className="py-14 flex justify-center">
            <div className="spinner w-8 h-8" />
          </div>
        ) : activeTab === 'orders' ? (
          <div className="overflow-y-auto px-6 py-5">
            <OrderHistoryTab isUserAdmin={isUserAdmin} t={t} />
          </div>
        ) : activeTab === 'permissions' ? (
          <div className="overflow-y-auto px-6 py-5">
            <EmployeeContextTab activeContext={activeContext} t={t} />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="overflow-y-auto px-6 py-5 space-y-5">
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">{t('accountProfileModal.personalInfo')}</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('accountProfileModal.username')}</label>
                  <input
                    type="text"
                    className="input w-full bg-gray-50 text-gray-500"
                    value={profileData?.username || user?.username || ''}
                    disabled
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('accountProfileModal.role')}</label>
                  <input
                    type="text"
                    className="input w-full bg-gray-50 text-gray-500"
                    value={getRoleLabel(user?.role)}
                    disabled
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('accountProfileModal.fullName')}</label>
                  <input
                    type="text"
                    className="input w-full"
                    value={formValues.fullName}
                    onChange={handleInputChange('fullName')}
                    placeholder={t('accountProfileModal.placeholderFullName')}
                    maxLength={255}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('accountProfileModal.email')}</label>
                  <input
                    type="email"
                    className="input w-full"
                    value={formValues.email}
                    onChange={handleInputChange('email')}
                    placeholder={t('accountProfileModal.placeholderEmail')}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('accountProfileModal.phone')}</label>
                  <input
                    type="text"
                    className="input w-full"
                    value={formValues.phone}
                    onChange={handleInputChange('phone')}
                    placeholder={t('accountProfileModal.placeholderPhone')}
                  />
                </div>
              </div>
            </div>

            {(isUserAdmin || isEmployeeCtx) && (
              <div>
                {isEmployeeCtx && profileData?.activePlanId && (
                  <p className="text-xs text-blue-600 mb-2">
                    {t('accountProfileModal.ownerPlanCreditsHint', {
                      name: activeContext?.ownerName || t('accountProfileModal.businessOwner'),
                    })}
                  </p>
                )}
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">{t('accountProfileModal.currentPlan')}</p>
                <PlanSection data={profileData} t={t} />
              </div>
            )}

            {profileData && (profileData.createdAt || profileData.lastLoginAt) && (
              <div className="flex flex-wrap gap-x-5 gap-y-1 pt-1 border-t border-gray-100">
                {profileData.createdAt && (
                  <span className="flex items-center gap-1.5 text-xs text-gray-400">
                    <HiOutlineCalendar className="w-3.5 h-3.5" />
                    {t('accountProfileModal.createdAt', { date: formatDate(profileData.createdAt, t) })}
                  </span>
                )}
                {profileData.lastLoginAt && (
                  <span className="flex items-center gap-1.5 text-xs text-gray-400">
                    <HiOutlineClock className="w-3.5 h-3.5" />
                    {t('accountProfileModal.lastLogin', { date: formatDate(profileData.lastLoginAt, t) })}
                  </span>
                )}
              </div>
            )}

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
            )}
            {success && (
              <p className="text-sm text-green-700 bg-green-50 border border-green-100 rounded-lg px-3 py-2">{success}</p>
            )}

            <div className="flex justify-end gap-3 pt-1 shrink-0">
              <button type="button" className="btn btn-secondary" onClick={handleClose} disabled={isSaving}>
                {t('accountProfileModal.close')}
              </button>
              <button type="submit" className="btn btn-primary" disabled={isSaving}>
                {isSaving ? t('accountProfileModal.saving') : t('accountProfileModal.save')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body,
  );
};

export default AccountProfileModal;
