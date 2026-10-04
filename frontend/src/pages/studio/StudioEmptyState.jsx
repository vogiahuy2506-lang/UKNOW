/**
 * Empty state for the playground when no chatbot is selected.
 *
 * Kept separate from studio.util.js so Fast Refresh can reload this
 * component without re-running the pure helpers.
 *
 * 04/10/2026 (S-20): bản cũ chào "Chào bạn, tôi có thể giúp gì?" như thể một bot đang nói, kèm khối câu hỏi gợi ý là
 * code chết (không có chatbot nào được chọn ở đây nên danh sách luôn rỗng, và các chip không bấm được). Nay chỉ hướng dẫn.
 */
import { HiOutlineSparkles } from 'react-icons/hi';
import { useI18n } from '../../i18n';
import { getChatbotTheme } from './studio.util';

export function StudioEmptyState({ chatbot }) {
  const { t } = useI18n();
  const { primaryColor, gradientStyle } = getChatbotTheme(chatbot);

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
        <p className="text-base font-medium text-slate-700 leading-relaxed">
          {t('chatbot.studio.emptySelectBot')}
        </p>
      </div>
    </div>
  );
}
