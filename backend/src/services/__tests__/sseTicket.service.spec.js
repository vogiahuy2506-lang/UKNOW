/**
 * H-04 — vé SSE: dùng một lần, hết hạn sau 60 giây, ghi nhận chủ không gian làm việc phía server.
 */
import { beforeEach, describe, expect, it } from '@jest/globals';
import {
  SSE_TICKET_MAX_ACTIVE,
  SSE_TICKET_TTL_MS,
  _activeSseTicketCountForTests,
  _resetSseTicketsForTests,
  consumeSseTicket,
  issueSseTicket,
  peekSseTicket,
} from '../sseTicket.service.js';

const T0 = 1_700_000_000_000;

beforeEach(() => {
  _resetSseTicketsForTests();
});

describe('sseTicket.service', () => {
  it('cấp vé ngẫu nhiên đủ dài, mỗi lần một vé khác nhau, hạn 60 giây', () => {
    const a = issueSseTicket({ userId: 7, now: T0 });
    const b = issueSseTicket({ userId: 7, now: T0 });

    expect(a.ticket).not.toBe(b.ticket);
    expect(a.ticket.length).toBeGreaterThanOrEqual(40);
    expect(a.expiresInMs).toBe(SSE_TICKET_TTL_MS);
    expect(SSE_TICKET_TTL_MS).toBe(60_000);
  });

  it('dùng MỘT lần: lần đổi thứ hai trả null', () => {
    const { ticket } = issueSseTicket({ userId: 7, ownerContextId: 42, now: T0 });

    expect(consumeSseTicket(ticket, T0 + 1000)).toEqual({ userId: 7, ownerContextId: 42 });
    expect(consumeSseTicket(ticket, T0 + 2000)).toBeNull();
  });

  it('hết hạn sau 60 giây thì không đổi được, và bị xoá luôn', () => {
    const { ticket } = issueSseTicket({ userId: 7, now: T0 });

    expect(consumeSseTicket(ticket, T0 + SSE_TICKET_TTL_MS)).toBeNull();
    expect(_activeSseTicketCountForTests()).toBe(0);
  });

  it('còn hạn ở giây thứ 59 thì đổi được', () => {
    const { ticket } = issueSseTicket({ userId: 7, now: T0 });

    expect(consumeSseTicket(ticket, T0 + SSE_TICKET_TTL_MS - 1)).toEqual({ userId: 7, ownerContextId: null });
  });

  it('vé không tồn tại / rỗng / không phải chuỗi → null', () => {
    expect(consumeSseTicket('khong-co', T0)).toBeNull();
    expect(consumeSseTicket('', T0)).toBeNull();
    expect(consumeSseTicket(undefined, T0)).toBeNull();
    expect(consumeSseTicket({ ticket: 'x' }, T0)).toBeNull();
  });

  it('peek chỉ xem, không tiêu thụ vé', () => {
    const { ticket } = issueSseTicket({ userId: 9, now: T0 });

    expect(peekSseTicket(ticket, T0 + 1)).toEqual({ userId: 9, ownerContextId: null });
    expect(peekSseTicket(ticket, T0 + 2)).toEqual({ userId: 9, ownerContextId: null });
    expect(consumeSseTicket(ticket, T0 + 3)).toEqual({ userId: 9, ownerContextId: null });
  });

  it('thiếu userId → ném lỗi, không cấp vé', () => {
    expect(() => issueSseTicket({ userId: null })).toThrow();
    expect(_activeSseTicketCountForTests()).toBe(0);
  });

  it('quét vé hết hạn mỗi lần cấp mới và chặn trần số vé đang sống', () => {
    issueSseTicket({ userId: 1, now: T0 });
    issueSseTicket({ userId: 2, now: T0 });
    issueSseTicket({ userId: 3, now: T0 + SSE_TICKET_TTL_MS + 1 });
    expect(_activeSseTicketCountForTests()).toBe(1);

    _resetSseTicketsForTests();
    for (let i = 0; i < SSE_TICKET_MAX_ACTIVE + 10; i += 1) {
      issueSseTicket({ userId: i + 1, now: T0 });
    }
    expect(_activeSseTicketCountForTests()).toBeLessThanOrEqual(SSE_TICKET_MAX_ACTIVE);
  });
});
