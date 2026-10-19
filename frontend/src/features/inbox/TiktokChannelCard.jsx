/**
 * TiktokChannelCard.jsx
 *
 * Card hiển thị 1 TikTok Business account ở sidebar Hộp thư. Pattern copy từ
 * channel card Facebook/Zalo/WhatsApp đã có: avatar (initials màu),
 * displayName, unread count, indicator trạng thái AI (bật/tắt/paused).
 *
 * Điểm khác biệt so với các channel khác:
 * - Thêm indicator "rate-limited" (màu cam) khi `account.aiStatus = 'rate_limited'` —
 *   sẽ được set bởi polling service ở backend (PR-5 việc 8).
 * - Avatar gradient hồng (TikTok brand) thay vì các màu khác.
 *
 * Component này là CON — parent (`TiktokConversationList`) truyền props xuống.
 * Không gọi API trực tiếp ở đây (data flow một chiều từ BE qua parent).
 *
 * Việc 8.2 của plan tiktok-business-messaging-integration.md.
 */

/**
 * Trạng thái AI (5 loại):
 * - 'ai'   : AI đang bật (màu xanh)
 * - 'paused': Tạm dừng bởi agent (màu vàng)
 * - 'off'  : AI tắt vĩnh viễn (màu xám)
 * - 'rate_limited': Đã đụng rate limit 10/48h (màu cam)
 * - 'paused_auto' : AI tự tắt (auto-pause), sẽ tự bật lại (màu tím)
 */
function StatusDot({ status }) {
  const map = {
    ai: { bg: 'bg-green-500', title: 'AI đang bật' },
    paused: { bg: 'bg-amber-500', title: 'Tạm dừng' },
    off: { bg: 'bg-gray-400', title: 'AI tắt' },
    rate_limited: { bg: 'bg-orange-500', title: 'Đã đụng rate limit 10/48h' },
    paused_auto: { bg: 'bg-violet-500', title: 'AI tạm nghỉ' },
  };
  const cfg = map[status] || map.off;
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${cfg.bg} ${status === 'paused_auto' ? 'animate-pulse' : ''}`}
      title={cfg.title}
      aria-label={cfg.title}
    />
  );
}

/**
 * Lấy initials từ display_name hoặc fallback về business_id.
 * @param {string} name
 * @returns {string} 1-2 ký tự uppercase
 */
function getInitials(name) {
  const value = String(name || '').trim();
  if (!value) return '?';
  // Nếu toàn emoji (vd: 🎵🎵) → trả 1 emoji đầu (một số browser render lỗi
  // nếu ép thành 2 emoji cạnh nhau trong avatar tròn 40×40)
  const emojiOnly = /^[\p{Emoji_Presentation}\p{Extended_Pictographic}]+$/u;
  if (emojiOnly.test(value)) {
    return Array.from(value)[0];
  }
  // TikTok username thường có @ ở đầu — bỏ qua
  const cleaned = value.replace(/^@/, '');
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * @param {object} props
 * @param {object} props.account - { id, display_name, business_id, region, role, is_active, unread, aiStatus }
 * @param {boolean} props.selected
 * @param {function} props.onSelect
 */
export default function TiktokChannelCard({ account, selected, onSelect }) {
  if (!account) return null;
  // Fallback 2 tầng: display_name → business_id → '?'
  const initials = getInitials(account.display_name || account.business_id);
  const unread = Number.isFinite(account.unread) ? account.unread : 0;
  const status = account.aiStatus || (account.is_active === false ? 'off' : 'ai');

  return (
    <button
      type="button"
      onClick={() => onSelect?.(account)}
      className={`group w-full text-left rounded-xl border px-3 py-2.5 flex items-center gap-3 transition-all ${
        selected
          ? 'border-pink-300 bg-pink-50/70 ring-1 ring-pink-200'
          : 'border-gray-200 bg-white hover:bg-gray-50 hover:border-gray-300'
      }`}
      data-testid={`tiktok-channel-card-${account.id}`}
    >
      {/* Avatar với gradient hồng (TikTok brand) */}
      <div className="relative shrink-0">
      <div
        className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold text-sm text-white shadow-sm ${
          account.is_active === false
            ? 'bg-gradient-to-br from-gray-300 to-gray-400'
            : 'bg-gradient-to-br from-pink-500 via-red-500 to-cyan-500'
        }`}
        data-testid="tiktok-avatar"
      >
        {initials}
      </div>
        {/* Status dot ở góc dưới phải */}
        <div className="absolute -bottom-0.5 -right-0.5 bg-white rounded-full p-0.5">
          <span data-testid="tiktok-status-dot">
            <StatusDot status={status} />
          </span>
        </div>
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-semibold text-gray-900 truncate">
            {account.display_name || account.business_id}
          </p>
          {unread > 0 ? (
            <span className="shrink-0 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-pink-600 text-white text-[10px] font-bold">
              {unread > 99 ? '99+' : unread}
            </span>
          ) : null}
        </div>
        <p className="text-xs text-gray-500 truncate mt-0.5">
          <span className="font-mono">{account.business_id}</span>
          {account.region ? (
            <>
              <span className="mx-1.5 text-gray-300">·</span>
              <span>{account.region}</span>
            </>
          ) : null}
        </p>
      </div>
    </button>
  );
}
