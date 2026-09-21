import { useI18n } from '../../i18n';
import { useRecheckWorkspacePermissions } from '../../hooks/useRecheckWorkspacePermissions';

/**
 * Nút "Tôi đã được cấp quyền — kiểm tra lại" (PLAN_NHAN_VIEN mục 5.2): làm mới hồ sơ ngay, không cần
 * F5. Chỉ nói "chưa thấy quyền mới" khi thật sự đã hỏi server và server chưa có gì — không im lặng.
 */
const RecheckPermissionsButton = ({ buttonClassName = 'btn btn-primary' }) => {
  const { t } = useI18n();
  const { recheck, isChecking, result } = useRecheckWorkspacePermissions();

  return (
    <div className="flex flex-col items-center gap-2">
      <button type="button" className={buttonClassName} onClick={recheck} disabled={isChecking}>
        {isChecking ? t('workspaceNoPermissions.checking') : t('workspaceNoPermissions.recheck')}
      </button>
      {result === 'unchanged' && (
        <p role="status" className="text-sm text-amber-700">{t('workspaceNoPermissions.resultUnchanged')}</p>
      )}
      {result === 'failed' && (
        <p role="alert" className="text-sm text-red-600">{t('workspaceNoPermissions.resultFailed')}</p>
      )}
    </div>
  );
};

export default RecheckPermissionsButton;
