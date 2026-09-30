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
      data: { data: { telegram: false, whatsapp: true, zalo: false, limits: { telegram: 0, whatsapp: 2, zalo: 0 } } },
    });
    const { result } = renderHook(() => useChannelEntitlements(), { wrapper });
    expect(result.current.telegram).toBe(true);
    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.telegram).toBe(false);
    expect(result.current.whatsapp).toBe(true);
    expect(result.current.zalo).toBe(false);
    expect(result.current.limits).toEqual({ telegram: 0, whatsapp: 2, zalo: 0 });
  });

  it('lỗi API -> giữ "có quyền" (backend vẫn chặn ở lúc gửi/kết nối)', async () => {
    service.getChannelEntitlements.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useChannelEntitlements(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.telegram).toBe(true);
    expect(result.current.whatsapp).toBe(true);
    expect(result.current.zalo).toBe(true);
  });

  it('P12: zalo limit=1 -> có quyền; backend cũ thiếu trường zalo -> có quyền (fail-open)', async () => {
    service.getChannelEntitlements.mockResolvedValue({
      data: { data: { telegram: true, whatsapp: true, zalo: true, limits: { zalo: 1 } } },
    });
    const { result } = renderHook(() => useChannelEntitlements(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.zalo).toBe(true);
    expect(result.current.limits.zalo).toBe(1);

    queryClient.clear();
    service.getChannelEntitlements.mockResolvedValue({ data: { data: { telegram: true, whatsapp: true, limits: {} } } });
    const second = renderHook(() => useChannelEntitlements(), { wrapper });
    await waitFor(() => expect(second.result.current.isLoading).toBe(false));
    expect(second.result.current.zalo).toBe(true);
  });
});
