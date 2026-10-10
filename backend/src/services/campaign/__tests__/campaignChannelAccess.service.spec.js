/**
 * PLAN_GIAO_TK_TG_WA PR-H2 — quyền dùng tài khoản Telegram / WhatsApp của CHIẾN DỊCH (khuôn campaignZaloAccess G3).
 * Phép thật trên Postgres: tests/integration/telegramWhatsappAssignmentH2.test.js.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockQuery = jest.fn();
jest.unstable_mockModule('../../../config/database.js', () => ({ default: { query: mockQuery } }));

const mockGetRefs = jest.fn();
const realAccess = await import('../../user/memberChannelAccess.service.js');
jest.unstable_mockModule('../../user/memberChannelAccess.service.js', () => ({
  ...realAccess,
  getAccessibleChannelAccountRefs: mockGetRefs,
}));

const {
  assertCampaignNodesChannelAccountsAccessible,
  assertRunChannelAccountsAssigned,
  collectCampaignChannelAccountRefs,
  createRunChannelAccessGuard,
  emptyChannelScope,
  findUnassignedChannelPairs,
  getChannelScopeForUser,
  resolveChannelAccessScope,
  unrestrictedChannelScope,
} = await import('../campaignChannelAccess.service.js');

const OWNER = 10;
const EMP = 20;

/** Phạm vi theo kênh cho mockGetRefs: { telegram: [...]|null, whatsapp_baileys: [...]|null }. */
function givenScope(scope) {
  mockGetRefs.mockImplementation(async (_ctx, channel) => scope[channel]);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockResolvedValue({ rows: [] });
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('collectCampaignChannelAccountRefs', () => {
  it('gom tài khoản của node send_telegram / send_whatsapp (camelCase + snake_case, config chuỗi JSON), bỏ node khác và giá trị rỗng', () => {
    const refs = collectCampaignChannelAccountRefs([
      { nodeSubtype: 'send_telegram', config: { telegramAccountId: 7 } },
      { node_subtype: 'send_telegram', config: JSON.stringify({ telegramAccountId: '7' }) },
      { node_subtype: 'send_telegram', config: { telegramAccountId: '' } },
      { node_subtype: 'send_whatsapp', config: { whatsappSessionKey: '10-mot' } },
      { nodeSubtype: 'send_zalo_personal', config: { zaloAccountId: 5, telegramAccountId: 99 } },
      { node_subtype: 'send_email', config: null },
      null,
    ]);
    expect(refs).toEqual({ telegram: ['7'], whatsapp_baileys: ['10-mot'] });
  });

  it('không phải mảng / rỗng → hai danh sách rỗng', () => {
    expect(collectCampaignChannelAccountRefs(undefined)).toEqual({ telegram: [], whatsapp_baileys: [] });
    expect(collectCampaignChannelAccountRefs([])).toEqual({ telegram: [], whatsapp_baileys: [] });
  });
});

describe('getChannelScopeForUser', () => {
  it('chính chủ → thấy hết, không đọc CSDL', async () => {
    await expect(getChannelScopeForUser({ ownerId: OWNER, userId: OWNER })).resolves.toEqual(unrestrictedChannelScope());
    expect(mockQuery).not.toHaveBeenCalled();
    expect(mockGetRefs).not.toHaveBeenCalled();
  });

  it('super admin (users.role) → thấy hết', async () => {
    mockQuery.mockResolvedValue({ rows: [{ role: 'admin' }] });
    await expect(getChannelScopeForUser({ ownerId: OWNER, userId: 1 })).resolves.toEqual(unrestrictedChannelScope());
    expect(mockGetRefs).not.toHaveBeenCalled();
  });

  it('nhân viên → danh sách được giao của từng kênh', async () => {
    mockQuery.mockResolvedValue({ rows: [{ role: 'user' }] });
    givenScope({ telegram: ['7'], whatsapp_baileys: ['10-mot'] });
    await expect(getChannelScopeForUser({ ownerId: OWNER, userId: EMP })).resolves.toEqual({ telegram: ['7'], whatsapp_baileys: ['10-mot'] });
    expect(mockGetRefs.mock.calls[0][0]).toMatchObject({ actorUserId: EMP, workspaceOwnerId: OWNER, contextType: 'employee', isSuperAdmin: false });
  });

  it('thiếu chủ / thiếu người → phạm vi RỖNG (hỏng thì chặn); không tra được vai → vẫn kiểm theo việc giao', async () => {
    await expect(getChannelScopeForUser({ ownerId: null, userId: EMP })).resolves.toEqual(emptyChannelScope());
    await expect(getChannelScopeForUser({ ownerId: OWNER, userId: null })).resolves.toEqual(emptyChannelScope());
    mockQuery.mockRejectedValue(new Error('db down'));
    givenScope({ telegram: [], whatsapp_baileys: [] });
    await expect(getChannelScopeForUser({ ownerId: OWNER, userId: EMP })).resolves.toEqual({ telegram: [], whatsapp_baileys: [] });
  });
});

describe('resolveChannelAccessScope', () => {
  it('không có ai khác chủ (chủ tự chạy / không có người) → không ai bị lọc', async () => {
    await expect(resolveChannelAccessScope({ ownerId: OWNER, actorUserIds: [OWNER, null] }))
      .resolves.toEqual({ scope: unrestrictedChannelScope(), restrictedActors: [] });
    await expect(resolveChannelAccessScope({ ownerId: OWNER, actorUserIds: [] }))
      .resolves.toEqual({ scope: unrestrictedChannelScope(), restrictedActors: [] });
  });

  it('một nhân viên → phạm vi của nhân viên đó', async () => {
    mockQuery.mockResolvedValue({ rows: [{ role: 'user' }] });
    givenScope({ telegram: ['7'], whatsapp_baileys: [] });
    const result = await resolveChannelAccessScope({ ownerId: OWNER, actorUserIds: [EMP] });
    expect(result.scope).toEqual({ telegram: ['7'], whatsapp_baileys: [] });
    expect(result.restrictedActors).toHaveLength(1);
  });

  it('hai nhân viên → GIAO NHAU từng kênh', async () => {
    mockQuery.mockResolvedValue({ rows: [{ role: 'user' }] });
    mockGetRefs
      .mockResolvedValueOnce(['7', '8']).mockResolvedValueOnce(['10-a'])
      .mockResolvedValueOnce(['8', '9']).mockResolvedValueOnce(['10-a', '10-b']);
    const result = await resolveChannelAccessScope({ ownerId: OWNER, actorUserIds: [21, 22] });
    expect(result.scope).toEqual({ telegram: ['8'], whatsapp_baileys: ['10-a'] });
  });

  it('chủ không có (owner null) thì mọi người đều bị coi là khác chủ → bị lọc (hỏng thì chặn)', async () => {
    const result = await resolveChannelAccessScope({ ownerId: null, actorUserIds: [EMP] });
    expect(result.scope).toEqual(emptyChannelScope());
  });
});

describe('findUnassignedChannelPairs', () => {
  it('cặp (nhân viên, kênh, ref) chưa giao; null = không lọc kênh đó; so chuỗi', () => {
    const actors = [{ userId: EMP, scope: { telegram: ['7'], whatsapp_baileys: null } }];
    const pairs = findUnassignedChannelPairs(actors, { telegram: ['7', '8'], whatsapp_baileys: ['10-x'] });
    expect(pairs).toEqual([{ userId: EMP, channel: 'telegram', ref: '8' }]);
  });
});

describe('assertRunChannelAccountsAssigned', () => {
  const nodes = [{ node_subtype: 'send_telegram', config: { telegramAccountId: 8 } }];

  it('chủ kích hoạt → qua, phạm vi "thấy hết", không đọc việc giao', async () => {
    await expect(assertRunChannelAccountsAssigned({ ownerId: OWNER, actorUserIds: [OWNER], nodes }))
      .resolves.toEqual({ scope: unrestrictedChannelScope() });
    expect(mockGetRefs).not.toHaveBeenCalled();
  });

  it('nhân viên được giao đủ → qua, trả phạm vi của nhân viên cho engine', async () => {
    mockQuery.mockResolvedValue({ rows: [{ role: 'user' }] });
    givenScope({ telegram: ['8'], whatsapp_baileys: [] });
    await expect(assertRunChannelAccountsAssigned({ ownerId: OWNER, actorUserIds: [EMP], nodes }))
      .resolves.toEqual({ scope: { telegram: ['8'], whatsapp_baileys: [] } });
  });

  it('nhân viên chưa được giao → 403 CHANNEL_ACCOUNT_NOT_ASSIGNED, câu nêu TÊN tài khoản + TÊN nhân viên (người chủ đọc)', async () => {
    mockQuery.mockImplementation(async (sql) => {
      const s = String(sql);
      if (s.includes('SELECT role')) return { rows: [{ role: 'user' }] };
      if (s.includes('FROM telegram_accounts')) return { rows: [{ id: 8, first_name: 'Shop', last_name: 'VN', username: 'shop' }] };
      if (s.includes('FROM users')) return { rows: [{ id: EMP, full_name: 'Nguyễn An', username: 'an' }] };
      return { rows: [] };
    });
    givenScope({ telegram: ['7'], whatsapp_baileys: [] });
    await expect(assertRunChannelAccountsAssigned({ ownerId: OWNER, actorUserIds: [EMP], nodes })).rejects.toMatchObject({
      status: 403,
      statusCode: 403,
      code: 'CHANNEL_ACCOUNT_NOT_ASSIGNED',
      message: expect.stringMatching(/Tài khoản Telegram "Shop VN" chưa được giao cho nhân viên "Nguyễn An"/),
    });
  });

  it('WhatsApp chưa giao → tên hiển thị là khoá ngắn (bỏ tiền tố chủ); nhiều ca thì kèm "và N trường hợp khác"', async () => {
    mockQuery.mockResolvedValue({ rows: [{ role: 'user' }] });
    givenScope({ telegram: [], whatsapp_baileys: [] });
    await expect(assertRunChannelAccountsAssigned({
      ownerId: OWNER,
      actorUserIds: [EMP],
      nodes: [
        { node_subtype: 'send_whatsapp', config: { whatsappSessionKey: '10-shop' } },
        { node_subtype: 'send_whatsapp', config: { whatsappSessionKey: '10-khac' } },
      ],
    })).rejects.toMatchObject({ message: expect.stringMatching(/Tài khoản WhatsApp "shop" chưa được giao.*\(và 1 trường hợp khác\)/) });
  });

  it('chiến dịch không có node Telegram / WhatsApp → qua dù nhân viên chẳng được giao gì', async () => {
    mockQuery.mockResolvedValue({ rows: [{ role: 'user' }] });
    givenScope({ telegram: [], whatsapp_baileys: [] });
    await expect(assertRunChannelAccountsAssigned({
      ownerId: OWNER, actorUserIds: [EMP], nodes: [{ node_subtype: 'send_email', config: {} }],
    })).resolves.toMatchObject({ scope: { telegram: [], whatsapp_baileys: [] } });
  });
});

describe('assertCampaignNodesChannelAccountsAccessible (lưu / nhân bản)', () => {
  const employeeCtx = { actorUserId: EMP, workspaceOwnerId: OWNER, contextType: 'employee', isSuperAdmin: false };
  const tgNodes = [{ nodeSubtype: 'send_telegram', config: { telegramAccountId: 8 } }];

  it('chủ / super admin (phạm vi null) → qua', async () => {
    givenScope({ telegram: null, whatsapp_baileys: null });
    await expect(assertCampaignNodesChannelAccountsAccessible({ ...employeeCtx, contextType: 'self' }, tgNodes)).resolves.toBeUndefined();
  });

  it('nhân viên dùng tài khoản chưa giao → 403, câu KHÔNG nêu tên / id tài khoản chưa giao', async () => {
    givenScope({ telegram: ['7'], whatsapp_baileys: [] });
    let error;
    try {
      await assertCampaignNodesChannelAccountsAccessible(employeeCtx, tgNodes);
    } catch (e) {
      error = e;
    }
    expect(error).toMatchObject({ status: 403, code: 'CHANNEL_ACCOUNT_NOT_ASSIGNED', channel: 'telegram' });
    expect(error.message).not.toMatch(/\b8\b/);
  });

  it('được giao → qua; chiến dịch không có node kênh → KHÔNG đọc việc giao', async () => {
    givenScope({ telegram: ['8'], whatsapp_baileys: [] });
    await expect(assertCampaignNodesChannelAccountsAccessible(employeeCtx, tgNodes)).resolves.toBeUndefined();
    mockGetRefs.mockClear();
    await expect(assertCampaignNodesChannelAccountsAccessible(employeeCtx, [{ nodeSubtype: 'send_email', config: {} }])).resolves.toBeUndefined();
    expect(mockGetRefs).not.toHaveBeenCalled();
  });

  it('WhatsApp: phiên chưa giao → 403 channel whatsapp_baileys', async () => {
    givenScope({ telegram: [], whatsapp_baileys: ['10-a'] });
    await expect(assertCampaignNodesChannelAccountsAccessible(employeeCtx, [
      { nodeSubtype: 'send_whatsapp', config: { whatsappSessionKey: '10-b' } },
    ])).rejects.toMatchObject({ code: 'CHANNEL_ACCOUNT_NOT_ASSIGNED', channel: 'whatsapp_baileys' });
  });
});

describe('createRunChannelAccessGuard (engine chạy chiến dịch)', () => {
  const tgNodes = [{ node_subtype: 'send_telegram', config: { telegramAccountId: 8 } }];
  let clock;
  const makeGuard = (over = {}) => {
    const onBlocked = jest.fn().mockResolvedValue(undefined);
    const guard = createRunChannelAccessGuard({
      ownerId: OWNER,
      nodes: tgNodes,
      getActorUserIds: () => [EMP],
      onBlocked,
      now: () => clock,
      ...over,
    });
    return { guard, onBlocked };
  };
  beforeEach(() => {
    clock = 1_000_000;
    mockQuery.mockResolvedValue({ rows: [{ role: 'user' }] });
  });

  it('phạm vi mặc định RỖNG trước khi kiểm (hỏng thì chặn); enforce() xong → phạm vi của người kích hoạt', async () => {
    givenScope({ telegram: ['8'], whatsapp_baileys: [] });
    const { guard } = makeGuard();
    expect(guard.getScope()).toEqual(emptyChannelScope());
    await guard.enforce();
    expect(guard.getScope()).toEqual({ telegram: ['8'], whatsapp_baileys: [] });
  });

  it('ensureFresh(): CHƯA quá 5 phút → KHÔNG kiểm lại; quá 5 phút → kiểm lại và thấy việc giao đã bị gỡ → đóng sổ + RUN_STOPPED', async () => {
    givenScope({ telegram: ['8'], whatsapp_baileys: [] });
    const { guard, onBlocked } = makeGuard();
    await guard.enforce();
    mockGetRefs.mockClear();

    // Chủ gỡ giao giữa chừng.
    givenScope({ telegram: [], whatsapp_baileys: [] });
    clock += 4 * 60 * 1000;
    await guard.ensureFresh();
    expect(mockGetRefs).not.toHaveBeenCalled(); // vẫn còn "tươi"
    expect(onBlocked).not.toHaveBeenCalled();

    clock += 2 * 60 * 1000; // tổng 6 phút
    await expect(guard.ensureFresh()).rejects.toMatchObject({ code: 'RUN_STOPPED', channelAccessBlocked: true });
    expect(onBlocked).toHaveBeenCalledTimes(1);
    expect(onBlocked.mock.calls[0][0]).toMatchObject({ code: 'CHANNEL_ACCOUNT_NOT_ASSIGNED' });
    expect(guard.getScope()).toEqual(emptyChannelScope());
  });

  it('enforce() mỗi đầu chu kỳ LUÔN kiểm lại (không đợi 5 phút)', async () => {
    givenScope({ telegram: ['8'], whatsapp_baileys: [] });
    const { guard, onBlocked } = makeGuard();
    await guard.enforce();
    givenScope({ telegram: [], whatsapp_baileys: [] });
    await expect(guard.enforce()).rejects.toMatchObject({ code: 'RUN_STOPPED' });
    expect(onBlocked).toHaveBeenCalledTimes(1);
  });

  it('người kích hoạt là CHỦ → thấy hết, không đọc việc giao; lỗi KHÁC (không phải chưa giao) được ném nguyên, không đóng sổ', async () => {
    const owner = makeGuard({ getActorUserIds: () => [OWNER] });
    await owner.guard.enforce();
    expect(owner.guard.getScope()).toEqual(unrestrictedChannelScope());
    expect(mockGetRefs).not.toHaveBeenCalled();

    const boom = makeGuard({ getActorUserIds: () => { throw new Error('boom'); } });
    await expect(boom.guard.enforce()).rejects.toThrow('boom');
    expect(boom.onBlocked).not.toHaveBeenCalled();
  });

  it('chiến dịch không có node Telegram / WhatsApp → no-op hoàn toàn', async () => {
    const { guard, onBlocked } = makeGuard({ nodes: [{ node_subtype: 'send_email', config: {} }] });
    expect(guard.hasChannelAccountNodes).toBe(false);
    await guard.enforce();
    await guard.ensureFresh();
    expect(mockQuery).not.toHaveBeenCalled();
    expect(mockGetRefs).not.toHaveBeenCalled();
    expect(onBlocked).not.toHaveBeenCalled();
  });
});
