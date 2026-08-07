import { describe, expect, it } from '@jest/globals';
import {
  extractGroupHistoryMessages,
  normalizeGroupHistoryItem,
} from '../zaloPersonalSync.service.js';

describe('extractGroupHistoryMessages', () => {
  it('reads groupMsgs from zca-js response shape (not a bare array)', () => {
    const history = {
      lastActionId: '1',
      more: 0,
      groupMsgs: [
        {
          isSelf: false,
          data: {
            msgId: 'm1',
            content: 'oát',
            uidFrom: '111',
            dName: 'Gia Huy',
            ts: '1723000000000',
          },
        },
        {
          isSelf: true,
          data: {
            msgId: 'm2',
            content: { title: 'card' },
            uidFrom: '999',
            ts: 1723000001000,
          },
        },
      ],
    };

    const msgs = extractGroupHistoryMessages(history);
    expect(msgs).toHaveLength(2);
    expect(msgs[0]).toMatchObject({
      msgId: 'm1',
      content: 'oát',
      uidFrom: '111',
      displayName: 'Gia Huy',
      isSelf: false,
    });
    expect(msgs[1]).toMatchObject({
      msgId: 'm2',
      content: 'card',
      isSelf: true,
    });
  });

  it('returns empty when response object is mistaken for message list', () => {
    // Bug cũ: truyền nguyên object vào for..of / .length → 0 tin hoặc throw
    expect(extractGroupHistoryMessages({ lastActionId: 'x', groupMsgs: null })).toEqual([]);
    expect(normalizeGroupHistoryItem(null)).toBeNull();
  });

  it('treats missing groupMsgs as empty list (zca-js sometimes omits it)', () => {
    expect(extractGroupHistoryMessages({ lastActionId: '1', more: 0 })).toEqual([]);
  });
});
