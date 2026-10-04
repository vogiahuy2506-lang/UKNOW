import { forwardRef, useImperativeHandle, useRef } from 'react';
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
import { LANDING_AI_PROMPT_MAX_CHARS } from '../utils/landingAiInputLimits.js';

/**
 * Chat panel bên trái canvas / hoặc studio ở giữa trang.
 *
 * Props:
 *  - form, setForm: form state của LandingCanvasEditor
 *  - openTab(tab): mở 1 tab trong SettingsModal
 *  - collapsed: bool
 *  - onToggleCollapsed: callback toggle mở/thu nhỏ
 *  - editingId: string | null
 *  - conversation: object trả về từ useCanvasConversation (nếu được truyền từ LandingCanvasLayout)
 *  - isCentered: bool (true = hiển thị dạng studio lớn ở giữa trang khi chưa có nội dung/tin nhắn)
 *  - onOpenImportHtml: callback mở modal Dán mã HTML
 *  - onOpenTemplateGallery: callback mở modal Thư viện mẫu
 */
const CanvasChatPanelContent = forwardRef(function CanvasChatPanelContent(
  {
    conversation,
    collapsed,
    onToggleCollapsed,
    isCentered = false,
    onOpenImportHtml,
    onOpenTemplateGallery,
  },
  ref
) {
  const tc = useI18n('landingCanvas.chat');
  const composerRef = useRef(null);

  const {
    messages = [],
    isStreaming = false,
    handleSend,
    handleUndo,
    handleRelayout,
  } = conversation || {};

  useImperativeHandle(ref, () => ({
    focus: () => composerRef.current?.focus(),
  }));

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

  if (isCentered) {
    return (
      <CenteredStudioView
        composerRef={composerRef}
        handleSend={handleSend}
        isStreaming={isStreaming}
        onOpenImportHtml={onOpenImportHtml}
        onOpenTemplateGallery={onOpenTemplateGallery}
      />
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
                onRelayout={handleRelayout}
              />
            ))}
          </div>
        )}
      </div>

      <ChatComposer ref={composerRef} onSend={handleSend} disabled={isStreaming} isCentered={false} />
    </div>
  );
});

const CanvasChatPanelWithHook = forwardRef(function CanvasChatPanelWithHook(props, ref) {
  const hasExistingHtml = Boolean(String(props.form?.htmlContent || '').trim());
  const conversation = useCanvasConversation({
    form: props.form,
    setForm: props.setForm,
    hasExistingHtml,
    openTab: props.openTab,
    editingId: props.editingId,
  });
  return <CanvasChatPanelContent {...props} conversation={conversation} ref={ref} />;
});

const CanvasChatPanel = forwardRef(function CanvasChatPanel(props, ref) {
  if (props.conversation) {
    return <CanvasChatPanelContent {...props} ref={ref} />;
  }
  return <CanvasChatPanelWithHook {...props} ref={ref} />;
});

export default CanvasChatPanel;

/* ───────── Centered Studio View (Khi mới bắt đầu) ───────── */

function CenteredStudioView({
  composerRef,
  handleSend,
  isStreaming,
  onOpenImportHtml,
  onOpenTemplateGallery,
}) {
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
    <div className="w-full flex flex-col items-center text-center">
      {/* Badge lấp lánh */}
      <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-orange-500/10 border border-orange-200/60 text-orange-700 text-xs font-semibold mb-3 shadow-2xs backdrop-blur-sm animate-pulse">
        <HiOutlineSparkles className="w-4 h-4 text-orange-500" />
        <span>Trợ lý AI Thiết kế Landing Page</span>
      </div>

      {/* Tiêu đề lớn */}
      <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-gray-900 tracking-tight leading-tight">
        Bạn muốn tạo Landing Page gì hôm nay?
      </h1>

      {/* Mô tả phụ */}
      <p className="text-xs sm:text-sm text-gray-500 max-w-xl mt-2 leading-relaxed">
        Mô tả ngắn gọn sản phẩm, mục tiêu hoặc phong cách mong muốn — AI sẽ tự động phác thảo bố cục, viết nội dung và hoàn thiện giao diện cho bạn trong vài giây.
      </p>

      {/* Khung Chat Composer lớn ở giữa */}
      <div className="w-full mt-6 bg-white rounded-2xl border border-gray-200/90 shadow-[0_8px_30px_rgb(0,0,0,0.06)] hover:shadow-[0_12px_36px_rgb(0,0,0,0.09)] focus-within:border-orange-400 focus-within:ring-4 focus-within:ring-orange-500/10 transition-all p-3 sm:p-4 text-left">
        <ChatComposer
          ref={composerRef}
          onSend={handleSend}
          disabled={isStreaming}
          isCentered={true}
          maxLength={LANDING_AI_PROMPT_MAX_CHARS}
        />
      </div>

      {/* Gợi ý nhanh Quick Picks */}
      <div className="w-full mt-8 text-left">
        <div className="flex items-center justify-between mb-3 px-1">
          <span className="text-xs font-bold text-gray-600 uppercase tracking-wider flex items-center gap-1.5">
            <HiOutlineLightBulb className="w-4 h-4 text-amber-500" />
            Hoặc chọn một mẫu ý tưởng phổ biến:
          </span>
          <span className="text-[11px] text-gray-400 font-medium">6 gợi ý có sẵn</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {quickPicks.map((pick) => {
            const Icon = ICON_MAP[pick.iconName] || HiOutlineSparkles;
            return (
              <button
                key={pick.id}
                type="button"
                onClick={() => handleSend?.({ prompt: pick.prompt })}
                disabled={isStreaming}
                className="group relative flex items-start gap-3 p-3.5 rounded-xl border border-gray-200/90 bg-white hover:border-orange-400 hover:shadow-sm hover:scale-[1.01] transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                <span className="w-9 h-9 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center shrink-0 group-hover:scale-110 group-hover:bg-orange-100 transition-all">
                  <Icon className="w-4.5 h-4.5" />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs sm:text-sm font-bold text-gray-900 group-hover:text-orange-600 transition-colors truncate">
                    {pick.name}
                  </div>
                  <div className="text-[11px] text-gray-500 mt-0.5 line-clamp-2 leading-relaxed">
                    {pick.shortDesc}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tùy chọn thay thế (Dán HTML / Thư viện mẫu) */}
      <div className="w-full mt-7 pt-5 border-t border-gray-200/60 flex flex-wrap items-center justify-center gap-3 text-xs text-gray-500">
        <span className="text-gray-400">Bạn đã có mã nguồn hoặc muốn tự chọn mẫu?</span>
        {onOpenImportHtml && (
          <button
            type="button"
            onClick={onOpenImportHtml}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 hover:border-gray-300 text-gray-700 font-semibold transition-all shadow-2xs cursor-pointer active:scale-95"
          >
            <HiOutlineCode className="w-4 h-4 text-gray-500" />
            <span>Dán mã HTML</span>
          </button>
        )}
        {onOpenTemplateGallery && (
          <button
            type="button"
            onClick={onOpenTemplateGallery}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 hover:border-gray-300 text-gray-700 font-semibold transition-all shadow-2xs cursor-pointer active:scale-95"
          >
            <HiOutlineSparkles className="w-4 h-4 text-orange-500" />
            <span>Thư viện mẫu</span>
          </button>
        )}
      </div>
    </div>
  );
}

/* ───────── Modern Header (Khi ở bên trái) ───────── */

function ModernHeader({ onToggleCollapsed }) {
  const tc = useI18n('landingCanvas.chat');
  return (
    <div className="h-14 px-4 flex items-center justify-between border-b border-gray-100 shrink-0 bg-white/95 backdrop-blur-md">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="relative shrink-0">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-orange-500 to-amber-500 flex items-center justify-center shadow-xs">
            <HiOutlineSparkles className="w-4.5 h-4.5 text-white" />
          </div>
          <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white" />
        </div>
        <div className="flex flex-col min-w-0">
          <span className="text-sm font-bold text-gray-900 truncate leading-tight">
            {tc('title')}
          </span>
          <span className="text-[11px] text-gray-500 truncate leading-tight mt-0.5">
            {tc('headerSubtitle')}
          </span>
        </div>
      </div>
      <button
        type="button"
        onClick={onToggleCollapsed}
        title={tc('collapseTooltip')}
        aria-label={tc('collapseTooltip')}
        className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
      >
        <HiOutlineX className="w-4 h-4" />
      </button>
    </div>
  );
}

/* ───────── Modern Empty State (Khi ở bên trái và chưa có tin nhắn) ───────── */

function ModernEmptyState({ onPick, disabled }) {
  const tc = useI18n('landingCanvas.chat');

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
    <div className="px-1 pt-1 space-y-5">
      {/* Greeting */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-bold text-gray-900 tracking-tight">
            {tc('welcomeGreeting')}
          </h2>
          <span className="text-lg leading-none animate-[wave_1.8s_ease-in-out_infinite] origin-[70%_70%] inline-block">
            👋
          </span>
        </div>
        <p className="text-xs text-gray-500 leading-relaxed">
          {tc('welcomeIntro').split(new RegExp(`(${tc('welcomeIntroBold')}|${tc('welcomeIntroItalic')})`)).map((part, idx) => {
            if (part === tc('welcomeIntroBold')) return <strong key={idx} className="text-gray-800 font-semibold">{part}</strong>;
            if (part === tc('welcomeIntroItalic')) return <em key={idx} className="not-italic text-orange-600 font-medium">{part}</em>;
            return <span key={idx}>{part}</span>;
          })}
        </p>
      </div>

      {/* Capabilities (decorative cards) */}
      <div className="grid grid-cols-2 gap-2">
        <CapCard icon={HiOutlinePencilAlt} label={tc('capabilities.edit')} tone="orange" />
        <CapCard icon={HiOutlineColorSwatch} label={tc('capabilities.color')} tone="amber" />
        <CapCard icon={HiOutlineLightBulb} label={tc('capabilities.idea')} tone="yellow" />
        <CapCard icon={HiOutlineCode} label={tc('capabilities.code')} tone="red" />
      </div>

      {/* Quick picks */}
      <div>
        <div className="flex items-center justify-between mb-2.5">
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
            {tc('quickPicksTitle')}
          </p>
          <span className="text-[11px] text-gray-400">{tc('quickPicksCount', { n: quickPicks.length })}</span>
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
                className="group w-full flex items-center gap-2.5 px-3 py-2 rounded-xl border border-gray-200/80 bg-white hover:border-orange-300 hover:shadow-xs text-left transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="w-8 h-8 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <Icon className="w-4 h-4" />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-gray-800 truncate">{pick.name}</div>
                  <div className="text-[11px] text-gray-500 truncate">{pick.shortDesc}</div>
                </div>
                <span className="text-gray-400 group-hover:text-orange-500 group-hover:translate-x-0.5 transition-all text-xs">
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
    <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-gray-200/70 bg-white shadow-2xs hover:shadow-xs transition-all">
      <span className={`w-6 h-6 rounded-md ${style.bg} flex items-center justify-center shrink-0`}>
        <Icon className={`w-3.5 h-3.5 ${style.text}`} />
      </span>
      <span className="text-xs font-semibold text-gray-700 truncate">{label}</span>
    </div>
  );
}
