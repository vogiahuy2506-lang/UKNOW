/**
 * Bấm chuông thì tự đổi đúng không gian làm việc (PLAN_CHUONG_DOI_KHONG_GIAN_2026-10-13). Helper chỉ ĐỔI không gian — việc điều hướng
 * nằm ở hai handleSelect (có test thứ tự ở NotificationBell.spec.jsx / NotificationsPage.spec.jsx).
 */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { ensureNotificationWorkspace } from '../utils/ensureNotificationWorkspace';

const SELF = { type: 'self' };
const employeeOf = (ownerId) => ({ type: 'employee', ownerId });
const member = (ownerId, extra = {}) => ({ ownerId, ownerName: `Công ty ${ownerId}`, acceptedAt: '2026-01-01T00:00:00Z', ...extra });
const bell = (workspaceOwnerId, extra = {}) => ({ id: 1, link: '/app/forms/41/submissions', metadata: { workspaceOwnerId, ...extra } });

let switchContext;
let warnSpy;

const run = (item, { user = { id: 7, memberships: [] }, activeContext = SELF } = {}) =>
  ensureNotificationWorkspace(item, { user, activeContext, switchContext });

beforeEach(() => {
  switchContext = vi.fn().mockResolvedValue(undefined);
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warnSpy.mockRestore();
});

describe('ensureNotificationWorkspace — không có đích thì không làm gì', () => {
  it('chuông không có metadata / không có workspaceOwnerId (chuông cũ, loại khác) → không gọi switchContext', async () => {
    const user = { id: 7, memberships: [member(10)] };
    await run({ id: 1, link: '/app/campaigns' }, { user });
    await run({ id: 2, link: '/app/campaigns', metadata: {} }, { user });
    await run({ id: 3, link: '/app/campaigns', metadata: null }, { user });
    await run({ id: 4, metadata: { runId: '9' } }, { user });
    await run(null, { user });
    await run(undefined, { user });
    expect(switchContext).not.toHaveBeenCalled();
  });

  it.each([
    ['chuỗi rỗng', ''],
    ['"0"', '0'],
    ['số 0', 0],
    ['số âm', -10],
    ['"-10"', '-10'],
    ['chuỗi rác', '10abc'],
    ['số thập phân', 10.5],
    ['"10.5"', '10.5'],
    ['"1e3"', '1e3'],
    ['"010" (không chuẩn)', '010'],
    ['null', null],
    ['true', true],
    ['mảng', [10]],
    ['đối tượng', { id: 10 }],
    ['vô cực', Infinity],
    ['NaN', NaN],
  ])('workspaceOwnerId không phải số nguyên dương (%s) → không làm gì', async (_label, raw) => {
    const user = { id: 7, memberships: [member(10)] };
    await run(bell(raw), { user });
    expect(switchContext).not.toHaveBeenCalled();
  });
});

describe('ensureNotificationWorkspace — chuông về không gian của CHÍNH MÌNH', () => {
  it('đang ở self → không gọi switchContext', async () => {
    await run(bell('7'), { user: { id: 7, memberships: [member(10)] }, activeContext: SELF });
    expect(switchContext).not.toHaveBeenCalled();
  });

  it('đang ở không gian công ty của người khác → switchContext(null) để về cá nhân', async () => {
    await run(bell('7'), { user: { id: 7, memberships: [member(10)] }, activeContext: employeeOf(10) });
    expect(switchContext).toHaveBeenCalledTimes(1);
    expect(switchContext).toHaveBeenCalledWith(null);
  });

  it('id người dùng là số, đích là chuỗi (và ngược lại) vẫn khớp', async () => {
    await run(bell(7), { user: { id: '7', memberships: [] }, activeContext: employeeOf(10) });
    expect(switchContext).toHaveBeenCalledWith(null);
  });
});

describe('ensureNotificationWorkspace — chuông của CHỦ khác', () => {
  it('có membership hợp lệ, đang ở self → switchContext(chủ)', async () => {
    await run(bell('10'), { user: { id: 7, memberships: [member(10), member(11)] }, activeContext: SELF });
    expect(switchContext).toHaveBeenCalledTimes(1);
    expect(switchContext).toHaveBeenCalledWith('10');
  });

  it('đang ở không gian của chủ KHÁC → vẫn đổi sang đúng chủ của chuông', async () => {
    await run(bell('10'), { user: { id: 7, memberships: [member(10), member(11)] }, activeContext: employeeOf(11) });
    expect(switchContext).toHaveBeenCalledWith('10');
  });

  it('đang ở đúng không gian của chủ đó → không gọi switchContext (ownerId số / chuỗi đều khớp)', async () => {
    const user = { id: 7, memberships: [member(10)] };
    await run(bell('10'), { user, activeContext: employeeOf(10) });
    await run(bell('10'), { user, activeContext: employeeOf('10') });
    await run(bell(10), { user, activeContext: employeeOf('10') });
    expect(switchContext).not.toHaveBeenCalled();
  });

  it('membership BỊ KHOÁ (isLocked) → không gọi (vào đó thì /auth/me trả 403 và bị đăng xuất)', async () => {
    await run(bell('10'), { user: { id: 7, memberships: [member(10, { isLocked: true })] } });
    expect(switchContext).not.toHaveBeenCalled();
  });

  it('membership CHƯA CHẤP NHẬN lời mời (acceptedAt === null) → không gọi', async () => {
    await run(bell('10'), { user: { id: 7, memberships: [member(10, { acceptedAt: null })] } });
    expect(switchContext).not.toHaveBeenCalled();
  });

  it('backend cũ không trả acceptedAt (undefined) → coi là ĐÃ chấp nhận, vẫn đổi (giống pickDefaultContext)', async () => {
    await run(bell('10'), { user: { id: 7, memberships: [{ ownerId: 10 }] } });
    expect(switchContext).toHaveBeenCalledWith('10');
  });

  it('không có membership của chủ đó (không phải thành viên / danh sách trống / thiếu memberships) → không gọi', async () => {
    await run(bell('99'), { user: { id: 7, memberships: [member(10)] } });
    await run(bell('99'), { user: { id: 7, memberships: [] } });
    await run(bell('99'), { user: { id: 7 } });
    await run(bell('99'), { user: null });
    expect(switchContext).not.toHaveBeenCalled();
  });

  it('chọn đúng membership theo chủ, không nhầm sang membership khoá của chủ khác', async () => {
    const user = { id: 7, memberships: [member(11, { isLocked: true }), member(10)] };
    await run(bell('10'), { user });
    expect(switchContext).toHaveBeenCalledTimes(1);
    expect(switchContext).toHaveBeenCalledWith('10');
  });
});

describe('ensureNotificationWorkspace — lỗi không cản điều hướng', () => {
  it('switchContext bất đồng bộ bị từ chối → helper KHÔNG ném, chỉ cảnh báo', async () => {
    switchContext.mockRejectedValue(new Error('mạng đứt'));
    await expect(run(bell('10'), { user: { id: 7, memberships: [member(10)] } })).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('switchContext ném lỗi đồng bộ → helper KHÔNG ném', async () => {
    switchContext.mockImplementation(() => { throw new Error('boom'); });
    await expect(run(bell('10'), { user: { id: 7, memberships: [member(10)] } })).resolves.toBeUndefined();
    await expect(run(bell('7'), { user: { id: 7, memberships: [] }, activeContext: employeeOf(10) })).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalledTimes(2);
  });

  it('không truyền switchContext → không ném, không làm gì', async () => {
    await expect(ensureNotificationWorkspace(bell('10'), { user: { id: 7, memberships: [member(10)] }, activeContext: SELF })).resolves.toBeUndefined();
    await expect(ensureNotificationWorkspace(bell('10'))).resolves.toBeUndefined();
  });
});

describe('ensureNotificationWorkspace — chờ switchContext xong mới trả về', () => {
  it('promise của helper chỉ giải quyết SAU khi switchContext xong', async () => {
    let finishSwitch;
    switchContext.mockImplementation(() => new Promise((resolve) => { finishSwitch = resolve; }));
    const order = [];
    const pending = run(bell('10'), { user: { id: 7, memberships: [member(10)] } }).then(() => order.push('helper-xong'));

    await Promise.resolve();
    await Promise.resolve();
    expect(order).toEqual([]); // switchContext chưa xong → helper chưa xong
    finishSwitch();
    await pending;
    expect(order).toEqual(['helper-xong']);
  });
});
