/**
 * PR-1 "thêm nhân viên phải có lối ra" (PLAN_NHAN_VIEN_KHONG_THAY_CHIEN_DICH mục 3):
 * email/tên đăng nhập trùng phải ra 400 + mã lỗi chỉ đúng lối ra — kể cả khi hai request đua nhau
 * và DB chặn bằng unique (23505) — không bao giờ rơi thành 500 "Lỗi server".
 */
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
  default: { hash: jest.fn().mockResolvedValue('hashed') },
}));

const { createEmployee, linkUserAsEmployee } = await import('../employee.service.js');

const OWNER_ID = 7;
const input = { username: 'nhanvien01', email: 'nv@example.com', fullName: 'Nhân Viên' };

/** Bắt lỗi ném ra (service ném object thường, không phải Error). */
async function catchError(promise) {
  try {
    await promise;
  } catch (err) {
    return err;
  }
  throw new Error('Kỳ vọng ném lỗi nhưng không ném');
}

beforeEach(() => {
  jest.resetAllMocks();
  repo.findOwnerPlanLimit.mockResolvedValue(-1); // không giới hạn suất → tách khỏi chuyện quota
  repo.findUserByEmail.mockResolvedValue(null);
  repo.findUserByUsername.mockResolvedValue(null);
  repo.findOwnerInfo.mockResolvedValue({ id: OWNER_ID, username: 'chu', fullName: 'Chủ' });
  repo.createEmployeeWithLink.mockResolvedValue({ id: 99, email: input.email });
  mockSendInvitation.mockResolvedValue(undefined);
});

describe('createEmployee — email đã có tài khoản', () => {
  it('400 + EMAIL_ALREADY_REGISTERED, câu chỉ sang tab "Link tài khoản có sẵn", không INSERT', async () => {
    repo.findUserByEmail.mockResolvedValue({ id: 5, status: 'active' });

    const err = await catchError(createEmployee(OWNER_ID, input));

    expect(err.status).toBe(400);
    expect(err.code).toBe('EMAIL_ALREADY_REGISTERED');
    expect(err.message).toContain('Link tài khoản có sẵn');
    expect(repo.createEmployeeWithLink).not.toHaveBeenCalled();
  });
});

describe('createEmployee — tên đăng nhập trùng', () => {
  it('400 + USERNAME_TAKEN, câu gợi ý thêm tên công ty, không INSERT', async () => {
    repo.findUserByUsername.mockResolvedValue({ id: 5 });

    const err = await catchError(createEmployee(OWNER_ID, input));

    expect(err.status).toBe(400);
    expect(err.code).toBe('USERNAME_TAKEN');
    expect(err.message).toContain('tên công ty');
    expect(repo.findUserByUsername).toHaveBeenCalledWith(input.username);
    expect(repo.createEmployeeWithLink).not.toHaveBeenCalled();
  });

  it('email trùng được báo trước tên đăng nhập trùng (lối ra của email quan trọng hơn)', async () => {
    repo.findUserByEmail.mockResolvedValue({ id: 5, status: 'active' });
    repo.findUserByUsername.mockResolvedValue({ id: 6 });

    const err = await catchError(createEmployee(OWNER_ID, input));

    expect(err.code).toBe('EMAIL_ALREADY_REGISTERED');
  });
});

describe('createEmployee — hai request đua nhau, DB ném 23505', () => {
  const pgUnique = (extra) => Object.assign(new Error('duplicate key value violates unique constraint'), { code: '23505', ...extra });

  it.each([
    ['users_username_key', 'USERNAME_TAKEN'],
    ['users_email_key', 'EMAIL_ALREADY_REGISTERED'],
  ])('constraint %s → 400 %s', async (constraint, expectedCode) => {
    repo.createEmployeeWithLink.mockRejectedValue(pgUnique({ constraint }));

    const err = await catchError(createEmployee(OWNER_ID, input));

    expect(err.status).toBe(400);
    expect(err.code).toBe(expectedCode);
  });

  it.each([
    ['Key (username)=(nhanvien01) already exists.', 'USERNAME_TAKEN'],
    ['Key (email)=(nv@example.com) already exists.', 'EMAIL_ALREADY_REGISTERED'],
  ])('tên constraint lạ nhưng detail nói cột → %s', async (detail, expectedCode) => {
    repo.createEmployeeWithLink.mockRejectedValue(pgUnique({ constraint: 'some_renamed_constraint', detail }));

    const err = await catchError(createEmployee(OWNER_ID, input));

    expect(err.code).toBe(expectedCode);
  });

  it('23505 của ràng buộc khác (không liên quan username/email) KHÔNG bị nhận nhầm — ném lại nguyên vẹn', async () => {
    const raw = pgUnique({ constraint: 'users_referral_code_key', detail: 'Key (referral_code)=(ABC) already exists.' });
    repo.createEmployeeWithLink.mockRejectedValue(raw);

    const err = await catchError(createEmployee(OWNER_ID, input));

    expect(err).toBe(raw);
    expect(err.status).toBeUndefined();
  });

  it('lỗi DB không phải 23505 → ném lại nguyên vẹn', async () => {
    const raw = Object.assign(new Error('connection lost'), { code: '57P01' });
    repo.createEmployeeWithLink.mockRejectedValue(raw);

    const err = await catchError(createEmployee(OWNER_ID, input));

    expect(err).toBe(raw);
  });
});

describe('createEmployee — đường thành công không đổi', () => {
  it('trả nhân viên mới + gửi thư mời', async () => {
    const result = await createEmployee(OWNER_ID, input);

    expect(result).toMatchObject({ id: 99, invitationSent: true, invitationError: null });
    expect(repo.createEmployeeWithLink).toHaveBeenCalledTimes(1);
    expect(mockSendInvitation).toHaveBeenCalledTimes(1);
  });
});

describe('linkUserAsEmployee — tài khoản đã xoá', () => {
  it("status 'deleted' → 404 như không tồn tại, không tạo membership", async () => {
    repo.findUserByEmail.mockResolvedValue({ id: 5, status: 'deleted' });

    const err = await catchError(linkUserAsEmployee(OWNER_ID, 'gone@example.com'));

    expect(err.status).toBe(404);
    expect(repo.linkExistingUserAsEmployee).not.toHaveBeenCalled();
  });

  it('tài khoản đang hoạt động → link bình thường', async () => {
    repo.findUserByEmail.mockResolvedValue({ id: 5, status: 'active' });
    repo.linkExistingUserAsEmployee.mockResolvedValue({ id: 5 });

    const result = await linkUserAsEmployee(OWNER_ID, ' Someone@Example.com ');

    expect(repo.findUserByEmail).toHaveBeenCalledWith('someone@example.com');
    expect(repo.linkExistingUserAsEmployee).toHaveBeenCalledWith(OWNER_ID, 5);
    expect(result).toEqual({ id: 5 });
  });

  it('tài khoản chưa kích hoạt (pending_activation) vẫn link được — chỉ "deleted" bị chặn', async () => {
    repo.findUserByEmail.mockResolvedValue({ id: 6, status: 'pending_activation' });
    repo.linkExistingUserAsEmployee.mockResolvedValue({ id: 6 });

    await linkUserAsEmployee(OWNER_ID, 'pending@example.com');

    expect(repo.linkExistingUserAsEmployee).toHaveBeenCalledWith(OWNER_ID, 6);
  });
});
