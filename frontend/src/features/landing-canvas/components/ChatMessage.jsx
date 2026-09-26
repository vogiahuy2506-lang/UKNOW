import { HiOutlineCheck, HiOutlineRefresh, HiOutlinePaperClip } from 'react-icons/hi';
import { useI18n } from '../../../i18n';

/* ───────── Thinking Dots Animation (Gemini-style) ───────── */

function ThinkingDots() {
  return (
    <div className="flex items-center gap-1.5 py-1">
      <div className="flex items-center gap-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="w-2 h-2 rounded-full bg-gradient-to-r from-orange-500 to-red-500"
            style={{
              animation: `thinkingBounce 1.4s ease-in-out infinite`,
              animationDelay: `${i * 0.16}s`,
            }}
          />
        ))}
      </div>
      <span className="text-[13px] text-gray-500 animate-pulse ml-1">Thinking...</span>
      {/* Sparkle accents */}
      <div className="flex items-center gap-0.5 ml-2">
        <SparkleDot delay={0} />
        <SparkleDot delay={0.4} />
        <SparkleDot delay={0.8} />
      </div>
    </div>
  );
}

function SparkleDot({ delay }) {
  return (
    <span
      className="w-1 h-1 rounded-full bg-amber-400"
      style={{
        animation: `sparklePulse 2s ease-in-out infinite`,
        animationDelay: `${delay}s`,
        opacity: 0.6,
      }}
    />
  );
}

/**
 * Single chat message bubble.
 * role 'user': bubble orange-50 bên phải, hiển thị content và các chip tệp đính kèm (nếu có).
 * role 'ai':   bubble gray-50 bên trái + trạng thái applied/undo nếu đã auto-apply HTML.
 *
 * Phase 6: AI tự auto-apply HTML lên form. Không còn nút Áp dụng/Bỏ qua — chỉ còn
 * nút "Hoàn tác" để user khôi phục bản trước khi AI can thiệp.
 */
export default function ChatMessage({ msg, onUndo }) {
  const tc = useI18n('landingCanvas.chat');
  const { role, content, status, previousHtml, files } = msg;

  if (role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] bg-orange-50 text-gray-900 rounded-2xl px-4 py-2.5 text-[15px] break-words leading-relaxed space-y-2">
          {Array.isArray(files) && files.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pb-0.5">
              {files.map((f, i) => (
                <div
                  key={f.tempId || f.storageKey || i}
                  className="flex items-center gap-1.5 bg-white border border-orange-200 rounded-lg px-2.5 py-1 text-xs text-slate-700 shadow-sm"
                >
                  {f.previewUrl ? (
                    <img src={f.previewUrl} alt="" className="w-4 h-4 object-cover rounded shrink-0" />
                  ) : (
                    <HiOutlinePaperClip className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                  )}
                  <span className="truncate max-w-[140px] font-medium">{f.originalName || 'file'}</span>
                </div>
              ))}
            </div>
          )}
          {content ? <div>{content}</div> : null}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-2.5 items-start">
      <div className="w-8 h-8 rounded-md bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center shrink-0 mt-0.5">
        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        {/* Streaming state: show thinking animation */}
        {status === 'streaming' ? (
          <div className="bg-gray-50 rounded-2xl px-4 py-3">
            <ThinkingDots />
          </div>
        ) : (
          <div className="bg-gray-50 rounded-2xl px-4 py-2.5 text-[15px] text-gray-900 break-words leading-relaxed">
            {content}
          </div>
        )}

        {status === 'applied' && previousHtml != null ? (
          <div className="flex items-center gap-2 mt-2.5">
            <span className="inline-flex items-center gap-1 text-[14px] text-green-600 font-semibold">
              <HiOutlineCheck className="w-4 h-4" />
              {tc('applied')}
            </span>
            <button
              type="button"
              onClick={() => onUndo?.(msg.id)}
              className="inline-flex items-center gap-1 px-3 h-9 rounded-lg bg-white text-gray-700 border border-gray-300 text-[14px] font-semibold hover:bg-gray-50 hover:border-orange-300 hover:text-orange-700 transition-colors"
              title={tc('undoTooltip')}
            >
              <HiOutlineRefresh className="w-4 h-4" />
              {tc('undo')}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
