import { useState } from 'react';
import { HiOutlineUserGroup } from 'react-icons/hi';
import { useI18n } from '../../i18n';
import { useAuthStore } from '../../stores/authStore';
import { acceptWorkspaceInvite, declineWorkspaceInvite } from '../../features/auth/services/authApi.service';

/**
 * Dải mời CHẤP NHẬN vào nhóm (PLAN_VA_NHAN_VIEN_PHAN_QUYEN 2026-09-28 PR-2). Khác WorkspaceInviteBanner
 * (mời chuyển sang không gian đã CHẤP NHẬN từ trước): dải này cho membership `acceptedAt` còn NULL —
 * người bị chủ nhóm khác liên kết chưa hề đồng ý gì. Luôn hiện, không có nút "Đóng" — phải trả lời
 * (Chấp nhận/Từ chối) chứ không lờ đi được, vì tài khoản này vẫn chưa vào được không gian đó.
 */
const WorkspaceInviteAcceptBanner = () => {
  const { t } = useI18n();
  const user = useAuthStore((state) => state.user);
  const activeContext = useAuthStore((state) => state.activeContext);
  const refreshCurrentUser = useAuthStore((state) => state.refreshCurrentUser);
  const [busyOwnerId, setBusyOwnerId] = useState(null);
  const [errorOwnerId, setErrorOwnerId] = useState(null);

  if (activeContext?.type !== 'self' || !user?.id) return null;

  // Chỉ `null` (backend mới) là đang chờ; thiếu trường (backend cũ lúc FE deploy trước) = đã chấp nhận.
  const pending = (user.memberships || []).filter((membership) => membership?.acceptedAt === null);
  if (pending.length === 0) return null;

  const nameOf = (membership) => membership.ownerName || membership.ownerUsername;

  const handleAccept = async (ownerId) => {
    setBusyOwnerId(ownerId);
    setErrorOwnerId(null);
    try {
      await acceptWorkspaceInvite(ownerId);
      await refreshCurrentUser();
    } catch {
      setErrorOwnerId(ownerId);
    } finally {
      setBusyOwnerId(null);
    }
  };

  const handleDecline = async (ownerId) => {
    setBusyOwnerId(ownerId);
    setErrorOwnerId(null);
    try {
      await declineWorkspaceInvite(ownerId);
      await refreshCurrentUser();
    } catch {
      setErrorOwnerId(ownerId);
    } finally {
      setBusyOwnerId(null);
    }
  };

  return (
    <div
      role="status"
      data-testid="workspace-invite-accept-banner"
      className="mb-2 space-y-2"
    >
      {pending.map((membership) => (
        <div
          key={membership.ownerId}
          className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900"
        >
          <HiOutlineUserGroup className="h-5 w-5 shrink-0 text-amber-500" />
          <p className="min-w-0 flex-1">
            {t('workspaceInviteAccept.message', { ownerName: nameOf(membership) })}
          </p>
          {errorOwnerId === membership.ownerId && (
            <p className="w-full text-xs text-red-600">{t('workspaceInviteAccept.error')}</p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn btn-primary text-sm"
              disabled={busyOwnerId !== null}
              onClick={() => handleAccept(membership.ownerId)}
            >
              {busyOwnerId === membership.ownerId ? t('workspaceInviteAccept.processing') : t('workspaceInviteAccept.accept')}
            </button>
            <button
              type="button"
              className="btn btn-secondary text-sm"
              disabled={busyOwnerId !== null}
              onClick={() => handleDecline(membership.ownerId)}
            >
              {t('workspaceInviteAccept.decline')}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

export default WorkspaceInviteAcceptBanner;
