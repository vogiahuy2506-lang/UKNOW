import DeployTab from './DeployTab';
import { useI18n } from '../../i18n';

/**
 * Cột phải "Triển khai". Bản cũ vẽ thêm một thanh tab chỉ có MỘT tab (chữ "Triển khai" lặp hai lần) cùng
 * `defaultTab='knowledge'` trỏ vào tab không tồn tại (S-09). Nay chỉ còn một tiêu đề do DeployTab vẽ.
 */
export default function RightPanel({
  chatbot,
  onOpenWidgetSettings,
  onUpdate,
}) {
  const { t } = useI18n();
  // Guard: không render gì khi không có chatbot
  if (!chatbot) {
    return (
      <div className="h-full bg-white flex items-center justify-center">
        <p className="text-sm text-slate-400">{t('chatbot.studio.selectBotForDeploy')}</p>
      </div>
    );
  }

  return (
    <div className="h-full bg-white flex flex-col">
      <div className="flex-1 min-h-0 overflow-hidden">
        <DeployTab
          chatbot={chatbot}
          onOpenWidgetSettings={onOpenWidgetSettings}
          onUpdate={onUpdate}
        />
      </div>
    </div>
  );
}
