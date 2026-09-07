import { HiOutlineCheck, HiOutlineRefresh } from 'react-icons/hi';
import { useI18n } from '../../../i18n';

/**
 * Single chat message bubble.
 * role 'user': bubble orange-50 bên phải
 * role 'ai':   bubble gray-50 bên trái + trạng thái applied/undo nếu đã auto-apply HTML.
 *
 * Phase 6: AI tự auto-apply HTML lên form. Không còn nút Áp dụng/Bỏ qua — chỉ còn
 * nút "Hoàn tác" để user khôi phục bản trước khi AI can thiệp.
 */
export default function ChatMessage({ msg, onUndo }) {
  const tc = useI18n('landingCanvas.chat');
  const { role, content, status, previousHtml } = msg;

  if (role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] bg-orange-50 text-gray-900 rounded-2xl px-4 py-2.5 text-[15px] break-words leading-relaxed">
          {content}
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
        <div className="bg-gray-50 rounded-2xl px-4 py-2.5 text-[15px] text-gray-900 break-words leading-relaxed">
          {content || (status === 'streaming' ? tc('typing') : '')}
        </div>

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
