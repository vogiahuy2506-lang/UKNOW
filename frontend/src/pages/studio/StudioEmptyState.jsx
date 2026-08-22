/**
 * Empty state for the playground: greets the user, links to chatbot list,
 * and shows suggested questions as clickable chips.
 *
 * Kept separate from studio.util.js so Fast Refresh can reload this
 * component without re-running the pure helpers.
 */
import { HiOutlineSparkles } from 'react-icons/hi';
import { getChatbotTheme } from './studio.util';

export function StudioEmptyState({ chatbot }) {
  const { primaryColor, gradientStyle } = getChatbotTheme(chatbot);
  const suggestedQuestions =
    chatbot?.suggested_questions || chatbot?.widget_settings?.suggested_questions || [];

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 bg-white relative overflow-hidden">
      <div
        className="absolute top-1/4 left-1/4 w-64 h-64 rounded-full blur-3xl opacity-10"
        style={{ background: primaryColor }}
      />
      <div
        className="absolute bottom-1/4 right-1/4 w-72 h-72 rounded-full blur-3xl opacity-10"
        style={{ background: primaryColor }}
      />

      <div className="relative flex flex-col items-center max-w-md text-center">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6"
          style={{ background: gradientStyle }}
        >
          <HiOutlineSparkles className="w-8 h-8 text-white" />
        </div>
        <h2 className="text-lg font-semibold text-slate-900 mb-2 tracking-tight">
          Chào bạn, tôi có thể giúp gì?
        </h2>
        <p className="text-sm text-slate-500 mb-8 leading-relaxed">
          Chọn một chatbot từ danh sách bên trái hoặc tạo chatbot mới để bắt đầu trò chuyện thử nghiệm.
        </p>
        {suggestedQuestions.length > 0 && (
          <div className="flex flex-wrap gap-2 justify-center">
            {suggestedQuestions.map((q, i) => (
              <span
                key={i}
                className="px-3 py-1.5 rounded-full text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
              >
                {q}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
