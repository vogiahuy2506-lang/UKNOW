import { HiOutlineShieldExclamation } from 'react-icons/hi';
import { useI18n } from '../../i18n';
import { useAuthStore } from '../../stores/authStore';
import RecheckPermissionsButton from './RecheckPermissionsButton';

/**
 * Thẻ giữa trang thay cho khung chat khi nhân viên đã vào không gian công ty nhưng chủ CHƯA cấp quyền
 * nào (PLAN_NHAN_VIEN mục 5.2). Không có thẻ này, nhân viên thấy một khung chat sẽ trả 403 và không biết
 * vì sao — chính là phản ánh "add rồi mà không thấy gì" của khách.
 */
const WorkspaceNoPermissionsCard = () => {
  const { t } = useI18n();
  const ownerName = useAuthStore((state) => state.activeContext?.ownerName);

  return (
    <div className="flex h-full items-center justify-center p-6">
      <section
        data-testid="workspace-no-permissions"
        className="w-full max-w-lg rounded-2xl border border-amber-200 bg-white p-8 text-center shadow-sm"
      >
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50">
          <HiOutlineShieldExclamation className="h-7 w-7 text-amber-500" />
        </div>
        <h2 className="text-lg font-bold text-gray-900">{t('workspaceNoPermissions.title')}</h2>
        <p className="mt-3 text-sm leading-relaxed text-gray-600">
          {t('workspaceNoPermissions.intro', { ownerName: ownerName || t('workspaceNoPermissions.fallbackOwner') })}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-gray-600">{t('workspaceNoPermissions.steps')}</p>
        <div className="mt-6">
          <RecheckPermissionsButton />
        </div>
      </section>
    </div>
  );
};

export default WorkspaceNoPermissionsCard;
