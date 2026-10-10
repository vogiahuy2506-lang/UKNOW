import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import notificationApi from '../../features/notifications/services/notificationApi.service';
import { useAuthStore } from '../../stores/authStore';

export const NOTIFICATIONS_QUERY_KEY = ['notifications'];
export const NOTIFICATION_LIST_KEY = ['notifications', 'list'];
export const NOTIFICATION_PREFERENCES_KEY = ['notifications', 'preferences'];

/** Chuông cập nhật mỗi 60 giây (không SSE — user chốt 10/10/2026), và ngay khi người dùng quay lại tab. */
export const NOTIFICATIONS_REFETCH_INTERVAL_MS = 60_000;
/** Dropdown chuông chỉ hiện 10 thông báo mới nhất. */
export const BELL_PAGE_SIZE = 10;

/**
 * Danh sách thông báo của NGƯỜI đang đăng nhập (+ `unreadCount` cho badge).
 *
 * Khoá cache có id người dùng: đổi tài khoản không thấy thông báo của người trước. Chỉ chạy khi đã đăng nhập;
 * không poll khi tab ở nền (mặc định của TanStack Query).
 *
 * @param {{ page?: number, limit?: number, unreadOnly?: boolean }} [params]
 * @param {object} [options] ghi đè tuỳ chọn useQuery
 */
export const useNotificationsQuery = ({ page = 1, limit = BELL_PAGE_SIZE, unreadOnly = false } = {}, options = {}) => {
  const { isAuthenticated, user } = useAuthStore();
  return useQuery({
    queryKey: [...NOTIFICATION_LIST_KEY, user?.id ?? null, { page, limit, unreadOnly }],
    queryFn: () => notificationApi.list({ page, limit, unreadOnly }),
    enabled: Boolean(isAuthenticated),
    refetchInterval: NOTIFICATIONS_REFETCH_INTERVAL_MS,
    refetchOnWindowFocus: true,
    staleTime: 10_000,
    placeholderData: keepPreviousData,
    ...options,
  });
};

/** Cập nhật mọi bản cache danh sách mà không cần chờ refetch: badge và chấm "chưa đọc" đổi ngay khi bấm. */
const patchListCaches = (queryClient, patch) => {
  queryClient.setQueriesData({ queryKey: NOTIFICATION_LIST_KEY }, (old) => (old?.items ? patch(old) : old));
};

export const useMarkNotificationRead = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => notificationApi.markRead(id),
    onSuccess: (_data, id) => {
      patchListCaches(queryClient, (old) => {
        const target = old.items.find((item) => item.id === id);
        if (!target || target.read) return old;
        return {
          ...old,
          unreadCount: Math.max(0, (old.unreadCount || 0) - 1),
          items: old.items.map((item) => (item.id === id ? { ...item, read: true } : item)),
        };
      });
    },
    // Trang khác / bộ lọc khác không chứa dòng này nên không patch được `unreadCount` — để server nói số thật.
    onSettled: () => queryClient.invalidateQueries({ queryKey: NOTIFICATION_LIST_KEY }),
  });
};

export const useMarkAllNotificationsRead = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => notificationApi.markAllRead(),
    onSuccess: () => {
      patchListCaches(queryClient, (old) => ({
        ...old,
        unreadCount: 0,
        items: old.items.map((item) => (item.read ? item : { ...item, read: true })),
      }));
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: NOTIFICATION_LIST_KEY }),
  });
};

/** Tuỳ chọn thông báo theo catalog sự kiện (`GET /notifications/preferences`). */
export const useNotificationPreferencesQuery = (options = {}) => {
  const { isAuthenticated, user } = useAuthStore();
  return useQuery({
    queryKey: [...NOTIFICATION_PREFERENCES_KEY, user?.id ?? null],
    queryFn: () => notificationApi.getPreferences(),
    enabled: Boolean(isAuthenticated),
    staleTime: 0,
    ...options,
  });
};

/**
 * Đặt công tắc email cho một loại sự kiện. Cập nhật cache bằng mục server trả về (đã là giá trị HIỆU LỰC),
 * nên nếu server từ chối (400 khoá / hệ thống tắt) thì cache giữ nguyên và công tắc không nhảy sai.
 */
export const useUpdateNotificationPreference = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ eventType, emailEnabled }) => notificationApi.updatePreference(eventType, emailEnabled),
    onSuccess: (updated) => {
      if (!updated?.eventType) return;
      queryClient.setQueriesData({ queryKey: NOTIFICATION_PREFERENCES_KEY }, (old) =>
        Array.isArray(old) ? old.map((row) => (row.eventType === updated.eventType ? { ...row, ...updated } : row)) : old
      );
    },
    // 400 khoá / hệ thống vừa tắt email: bản đang hiện đã cũ → lấy lại trạng thái thật để công tắc khoá đúng.
    onError: () => queryClient.invalidateQueries({ queryKey: NOTIFICATION_PREFERENCES_KEY }),
  });
};
