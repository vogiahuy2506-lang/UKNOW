import {
  HiOutlineCog,
  HiOutlineShare,
  HiOutlinePlus,
  HiOutlineDotsHorizontal,
} from 'react-icons/hi';

function getGradient(chatbot) {
  const primary = chatbot?.primary_color || chatbot?.widget_settings?.primary_color || '#ee7518';
  const accent = chatbot?.accent_color || chatbot?.widget_settings?.accent_color || '#f19342';
  return `linear-gradient(135deg, ${primary}, ${accent})`;
}

export default function PlaygroundHeader({ bot, onConfig, onShare, onNewChat, onMenu }) {
  if (!bot) return null;

  const gradientStyle = getGradient(bot);
  const initial = bot.name?.[0]?.toUpperCase() || '?';

  return (
    <div className="flex items-center justify-between gap-3 px-5 py-3 bg-white shrink-0">
      {/* Left: Avatar + Name */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {bot.logo_url ? (
          <img src={bot.logo_url} alt="" className="w-9 h-9 rounded-lg object-cover shrink-0" />
        ) : bot.avatar_url ? (
          <img src={bot.avatar_url} alt="" className="w-9 h-9 rounded-lg object-cover shrink-0" />
        ) : (
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center text-white text-sm font-semibold shrink-0"
            style={{ background: gradientStyle }}
          >
            {initial}
          </div>
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-900 truncate tracking-tight">{bot.name}</h2>
            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium ${
              bot.is_active !== false ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
            }`}>
              <span className={`w-1 h-1 rounded-full ${bot.is_active !== false ? 'bg-emerald-500' : 'bg-slate-400'}`} />
              {bot.is_active !== false ? 'Online' : 'Offline'}
            </span>
          </div>
        </div>
      </div>

      {/* Right: Action buttons */}
      <div className="flex items-center gap-1 shrink-0">
        {onNewChat && (
          <button
            type="button"
            onClick={onNewChat}
            className="hidden lg:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            title="Bắt đầu cuộc trò chuyện mới"
          >
            <HiOutlinePlus className="w-3.5 h-3.5" />
            <span>Chat mới</span>
          </button>
        )}
        {onShare && (
          <button
            type="button"
            onClick={onShare}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            title="Chia sẻ chatbot"
          >
            <HiOutlineShare className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Chia sẻ</span>
          </button>
        )}
        {onConfig && (
          <button
            type="button"
            onClick={onConfig}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-primary-500 hover:bg-primary-600 text-white transition-colors"
            title="Mở cấu hình chatbot"
          >
            <HiOutlineCog className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Cấu hình</span>
          </button>
        )}
        {onMenu && (
          <button
            type="button"
            onClick={onMenu}
            className="inline-flex items-center justify-center w-8 h-8 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            title="Tùy chọn"
          >
            <HiOutlineDotsHorizontal className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
