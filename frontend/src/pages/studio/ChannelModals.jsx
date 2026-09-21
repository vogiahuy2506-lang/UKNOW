import { useState, useEffect, useCallback } from 'react';
import {
  HiOutlineX,
  HiOutlineCheckCircle,
  HiOutlineClipboardCopy,
  HiOutlineRefresh,
  HiOutlineUserCircle,
  HiOutlineExternalLink,
} from 'react-icons/hi';
import toast from 'react-hot-toast';
import chatbotApi from '../../features/chatbot/services/chatbotApi.service';
import WhatsAppChannelModal from '../../features/chatbot/components/WhatsAppChannelModal';
import TelegramChannelModal from '../../features/chatbot/components/TelegramChannelModal';

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

  // Telegram personal accounts use the same per-chatbot toggle pattern as
  // WhatsApp / Zalo Personal — render the dedicated modal.
  if (channel === 'telegram_personal') {
    return (
      <TelegramChannelModal
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
  const [appId, setAppId] = useState('');
  const [appSecret, setAppSecret] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [webhook, setWebhook] = useState('');
  const [oaInfo, setOaInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    const fetchOa = async () => {
      try {
        const res = await chatbotApi.getZaloOaConfig(chatbot.id);
        const d = res?.data?.data ?? res?.data;
        if (d) {
          setAppId(d.external_channel_id || d.zalo_app_id || '');
          setDisplayName(d.display_name || '');
          if (d.webhook_url) setWebhook(d.webhook_url);
          setOaInfo(d);
        }
      } catch (e) {
        console.error('[ZaloForm] fetch failed:', e);
        toast.error(e?.response?.data?.message || 'Không thể tải cấu hình Zalo OA.');
      } finally {
        setLoading(false);
      }
    };
    fetchOa();
  }, [chatbot.id]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await chatbotApi.saveZaloOaConfig(chatbot.id, {
        zalo_app_id: appId.trim(),
        zalo_app_secret: appSecret.trim(),
        display_name: displayName.trim() || undefined,
      });
      const saved = res?.data || res;
      if (saved?.webhook_url) setWebhook(saved.webhook_url);
      setOaInfo(saved);
      toast.success(res?.message || 'Đã lưu cấu hình Zalo OA.');
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
        <label className="block text-xs font-medium text-slate-700 mb-1">App ID (Zalo App ID)</label>
        <input
          type="text"
          value={appId}
          onChange={(e) => setAppId(e.target.value)}
          placeholder="VD: 1234567890"
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-700 mb-1">App Secret (Secret Key)</label>
        <input
          type="password"
          value={appSecret}
          onChange={(e) => setAppSecret(e.target.value)}
          placeholder="••••••••"
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-700 mb-1">Tên hiển thị (tuỳ chọn)</label>
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="VD: Zalo OA Chăm sóc khách hàng"
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-700 mb-1">Webhook URL</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={webhook || 'Nối xong sẽ hiện'}
            readOnly
            className="flex-1 px-3 py-2 text-xs border border-slate-200 rounded-lg bg-slate-50 font-mono text-slate-600"
          />
          <button
            type="button"
            disabled={!webhook}
            onClick={() => {
              if (!webhook) return;
              navigator.clipboard.writeText(webhook);
              toast.success('Đã copy webhook.');
            }}
            className="px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50 border border-slate-200 rounded-lg"
            title="Copy Webhook URL"
          >
            <HiOutlineClipboardCopy className="w-4 h-4" />
          </button>
        </div>
      </div>

      {oaInfo?.is_active || oaInfo?.display_name ? (
        <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 px-3 py-2 rounded-lg">
          <HiOutlineCheckCircle className="w-4 h-4" />
          {oaInfo?.display_name ? `Đã kết nối: ${oaInfo.display_name}` : 'OA đã kết nối'}
        </div>
      ) : null}

      <div className="flex gap-2 pt-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !appId || !appSecret}
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

/**
 * Facebook Messenger connection form.
 *
 * Flow:
 *   Step 1 — Kết nối Fanpage  (OAuth hoặc nhập tay Page ID + Token)
 *   Step 2 — Cấu hình Webhook  (copy URL + Verify Token vào Meta App Dashboard)
 *   Step 3 — Trạng thái       (chỉ hiện khi đã kết nối thành công)
 *
 * OAuth: backend đã subscribe page tự động sau khi user ủy quyền thành công.
 */
function FacebookForm({ chatbot }) {
  // ── State ─────────────────────────────────────────────────────
  const [step, setStep] = useState(1);         // 1 | 2 | 3
  const [mode, setMode] = useState('oauth');    // 'oauth' | 'manual'
  const [pages, setPages] = useState([]);
  const [selectedConnId, setSelectedConnId] = useState(null);
  const [loadingPages, setLoadingPages] = useState(true);
  const [initOAuthLoading, setInitOAuthLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Step 2: webhook config shown after save
  const [config, setConfig] = useState(null);    // { webhook_url, verify_token, display_name }

  // Manual mode inputs
  const [manualPageId, setManualPageId] = useState('');
  const [manualToken, setManualToken] = useState('');
  const [manualName, setManualName] = useState('');

  // ── Load existing connections + current chatbot config ───────────
  const loadConnections = useCallback(async () => {
    setLoadingPages(true);
    try {
      const [pagesRes, cfgRes] = await Promise.allSettled([
        chatbotApi.getFacebookPagesForChatbot(chatbot.id),
        chatbotApi.getFacebookPageConfig(chatbot.id),
      ]);

      // Pages list from ChannelSettings
      const list = pagesRes.status === 'fulfilled' ? (pagesRes.value?.data?.data || []) : [];
      setPages(list);

      // Existing chatbot config (if any)
      // Backend returns { success, data: [channels] } → axios wraps as response.data
      if (cfgRes.status === 'fulfilled' && cfgRes.value?.data?.data) {
        const allChannels = cfgRes.value.data.data;
        const cfg = Array.isArray(allChannels)
          ? allChannels.find((c) => c.channel_type === 'facebook' && c.is_active !== false)
          : null;
        if (cfg && cfg.webhook_url) {
          setConfig({
            webhook_url: cfg.webhook_url,
            verify_token: cfg.verify_token || cfg.credentials?.verify_token || '',
            display_name: cfg.display_name || cfg.fb_page_name || '',
          });
          setStep(3);
        }
      }

      // Auto-select the currently active page
      if (list.length > 0) {
        const active = list.find((p) => p.is_active_on_this_chatbot);
        if (active) setSelectedConnId(active.id);
      }
    } catch (e) {
      console.error('[FacebookForm] load failed:', e);
      toast.error(e?.response?.data?.message || 'Không thể tải cấu hình Facebook.');
    } finally {
      setLoadingPages(false);
    }
  }, [chatbot.id]);

  useEffect(() => { loadConnections(); }, [loadConnections]);

  // ── OAuth init ────────────────────────────────────────────────
  const handleInitOAuth = async () => {
    setInitOAuthLoading(true);
    try {
      const res = await chatbotApi.initFacebookOAuthStudio(chatbot.id);
      const authUrl = res?.data?.auth_url;
      if (!authUrl) throw new Error('Không nhận được link OAuth từ server.');

      const popup = window.open(
        authUrl,
        'facebook_oauth',
        'width=600,height=700,scrollbars=yes'
      );
      if (!popup) {
        toast.error('Trình duyệt chặn popup. Vui lòng cho phép popup cho trang này.');
        return;
      }

      // Poll popup: when it closes, reload connections + move to step 2 if a page was saved.
      const poll = setInterval(() => {
        if (popup.closed) {
          clearInterval(poll);
          loadConnections().then(() => {
            // If page was saved (page list updated), go to step 2
            if (pages.length > 0 || selectedConnId) setStep(2);
          });
        }
      }, 1000);
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message || 'Khởi tạo OAuth thất bại.');
    } finally {
      setInitOAuthLoading(false);
    }
  };

  // ── Save picker selection ──────────────────────────────────────
  const handleSavePicker = async () => {
    if (!selectedConnId) {
      toast.error('Vui lòng chọn một Fanpage.');
      return;
    }
    setSaving(true);
    try {
      const res = await chatbotApi.saveFacebookPageConfig(chatbot.id, {
        channel_connection_id: selectedConnId,
      });
      const saved = res?.data?.data || res;
      if (saved) {
        setConfig({
          webhook_url: saved.webhook_url || '',
          verify_token: saved.verify_token || '',
          display_name: saved.display_name || '',
        });
      }
      toast.success(res?.message || 'Đã kết nối Fanpage với chatbot.');
      setStep(2);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Lưu thất bại.');
    } finally {
      setSaving(false);
    }
  };

  // ── Save manual inputs ─────────────────────────────────────────
  const handleSaveManual = async () => {
    if (!manualPageId.trim() || !manualToken.trim()) {
      toast.error('Page ID và Page Access Token là bắt buộc.');
      return;
    }
    setSaving(true);
    try {
      const res = await chatbotApi.saveFacebookPageConfig(chatbot.id, {
        page_id: manualPageId.trim(),
        page_access_token: manualToken.trim(),
        page_name: manualName.trim() || undefined,
      });
      const saved = res?.data?.data || res;
      if (saved) {
        setConfig({
          webhook_url: saved.webhook_url || '',
          verify_token: saved.verify_token || '',
          display_name: saved.display_name || manualName.trim(),
        });
      }
      toast.success(res?.message || 'Đã kết nối Fanpage với chatbot.');
      setStep(2);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Lưu thất bại.');
    } finally {
      setSaving(false);
    }
  };

  // ── Copy to clipboard helper ──────────────────────────────────
  const copyToClipboard = (text, label) => {
    navigator.clipboard.writeText(text).then(() => toast.success(`Đã copy ${label}.`));
  };

  // ── Render ────────────────────────────────────────────────────
  const hasPages = pages.length > 0;
  const selectedPage = pages.find((p) => p.id === selectedConnId);

  return (
    <div className="space-y-5">

      {/* Step 1: Kết nối Fanpage */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <span className="flex items-center justify-center w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] font-bold">1</span>
          <span className="text-sm font-semibold text-slate-800">Kết nối Fanpage</span>
        </div>

        {/* OAuth vs Manual toggle */}
        <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs mb-3">
          <button
            type="button"
            onClick={() => setMode('oauth')}
            className={`flex-1 px-3 py-2 font-medium transition-colors ${
              mode === 'oauth' ? 'bg-indigo-50 text-indigo-700' : 'bg-white text-slate-500 hover:bg-slate-50'
            }`}
          >
            🔗 Kết nối qua Facebook
          </button>
          <button
            type="button"
            onClick={() => setMode('manual')}
            className={`flex-1 px-3 py-2 font-medium transition-colors ${
              mode === 'manual' ? 'bg-indigo-50 text-indigo-700' : 'bg-white text-slate-500 hover:bg-slate-50'
            }`}
          >
            ✏️ Nhập tay
          </button>
        </div>

        {mode === 'oauth' ? (
          <div className="space-y-3">
            {loadingPages ? (
              /* Skeleton while loading pages */
              <div className="space-y-2">
                {[1, 2].map((i) => (
                  <div key={i} className="h-14 rounded-lg bg-slate-100 animate-pulse" />
                ))}
              </div>
            ) : hasPages ? (
              /* Picker: show linked pages from ChannelSettings */
              <div className="space-y-2">
                {pages.map((p) => {
                  const isActive = p.is_active_on_this_chatbot;
                  const isSelected = selectedConnId === p.id;
                  return (
                    <label
                      key={p.id}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-all ${
                        isSelected
                          ? 'border-indigo-400 bg-indigo-50 ring-1 ring-indigo-300'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="fb-page"
                        value={p.id}
                        checked={isSelected}
                        onChange={() => setSelectedConnId(p.id)}
                        className="w-4 h-4 text-indigo-600 focus:ring-indigo-500 shrink-0"
                      />
                      <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-sm shrink-0">
                        f
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">
                          {p.fb_page_name || p.display_name || 'Facebook Page'}
                        </p>
                        <p className="text-[11px] text-slate-400 font-mono truncate">
                          ID: {p.fb_page_id}
                        </p>
                      </div>
                      {isActive && (
                        <span className="shrink-0 inline-flex items-center gap-1 text-[11px] text-green-700 bg-green-50 px-2 py-0.5 rounded-full border border-green-200">
                          <HiOutlineCheckCircle className="w-3 h-3" />
                          Đang dùng
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            ) : (
              /* No pages linked yet — guide to ChannelSettings */
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-center">
                <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-2">
                  <span className="text-lg font-bold text-slate-400">f</span>
                </div>
                <p className="text-sm font-medium text-slate-600 mb-1">Chưa có Fanpage nào được liên kết</p>
                <p className="text-xs text-slate-400 mb-3">
                  Bấm nút bên dưới để ủy quyền với Meta.
                </p>
              </div>
            )}

            {/* Primary OAuth button */}
            <button
              type="button"
              onClick={handleInitOAuth}
              disabled={initOAuthLoading}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {initOAuthLoading ? (
                <>
                  <HiOutlineRefresh className="w-4 h-4 animate-spin" />
                  Đang mở...
                </>
              ) : (
                <>
                  <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                  </svg>
                  Kết nối tài khoản Facebook
                </>
              )}
            </button>

            {/* Reload pages list */}
            <button
              type="button"
              onClick={loadConnections}
              className="w-full flex items-center justify-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 transition-colors py-1"
            >
              <HiOutlineRefresh className="w-3 h-3" />
              Tải lại danh sách Fanpage
            </button>

            {/* Save picker selection */}
            {hasPages && (
              <button
                type="button"
                onClick={handleSavePicker}
                disabled={saving || !selectedConnId}
                className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white text-sm font-medium rounded-lg transition-colors"
              >
                {saving ? 'Đang lưu...' : 'Lưu cấu hình'}
              </button>
            )}
          </div>
        ) : (
          /* Manual mode */
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Page ID</label>
              <input
                type="text"
                value={manualPageId}
                onChange={(e) => setManualPageId(e.target.value)}
                placeholder="VD: 1234567890"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-300"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Page Access Token</label>
              <input
                type="password"
                value={manualToken}
                onChange={(e) => setManualToken(e.target.value)}
                placeholder="EAAxxxxxxx..."
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-300"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Tên Page (tuỳ chọn)</label>
              <input
                type="text"
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
                placeholder="VD: UKNOW Official Fanpage"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-300"
              />
            </div>
            <button
              type="button"
              onClick={handleSaveManual}
              disabled={saving || !manualPageId.trim() || !manualToken.trim()}
              className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {saving ? 'Đang lưu...' : 'Lưu cấu hình'}
            </button>
          </div>
        )}
      </div>

      {/* Step 2: Cấu hình Webhook — chỉ hiện khi đã save */}
      {step >= 2 && config?.webhook_url && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] font-bold">2</span>
            <span className="text-sm font-semibold text-slate-800">Cấu hình Webhook trên Meta</span>
          </div>

          <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-4 space-y-4">
            <p className="text-xs text-slate-600 leading-relaxed">
              Copy <strong>Webhook URL</strong> và <strong>Verify Token</strong> bên dưới,
              sau đó paste vào <strong>Meta App Dashboard → Messenger → Webhook</strong> và bấm
              <strong> Verify and Save</strong>.
            </p>

            {/* Webhook URL */}
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Webhook URL</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={config.webhook_url}
                  readOnly
                  className="flex-1 px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white font-mono text-slate-700 truncate"
                />
                <button
                  type="button"
                  onClick={() => copyToClipboard(config.webhook_url, 'Webhook URL')}
                  className="px-3 py-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors shrink-0"
                  title="Copy"
                >
                  <HiOutlineClipboardCopy className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Verify Token */}
            {config.verify_token && (
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Verify Token</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={config.verify_token}
                    readOnly
                    className="flex-1 px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white font-mono text-slate-700 truncate"
                  />
                  <button
                    type="button"
                    onClick={() => copyToClipboard(config.verify_token, 'Verify Token')}
                    className="px-3 py-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors shrink-0"
                    title="Copy"
                  >
                    <HiOutlineClipboardCopy className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Tick thêm fields: <code className="bg-slate-100 px-1 rounded">messages</code>,{' '}
                  <code className="bg-slate-100 px-1 rounded">messaging_postbacks</code>
                </p>
              </div>
            )}

            {/* External link to Meta */}
            <a
              href="https://developers.facebook.com/apps"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-700 font-medium"
            >
              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
              </svg>
              Mở Meta App Dashboard
              <HiOutlineExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      )}

      {/* Step 3: Trạng thái — chỉ hiện khi đã save */}
      {step >= 3 && config?.webhook_url && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-green-600 text-white text-[10px] font-bold">3</span>
            <span className="text-sm font-semibold text-slate-800">Trạng thái</span>
          </div>

          <div className="rounded-xl border border-green-100 bg-green-50/60 p-4 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-green-100 text-green-600 flex items-center justify-center shrink-0">
              <HiOutlineCheckCircle className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-green-800">
                {config.display_name || 'Fanpage'} đã kết nối thành công
              </p>
              <p className="text-xs text-green-600 mt-0.5">
                Tin nhắn Messenger sẽ được chatbot tự động trả lời.
              </p>
            </div>
          </div>

          {/* Re-configure link */}
          <button
            type="button"
            onClick={() => {
              setStep(1);
              setConfig(null);
              loadConnections();
            }}
            className="w-full mt-2 flex items-center justify-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 py-1"
          >
            <HiOutlineRefresh className="w-3 h-3" />
            Thay đổi Fanpage kết nối
          </button>
        </div>
      )}

      {/* Help card */}
      {step === 1 && (
        <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
          <p className="text-xs font-medium text-slate-600 mb-1">📌 Hướng dẫn nhanh</p>
          <ol className="text-[11px] text-slate-500 space-y-0.5 list-decimal list-inside">
            <li>Bấm <strong>"Kết nối tài khoản Facebook"</strong> để ủy quyền với Meta.</li>
            <li>Chọn Fanpage muốn kết nối và bấm <strong>Lưu cấu hình</strong>.</li>
            <li>Copy <strong>Webhook URL</strong> + <strong>Verify Token</strong> vào Meta App Dashboard.</li>
            <li>Bấm <strong>Verify and Save</strong> trên Meta để hoàn tất.</li>
          </ol>
        </div>
      )}
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
