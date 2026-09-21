import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { HiOutlineOfficeBuilding, HiOutlineX } from 'react-icons/hi';
import { useI18n } from '../../i18n';
import { useAuthStore } from '../../stores/authStore';

const MAX_OWNER_BUTTONS = 3;

// Đóng dải là nhớ THEO TỪNG CÔNG TY của từng tài khoản: đóng "công ty A" không giấu lời mời "công ty B" thêm sau này.
const dismissKey = (userId, ownerId) => `fa_ws_invite_dismissed_${userId}_${ownerId}`;

const isDismissed = (userId, ownerId) => {
  try {
    return window.localStorage.getItem(dismissKey(userId, ownerId)) === '1';
  } catch {
    return false; // storage bị chặn: dải vẫn hiện, không nhớ được — chấp nhận
  }
};

const rememberDismissed = (userId, ownerId) => {
  try {
    window.localStorage.setItem(dismissKey(userId, ownerId), '1');
  } catch {
    /* storage đầy/bị chặn — bỏ qua */
  }
};

/**
 * Dải mời chuyển sang không gian công ty (PLAN_NHAN_VIEN mục 5.1). Nhân viên có gói riêng đăng nhập vào
 * KHÔNG GIAN CÁ NHÂN (đúng mặc định — họ có việc riêng), còn chỗ đổi sang công ty nằm sâu trong menu avatar
 * nên không ai tìm ra. Dải này hiện đúng lúc: đang ở `self` và có ít nhất một membership còn dùng được.
 */
const WorkspaceInviteBanner = () => {
  const { t } = useI18n();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const activeContext = useAuthStore((state) => state.activeContext);
  const switchContext = useAuthStore((state) => state.switchContext);
  const [, setDismissVersion] = useState(0);
  const [enteringOwnerId, setEnteringOwnerId] = useState(null);

  if (activeContext?.type !== 'self' || !user?.id) return null;

  // Membership bị khoá (`isLocked`, vd hết suất theo gói) không vào được → không mời.
  const owners = (user.memberships || []).filter(
    (membership) => !membership.isLocked && !isDismissed(user.id, membership.ownerId)
  );
  if (owners.length === 0) return null;

  const shown = owners.slice(0, MAX_OWNER_BUTTONS);
  const isSingle = owners.length === 1;
  const nameOf = (membership) => membership.ownerName || membership.ownerUsername;

  const handleEnter = async (ownerId) => {
    setEnteringOwnerId(ownerId);
    try {
      await switchContext(ownerId);
      navigate('/app');
    } finally {
      setEnteringOwnerId(null);
    }
  };

  const handleDismiss = () => {
    owners.forEach((membership) => rememberDismissed(user.id, membership.ownerId));
    setDismissVersion((version) => version + 1);
  };

  return (
    <div
      role="status"
      data-testid="workspace-invite-banner"
      className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm text-blue-900"
    >
      <HiOutlineOfficeBuilding className="h-5 w-5 shrink-0 text-blue-500" />
      <p className="min-w-0 flex-1">
        {isSingle ? (
          <>
            {t('workspaceInvite.singlePrefix')} <strong>{nameOf(owners[0])}</strong>.
          </>
        ) : (
          t('workspaceInvite.multiMessage')
        )}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {shown.map((membership) => (
          <button
            key={membership.ownerId}
            type="button"
            className="btn btn-primary text-sm"
            disabled={enteringOwnerId !== null}
            onClick={() => handleEnter(membership.ownerId)}
          >
            {t(isSingle ? 'workspaceInvite.enterSingle' : 'workspaceInvite.enterMulti', { ownerName: nameOf(membership) })}
          </button>
        ))}
        <button
          type="button"
          className="rounded-lg p-1.5 text-blue-500 hover:bg-blue-100"
          onClick={handleDismiss}
          aria-label={t('workspaceInvite.dismiss')}
        >
          <HiOutlineX className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

export default WorkspaceInviteBanner;
