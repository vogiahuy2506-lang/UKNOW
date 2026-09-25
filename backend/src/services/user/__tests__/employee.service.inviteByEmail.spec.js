import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const repo = {
  findEmployeesByOwner: jest.fn(),
  findEmployeeByIdAndOwner: jest.fn(),
  findTeamOverview: jest.fn(),
  findOwnerIdForEmployee: jest.fn(),
  countActiveEmployees: jest.fn(),
  findOwnerPlanLimit: jest.fn(),
  findUserByEmail: jest.fn(),
  findUserByUsername: jest.fn(),
  findOwnerInfo: jest.fn(),
  createEmployeeWithLink: jest.fn(),
  linkExistingUserAsEmployee: jest.fn(),
  updateEmployeeInfo: jest.fn(),
  updateEmployeePermissions: jest.fn(),
  updateEmployeeStatus: jest.fn(),
  updateEmployeeSendLimits: jest.fn(),
  removeEmployee: jest.fn(),
  resetEmployeePassword: jest.fn(),
  findCampaignApprovalThreshold: jest.fn(),
  updateCampaignApprovalThreshold: jest.fn(),
};
const mockSendInvitation = jest.fn();

jest.unstable_mockModule('../../../repositories/user/employee.repository.js', () => repo);
jest.unstable_mockModule('../../verification.service.js', () => ({
  default: { sendEmployeeInvitation: mockSendInvitation },
}));
jest.unstable_mockModule('../../../repositories/payment/topup.repository.js', () => ({
  sumActiveTopupGrants: jest.fn().mockResolvedValue(0),
}));
jest.unstable_mockModule('bcryptjs', () => ({
  default: { hash: jest.fn().mockResolvedValue('hashed_pw') },
}));

const { inviteEmployeeByEmail } = await import('../employee.service.js');

const OWNER_ID = 10;

async function catchError(promise) {
  try {
    await promise;
  } catch (err) {
    return err;
  }
  throw new Error('Kỳ vọng ném lỗi nhưng không ném');
}

describe('inviteEmployeeByEmail (PR-A: mời nhân viên chỉ cần email)', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    repo.findOwnerPlanLimit.mockResolvedValue(-1); // Không giới hạn nhân viên
    repo.countActiveEmployees.mockResolvedValue(0);
    repo.findOwnerInfo.mockResolvedValue({ id: OWNER_ID, full_name: 'Chủ Shop', username: 'chushop' });
  });

  it('email của tài khoản đang hoạt động → linked, không tạo user mới, không gửi thư', async () => {
    repo.findUserByEmail.mockResolvedValue({ id: 25, email: 'nhanvien@example.com', status: 'active' });
    repo.linkExistingUserAsEmployee.mockResolvedValue({ id: 25, memberStatus: 'active', permissions: ['campaigns_view'] });

    const result = await inviteEmployeeByEmail(OWNER_ID, { email: 'nhanvien@example.com' });

    expect(repo.linkExistingUserAsEmployee).toHaveBeenCalledWith(OWNER_ID, 25);
    expect(repo.createEmployeeWithLink).not.toHaveBeenCalled();
    expect(mockSendInvitation).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      id: 25,
      method: 'linked',
    });
  });

  it('email viết HOA của tài khoản có sẵn → nhận ra là cùng người và linked', async () => {
    repo.findUserByEmail.mockImplementation((email) => {
      if (email === 'nhanvien@example.com') {
        return Promise.resolve({ id: 25, email: 'nhanvien@example.com', status: 'active' });
      }
      return Promise.resolve(null);
    });
    repo.linkExistingUserAsEmployee.mockResolvedValue({ id: 25, memberStatus: 'active' });

    const result = await inviteEmployeeByEmail(OWNER_ID, { email: 'NhanVien@EXAMPLE.COM' });

    expect(repo.findUserByEmail).toHaveBeenCalledWith('nhanvien@example.com');
    expect(repo.linkExistingUserAsEmployee).toHaveBeenCalledWith(OWNER_ID, 25);
    expect(result.method).toBe('linked');
  });

  it('email của tài khoản pending_activation của người khác → vẫn linked, không gửi thư', async () => {
    repo.findUserByEmail.mockResolvedValue({ id: 30, email: 'pending@example.com', status: 'pending_activation' });
    repo.linkExistingUserAsEmployee.mockResolvedValue({ id: 30, memberStatus: 'active' });

    const result = await inviteEmployeeByEmail(OWNER_ID, { email: 'pending@example.com' });

    expect(repo.linkExistingUserAsEmployee).toHaveBeenCalledWith(OWNER_ID, 30);
    expect(repo.createEmployeeWithLink).not.toHaveBeenCalled();
    expect(mockSendInvitation).not.toHaveBeenCalled();
    expect(result.method).toBe('linked');
  });

  it('email chưa có → invited, tạo tài khoản pending_activation, tên tự sinh, gửi thư đúng 1 lần', async () => {
    repo.findUserByEmail.mockResolvedValue(null);
    repo.findUserByUsername.mockResolvedValue(null);
    repo.createEmployeeWithLink.mockResolvedValue({
      id: 99,
      username: 'newbie',
      email: 'newbie@example.com',
      fullName: 'Newbie User',
      status: 'pending_activation',
    });
    mockSendInvitation.mockResolvedValue('token-123');

    const result = await inviteEmployeeByEmail(OWNER_ID, {
      email: 'newbie@example.com',
      fullName: 'Newbie User',
    });

    expect(repo.createEmployeeWithLink).toHaveBeenCalledTimes(1);
    const createArgs = repo.createEmployeeWithLink.mock.calls[0][0];
    expect(createArgs).toMatchObject({
      ownerId: OWNER_ID,
      username: 'newbie',
      email: 'newbie@example.com',
      fullName: 'Newbie User',
    });
    expect(mockSendInvitation).toHaveBeenCalledTimes(1);
    expect(mockSendInvitation).toHaveBeenCalledWith('newbie@example.com', 'Chủ Shop');
    expect(result).toMatchObject({
      id: 99,
      method: 'invited',
      invitationSent: true,
      invitationError: null,
    });
  });

  it('tên sinh ra đã có người dùng → tự động thêm hậu tố số tăng dần', async () => {
    repo.findUserByEmail.mockResolvedValue(null);
    // 'alex' đã có, 'alex1' đã có, 'alex2' còn trống
    repo.findUserByUsername.mockImplementation((u) => {
      if (u === 'alex' || u === 'alex1') return Promise.resolve({ id: 1 });
      return Promise.resolve(null);
    });
    repo.createEmployeeWithLink.mockResolvedValue({
      id: 101,
      username: 'alex2',
      email: 'alex@company.vn',
    });

    const result = await inviteEmployeeByEmail(OWNER_ID, { email: 'alex@company.vn' });

    expect(repo.createEmployeeWithLink).toHaveBeenCalledWith(
      expect.objectContaining({
        username: 'alex2',
        email: 'alex@company.vn',
      })
    );
    expect(result.method).toBe('invited');
  });

  it('email của chính chủ → 400 Không thể tự thêm mình làm nhân viên', async () => {
    repo.findUserByEmail.mockResolvedValue({ id: OWNER_ID, email: 'chushop@example.com' });

    const err = await catchError(inviteEmployeeByEmail(OWNER_ID, { email: 'chushop@example.com' }));

    expect(err.status).toBe(400);
    expect(err.message).toBe('Không thể tự thêm mình làm nhân viên');
    expect(repo.linkExistingUserAsEmployee).not.toHaveBeenCalled();
    expect(repo.createEmployeeWithLink).not.toHaveBeenCalled();
  });

  it('vượt số nhân viên của gói → ném lỗi chặn từ assertCanAddEmployee', async () => {
    repo.findOwnerPlanLimit.mockResolvedValue(3);
    repo.countActiveEmployees.mockResolvedValue(3);

    const err = await catchError(inviteEmployeeByEmail(OWNER_ID, { email: 'more@example.com' }));

    expect(err.status).toBe(403);
    expect(err.code).toBe('EMPLOYEE_LIMIT_REACHED');
    expect(repo.createEmployeeWithLink).not.toHaveBeenCalled();
    expect(repo.linkExistingUserAsEmployee).not.toHaveBeenCalled();
  });

  it('đua 23505 khi tạo mới → mapEmployeeUniqueViolation trả 400', async () => {
    repo.findUserByEmail.mockResolvedValue(null);
    repo.findUserByUsername.mockResolvedValue(null);
    const dbErr = Object.assign(new Error('duplicate key'), {
      code: '23505',
      constraint: 'users_email_key',
      detail: 'Key (email)=(nv@example.com) already exists.',
    });
    repo.createEmployeeWithLink.mockRejectedValue(dbErr);

    const err = await catchError(inviteEmployeeByEmail(OWNER_ID, { email: 'nv@example.com' }));

    expect(err.status).toBe(400);
    expect(err.code).toBe('EMAIL_ALREADY_REGISTERED');
  });
});
