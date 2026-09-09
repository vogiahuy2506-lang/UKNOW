import { useState, useEffect, useCallback } from 'react';
import {
  HiOutlineX,
  HiOutlineCheckCircle,
  HiOutlineClipboardCopy,
  HiOutlineRefresh,
  HiOutlineUserCircle,
} from 'react-icons/hi';
import toast from 'react-hot-toast';
import chatbotApi from '../../features/chatbot/services/chatbotApi.service';
import WhatsAppChannelModal from '../../features/chatbot/components/WhatsAppChannelModal';

/* ─── ChannelModal — cấu hình từng kênh ─────────────────────────────── */

export function ChannelModal({ open, channel, chatbot, onClose }) {
  useEffect(() => {
    if (!open) return;
  }, [open]);

  if (!open || !chatbot) return null;

  // WhatsApp uses its own dedicated modal (per-chatbot AI toggle list) — same
  // pattern as Zalo Personal. The simple inline forms are reserved for
  // channels that connect directly from inside this dialog.
  if (channel === 'whatsapp') {
    return (
      <WhatsAppChannelModal
        open={open}
        onClose={onClose}
        chatbotId={chatbot.id}
      />
    );
  }

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
  const [oaInfo, setOaInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    const fetchOa = async () => {
      try {
        const res = await chatbotApi.getZaloOaConfig(chatbot.id);
        if (res?.data?.data) {
          const d = res.data.data;
          setOaId(d.oa_id || '');
          setSecret(d.secret_key || '');
          setOaInfo(d);
        }
      } catch (e) {
        // ignore
      } finally {
        setLoading(false);
      }
    };
    fetchOa();
    setWebhook(`${window.location.origin}/webhooks/zalo/oa?chatbot_id=${chatbot.id}`);
  }, [chatbot.id]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await chatbotApi.saveZaloOaConfig(chatbot.id, { oa_id: oaId, secret_key: secret });
      toast.success('Đã lưu cấu hình Zalo OA.');
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Lưu thất bại.');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const res = await chatbotApi.testInboxConnection('zalo');
      if (res?.data?.ok) toast.success('Webhook đã được gửi thử thành công.');
      else toast.error('Webhook chưa phản hồi.');
    } catch (err) {
      toast.error('Test thất bại.');
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-slate-400 text-xs">
        <HiOutlineRefresh className="w-4 h-4 animate-spin mr-2" />
        Đang tải...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-slate-700 mb-1">OA ID</label>
        <input
          type="text"
          value={oaId}
          onChange={(e) => setOaId(e.target.value)}
          placeholder="VD: 1234567890"
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-700 mb-1">Secret Key</label>
        <input
          type="password"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          placeholder="••••••••"
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-700 mb-1">Webhook URL</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={webhook}
            readOnly
            className="flex-1 px-3 py-2 text-xs border border-slate-200 rounded-lg bg-slate-50 font-mono text-slate-600"
          />
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(webhook);
              toast.success('Đã copy webhook.');
            }}
            className="px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 border border-slate-200 rounded-lg"
          >
            <HiOutlineClipboardCopy className="w-4 h-4" />
          </button>
        </div>
      </div>

      {oaInfo?.verified ? (
        <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 px-3 py-2 rounded-lg">
          <HiOutlineCheckCircle className="w-4 h-4" />
          OA đã xác thực
        </div>
      ) : null}

      <div className="flex gap-2 pt-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !oaId || !secret}
          className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
        >
          {saving ? 'Đang lưu...' : 'Lưu cấu hình'}
        </button>
        <button
          type="button"
          onClick={handleTest}
          disabled={testing}
          className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
        >
          {testing ? 'Đang test...' : 'Test webhook'}
        </button>
      </div>
    </div>
  );
}

/* ─── Facebook Messenger ─────────────────────────────────────────── */

function FacebookForm({ chatbot }) {
  const [pageId, setPageId] = useState('');
  const [pageToken, setPageToken] = useState('');
  const [verifyToken, setVerifyToken] = useState('');
  const [webhook, setWebhook] = useState('');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchPage = async () => {
      try {
        const res = await chatbotApi.getFacebookPageConfig(chatbot.id);
        if (res?.data?.data) {
          const d = res.data.data;
          setPageId(d.page_id || '');
          setPageToken(d.page_access_token || '');
          setVerifyToken(d.verify_token || '');
        }
      } catch (e) {
        // ignore
      } finally {
        setLoading(false);
      }
    };
    fetchPage();
    setWebhook(`${window.location.origin}/webhooks/facebook/page?chatbot_id=${chatbot.id}`);
  }, [chatbot.id]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await chatbotApi.saveFacebookPageConfig(chatbot.id, {
        page_id: pageId,
        page_access_token: pageToken,
        verify_token: verifyToken,
      });
      toast.success('Đã lưu cấu hình Facebook Page.');
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Lưu thất bại.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-slate-400 text-xs">
        <HiOutlineRefresh className="w-4 h-4 animate-spin mr-2" />
        Đang tải...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-slate-700 mb-1">Page ID</label>
        <input
          type="text"
          value={pageId}
          onChange={(e) => setPageId(e.target.value)}
          placeholder="VD: 1234567890"
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-700 mb-1">Page Access Token</label>
        <input
          type="password"
          value={pageToken}
          onChange={(e) => setPageToken(e.target.value)}
          placeholder="EAAxxxxxxx..."
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-700 mb-1">Verify Token</label>
        <input
          type="text"
          value={verifyToken}
          onChange={(e) => setVerifyToken(e.target.value)}
          placeholder="Chuỗi bí mật tự đặt"
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-700 mb-1">Webhook URL</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={webhook}
            readOnly
            className="flex-1 px-3 py-2 text-xs border border-slate-200 rounded-lg bg-slate-50 font-mono text-slate-600"
          />
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(webhook);
              toast.success('Đã copy webhook.');
            }}
            className="px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 border border-slate-200 rounded-lg"
          >
            <HiOutlineClipboardCopy className="w-4 h-4" />
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={handleSave}
        disabled={saving || !pageId || !pageToken}
        className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
      >
        {saving ? 'Đang lưu...' : 'Lưu cấu hình'}
      </button>
    </div>
  );
}

/* ─── Shared toggle ──────────────────────────────────────────────── */

function Toggle({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0 ${
        checked ? 'bg-blue-600' : 'bg-slate-200'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

/* ─── Zalo Personal reload hook ──────────────────────────────────── */

function ZaloPersonalReloadButton() {
  const onReload = () => window.location.reload();
  return (
    <button
      type="button"
      onClick={onReload}
      className="w-7 h-7 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100"
      title="Tải lại"
    >
      <HiOutlineRefresh className="w-4 h-4" />
    </button>
  );
}

/* ─── Zalo Personal (form bật/tắt chatbot cho từng account) ──────── */

function ZaloPersonalForm({ chatbot }) {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [togglingId, setTogglingId] = useState(null);

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await chatbotApi.listZaloAccountsWithChatbotSettings(chatbot.id);
      // Backend trả { success, data: [...accounts] } — accounts có thể đã
      // được bật global (is_active) hoặc chưa. Hiện tất cả để user thấy.
      const rawList = res?.data?.data || [];
      setAccounts(Array.isArray(rawList) ? rawList : []);
    } catch (e) {
      console.error('[ZaloPersonalForm] fetch failed:', e);
      toast.error('Không thể tải danh sách tài khoản Zalo.');
    } finally {
      setLoading(false);
    }
  }, [chatbot.id]);

  useEffect(() => {
    fetchAccounts();
    const onReload = () => fetchAccounts();
    window.addEventListener('zalo-personal:reload', onReload);
    return () => window.removeEventListener('zalo-personal:reload', onReload);
  }, [fetchAccounts]);

  const handleToggle = async (acc, enabled) => {
    setTogglingId(acc.id);
    try {
      // Backend endpoint mong đợi { enabled, id_chatbot } — service đã gói sẵn.
      await chatbotApi.toggleZaloAccountChatbot(acc.id, enabled, chatbot.id);
      setAccounts((prev) =>
        prev.map((a) => (a.id === acc.id ? { ...a, is_enabled: enabled, chatbot_enabled: enabled } : a))
      );
      toast.success(enabled ? `Đã bật chatbot cho ${acc.name || acc.phone || acc.zalo_user_id}` : 'Đã tắt chatbot');
    } catch (err) {
      console.error('[ZaloPersonalForm] toggle failed:', err);
      toast.error(err?.response?.data?.message || 'Không thể cập nhật.');
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
            const isOn = !!(acc.chatbot_enabled ?? acc.is_enabled);
            const busy = togglingId === acc.id;

            // Backend trả về: id, display_name, zalo_name, zalo_phone, zalo_user_id,
            // is_active, chatbot_enabled. Map sang dạng UI-friendly.
            const isLikelyZaloId = (v) => {
              if (!v) return false;
              const str = String(v).replace(/[\s-]/g, '');
              return /^\d{9,15}$/.test(str);
            };
            const candidates = [acc.display_name, acc.zalo_name, acc.zalo_phone, acc.zalo_user_id, acc.phone];
            const displayName = candidates.find(
              (v) => v && !isLikelyZaloId(v)
            ) || (acc.zalo_user_id && !isLikelyZaloId(acc.zalo_user_id) ? acc.zalo_user_id : 'Zalo Account');
            const subtitle = acc.zalo_phone && !isLikelyZaloId(acc.zalo_phone)
              ? acc.zalo_phone
              : acc.phone && !isLikelyZaloId(acc.phone)
                ? acc.phone
                : acc.zalo_user_id || `ID: ${acc.id}`;
            const avatarChar = (displayName || 'Z').charAt(0).toUpperCase();

            return (
              <div
                key={acc.id}
                className="flex items-center gap-3 px-3 py-2.5 bg-white border border-slate-200 rounded-lg hover:border-slate-300 transition-colors"
              >
                <div className="w-9 h-9 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 font-bold">
                  {acc.avatar && typeof acc.avatar === 'string' && acc.avatar.startsWith('http') ? (
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
                    {subtitle}
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
