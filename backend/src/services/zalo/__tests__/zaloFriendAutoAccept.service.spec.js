/**
 * PLAN_ZALO_TU_DONG_DONG_Y_KET_BAN_2026-10-17 — Zalo cá nhân tự động đồng ý lời mời kết bạn.
 *
 * Mock `api` ĐÚNG hình dạng thật của zca-js 2.1.2: `getFriendRecommendations()` trả
 * `{ recommItems: [{ recommItemType, dataInfo }] }` (KHÔNG phải mảng trần), `acceptFriendRequest()` trả chuỗi rỗng.
 * Lời mời ĐẾN là `dataInfo.recommType === 2`; `=== 1` là "gợi ý kết bạn" và KHÔNG được đồng ý.
 * `sleep` được tiêm để test không chờ thật; `now` được tiêm để ghim giờ Việt Nam (UTC+7).
 */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockIsAutoAcceptEnabled = jest.fn();
const mockFindEnabledAccountIds = jest.fn();
const mockGetAccountApi = jest.fn();
const mockPersistFriends = jest.fn();

jest.unstable_mockModule('../../../repositories/zalo/zaloSetting.repository.js', () => ({
  default: {
    isAutoAcceptEnabled: mockIsAutoAcceptEnabled,
    findAutoAcceptEnabledAccountIds: mockFindEnabledAccountIds,
  },
}));
jest.unstable_mockModule('../zaloAccountSession.service.js', () => ({
  default: { getAccountApi: mockGetAccountApi },
}));
jest.unstable_mockModule('../../chatbot/zaloPersonalSync.service.js', () => ({
  default: { persistFriends: mockPersistFriends },
}));

const { default: service } = await import('../zaloFriendAutoAccept.service.js');

const ENV_KEYS = [
  'ZALO_AUTO_ACCEPT_PER_HOUR',
  'ZALO_AUTO_ACCEPT_DELAY_MIN_MS',
  'ZALO_AUTO_ACCEPT_DELAY_MAX_MS',
  'ZALO_OUTBOUND_QUIET_HOURS_START',
  'ZALO_OUTBOUND_QUIET_HOURS_END',
];

/** Mốc thời gian theo GIỜ VIỆT NAM (UTC+7) ngày 17/10/2026. */
const vnTime = (hour, minute = 0, second = 0) => Date.UTC(2026, 9, 17, hour - 7, minute, second);
const NOON = vnTime(12);

/** Một mục của `recommItems` đúng hình dạng thật. */
const recommItem = (userId, recommType, extra = {}) => ({
  recommItemType: 1,
  dataInfo: {
    userId: String(userId),
    zaloName: `zalo ${userId}`,
    displayName: `Người ${userId}`,
    avatar: `https://avatar.example/${userId}.jpg`,
    phoneNumber: `09000000${String(userId).padStart(2, '0')}`,
    status: '',
    gender: 0,
    dob: 0,
    type: 0,
    recommType,
    recommSrc: 0,
    recommTime: 0,
    recommInfo: { suggestWay: 0, source: 0, message: '', customText: null },
    isSeenFriendReq: false,
    ...extra,
  },
});

const makeApi = (items) => ({
  getFriendRecommendations: jest.fn().mockResolvedValue({
    expiredDuration: 3600,
    collapseMsgListConfig: { collapseId: 0, collapseXItem: 0, collapseYItem: 0 },
    recommItems: items,
  }),
  acceptFriendRequest: jest.fn().mockResolvedValue(''),
});

const instantSleep = () => jest.fn().mockResolvedValue(undefined);
const savedEnv = {};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  ENV_KEYS.forEach((key) => {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  });
  service._resetForTests();
  mockIsAutoAcceptEnabled.mockResolvedValue(true);
  mockPersistFriends.mockResolvedValue(1);
  mockFindEnabledAccountIds.mockResolvedValue([]);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  ENV_KEYS.forEach((key) => {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  });
  service._resetForTests();
});

describe('sweepAccount — chọn đúng lời mời để đồng ý', () => {
  it('3 mục (recommType 2, 2, 1): chỉ đồng ý 2 lời mời đến, KHÔNG đụng "gợi ý kết bạn" loại 1', async () => {
    const api = makeApi([recommItem(101, 2), recommItem(102, 2), recommItem(999, 1)]);
    mockGetAccountApi.mockReturnValue(api);

    const result = await service.sweepAccount(7, { sleep: instantSleep(), now: () => NOON });

    expect(api.acceptFriendRequest).toHaveBeenCalledTimes(2);
    expect(api.acceptFriendRequest).toHaveBeenNthCalledWith(1, '101');
    expect(api.acceptFriendRequest).toHaveBeenNthCalledWith(2, '102');
    expect(api.acceptFriendRequest).not.toHaveBeenCalledWith('999');
    expect(result).toEqual({ accepted: 2, failed: 0, pending: 2, remaining: 0, stoppedBy: null });
  });

  it('lưu danh bạ bằng chính dataInfo của lời mời (có tên, ảnh, SĐT) sau khi đồng ý', async () => {
    const item = recommItem(101, 2);
    mockGetAccountApi.mockReturnValue(makeApi([item]));

    await service.sweepAccount(7, { sleep: instantSleep(), now: () => NOON });

    expect(mockPersistFriends).toHaveBeenCalledTimes(1);
    expect(mockPersistFriends).toHaveBeenCalledWith(7, [item.dataInfo]);
  });

  it('chỉ đọc recommItems của đối tượng trả về: mảng trần (sai hình dạng) -> không có lời mời nào', async () => {
    const api = makeApi([]);
    api.getFriendRecommendations.mockResolvedValue([recommItem(101, 2)]);
    mockGetAccountApi.mockReturnValue(api);

    const result = await service.sweepAccount(7, { sleep: instantSleep(), now: () => NOON });

    expect(api.acceptFriendRequest).not.toHaveBeenCalled();
    expect(result.pending).toBe(0);
  });

  it('mục thiếu userId bị bỏ, không gọi acceptFriendRequest với chuỗi rỗng', async () => {
    const api = makeApi([recommItem('', 2), recommItem(101, 2)]);
    mockGetAccountApi.mockReturnValue(api);

    await service.sweepAccount(7, { sleep: instantSleep(), now: () => NOON });

    expect(api.acceptFriendRequest).toHaveBeenCalledTimes(1);
    expect(api.acceptFriendRequest).toHaveBeenCalledWith('101');
  });
});

describe('sweepAccount — điều kiện chạy', () => {
  it('công tắc tắt -> { skipped: "disabled" }, không gọi getFriendRecommendations', async () => {
    const api = makeApi([recommItem(101, 2)]);
    mockGetAccountApi.mockReturnValue(api);
    mockIsAutoAcceptEnabled.mockResolvedValue(false);

    const result = await service.sweepAccount(7, { sleep: instantSleep(), now: () => NOON });

    expect(result).toEqual({ skipped: 'disabled' });
    expect(api.getFriendRecommendations).not.toHaveBeenCalled();
    expect(api.acceptFriendRequest).not.toHaveBeenCalled();
  });

  it.each([
    ['22:59', false, vnTime(22, 59)],
    ['23:00', true, vnTime(23, 0)],
    ['05:59', true, vnTime(5, 59)],
    ['06:00', false, vnTime(6, 0)],
  ])('giờ yên lặng 23:00–06:00 giờ VN: %s -> bỏ qua = %s', async (_label, shouldSkip, nowMs) => {
    const api = makeApi([recommItem(101, 2)]);
    mockGetAccountApi.mockReturnValue(api);

    const result = await service.sweepAccount(7, { sleep: instantSleep(), now: () => nowMs });

    if (shouldSkip) {
      expect(result).toEqual({ skipped: 'quiet_hours' });
      expect(api.getFriendRecommendations).not.toHaveBeenCalled();
      expect(api.acceptFriendRequest).not.toHaveBeenCalled();
    } else {
      expect(result.skipped).toBeUndefined();
      expect(api.acceptFriendRequest).toHaveBeenCalledTimes(1);
    }
  });

  it('khung giờ yên lặng đọc từ ZALO_OUTBOUND_QUIET_HOURS_START/END (ghi đè mặc định 23–6)', async () => {
    process.env.ZALO_OUTBOUND_QUIET_HOURS_START = '12';
    process.env.ZALO_OUTBOUND_QUIET_HOURS_END = '13';
    mockGetAccountApi.mockReturnValue(makeApi([recommItem(101, 2)]));

    const result = await service.sweepAccount(7, { sleep: instantSleep(), now: () => vnTime(12, 30) });

    expect(result).toEqual({ skipped: 'quiet_hours' });
  });

  it('không có api (phiên chưa/không còn trong RAM) -> { skipped: "no_session" }', async () => {
    mockGetAccountApi.mockReturnValue(null);

    const result = await service.sweepAccount(7, { sleep: instantSleep(), now: () => NOON });

    expect(result).toEqual({ skipped: 'no_session' });
  });

  it('getFriendRecommendations ném -> { skipped: "list_failed" }, không gọi acceptFriendRequest, không ném ra ngoài', async () => {
    const api = makeApi([recommItem(101, 2)]);
    api.getFriendRecommendations.mockRejectedValue(new Error('Zalo timeout'));
    mockGetAccountApi.mockReturnValue(api);

    const result = await service.sweepAccount(7, { sleep: instantSleep(), now: () => NOON });

    expect(result).toEqual({ skipped: 'list_failed', error: 'Zalo timeout' });
    expect(api.acceptFriendRequest).not.toHaveBeenCalled();
  });

  it('hai sweep cùng lúc cho một nick -> lần hai { skipped: "running" }, nick khác vẫn chạy', async () => {
    let releaseList;
    const api = makeApi([recommItem(101, 2)]);
    api.getFriendRecommendations.mockImplementation(() => new Promise((resolve) => {
      releaseList = () => resolve({ recommItems: [recommItem(101, 2)] });
    }));
    // Nick khác không bị chặn bởi sweep của nick 7: mỗi nick có api riêng.
    const other = makeApi([]);
    mockGetAccountApi.mockImplementation((id) => (String(id) === '7' ? api : other));

    const first = service.sweepAccount(7, { sleep: instantSleep(), now: () => NOON });
    const second = await service.sweepAccount(7, { sleep: instantSleep(), now: () => NOON });
    expect(second).toEqual({ skipped: 'running' });

    const otherResult = await service.sweepAccount(8, { sleep: instantSleep(), now: () => NOON });
    expect(otherResult.skipped).toBeUndefined();

    await new Promise((resolve) => { setImmediate(resolve); });
    releaseList();
    const firstResult = await first;
    expect(firstResult.accepted).toBe(1);

    // Xong rồi thì sweep kế tiếp của nick 7 chạy lại được (Set được dọn trong finally).
    mockGetAccountApi.mockImplementation(() => makeApi([]));
    const third = await service.sweepAccount(7, { sleep: instantSleep(), now: () => NOON });
    expect(third.skipped).toBeUndefined();
  });

  it('Set "đang chạy" được dọn cả khi sweep ném lỗi bất ngờ (DB hỏng khi đọc công tắc)', async () => {
    mockIsAutoAcceptEnabled.mockRejectedValueOnce(new Error('db down'));
    await expect(service.sweepAccount(7, { sleep: instantSleep(), now: () => NOON })).rejects.toThrow('db down');

    mockGetAccountApi.mockReturnValue(makeApi([]));
    const next = await service.sweepAccount(7, { sleep: instantSleep(), now: () => NOON });
    expect(next.skipped).toBeUndefined();
  });
});

describe('sweepAccount — trần số lần đồng ý mỗi giờ', () => {
  it('25 lời mời, trần mặc định 20: đồng ý 20, stoppedBy hourly_cap; gọi lại ngay -> 0 lần', async () => {
    const items = Array.from({ length: 25 }, (_, i) => recommItem(1000 + i, 2));
    const api = makeApi(items);
    mockGetAccountApi.mockReturnValue(api);

    const first = await service.sweepAccount(7, { sleep: instantSleep(), now: () => NOON });
    expect(first).toEqual({ accepted: 20, failed: 0, pending: 25, remaining: 5, stoppedBy: 'hourly_cap' });
    expect(api.acceptFriendRequest).toHaveBeenCalledTimes(20);

    const second = await service.sweepAccount(7, { sleep: instantSleep(), now: () => NOON + 60_000 });
    expect(second.accepted).toBe(0);
    expect(second.stoppedBy).toBe('hourly_cap');
    expect(api.acceptFriendRequest).toHaveBeenCalledTimes(20);
  });

  it('cửa sổ trượt 60 phút: qua 60 phút thì được đồng ý tiếp', async () => {
    const api = makeApi(Array.from({ length: 25 }, (_, i) => recommItem(1000 + i, 2)));
    mockGetAccountApi.mockReturnValue(api);

    await service.sweepAccount(7, { sleep: instantSleep(), now: () => NOON });
    const later = await service.sweepAccount(7, { sleep: instantSleep(), now: () => NOON + 60 * 60 * 1000 + 1 });

    expect(later.accepted).toBe(20);
    expect(api.acceptFriendRequest).toHaveBeenCalledTimes(40);
  });

  it('trần đọc từ ZALO_AUTO_ACCEPT_PER_HOUR; trần tính theo TỪNG nick', async () => {
    process.env.ZALO_AUTO_ACCEPT_PER_HOUR = '3';
    const api = makeApi(Array.from({ length: 5 }, (_, i) => recommItem(1000 + i, 2)));
    mockGetAccountApi.mockReturnValue(api);

    const first = await service.sweepAccount(7, { sleep: instantSleep(), now: () => NOON });
    expect(first.accepted).toBe(3);
    expect(first.stoppedBy).toBe('hourly_cap');

    // Nick 8 có bộ đếm riêng.
    const second = await service.sweepAccount(8, { sleep: instantSleep(), now: () => NOON });
    expect(second.accepted).toBe(3);
  });

  it('lần thử THẤT BẠI cũng tính vào trần (lỗi kéo dài không thành bão gọi API)', async () => {
    process.env.ZALO_AUTO_ACCEPT_PER_HOUR = '2';
    const api = makeApi(Array.from({ length: 5 }, (_, i) => recommItem(1000 + i, 2)));
    api.acceptFriendRequest.mockRejectedValue(new Error('Zalo từ chối'));
    mockGetAccountApi.mockReturnValue(api);

    const result = await service.sweepAccount(7, { sleep: instantSleep(), now: () => NOON });

    expect(api.acceptFriendRequest).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ accepted: 0, failed: 2, pending: 5, remaining: 3, stoppedBy: 'hourly_cap' });
  });
});

describe('sweepAccount — lỗi từng lời mời không làm hỏng cả lượt', () => {
  it('acceptFriendRequest ném ở mục thứ 2 của 3 -> mục 1 và 3 vẫn được đồng ý và lưu danh bạ', async () => {
    const items = [recommItem(101, 2), recommItem(102, 2), recommItem(103, 2)];
    const api = makeApi(items);
    api.acceptFriendRequest
      .mockResolvedValueOnce('')
      .mockRejectedValueOnce(new Error('Người này đã huỷ lời mời'))
      .mockResolvedValueOnce('');
    mockGetAccountApi.mockReturnValue(api);

    const result = await service.sweepAccount(7, { sleep: instantSleep(), now: () => NOON });

    expect(api.acceptFriendRequest).toHaveBeenCalledTimes(3);
    expect(result).toEqual({ accepted: 2, failed: 1, pending: 3, remaining: 0, stoppedBy: null });
    // Lời mời lỗi KHÔNG được ghi vào danh bạ.
    expect(mockPersistFriends).toHaveBeenCalledTimes(2);
    expect(mockPersistFriends).toHaveBeenNthCalledWith(1, 7, [items[0].dataInfo]);
    expect(mockPersistFriends).toHaveBeenNthCalledWith(2, 7, [items[2].dataInfo]);
  });

  it('persistFriends ném -> lượt đồng ý vẫn tính, không ném ra ngoài, các lời mời sau vẫn chạy', async () => {
    const api = makeApi([recommItem(101, 2), recommItem(102, 2)]);
    mockPersistFriends.mockRejectedValue(new Error('db down'));
    mockGetAccountApi.mockReturnValue(api);

    const result = await service.sweepAccount(7, { sleep: instantSleep(), now: () => NOON });

    expect(api.acceptFriendRequest).toHaveBeenCalledTimes(2);
    expect(result.accepted).toBe(2);
    expect(result.failed).toBe(0);
  });
});

describe('sweepAccount — giãn cách giữa các lần đồng ý', () => {
  it('sleep gọi đúng (số lần thử − 1) lần, mỗi lần trong [MIN, MAX]', async () => {
    process.env.ZALO_AUTO_ACCEPT_DELAY_MIN_MS = '1000';
    process.env.ZALO_AUTO_ACCEPT_DELAY_MAX_MS = '2000';
    const sleep = instantSleep();
    const api = makeApi([recommItem(101, 2), recommItem(102, 2), recommItem(103, 2), recommItem(104, 2)]);
    mockGetAccountApi.mockReturnValue(api);

    await service.sweepAccount(7, { sleep, now: () => NOON });

    expect(api.acceptFriendRequest).toHaveBeenCalledTimes(4);
    expect(sleep).toHaveBeenCalledTimes(3);
    sleep.mock.calls.forEach(([ms]) => {
      expect(ms).toBeGreaterThanOrEqual(1000);
      expect(ms).toBeLessThanOrEqual(2000);
    });
  });

  it('mặc định chờ trong [15000, 45000] ms; một lời mời duy nhất -> không chờ', async () => {
    const sleep = instantSleep();
    mockGetAccountApi.mockReturnValue(makeApi([recommItem(101, 2), recommItem(102, 2), recommItem(103, 2)]));
    await service.sweepAccount(7, { sleep, now: () => NOON });
    expect(sleep).toHaveBeenCalledTimes(2);
    sleep.mock.calls.forEach(([ms]) => {
      expect(ms).toBeGreaterThanOrEqual(15_000);
      expect(ms).toBeLessThanOrEqual(45_000);
    });

    const soloSleep = instantSleep();
    mockGetAccountApi.mockReturnValue(makeApi([recommItem(201, 2)]));
    await service.sweepAccount(8, { sleep: soloSleep, now: () => NOON });
    expect(soloSleep).not.toHaveBeenCalled();
  });

  it('MAX cấu hình nhỏ hơn MIN -> không ném, chờ đúng MIN', async () => {
    process.env.ZALO_AUTO_ACCEPT_DELAY_MIN_MS = '5000';
    process.env.ZALO_AUTO_ACCEPT_DELAY_MAX_MS = '1000';
    const sleep = instantSleep();
    mockGetAccountApi.mockReturnValue(makeApi([recommItem(101, 2), recommItem(102, 2)]));

    await service.sweepAccount(7, { sleep, now: () => NOON });

    expect(sleep).toHaveBeenCalledWith(5000);
  });

  it('chủ TẮT công tắc giữa lượt (đang chờ giãn cách) -> dừng ngay, không đồng ý thêm', async () => {
    const api = makeApi([recommItem(101, 2), recommItem(102, 2), recommItem(103, 2)]);
    mockGetAccountApi.mockReturnValue(api);
    // Lần 1: kiểm đầu lượt; lần 2: sau lần chờ đầu tiên -> đã tắt.
    mockIsAutoAcceptEnabled.mockResolvedValueOnce(true).mockResolvedValue(false);

    const result = await service.sweepAccount(7, { sleep: instantSleep(), now: () => NOON });

    expect(api.acceptFriendRequest).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ accepted: 1, failed: 0, pending: 3, remaining: 2, stoppedBy: 'disabled' });
  });

  it('lượt dài trôi qua 23:00 giữa chừng -> dừng ở giờ yên lặng', async () => {
    const api = makeApi([recommItem(101, 2), recommItem(102, 2), recommItem(103, 2)]);
    mockGetAccountApi.mockReturnValue(api);
    let current = vnTime(22, 59, 40);
    const sleep = jest.fn().mockImplementation(async () => { current += 30_000; });

    const result = await service.sweepAccount(7, { sleep, now: () => current });

    expect(api.acceptFriendRequest).toHaveBeenCalledTimes(1);
    expect(result.stoppedBy).toBe('quiet_hours');
    expect(result.accepted).toBe(1);
  });
});

describe('sweepAllEnabledAccounts — cron quét bù', () => {
  it('không có nick nào bật -> status noop', async () => {
    mockFindEnabledAccountIds.mockResolvedValue([]);
    const spy = jest.spyOn(service, 'sweepAccount');

    const result = await service.sweepAllEnabledAccounts();

    expect(result).toEqual({ accounts: 0, accepted: 0, skipped: 0, errors: 0, status: 'noop' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('chạy TUẦN TỰ từng nick với reason cron, cộng dồn accepted/skipped; lỗi một nick không dừng nick sau', async () => {
    mockFindEnabledAccountIds.mockResolvedValue([{ id: 1, id_user: 10 }, { id: 2, id_user: 10 }, { id: 3, id_user: 11 }, { id: 4, id_user: 11 }]);
    const order = [];
    let inFlight = 0;
    let maxInFlight = 0;
    jest.spyOn(service, 'sweepAccount').mockImplementation(async (id) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      order.push(id);
      await new Promise((resolve) => { setImmediate(resolve); });
      inFlight -= 1;
      if (id === 1) return { accepted: 3, failed: 0, pending: 3, remaining: 0, stoppedBy: null };
      if (id === 2) return { skipped: 'no_session' };
      if (id === 3) throw new Error('boom');
      return { accepted: 2, failed: 1, pending: 3, remaining: 0, stoppedBy: null };
    });

    const result = await service.sweepAllEnabledAccounts();

    expect(order).toEqual([1, 2, 3, 4]);
    expect(maxInFlight).toBe(1);
    expect(service.sweepAccount).toHaveBeenCalledWith(1, expect.objectContaining({ reason: 'cron' }));
    expect(result).toEqual({ accounts: 4, accepted: 5, skipped: 1, errors: 1, status: 'failure' });
  });

  it('mọi nick đều chạy/bỏ qua hợp lệ -> status success; list_failed tính là lỗi', async () => {
    mockFindEnabledAccountIds.mockResolvedValue([{ id: 1, id_user: 10 }, { id: 2, id_user: 10 }]);
    jest.spyOn(service, 'sweepAccount')
      .mockResolvedValueOnce({ skipped: 'quiet_hours' })
      .mockResolvedValueOnce({ accepted: 1, failed: 0, pending: 1, remaining: 0, stoppedBy: null });
    expect((await service.sweepAllEnabledAccounts()).status).toBe('success');

    jest.restoreAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockFindEnabledAccountIds.mockResolvedValue([{ id: 1, id_user: 10 }]);
    jest.spyOn(service, 'sweepAccount').mockResolvedValueOnce({ skipped: 'list_failed', error: 'x' });
    const failed = await service.sweepAllEnabledAccounts();
    expect(failed.errors).toBe(1);
    expect(failed.status).toBe('failure');
  });
});

describe('handleFriendEvent — sự kiện chỉ đánh thức sweep', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  /** Sự kiện đúng hình dạng thật của zca-js: type 2 = REQUEST, người mời là data.fromUid, threadId = toUid (chính mình). */
  const requestEvent = (over = {}) => ({
    type: 2,
    data: { fromUid: '555', toUid: '777', src: 1, message: 'Chào bạn' },
    threadId: '777',
    isSelf: false,
    ...over,
  });

  it('isSelf: true (chính nick gửi lời mời, selfListen bật) -> KHÔNG sweep', () => {
    const spy = jest.spyOn(service, 'sweepAccount').mockResolvedValue({});

    const scheduled = service.handleFriendEvent(7, requestEvent({ isSelf: true, data: { fromUid: '777', toUid: '555' } }));
    jest.advanceTimersByTime(60_000);

    expect(scheduled).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it.each([
    ['ADD (0)', 0],
    ['REMOVE (1)', 1],
    ['UNDO_REQUEST (3)', 3],
    ['REJECT_REQUEST (4)', 4],
    ['SEEN_FRIEND_REQUEST (5)', 5],
    ['UNKNOWN (12)', 12],
  ])('type %s (không phải REQUEST) -> KHÔNG sweep', (_label, type) => {
    const spy = jest.spyOn(service, 'sweepAccount').mockResolvedValue({});

    service.handleFriendEvent(7, requestEvent({ type }));
    jest.advanceTimersByTime(60_000);

    expect(spy).not.toHaveBeenCalled();
  });

  it('sự kiện rỗng/hỏng không ném', () => {
    const spy = jest.spyOn(service, 'sweepAccount').mockResolvedValue({});
    expect(() => service.handleFriendEvent(7, null)).not.toThrow();
    expect(() => service.handleFriendEvent(7, undefined)).not.toThrow();
    jest.advanceTimersByTime(60_000);
    expect(spy).not.toHaveBeenCalled();
  });

  it('REQUEST của người khác -> sweep đúng một lần sau 10 giây, reason event', () => {
    const spy = jest.spyOn(service, 'sweepAccount').mockResolvedValue({});

    expect(service.handleFriendEvent(7, requestEvent())).toBe(true);
    jest.advanceTimersByTime(9_999);
    expect(spy).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(7, { reason: 'event' });
  });

  it('3 sự kiện REQUEST trong 10 giây -> đúng 1 sweep; sau khi sweep xong sự kiện mới lại xếp lịch được', () => {
    const spy = jest.spyOn(service, 'sweepAccount').mockResolvedValue({});

    service.handleFriendEvent(7, requestEvent());
    jest.advanceTimersByTime(3_000);
    service.handleFriendEvent(7, requestEvent());
    jest.advanceTimersByTime(3_000);
    service.handleFriendEvent(7, requestEvent());
    jest.advanceTimersByTime(60_000);

    expect(spy).toHaveBeenCalledTimes(1);

    service.handleFriendEvent(7, requestEvent());
    jest.advanceTimersByTime(10_000);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('debounce theo TỪNG nick: hai nick cùng nhận lời mời -> mỗi nick một sweep', () => {
    const spy = jest.spyOn(service, 'sweepAccount').mockResolvedValue({});

    service.handleFriendEvent(7, requestEvent());
    service.handleFriendEvent(8, requestEvent());
    jest.advanceTimersByTime(10_000);

    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy.mock.calls.map(([id]) => id).sort()).toEqual([7, 8]);
  });

  it('sweep bị từ chối -> được bắt và ghi log (không để promise bị từ chối trôi nổi)', async () => {
    jest.spyOn(service, 'sweepAccount').mockRejectedValue(new Error('db down'));

    service.handleFriendEvent(7, requestEvent());
    jest.advanceTimersByTime(10_000);
    jest.useRealTimers();
    await new Promise((resolve) => { setImmediate(resolve); });

    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('sweep sau sự kiện lỗi: db down'));
  });
});

describe('attachToListener — gắn friend_event idempotent theo đối tượng listener', () => {
  const makeListener = () => ({ on: jest.fn() });

  it('gọi 2 lần cùng listener -> listener.on gọi đúng 1 lần với "friend_event"', () => {
    const listener = makeListener();

    expect(service.attachToListener(7, listener)).toBe(true);
    expect(service.attachToListener(7, listener)).toBe(false);

    expect(listener.on).toHaveBeenCalledTimes(1);
    expect(listener.on).toHaveBeenCalledWith('friend_event', expect.any(Function));
  });

  it('listener MỚI (sau khôi phục phiên) -> gắn thêm; listener cũ không bị đụng', () => {
    const oldListener = makeListener();
    const newListener = makeListener();

    service.attachToListener(7, oldListener);
    service.attachToListener(7, newListener);

    expect(oldListener.on).toHaveBeenCalledTimes(1);
    expect(newListener.on).toHaveBeenCalledTimes(1);
  });

  it('listener null/không có .on -> không ném, không gắn', () => {
    expect(service.attachToListener(7, null)).toBe(false);
    expect(service.attachToListener(7, {})).toBe(false);
  });

  it('handler đã gắn chuyển sự kiện của đúng nick vào handleFriendEvent', () => {
    const listener = makeListener();
    const spy = jest.spyOn(service, 'handleFriendEvent').mockReturnValue(true);
    service.attachToListener(42, listener);

    const handler = listener.on.mock.calls[0][1];
    const ev = { type: 2, data: { fromUid: '1', toUid: '2' }, threadId: '2', isSelf: false };
    handler(ev);

    expect(spy).toHaveBeenCalledWith(42, ev);
  });
});
