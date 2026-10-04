/**
 * PLAN_GIAO_TAI_KHOAN_ZALO_CHO_NHAN_VIEN PR-G3 — kiểm quyền tài khoản Zalo của CHIẾN DỊCH (không có ngữ cảnh HTTP):
 * lượt chạy nền / lịch / chạy liên tục / duyệt chỉ biết id người tạo chiến dịch, người bấm chạy, người tạo lịch.
 * Mỗi nhóm có ca "chủ thấy hết" và ca "hỏng thì chặn".
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockFindAssigned = jest.fn();
const mockDbQuery = jest.fn();

const realMemberRepo = await import('../../../repositories/user/memberChannelAccount.repository.js');
jest.unstable_mockModule('../../../repositories/user/memberChannelAccount.repository.js', () => ({
  ...realMemberRepo,
  findAssignedZaloAccountIds: mockFindAssigned,
}));
jest.unstable_mockModule('../../../config/database.js', () => ({
  default: { query: mockDbQuery, getClient: jest.fn() },
}));

const access = await import('../campaignZaloAccess.service.js');

const OWNER = 10;
const EMP_A = 20;
const EMP_B = 30;

/** users.role theo id; zalo_settings / users tên theo bảng giả. */
function installDb({ roles = {}, accountNames = {}, userNames = {} } = {}) {
  mockDbQuery.mockImplementation(async (sql, params) => {
    const text = String(sql);
    if (/SELECT role FROM users/.test(text)) {
      const role = roles[params[0]];
      return { rows: role ? [{ role }] : [] };
    }
    if (/FROM zalo_settings WHERE id = ANY/.test(text)) {
      return { rows: (params[0] || []).map((id) => ({ id, display_name: accountNames[id] || null, zalo_name: null })) };
    }
    if (/FROM users WHERE id = ANY/.test(text)) {
      return { rows: (params[0] || []).map((id) => ({ id, full_name: userNames[id] || null, username: `u${id}` })) };
    }
    throw new Error(`unexpected sql: ${text}`);
  });
}

describe('getAccessibleZaloAccountIdsForUser', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    installDb();
    mockFindAssigned.mockResolvedValue([5, 6]);
  });

  it('CHỦ (userId === ownerId) → null, không đọc việc giao, không tra vai', async () => {
    expect(await access.getAccessibleZaloAccountIdsForUser({ ownerId: OWNER, userId: OWNER })).toBeNull();
    expect(mockFindAssigned).not.toHaveBeenCalled();
    expect(mockDbQuery).not.toHaveBeenCalled();
  });

  it('nhân viên → mảng được giao của CHÍNH nhân viên đó trong không gian của chủ', async () => {
    expect(await access.getAccessibleZaloAccountIdsForUser({ ownerId: OWNER, userId: EMP_A })).toEqual([5, 6]);
    expect(mockFindAssigned).toHaveBeenCalledWith(OWNER, EMP_A);
  });

  it('super admin (users.role = admin) → null: chạy hộ khách là việc có sẵn của họ', async () => {
    installDb({ roles: { 99: 'admin' } });
    expect(await access.getAccessibleZaloAccountIdsForUser({ ownerId: OWNER, userId: 99 })).toBeNull();
    expect(mockFindAssigned).not.toHaveBeenCalled();
  });

  it('nhân viên ĐÃ BỊ XOÁ (không còn hàng giao) → [] — coi như không có tài khoản nào', async () => {
    mockFindAssigned.mockResolvedValue([]);
    expect(await access.getAccessibleZaloAccountIdsForUser({ ownerId: OWNER, userId: EMP_A })).toEqual([]);
  });

  it('FAIL-CLOSED: đọc bảng giao lỗi → [] (không bao giờ null)', async () => {
    mockFindAssigned.mockRejectedValue(new Error('db down'));
    expect(await access.getAccessibleZaloAccountIdsForUser({ ownerId: OWNER, userId: EMP_A })).toEqual([]);
  });

  it('FAIL-CLOSED: tra vai lỗi → không coi là super admin, vẫn kiểm theo việc giao', async () => {
    mockDbQuery.mockRejectedValue(new Error('roles down'));
    mockFindAssigned.mockResolvedValue([5]);
    expect(await access.getAccessibleZaloAccountIdsForUser({ ownerId: OWNER, userId: EMP_A })).toEqual([5]);
  });

  it('FAIL-CLOSED: thiếu id chủ / id người dùng → []', async () => {
    expect(await access.getAccessibleZaloAccountIdsForUser({ ownerId: null, userId: EMP_A })).toEqual([]);
    expect(await access.getAccessibleZaloAccountIdsForUser({ ownerId: OWNER, userId: null })).toEqual([]);
    expect(await access.getAccessibleZaloAccountIdsForUser({ ownerId: OWNER, userId: 'abc' })).toEqual([]);
  });
});

describe('resolveZaloAccessScope', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    installDb();
  });

  it('CHỦ tạo + CHỦ chạy → accessibleIds null (không lọc), không đọc việc giao', async () => {
    const scope = await access.resolveZaloAccessScope({ ownerId: OWNER, actorUserIds: [OWNER, OWNER, null, undefined] });
    expect(scope).toEqual({ accessibleIds: null, restrictedActors: [] });
    expect(mockFindAssigned).not.toHaveBeenCalled();
  });

  it('không có người liên quan (danh sách rỗng) → không lọc: lượt của hệ thống do chủ đặt', async () => {
    expect((await access.resolveZaloAccessScope({ ownerId: OWNER, actorUserIds: [] })).accessibleIds).toBeNull();
    expect((await access.resolveZaloAccessScope({ ownerId: OWNER })).accessibleIds).toBeNull();
  });

  it('nhân viên TẠO, chủ BẤM CHẠY → vẫn lọc theo nhân viên', async () => {
    mockFindAssigned.mockResolvedValue([5]);
    const scope = await access.resolveZaloAccessScope({ ownerId: OWNER, actorUserIds: [EMP_A, OWNER] });
    expect(scope.accessibleIds).toEqual([5]);
    expect(scope.restrictedActors).toEqual([{ userId: EMP_A, accessibleIds: [5] }]);
  });

  it('chủ TẠO, nhân viên BẤM CHẠY → lọc theo nhân viên bấm chạy', async () => {
    mockFindAssigned.mockResolvedValue([7]);
    const scope = await access.resolveZaloAccessScope({ ownerId: OWNER, actorUserIds: [OWNER, EMP_A] });
    expect(scope.accessibleIds).toEqual([7]);
  });

  it('hai nhân viên khác nhau (người tạo + người bấm chạy) → GIAO NHAU của hai danh sách', async () => {
    mockFindAssigned.mockImplementation(async (_owner, employeeId) => (employeeId === EMP_A ? [5, 6, 7] : [6, 7, 8]));
    const scope = await access.resolveZaloAccessScope({ ownerId: OWNER, actorUserIds: [EMP_A, EMP_B] });
    expect(scope.accessibleIds).toEqual([6, 7]);
    expect(scope.restrictedActors.map((actor) => actor.userId)).toEqual([EMP_A, EMP_B]);
  });

  it('nhân viên + super admin → chỉ nhân viên bị tính (super admin không thu hẹp)', async () => {
    installDb({ roles: { 99: 'admin' } });
    mockFindAssigned.mockResolvedValue([5]);
    const scope = await access.resolveZaloAccessScope({ ownerId: OWNER, actorUserIds: [EMP_A, 99] });
    expect(scope.accessibleIds).toEqual([5]);
    expect(scope.restrictedActors.map((actor) => actor.userId)).toEqual([EMP_A]);
  });

  it('FAIL-CLOSED: đọc việc giao lỗi → accessibleIds [] (chặn hết), không phải null', async () => {
    mockFindAssigned.mockRejectedValue(new Error('db down'));
    const scope = await access.resolveZaloAccessScope({ ownerId: OWNER, actorUserIds: [EMP_A] });
    expect(scope.accessibleIds).toEqual([]);
  });

  it('FAIL-CLOSED: không biết chủ → mọi người đều bị coi là người ngoài và bị chặn', async () => {
    const scope = await access.resolveZaloAccessScope({ ownerId: null, actorUserIds: [EMP_A] });
    expect(scope.accessibleIds).toEqual([]);
  });
});

describe('assertRunZaloAccountsAssigned (preflight + đầu engine)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    installDb({
      accountNames: { 5: 'Nick bán hàng', 6: 'Nick CSKH', 9: 'Nick gia đình' },
      userNames: { [EMP_A]: 'Lan', [EMP_B]: 'Minh' },
    });
    mockFindAssigned.mockResolvedValue([5, 6]);
  });

  it('CHỦ tạo + chạy: mọi tài khoản qua, không đọc việc giao, trả scope null', async () => {
    const scope = await access.assertRunZaloAccountsAssigned({
      ownerId: OWNER, actorUserIds: [OWNER, OWNER], accountIds: [5, 9, 77],
    });
    expect(scope.accessibleIds).toBeNull();
    expect(mockFindAssigned).not.toHaveBeenCalled();
  });

  it('nhân viên: mọi tài khoản đều được giao → qua, trả scope để engine dùng tiếp', async () => {
    const scope = await access.assertRunZaloAccountsAssigned({ ownerId: OWNER, actorUserIds: [EMP_A], accountIds: [5, 6, 5] });
    expect(scope.accessibleIds).toEqual([5, 6]);
  });

  it('nhân viên: một tài khoản CHƯA giao → 403 ZALO_ACCOUNT_NOT_ASSIGNED, câu nêu tên tài khoản + tên nhân viên', async () => {
    const error = await access.assertRunZaloAccountsAssigned({
      ownerId: OWNER, actorUserIds: [EMP_A], accountIds: [5, 9],
    }).catch((e) => e);
    expect(error).toBeInstanceOf(Error);
    expect(error.statusCode).toBe(403);
    expect(error.status).toBe(403);
    expect(error.code).toBe('ZALO_ACCOUNT_NOT_ASSIGNED');
    expect(error.message).toContain('Tài khoản Zalo "Nick gia đình" chưa được giao cho nhân viên "Lan"');
    expect(error.accountIds).toEqual([5, 9]);
    expect(error.blockedPairs).toEqual([{ userId: EMP_A, accountId: 9 }]);
  });

  it('nhân viên đã bị xoá (không còn hàng giao) → mọi tài khoản đều bị chặn', async () => {
    mockFindAssigned.mockResolvedValue([]);
    await expect(access.assertRunZaloAccountsAssigned({ ownerId: OWNER, actorUserIds: [EMP_A], accountIds: [5] }))
      .rejects.toMatchObject({ code: 'ZALO_ACCOUNT_NOT_ASSIGNED' });
  });

  it('chủ bấm chạy chiến dịch do NHÂN VIÊN tạo: kiểm theo nhân viên tạo (đã bị gỡ tài khoản → chặn)', async () => {
    mockFindAssigned.mockResolvedValue([6]);
    await expect(access.assertRunZaloAccountsAssigned({ ownerId: OWNER, actorUserIds: [EMP_A, OWNER], accountIds: [5] }))
      .rejects.toMatchObject({ code: 'ZALO_ACCOUNT_NOT_ASSIGNED' });
  });

  it('nhiều trường hợp lệch → câu báo kèm "(và N trường hợp khác)"', async () => {
    mockFindAssigned.mockResolvedValue([]);
    const error = await access.assertRunZaloAccountsAssigned({
      ownerId: OWNER, actorUserIds: [EMP_A], accountIds: [5, 6, 9],
    }).catch((e) => e);
    expect(error.message).toContain('(và 2 trường hợp khác)');
  });

  it('không tra được tên → vẫn chặn, câu dùng #id (tra tên lỗi không được làm mất chốt chặn)', async () => {
    mockDbQuery.mockRejectedValue(new Error('names down'));
    const error = await access.assertRunZaloAccountsAssigned({
      ownerId: OWNER, actorUserIds: [EMP_A], accountIds: [9],
    }).catch((e) => e);
    expect(error.code).toBe('ZALO_ACCOUNT_NOT_ASSIGNED');
    expect(error.message).toContain('"#9"');
    expect(error.message).toContain(`"#${EMP_A}"`);
  });

  it('FAIL-CLOSED: đọc việc giao lỗi → chặn (không cho qua)', async () => {
    mockFindAssigned.mockRejectedValue(new Error('db down'));
    await expect(access.assertRunZaloAccountsAssigned({ ownerId: OWNER, actorUserIds: [EMP_A], accountIds: [5] }))
      .rejects.toMatchObject({ code: 'ZALO_ACCOUNT_NOT_ASSIGNED' });
  });

  it('chiến dịch không dùng tài khoản Zalo nào → nhân viên qua (không có gì để chặn)', async () => {
    const scope = await access.assertRunZaloAccountsAssigned({ ownerId: OWNER, actorUserIds: [EMP_A], accountIds: [] });
    expect(scope.accessibleIds).toEqual([5, 6]);
  });
});

describe('assertCampaignNodesZaloAccountsAccessible (LƯU / nhân bản chiến dịch)', () => {
  const ownerCtx = { actorUserId: OWNER, workspaceOwnerId: OWNER, contextType: 'self', isSuperAdmin: false };
  const employeeCtx = { actorUserId: EMP_A, workspaceOwnerId: OWNER, contextType: 'employee', isSuperAdmin: false };
  const superAdminCtx = { actorUserId: 1, workspaceOwnerId: 1, contextType: 'self', isSuperAdmin: true };
  const node = (subtype, config) => ({ nodeSubtype: subtype, config });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockFindAssigned.mockResolvedValue([5]);
  });

  it('CHỦ lưu chiến dịch dùng bất kỳ tài khoản nào → qua, không đọc việc giao', async () => {
    await expect(access.assertCampaignNodesZaloAccountsAccessible(ownerCtx, [node('send_zalo_personal', { zaloAccountId: 99 })]))
      .resolves.toBeUndefined();
    expect(mockFindAssigned).not.toHaveBeenCalled();
  });

  it('super admin → qua', async () => {
    await expect(access.assertCampaignNodesZaloAccountsAccessible(superAdminCtx, [node('send_zalo_personal', { zaloAccountId: 99 })]))
      .resolves.toBeUndefined();
  });

  it('nhân viên dùng tài khoản được giao → qua', async () => {
    await expect(access.assertCampaignNodesZaloAccountsAccessible(employeeCtx, [
      node('select_zalo_account', { zaloAccountId: 5 }),
      node('send_zalo_personal', { zaloAccountId: '5' }),
    ])).resolves.toBeUndefined();
  });

  it('nhân viên dùng tài khoản CHƯA giao ở node gửi → 403, câu KHÔNG nêu tên tài khoản', async () => {
    const error = await access.assertCampaignNodesZaloAccountsAccessible(employeeCtx, [
      node('send_zalo_personal', { zaloAccountId: 9 }),
    ]).catch((e) => e);
    expect(error.statusCode).toBe(403);
    expect(error.code).toBe('ZALO_ACCOUNT_NOT_ASSIGNED');
    expect(error.accountIds).toEqual([9]);
    expect(error.message).not.toMatch(/"/);
    expect(mockDbQuery).not.toHaveBeenCalled();
  });

  it.each([
    ['get_all_friends', { zaloAccountId: 9 }],
    ['get_all_groups', { zaloAccountId: 9 }],
    ['select_zalo_account', { zaloPoolMultiAccountEnabled: true, zaloPoolAccountIds: [5, 9] }],
    ['send_zalo_personal', { zaloPersonalMultiAccountEnabled: true, zaloPersonalAccountIds: [5, 9] }],
    ['send_zalo_friend_request', { zaloFriendMultiAccountEnabled: true, zaloFriendAccountIds: ['9'] }],
    ['send_zalo_group', { zaloAccountId: '9abc' }],
  ])('node %s nhắc tới tài khoản chưa giao (%j) → 403', async (subtype, config) => {
    await expect(access.assertCampaignNodesZaloAccountsAccessible(employeeCtx, [node(subtype, config)]))
      .rejects.toMatchObject({ code: 'ZALO_ACCOUNT_NOT_ASSIGNED', statusCode: 403 });
  });

  it('id chưa giao bị CÀI SẴN dù cờ pool đang tắt → vẫn 403 (không để bật cờ sau là xong)', async () => {
    await expect(access.assertCampaignNodesZaloAccountsAccessible(employeeCtx, [
      node('select_zalo_account', { zaloPoolMultiAccountEnabled: false, zaloPoolAccountIds: [9], zaloAccountId: 5 }),
    ])).rejects.toMatchObject({ code: 'ZALO_ACCOUNT_NOT_ASSIGNED' });
  });

  it('chiến dịch không có node Zalo → nhân viên qua, không đọc việc giao', async () => {
    await expect(access.assertCampaignNodesZaloAccountsAccessible(employeeCtx, [
      node('send_email', { zaloAccountId: 9 }),
      node('manual', {}),
    ])).resolves.toBeUndefined();
    expect(mockFindAssigned).not.toHaveBeenCalled();
  });

  it('FAIL-CLOSED: đọc việc giao lỗi → nhân viên bị chặn', async () => {
    mockFindAssigned.mockRejectedValue(new Error('db down'));
    await expect(access.assertCampaignNodesZaloAccountsAccessible(employeeCtx, [node('send_zalo_personal', { zaloAccountId: 5 })]))
      .rejects.toMatchObject({ code: 'ZALO_ACCOUNT_NOT_ASSIGNED' });
  });

  it('FAIL-CLOSED: thiếu ngữ cảnh → bị chặn (không bao giờ coi là chủ)', async () => {
    await expect(access.assertCampaignNodesZaloAccountsAccessible(undefined, [node('send_zalo_personal', { zaloAccountId: 5 })]))
      .rejects.toMatchObject({ code: 'ZALO_ACCOUNT_NOT_ASSIGNED' });
  });
});

describe('resolveActorZaloAccessibleIds (trợ lý AI)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    installDb();
    mockFindAssigned.mockResolvedValue([5]);
  });

  it('chủ (actor === owner) → null', async () => {
    expect(await access.resolveActorZaloAccessibleIds({ actorUserId: OWNER, ownerUserId: OWNER })).toBeNull();
    expect(mockFindAssigned).not.toHaveBeenCalled();
  });

  it('nhân viên → mảng được giao', async () => {
    expect(await access.resolveActorZaloAccessibleIds({ actorUserId: EMP_A, ownerUserId: OWNER })).toEqual([5]);
  });

  it('không có người thao tác (gọi nội bộ) → null; có người mà thiếu chủ → [] (không xác định được → chặn)', async () => {
    expect(await access.resolveActorZaloAccessibleIds({})).toBeNull();
    expect(await access.resolveActorZaloAccessibleIds({ actorUserId: EMP_A, ownerUserId: null })).toEqual([]);
  });

  it('FAIL-CLOSED: đọc việc giao lỗi → []', async () => {
    mockFindAssigned.mockRejectedValue(new Error('db down'));
    expect(await access.resolveActorZaloAccessibleIds({ actorUserId: EMP_A, ownerUserId: OWNER })).toEqual([]);
  });
});

describe('collectEffectiveZaloAccountIds', () => {
  it('mô phỏng engine: id sót lại khi pool bật không được tính; mọi id trong pool được tính', () => {
    const ids = access.collectEffectiveZaloAccountIds([
      { id: 1, node_subtype: 'select_zalo_account', config: { zaloPoolMultiAccountEnabled: true, zaloPoolAccountIds: ['5', '6'], zaloAccountId: '9' } },
      { id: 2, node_subtype: 'send_zalo_personal', config: { zaloAccountId: '4' } },
    ]);
    expect(ids.sort()).toEqual([5, 6]);
  });
});
