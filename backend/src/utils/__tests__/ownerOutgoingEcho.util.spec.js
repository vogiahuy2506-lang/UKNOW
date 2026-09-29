import { describe, expect, it } from '@jest/globals';
import { isOwnerOutgoingEcho } from '../ownerOutgoingEcho.util.js';

const NOW = Date.parse('2026-09-29T10:00:00Z');
const ago = (ms) => new Date(NOW - ms).toISOString();

describe('isOwnerOutgoingEcho', () => {
  it('không có ứng viên → không phải echo', () => {
    expect(isOwnerOutgoingEcho({ incomingId: 'A', incomingContent: 'x', candidates: [], now: NOW })).toBe(false);
  });

  it('khớp id (kể cả number vs string) → echo, bất kể nội dung', () => {
    const candidates = [{ externalId: '123', content: 'khác', createdAt: ago(1000) }];
    expect(isOwnerOutgoingEcho({ incomingId: 123, incomingContent: 'gõ tay', candidates, now: NOW })).toBe(true);
  });

  it('nội dung trùng (bỏ khoảng trắng đầu/cuối) trong 5 phút → echo', () => {
    const candidates = [{ externalId: null, content: ' Dạ còn hàng ạ ', createdAt: ago(60_000) }];
    expect(isOwnerOutgoingEcho({ incomingId: 'Z', incomingContent: 'Dạ còn hàng ạ', candidates, now: NOW })).toBe(true);
  });

  it('nội dung trùng nhưng quá 5 phút → không phải echo', () => {
    const candidates = [{ externalId: null, content: 'Dạ còn hàng ạ', createdAt: ago(6 * 60_000) }];
    expect(isOwnerOutgoingEcho({ incomingId: 'Z', incomingContent: 'Dạ còn hàng ạ', candidates, now: NOW })).toBe(false);
  });

  it('id khác + nội dung khác → không phải echo', () => {
    const candidates = [{ externalId: '1', content: 'a', createdAt: ago(1000) }];
    expect(isOwnerOutgoingEcho({ incomingId: '2', incomingContent: 'b', candidates, now: NOW })).toBe(false);
  });

  it('nội dung rỗng cả hai phía không được coi là trùng', () => {
    const candidates = [{ externalId: null, content: '', createdAt: ago(1000) }];
    expect(isOwnerOutgoingEcho({ incomingId: null, incomingContent: '', candidates, now: NOW })).toBe(false);
  });
});
