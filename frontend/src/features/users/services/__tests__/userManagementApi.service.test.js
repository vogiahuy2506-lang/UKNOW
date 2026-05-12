import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

import api from '../../../../services/api';
import { userManagementApiService } from '../userManagementApi.service';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('userManagementApiService', () => {
  it('getEmployees → GET /employees', () => {
    api.get.mockReturnValueOnce(Promise.resolve({}));
    userManagementApiService.getEmployees();
    expect(api.get).toHaveBeenCalledWith('/employees');
  });

  it('createEmployee → POST /employees với payload', () => {
    api.post.mockReturnValueOnce(Promise.resolve({}));
    userManagementApiService.createEmployee({ email: 'a@b', fullName: 'An' });
    expect(api.post).toHaveBeenCalledWith('/employees', { email: 'a@b', fullName: 'An' });
  });

  it('linkEmployee → POST /employees/link với { email }', () => {
    api.post.mockReturnValueOnce(Promise.resolve({}));
    userManagementApiService.linkEmployee('a@b.com');
    expect(api.post).toHaveBeenCalledWith('/employees/link', { email: 'a@b.com' });
  });

  it('updateEmployeeInfo → PATCH /employees/{id} với payload', () => {
    api.patch.mockReturnValueOnce(Promise.resolve({}));
    userManagementApiService.updateEmployeeInfo(5, { fullName: 'New name' });
    expect(api.patch).toHaveBeenCalledWith('/employees/5', { fullName: 'New name' });
  });

  it('updateEmployeeStatus → PATCH /employees/{id}/status với { status }', () => {
    api.patch.mockReturnValueOnce(Promise.resolve({}));
    userManagementApiService.updateEmployeeStatus(5, 'disabled');
    expect(api.patch).toHaveBeenCalledWith('/employees/5/status', { status: 'disabled' });
  });

  it('resetEmployeePassword → PATCH /employees/{id}/reset-password (no body)', () => {
    api.patch.mockReturnValueOnce(Promise.resolve({}));
    userManagementApiService.resetEmployeePassword(5);
    expect(api.patch).toHaveBeenCalledWith('/employees/5/reset-password');
  });

  it('updateEmployeePermissions → PATCH /employees/{id}/permissions với { permissions }', () => {
    api.patch.mockReturnValueOnce(Promise.resolve({}));
    userManagementApiService.updateEmployeePermissions(5, ['read', 'write']);
    expect(api.patch).toHaveBeenCalledWith('/employees/5/permissions', {
      permissions: ['read', 'write'],
    });
  });

  it('updateSendLimits → PATCH /employees/{id}/limits với limits object', () => {
    api.patch.mockReturnValueOnce(Promise.resolve({}));
    userManagementApiService.updateSendLimits(5, { emailPerDay: 100 });
    expect(api.patch).toHaveBeenCalledWith('/employees/5/limits', { emailPerDay: 100 });
  });

  it('deleteEmployee → DELETE /employees/{id}', () => {
    api.delete.mockReturnValueOnce(Promise.resolve({}));
    userManagementApiService.deleteEmployee(5);
    expect(api.delete).toHaveBeenCalledWith('/employees/5');
  });

  it('resendInvite → POST /employees/{id}/resend-invite (no body)', () => {
    api.post.mockReturnValueOnce(Promise.resolve({}));
    userManagementApiService.resendInvite(5);
    expect(api.post).toHaveBeenCalledWith('/employees/5/resend-invite');
  });

  it('default export === named export', async () => {
    const mod = await import('../userManagementApi.service');
    expect(mod.default).toBe(mod.userManagementApiService);
  });
});
