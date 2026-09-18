import { useState, useEffect, useCallback, useMemo } from 'react';
import { useI18n } from '../../i18n';
import {
  HiOutlineRefresh,
  HiOutlinePhone,
  HiOutlineMail,
  HiOutlineClipboardCopy,
  HiOutlineCheck,
  HiOutlineExternalLink,
  HiOutlineCheckCircle,
  HiOutlineClock,
  HiOutlineSearch,
  HiOutlineExclamationCircle,
} from 'react-icons/hi';
import chatbotApi from '../chatbot/services/chatbotApi.service';
import toast from 'react-hot-toast';

function formatDateTime(isoStr, locale = 'vi') {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  return d.toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function mapSourceToConversationType(source) {
  if (source === 'web') return 'webchat';
  if (source === 'channel') return 'channel';
  if (source === 'zalo_personal') return 'zalo_personal';
  return source || 'webchat';
}

export default function ContactAlertsPanel({
  onSelectConversation,
  isEmployeeContext = false,
  onOpenCountChange,
  className = '',
}) {
  const { t, locale } = useI18n();
  const [alerts, setAlerts] = useState([]);
  const [total, setTotal] = useState(0);
  const [openCount, setOpenCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('open'); // 'open' | 'handled' | 'all'
  const [channelFilter, setChannelFilter] = useState('all');
  const [contactTypeFilter, setContactTypeFilter] = useState('all'); // 'all' | 'phone' | 'email'
  const [syncAccounts, setSyncAccounts] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedId, setCopiedId] = useState(null);
  const [updatingId, setUpdatingId] = useState(null);

  // Settings
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [digestFrequency, setDigestFrequency] = useState('weekly');
  const [isLoadingSettings, setIsLoadingSettings] = useState(false);
  const [isUpdatingSettings, setIsUpdatingSettings] = useState(false);

  useEffect(() => {
    let isMounted = true;
    if (typeof chatbotApi.getZaloSyncStatus === 'function') {
      chatbotApi
        .getZaloSyncStatus()
        .then((res) => {
          if (!isMounted) return;
          const payload = res?.data || res;
          if (payload?.success && Array.isArray(payload?.data?.accounts)) {
            setSyncAccounts(payload.data.accounts);
          }
        })
        .catch(() => {});
    }
    return () => {
      isMounted = false;
    };
  }, []);

  const zaloAccounts = useMemo(() => {
    const accMap = new Map();
    syncAccounts.forEach((acc) => {
      const key = String(acc.id || acc.displayName || acc.phoneNumber || acc.zalo_phone);
      accMap.set(key, {
        id: acc.id,
        displayName: acc.displayName || acc.name,
        phone: acc.phoneNumber || acc.zalo_phone || acc.phone,
      });
    });

    alerts.forEach((alert) => {
      if (alert.last_source === 'zalo_personal' || alert.zalo_setting_id) {
        const id = alert.zalo_setting_id;
        const name = alert.display_name;
        const phone = alert.zalo_phone;
        const key = String(id || name || phone || '');
        if (key && !accMap.has(key)) {
          accMap.set(key, {
            id,
            displayName: name,
            phone,
          });
        }
      }
    });

    return Array.from(accMap.values());
  }, [syncAccounts, alerts]);

  const otherChannels = useMemo(() => {
    const set = new Set();
    alerts.forEach((a) => {
      if (a.last_source === 'channel' && a.channel) {
        set.add(a.channel);
      }
    });
    return Array.from(set);
  }, [alerts]);

  const fetchAlerts = useCallback(async () => {
    setIsLoading(true);
    try {
      const isZaloAcc = channelFilter.startsWith('zalo_account:');
      const channelParam = isZaloAcc
        ? 'zalo_personal'
        : channelFilter === 'all'
        ? undefined
        : channelFilter;
      const accountIdParam = isZaloAcc
        ? channelFilter.replace('zalo_account:', '')
        : undefined;
      const contactTypeParam = contactTypeFilter === 'all' ? undefined : contactTypeFilter;

      const res = await chatbotApi.getContactAlerts({
        status: statusFilter,
        ...(channelParam ? { channel: channelParam } : {}),
        ...(accountIdParam ? { accountId: accountIdParam } : {}),
        ...(contactTypeParam ? { contactType: contactTypeParam } : {}),
        limit: 100,
        offset: 0,
      });
      if (res?.data?.success) {
        const data = res.data.data;
        setAlerts(data.items || []);
        setTotal(data.total || 0);
        setOpenCount(data.openCount || 0);
        if (typeof onOpenCountChange === 'function') {
          onOpenCountChange(data.openCount || 0);
        }
      }
    } catch (err) {
      console.error('Failed to fetch contact alerts:', err);
      toast.error(t('inbox.contactAlerts.fetchError') || 'Không thể tải danh sách liên hệ');
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, channelFilter, contactTypeFilter, onOpenCountChange, t]);

  const fetchSettings = useCallback(async () => {
    if (isEmployeeContext) return;
    setIsLoadingSettings(true);
    try {
      const res = await chatbotApi.getContactAlertSettings();
      if (res?.data?.success) {
        setEmailEnabled(res.data.data?.emailEnabled ?? true);
        setDigestFrequency(res.data.data?.digestFrequency || 'weekly');
      }
    } catch (err) {
      console.error('Failed to fetch alert settings:', err);
    } finally {
      setIsLoadingSettings(false);
    }
  }, [isEmployeeContext]);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleToggleEmailSetting = async () => {
    if (isEmployeeContext || isUpdatingSettings) return;
    const nextVal = !emailEnabled;
    setIsUpdatingSettings(true);
    try {
      const res = await chatbotApi.updateContactAlertSettings({ emailEnabled: nextVal });
      if (res?.data?.success) {
        setEmailEnabled(nextVal);
        toast.success(
          nextVal
            ? (t('inbox.contactAlerts.emailEnabledSuccess') || 'Đã bật nhận email khi có liên hệ mới')
            : (t('inbox.contactAlerts.emailDisabledSuccess') || 'Đã tắt nhận email thông báo liên hệ')
        );
      }
    } catch (err) {
      console.error('Failed to update email setting:', err);
      toast.error(t('inbox.contactAlerts.updateSettingError') || 'Không thể cập nhật cấu hình thông báo');
    } finally {
      setIsUpdatingSettings(false);
    }
  };

  const handleChangeDigestFrequency = async (e) => {
    const nextFreq = e.target.value;
    if (isEmployeeContext || isUpdatingSettings) return;
    setIsUpdatingSettings(true);
    try {
      const res = await chatbotApi.updateContactAlertSettings({ digestFrequency: nextFreq });
      if (res?.data?.success) {
        setDigestFrequency(nextFreq);
        toast.success(t('inbox.contactAlerts.digestUpdateSuccess') || 'Đã cập nhật tần suất thư tổng hợp');
      }
    } catch (err) {
      console.error('Failed to update digest frequency:', err);
      toast.error(t('inbox.contactAlerts.updateSettingError') || 'Không thể cập nhật cấu hình thông báo');
    } finally {
      setIsUpdatingSettings(false);
    }
  };

  const handleCopyContact = (id, value) => {
    navigator.clipboard?.writeText(value);
    setCopiedId(id);
    toast.success(t('inbox.contactAlerts.copied') || `Đã sao chép: ${value}`);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleToggleHandled = async (alert) => {
    const isHandled = Boolean(alert.handled_at);
    setUpdatingId(alert.id);
    try {
      if (isHandled) {
        await chatbotApi.unmarkContactAlertHandled(alert.id);
        toast.success(t('inbox.contactAlerts.unmarkSuccess') || 'Đã chuyển về chưa xử lý');
      } else {
        await chatbotApi.markContactAlertHandled(alert.id);
        toast.success(t('inbox.contactAlerts.markSuccess') || 'Đã đánh dấu đã liên hệ');
      }
      fetchAlerts();
    } catch (err) {
      console.error('Failed to toggle handled status:', err);
      toast.error(t('inbox.contactAlerts.actionError') || 'Thao tác không thành công');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleOpenConversation = (alert) => {
    if (typeof onSelectConversation === 'function') {
      onSelectConversation({
        id: alert.last_conversation_id,
        type: mapSourceToConversationType(alert.last_source),
        visitorName: alert.visitor_name || 'Khách hàng',
      });
    }
  };

  const filteredAlerts = useMemo(() => {
    let result = alerts;

    if (channelFilter && channelFilter !== 'all') {
      if (channelFilter === 'web') {
        result = result.filter((a) => a.last_source === 'web');
      } else if (channelFilter === 'zalo_personal') {
        result = result.filter((a) => a.last_source === 'zalo_personal');
      } else if (channelFilter.startsWith('zalo_account:')) {
        const target = channelFilter.replace('zalo_account:', '');
        result = result.filter(
          (a) =>
            a.last_source === 'zalo_personal' &&
            (String(a.zalo_setting_id) === target ||
              String(a.display_name) === target ||
              String(a.zalo_phone) === target)
        );
      } else if (channelFilter === 'email') {
        result = result.filter((a) => a.contact_type === 'email');
      } else {
        result = result.filter((a) => a.channel === channelFilter || a.last_source === channelFilter);
      }
    }

    if (contactTypeFilter && contactTypeFilter !== 'all') {
      result = result.filter((a) => a.contact_type === contactTypeFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter((a) => {
        const val = (a.contact_value || '').toLowerCase();
        const name = (a.visitor_name || '').toLowerCase();
        const exc = (a.last_excerpt || '').toLowerCase();
        return val.includes(q) || name.includes(q) || exc.includes(q);
      });
    }

    return result;
  }, [alerts, channelFilter, contactTypeFilter, searchQuery]);

  const formatChannelBadge = (alert) => {
    if (alert.last_source === 'web') {
      return (
        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">
          Website
        </span>
      );
    }
    if (alert.last_source === 'zalo_personal') {
      return (
        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-cyan-50 text-cyan-700 border border-cyan-100">
          {t('inbox.zaloPersonal') || 'Zalo cá nhân'}{alert.display_name ? ` (${alert.display_name})` : ''}
        </span>
      );
    }
    const ch = alert.channel || 'channel';
    const label = ch === 'zalo_oa' ? 'Zalo OA' : ch === 'facebook' ? 'Facebook' : ch === 'whatsapp' ? 'WhatsApp' : ch;
    return (
      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-50 text-purple-700 border border-purple-100">
        {label}{alert.display_name ? ` (${alert.display_name})` : ''}
      </span>
    );
  };

  const formatStatusBadge = (alert) => {
    if (alert.handled_at) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
          <HiOutlineCheck className="w-3.5 h-3.5" />
          {t('inbox.contactAlerts.statusHandled') || 'Đã liên hệ'}
        </span>
      );
    }
    if (alert.last_notified_at) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-sky-50 text-sky-700 border border-sky-100">
          <HiOutlineClock className="w-3.5 h-3.5" />
          {t('inbox.contactAlerts.statusNotified') || 'Đã báo qua email'}
        </span>
      );
    }
    if (alert.suppressed_reason === 'owner_opted_out') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-100" title={t('inbox.contactAlerts.titleOwnerOptedOut') || 'Chủ shop đã tắt nhận email'}>
          <HiOutlineExclamationCircle className="w-3.5 h-3.5" />
          {t('inbox.contactAlerts.statusOptedOut') || 'Tắt thông báo'}
        </span>
      );
    }
    if (alert.suppressed_reason === 'human_active') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700 border border-gray-200" title={t('inbox.contactAlerts.titleHumanActive') || 'Người thật đã trả lời trong 120 phút'}>
          <HiOutlineCheckCircle className="w-3.5 h-3.5" />
          {t('inbox.contactAlerts.statusHumanActive') || 'Đã có người rep'}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-50 text-rose-700 border border-rose-100">
        <HiOutlineClock className="w-3.5 h-3.5" />
        {t('inbox.contactAlerts.statusPending') || 'Chờ thông báo'}
      </span>
    );
  };

  return (
    <div className={`flex flex-col h-full bg-white ${className}`}>
      {/* Header */}
      <div className="shrink-0 p-4 border-b border-gray-200 flex flex-wrap items-center justify-between gap-3 bg-white">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-gray-900">
              {t('inbox.contactAlerts.title') || 'Liên hệ khách để lại'}
            </h2>
            {openCount > 0 && (
              <span className="px-2 py-0.5 bg-rose-500 text-white rounded-full text-xs font-bold">
                {openCount} {t('inbox.contactAlerts.unhandledCount') || 'chưa xử lý'}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            {t('inbox.contactAlerts.subtitle') || 'SĐT và email khách hàng gửi trong hội thoại chatbot tự động'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Settings: Email Opt-in/out & Digest Frequency (Hidden for employees) */}
          {!isEmployeeContext && (
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 cursor-pointer select-none text-xs font-medium text-gray-700 bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-100 transition-all">
                <span>{t('inbox.contactAlerts.emailNotification') || 'Nhận email khi khách để lại liên hệ'}</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={emailEnabled}
                  disabled={isLoadingSettings || isUpdatingSettings}
                  onClick={handleToggleEmailSetting}
                  className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    emailEnabled ? 'bg-primary-600' : 'bg-gray-300'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      emailEnabled ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
              </label>

              <div className="flex items-center gap-1.5 bg-gray-50 px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-700">
                <label htmlFor="digest-frequency-select" className="text-gray-600 select-none">
                  {t('inbox.contactAlerts.digestFrequency') || 'Thư tổng hợp'}:
                </label>
                <select
                  id="digest-frequency-select"
                  aria-label={t('inbox.contactAlerts.digestFrequency') || 'Thư tổng hợp hội thoại AI'}
                  value={digestFrequency}
                  disabled={isLoadingSettings || isUpdatingSettings}
                  onChange={handleChangeDigestFrequency}
                  className="bg-transparent text-xs font-semibold text-gray-800 focus:outline-none cursor-pointer"
                >
                  <option value="weekly">{t('inbox.contactAlerts.digestWeekly') || 'Hàng tuần'}</option>
                  <option value="monthly">{t('inbox.contactAlerts.digestMonthly') || 'Hàng tháng'}</option>
                  <option value="none">{t('inbox.contactAlerts.digestNone') || 'Không gửi'}</option>
                </select>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={fetchAlerts}
            disabled={isLoading}
            className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-all"
            title={t('common.refresh') || 'Làm mới'}
          >
            <HiOutlineRefresh className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="shrink-0 px-4 py-2.5 bg-gray-50/80 border-b border-gray-200 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1 bg-gray-200/80 p-1 rounded-lg text-xs font-semibold">
            <button
              type="button"
              onClick={() => setStatusFilter('open')}
              className={`px-3 py-1 rounded-md transition-all ${
                statusFilter === 'open'
                  ? 'bg-white text-primary-700 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {t('inbox.contactAlerts.filterOpen') || 'Chưa xử lý'} ({openCount})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('handled')}
              className={`px-3 py-1 rounded-md transition-all ${
                statusFilter === 'handled'
                  ? 'bg-white text-primary-700 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {t('inbox.contactAlerts.filterHandled') || 'Đã xử lý'}
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1 rounded-md transition-all ${
                statusFilter === 'all'
                  ? 'bg-white text-primary-700 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {t('inbox.contactAlerts.filterAll') || 'Tất cả'} ({total})
            </button>
          </div>

          {/* Channel filter dropdown */}
          <div className="flex items-center gap-1.5 bg-white px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-700 shadow-sm">
            <label htmlFor="channel-filter-select" className="text-gray-400 font-medium whitespace-nowrap">
              {t('inbox.contactAlerts.filterChannel') || 'Kênh'}:
            </label>
            <select
              id="channel-filter-select"
              aria-label={t('inbox.contactAlerts.filterChannel') || 'Kênh'}
              value={channelFilter}
              onChange={(e) => setChannelFilter(e.target.value)}
              className="bg-transparent text-xs font-semibold text-gray-800 focus:outline-none cursor-pointer pr-1"
            >
              <option value="all">{t('inbox.contactAlerts.filterChannelAll') || 'Tất cả kênh'}</option>
              <option value="zalo_personal">{t('inbox.contactAlerts.filterChannelZaloAll') || 'Zalo cá nhân (Tất cả)'}</option>
              {zaloAccounts.map((acc) => {
                const val = `zalo_account:${acc.id || acc.displayName || acc.phone}`;
                const label = acc.phone && acc.displayName
                  ? `Zalo: ${acc.displayName} (${acc.phone})`
                  : `Zalo: ${acc.displayName || acc.phone || acc.id}`;
                return (
                  <option key={val} value={val}>
                    &nbsp;&nbsp;{label}
                  </option>
                );
              })}
              <option value="web">Website</option>
              {otherChannels.map((ch) => {
                const label = ch === 'zalo_oa' ? 'Zalo OA' : ch === 'facebook' ? 'Facebook' : ch;
                return (
                  <option key={ch} value={ch}>
                    {label}
                  </option>
                );
              })}
            </select>
          </div>

          {/* Contact type filter dropdown */}
          <div className="flex items-center gap-1.5 bg-white px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-700 shadow-sm">
            <label htmlFor="contact-type-filter-select" className="text-gray-400 font-medium whitespace-nowrap">
              {t('inbox.contactAlerts.filterContactType') || 'Loại'}:
            </label>
            <select
              id="contact-type-filter-select"
              aria-label={t('inbox.contactAlerts.filterContactType') || 'Loại liên hệ'}
              value={contactTypeFilter}
              onChange={(e) => setContactTypeFilter(e.target.value)}
              className="bg-transparent text-xs font-semibold text-gray-800 focus:outline-none cursor-pointer pr-1"
            >
              <option value="all">{t('inbox.contactAlerts.filterContactTypeAll') || 'Tất cả thông tin'}</option>
              <option value="phone">📞 {t('inbox.contactAlerts.filterContactTypePhone') || 'Số điện thoại'}</option>
              <option value="email">✉️ {t('inbox.contactAlerts.filterContactTypeEmail') || 'Email'}</option>
            </select>
          </div>
        </div>

        <div className="relative w-64 max-w-full">
          <HiOutlineSearch className="w-4 h-4 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder={t('inbox.contactAlerts.searchPlaceholder') || 'Tìm theo SĐT, email, tên...'}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
          />
        </div>
      </div>

      {/* Table Content */}
      <div className="flex-1 overflow-auto">
        {isLoading && alerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-400">
            <HiOutlineRefresh className="w-8 h-8 animate-spin text-primary-500 mb-2" />
            <p className="text-xs">{t('common.loading') || 'Đang tải danh sách...'}</p>
          </div>
        ) : filteredAlerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-400 p-4 text-center">
            <HiOutlineCheckCircle className="w-12 h-12 text-gray-300 mb-2" />
            <p className="text-sm font-semibold text-gray-600">
              {t('inbox.contactAlerts.emptyTitle') || 'Không có thông tin liên hệ nào'}
            </p>
            <p className="text-xs text-gray-400 mt-1 max-w-sm">
              {statusFilter === 'open'
                ? (t('inbox.contactAlerts.emptyOpenDesc') || 'Tuyệt vời! Bạn đã liên hệ hết tất cả khách hàng để lại thông tin.')
                : (t('inbox.contactAlerts.emptyDesc') || 'Khi khách hàng để lại số điện thoại hoặc email trong chat, hệ thống sẽ tự động lưu vào sổ này.')}
            </p>
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200 text-left text-xs">
            <thead className="bg-gray-50 text-gray-500 font-semibold sticky top-0 z-10 shadow-sm">
              <tr>
                <th className="py-3 px-4">{t('inbox.contactAlerts.colChannel') || 'Kênh'}</th>
                <th className="py-3 px-4">{t('inbox.contactAlerts.colVisitor') || 'Khách hàng'}</th>
                <th className="py-3 px-4">{t('inbox.contactAlerts.colContact') || 'Thông tin liên hệ'}</th>
                <th className="py-3 px-4">{t('inbox.contactAlerts.colLastSeen') || 'Lần cuối'}</th>
                <th className="py-3 px-4 text-center">{t('inbox.contactAlerts.colSeenCount') || 'Số lần'}</th>
                <th className="py-3 px-4">{t('inbox.contactAlerts.colStatus') || 'Trạng thái'}</th>
                <th className="py-3 px-4 text-right">{t('inbox.contactAlerts.colActions') || 'Thao tác'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {filteredAlerts.map((alert) => (
                <tr
                  key={alert.id}
                  className={`hover:bg-gray-50/80 transition-colors ${
                    alert.handled_at ? 'opacity-70 bg-gray-50/30' : ''
                  }`}
                >
                  {/* Kênh */}
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    {formatChannelBadge(alert)}
                  </td>

                  {/* Khách hàng */}
                  <td className="py-3.5 px-4">
                    <div className="font-semibold text-gray-900">
                      {alert.visitor_name || t('inbox.contactAlerts.defaultVisitorName') || 'Khách hàng'}
                    </div>
                    {alert.last_excerpt && (
                      <p className="text-[11px] text-gray-500 line-clamp-1 max-w-xs mt-0.5 italic" title={alert.last_excerpt}>
                        &ldquo;{alert.last_excerpt}&rdquo;
                      </p>
                    )}
                  </td>

                  {/* Liên hệ */}
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      {alert.contact_type === 'phone' ? (
                        <HiOutlinePhone className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                      ) : (
                        <HiOutlineMail className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      )}
                      <span className="font-semibold text-gray-900 font-mono">
                        {alert.contact_value}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopyContact(alert.id, alert.contact_value)}
                        className="p-1 text-gray-400 hover:text-gray-700 rounded transition-colors"
                        title={t('inbox.contactAlerts.copy') || 'Sao chép'}
                      >
                        {copiedId === alert.id ? (
                          <HiOutlineCheck className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <HiOutlineClipboardCopy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </td>

                  {/* Lần cuối */}
                  <td className="py-3.5 px-4 whitespace-nowrap text-gray-500">
                    {formatDateTime(alert.last_seen_at, locale)}
                  </td>

                  {/* Số lần */}
                  <td className="py-3.5 px-4 whitespace-nowrap text-center">
                    <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded font-semibold text-[11px]">
                      {alert.seen_count || 1}
                    </span>
                  </td>

                  {/* Trạng thái */}
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    {formatStatusBadge(alert)}
                    {alert.handled_at && alert.handled_by_name && (
                      <div className="text-[10px] text-gray-400 mt-0.5">
                        {t('inbox.contactAlerts.byUser', { name: alert.handled_by_name }) || `bởi ${alert.handled_by_name}`}
                      </div>
                    )}
                  </td>

                  {/* Thao tác */}
                  <td className="py-3.5 px-4 whitespace-nowrap text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => handleOpenConversation(alert)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-primary-600 bg-primary-50 hover:bg-primary-100 rounded-md transition-all"
                        title={t('inbox.contactAlerts.openConversation') || 'Mở hội thoại'}
                      >
                        <HiOutlineExternalLink className="w-3.5 h-3.5" />
                        <span>{t('inbox.contactAlerts.openConversation') || 'Mở hội thoại'}</span>
                      </button>

                      <button
                        type="button"
                        disabled={updatingId === alert.id}
                        onClick={() => handleToggleHandled(alert)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
                          alert.handled_at
                            ? 'text-gray-600 bg-gray-100 hover:bg-gray-200'
                            : 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200'
                        }`}
                      >
                        {alert.handled_at ? (
                          <span>{t('inbox.contactAlerts.unmarkHandled') || 'Bỏ đánh dấu'}</span>
                        ) : (
                          <>
                            <HiOutlineCheck className="w-3.5 h-3.5" />
                            <span>{t('inbox.contactAlerts.markHandled') || 'Đã liên hệ'}</span>
                          </>
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
