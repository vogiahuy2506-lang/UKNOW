import { useQuery } from '@tanstack/react-query';
import { getChannelEntitlements } from '../../services/channelEntitlement.service';

export const CHANNEL_ENTITLEMENTS_QUERY_KEY = ['channel-entitlements'];

/**
 * P9 — quyền kênh Telegram/WhatsApp theo gói (theo CHỦ workspace, do backend tính).
 * Cache theo workspace nhờ `clearQueryCache()` khi đăng xuất/đổi workspace; `staleTime: 0` để mua thêm slot/đổi gói
 * xong mở lại trang là lấy số mới (endpoint rẻ).
 *
 * Mặc định "có quyền" khi đang tải/lỗi: backend vẫn chặn ở lúc gửi/kết nối, giao diện không nên nhấp nháy ẩn hiện.
 * Trang cần chắc chắn (trang Kênh) dùng thêm `isLoading`.
 */
export function useChannelEntitlements(options = {}) {
  const query = useQuery({
    queryKey: CHANNEL_ENTITLEMENTS_QUERY_KEY,
    queryFn: async () => {
      const response = await getChannelEntitlements();
      return response?.data?.data || null;
    },
    staleTime: 0,
    ...options,
  });
  const data = query.data;
  return {
    telegram: data ? data.telegram !== false : true,
    whatsapp: data ? data.whatsapp !== false : true,
    limits: data?.limits || { telegram: null, whatsapp: null },
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}

export default useChannelEntitlements;
