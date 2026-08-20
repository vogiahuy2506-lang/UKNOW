/* eslint-disable no-unused-vars */
import { useState, useEffect } from 'react';
import {
  HiOutlineX,
  HiOutlineCheckCircle,
  HiOutlineXCircle,
  HiOutlineLink,
  HiOutlineClipboardCopy,
  HiOutlineExternalLink,
  HiOutlineRefresh,
  HiOutlineUserCircle,
} from 'react-icons/hi';
import toast from 'react-hot-toast';
import chatbotApi from '../../features/chatbot/services/chatbotApi.service';

/* ─── ChannelModal — cấu hình từng kênh ─────────────────────────────── */

export function ChannelModal({ open, channel, chatbot, onClose }) {
  useEffect(() => {
    if (!open) return;
  }, [open]);

  if (!open || !chatbot) return null;

  const titles = {
    zalo: 'Cấu hình Zalo OA',
    facebook: 'Cấu hình Facebook Messenger',
    zalo_personal: 'Cấu hình Zalo cá nhân',
  };
  const subtitles = {
    zalo: 'Kết nối Official Account để tự động hồi đáp khách hàng',
    facebook: 'Kết nối Fanpage Messenger để tự động trả lời tin nhắn',
    zalo_personal: 'Bật chatbot cho tài khoản Zalo cá nhân của bạn',
  };
  const accent = {
    zalo: 'bg-blue-50 text-blue-600',
    facebook: 'bg-indigo-50 text-indigo-600',
    zalo_personal: 'bg-orange-50 text-orange-600',
  };
  const letter = {
    zalo: 'Z',
    facebook: 'f',
    zalo_personal: 'Z',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden">
        <div className="px-5 py-4 flex items-center gap-3 border-b border-slate-100">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold text-base shrink-0 ${accent[channel]}`}>
            {letter[channel]}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-slate-900 truncate">{titles[channel]}</h3>
            <p className="text-xs text-slate-500 mt-0.5 truncate">{subtitles[channel]}</p>
          </div>
          {channel === 'zalo_personal' && (
            <ZaloPersonalReloadButton />
          )}
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 shrink-0"
          >
            <HiOutlineX className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-5">
          {channel === 'zalo' && <ZaloForm chatbot={chatbot} />}
          {channel === 'facebook' && <FacebookForm chatbot={chatbot} />}
          {channel === 'zalo_personal' && <ZaloPersonalForm chatbot={chatbot} />}
        </div>

        <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200 rounded-lg transition-colors"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Zalo OA ─────────────────────────────────────────────────────── */

function ZaloForm({ chatbot }) {
  const [oaId, setOaId] = useState('');
  const [secret, setSecret] = useState('');
  const [webhook, setWebhook] = useState('');
  const [copied, setCopied] = useState(false);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    const base = typeof window !== 'undefined' ? window.location.origin : '';
    setWebhook(`${base}/webhooks/zalo/oa?chatbot_id=${chatbot.id}`);
  }, [chatbot.id]);

  const copy = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success('Đã copy');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleTest = async () => {
    setTesting(true);
    setResult(null);
    try {
      const res = await chatbotApi.testInboxConnection('zalo');
      const ok = !!res.data?.success;
      setResult({ ok, message: res.data?.message || (ok ? 'Kết nối thành công' : 'Kết nối thất bại') });
      ok ? toast.success('Zalo OA hoạt động bình thường') : toast.error('Kết nối thất bại');
    } catch (err) {
      setResult({ ok: false, message: err.response?.data?.message || 'Không thể kiểm tra' });
      toast.error('Không thể kiểm tra');
    } finally {
      setTesting(false);
    }
  };

  const handleOAuth = async () => {
    try {
      const res = await chatbotApi.initZaloOAuth({ chatbot_id: chatbot.id });
      if (res.data?.oauth_url) {
        window.open(res.data.oauth_url, '_blank', 'noopener');
      } else {
        toast.error('Không lấy được OAuth URL');
      }
    } catch {
      toast.error('Không thể khởi tạo OAuth');
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-blue-50/50 border border-blue-100 rounded-lg p-3">
        <p className="text-xs text-slate-600 mb-2">
          Cấu hình Zalo Official Account để tự động phản hồi tin nhắn từ khách hàng.
        </p>
        <button
          type="button"
          onClick={handleOAuth}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-xs font-semibold rounded-md transition-colors"
        >
          <HiOutlineExternalLink className="w-3.5 h-3.5" />
          Kết nối qua OAuth
        </button>
      </div>

      <div>
        <label className="text-xs font-medium text-slate-700 block mb-1.5">OA ID</label>
        <input
          type="text"
          value={oaId}
          onChange={(e) => setOaId(e.target.value)}
          placeholder="VD: 1234567890123456789"
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/10"
        />
      </div>

      <div>
        <label className="text-xs font-medium text-slate-700 block mb-1.5">App Secret</label>
        <input
          type="password"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          placeholder="••••••••••••••••"
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/10"
        />
      </div>

      <div>
        <label className="text-xs font-medium text-slate-700 block mb-1.5">Webhook URL</label>
        <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-lg border border-slate-200">
          <HiOutlineLink className="w-4 h-4 text-slate-400 shrink-0" />
          <input type="text" readOnly value={webhook} className="flex-1 bg-transparent text-xs font-mono text-slate-600 outline-none" />
          <button
            type="button"
            onClick={() => copy(webhook)}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white border border-slate-200 text-xs text-slate-600 hover:bg-slate-100 shrink-0"
          >
            <HiOutlineClipboardCopy className="w-3 h-3" />
            {copied ? 'OK' : 'Copy'}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleTest}
          disabled={testing}
          className="inline-flex items-center gap-1.5 px-3 py-2 bg-primary-500 hover:bg-primary-600 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
        >
          {testing ? <HiOutlineRefresh className="w-3.5 h-3.5 animate-spin" /> : <HiOutlineCheckCircle className="w-3.5 h-3.5" />}
          {testing ? 'Đang kiểm tra...' : 'Kiểm tra kết nối'}
        </button>
        {result && (
          <span className={`inline-flex items-center gap-1 text-xs ${result.ok ? 'text-emerald-600' : 'text-red-600'}`}>
            {result.ok ? <HiOutlineCheckCircle className="w-3.5 h-3.5" /> : <HiOutlineXCircle className="w-3.5 h-3.5" />}
            {result.message}
          </span>
        )}
      </div>
    </div>
  );
}

/* ─── Facebook ────────────────────────────────────────────────────── */

function FacebookForm({ chatbot }) {
  const [pageId, setPageId] = useState('');
  const [token, setToken] = useState('');
  const [webhook, setWebhook] = useState('');
  const [copied, setCopied] = useState(false);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    const base = typeof window !== 'undefined' ? window.location.origin : '';
    setWebhook(`${base}/webhooks/facebook/page?chatbot_id=${chatbot.id}`);
  }, [chatbot.id]);

  const copy = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success('Đã copy');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleTest = async () => {
    setTesting(true);
    setResult(null);
    try {
      const res = await chatbotApi.testInboxConnection('facebook');
      const ok = !!res.data?.success;
      setResult({ ok, message: res.data?.message || (ok ? 'Kết nối thành công' : 'Kết nối thất bại') });
      ok ? toast.success('Facebook hoạt động bình thường') : toast.error('Kết nối thất bại');
    } catch (err) {
      setResult({ ok: false, message: err.response?.data?.message || 'Không thể kiểm tra' });
      toast.error('Không thể kiểm tra');
    } finally {
      setTesting(false);
    }
  };

  const handleOAuth = async () => {
    try {
      const res = await chatbotApi.initFacebookOAuth({ chatbot_id: chatbot.id });
      if (res.data?.oauth_url) {
        window.open(res.data.oauth_url, '_blank', 'noopener');
      } else {
        toast.error('Không lấy được OAuth URL');
      }
    } catch {
      toast.error('Không thể khởi tạo OAuth');
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-indigo-50/50 border border-indigo-100 rounded-lg p-3">
        <p className="text-xs text-slate-600 mb-2">
          Kết nối Fanpage Facebook để tự động trả lời tin nhắn Messenger.
        </p>
        <button
          type="button"
          onClick={handleOAuth}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-semibold rounded-md transition-colors"
        >
          <HiOutlineExternalLink className="w-3.5 h-3.5" />
          Kết nối qua OAuth
        </button>
      </div>

      <div>
        <label className="text-xs font-medium text-slate-700 block mb-1.5">Page ID</label>
        <input
          type="text"
          value={pageId}
          onChange={(e) => setPageId(e.target.value)}
          placeholder="VD: 1234567890"
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/10"
        />
      </div>

      <div>
        <label className="text-xs font-medium text-slate-700 block mb-1.5">Page Access Token</label>
        <input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="EAABwzLixnjY..."
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/10"
        />
      </div>

      <div>
        <label className="text-xs font-medium text-slate-700 block mb-1.5">Webhook URL</label>
        <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-lg border border-slate-200">
          <HiOutlineLink className="w-4 h-4 text-slate-400 shrink-0" />
          <input type="text" readOnly value={webhook} className="flex-1 bg-transparent text-xs font-mono text-slate-600 outline-none" />
          <button
            type="button"
            onClick={() => copy(webhook)}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white border border-slate-200 text-xs text-slate-600 hover:bg-slate-100 shrink-0"
          >
            <HiOutlineClipboardCopy className="w-3 h-3" />
            {copied ? 'OK' : 'Copy'}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleTest}
          disabled={testing}
          className="inline-flex items-center gap-1.5 px-3 py-2 bg-primary-500 hover:bg-primary-600 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
        >
          {testing ? <HiOutlineRefresh className="w-3.5 h-3.5 animate-spin" /> : <HiOutlineCheckCircle className="w-3.5 h-3.5" />}
          {testing ? 'Đang kiểm tra...' : 'Kiểm tra kết nối'}
        </button>
        {result && (
          <span className={`inline-flex items-center gap-1 text-xs ${result.ok ? 'text-emerald-600' : 'text-red-600'}`}>
            {result.ok ? <HiOutlineCheckCircle className="w-3.5 h-3.5" /> : <HiOutlineXCircle className="w-3.5 h-3.5" />}
            {result.message}
          </span>
        )}
      </div>
    </div>
  );
}

/* ─── Zalo Personal ──────────────────────────────────────────────── */

function Toggle({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${
        checked ? 'bg-primary-600' : 'bg-slate-200'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

/* ─── Zalo Personal ──────────────────────────────────────────────── */

function ZaloPersonalReloadButton() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent('zalo-personal:reload'))}
      className="w-7 h-7 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 shrink-0"
      title="Tải lại danh sách tài khoản"
    >
      <HiOutlineRefresh className="w-4 h-4" />
    </button>
  );
}

function ZaloPersonalForm({ chatbot }) {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [togglingId, setTogglingId] = useState(null);

  useEffect(() => {
    loadAccounts();
    const onReload = () => loadAccounts();
    window.addEventListener('zalo-personal:reload', onReload);
    return () => window.removeEventListener('zalo-personal:reload', onReload);
  }, []);

  const loadAccounts = async () => {
    setLoading(true);
    try {
      const res = await chatbotApi.listZaloAccountsWithChatbotSettings();
      // Backend response shape: { success: true, data: [accounts] }
      // Axios unwraps the HTTP body into res.data, so the array lives at res.data.data.
      const list = res?.data?.data || res?.data?.accounts || res?.accounts || res?.data || [];
      console.log('[ZaloPersonal] API response:', res);
      console.log('[ZaloPersonal] Parsed list:', list);
      setAccounts(Array.isArray(list) ? list : []);
    } catch (err) {
      console.error('[ZaloPersonal] API error:', err);
      setAccounts([]);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (acc, next) => {
    setTogglingId(acc.id);
    // Optimistic update
    setAccounts((prev) => prev.map((a) => (a.id === acc.id ? { ...a, chatbot_enabled: next } : a)));
    try {
      await chatbotApi.toggleZaloAccountChatbot(acc.id, next);
      toast.success(next ? `Đã bật chatbot cho ${acc.name || acc.phone || acc.zalo_user_id}` : 'Đã tắt chatbot');
    } catch {
      // rollback
      setAccounts((prev) => prev.map((a) => (a.id === acc.id ? { ...a, chatbot_enabled: !next } : a)));
      toast.error('Không thể cập nhật');
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-orange-50/50 border border-orange-100 rounded-lg p-3">
        <p className="text-xs text-slate-600">
          Bật/tắt chatbot cho từng tài khoản Zalo cá nhân đã liên kết.
        </p>
      </div>

      {/* Account list */}
      <div className="space-y-1">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-slate-400 text-xs">
            <HiOutlineRefresh className="w-4 h-4 animate-spin mr-2" />
            Đang tải danh sách tài khoản...
          </div>
        ) : accounts.length === 0 ? (
          <div className="text-center py-8 bg-slate-50 rounded-xl border border-dashed border-slate-200">
            <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-2">
              <HiOutlineUserCircle className="w-5 h-5 text-slate-400" />
            </div>
            <p className="text-sm font-medium text-slate-700">Chưa liên kết tài khoản Zalo</p>
            <p className="text-xs text-slate-400 mt-1 px-6">
              Vào{' '}
              <a
                href="/app/settings/channels"
                target="_blank"
                rel="noreferrer"
                className="text-primary-600 hover:text-primary-700 font-medium underline underline-offset-2"
              >
                Cài đặt → Kênh liên kết
              </a>{' '}
              để thêm tài khoản Zalo, sau đó quay lại đây.
            </p>
          </div>
        ) : (
          accounts.map((acc) => {
            const isOn = !!acc.chatbot_enabled;
            const busy = togglingId === acc.id;

            // Helper to get display name, avoiding Zalo ID
            const isLikelyZaloId = (v) => {
              if (!v) return false;
              const str = String(v).replace(/[\s-]/g, '');
              return /^\d{9,15}$/.test(str);
            };
            const displayName = !isLikelyZaloId(acc.name) && acc.name
              ? acc.name
              : !isLikelyZaloId(acc.display_name) && acc.display_name
                ? acc.display_name
                : acc.phone && !isLikelyZaloId(acc.phone)
                  ? acc.phone
                  : !isLikelyZaloId(acc.zalo_user_id)
                    ? acc.zalo_user_id
                    : 'Zalo Account';
            const avatarChar = displayName.charAt(0).toUpperCase();

            return (
              <div
                key={acc.id}
                className="flex items-center gap-3 px-3 py-2.5 bg-white border border-slate-200 rounded-lg hover:border-slate-300 transition-colors"
              >
                <div className="w-9 h-9 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 font-bold">
                  {acc.avatar ? (
                    <img src={acc.avatar} alt="" className="w-9 h-9 rounded-full object-cover" />
                  ) : (
                    avatarChar
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">
                    {displayName}
                  </p>
                  <p className="text-[11px] text-slate-400 truncate">
                    {acc.phone && !isLikelyZaloId(acc.phone) ? acc.phone : acc.zalo_user_id || `ID: ${acc.id}`}
                  </p>
                </div>
                <Toggle checked={isOn} disabled={busy} onChange={(v) => handleToggle(acc, v)} />
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}