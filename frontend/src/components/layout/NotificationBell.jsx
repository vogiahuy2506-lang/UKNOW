import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { HiOutlineBell, HiOutlineCog, HiOutlineCheck } from 'react-icons/hi';
import { useI18n } from '../../i18n';
import { useAuthStore } from '../../stores/authStore';
import {
  BELL_PAGE_SIZE,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotificationsQuery,
} from '../../hooks/queries/useNotificationsQuery';
import NotificationItem from '../../features/notifications/components/NotificationItem';
import { openNotificationLink } from '../../features/notifications/utils/openNotificationLink';
import {
  notificationPreferencesPath,
  notificationsPagePath,
} from '../../features/notifications/utils/notificationPaths';

const BADGE_MAX = 99;

/**
 * Chuông thông báo trong Header (dùng chung `/app/*` và `/admin/*`; mobile hiện đúng cái icon này).
 *
 * Đọc theo NGƯỜI đăng nhập, bỏ qua `activeContext` (nhân viên có dòng thông báo riêng) — xem
 * `notificationApi.service.js`. Cập nhật mỗi 60 giây + khi quay lại tab, không SSE.
 */
export default function NotificationBell() {
  const { t } = useI18n();
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  const query = useNotificationsQuery({ page: 1, limit: BELL_PAGE_SIZE });
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  useEffect(() => {
    if (!open) return undefined;
    const handleMouseDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const items = (query.data?.items || []).slice(0, BELL_PAGE_SIZE);
  const unreadCount = Number(query.data?.unreadCount) || 0;
  const badgeText = unreadCount > BADGE_MAX ? `${BADGE_MAX}+` : String(unreadCount);

  const handleSelect = (item) => {
    if (!item.read) markRead.mutate(item.id);
    setOpen(false);
    openNotificationLink(item.link, navigate);
  };

  const goTo = (path) => {
    setOpen(false);
    navigate(path);
  };

  const bellLabel = unreadCount > 0
    ? t('notifications.bellLabelUnread', { count: badgeText })
    : t('notifications.bellLabel');

  return (
    <div className="relative shrink-0 mx-1" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={bellLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        data-testid="notification-bell"
        className="relative inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800"
      >
        <HiOutlineBell className="h-5 w-5" aria-hidden="true" />
        {unreadCount > 0 && (
          <span
            data-testid="notification-badge"
            aria-hidden="true"
            className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white"
          >
            {badgeText}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={t('notifications.title')}
          data-testid="notification-dropdown"
          className="fixed inset-x-2 top-[48px] z-50 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-2xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[380px]"
        >
          <div className="flex items-center justify-between gap-2 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white px-4 py-3">
            <p className="text-[13px] font-bold text-gray-900">{t('notifications.title')}</p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => markAllRead.mutate()}
                disabled={unreadCount === 0 || markAllRead.isPending}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] font-medium text-orange-600 transition-colors hover:bg-orange-50 disabled:cursor-not-allowed disabled:text-gray-300 disabled:hover:bg-transparent"
              >
                <HiOutlineCheck className="h-3.5 w-3.5" aria-hidden="true" />
                {t('notifications.markAllRead')}
              </button>
              <button
                type="button"
                onClick={() => goTo(notificationPreferencesPath(user))}
                aria-label={t('notifications.settings')}
                title={t('notifications.settings')}
                data-testid="notification-settings-link"
                className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
              >
                <HiOutlineCog className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="max-h-[420px] divide-y divide-gray-50 overflow-y-auto">
            {query.isPending && query.fetchStatus !== 'idle' && (
              <div className="space-y-3 px-4 py-4" aria-busy="true">
                {[0, 1, 2].map((key) => (
                  <div key={key} className="flex gap-3">
                    <div className="h-8 w-8 animate-pulse rounded-lg bg-gray-200" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 w-2/3 animate-pulse rounded bg-gray-200" />
                      <div className="h-3 w-full animate-pulse rounded bg-gray-100" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {query.isError && !query.data && (
              <div className="px-4 py-8 text-center">
                <p className="text-[13px] text-gray-500">{t('notifications.loadFailed')}</p>
                <button
                  type="button"
                  onClick={() => query.refetch()}
                  className="mt-2 text-[12px] font-medium text-orange-600 hover:underline"
                >
                  {t('notifications.retry')}
                </button>
              </div>
            )}

            {!query.isPending && !query.isError && items.length === 0 && (
              <div className="px-4 py-10 text-center">
                <HiOutlineBell className="mx-auto h-8 w-8 text-gray-200" aria-hidden="true" />
                <p className="mt-2 text-[13px] text-gray-400">{t('notifications.empty')}</p>
              </div>
            )}

            {items.map((item) => (
              <NotificationItem key={item.id} item={item} onSelect={handleSelect} compact />
            ))}
          </div>

          <div className="border-t border-gray-100 p-1.5">
            <button
              type="button"
              onClick={() => goTo(notificationsPagePath(user))}
              data-testid="notification-view-all"
              className="w-full rounded-xl px-3 py-2 text-center text-[13px] font-medium text-orange-600 transition-colors hover:bg-orange-50"
            >
              {t('notifications.viewAll')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
