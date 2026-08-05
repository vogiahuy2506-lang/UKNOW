import { jest } from '@jest/globals';

/**
 * Khoá hành vi chống lũ log 404 của đồng bộ nhóm nền.
 *
 * Bối cảnh: cron chạy 10 phút/lần gọi getGroupChatHistory cho mọi nhóm đã biết.
 * Nhóm đã rời/giải tán trả 404 vĩnh viễn — nếu thử lại mãi và log từng nhóm thì
 * log container xoay vòng liên tục và nuốt mất các dòng chẩn đoán khác.
 */
const { default: syncService, _resetGroupAvailabilityForTests } = await import(
  '../zaloPersonalSync.service.js'
);

const notFound = () => Object.assign(new Error('Request failed with status code 404'), {
  response: { status: 404 },
});

describe('syncKnownGroupHistory — nhóm 404', () => {
  const ACCOUNT_ID = 9001;
  const USER_ID = 7;

  beforeEach(() => {
    jest.restoreAllMocks();
    _resetGroupAvailabilityForTests();
    jest.spyOn(syncService, 'getApi').mockReturnValue({});
    jest.spyOn(syncService, 'listKnownGroupIds').mockResolvedValue(['g_ok', 'g_gone']);
  });

  it('đếm nhóm 404 riêng, không ném ra ngoài và không chặn nhóm còn sống', async () => {
    jest.spyOn(syncService, 'syncChatHistory').mockImplementation(async (_a, _u, groupId) => {
      if (groupId === 'g_gone') throw notFound();
      return { synced: 4 };
    });

    const res = await syncService.syncKnownGroupHistory(ACCOUNT_ID, USER_ID);

    expect(res.synced).toBe(4);
    expect(res.notFound).toBe(1);
    // 404 không được rơi vào errors — nó là trạng thái đã biết, không phải sự cố
    expect(res.errors).toHaveLength(0);
  });

  it('sau 3 lần 404 liên tiếp thì ngừng gọi lại nhóm đó', async () => {
    const spy = jest
      .spyOn(syncService, 'syncChatHistory')
      .mockImplementation(async (_a, _u, groupId) => {
        if (groupId === 'g_gone') throw notFound();
        return { synced: 1 };
      });

    for (let i = 0; i < 3; i += 1) {
      await syncService.syncKnownGroupHistory(ACCOUNT_ID, USER_ID);
    }
    const callsAfterStrikes = spy.mock.calls.filter((c) => c[2] === 'g_gone').length;
    expect(callsAfterStrikes).toBe(3);

    const res = await syncService.syncKnownGroupHistory(ACCOUNT_ID, USER_ID);

    // Lần thứ 4: không gọi nữa, chuyển sang đếm "tạm bỏ qua"
    expect(spy.mock.calls.filter((c) => c[2] === 'g_gone')).toHaveLength(3);
    expect(res.cooledDown).toBe(1);
    // Nhóm còn sống vẫn được đồng bộ bình thường
    expect(res.synced).toBe(1);
  });

  it('lỗi khác 404 vẫn vào errors để còn thấy mà xử lý', async () => {
    jest.spyOn(syncService, 'syncChatHistory').mockImplementation(async (_a, _u, groupId) => {
      if (groupId === 'g_gone') throw new Error('socket hang up');
      return { synced: 0 };
    });

    const res = await syncService.syncKnownGroupHistory(ACCOUNT_ID, USER_ID);

    expect(res.notFound).toBe(0);
    expect(res.errors).toEqual([{ groupId: 'g_gone', error: 'socket hang up' }]);
  });

  it('không có phiên Zalo → bỏ qua, không gọi API', async () => {
    jest.spyOn(syncService, 'getApi').mockReturnValue(null);
    const spy = jest.spyOn(syncService, 'syncChatHistory');

    const res = await syncService.syncKnownGroupHistory(ACCOUNT_ID, USER_ID);

    expect(res.skipped).toBe(true);
    expect(res.reason).toBe('no_session');
    expect(spy).not.toHaveBeenCalled();
  });
});
