import {
  HiOutlineCog,
  HiOutlinePlus,
  HiOutlineGlobeAlt,
} from 'react-icons/hi';
import { useI18n } from '../../i18n';
import { summarizeDeployment } from './studio.util';

function getGradient(chatbot) {
  const primary = chatbot?.primary_color || chatbot?.widget_settings?.primary_color || '#ee7518';
  const accent = chatbot?.accent_color || chatbot?.widget_settings?.accent_color || '#f19342';
  return `linear-gradient(135deg, ${primary}, ${accent})`;
}

const STATUS_STYLES = {
  on: { badge: 'bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500', labelKey: 'chatbot.studio.statusOn' },
  off: { badge: 'bg-slate-100 text-slate-500', dot: 'bg-slate-400', labelKey: 'chatbot.studio.statusOff' },
  locked: { badge: 'bg-amber-50 text-amber-700', dot: 'bg-amber-500', labelKey: 'chatbot.studio.statusLocked' },
};

/**
 * Đầu khung chat thử: tên bot, trạng thái, tóm tắt triển khai và các nút Cuộc trò chuyện mới / Triển khai / Cấu hình.
 * Vẽ ở MỌI cỡ màn hình (S-02: trước đây chỉ có ở nhánh màn lớn nên điện thoại/máy tính bảng không có đường mở Cấu hình).
 *
 * Huy hiệu nói đúng điều nó đo — công tắc "Trạng thái hoạt động" (`replies_enabled`), không phải "bot đang trực khách"
 * (S-05: 63/63 bot hiện "Online" dù 45/63 chưa từng ra khách). Bot bị khoá sau hạ gói hiện "Tạm khoá (vượt gói)".
 */
export default function PlaygroundHeader({ bot, onConfig, onNewChat, onOpenDeploy }) {
  const { t } = useI18n();
  if (!bot) return null;

  const gradientStyle = getGradient(bot);
  const initial = bot.name?.[0]?.toUpperCase() || '?';
  const status = bot.is_locked ? 'locked' : bot.replies_enabled !== false ? 'on' : 'off';
  const style = STATUS_STYLES[status];

  const channelLabel = (part) => {
    if (part.channel === 'web') return t('chatbot.studio.channelWeb');
    const brand = { zalo_personal: t('chatbot.studio.channelZaloPersonal'), telegram: 'Telegram', whatsapp: 'WhatsApp' }[part.channel];
    return part.count > 1 ? `${brand} (${part.count})` : brand;
  };
  const parts = summarizeDeployment(bot);
  const summary = parts.length === 0
    ? t('chatbot.studio.channelsNone')
    : t('chatbot.studio.channelsRunning', { list: parts.map(channelLabel).join(' · ') });

  return (
    <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 bg-white shrink-0">
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
            <span
              data-testid="bot-status-badge"
              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap shrink-0 ${style.badge}`}
            >
              <span className={`w-1 h-1 rounded-full ${style.dot}`} />
              {t(style.labelKey)}
            </span>
          </div>
          <p data-testid="bot-deploy-summary" className="text-[11px] text-slate-400 truncate mt-0.5">{summary}</p>
        </div>
      </div>

      {/* Right: Action buttons */}
      <div className="flex items-center gap-1 shrink-0">
        {onNewChat && (
          <button
            type="button"
            onClick={onNewChat}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            title={t('chatbot.studio.newChatTitle')}
          >
            <HiOutlinePlus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t('chatbot.studio.newChat')}</span>
          </button>
        )}
        {onOpenDeploy && (
          <button
            type="button"
            onClick={onOpenDeploy}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            title={t('chatbot.studio.tabDeploy')}
          >
            <HiOutlineGlobeAlt className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t('chatbot.studio.tabDeploy')}</span>
          </button>
        )}
        {onConfig && (
          <button
            type="button"
            onClick={() => onConfig()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-primary-500 hover:bg-primary-600 text-white transition-colors"
            title={t('chatbot.studio.openConfigTitle')}
          >
            <HiOutlineCog className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t('chatbot.studio.configBtn')}</span>
          </button>
        )}
      </div>
    </div>
  );
}
