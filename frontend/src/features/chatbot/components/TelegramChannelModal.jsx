import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  HiOutlineX,
  HiOutlineRefresh,
} from 'react-icons/hi';
import { FaTelegramPlane } from 'react-icons/fa';
import toast from 'react-hot-toast';
import chatbotApi from '../../chatbot/services/chatbotApi.service';

/**
 * TelegramChannelModal — bật/tắt chatbot cho từng tài khoản Telegram cá nhân
 * đã liên kết qua QR login (Telethon ở Python gateway).
 *
 * Phong cách giống Zalo Personal / WhatsApp: đơn giản, không gradient rực rỡ,
 * không tab, chỉ là 1 danh sách các dòng account + toggle on/off.
 */
export default function TelegramChannelModal({ open, onClose, chatbotId }) {
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
      const res = await chatbotApi.listTelegramAccountsWithChatbotSettings(chatbotId);
      const rawList = res?.data?.data?.items || res?.data?.data || [];

      // Mirror WhatsApp modal: KHÔNG filter is_active ở đây. Telegram account
      // có thể đã liên kết nhưng tạm thời ngắt kết nối (is_active=false
      // từ logout) — vẫn cho phép bật AI sẵn để khi kết nối lại sẽ chạy ngay.
      const normalized = rawList.map((row) => {
        const fullName = [row.first_name, row.last_name].filter(Boolean).join(' ');
        const displayName = fullName || row.username || row.phone || 'Telegram User';
        const linkedChatbotId = row.settings_chatbot_id ?? row.id_chatbot ?? null;
        const linkedToOtherChatbot =
          chatbotId != null && linkedChatbotId != null && Number(linkedChatbotId) !== Number(chatbotId);
        const isEnabledForCurrent = !!(row.chatbot_enabled ?? row.is_enabled);
        const isConnected = !!row.is_loaded;       // gateway đang giữ client
        const isActive = row.is_active !== false;   // row chưa bị deactivate
        return {
          id: row.id,
          displayName,
          username: row.username,
          phone: row.phone,
          telegramUserId: row.telegram_user_id,
          isLoaded: isConnected,
          isActive,
          isEnabled: isEnabledForCurrent,
          isEnabledDm: row.chatbot_enabled_dm !== false,
          isEnabledGroup: !!row.chatbot_enabled_group,
          linkedChatbotId,
          linkedChatbotName: row.chatbot_name || '',
          linkedToOtherChatbot,
        };
      });

      setAccounts(normalized);
    } catch (err) {
      console.error('[TelegramChannelModal] fetch failed:', err);
      toast.error('Không thể tải danh sách tài khoản Telegram.');
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
      await chatbotApi.toggleTelegramAccountChatbot(account.id, enabled, chatbotId);
      setAccounts((prev) =>
        prev.map((a) => (a.id === account.id ? { ...a, isEnabled: enabled } : a))
      );
      toast.success(
        enabled
          ? `Đã bật chatbot cho ${account.displayName}`
          : 'Đã tắt chatbot'
      );
    } catch (err) {
      console.error('[TelegramChannelModal] toggle failed:', err);
      toast.error(err?.response?.data?.message || 'Không thể cập nhật.');
    } finally {
      setTogglingId(null);
    }
  };

  if (!open || !mounted) return null;

  const modal = (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 flex items-center gap-3 border-b border-slate-100">
          <div className="w-10 h-10 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center shrink-0">
            <FaTelegramPlane className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-slate-900 truncate">
              Cấu hình Telegram cá nhân
            </h3>
            <p className="text-xs text-slate-500 mt-0.5 truncate">
              Bật chatbot cho từng tài khoản Telegram đã liên kết
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

        {/* Body */}
        <div className="px-5 py-5">
          <div className="bg-sky-50/50 border border-sky-100 rounded-lg p-3 mb-4">
            <p className="text-xs text-slate-600">
              Mỗi tài khoản Telegram cá nhân đã liên kết có thể bật/tắt chatbot
              độc lập. Khi tắt, tài khoản vẫn nhận tin nhắn nhưng không tự trả lời.
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
                  <FaTelegramPlane className="w-5 h-5 text-slate-400" />
                </div>
                <p className="text-sm font-medium text-slate-700">
                  Chưa liên kết tài khoản Telegram
                </p>
                <p className="text-xs text-slate-400 mt-1 px-6 leading-relaxed">
                  Vào{' '}
                  <a
                    href="/app/settings/channels#telegram"
                    target="_blank"
                    rel="noreferrer"
                    className="text-sky-600 hover:text-sky-700 font-medium underline underline-offset-2"
                  >
                    Cài đặt → Kênh liên kết → Telegram
                  </a>
                  {' '}và bấm <strong>“Kết nối tài khoản Telegram”</strong> để quét QR bằng Telegram trên điện thoại. Sau khi xong, quay lại đây để bật AI cho từng tài khoản.
                </p>
              </div>
            ) : (
              accounts.map((acc) => {
                const isOn = !!acc.isEnabled;
                const busy = togglingId === acc.id;
                const displayName = acc.displayName || 'Telegram User';
                const avatarChar = (displayName || 'T').charAt(0).toUpperCase();
                const statusLabel = !acc.isActive
                  ? 'Đã tắt'
                  : acc.isLoaded
                    ? 'Đã kết nối'
                    : 'Chưa kết nối';

                return (
                  <div
                    key={acc.id}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                      acc.isActive
                        ? 'bg-white border border-slate-200 hover:border-slate-300'
                        : 'bg-slate-50 border border-dashed border-slate-200 opacity-70'
                    }`}
                  >
                    {/* Avatar */}
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 font-bold ${
                      acc.isActive
                        ? 'bg-sky-50 text-sky-600'
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
                        {!acc.isActive && (
                          <span className="text-[10px] font-medium text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded shrink-0">
                            {statusLabel}
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
                        {acc.username
                          ? `@${acc.username}`
                          : acc.phone
                            ? acc.phone
                            : `ID: ${acc.telegramUserId}`}
                      </p>
                    </div>

                    {/* Toggle — disable khi account isActive=false (cần bật ở ChannelSettings trước) */}
                    <button
                      type="button"
                      role="switch"
                      aria-checked={isOn}
                      aria-label={isOn ? 'Tắt chatbot' : 'Bật chatbot'}
                      disabled={busy || !acc.isActive}
                      title={
                        !acc.isActive
                          ? 'Kích hoạt tài khoản trong Cài đặt → Kênh liên kết trước'
                          : acc.linkedToOtherChatbot
                            ? `Bật sẽ tạo thêm 1 cấu hình AI cho chatbot hiện tại (không ảnh hưởng ${acc.linkedChatbotName})`
                            : undefined
                      }
                      onClick={() => handleToggle(acc, !isOn)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0 ${
                        isOn ? 'bg-sky-600' : 'bg-slate-200'
                      } ${busy || !acc.isActive ? 'opacity-50 cursor-not-allowed' : ''}`}
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

        {/* Footer */}
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
