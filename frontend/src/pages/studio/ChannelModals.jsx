import { useState, useEffect, useCallback } from 'react';
import {
  HiOutlineX,
  HiOutlineRefresh,
  HiOutlineUserCircle,
} from 'react-icons/hi';
import toast from 'react-hot-toast';
import chatbotApi from '../../features/chatbot/services/chatbotApi.service';
import WhatsAppChannelModal from '../../features/chatbot/components/WhatsAppChannelModal';
import TelegramChannelModal from '../../features/chatbot/components/TelegramChannelModal';
import { useI18n } from '../../i18n';

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

  // Zalo OA và Facebook đã gỡ khỏi Studio (S-04): Facebook chốt bỏ 21/09/2026, Zalo OA chưa từng có một lần nối nào.
  if (channel !== 'zalo_personal') return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden">
        <div className="px-5 py-4 flex items-center gap-3 border-b border-slate-100">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center font-bold text-base shrink-0 bg-orange-50 text-orange-600">
            Z
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-slate-900 truncate">Cấu hình Zalo cá nhân</h3>
            <p className="text-xs text-slate-500 mt-0.5 truncate">Bật chatbot cho tài khoản Zalo cá nhân của bạn</p>
          </div>
          <ZaloPersonalReloadButton />
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 shrink-0"
          >
            <HiOutlineX className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-5">
          <ZaloPersonalForm chatbot={chatbot} />
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
  // Chỉ tải lại danh sách tài khoản của hộp này (ZaloPersonalForm lắng nghe sự kiện), không tải lại cả trang (S-25):
  // F5 làm mất bot đang chọn và cả đoạn chat thử đang dở.
  const onReload = () => window.dispatchEvent(new Event('zalo-personal:reload'));
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
  const { t } = useI18n();
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
      // 409: tài khoản đã gắn chatbot khác (dữ liệu trên màn đã cũ) → tải lại để hiện huy hiệu "Đang bật cho: …".
      if (err?.response?.status === 409) fetchAccounts();
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-orange-50/50 border border-orange-100 rounded-lg p-3">
        <p className="text-xs text-slate-600">
          {t('chatbot.studio.zaloPersonalIntro')}
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
              {t('chatbot.studio.channelsGoTo')}{' '}
              <a
                href="/app/settings/channels"
                target="_blank"
                rel="noreferrer"
                className="text-primary-600 hover:text-primary-700 font-medium underline underline-offset-2"
              >
                {t('chatbot.studio.channelsPathZalo')}
              </a>{' '}
              {t('chatbot.studio.channelsAddAccountThenReturn')}
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
            // 1 tài khoản = 1 chatbot (S-12): bot KHÁC đang bật trên tài khoản này thì không bật thêm ở đây.
            const otherBotName = acc.other_chatbot_name || '';
            const blockedByOther = Boolean(otherBotName) && !isOn;

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
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-medium text-slate-900 truncate">
                      {displayName}
                    </p>
                    {otherBotName && (
                      <span
                        className="text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded shrink-0 max-w-[140px] truncate"
                        title={t(isOn ? 'chatbot.studio.zaloBoundBothTitle' : 'chatbot.studio.zaloBoundBlockedTitle', { name: otherBotName })}
                      >
                        {t('chatbot.studio.zaloBoundBadge', { name: otherBotName })}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 truncate">
                    {subtitle}
                  </p>
                </div>
                <Toggle checked={isOn} disabled={busy || blockedByOther} onChange={(v) => handleToggle(acc, v)} />
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
