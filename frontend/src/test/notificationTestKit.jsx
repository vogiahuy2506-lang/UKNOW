/**
 * Đồ nghề test chung cho chuông thông báo + trang thông báo (PR-2 thông báo, 10/10/2026): máy chủ giả có trạng thái
 * (markRead / markAllRead đổi dữ liệu thật như backend) để kiểm cả luồng "bấm → cache cập nhật → refetch vẫn khớp".
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

let seq = 0;

export function makeNotification(id, over = {}) {
  seq += 1;
  return {
    id,
    eventType: 'campaign_run_failed',
    title: `Tiêu đề ${id}`,
    titleEn: null,
    message: `Nội dung ${id}`,
    messageEn: null,
    link: '/app/delivery-monitor',
    severity: 'info',
    metadata: {},
    notificationId: null,
    read: false,
    readAt: null,
    createdAt: new Date(Date.now() - seq * 1000).toISOString(),
    ...over,
  };
}

/**
 * Gắn hành vi cho các mock của `notificationApi.service` theo một mảng thông báo trong bộ nhớ.
 * @param {Record<string, import('vitest').Mock>} api
 * @param {object[]} initial
 */
export function installFakeServer(api, initial) {
  const state = { items: initial.map((item) => ({ ...item })) };
  api.list.mockImplementation(async ({ page = 1, limit = 20, unreadOnly = false } = {}) => {
    const filtered = unreadOnly ? state.items.filter((item) => !item.read) : state.items;
    const start = (page - 1) * limit;
    return {
      items: filtered.slice(start, start + limit).map((item) => ({ ...item })),
      unreadCount: state.items.filter((item) => !item.read).length,
      pagination: { page, limit, total: filtered.length, totalPages: Math.ceil(filtered.length / limit) },
    };
  });
  api.markRead.mockImplementation(async (id) => {
    const target = state.items.find((item) => item.id === id);
    if (target) target.read = true;
    return { id, readAt: new Date().toISOString() };
  });
  api.markAllRead.mockImplementation(async () => {
    let updated = 0;
    state.items.forEach((item) => {
      if (!item.read) {
        item.read = true;
        updated += 1;
      }
    });
    return { updated };
  });
  return state;
}

export function createQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

export function withQueryClient(queryClient) {
  return function Wrapper({ children }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}
