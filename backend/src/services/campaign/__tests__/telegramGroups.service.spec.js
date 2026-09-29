/**
 * PR-E2 — service danh sách nhóm Telegram (404 workspace khác / 409 không phiên / danh sách).
 */
import { describe, it, expect, jest } from '@jest/globals';
import { listTelegramGroupsForAccount, SESSION_EXPIRED_MESSAGE } from '../telegramGroups.service.js';

const goodSession = { kv: {}, authKeys: { permanent: { 2: { 0: 1 } }, temp: {} } };
const makeDeps = ({ account, session = goodSession, groups = [], listError = null } = {}) => ({
  repo: {
    getAccountById: jest.fn(async (id, { userId }) => (account && account.id_user === userId ? account : null)),
    getSessionString: jest.fn(async () => session),
  },
  gateway: {
    listGroups: jest.fn(async () => {
      if (listError) throw listError;
      return groups;
    }),
  },
  timeoutMs: 50,
});
const acc = { id: 7, id_user: 99, is_active: true, telegram_user_id: '555' };

describe('listTelegramGroupsForAccount', () => {
  it('tài khoản của workspace khác -> 404, không gọi gateway', async () => {
    const deps = makeDeps({ account: acc });
    await expect(listTelegramGroupsForAccount({ ownerUserId: 1, accountId: 7 }, deps)).rejects.toMatchObject({ status: 404 });
    expect(deps.gateway.listGroups).not.toHaveBeenCalled();
  });

  it('id không hợp lệ -> 404', async () => {
    const deps = makeDeps({ account: acc });
    await expect(listTelegramGroupsForAccount({ ownerUserId: 99, accountId: 'abc' }, deps)).rejects.toMatchObject({ status: 404 });
  });

  it.each([
    ['không có khoá phiên', { session: null }],
    ['authKeys.permanent rỗng', { session: { authKeys: { permanent: {} } } }],
  ])('%s -> 409 kèm câu đăng nhập lại', async (_l, over) => {
    const deps = makeDeps({ account: acc, ...over });
    await expect(listTelegramGroupsForAccount({ ownerUserId: 99, accountId: 7 }, deps)).rejects.toMatchObject({
      status: 409,
      message: SESSION_EXPIRED_MESSAGE,
    });
    expect(deps.gateway.listGroups).not.toHaveBeenCalled();
  });

  it('tài khoản đã ngắt (is_active=false) -> 409', async () => {
    const deps = makeDeps({ account: { ...acc, is_active: false } });
    await expect(listTelegramGroupsForAccount({ ownerUserId: 99, accountId: 7 }, deps)).rejects.toMatchObject({ status: 409 });
  });

  it('gateway báo "No active session" -> 409', async () => {
    const deps = makeDeps({ account: acc, listError: new Error('listGroups: No active session for telegram_user_id=555') });
    await expect(listTelegramGroupsForAccount({ ownerUserId: 99, accountId: 7 }, deps)).rejects.toMatchObject({ status: 409 });
  });

  it('đúng -> trả danh sách từ gateway theo telegram_user_id', async () => {
    const groups = [{ chatId: -1001, title: 'A', type: 'supergroup', membersCount: 3 }];
    const deps = makeDeps({ account: acc, groups });
    await expect(listTelegramGroupsForAccount({ ownerUserId: 99, accountId: '7' }, deps)).resolves.toEqual(groups);
    expect(deps.gateway.listGroups).toHaveBeenCalledWith('555');
  });

  it('quá thời gian -> 504', async () => {
    const deps = makeDeps({ account: acc });
    deps.gateway.listGroups = jest.fn(() => new Promise(() => {}));
    await expect(listTelegramGroupsForAccount({ ownerUserId: 99, accountId: 7 }, deps)).rejects.toMatchObject({ status: 504 });
  });
});
