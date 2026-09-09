import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  HiOutlineX,
  HiOutlineRefresh,
  HiOutlineChatAlt2,
} from 'react-icons/hi';
import toast from 'react-hot-toast';
import chatbotApi from '../../chatbot/services/chatbotApi.service';

/**
 * WhatsAppChannelModal — bật/tắt chatbot cho từng tài khoản WhatsApp đã liên kết.
 *
 * Phong cách giống Zalo Personal: đơn giản, không gradient rực rỡ, không tab,
 * chỉ là 1 danh sách các dòng account + toggle on/off.
 */
export default function WhatsAppChannelModal({ open, onClose, chatbotId }) {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [togglingId, setTogglingId] = useState(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape' && !togglingId) onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, togglingId, onClose]);

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await chatbotApi.listWhatsAppAccountsWithChatbotSettings(chatbotId);
      const rawList = res?.data?.data?.items || res?.data?.data || [];

      // Chuẩn hoá. KHÔNG filter `is_active` ở đây — channel có thể đã liên kết
      // thành công nhưng `is_active` được toggle off trong ChannelSettings.
      // Modal này vẫn nên cho phép bật lại AI cho account đó. Hiển thị status
      // cho user rõ account đang active hay không.
      //
      // Hỗ trợ 2 provider:
      //   - 'baileys'    : QR scan, id = session_key ("${userId}-${shortKey}")
      //   - 'cloud_api'  : Meta OAuth, id = chatbot_channel_connections.id
      const normalized = rawList.map((row) => {
        const provider = row.provider || (typeof row.id === 'string' && row.id.includes('-') ? 'baileys' : 'cloud_api');
        const linkedChatbotId = row.settings_chatbot_id ?? row.id_chatbot ?? null;
        const linkedToOtherChatbot =
          chatbotId != null && linkedChatbotId != null && Number(linkedChatbotId) !== Number(chatbotId);
        const isEnabledForCurrent = !!(row.chatbot_enabled ?? row.is_enabled);
        // Baileys: trạng thái connected = is_active. Cloud API: row.is_active.
        const isConnected = row.is_active === true || row.isActive === true || provider === 'baileys';
        return {
          id: String(row.id ?? row.session_key ?? ''),
          provider,
          displayName:
            row.display_name || row.displayName ||
            row.userName || row.short_key || 'WhatsApp Account',
          phoneNumber: row.phone_number || row.phoneNumber || '',
          wabaId: row.waba_id || row.wabaId || '',
          status: row.status || null,
          isActive: isConnected,
          isEnabled: isEnabledForCurrent,
          linkedChatbotId,
          linkedChatbotName: row.chatbot_name || '',
          linkedToOtherChatbot,
        };
      });

      setAccounts(normalized);
    } catch (err) {
      console.error('[WhatsAppChannelModal] fetch failed:', err);
      toast.error('Không thể tải danh sách tài khoản WhatsApp.');
    } finally {
      setLoading(false);
    }
  }, [chatbotId]);

  useEffect(() => {
    if (open) {
      setLoading(true);
      fetchAccounts();
    }
  }, [open, fetchAccounts]);

  const handleToggle = async (account, enabled) => {
    setTogglingId(account.id);
    try {
      // Truyền object {provider, id, session_key} để service tự dispatch đúng route.
      const accountRef = account.provider === 'baileys'
        ? { provider: 'baileys', session_key: account.id }
        : { provider: 'cloud_api', id: Number(account.id) };
      await chatbotApi.toggleWhatsAppAccountChatbot(accountRef, enabled, chatbotId);
      setAccounts((prev) =>
        prev.map((a) => (a.id === account.id ? { ...a, isEnabled: enabled } : a))
      );
      toast.success(
        enabled
          ? `Đã bật chatbot cho ${account.displayName}`
          : 'Đã tắt chatbot'
      );
    } catch (err) {
      console.error('[WhatsAppChannelModal] toggle failed:', err);
      toast.error(err?.response?.data?.message || 'Không thể cập nhật.');
    } finally {
      setTogglingId(null);
    }
  };

  if (!open || !mounted) return null;

  const modal = (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden">
        {/* Header — giống Zalo Personal: icon + title + reload + X */}
        <div className="px-5 py-4 flex items-center gap-3 border-b border-slate-100">
          <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold text-base shrink-0">
            W
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-slate-900 truncate">
              Cấu hình WhatsApp
            </h3>
            <p className="text-xs text-slate-500 mt-0.5 truncate">
              Bật chatbot cho từng tài khoản WhatsApp đã liên kết
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              fetchAccounts();
            }}
            className="w-7 h-7 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 shrink-0"
            title="Tải lại"
          >
            <HiOutlineRefresh className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 shrink-0"
          >
            <HiOutlineX className="w-4 h-4" />
          </button>
        </div>

        {/* Body — list account y hệt ZaloPersonalForm */}
        <div className="px-5 py-5">
          <div className="bg-emerald-50/50 border border-emerald-100 rounded-lg p-3 mb-4">
            <p className="text-xs text-slate-600">
              Mỗi tài khoản WhatsApp đã liên kết có thể bật/tắt chatbot độc lập.
            </p>
          </div>

          <div className="space-y-1">
            {loading ? (
              <div className="flex items-center justify-center py-8 text-slate-400 text-xs">
                <HiOutlineRefresh className="w-4 h-4 animate-spin mr-2" />
                Đang tải danh sách tài khoản...
              </div>
            ) : accounts.length === 0 ? (
              <div className="text-center py-8 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-2">
                  <HiOutlineChatAlt2 className="w-5 h-5 text-slate-400" />
                </div>
                <p className="text-sm font-medium text-slate-700">
                  Chưa liên kết tài khoản WhatsApp
                </p>
                <p className="text-xs text-slate-400 mt-1 px-6 leading-relaxed">
                  Vào{' '}
                  <a
                    href="/app/settings/channels#whatsapp"
                    target="_blank"
                    rel="noreferrer"
                    className="text-emerald-600 hover:text-emerald-700 font-medium underline underline-offset-2"
                  >
                    Cài đặt → Kênh liên kết → WhatsApp
                  </a>
                  {' '}và bấm <strong>“Tạo QR đăng nhập”</strong> để quét QR bằng WhatsApp Business trên điện thoại. Sau khi xong, quay lại đây để bật AI cho từng tài khoản.
                </p>
              </div>
            ) : (
              accounts.map((acc) => {
                const isOn = !!acc.isEnabled;
                const busy = togglingId === acc.id;
                const displayName = acc.displayName || 'WhatsApp Account';
                const avatarChar = (displayName || 'W').charAt(0).toUpperCase();

                // Baileys: status 'connecting'/'open'/'closed' → isActive = status === 'open'
                // Cloud API: isActive = row.is_active
                const isConnected = acc.isActive;
                const statusLabel = acc.provider === 'baileys'
                  ? (acc.status === 'open' ? 'Đã kết nối'
                    : acc.status === 'connecting' ? 'Đang kết nối'
                    : 'Chưa kết nối')
                  : (isConnected ? 'Đang bật' : 'Đã tắt');

                return (
                  <div
                    key={acc.id}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                      isConnected
                        ? 'bg-white border border-slate-200 hover:border-slate-300'
                        : 'bg-slate-50 border border-dashed border-slate-200 opacity-70'
                    }`}
                  >
                    {/* Avatar */}
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 font-bold ${
                      isConnected
                        ? 'bg-emerald-50 text-emerald-600'
                        : 'bg-slate-100 text-slate-400'
                    }`}>
                      {avatarChar}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-medium text-slate-900 truncate">
                          {displayName}
                        </p>
                        {!isConnected && (
                          <span className="text-[10px] font-medium text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded shrink-0">
                            {statusLabel}
                          </span>
                        )}
                        {acc.provider === 'cloud_api' && (
                          <span className="text-[10px] font-medium text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded shrink-0">
                            Cloud API
                          </span>
                        )}
                        {acc.linkedToOtherChatbot && (
                          <span
                            className="text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded shrink-0"
                            title={`Tài khoản này hiện đang được bật AI cho chatbot khác: ${acc.linkedChatbotName || `#${acc.linkedChatbotId}`}`}
                          >
                            {acc.linkedChatbotName ? `${acc.linkedChatbotName}` : `Khác chatbot`}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 truncate font-mono">
                        {acc.phoneNumber || acc.wabaId || acc.id}
                      </p>
                    </div>

                    {/* Toggle — disable khi account isActive=false (cần bật ở ChannelSettings trước) */}
                    <button
                      type="button"
                      role="switch"
                      aria-checked={isOn}
                      aria-label={isOn ? 'Tắt chatbot' : 'Bật chatbot'}
                      disabled={busy || !isConnected}
                      title={
                        !isConnected
                          ? 'Bật tài khoản trong Cài đặt → Kênh liên kết trước'
                          : acc.linkedToOtherChatbot
                            ? `Bật sẽ tạo thêm 1 cấu hình AI cho chatbot hiện tại (không ảnh hưởng ${acc.linkedChatbotName})`
                            : undefined
                      }
                      onClick={() => handleToggle(acc, !isOn)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0 ${
                        isOn ? 'bg-emerald-600' : 'bg-slate-200'
                      } ${busy || !isConnected ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <span
                        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                          isOn ? 'translate-x-5' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Footer — giống Zalo */}
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

  return createPortal(modal, document.body);
}
