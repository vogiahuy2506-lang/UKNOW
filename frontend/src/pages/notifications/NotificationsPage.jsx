import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { HiOutlineBell, HiOutlineCheck, HiOutlineCog } from 'react-icons/hi';
import PageContainer from '../../components/common/PageContainer';
import Pagination from '../../components/common/Pagination';
import { useI18n } from '../../i18n';
import { useAuthStore } from '../../stores/authStore';
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotificationsQuery,
} from '../../hooks/queries/useNotificationsQuery';
import NotificationItem from '../../features/notifications/components/NotificationItem';
import { openNotificationLink } from '../../features/notifications/utils/openNotificationLink';
import { notificationPreferencesPath } from '../../features/notifications/utils/notificationPaths';

const PAGE_SIZE = 20;

/**
 * Trang "Thông báo" (`/app/notifications`, admin: `/admin/notifications`): toàn bộ lịch sử, phân trang, lọc chưa đọc.
 * Không bọc OwnerRoute / PermissionRoute — mọi người đăng nhập đều có thông báo của riêng mình.
 */
export default function NotificationsPage() {
  const { t } = useI18n();
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [page, setPage] = useState(1);

  const query = useNotificationsQuery({ page, limit: PAGE_SIZE, unreadOnly });
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const items = query.data?.items || [];
  const unreadCount = Number(query.data?.unreadCount) || 0;
  const totalPages = Number(query.data?.pagination?.totalPages) || 1;

  // Đọc hết khi đang lọc "chưa đọc" làm trang hiện tại biến mất → lùi về trang cuối còn dữ liệu.
  useEffect(() => {
    if (query.data && !query.isPlaceholderData && page > totalPages) setPage(Math.max(1, totalPages));
  }, [query.data, query.isPlaceholderData, page, totalPages]);

  const changeFilter = (nextUnreadOnly) => {
    setUnreadOnly(nextUnreadOnly);
    setPage(1);
  };

  const handleSelect = (item) => {
    if (!item.read) markRead.mutate(item.id);
    openNotificationLink(item.link, navigate);
  };

  const tabClass = (active) =>
    `rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
      active ? 'bg-orange-500 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
    }`;

  return (
    <PageContainer
      icon={HiOutlineBell}
      title={t('notifications.title')}
      subtitle={t('notifications.pageSubtitle')}
      actions={
        <>
          <button
            type="button"
            onClick={() => markAllRead.mutate()}
            disabled={unreadCount === 0 || markAllRead.isPending}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <HiOutlineCheck className="h-4 w-4" aria-hidden="true" />
            {t('notifications.markAllRead')}
          </button>
          <button
            type="button"
            onClick={() => navigate(notificationPreferencesPath(user))}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
          >
            <HiOutlineCog className="h-4 w-4" aria-hidden="true" />
            {t('notifications.settings')}
          </button>
        </>
      }
    >
      <div className="flex items-center gap-1" role="group" aria-label={t('notifications.filterLabel')}>
        <button type="button" aria-pressed={!unreadOnly} onClick={() => changeFilter(false)} className={tabClass(!unreadOnly)}>
          {t('notifications.filterAll')}
        </button>
        <button type="button" aria-pressed={unreadOnly} onClick={() => changeFilter(true)} className={tabClass(unreadOnly)}>
          {t('notifications.filterUnread')}
          {unreadCount > 0 && (
            <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[11px] ${unreadOnly ? 'bg-white/25' : 'bg-orange-100 text-orange-700'}`}>
              {unreadCount}
            </span>
          )}
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {query.isPending && query.fetchStatus !== 'idle' && (
          <div className="space-y-4 p-5" aria-busy="true">
            {[0, 1, 2, 3].map((key) => (
              <div key={key} className="flex gap-3">
                <div className="h-8 w-8 animate-pulse rounded-lg bg-slate-200" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-1/3 animate-pulse rounded bg-slate-200" />
                  <div className="h-3 w-2/3 animate-pulse rounded bg-slate-100" />
                </div>
              </div>
            ))}
          </div>
        )}

        {query.isError && !query.data && (
          <div className="p-10 text-center">
            <p className="text-sm text-slate-500">{t('notifications.loadFailed')}</p>
            <button type="button" onClick={() => query.refetch()} className="mt-2 text-sm font-medium text-orange-600 hover:underline">
              {t('notifications.retry')}
            </button>
          </div>
        )}

        {!query.isPending && !query.isError && items.length === 0 && (
          <div className="p-12 text-center">
            <HiOutlineBell className="mx-auto h-10 w-10 text-slate-200" aria-hidden="true" />
            <p className="mt-3 text-sm text-slate-400">
              {unreadOnly ? t('notifications.emptyUnread') : t('notifications.empty')}
            </p>
          </div>
        )}

        {items.length > 0 && (
          <div className={`divide-y divide-slate-100 ${query.isPlaceholderData ? 'opacity-60' : ''}`}>
            {items.map((item) => (
              <NotificationItem key={item.id} item={item} onSelect={handleSelect} />
            ))}
          </div>
        )}
      </div>

      <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
    </PageContainer>
  );
}
