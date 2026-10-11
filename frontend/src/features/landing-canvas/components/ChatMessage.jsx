import { HiOutlineCheck, HiOutlineRefresh, HiOutlinePaperClip } from 'react-icons/hi';
import { useI18n } from '../../../i18n';

/* ───────── Thinking Dots Animation (Gemini-style) ───────── */

function ThinkingDots({ label = null }) {
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
      <span className="text-[13px] text-gray-500 dark:text-dk-text2 animate-pulse ml-1">{label || 'Thinking...'}</span>
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
        delay: `${delay}s`,
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
export default function ChatMessage({ msg, onUndo, onRelayout }) {
  const tc = useI18n('landingCanvas.chat');
  const { role, content, status, previousHtml, files, stage } = msg;
  // PR-9 (B-4): chữ tiến độ do server báo trên luồng sinh / sửa landing; stage lạ → giữ "Thinking…".
  const stageLabel = { generating: tc('stageGenerating'), fixing: tc('stageFixing'), checking: tc('stageChecking') }[stage] || null;

  if (role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] bg-orange-50 dark:bg-orange-950/40 border border-transparent dark:border-orange-500/20 text-gray-900 dark:text-dk-text rounded-2xl px-4 py-2.5 text-[15px] break-words leading-relaxed space-y-2">
          {Array.isArray(files) && files.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pb-0.5">
              {files.map((f, i) => (
                <div
                  key={f.tempId || f.storageKey || i}
                  className="flex items-center gap-1.5 bg-white dark:bg-dk-raised border border-orange-200 dark:border-orange-500/30 rounded-lg px-2.5 py-1 text-xs text-slate-700 dark:text-dk-text shadow-sm"
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
          <div className="bg-gray-50 dark:bg-dk-raised rounded-2xl px-4 py-3">
            <ThinkingDots label={stageLabel} />
          </div>
        ) : (
          <div className="bg-gray-50 dark:bg-dk-raised border border-transparent dark:border-dk-border rounded-2xl px-4 py-2.5 text-[15px] text-gray-900 dark:text-dk-text break-words leading-relaxed">
            {content}
          </div>
        )}

        {/* B-9: bộ đo hiển thị thấy lỗi ở trang AI vừa dựng → câu tiếng người + nút "Trình bày lại" (trả phí 1 lượt AI). */}
        {status === 'applied' && Array.isArray(msg.layoutFindings) && msg.layoutFindings.length > 0 && onRelayout ? (
          <div className="mt-2.5 rounded-xl border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-950/30 px-3 py-2.5" data-testid="canvas-layout-note">
            <p className="text-[13px] text-amber-800 dark:text-amber-300">{msg.layoutNote}</p>
            <button
              type="button"
              onClick={() => onRelayout(msg.id)}
              className="mt-2 inline-flex items-center px-3 h-9 rounded-lg bg-white dark:bg-dk-raised text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-500/40 text-[14px] font-semibold hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors"
            >
              {tc('relayoutSection')}
            </button>
          </div>
        ) : null}

        {status === 'applied' && previousHtml != null ? (
          <div className="flex items-center gap-2 mt-2.5">
            <span className="inline-flex items-center gap-1 text-[14px] text-green-600 dark:text-emerald-400 font-semibold">
              <HiOutlineCheck className="w-4 h-4" />
              {tc('applied')}
            </span>
            <button
              type="button"
              onClick={() => onUndo?.(msg.id)}
              className="inline-flex items-center gap-1 px-3 h-9 rounded-lg bg-white dark:bg-dk-raised text-gray-700 dark:text-dk-text border border-gray-300 dark:border-dk-border text-[14px] font-semibold hover:bg-gray-50 dark:hover:bg-dk-strong hover:border-orange-300 dark:hover:border-orange-500/60 hover:text-orange-700 dark:hover:text-orange-400 transition-colors"
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
