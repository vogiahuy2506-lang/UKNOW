/**
 * PLAN_GIAO_TAI_KHOAN_ZALO_CHO_NHAN_VIEN PR-G1 — service giao tài khoản Zalo cho nhân viên: chỉ nhân viên CỦA CHỦ NÀY
 * (findEmployeeByIdAndOwner) mới được xem/đổi việc giao; nhân viên của chủ khác → 404, không chạm bảng giao.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockFindEmployeeByIdAndOwner = jest.fn();
const mockList = jest.fn();
const mockListTelegram = jest.fn();
const mockListWhatsApp = jest.fn();
const mockSet = jest.fn();
const mockDisconnectActor = jest.fn();

const realEmployeeRepo = await import('../../../repositories/user/employee.repository.js');
jest.unstable_mockModule('../../../repositories/user/employee.repository.js', () => ({
  ...realEmployeeRepo,
  findEmployeeByIdAndOwner: mockFindEmployeeByIdAndOwner,
}));
jest.unstable_mockModule('../../sse.service.js', () => ({
  default: { disconnectActor: mockDisconnectActor },
}));
jest.unstable_mockModule('../memberChannelAccess.service.js', () => ({
  listZaloAssignmentsForOwner: mockList,
  listTelegramAssignmentsForOwner: mockListTelegram,
  listWhatsAppAssignmentsForOwner: mockListWhatsApp,
  setChannelAssignmentsForEmployee: mockSet,
}));

const { getEmployeeChannelAccounts, setEmployeeChannelAccounts } = await import('../employee.service.js');

async function catchError(promise) {
  try {
    await promise;
  } catch (err) {
    return err;
  }
  throw new Error('Kỳ vọng ném lỗi nhưng không ném');
}

beforeEach(() => {
  jest.clearAllMocks();
  mockList.mockResolvedValue([]);
  mockListTelegram.mockResolvedValue([]);
  mockListWhatsApp.mockResolvedValue([]);
});

describe('getEmployeeChannelAccounts', () => {
  it('nhân viên của chủ → trả danh sách Zalo + Telegram + WhatsApp kèm cờ đã giao', async () => {
    mockFindEmployeeByIdAndOwner.mockResolvedValue({ id: 20 });
    mockList.mockResolvedValue([{ id: 5, assigned: true }]);
    mockListTelegram.mockResolvedValue([{ id: 3, assigned: false }]);
    mockListWhatsApp.mockResolvedValue([{ sessionKey: '10-a', assigned: true }]);
    await expect(getEmployeeChannelAccounts(10, 20)).resolves.toEqual({
      zaloAccounts: [{ id: 5, assigned: true }],
      telegramAccounts: [{ id: 3, assigned: false }],
      whatsappAccounts: [{ sessionKey: '10-a', assigned: true }],
    });
    expect(mockFindEmployeeByIdAndOwner).toHaveBeenCalledWith(20, 10);
    expect(mockList).toHaveBeenCalledWith(10, 20);
    expect(mockListTelegram).toHaveBeenCalledWith(10, 20);
    expect(mockListWhatsApp).toHaveBeenCalledWith(10, 20);
  });

  it('nhân viên của chủ KHÁC → 404, không đọc bảng giao', async () => {
    mockFindEmployeeByIdAndOwner.mockResolvedValue(null);
    const err = await catchError(getEmployeeChannelAccounts(10, 99));
    expect(err).toMatchObject({ status: 404 });
    expect(mockList).not.toHaveBeenCalled();
    expect(mockListTelegram).not.toHaveBeenCalled();
    expect(mockListWhatsApp).not.toHaveBeenCalled();
  });
});

describe('setEmployeeChannelAccounts', () => {
  it('thay việc giao: truyền chủ, nhân viên, từng danh sách, người thao tác; trả danh sách mới + trước/sau từng kênh', async () => {
    mockFindEmployeeByIdAndOwner.mockResolvedValue({ id: 20 });
    mockSet.mockResolvedValue({ zalo: { before: [5], after: [6] }, telegram: null, whatsapp: null });
    mockList.mockResolvedValue([{ id: 6, assigned: true }]);

    const result = await setEmployeeChannelAccounts(10, 20, { zaloAccountIds: [6, 777] }, 10);

    expect(mockSet).toHaveBeenCalledWith({
      ownerId: 10, employeeId: 20, actorUserId: 10, zaloAccountIds: [6, 777], telegramAccountIds: undefined, whatsappSessionKeys: undefined,
    });
    expect(result).toEqual({
      zaloAccounts: [{ id: 6, assigned: true }],
      telegramAccounts: [],
      whatsappAccounts: [],
      changes: { zalo: { before: [5], after: [6] }, telegram: null, whatsapp: null },
    });
  });

  it('PR-H1: khoá vắng mặt được chuyển NGUYÊN là undefined (repository giữ nguyên kênh đó); đủ ba khoá thì chuyển đủ', async () => {
    mockFindEmployeeByIdAndOwner.mockResolvedValue({ id: 20 });
    mockSet.mockResolvedValue({ zalo: null, telegram: { before: [], after: ['3'] }, whatsapp: { before: [], after: ['10-a'] } });
    await setEmployeeChannelAccounts(10, 20, { telegramAccountIds: [3], whatsappSessionKeys: ['10-a'] }, 10);
    const passed = mockSet.mock.calls[0][0];
    expect(passed.zaloAccountIds).toBeUndefined();
    expect(passed.telegramAccountIds).toEqual([3]);
    expect(passed.whatsappSessionKeys).toEqual(['10-a']);
  });

  it('nhân viên của chủ KHÁC → 404 và KHÔNG ghi gì', async () => {
    mockFindEmployeeByIdAndOwner.mockResolvedValue(null);
    const err = await catchError(setEmployeeChannelAccounts(10, 99, { zaloAccountIds: [5] }, 10));
    expect(err).toMatchObject({ status: 404 });
    expect(mockSet).not.toHaveBeenCalled();
    expect(mockDisconnectActor).not.toHaveBeenCalled();
  });

  it('G2: việc giao ĐỔI (gỡ hoặc thêm, ở BẤT KỲ kênh nào) → đóng luồng SSE đang mở của đúng nhân viên đó', async () => {
    mockFindEmployeeByIdAndOwner.mockResolvedValue({ id: 20 });

    mockSet.mockResolvedValue({ zalo: { before: [5, 6], after: [5] }, telegram: null, whatsapp: null });
    await setEmployeeChannelAccounts(10, 20, { zaloAccountIds: [5] }, 10);
    expect(mockDisconnectActor).toHaveBeenCalledTimes(1);
    expect(mockDisconnectActor).toHaveBeenCalledWith(10, 20);

    mockSet.mockResolvedValue({ zalo: null, telegram: { before: ['3'], after: ['3', '4'] }, whatsapp: null });
    await setEmployeeChannelAccounts(10, 20, { telegramAccountIds: [3, 4] }, 10);
    expect(mockDisconnectActor).toHaveBeenCalledTimes(2);

    mockSet.mockResolvedValue({ zalo: null, telegram: null, whatsapp: { before: [], after: ['10-a'] } });
    await setEmployeeChannelAccounts(10, 20, { whatsappSessionKeys: ['10-a'] }, 10);
    expect(mockDisconnectActor).toHaveBeenCalledTimes(3);
  });

  it('G2: việc giao KHÔNG đổi → không đụng tới luồng SSE; lỗi đóng SSE không làm hỏng việc giao đã lưu', async () => {
    mockFindEmployeeByIdAndOwner.mockResolvedValue({ id: 20 });

    mockSet.mockResolvedValue({ zalo: { before: [5, 6], after: [5, 6] }, telegram: { before: ['3'], after: ['3'] }, whatsapp: null });
    await setEmployeeChannelAccounts(10, 20, { zaloAccountIds: [5, 6], telegramAccountIds: [3] }, 10);
    expect(mockDisconnectActor).not.toHaveBeenCalled();

    mockSet.mockResolvedValue({ zalo: { before: [], after: [8] }, telegram: null, whatsapp: null });
    mockDisconnectActor.mockImplementation(() => { throw new Error('res.end hỏng'); });
    await expect(setEmployeeChannelAccounts(10, 20, { zaloAccountIds: [8] }, 10)).resolves.toMatchObject({ changes: { zalo: { after: [8] } } });
  });
});
