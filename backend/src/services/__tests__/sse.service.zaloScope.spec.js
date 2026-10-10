/**
 * PLAN_GIAO_TAI_KHOAN_ZALO_CHO_NHAN_VIEN PR-G2 — SSE Hộp thư lọc theo tài khoản Zalo được giao.
 *
 * Mỗi kết nối lưu `{ actorUserId, accessibleZaloAccountIds }` tính lúc nối (null = chủ / super admin, mảng = nhân viên).
 * Chỉ sự kiện Zalo cá nhân bị lọc, theo `data.zaloAccountId`; Telegram / WhatsApp / web giữ nguyên. Hỏng thì chặn.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const sseModule = await import('../sse.service.js');
const sseService = sseModule.default;
const { clientMayReceive, isZaloPersonalSseEvent } = sseModule;

function makeRes() {
  const writes = [];
  return {
    writes,
    write: jest.fn((chunk) => {
      writes.push(chunk);
      return true;
    }),
    end: jest.fn(),
  };
}

const OWNER = 100;
const zaloEvent = (zaloAccountId, extra = {}) => ({
  conversationId: 1,
  channel: 'zalo_personal',
  type: 'zalo_personal',
  message: 'xin chào',
  ...(zaloAccountId === undefined ? {} : { zaloAccountId }),
  ...extra,
});

describe('isZaloPersonalSseEvent', () => {
  it('nhận diện theo channel / type / conversationType; sự kiện AI trả lời Zalo chỉ có channel vẫn tính', () => {
    expect(isZaloPersonalSseEvent({ channel: 'zalo_personal' })).toBe(true);
    expect(isZaloPersonalSseEvent({ type: 'zalo_personal' })).toBe(true);
    expect(isZaloPersonalSseEvent({ conversationType: 'zalo_personal' })).toBe(true);
    expect(isZaloPersonalSseEvent({ channel: 'telegram', type: 'channel', conversationType: 'channel' })).toBe(false);
    expect(isZaloPersonalSseEvent({ channel: 'web', type: 'webchat' })).toBe(false);
    expect(isZaloPersonalSseEvent(null)).toBe(false);
  });
});

describe('sseService — lọc sự kiện Zalo cá nhân theo tài khoản được giao', () => {
  beforeEach(() => {
    sseService._resetForTests();
  });

  it('CHỦ (accessibleZaloAccountIds = null) nhận mọi sự kiện Zalo, kể cả của tài khoản bất kỳ', () => {
    const owner = makeRes();
    sseService.addClient(OWNER, owner, { actorUserId: OWNER, accessibleZaloAccountIds: null });

    sseService.broadcast(OWNER, 'inbox:new_message', zaloEvent(5));
    sseService.broadcast(OWNER, 'inbox:new_message', zaloEvent(6));

    expect(owner.write).toHaveBeenCalledTimes(2);
  });

  it('NHÂN VIÊN chỉ nhận sự kiện của tài khoản được giao; tài khoản khác của chủ KHÔNG được phát cho họ', () => {
    const owner = makeRes();
    const employee = makeRes();
    sseService.addClient(OWNER, owner, { actorUserId: OWNER, accessibleZaloAccountIds: null });
    sseService.addClient(OWNER, employee, { actorUserId: 200, accessibleZaloAccountIds: [5] });

    sseService.broadcast(OWNER, 'inbox:new_message', zaloEvent(5, { message: 'của tài khoản được giao' }));
    sseService.broadcast(OWNER, 'inbox:new_message', zaloEvent(6, { message: 'của tài khoản gia đình' }));

    expect(employee.writes).toHaveLength(1);
    expect(employee.writes[0]).toContain('của tài khoản được giao');
    expect(employee.writes.join('')).not.toContain('gia đình');
    // Chủ vẫn nhận cả hai.
    expect(owner.writes).toHaveLength(2);
  });

  it('id tài khoản trong payload là chuỗi (pg trả bigint dạng chuỗi) vẫn khớp mảng số', () => {
    const employee = makeRes();
    sseService.addClient(OWNER, employee, { actorUserId: 200, accessibleZaloAccountIds: [5] });

    sseService.broadcast(OWNER, 'inbox:new_message', zaloEvent('5'));

    expect(employee.write).toHaveBeenCalledTimes(1);
  });

  it('HỎNG THÌ CHẶN: nhân viên chưa được giao gì ([]), payload Zalo thiếu id tài khoản, kết nối không có scope → không nhận', () => {
    const noAccounts = makeRes();
    const assigned = makeRes();
    const noScope = makeRes();
    const badScope = makeRes();
    sseService.addClient(OWNER, noAccounts, { actorUserId: 201, accessibleZaloAccountIds: [] });
    sseService.addClient(OWNER, assigned, { actorUserId: 202, accessibleZaloAccountIds: [5] });
    sseService.addClient(OWNER, noScope, undefined);
    sseService.addClient(OWNER, badScope, { actorUserId: 203, accessibleZaloAccountIds: undefined });

    sseService.broadcast(OWNER, 'inbox:new_message', zaloEvent(5));
    sseService.broadcast(OWNER, 'inbox:new_message', zaloEvent(undefined));

    expect(noAccounts.write).not.toHaveBeenCalled();
    expect(noScope.write).not.toHaveBeenCalled();
    expect(badScope.write).not.toHaveBeenCalled();
    // Có scope nhưng payload không có id tài khoản → cũng không phát (chỉ lần có id=5 vào được).
    expect(assigned.write).toHaveBeenCalledTimes(1);
  });

  it('Zalo OA / web / Facebook giữ nguyên: mọi kết nối (kể cả nhân viên chưa được giao gì, kể cả không scope) vẫn nhận', () => {
    const employee = makeRes();
    const noScope = makeRes();
    sseService.addClient(OWNER, employee, { actorUserId: 200, accessibleZaloAccountIds: [] });
    sseService.addClient(OWNER, noScope);

    sseService.broadcast(OWNER, 'inbox:new_message', { conversationId: 9, type: 'channel', conversationType: 'channel', channel: 'zalo_oa', message: 'hi' });
    sseService.broadcast(OWNER, 'inbox:new_message', { conversationId: 10, type: 'channel', channel: 'facebook', message: 'hi' });
    sseService.broadcast(OWNER, 'inbox:new_message', { conversationId: 11, type: 'webchat', channel: 'web', message: 'hi' });
    sseService.broadcast(OWNER, 'inbox:unread_change', { conversationId: 11, conversationType: 'webchat', change: 1 });

    expect(employee.write).toHaveBeenCalledTimes(4);
    expect(noScope.write).toHaveBeenCalledTimes(4);
  });

  it('sự kiện AI trả lời Zalo chỉ có `channel` (không có `type`) vẫn bị lọc theo tài khoản', () => {
    const employee = makeRes();
    sseService.addClient(OWNER, employee, { actorUserId: 200, accessibleZaloAccountIds: [5] });

    sseService.broadcast(OWNER, 'inbox:new_message', { conversationId: 1, channel: 'zalo_personal', zaloAccountId: 6, role: 'agent', message: 'AI' });
    sseService.broadcast(OWNER, 'inbox:new_message', { conversationId: 1, channel: 'zalo_personal', zaloAccountId: 5, role: 'agent', message: 'AI' });

    expect(employee.write).toHaveBeenCalledTimes(1);
  });

  it('clientMayReceive: hàm thuần — null cho qua, mảng lọc, mọi giá trị khác chặn', () => {
    const resWith = (ids) => ({ __sseScope: { accessibleZaloAccountIds: ids } });
    expect(clientMayReceive(resWith(null), zaloEvent(1))).toBe(true);
    expect(clientMayReceive(resWith([1]), zaloEvent(1))).toBe(true);
    expect(clientMayReceive(resWith([2]), zaloEvent(1))).toBe(false);
    expect(clientMayReceive(resWith('1'), zaloEvent(1))).toBe(false);
    expect(clientMayReceive({}, zaloEvent(1))).toBe(false);
    expect(clientMayReceive(resWith([1]), zaloEvent('abc'))).toBe(false);
  });

  it('disconnectActor đóng ĐÚNG kết nối của nhân viên đó (không đụng chủ, không đụng nhân viên khác) và gỡ khỏi bảng', () => {
    const owner = makeRes();
    const emp200a = makeRes();
    const emp200b = makeRes();
    const emp201 = makeRes();
    sseService.addClient(OWNER, owner, { actorUserId: OWNER, accessibleZaloAccountIds: null });
    sseService.addClient(OWNER, emp200a, { actorUserId: 200, accessibleZaloAccountIds: [5] });
    sseService.addClient(OWNER, emp200b, { actorUserId: 200, accessibleZaloAccountIds: [5] });
    sseService.addClient(OWNER, emp201, { actorUserId: 201, accessibleZaloAccountIds: [6] });

    const closed = sseService.disconnectActor(OWNER, 200);

    expect(closed).toBe(2);
    expect(emp200a.end).toHaveBeenCalled();
    expect(emp200b.end).toHaveBeenCalled();
    expect(owner.end).not.toHaveBeenCalled();
    expect(emp201.end).not.toHaveBeenCalled();
    expect(sseService.getClientCountForUser(OWNER)).toBe(2);

    // Kết nối đã đóng không còn nhận gì nữa.
    sseService.broadcast(OWNER, 'inbox:new_message', zaloEvent(5));
    expect(emp200a.write).not.toHaveBeenCalled();
    expect(owner.write).toHaveBeenCalledTimes(1);
  });

  it('disconnectActor: không có kết nối nào của chủ đó → 0, không ném lỗi', () => {
    expect(sseService.disconnectActor(999, 1)).toBe(0);
  });
});

describe('sseService — lọc sự kiện Telegram / WhatsApp theo tài khoản được giao (PLAN_GIAO_TK_TG_WA H3)', () => {
  const tgEvent = (ref) => ({ conversationId: 9, type: 'channel', conversationType: 'channel', channel: 'telegram', channelAccountRef: ref, message: 'hi' });
  const waEvent = (ref) => ({ conversationId: 10, type: 'channel', conversationType: 'channel', channel: 'whatsapp_baileys', channelAccountRef: ref, message: 'hi' });
  const scopeOf = (telegram, whatsapp) => ({ actorUserId: 200, accessibleZaloAccountIds: null, accessibleChannelRefs: { telegram, whatsapp_baileys: whatsapp } });

  it('nhân viên chỉ nhận sự kiện của tài khoản được giao; chủ (null từng kênh) nhận hết', () => {
    const employee = makeRes();
    const owner = makeRes();
    sseService.addClient(OWNER, employee, scopeOf(['7'], ['100-mot']));
    sseService.addClient(OWNER, owner, scopeOf(null, null));

    sseService.broadcast(OWNER, 'inbox:new_message', tgEvent('7'));
    sseService.broadcast(OWNER, 'inbox:new_message', tgEvent('8'));
    sseService.broadcast(OWNER, 'inbox:new_message', waEvent('100-mot'));
    sseService.broadcast(OWNER, 'inbox:new_message', waEvent('100-hai'));

    expect(employee.write).toHaveBeenCalledTimes(2);
    expect(employee.writes.join('')).toContain('"channelAccountRef":"7"');
    expect(employee.writes.join('')).toContain('"channelAccountRef":"100-mot"');
    expect(owner.write).toHaveBeenCalledTimes(4);
  });

  it('id tài khoản Telegram dạng số trong payload vẫn khớp mảng chuỗi', () => {
    const employee = makeRes();
    sseService.addClient(OWNER, employee, scopeOf(['7'], []));
    sseService.broadcast(OWNER, 'inbox:new_message', tgEvent(7));
    expect(employee.write).toHaveBeenCalledTimes(1);
  });

  it('HỎNG THÌ CHẶN: nhân viên chưa giao gì ([]), payload thiếu ref, scope thiếu khoá kênh, kết nối không có scope → không nhận', () => {
    const noAccounts = makeRes();
    const assigned = makeRes();
    const noScope = makeRes();
    const zaloOnlyScope = makeRes();
    const badScope = makeRes();
    sseService.addClient(OWNER, noAccounts, scopeOf([], []));
    sseService.addClient(OWNER, assigned, scopeOf(['7'], []));
    sseService.addClient(OWNER, noScope, undefined);
    sseService.addClient(OWNER, zaloOnlyScope, { actorUserId: 203, accessibleZaloAccountIds: null }); // bản scope cũ, chưa có kênh
    sseService.addClient(OWNER, badScope, { actorUserId: 204, accessibleZaloAccountIds: null, accessibleChannelRefs: { telegram: 'all' } });

    sseService.broadcast(OWNER, 'inbox:new_message', tgEvent('7'));
    sseService.broadcast(OWNER, 'inbox:new_message', tgEvent(undefined));
    sseService.broadcast(OWNER, 'inbox:new_message', tgEvent(null));
    sseService.broadcast(OWNER, 'inbox:new_message', { conversationId: 1, channel: 'telegram', message: 'x' }); // không có khoá ref

    expect(noAccounts.write).not.toHaveBeenCalled();
    expect(noScope.write).not.toHaveBeenCalled();
    expect(zaloOnlyScope.write).not.toHaveBeenCalled();
    expect(badScope.write).not.toHaveBeenCalled();
    expect(assigned.write).toHaveBeenCalledTimes(1); // chỉ lần có ref=7
  });

  it('phạm vi Zalo và phạm vi kênh độc lập: nhân viên không giao Zalo nào vẫn nhận Telegram được giao', () => {
    const employee = makeRes();
    sseService.addClient(OWNER, employee, { actorUserId: 200, accessibleZaloAccountIds: [], accessibleChannelRefs: { telegram: ['7'], whatsapp_baileys: [] } });
    sseService.broadcast(OWNER, 'inbox:new_message', tgEvent('7'));
    sseService.broadcast(OWNER, 'inbox:new_message', { conversationId: 1, type: 'zalo_personal', channel: 'zalo_personal', zaloAccountId: 5, message: 'z' });
    expect(employee.write).toHaveBeenCalledTimes(1);
  });

  it('disconnectActor đóng kết nối của đúng nhân viên để nối lại với phạm vi mới (giao Telegram / WhatsApp đổi)', () => {
    sseService._resetForTests();
    const emp = makeRes();
    const other = makeRes();
    sseService.addClient(OWNER, emp, scopeOf(['7'], []));
    sseService.addClient(OWNER, other, { ...scopeOf(['7'], []), actorUserId: 999 });
    expect(sseService.disconnectActor(OWNER, 200)).toBe(1);
    expect(emp.end).toHaveBeenCalled();
    expect(other.end).not.toHaveBeenCalled();
  });
});
