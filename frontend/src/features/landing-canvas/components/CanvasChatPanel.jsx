import { useI18n } from '../../../i18n';
import {
  HiOutlineSparkles,
  HiOutlineX,
} from 'react-icons/hi';
import ChatMessage from './ChatMessage.jsx';
import ChatComposer from './ChatComposer.jsx';
import useCanvasConversation from '../hooks/useCanvasConversation.js';

/**
 * Chat panel bên trái canvas — style Gemini Canvas.
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
    <div className="flex flex-col h-full bg-white">
      <GeminiHeader onToggleCollapsed={onToggleCollapsed} />

      <div className="flex-1 min-h-0 overflow-y-auto px-3 pt-3 pb-2 space-y-3">
        {messages.length === 0 ? (
          <GeminiEmptyState />
        ) : (
          <>
            {messages.map((msg) => (
              <ChatMessage
                key={msg.id}
                msg={msg}
                onUndo={handleUndo}
              />
            ))}
          </>
        )}
      </div>

      <ChatComposer onSend={handleSend} disabled={isStreaming} />
    </div>
  );
}

/* ───────── Sub-components ───────── */

function GeminiHeader({ onToggleCollapsed }) {
  const tc = useI18n('landingCanvas.chat');
  return (
    <div className="h-14 px-4 flex items-center justify-between border-b border-gray-100 shrink-0 bg-gradient-to-b from-white to-gray-50/50">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-orange-500 via-red-500 to-rose-500 flex items-center justify-center shadow-sm">
          <HiOutlineSparkles className="w-5 h-5 text-white" />
        </div>
        <div className="flex flex-col min-w-0">
          <span className="text-[15px] font-semibold text-gray-900 truncate leading-tight">{tc('title')}</span>
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
        className="p-2 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors"
      >
        <HiOutlineX className="w-5 h-5" />
      </button>
    </div>
  );
}

function GeminiEmptyState() {
  const tc = useI18n('landingCanvas.chat');
  return (
    <div className="px-3 pt-3 text-[15px] text-gray-700 space-y-3.5">
      <div>
        <p className="text-[17px] font-semibold text-gray-900">{tc('welcomeGreeting')}</p>
        <p className="text-[14px] text-gray-500 mt-1.5 leading-relaxed">
          {tc('welcomeIntro').split(new RegExp(`(${tc('welcomeIntroBold')}|${tc('welcomeIntroItalic')})`)).map((part, idx) => {
            if (part === tc('welcomeIntroBold')) return <strong key={idx} className="text-gray-800">{part}</strong>;
            if (part === tc('welcomeIntroItalic')) return <em key={idx}>{part}</em>;
            return <span key={idx}>{part}</span>;
          })}
        </p>
      </div>
    </div>
  );
}
