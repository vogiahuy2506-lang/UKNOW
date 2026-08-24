import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockFindMemberById = jest.fn();
const mockDetachMemberEmailRow = jest.fn();
const mockRevokeAllRefreshTokensForUser = jest.fn();

jest.unstable_mockModule('../../../repositories/admin/adminMembers.repository.js', () => ({
  findAllMembers: jest.fn(),
  findMemberById: mockFindMemberById,
  setMemberStatus: jest.fn(),
  promoteMemberToSuperAdmin: jest.fn(),
  demoteMemberFromSuperAdmin: jest.fn(),
  countAdmins: jest.fn(),
  setMemberRole: jest.fn(),
  detachMemberEmail: mockDetachMemberEmailRow,
  findPurgeBlockers: jest.fn(),
  purgeMember: jest.fn(),
}));

jest.unstable_mockModule('../../../repositories/user/user.repository.js', () => ({
  revokeAllRefreshTokensForUser: mockRevokeAllRefreshTokensForUser,
}));

const { detachMemberEmail } = await import('../adminMembers.service.js');

describe('adminMembers.service — detachMemberEmail', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects if member not found (404)', async () => {
    mockFindMemberById.mockResolvedValue(null);
    await expect(detachMemberEmail(10, 1, 'a@test.com')).rejects.toMatchObject({
      status: 404,
      message: 'Không tìm thấy thành viên',
    });
  });

  it('rejects if actor targets themselves (400)', async () => {
    mockFindMemberById.mockResolvedValue({ id: 1, email: 'me@test.com', role: 'admin' });
    await expect(detachMemberEmail(1, 1, 'me@test.com')).rejects.toMatchObject({
      status: 400,
      message: 'Không thể tự thao tác lên chính tài khoản của mình',
    });
  });

  it('rejects if target is another admin (400)', async () => {
    mockFindMemberById.mockResolvedValue({ id: 2, email: 'admin2@test.com', role: 'admin' });
    await expect(detachMemberEmail(2, 1, 'admin2@test.com')).rejects.toMatchObject({
      status: 400,
      message: 'Không thể thao tác lên tài khoản Super Admin khác',
    });
  });

  it('rejects if confirmEmail does not match (400)', async () => {
    mockFindMemberById.mockResolvedValue({ id: 5, email: 'target@test.com', role: 'user' });
    await expect(detachMemberEmail(5, 1, 'wrong@test.com')).rejects.toMatchObject({
      status: 400,
      message: 'Email xác nhận không khớp với email hiện tại của tài khoản',
    });
  });

  it('rejects if already deleted (400)', async () => {
    mockFindMemberById.mockResolvedValue({ id: 5, email: 'freed+5@deleted.local', role: 'user', status: 'deleted' });
    await expect(detachMemberEmail(5, 1, 'freed+5@deleted.local')).rejects.toMatchObject({
      status: 400,
      message: 'Tài khoản này đã được gỡ email trước đó',
    });
  });

  it('detaches email with releaseTrialHistory = false by default', async () => {
    mockFindMemberById.mockResolvedValue({ id: 7, email: 'user7@test.com', role: 'user', status: 'active' });
    mockDetachMemberEmailRow.mockResolvedValue({
      id: 7,
      email: 'freed+7@deleted.local',
      username: 'u_freed_7',
      status: 'deleted',
      releaseTrialHistory: false,
      anonymizedTrialOrdersCount: 0,
    });
    mockRevokeAllRefreshTokensForUser.mockResolvedValue(true);

    const res = await detachMemberEmail(7, 1, 'user7@test.com');

    expect(mockDetachMemberEmailRow).toHaveBeenCalledWith(7, {
      originalEmail: 'user7@test.com',
      releaseTrialHistory: false,
    });
    expect(mockRevokeAllRefreshTokensForUser).toHaveBeenCalledWith(7, 'admin_detach_email');
    expect(res).toMatchObject({
      id: 7,
      email: 'freed+7@deleted.local',
      originalEmail: 'user7@test.com',
      releaseTrialHistory: false,
      anonymizedTrialOrdersCount: 0,
    });
  });

  it('detaches email with releaseTrialHistory = true when requested', async () => {
    mockFindMemberById.mockResolvedValue({ id: 8, email: 'user8@test.com', role: 'user', status: 'active' });
    mockDetachMemberEmailRow.mockResolvedValue({
      id: 8,
      email: 'freed+8@deleted.local',
      username: 'u_freed_8',
      status: 'deleted',
      releaseTrialHistory: true,
      anonymizedTrialOrdersCount: 1,
    });
    mockRevokeAllRefreshTokensForUser.mockResolvedValue(true);

    const res = await detachMemberEmail(8, 1, 'user8@test.com', true);

    expect(mockDetachMemberEmailRow).toHaveBeenCalledWith(8, {
      originalEmail: 'user8@test.com',
      releaseTrialHistory: true,
    });
    expect(res).toMatchObject({
      id: 8,
      originalEmail: 'user8@test.com',
      releaseTrialHistory: true,
      anonymizedTrialOrdersCount: 1,
    });
  });
});
