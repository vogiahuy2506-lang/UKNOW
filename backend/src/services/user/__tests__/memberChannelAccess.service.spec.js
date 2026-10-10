import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockFindAssigned = jest.fn();
const mockListOwnerAccounts = jest.fn();
const mockReplace = jest.fn();
const mockFindTelegram = jest.fn();
const mockFindWhatsApp = jest.fn();
const mockListTelegram = jest.fn();
const mockListWhatsApp = jest.fn();
const mockReplaceChannels = jest.fn();

jest.unstable_mockModule('../../../repositories/user/memberChannelAccount.repository.js', () => ({
  findAssignedZaloAccountIds: mockFindAssigned,
  listOwnerZaloAccountsWithAssignment: mockListOwnerAccounts,
  replaceZaloAccountAssignments: mockReplace,
  findAssignedTelegramAccountRefs: mockFindTelegram,
  findAssignedWhatsAppSessionKeys: mockFindWhatsApp,
  listOwnerTelegramAccountsWithAssignment: mockListTelegram,
  listOwnerWhatsAppSessionsWithAssignment: mockListWhatsApp,
  replaceChannelAssignments: mockReplaceChannels,
  TELEGRAM_CHANNEL: 'telegram',
  WHATSAPP_BAILEYS_CHANNEL: 'whatsapp_baileys',
}));

const {
  getAccessibleZaloAccountIds,
  assertZaloAccountAccess,
  assertZaloAccountInScope,
  isAssignmentScopedContext,
  isZaloAccountAccessible,
  listZaloAssignmentsForOwner,
  setZaloAssignmentsForEmployee,
  getAccessibleChannelAccountRefs,
  assertChannelAccountAccess,
  assertChannelAccountInScope,
  listTelegramAssignmentsForOwner,
  listWhatsAppAssignmentsForOwner,
  setChannelAssignmentsForEmployee,
  CHANNEL_ACCOUNT_NOT_ASSIGNED_CODE,
  ZALO_ACCOUNT_NOT_ASSIGNED_CODE,
  ZALO_ACCOUNT_NOT_ASSIGNED_MESSAGE,
} = await import('../memberChannelAccess.service.js');

const ownerCtx = { actorUserId: 10, workspaceOwnerId: 10, contextType: 'self', isSuperAdmin: false };
const superAdminCtx = { actorUserId: 1, workspaceOwnerId: 1, contextType: 'self', isSuperAdmin: true };
const employeeCtx = { actorUserId: 20, workspaceOwnerId: 10, contextType: 'employee', isSuperAdmin: false };

describe('getAccessibleZaloAccountIds', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('chủ (self) thấy tất cả → null, không chạm CSDL', async () => {
    await expect(getAccessibleZaloAccountIds(ownerCtx)).resolves.toBeNull();
    expect(mockFindAssigned).not.toHaveBeenCalled();
  });

  it('super admin thấy tất cả → null, kể cả khi đang ở ngữ cảnh nhân viên', async () => {
    await expect(getAccessibleZaloAccountIds(superAdminCtx)).resolves.toBeNull();
    await expect(getAccessibleZaloAccountIds({ ...employeeCtx, isSuperAdmin: true })).resolves.toBeNull();
    expect(mockFindAssigned).not.toHaveBeenCalled();
  });

  it('nhân viên → đúng mảng id được giao (đọc theo chủ + người thao tác)', async () => {
    mockFindAssigned.mockResolvedValue([5, 7]);
    await expect(getAccessibleZaloAccountIds(employeeCtx)).resolves.toEqual([5, 7]);
    expect(mockFindAssigned).toHaveBeenCalledWith(10, 20);
  });

  it('nhân viên chưa được giao gì → [] (không phải null)', async () => {
    mockFindAssigned.mockResolvedValue([]);
    const ids = await getAccessibleZaloAccountIds(employeeCtx);
    expect(ids).toEqual([]);
    expect(ids).not.toBeNull();
  });

  it('FAIL-CLOSED: lỗi CSDL khi đọc bảng giao → [] (không bao giờ null)', async () => {
    mockFindAssigned.mockRejectedValue(new Error('connection terminated'));
    const ids = await getAccessibleZaloAccountIds(employeeCtx);
    expect(ids).toEqual([]);
    expect(ids).not.toBeNull();
  });

  it('FAIL-CLOSED: bảng giao chưa tồn tại (42P01) → []', async () => {
    mockFindAssigned.mockRejectedValue(Object.assign(new Error('relation does not exist'), { code: '42P01' }));
    await expect(getAccessibleZaloAccountIds(employeeCtx)).resolves.toEqual([]);
  });

  it('FAIL-CLOSED: ngữ cảnh thiếu hoặc id hỏng → [] và không gọi CSDL', async () => {
    await expect(getAccessibleZaloAccountIds(undefined)).resolves.toEqual([]);
    await expect(getAccessibleZaloAccountIds({ contextType: 'employee' })).resolves.toEqual([]);
    await expect(getAccessibleZaloAccountIds({ ...employeeCtx, actorUserId: 'abc' })).resolves.toEqual([]);
    expect(mockFindAssigned).not.toHaveBeenCalled();
  });
});

describe('isAssignmentScopedContext', () => {
  it('chỉ nhân viên (không phải super admin) bị lọc; thiếu ngữ cảnh cũng bị lọc', () => {
    expect(isAssignmentScopedContext(employeeCtx)).toBe(true);
    expect(isAssignmentScopedContext(ownerCtx)).toBe(false);
    expect(isAssignmentScopedContext(superAdminCtx)).toBe(false);
    expect(isAssignmentScopedContext(undefined)).toBe(true);
  });
});

describe('isZaloAccountAccessible', () => {
  it('null = qua hết; mảng = chỉ id có trong mảng; kiểu không phải mảng = chặn', () => {
    expect(isZaloAccountAccessible(99, null)).toBe(true);
    expect(isZaloAccountAccessible('5', [5, 7])).toBe(true);
    expect(isZaloAccountAccessible(6, [5, 7])).toBe(false);
    expect(isZaloAccountAccessible(5, [])).toBe(false);
    expect(isZaloAccountAccessible(5, undefined)).toBe(false);
    expect(isZaloAccountAccessible('abc', [5])).toBe(false);
  });
});

describe('assertZaloAccountAccess', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('chủ và super admin luôn qua, kể cả id lạ', async () => {
    await expect(assertZaloAccountAccess(ownerCtx, 12345)).resolves.toBeUndefined();
    await expect(assertZaloAccountAccess(superAdminCtx, 12345)).resolves.toBeUndefined();
    expect(mockFindAssigned).not.toHaveBeenCalled();
  });

  it('nhân viên được giao → qua', async () => {
    mockFindAssigned.mockResolvedValue([5]);
    await expect(assertZaloAccountAccess(employeeCtx, '5')).resolves.toBeUndefined();
  });

  it('nhân viên chưa được giao → 403 ZALO_ACCOUNT_NOT_ASSIGNED, câu tiếng Việt', async () => {
    mockFindAssigned.mockResolvedValue([5]);
    await expect(assertZaloAccountAccess(employeeCtx, 6)).rejects.toMatchObject({
      status: 403,
      statusCode: 403,
      code: ZALO_ACCOUNT_NOT_ASSIGNED_CODE,
      message: 'Tài khoản Zalo này chưa được giao cho bạn.',
    });
    expect(ZALO_ACCOUNT_NOT_ASSIGNED_MESSAGE).toBe('Tài khoản Zalo này chưa được giao cho bạn.');
  });

  it('FAIL-CLOSED: lỗi CSDL → nhân viên bị chặn 403, không lọt', async () => {
    mockFindAssigned.mockRejectedValue(new Error('boom'));
    await expect(assertZaloAccountAccess(employeeCtx, 5)).rejects.toMatchObject({ status: 403, code: 'ZALO_ACCOUNT_NOT_ASSIGNED' });
  });
});

describe('listZaloAssignmentsForOwner / setZaloAssignmentsForEmployee', () => {
  beforeEach(() => jest.clearAllMocks());

  it('map hàng CSDL sang đối tượng có cờ assigned + source', async () => {
    mockListOwnerAccounts.mockResolvedValue([
      { id: '5', display_name: 'Shop', zalo_name: 'Z', zalo_phone: '09', status: 'connected', is_active: true, is_default: true, assignment_source: 'legacy' },
      { id: '6', display_name: 'Gia dinh', zalo_name: null, zalo_phone: null, status: 'disconnected', is_active: false, is_default: false, assignment_source: null },
    ]);
    const items = await listZaloAssignmentsForOwner(10, 20);
    expect(mockListOwnerAccounts).toHaveBeenCalledWith(10, 20);
    expect(items).toEqual([
      { id: 5, displayName: 'Shop', zaloName: 'Z', zaloPhone: '09', status: 'connected', isActive: true, isDefault: true, assigned: true, source: 'legacy' },
      { id: 6, displayName: 'Gia dinh', zaloName: '', zaloPhone: '', status: 'disconnected', isActive: false, isDefault: false, assigned: false, source: null },
    ]);
  });

  it('thay việc giao: chuyển đủ chủ, nhân viên, danh sách và người thao tác xuống repo', async () => {
    mockReplace.mockResolvedValue({ before: [5], after: [6] });
    const result = await setZaloAssignmentsForEmployee({ ownerId: 10, employeeId: 20, accountIds: [6], actorUserId: 10 });
    expect(mockReplace).toHaveBeenCalledWith({ ownerId: 10, employeeId: 20, accountIds: [6], actorUserId: 10 });
    expect(result).toEqual({ before: [5], after: [6] });
  });
});

// G2: bản đồng bộ cho chỗ đã có sẵn kết quả getAccessibleZaloAccountIds (service Hộp thư kiểm theo id hội thoại).
describe('assertZaloAccountInScope', () => {
  it('null (chủ / super admin) luôn qua, kể cả id không có thật', () => {
    expect(() => assertZaloAccountInScope(5, null)).not.toThrow();
    expect(() => assertZaloAccountInScope(null, null)).not.toThrow();
  });

  it('mảng: id có trong mảng qua (kể cả dạng chuỗi số); id khác / rỗng / NULL bị 403 ZALO_ACCOUNT_NOT_ASSIGNED', () => {
    expect(() => assertZaloAccountInScope(5, [5, 6])).not.toThrow();
    expect(() => assertZaloAccountInScope('6', [5, 6])).not.toThrow();
    for (const [id, scope] of [[7, [5, 6]], [5, []], [null, [5]], [undefined, [5]], ['abc', [5]]]) {
      let error;
      try { assertZaloAccountInScope(id, scope); } catch (e) { error = e; }
      expect(error).toMatchObject({ status: 403, statusCode: 403, code: ZALO_ACCOUNT_NOT_ASSIGNED_CODE, message: ZALO_ACCOUNT_NOT_ASSIGNED_MESSAGE });
    }
  });

  it('HỎNG THÌ CHẶN: phạm vi thiếu (undefined) hoặc sai kiểu → 403, không bao giờ coi là chủ', () => {
    for (const scope of [undefined, 'null', 5, {}]) {
      expect(() => assertZaloAccountInScope(5, scope)).toThrow(expect.objectContaining({ code: ZALO_ACCOUNT_NOT_ASSIGNED_CODE }));
    }
  });
});

describe('getAccessibleChannelAccountRefs — Telegram / WhatsApp (PR-H1)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('chủ và super admin → null (thấy tất cả), không chạm CSDL', async () => {
    await expect(getAccessibleChannelAccountRefs(ownerCtx, 'telegram')).resolves.toBeNull();
    await expect(getAccessibleChannelAccountRefs(superAdminCtx, 'whatsapp_baileys')).resolves.toBeNull();
    expect(mockFindTelegram).not.toHaveBeenCalled();
    expect(mockFindWhatsApp).not.toHaveBeenCalled();
  });

  it('nhân viên: Telegram đọc theo (chủ, nhân viên); WhatsApp đọc khoá phiên', async () => {
    mockFindTelegram.mockResolvedValue(['3', '4']);
    mockFindWhatsApp.mockResolvedValue(['10-default']);
    await expect(getAccessibleChannelAccountRefs(employeeCtx, 'telegram')).resolves.toEqual(['3', '4']);
    await expect(getAccessibleChannelAccountRefs(employeeCtx, 'whatsapp_baileys')).resolves.toEqual(['10-default']);
    expect(mockFindTelegram).toHaveBeenCalledWith(10, 20);
    expect(mockFindWhatsApp).toHaveBeenCalledWith(10, 20);
  });

  it('FAIL-CLOSED: lỗi CSDL / ngữ cảnh thiếu / kênh lạ → [] (KHÔNG BAO GIỜ null)', async () => {
    mockFindTelegram.mockRejectedValue(new Error('boom'));
    await expect(getAccessibleChannelAccountRefs(employeeCtx, 'telegram')).resolves.toEqual([]);
    await expect(getAccessibleChannelAccountRefs(undefined, 'telegram')).resolves.toEqual([]);
    await expect(getAccessibleChannelAccountRefs({ contextType: 'employee' }, 'whatsapp_baileys')).resolves.toEqual([]);
    await expect(getAccessibleChannelAccountRefs(employeeCtx, 'zalo_oa')).resolves.toEqual([]);
  });
});

describe('assertChannelAccountInScope / assertChannelAccountAccess', () => {
  beforeEach(() => jest.clearAllMocks());

  it('null → qua; ref nằm trong mảng (so chuỗi) → qua', () => {
    expect(() => assertChannelAccountInScope('telegram', 3, null)).not.toThrow();
    expect(() => assertChannelAccountInScope('telegram', 3, ['3'])).not.toThrow();
    expect(() => assertChannelAccountInScope('whatsapp_baileys', '10-a', ['10-a'])).not.toThrow();
  });

  it('ngoài mảng / mảng rỗng / thiếu phạm vi (undefined) → 403 CHANNEL_ACCOUNT_NOT_ASSIGNED, câu theo kênh', () => {
    let err;
    try { assertChannelAccountInScope('telegram', 9, ['3']); } catch (e) { err = e; }
    expect(err).toMatchObject({ status: 403, statusCode: 403, code: CHANNEL_ACCOUNT_NOT_ASSIGNED_CODE, channel: 'telegram' });
    expect(err.message).toBe('Tài khoản Telegram này chưa được giao cho bạn.');
    expect(() => assertChannelAccountInScope('whatsapp_baileys', '10-a', [])).toThrow('Tài khoản WhatsApp này chưa được giao cho bạn.');
    expect(() => assertChannelAccountInScope('telegram', 3, undefined)).toThrow();
  });

  it('assertChannelAccountAccess: nhân viên chưa được giao → 403; đã giao → qua; chủ → qua', async () => {
    mockFindWhatsApp.mockResolvedValue(['10-a']);
    await expect(assertChannelAccountAccess(employeeCtx, 'whatsapp_baileys', '10-default')).rejects.toMatchObject({ status: 403 });
    await expect(assertChannelAccountAccess(employeeCtx, 'whatsapp_baileys', '10-a')).resolves.toBeUndefined();
    await expect(assertChannelAccountAccess(ownerCtx, 'whatsapp_baileys', '10-default')).resolves.toBeUndefined();
  });
});

describe('listTelegramAssignmentsForOwner / listWhatsAppAssignmentsForOwner', () => {
  beforeEach(() => jest.clearAllMocks());

  it('Telegram: map hàng DB → tên hiển thị (không lộ trường lạ), assigned/source theo cột nguồn', async () => {
    mockListTelegram.mockResolvedValue([
      { id: '3', first_name: 'An', last_name: 'Nguyen', username: 'an_shop', phone: '+84900000001', is_active: true, assignment_source: 'legacy' },
      { id: '4', first_name: null, last_name: null, username: null, phone: null, is_active: false, assignment_source: null },
    ]);
    const rows = await listTelegramAssignmentsForOwner(10, 20);
    expect(mockListTelegram).toHaveBeenCalledWith(10, 20);
    expect(rows).toEqual([
      { id: 3, displayName: 'An Nguyen', username: 'an_shop', phone: '+84900000001', isActive: true, assigned: true, source: 'legacy' },
      { id: 4, displayName: 'Telegram #4', username: '', phone: '', isActive: false, assigned: false, source: null },
    ]);
  });

  it('WhatsApp: khoá ngắn bỏ tiền tố chủ; assigned/source theo cột nguồn; không có phiên sống vẫn liệt kê được', async () => {
    mockListWhatsApp.mockResolvedValue([
      { session_key: '10-default', assignment_source: 'self_login' },
      { session_key: '10-shop_2', assignment_source: null },
    ]);
    const rows = await listWhatsAppAssignmentsForOwner(10, 20);
    expect(rows.map((r) => [r.sessionKey, r.shortKey, r.assigned, r.source])).toEqual([
      ['10-default', 'default', true, 'self_login'],
      ['10-shop_2', 'shop_2', false, null],
    ]);
  });
});

describe('setChannelAssignmentsForEmployee', () => {
  beforeEach(() => jest.clearAllMocks());

  it('chuyển nguyên input cho repository (khoá undefined giữ nguyên để repository bỏ qua kênh đó)', async () => {
    mockReplaceChannels.mockResolvedValue({ zalo: null, telegram: { before: [], after: ['3'] }, whatsapp: null });
    const input = { ownerId: 10, employeeId: 20, actorUserId: 10, telegramAccountIds: [3] };
    await expect(setChannelAssignmentsForEmployee(input)).resolves.toEqual({ zalo: null, telegram: { before: [], after: ['3'] }, whatsapp: null });
    expect(mockReplaceChannels).toHaveBeenCalledWith(input);
    expect(Object.keys(mockReplaceChannels.mock.calls[0][0])).not.toContain('zaloAccountIds');
  });
});

