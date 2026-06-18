import { useEffect, useMemo, useState } from 'react';
import {
  HiOutlineUserCircle,
  HiOutlineX,
  HiOutlineBadgeCheck,
  HiOutlineMail,
  HiOutlineChatAlt2,
  HiOutlineCalendar,
  HiOutlineClock,
  HiOutlineTag,
  HiOutlineExclamation,
  HiOutlineClipboardList,
  HiOutlineCheckCircle,
  HiOutlineBan,
  HiOutlineShieldCheck,
  HiOutlineSparkles,
} from 'react-icons/hi';
import { useAuthStore } from '../../../stores/authStore';
import { getMyProfile, updateMyProfile, getMyOrders } from '../services/authApi.service';
import { useI18n } from '../../../i18n';

const PROFILE_FORM_INITIAL_STATE = { fullName: '', email: '', phone: '' };

function formatDate(isoString, _t) {
  if (!isoString) return '—';
  return new Date(isoString).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatPrice(price, t) {
  if (price === null || price === undefined) return t('accountProfileModal.contactForPrice');
  if (price === 0) return t('accountProfileModal.free');
  return `${Number(price).toLocaleString('vi-VN')} ₫`;
}

/** Single usage row with a progress bar. */
function UsageBar({ icon: Icon, label, used, limit, t }) {
  if (limit === null || limit === undefined) {
    return (
      <div className="flex items-center justify-between py-1">
        <span className="flex items-center gap-1.5 text-sm text-gray-600">
          {Icon && <Icon className="w-3.5 h-3.5 text-gray-400" />}
          {label}
        </span>
        <span className="text-xs font-medium text-gray-400">
          {used > 0
            ? `${used.toLocaleString()} · ${t('accountProfileModal.unlimited')}`
            : t('accountProfileModal.unlimited')}
        </span>
      </div>
    );
  }

  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const isDanger = pct >= 95;
  const isWarning = pct >= 80;
  const barColor = isDanger ? 'bg-red-500' : isWarning ? 'bg-orange-400' : 'bg-primary-500';
  const textColor = isDanger ? 'text-red-600' : isWarning ? 'text-orange-500' : 'text-gray-700';

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="flex items-center gap-1.5 text-sm text-gray-600">
          {Icon && <Icon className="w-3.5 h-3.5 text-gray-400" />}
          {label}
        </span>
        <span className={`text-xs font-semibold tabular-nums ${textColor}`}>
          {used.toLocaleString()} / {limit.toLocaleString()}
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-300 ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** Plan + usage section shown for user_admin. */
function PlanSection({ data, t }) {
  const hasPlan = !!data?.activePlanId;
  const planLabel = data?.activePlanName || data?.activePlanCode || (hasPlan ? `#${data.activePlanId}` : '');

  const features = useMemo(() => {
    if (!data?.activePlanFeatures) return [];
    try {
      return Array.isArray(data.activePlanFeatures)
        ? data.activePlanFeatures
        : JSON.parse(data.activePlanFeatures);
    } catch {
      return [];
    }
  }, [data?.activePlanFeatures]);

  if (!hasPlan) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-4 text-center">
        <HiOutlineTag className="w-6 h-6 text-gray-300 mx-auto mb-1" />
        <p className="text-sm text-gray-500">{t('accountProfileModal.noPlanAssigned')}</p>
        <p className="text-xs text-gray-400 mt-0.5">{t('accountProfileModal.contactAdmin')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Plan name + price */}
      <div className="flex items-start justify-between gap-3 rounded-xl border border-primary-100 bg-primary-50 px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-2.5 py-0.5 text-xs font-bold bg-primary-500 text-white rounded-full">
              {planLabel}
            </span>
            {data.activePlanCode && (
              <span className="text-xs text-primary-600 font-mono">{data.activePlanCode}</span>
            )}
          </div>
          <p className="text-lg font-bold text-gray-900 mt-1">{formatPrice(data.activePlanPrice, t)}</p>
          {data.activePlanPrice > 0 && (
            <p className="text-xs text-gray-400">{t('accountProfileModal.perMonth')}</p>
          )}
        </div>
        {data.planMaxEmployees !== null && (
          <div className="text-right shrink-0">
            <p className="text-xs text-gray-500">{t('accountProfileModal.maxEmployees')}</p>
            <p className="text-sm font-bold text-gray-800">
              {data.planMaxEmployees === -1 ? t('accountProfileModal.unlimited') : t('accountProfileModal.people', { count: data.planMaxEmployees })}
            </p>
          </div>
        )}
      </div>

      {/* Expiry date */}
      {data.subscriptionExpiresAt && (() => {
        const expiresAt = new Date(data.subscriptionExpiresAt);
        const daysLeft = Math.ceil((expiresAt - Date.now()) / 86400000);
        const isWarning = daysLeft <= 7;
        const isDanger = daysLeft <= 3;
        return (
          <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
            isDanger ? 'bg-red-50 border border-red-200 text-red-700'
            : isWarning ? 'bg-amber-50 border border-amber-200 text-amber-700'
            : 'bg-gray-50 border border-gray-200 text-gray-600'
          }`}>
            {isWarning
              ? <HiOutlineExclamation className="w-4 h-4 shrink-0" />
              : <HiOutlineClock className="w-4 h-4 shrink-0" />
            }
            <span>
              {t('accountProfileModal.expiresOn', { date: expiresAt.toLocaleDateString('vi-VN') })}
              {isWarning && <span className="ml-1 font-semibold">{t('accountProfileModal.daysLeft', { days: daysLeft })}</span>}
            </span>
          </div>
        );
      })()}

      {/* Features */}
      {features.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {features.map((feat, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded-full"
            >
              <HiOutlineBadgeCheck className="w-3 h-3 text-green-500" />
              {feat}
            </span>
          ))}
        </div>
      )}

      {/* Usage bars — always show when user has a plan; each row handles null limit as unlimited */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('accountProfileModal.sendLimits')}</p>
        <UsageBar
          icon={HiOutlineMail}
          label={t('accountProfileModal.emailToday')}
          used={data.emailSentToday}
          limit={data.dailyEmailLimit}
          t={t}
        />
        <UsageBar
          icon={HiOutlineMail}
          label={t('accountProfileModal.emailThisMonth')}
          used={data.emailSentMonth}
          limit={data.monthlyEmailLimit}
          t={t}
        />
        <UsageBar
          icon={HiOutlineChatAlt2}
          label={t('accountProfileModal.zaloToday')}
          used={data.zaloSentToday}
          limit={data.dailyZaloLimit}
          t={t}
        />
        <UsageBar
          icon={HiOutlineChatAlt2}
          label={t('accountProfileModal.zaloThisMonth')}
          used={data.zaloSentMonth}
          limit={data.monthlyZaloLimit}
          t={t}
        />
        <UsageBar
          icon={HiOutlineSparkles}
          label={t('accountProfileModal.aiTokens')}
          used={data.aiTokensUsed || 0}
          limit={data.aiTokensPerPeriod}
          t={t}
        />
      </div>
    </div>
  );
}

const PERMISSION_LABELS = {
  manage_campaigns: 'manageCampaigns',
  manage_contacts: 'manageContacts',
  manage_templates: 'manageTemplates',
  manage_channels: 'manageChannels',
  manage_landing_pages: 'manageLandingPages',
  view_analytics: 'viewAnalytics',
};

const STATUS_MAP = (t) => ({
  success:   { label: t('accountProfileModal.success'), cls: 'text-green-600 bg-green-50 border-green-200', icon: HiOutlineCheckCircle },
  pending:   { label: t('accountProfileModal.pending'), cls: 'text-amber-600 bg-amber-50 border-amber-200', icon: HiOutlineClock },
  cancelled: { label: t('accountProfileModal.cancelled'), cls: 'text-gray-400 bg-gray-50 border-gray-200', icon: HiOutlineBan },
});

function OrderHistoryTab({ isUserAdmin, t }) {
  const [orders, setOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!isUserAdmin) { setIsLoading(false); return; }
    getMyOrders()
      .then((res) => setOrders(res.data || []))
      .catch(() => setOrders([]))
      .finally(() => setIsLoading(false));
  }, [isUserAdmin]);

  if (!isUserAdmin) {
    return (
      <div className="py-12 text-center text-gray-400 text-sm">
        {t('accountProfileModal.ordersFeatureOnlyForMembers')}
      </div>
    );
  }

  if (isLoading) {
    return <div className="py-10 flex justify-center"><div className="spinner w-7 h-7" /></div>;
  }

  if (orders.length === 0) {
    return (
      <div className="py-12 text-center">
        <HiOutlineClipboardList className="w-10 h-10 text-gray-200 mx-auto mb-2" />
        <p className="text-sm text-gray-400">{t('accountProfileModal.noOrdersYet')}</p>
      </div>
    );
  }

  const statusMap = STATUS_MAP(t);

  return (
    <div className="space-y-3">
      {orders.map((order) => {
        const st = statusMap[order.status] || statusMap.pending;
        const Icon = st.icon;
        return (
          <div key={order.id} className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">
                  {order.plan?.name || t('accountProfileModal.unknownPlan')}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {t('accountProfileModal.orderCode')} <span className="font-mono">{order.orderCode}</span>
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-bold text-primary-600">
                  {order.amount > 0 ? `${Number(order.amount).toLocaleString('vi-VN')} ₫` : t('accountProfileModal.free')}
                </p>
                <span className={`inline-flex items-center gap-1 mt-1 px-2 py-0.5 text-xs font-medium rounded-full border ${st.cls}`}>
                  <Icon className="w-3 h-3" />
                  {st.label}
                </span>
              </div>
            </div>
            {order.plan && (
              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 mt-3 text-xs text-gray-500">
                <span>{t('accountProfileModal.emailPerDay')} <strong className="text-gray-700">{order.plan.dailyEmailLimit ?? t('accountProfileModal.unlimitedShort')}</strong></span>
                <span>{t('accountProfileModal.emailPerMonth')} <strong className="text-gray-700">{order.plan.monthlyEmailLimit ?? t('accountProfileModal.unlimitedShort')}</strong></span>
                <span>{t('accountProfileModal.zaloPerDay')} <strong className="text-gray-700">{order.plan.dailyZaloLimit ?? t('accountProfileModal.unlimitedShort')}</strong></span>
                <span>{t('accountProfileModal.zaloPerMonth')} <strong className="text-gray-700">{order.plan.monthlyZaloLimit ?? t('accountProfileModal.unlimitedShort')}</strong></span>
              </div>
            )}
            <p className="text-xs text-gray-400 mt-2">
              {new Date(order.createdAt).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
        );
      })}
    </div>
  );
}

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
      {/* Context banner */}
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

      {/* Permissions */}
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

      {/* Send limits */}
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
  const { user, updateUser, activeContext } = useAuthStore();
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

  // Reset tab khi context thay đổi (employee ↔ self) để tránh tab không tồn tại
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
  }, [isOpen, t]);

  if (!isOpen) return null;

  const handleClose = () => {
    if (isSaving) return;
    setError('');
    setSuccess('');
    setActiveTab('profile');
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

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div
        className="modal-content modal-content-animate w-full max-w-2xl mx-4 flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
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
          {/* Tab bar */}
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

            {/* Personal info */}
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

            {/* Plan & usage — only in self context */}
            {isUserAdmin && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">{t('accountProfileModal.currentPlan')}</p>
                <PlanSection data={profileData} t={t} />
              </div>
            )}

            {/* Account stats */}
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
    </div>
  );
};

export default AccountProfileModal;
