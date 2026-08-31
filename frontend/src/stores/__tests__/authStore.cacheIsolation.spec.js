import { beforeEach, describe, expect, it, vi } from 'vitest';
import { queryClient } from '../../lib/queryClient';


vi.mock('../../services/api', () => ({
  default: {
    post: vi.fn().mockResolvedValue({ data: { success: true } }),
    get: vi.fn().mockResolvedValue({ data: { data: {} } }),
  },
  setAuthStore: vi.fn(),
}));

const { useAuthStore } = await import('../authStore');

describe('authStore Cache & Workspace Isolation (End-to-End State)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryClient.clear();
    useAuthStore.setState({
      user: {
        id: 1,
        username: 'test_user',
        memberships: [
          { ownerId: 10, ownerName: 'Owner Company', permissions: { campaigns: true } },
        ],
      },
      isAuthenticated: true,
      activeContext: { type: 'self' },
    });
  });

  it('purges cached queries on logout() so subsequent user receives clean state', async () => {
    // Populate queryClient with private user data
    queryClient.setQueryData(['user', 'profile'], { id: 1, email: 'userA@uknow.vn' });
    queryClient.setQueryData(['campaigns', 'workspace-1'], [{ id: 101, name: 'Secret Campaign' }]);

    expect(queryClient.getQueryData(['user', 'profile'])).toBeDefined();

    // Trigger logout
    await useAuthStore.getState().logout({ skipServer: true });

    // Assert that cached user queries are completely wiped out
    expect(queryClient.getQueryData(['user', 'profile'])).toBeUndefined();
    expect(queryClient.getQueryData(['campaigns', 'workspace-1'])).toBeUndefined();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('purges cached queries on switchContext() so workspace data is isolated', async () => {
    // Populate queryClient with self-workspace data
    queryClient.setQueryData(['campaigns', 'self'], [{ id: 201, name: 'Self Campaign' }]);
    expect(queryClient.getQueryData(['campaigns', 'self'])).toBeDefined();

    // Switch to employee workspace 10
    await useAuthStore.getState().switchContext(10);

    // Cache must be cleared on workspace context transition
    expect(queryClient.getQueryData(['campaigns', 'self'])).toBeUndefined();
    expect(useAuthStore.getState().activeContext.type).toBe('employee');
    expect(useAuthStore.getState().activeContext.ownerId).toBe(10);

    // Populate employee workspace data
    queryClient.setQueryData(['campaigns', 'ws-10'], [{ id: 301, name: 'Company Campaign' }]);

    // Switch back to self workspace
    await useAuthStore.getState().switchContext(null);

    // Cache must be cleared again
    expect(queryClient.getQueryData(['campaigns', 'ws-10'])).toBeUndefined();
    expect(useAuthStore.getState().activeContext.type).toBe('self');
  });
});
