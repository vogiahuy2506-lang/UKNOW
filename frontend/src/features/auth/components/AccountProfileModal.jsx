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
} from 'react-icons/hi';
import { useAuthStore } from '../../../stores/authStore';
import { getMyProfile, updateMyProfile, getMyOrders } from '../services/authApi.service';

const ROLE_LABELS = {
  super_admin: 'Quản trị hệ thống',
  user_admin: 'Thành viên',
  employee: 'Nhân viên',
};

const EMPLOYEE_LIMIT_ITEMS = [
  { key: 'maxCampaigns', label: 'Chiến dịch tối đa' },
  { key: 'maxZaloAccounts', label: 'Tài khoản Zalo tối đa' },
  { key: 'maxEmailAccounts', label: 'Tài khoản Email tối đa' },
  { key: 'maxEmailTemplates', label: 'Email template tối đa' },
  { key: 'maxZaloTemplates', label: 'Zalo template tối đa' },
];

const PROFILE_FORM_INITIAL_STATE = { fullName: '', email: '', phone: '' };

function formatDate(isoString) {
  if (!isoString) return '—';
  return new Date(isoString).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatPrice(price) {
  if (price === null || price === undefined) return 'Liên hệ';
  if (price === 0) return 'Miễn phí';
  return `${Number(price).toLocaleString('vi-VN')} ₫`;
}

/** Single usage row with a progress bar. */
function UsageBar({ icon: Icon, label, used, limit }) {
  if (limit === null || limit === undefined) {
    return (
      <div className="flex items-center justify-between py-1">
        <span className="flex items-center gap-1.5 text-sm text-gray-600">
          {Icon && <Icon className="w-3.5 h-3.5 text-gray-400" />}
          {label}
        </span>
        <span className="text-xs font-medium text-gray-400">Không giới hạn</span>
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
function PlanSection({ data }) {
  const hasPlan = !!data?.activePlanId;
  const hasLimits =
    data?.dailyEmailLimit !== null ||
    data?.monthlyEmailLimit !== null ||
    data?.dailyZaloLimit !== null ||
    data?.monthlyZaloLimit !== null;

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
        <p className="text-sm text-gray-500">Tài khoản chưa được gán gói dịch vụ</p>
        <p className="text-xs text-gray-400 mt-0.5">Liên hệ quản trị viên để được hỗ trợ</p>
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
              {data.activePlanName}
            </span>
            {data.activePlanCode && (
              <span className="text-xs text-primary-600 font-mono">{data.activePlanCode}</span>
            )}
          </div>
          <p className="text-lg font-bold text-gray-900 mt-1">{formatPrice(data.activePlanPrice)}</p>
          {data.activePlanPrice > 0 && (
            <p className="text-xs text-gray-400">/tháng</p>
          )}
        </div>
        {data.planMaxEmployees !== null && (
          <div className="text-right shrink-0">
            <p className="text-xs text-gray-500">Nhân viên tối đa</p>
            <p className="text-sm font-bold text-gray-800">{data.planMaxEmployees} người</p>
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
              Hết hạn ngày <strong>{expiresAt.toLocaleDateString('vi-VN')}</strong>
              {isWarning && <span className="ml-1 font-semibold">— còn {daysLeft} ngày</span>}
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

      {/* Usage bars */}
      {hasLimits && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Giới hạn gửi tin</p>
          <UsageBar
            icon={HiOutlineMail}
            label="Email hôm nay"
            used={data.emailSentToday}
            limit={data.dailyEmailLimit}
          />
          <UsageBar
            icon={HiOutlineMail}
            label="Email tháng này"
            used={data.emailSentMonth}
            limit={data.monthlyEmailLimit}
          />
          <UsageBar
            icon={HiOutlineChatAlt2}
            label="Zalo hôm nay"
            used={data.zaloSentToday}
            limit={data.dailyZaloLimit}
          />
          <UsageBar
            icon={HiOutlineChatAlt2}
            label="Zalo tháng này"
            used={data.zaloSentMonth}
            limit={data.monthlyZaloLimit}
          />
        </div>
      )}
    </div>
  );
}

const STATUS_MAP = {
  success:   { label: 'Thành công', cls: 'text-green-600 bg-green-50 border-green-200', icon: HiOutlineCheckCircle },
  pending:   { label: 'Chờ thanh toán', cls: 'text-amber-600 bg-amber-50 border-amber-200', icon: HiOutlineClock },
  cancelled: { label: 'Đã hủy', cls: 'text-gray-400 bg-gray-50 border-gray-200', icon: HiOutlineBan },
};

function OrderHistoryTab({ isUserAdmin }) {
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
        Tính năng này chỉ dành cho tài khoản thành viên.
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
        <p className="text-sm text-gray-400">Chưa có đơn mua gói nào.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {orders.map((order) => {
        const st = STATUS_MAP[order.status] || STATUS_MAP.pending;
        const Icon = st.icon;
        return (
          <div key={order.id} className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">
                  {order.plan?.name || 'Gói không xác định'}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Mã đơn: <span className="font-mono">{order.orderCode}</span>
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-bold text-primary-600">
                  {order.amount > 0 ? `${Number(order.amount).toLocaleString('vi-VN')} ₫` : 'Miễn phí'}
                </p>
                <span className={`inline-flex items-center gap-1 mt-1 px-2 py-0.5 text-xs font-medium rounded-full border ${st.cls}`}>
                  <Icon className="w-3 h-3" />
                  {st.label}
                </span>
              </div>
            </div>
            {order.plan && (
              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 mt-3 text-xs text-gray-500">
                <span>Email/ngày: <strong className="text-gray-700">{order.plan.dailyEmailLimit ?? 'KGH'}</strong></span>
                <span>Email/tháng: <strong className="text-gray-700">{order.plan.monthlyEmailLimit ?? 'KGH'}</strong></span>
                <span>Zalo/ngày: <strong className="text-gray-700">{order.plan.dailyZaloLimit ?? 'KGH'}</strong></span>
                <span>Zalo/tháng: <strong className="text-gray-700">{order.plan.monthlyZaloLimit ?? 'KGH'}</strong></span>
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

const TABS = [
  { key: 'profile', label: 'Hồ sơ' },
  { key: 'orders',  label: 'Lịch sử gói' },
];

const AccountProfileModal = ({ isOpen, onClose }) => {
  const { user, updateUser } = useAuthStore();
  const [activeTab, setActiveTab] = useState('profile');
  const [formValues, setFormValues] = useState(PROFILE_FORM_INITIAL_STATE);
  const [profileData, setProfileData] = useState(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Always use authStore role for permission checks — it comes from the JWT and is always correct.
  // profileData.role may lag or default incorrectly when the roles table JOIN returns null.
  const role = user?.role;
  const isEmployee = role === 'employee';
  const isUserAdmin = role === 'user_admin';

  const employeeLimits = useMemo(
    () => EMPLOYEE_LIMIT_ITEMS.map((item) => ({ ...item, value: profileData?.[item.key] ?? null })),
    [profileData]
  );

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
          setError(loadError?.response?.data?.message || 'Không thể tải thông tin tài khoản');
        }
      } finally {
        if (!isCancelled) setIsLoadingProfile(false);
      }
    };

    loadProfile();
    return () => { isCancelled = true; };
  }, [isOpen]);

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
    if (!payload.email) { setError('Email không được để trống.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) { setError('Email không hợp lệ.'); return; }
    if (payload.phone && !/^[0-9]{10,11}$/.test(payload.phone)) {
      setError('Số điện thoại phải gồm 10-11 chữ số.');
      return;
    }

    try {
      setIsSaving(true);
      const response = await updateMyProfile(payload);
      const updatedProfile = response?.data || null;
      if (!updatedProfile) { setError('Không nhận được dữ liệu cập nhật. Vui lòng thử lại.'); return; }

      setProfileData((prev) => ({ ...prev, ...updatedProfile }));
      setFormValues({
        fullName: String(updatedProfile.fullName || ''),
        email: String(updatedProfile.email || ''),
        phone: String(updatedProfile.phone || ''),
      });
      updateUser({ ...user, ...updatedProfile });
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
        className="modal-content modal-content-animate w-full max-w-2xl mx-4 flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="shrink-0">
          <div className="flex items-center justify-between px-6 py-4">
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
          {/* Tab bar */}
          <div className="flex border-b border-gray-100 px-6 gap-1">
            {TABS.filter((tab) => !((isEmployee || role === 'super_admin') && tab.key === 'orders')).map((tab) => (
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
            <OrderHistoryTab isUserAdmin={isUserAdmin} />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="overflow-y-auto px-6 py-5 space-y-5">

            {/* Personal info */}
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Thông tin cá nhân</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tên đăng nhập</label>
                  <input
                    type="text"
                    className="input w-full bg-gray-50 text-gray-500"
                    value={profileData?.username || user?.username || ''}
                    disabled
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Vai trò</label>
                  <input
                    type="text"
                    className="input w-full bg-gray-50 text-gray-500"
                    value={ROLE_LABELS[user?.role] || 'Người dùng'}
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
            </div>

            {/* Plan & usage — user_admin only */}
            {isUserAdmin && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Gói đang sử dụng</p>
                <PlanSection data={profileData} />
              </div>
            )}

            {/* Employee resource limits */}
            {isEmployee && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Giới hạn tài nguyên</p>
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <p className="text-xs text-gray-500 mb-3">
                    Giá trị trống nghĩa là tài khoản của bạn không bị giới hạn ở mục đó.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {employeeLimits.map((item) => (
                      <div
                        key={item.key}
                        className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2"
                      >
                        <span className="text-sm text-gray-600">{item.label}</span>
                        <span className="text-sm font-semibold text-gray-900">
                          {item.value === null ? 'Không giới hạn' : item.value}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Account stats */}
            {profileData && (profileData.createdAt || profileData.lastLoginAt) && (
              <div className="flex flex-wrap gap-x-5 gap-y-1 pt-1 border-t border-gray-100">
                {profileData.createdAt && (
                  <span className="flex items-center gap-1.5 text-xs text-gray-400">
                    <HiOutlineCalendar className="w-3.5 h-3.5" />
                    Tạo ngày {formatDate(profileData.createdAt)}
                  </span>
                )}
                {profileData.lastLoginAt && (
                  <span className="flex items-center gap-1.5 text-xs text-gray-400">
                    <HiOutlineClock className="w-3.5 h-3.5" />
                    Đăng nhập gần nhất {formatDate(profileData.lastLoginAt)}
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
