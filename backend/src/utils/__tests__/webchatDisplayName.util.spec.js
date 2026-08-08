import { describe, expect, it } from '@jest/globals';
import { formatWebchatDisplayName } from '../webchatDisplayName.util.js';

describe('formatWebchatDisplayName', () => {
  it('prefers visitor name when present', () => {
    expect(formatWebchatDisplayName({
      visitorName: 'Nguyen Van A',
      channelDisplayName: 'Hỗ trợ khách hàng',
      conversationId: 12,
    })).toBe('Nguyen Van A');
  });

  it('falls back to first message snippet', () => {
    expect(formatWebchatDisplayName({
      visitorName: null,
      channelDisplayName: 'Hỗ trợ khách hàng',
      conversationId: 12,
      firstMessageSnippet: 'Cho mình hỏi giá khóa học',
    })).toBe('Cho mình hỏi giá khóa học');
  });

  it('falls back to Khách #id', () => {
    expect(formatWebchatDisplayName({
      visitorName: '',
      channelDisplayName: 'Hỗ trợ khách hàng',
      conversationId: 99,
    })).toBe('Khách #99');
  });
});
