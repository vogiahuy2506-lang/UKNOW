import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
import NotificationPreferencesContent from '../../features/notifications/components/NotificationPreferencesContent';
import { ensureNotificationWorkspace } from '../../features/notifications/utils/ensureNotificationWorkspace';
import { openNotificationLink } from '../../features/notifications/utils/openNotificationLink';

const PAGE_SIZE = 20;

/**
 * Trang "Thông báo" (`/app/notifications`, admin: `/admin/notifications`):
 * Gồm tab "Thông báo" (toàn bộ lịch sử, phân trang, lọc chưa đọc) và tab "Tuỳ chọn thông báo" (cấu hình bật/tắt email).
 * Không bọc OwnerRoute / PermissionRoute — mọi người đăng nhập đều có thông báo của riêng mình.
 */
export default function NotificationsPage() {
  const { t } = useI18n();
  const { user, activeContext, switchContext } = useAuthStore();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const activeTab = searchParams.get('tab') === 'preferences' ? 'preferences' : 'inbox';
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

  const changeTab = (nextTab) => {
    const next = new URLSearchParams(searchParams);
    if (nextTab === 'preferences') {
      next.set('tab', 'preferences');
    } else {
      next.delete('tab');
    }
    setSearchParams(next);
  };

  const handleSelect = async (item) => {
    if (!item.read) markRead.mutate(item.id);
    // Chuông của chủ tới tay nhân viên (hoặc ngược lại): đổi đúng không gian XONG rồi mới mở link, nếu không link 404.
    await ensureNotificationWorkspace(item, { user, activeContext, switchContext });
    openNotificationLink(item.link, navigate);
  };

  const filterPillClass = (active) =>
    `rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
      active ? 'bg-orange-500 text-white shadow-sm' : 'text-slate-600 dark:text-dk-text2 hover:bg-slate-100 dark:hover:bg-dk-strong'
    }`;

  return (
    <PageContainer
      icon={HiOutlineBell}
      title={t('notifications.title')}
      subtitle={activeTab === 'preferences' ? t('notifications.preferences.subtitle') : t('notifications.pageSubtitle')}
      actions={
        activeTab === 'inbox' ? (
          <button
            type="button"
            onClick={() => markAllRead.mutate()}
            disabled={unreadCount === 0 || markAllRead.isPending}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface px-3 py-2 text-sm font-medium text-slate-700 dark:text-dk-text transition-colors hover:bg-slate-50 dark:hover:bg-dk-raised disabled:cursor-not-allowed disabled:opacity-50"
          >
            <HiOutlineCheck className="h-4 w-4" aria-hidden="true" />
            {t('notifications.markAllRead')}
          </button>
        ) : null
      }
    >
      <div className="space-y-4">
        {/* Tab chuyển đổi: Thông báo / Tuỳ chọn thông báo */}
        <div className="flex border-b border-slate-200 dark:border-dk-border gap-2" role="tablist" aria-label={t('notifications.title')}>
          <button
            type="button"
            role="tab"
            id="tab-notifications"
            aria-selected={activeTab === 'inbox'}
            aria-controls="tabpanel-notifications"
            onClick={() => changeTab('inbox')}
            className={`-mb-px flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors cursor-pointer ${
              activeTab === 'inbox'
                ? 'border-orange-500 text-orange-600 dark:text-orange-400'
                : 'border-transparent text-slate-500 dark:text-dk-text2 hover:text-slate-700 dark:hover:text-dk-text'
            }`}
          >
            <HiOutlineBell className="w-4 h-4" aria-hidden="true" />
            <span>{t('notifications.title')}</span>
            {unreadCount > 0 && (
              <span className="rounded-full bg-orange-100 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300 px-2 py-0.5 text-xs font-bold">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>

          <button
            type="button"
            role="tab"
            id="tab-preferences"
            aria-selected={activeTab === 'preferences'}
            aria-controls="tabpanel-preferences"
            onClick={() => changeTab('preferences')}
            className={`-mb-px flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors cursor-pointer ${
              activeTab === 'preferences'
                ? 'border-orange-500 text-orange-600 dark:text-orange-400'
                : 'border-transparent text-slate-500 dark:text-dk-text2 hover:text-slate-700 dark:hover:text-dk-text'
            }`}
          >
            <HiOutlineCog className="w-4 h-4" aria-hidden="true" />
            <span>{t('notifications.preferences.title')}</span>
          </button>
        </div>

        {activeTab === 'inbox' ? (
          <div role="tabpanel" id="tabpanel-notifications" aria-labelledby="tab-notifications" className="space-y-4">
            <div className="flex items-center gap-1" role="group" aria-label={t('notifications.filterLabel')}>
              <button type="button" aria-pressed={!unreadOnly} onClick={() => changeFilter(false)} className={filterPillClass(!unreadOnly)}>
                {t('notifications.filterAll')}
              </button>
              <button type="button" aria-pressed={unreadOnly} onClick={() => changeFilter(true)} className={filterPillClass(unreadOnly)}>
                {t('notifications.filterUnread')}
                {unreadCount > 0 && (
                  <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[11px] ${unreadOnly ? 'bg-white/25' : 'bg-orange-100 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300'}`}>
                    {unreadCount}
                  </span>
                )}
              </button>
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface">
              {query.isPending && query.fetchStatus !== 'idle' && (
                <div className="space-y-4 p-5" aria-busy="true">
                  {[0, 1, 2, 3].map((key) => (
                    <div key={key} className="flex gap-3">
                      <div className="h-8 w-8 animate-pulse rounded-lg bg-slate-200 dark:bg-dk-strong" />
                      <div className="flex-1 space-y-2">
                        <div className="h-3 w-1/3 animate-pulse rounded bg-slate-200 dark:bg-dk-strong" />
                        <div className="h-3 w-2/3 animate-pulse rounded bg-slate-100 dark:bg-dk-raised" />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {query.isError && !query.data && (
                <div className="p-10 text-center">
                  <p className="text-sm text-slate-500 dark:text-dk-text2">{t('notifications.loadFailed')}</p>
                  <button type="button" onClick={() => query.refetch()} className="mt-2 text-sm font-medium text-orange-600 dark:text-orange-400 hover:underline">
                    {t('notifications.retry')}
                  </button>
                </div>
              )}

              {!query.isPending && !query.isError && items.length === 0 && (
                <div className="p-12 text-center">
                  <HiOutlineBell className="mx-auto h-10 w-10 text-slate-200 dark:text-dk-border" aria-hidden="true" />
                  <p className="mt-3 text-sm text-slate-400 dark:text-dk-muted">
                    {unreadOnly ? t('notifications.emptyUnread') : t('notifications.empty')}
                  </p>
                </div>
              )}

              {items.length > 0 && (
                <div className={`divide-y divide-slate-100 dark:divide-dk-border ${query.isPlaceholderData ? 'opacity-60' : ''}`}>
                  {items.map((item) => (
                    <NotificationItem key={item.id} item={item} onSelect={handleSelect} />
                  ))}
                </div>
              )}
            </div>

            <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
          </div>
        ) : (
          <div role="tabpanel" id="tabpanel-preferences" aria-labelledby="tab-preferences">
            <NotificationPreferencesContent />
          </div>
        )}
      </div>
    </PageContainer>
  );
}
