import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useChannelEntitlements } from '../useChannelEntitlements';
import * as service from '../../../services/channelEntitlement.service';

vi.mock('../../../services/channelEntitlement.service', () => ({
  getChannelEntitlements: vi.fn(),
}));

describe('useChannelEntitlements (P9)', () => {
  let queryClient;
  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });
  const wrapper = ({ children }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  it('mặc định "có quyền" khi đang tải, rồi phản ánh đúng dữ liệu backend', async () => {
    service.getChannelEntitlements.mockResolvedValue({
      data: { data: { telegram: false, whatsapp: true, limits: { telegram: 0, whatsapp: 2 } } },
    });
    const { result } = renderHook(() => useChannelEntitlements(), { wrapper });
    expect(result.current.telegram).toBe(true);
    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.telegram).toBe(false);
    expect(result.current.whatsapp).toBe(true);
    expect(result.current.limits).toEqual({ telegram: 0, whatsapp: 2 });
  });

  it('lỗi API -> giữ "có quyền" (backend vẫn chặn ở lúc gửi/kết nối)', async () => {
    service.getChannelEntitlements.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useChannelEntitlements(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.telegram).toBe(true);
    expect(result.current.whatsapp).toBe(true);
  });
});
