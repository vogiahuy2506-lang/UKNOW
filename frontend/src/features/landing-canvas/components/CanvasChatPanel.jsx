import { useI18n } from '../../../i18n';
import {
  HiOutlineSparkles,
  HiOutlineX,
  HiOutlineLightBulb,
  HiOutlinePencilAlt,
  HiOutlineColorSwatch,
  HiOutlinePhotograph,
  HiOutlineCode,
} from 'react-icons/hi';
import ChatMessage from './ChatMessage.jsx';
import ChatComposer from './ChatComposer.jsx';
import useCanvasConversation from '../hooks/useCanvasConversation.js';
import { CHAT_QUICK_PICKS } from '../utils/chatPromptTemplates.js';

/**
 * Chat panel bên trái canvas — thiết kế lại theo style hiện đại.
 *
 * Props giữ nguyên hợp đồng cũ để LandingCanvasLayout không phải đổi:
 *  - form, setForm: form state của LandingCanvasEditor
 *  - openTab(tab): mở 1 tab trong SettingsModal
 *  - collapsed: bool
 *  - onToggleCollapsed: callback toggle mở/thu nhỏ
 */
export default function CanvasChatPanel({ form, setForm, openTab, collapsed, onToggleCollapsed }) {
  const tc = useI18n('landingCanvas.chat');
  const hasExistingHtml = Boolean(String(form?.htmlContent || '').trim());

  const {
    messages,
    isStreaming,
    handleSend,
    handleUndo,
  } = useCanvasConversation({ form, setForm, hasExistingHtml, openTab, tc });

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={onToggleCollapsed}
        title={tc('expandTooltip')}
        aria-label={tc('expandTooltip')}
        className="fixed bottom-6 left-6 z-30 group inline-flex items-center gap-2 pl-3 pr-5 h-12 rounded-full bg-gradient-to-r from-orange-500 to-red-500 text-white text-[15px] font-semibold shadow-[0_8px_24px_rgba(249,115,22,0.45)] hover:shadow-[0_10px_28px_rgba(249,115,22,0.55)] hover:scale-[1.03] active:scale-[0.98] transition-all"
      >
        <span className="w-8 h-8 rounded-full bg-white/20 inline-flex items-center justify-center group-hover:bg-white/25 transition-colors">
          <HiOutlineSparkles className="w-5 h-5" />
        </span>
        {tc('openButton')}
      </button>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gradient-to-b from-gray-50/50 to-white">
      <ModernHeader onToggleCollapsed={onToggleCollapsed} />
      <div className="flex-1 min-h-0 overflow-y-auto px-4 pt-4 pb-3">
        {messages.length === 0 ? (
          <ModernEmptyState onPick={(pick) => handleSend?.({ prompt: pick.prompt })} disabled={isStreaming} />
        ) : (
          <div className="space-y-4">
            {messages.map((msg) => (
              <ChatMessage
                key={msg.id}
                msg={msg}
                onUndo={handleUndo}
              />
            ))}
          </div>
        )}
      </div>

      <ChatComposer onSend={handleSend} disabled={isStreaming} />
    </div>
  );
}

/* ───────── Modern Header ───────── */

function ModernHeader({ onToggleCollapsed }) {
  const tc = useI18n('landingCanvas.chat');
  return (
    <div className="relative h-16 px-4 flex items-center justify-between border-b border-gray-100/80 shrink-0 bg-white/80 backdrop-blur-md">
      <div className="flex items-center gap-3 min-w-0">
        <div className="relative shrink-0">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center shadow-lg shadow-orange-500/25">
            <HiOutlineSparkles className="w-5 h-5 text-white" />
          </div>
          <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-green-500 border-2 border-white" />
        </div>
        <div className="flex flex-col min-w-0">
          <span className="text-[15px] font-semibold text-gray-900 truncate leading-tight tracking-tight">
            {tc('title')}
          </span>
          <span className="text-[12px] text-gray-500 truncate leading-tight mt-0.5">
            {tc('headerSubtitle')}
          </span>
        </div>
      </div>
      <button
        type="button"
        onClick={onToggleCollapsed}
        title={tc('collapseTooltip')}
        aria-label={tc('collapseTooltip')}
        className="p-2 rounded-lg text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition-colors"
      >
        <HiOutlineX className="w-5 h-5" />
      </button>
    </div>
  );
}

/* ───────── Modern Empty State ───────── */

function ModernEmptyState({ onPick, disabled }) {
  const tc = useI18n('landingCanvas.chat');

  // Map icon name → icon component
  const ICON_MAP = {
    sparkles: HiOutlineSparkles,
    lightbulb: HiOutlineLightBulb,
    pencil: HiOutlinePencilAlt,
    color: HiOutlineColorSwatch,
    photo: HiOutlinePhotograph,
    code: HiOutlineCode,
  };

  const quickPicks = CHAT_QUICK_PICKS.slice(0, 6);

  return (
    <div className="px-1 pt-2 space-y-6">
      {/* Greeting */}
      <div className="space-y-2.5">
        <div className="flex items-center gap-2">
          <h2 className="text-[22px] font-bold text-gray-900 tracking-tight">
            {tc('welcomeGreeting')}
          </h2>
          <span className="text-2xl leading-none animate-[wave_1.8s_ease-in-out_infinite] origin-[70%_70%] inline-block">
            👋
          </span>
        </div>
        <p className="text-[14px] text-gray-600 leading-relaxed">
          {tc('welcomeIntro').split(new RegExp(`(${tc('welcomeIntroBold')}|${tc('welcomeIntroItalic')})`)).map((part, idx) => {
            if (part === tc('welcomeIntroBold')) return <strong key={idx} className="text-gray-800 font-semibold">{part}</strong>;
            if (part === tc('welcomeIntroItalic')) return <em key={idx} className="not-italic text-orange-600 font-medium">{part}</em>;
            return <span key={idx}>{part}</span>;
          })}
        </p>
      </div>

      {/* Capabilities (decorative cards) */}
      <div className="grid grid-cols-2 gap-2">
        <CapCard icon={HiOutlinePencilAlt} label="Chỉnh sửa" tone="orange" />
        <CapCard icon={HiOutlineColorSwatch} label="Đổi màu" tone="amber" />
        <CapCard icon={HiOutlineLightBulb} label="Ý tưởng" tone="yellow" />
        <CapCard icon={HiOutlineCode} label="Sinh code" tone="red" />
      </div>

      {/* Quick picks */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-[0.08em]">
            {tc('quickPicksTitle')}
          </p>
          <span className="text-[11px] text-gray-400">{quickPicks.length} mẫu</span>
        </div>
        <div className="space-y-2">
          {quickPicks.map((pick) => {
            const Icon = ICON_MAP[pick.iconName] || HiOutlineSparkles;
            return (
              <button
                key={pick.id}
                type="button"
                onClick={() => onPick?.(pick)}
                disabled={disabled}
                className="group w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-gray-200/80 bg-white hover:border-orange-300 hover:shadow-md hover:shadow-orange-500/5 text-left transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="w-9 h-9 rounded-lg bg-gradient-to-br from-orange-50 to-red-50 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                  <Icon className="w-4.5 h-4.5 text-orange-600" />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold text-gray-800 truncate">{pick.name}</div>
                  <div className="text-[12px] text-gray-500 truncate">{pick.shortDesc}</div>
                </div>
                <span className="text-gray-400 group-hover:text-orange-500 group-hover:translate-x-0.5 transition-all">
                  →
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const TONE_STYLES = {
  orange: { bg: 'bg-orange-50', text: 'text-orange-600' },
  amber: { bg: 'bg-amber-50', text: 'text-amber-600' },
  yellow: { bg: 'bg-yellow-50', text: 'text-yellow-600' },
  red: { bg: 'bg-red-50', text: 'text-red-600' },
};

function CapCard({ icon: Icon, label, tone }) {
  const style = TONE_STYLES[tone] || TONE_STYLES.orange;
  return (
    <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg border border-gray-100 bg-white/60">
      <span className={`w-7 h-7 rounded-md ${style.bg} flex items-center justify-center`}>
        <Icon className={`w-3.5 h-3.5 ${style.text}`} />
      </span>
      <span className="text-[12px] font-medium text-gray-700">{label}</span>
    </div>
  );
}
