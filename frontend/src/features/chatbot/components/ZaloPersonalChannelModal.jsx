import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  HiOutlineCheckCircle,
  HiOutlineX,
  HiOutlineUserGroup,
  HiOutlineQrcode,
  HiOutlineCog,
  HiOutlineExclamationCircle,
  HiOutlineRefresh,
  HiOutlineChatAlt2,
  HiOutlineSparkles,
  HiOutlineChevronRight,
  HiOutlinePlus,
  HiOutlineLogin,
} from 'react-icons/hi';
import toast from 'react-hot-toast';
import { useI18n } from '../../../i18n';
import chatbotApi from '../../chatbot/services/chatbotApi.service';
import zaloSettingsApiService from '../../settings/services/zaloSettingsApi.service';

const TABS = [
  { id: 'accounts', label: 'Tài khoản', icon: HiOutlineUserGroup },
  { id: 'guide',    label: 'Đăng nhập',  icon: HiOutlineQrcode },
  { id: 'settings', label: 'Chatbot',    icon: HiOutlineCog },
];

const GUIDE_STEPS = [
  {
    title: 'Mở trang quản lý Zalo cá nhân',
    desc: 'Vào Cài đặt → Kênh gửi → Zalo cá nhân để bắt đầu kết nối.',
    icon: HiOutlineLogin,
  },
  {
    title: 'Quét mã QR bằng điện thoại',
    desc: 'Hệ thống sẽ hiển thị mã QR — mở app Zalo trên điện thoại, vào phần cá nhân và quét mã.',
    icon: HiOutlineQrcode,
  },
  {
    title: 'Xác nhận đăng nhập trên Zalo',
    desc: 'Chấp nhận yêu cầu đăng nhập trên điện thoại. Tài khoản sẽ tự động xuất hiện trong danh sách.',
    icon: HiOutlineCheckCircle,
  },
];

function isLikelyZaloId(value) {
  if (!value) return false;
  const str = String(value);
  // Zalo IDs are typically numeric, often 9-12 digits, may start with 0
  return /^\d{9,15}$/.test(str.replace(/[\s-]/g, ''));
}

function isEmptyOrInvalid(value) {
  if (!value) return true;
  const str = String(value).trim();
  return str === '' || str === 'null' || str === 'undefined';
}

function readAccount(acc) {
  const id = acc?.id ?? acc?.zalo_setting_id;
  const displayNameRaw = acc?.display_name || acc?.displayName || '';
  const zaloName = acc?.zalo_name || acc?.zaloName || '';
  const zaloPhone = acc?.zalo_phone || acc?.zaloPhone || '';
  const zaloUserId = acc?.zalo_user_id || acc?.zaloUserId || '';

  // Check if displayName looks like a Zalo ID (numeric string 9-15 digits)
  const isLikelyZaloIdValue = (value) => {
    if (!value) return false;
    const str = String(value).replace(/[\s-]/g, '');
    return /^\d{9,15}$/.test(str);
  };

  // Prefer zaloName if displayName looks like a Zalo ID or is empty
  let displayName = displayNameRaw;
  if (isEmptyOrInvalid(displayName) || isLikelyZaloIdValue(displayName)) {
    if (!isEmptyOrInvalid(zaloName)) {
      displayName = zaloName;
    } else if (!isEmptyOrInvalid(zaloPhone)) {
      displayName = zaloPhone;
    } else if (!isEmptyOrInvalid(zaloUserId)) {
      displayName = zaloUserId;
    }
  }

  // Final fallback - never show Zalo ID as name
  if (isEmptyOrInvalid(displayName) || isLikelyZaloIdValue(displayName)) {
    displayName = 'Zalo Account';
  }

  return {
    id: String(id ?? ''),
    displayName,
    zaloName,
    zaloPhone,
    avatar: acc?.avatar_url || acc?.avatarUrl || null,
    status: acc?.status || 'unknown',
    isActive: (acc?.is_active ?? acc?.isActive ?? true) !== false,
    isConnected: acc?.status === 'connected',
    lastConnectedAt: acc?.last_connected_at || acc?.lastConnectedAt || null,
  };
}

export default function ZaloPersonalChannelModal({ open, onClose, onOpenConnect }) {
  const { t } = useI18n();
  const [accounts, setAccounts] = useState([]);
  const [chatbotSettings, setChatbotSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('accounts');
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape' && !refreshing) onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, refreshing, onClose]);

  const fetchData = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true); else setLoading(true);
    try {
      // Parallel fetch
      const [accountsRes, settingsRes] = await Promise.all([
        zaloSettingsApiService.listAccounts(),
        chatbotApi.listZaloAccountsWithChatbotSettings().catch(() => ({ data: { data: [] } })),
      ]);

      const rawAccounts = accountsRes?.data?.data?.items
        || accountsRes?.data?.data
        || accountsRes?.data?.items
        || [];

      // Defensive filter — accept either naming convention
      const normalized = rawAccounts
        .map(readAccount)
        .filter((acc) => acc.isConnected);

      setAccounts(normalized);

      const settingsMap = {};
      (settingsRes?.data?.data || []).forEach((setting) => {
        settingsMap[String(setting.id_zalo_setting)] = setting;
      });
      setChatbotSettings(settingsMap);
    } catch (error) {
      console.error('[ZaloPersonalChannelModal] Failed to fetch data:', error);
      toast.error(t('common.loadFailed') || 'Không thể tải dữ liệu');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [t]);

  useEffect(() => {
    if (open) fetchData();
  }, [open, fetchData]);

  const handleToggle = async (account, enabled) => {
    try {
      const res = await chatbotApi.toggleZaloAccountChatbot(account.id, enabled);
      setChatbotSettings((prev) => ({ ...prev, [account.id]: res.data?.data }));
      toast.success(enabled ? t('zaloPersonalChatbot.enabled') : t('zaloPersonalChatbot.disabled'));
    } catch (error) {
      console.error('[ZaloPersonalChannelModal] Toggle failed:', error);
      toast.error(t('zaloPersonalChatbot.toggleFailed'));
    }
  };

  const enabledCount = Object.values(chatbotSettings).filter((s) => s?.is_enabled).length;

  if (!open || !mounted) return null;

  const modal = (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-md p-0 sm:p-4 animate-[fadeIn_0.2s_ease-out]">
      <div className="relative bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl shadow-indigo-500/20 w-full max-w-2xl mx-0 sm:mx-4 h-[92dvh] sm:h-auto sm:max-h-[85vh] overflow-hidden flex flex-col animate-[modalIn_0.28s_cubic-bezier(0.16,1,0.3,1)]">

        {/* Header */}
        <div className="relative overflow-hidden bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-600 px-5 pt-5 pb-4 shrink-0">
          <div aria-hidden className="absolute -top-12 -right-12 w-40 h-40 rounded-full bg-white/10 blur-2xl" />
          <div aria-hidden className="absolute -bottom-10 -left-6 w-32 h-32 rounded-full bg-cyan-300/20 blur-3xl" />

          <div className="relative flex items-center justify-between gap-2">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-11 h-11 rounded-2xl bg-white/20 backdrop-blur-sm ring-1 ring-white/30 flex items-center justify-center text-white text-sm font-bold shrink-0">
                Zalo
              </div>
              <div className="min-w-0">
                <h3 className="text-base sm:text-lg font-semibold text-white truncate">
                  {t('zaloPersonalChatbot.title') || 'Cấu hình Zalo cá nhân'}
                </h3>
                <p className="text-[11px] sm:text-xs text-blue-100 truncate">
                  {accounts.length > 0
                    ? `${accounts.length} tài khoản đã kết nối${enabledCount > 0 ? ` • ${enabledCount} đang bật chatbot` : ''}`
                    : 'Chưa có tài khoản nào được kết nối'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => fetchData(true)}
                disabled={refreshing}
                aria-label="Làm mới"
                className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 text-white/90 transition-colors flex items-center justify-center disabled:opacity-50"
              >
                <HiOutlineRefresh className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              </button>
              <button
                type="button"
                onClick={onClose}
                aria-label="Đóng"
                className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 text-white/90 transition-colors flex items-center justify-center"
              >
                <HiOutlineX className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Tab Switcher — copy pattern từ ChatbotStudioPage */}
        <div className="lg:hidden sticky top-0 z-10 bg-white border-b border-slate-100 shrink-0">
          <div className="flex">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              const disabled = tab.id === 'settings' && accounts.length === 0;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => !disabled && setActiveTab(tab.id)}
                  disabled={disabled}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-3 transition-colors relative ${
                    isActive ? 'text-blue-600' : 'text-slate-500 hover:text-slate-700'
                  } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="text-xs font-medium">{tab.label}</span>
                  {isActive && (
                    <span className="absolute bottom-0 left-1/4 right-1/4 h-0.5 bg-blue-500 rounded-t-full" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Desktop sub-header — chỉ hiện trên lg */}
        <div className="hidden lg:flex items-center justify-between px-5 py-3 border-b border-slate-100 bg-slate-50/60 shrink-0">
          <div className="flex items-center gap-2">
            <HiOutlineUserGroup className="w-4 h-4 text-slate-500" />
            <span className="text-sm font-medium text-slate-700">Tài khoản Zalo cá nhân</span>
          </div>
          <button
            type="button"
            onClick={() => onOpenConnect?.()}
            className="text-xs font-semibold text-blue-600 hover:text-blue-700 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg hover:bg-blue-50 transition-colors"
          >
            <HiOutlinePlus className="w-3.5 h-3.5" />
            Đăng nhập thêm
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto overscroll-contain bg-slate-50/30">
          {/* ── Tab: Accounts (default + mobile) ─────────────────────────── */}
          <div className={`${activeTab === 'accounts' ? 'block' : 'hidden'} lg:block h-full`}>
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : accounts.length === 0 ? (
              <EmptyState onOpenConnect={onOpenConnect} />
            ) : (
              <div className="p-3 sm:p-4 space-y-2.5">
                {accounts.map((account) => {
                  const settings = chatbotSettings[account.id] || {};
                  const isEnabled = !!settings?.is_enabled;
                  return <AccountRow key={account.id} account={account} isEnabled={isEnabled} onToggle={handleToggle} />;
                })}
              </div>
            )}
          </div>

          {/* ── Tab: Guide (mobile only) ─────────────────────────────────── */}
          <div className={`${activeTab === 'guide' ? 'block' : 'hidden'} lg:hidden h-full`}>
            <GuidePanel onOpenConnect={onOpenConnect} />
          </div>

          {/* ── Tab: Settings (mobile only) ───────────────────────────────── */}
          <div className={`${activeTab === 'settings' ? 'block' : 'hidden'} lg:hidden h-full`}>
            <SettingsPanel accounts={accounts} chatbotSettings={chatbotSettings} />
          </div>
        </div>

        {/* Footer — desktop only (mobile dùng nút trong panel) */}
        <div className="hidden lg:flex px-5 py-4 border-t border-slate-100 items-center justify-between gap-3 shrink-0">
          <p className="text-xs text-slate-500">
            Bật chatbot cho từng tài khoản để tự động trả lời tin nhắn.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-xl transition-colors"
          >
            {t('common.close') || 'Đóng'}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

// ── Account Row ──────────────────────────────────────────────────────────────
function AccountRow({ account, isEnabled, onToggle }) {
  return (
    <div
      className={`rounded-xl border transition-all ${
        isEnabled ? 'bg-emerald-50/50 border-emerald-200' : 'bg-white border-slate-200'
      }`}
    >
      <div className="flex items-center justify-between gap-3 px-3.5 py-3 sm:px-4">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div
            className={`w-9 h-9 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center shrink-0 ${
              isEnabled ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'
            }`}
          >
            {account.avatar ? (
              <img src={account.avatar} alt="" className="w-full h-full rounded-lg object-cover" />
            ) : isEnabled ? (
              <HiOutlineCheckCircle className="w-5 h-5" />
            ) : (
              <HiOutlineChatAlt2 className="w-5 h-5" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-800 truncate">{account.displayName}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className={`inline-flex w-1.5 h-1.5 rounded-full ${account.isConnected ? 'bg-emerald-500' : 'bg-slate-300'}`} />
              <p className="text-xs text-slate-500 truncate">
                {account.isConnected
                  ? (isEnabled ? 'Đang bật chatbot' : 'Đã kết nối')
                  : 'Mất kết nối'}
              </p>
            </div>
          </div>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={isEnabled}
          aria-label={isEnabled ? 'Tắt chatbot' : 'Bật chatbot'}
          onClick={() => onToggle(account, !isEnabled)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${
            isEnabled ? 'bg-emerald-500' : 'bg-slate-200'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
              isEnabled ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>
    </div>
  );
}

// ── Empty State (no accounts connected) ─────────────────────────────────────
function EmptyState({ onOpenConnect }) {
  return (
    <div className="flex flex-col items-center justify-center text-center px-6 py-12 sm:py-16">
      <div className="relative w-20 h-20 rounded-3xl bg-gradient-to-br from-blue-100 to-indigo-100 flex items-center justify-center mb-5">
        <HiOutlineQrcode className="w-10 h-10 text-blue-500" />
        <span className="absolute -top-1 -right-1 w-7 h-7 rounded-full bg-amber-400 ring-4 ring-white flex items-center justify-center text-white text-xs font-bold">
          !
        </span>
      </div>
      <h4 className="text-base font-semibold text-slate-900 mb-1">
        Chưa có tài khoản Zalo nào
      </h4>
      <p className="text-sm text-slate-500 max-w-sm mb-6 leading-relaxed">
        Đăng nhập tài khoản Zalo cá nhân của bạn bằng mã QR để bắt đầu kích hoạt chatbot tự động trả lời.
      </p>

      <ol className="w-full max-w-sm space-y-2 mb-6 text-left">
        {GUIDE_STEPS.map((s, i) => (
          <li key={i} className="flex gap-3 p-3 rounded-xl bg-white border border-slate-100">
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-600 text-xs font-bold shrink-0">
              {i + 1}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-800">{s.title}</p>
              <p className="text-xs text-slate-500 mt-0.5">{s.desc}</p>
            </div>
          </li>
        ))}
      </ol>

      {onOpenConnect && (
        <button
          type="button"
          onClick={onOpenConnect}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm font-semibold rounded-xl hover:from-blue-700 hover:to-indigo-700 shadow-lg shadow-blue-500/25 transition-all active:scale-[0.98]"
        >
          <HiOutlineQrcode className="w-4 h-4" />
          Đăng nhập Zalo ngay
          <HiOutlineChevronRight className="w-4 h-4 -mr-1" />
        </button>
      )}
    </div>
  );
}

// ── Guide Panel (mobile) ─────────────────────────────────────────────────────
function GuidePanel({ onOpenConnect }) {
  return (
    <div className="p-4 space-y-4">
      <div className="flex items-start gap-3 p-4 rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100">
        <HiOutlineSparkles className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-slate-900">Kết nối Zalo cá nhân trong 3 bước</p>
          <p className="text-xs text-slate-600 mt-1">
            Đăng nhập 1 lần, dùng được cho nhiều chatbot. Tài khoản chỉ lưu trên thiết bị của bạn.
          </p>
        </div>
      </div>

      <div className="space-y-2.5">
        {GUIDE_STEPS.map((s, i) => {
          const Icon = s.icon;
          return (
            <div key={i} className="flex gap-3 p-3.5 rounded-xl bg-white border border-slate-100">
              <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-blue-50 text-blue-600 shrink-0">
                <Icon className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900">{s.title}</p>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{s.desc}</p>
              </div>
            </div>
          );
        })}
      </div>

      {onOpenConnect && (
        <button
          type="button"
          onClick={onOpenConnect}
          className="w-full inline-flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm font-semibold rounded-xl shadow-lg shadow-blue-500/25 active:scale-[0.98] transition-all"
        >
          <HiOutlineQrcode className="w-4 h-4" />
          Mở trang đăng nhập QR
        </button>
      )}
    </div>
  );
}

// ── Settings Panel (mobile) ──────────────────────────────────────────────────
function SettingsPanel({ accounts, chatbotSettings }) {
  const totalEnabled = Object.values(chatbotSettings).filter((s) => s?.is_enabled).length;

  return (
    <div className="p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Tổng tài khoản" value={accounts.length} color="blue" />
        <StatCard label="Đang bật chatbot" value={totalEnabled} color="emerald" />
      </div>

      <div className="p-4 rounded-xl bg-white border border-slate-100">
        <div className="flex items-center gap-2 mb-3">
          <HiOutlineCog className="w-4 h-4 text-slate-500" />
          <p className="text-sm font-semibold text-slate-900">Cấu hình chung</p>
        </div>
        <p className="text-xs text-slate-500 leading-relaxed">
          AI config (system prompt, nhiệt độ, max tokens) được chia sẻ với cài đặt chatbot chính ở panel bên phải (desktop) hoặc tab cấu hình khi dùng màn rộng.
        </p>
      </div>

      <div className="p-3 rounded-xl bg-amber-50 border border-amber-100">
        <div className="flex gap-2">
          <HiOutlineExclamationCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800 leading-relaxed">
            Bật chatbot chỉ áp dụng cho từng tài khoản. Có thể bật nhiều tài khoản cùng lúc.
          </p>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, color }) {
  const palette = {
    blue:   'from-blue-50 to-indigo-50 text-blue-700 border-blue-100',
    emerald:'from-emerald-50 to-teal-50 text-emerald-700 border-emerald-100',
  };
  return (
    <div className={`p-3.5 rounded-xl bg-gradient-to-br border ${palette[color] || palette.blue}`}>
      <p className="text-2xl font-bold tabular-nums">{value}</p>
      <p className="text-xs font-medium opacity-80 mt-0.5">{label}</p>
    </div>
  );
}