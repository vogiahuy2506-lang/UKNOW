import { describe, expect, it } from '@jest/globals';
import { getWorkspaceContext, getWorkspaceScope } from '../workspaceContext.util.js';

describe('workspaceContext.util', () => {
  it('self context dùng actor làm workspace owner', () => {
    expect(getWorkspaceContext({
      id: '12',
      role: 'user',
      activeContext: { type: 'self' },
    })).toMatchObject({
      actorUserId: 12,
      workspaceOwnerId: 12,
      membershipId: null,
      contextType: 'self',
      isSuperAdmin: false,
    });
  });

  it('employee context lấy owner và membership từ context đã xác minh', () => {
    expect(getWorkspaceContext({
      id: 22,
      role: 'user',
      activeContext: {
        type: 'employee',
        ownerId: '7',
        membershipId: '91',
        permissions: { landing_pages: true },
      },
    })).toEqual(expect.objectContaining({
      actorUserId: 22,
      workspaceOwnerId: 7,
      membershipId: 91,
      contextType: 'employee',
      permissions: { landing_pages: true },
    }));
  });

  it('không fallback về actor khi employee context thiếu owner đã xác minh', () => {
    try {
      getWorkspaceScope({
        id: 22,
        role: 'user',
        activeContext: { type: 'employee' },
      });
      throw new Error('Expected getWorkspaceScope to throw');
    } catch (error) {
      expect(error).toMatchObject({ statusCode: 403, code: 'INVALID_CONTEXT' });
    }
  });

  it('giữ cờ super admin nhưng không thay đổi actor/workspace attribution', () => {
    expect(getWorkspaceContext({ id: 1, role: 'admin' })).toMatchObject({
      actorUserId: 1,
      workspaceOwnerId: 1,
      isSuperAdmin: true,
    });
  });
});
