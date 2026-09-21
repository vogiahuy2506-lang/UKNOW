import { HiOutlineSparkles } from 'react-icons/hi';
import { useI18n } from '../../i18n';
import { useAuthStore } from '../../stores/authStore';
import RecheckPermissionsButton from './RecheckPermissionsButton';

/**
 * Thẻ thay cho khung chat ở trang chủ khi nhân viên có quyền khác nhưng CHƯA có quyền "Sử dụng Trợ lý
 * AI". Bản vá review của PLAN_NHAN_VIEN: nút chọn nhanh "Chỉ xem" cố ý không kèm quyền này (trợ lý tiêu
 * credits của chủ và tạo được nội dung), mà đổi sang không gian công ty xong là rơi về đúng trang chủ —
 * không có thẻ thì nhân viên gõ vào một khung chat luôn trả 403.
 */
const WorkspaceNoAiAssistantCard = () => {
  const { t } = useI18n();
  const ownerName = useAuthStore((state) => state.activeContext?.ownerName);

  return (
    <div className="flex h-full items-center justify-center p-6">
      <section
        data-testid="workspace-no-ai-assistant"
        className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm"
      >
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-50">
          <HiOutlineSparkles className="h-7 w-7 text-orange-500" />
        </div>
        <h2 className="text-lg font-bold text-gray-900">{t('workspaceNoAiAssistant.title')}</h2>
        <p className="mt-3 text-sm leading-relaxed text-gray-600">
          {t('workspaceNoAiAssistant.intro', { ownerName: ownerName || t('workspaceNoPermissions.fallbackOwner') })}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-gray-600">{t('workspaceNoAiAssistant.steps')}</p>
        <div className="mt-6">
          <RecheckPermissionsButton buttonClassName="btn btn-secondary" />
        </div>
      </section>
    </div>
  );
};

export default WorkspaceNoAiAssistantCard;
