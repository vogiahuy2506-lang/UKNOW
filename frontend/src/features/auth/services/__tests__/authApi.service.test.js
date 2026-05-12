import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
}));

import api from '../../../../services/api';
import {
  changePassword,
  getMyProfile,
  updateMyProfile,
  getMyOrders,
} from '../authApi.service';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('authApi.service', () => {
  it('changePassword → PUT /users/change-password và trả response.data', async () => {
    api.put.mockResolvedValueOnce({ data: { success: true, message: 'Đã đổi mật khẩu' } });
    const out = await changePassword({ currentPassword: 'old', newPassword: 'new' });
    expect(api.put).toHaveBeenCalledWith('/users/change-password', {
      currentPassword: 'old',
      newPassword: 'new',
    });
    expect(out).toEqual({ success: true, message: 'Đã đổi mật khẩu' });
  });

  it('changePassword bubble error từ axios', async () => {
    const err = new Error('current password sai');
    api.put.mockRejectedValueOnce(err);
    await expect(changePassword({ currentPassword: 'x', newPassword: 'y' })).rejects.toThrow(
      'current password sai'
    );
  });

  it('getMyProfile → GET /users/profile và trả response.data', async () => {
    api.get.mockResolvedValueOnce({ data: { success: true, data: { id: 1, email: 'a@b' } } });
    const out = await getMyProfile();
    expect(api.get).toHaveBeenCalledWith('/users/profile');
    expect(out).toEqual({ success: true, data: { id: 1, email: 'a@b' } });
  });

  it('updateMyProfile → PUT /users/profile với payload', async () => {
    api.put.mockResolvedValueOnce({ data: { success: true, data: { fullName: 'An' } } });
    const out = await updateMyProfile({ fullName: 'An', phone: '0901' });
    expect(api.put).toHaveBeenCalledWith('/users/profile', { fullName: 'An', phone: '0901' });
    expect(out.data.fullName).toBe('An');
  });

  it('getMyOrders → GET /users/my-orders và trả response.data', async () => {
    api.get.mockResolvedValueOnce({ data: { success: true, data: [{ id: 1 }] } });
    const out = await getMyOrders();
    expect(api.get).toHaveBeenCalledWith('/users/my-orders');
    expect(out.data).toEqual([{ id: 1 }]);
  });
});
