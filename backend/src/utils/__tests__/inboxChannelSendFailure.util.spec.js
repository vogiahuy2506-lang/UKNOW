import { describe, expect, it } from '@jest/globals';
import { classifyInboxChannelSendFailure } from '../inboxChannelSendFailure.util.js';

describe('classifyInboxChannelSendFailure (P11)', () => {
  it('lỗi thường → release PROVIDER_ERROR (provider chưa gửi gì)', () => {
    expect(classifyInboxChannelSendFailure({ success: false, error: 'Telegram account 7 is inactive' }, 'Telegram account 7 is inactive'))
      .toEqual({ uncertain: false, failureCode: 'PROVIDER_ERROR', reason: 'Telegram account 7 is inactive' });
  });

  it('partial:true → uncertain PARTIAL_DELIVERY (khách đã nhận một phần)', () => {
    expect(classifyInboxChannelSendFailure({ success: false, partial: true, error: 'tệp lỗi' }, 'tệp lỗi'))
      .toMatchObject({ uncertain: true, failureCode: 'PARTIAL_DELIVERY' });
  });

  it('success:false kèm messageId (adapter Hộp thư Telegram bỏ cờ partial) → uncertain PARTIAL_DELIVERY', () => {
    expect(classifyInboxChannelSendFailure({ success: false, error: 'tệp lỗi', messageId: 4242 }, 'tệp lỗi'))
      .toMatchObject({ uncertain: true, failureCode: 'PARTIAL_DELIVERY' });
    expect(classifyInboxChannelSendFailure({ success: false, error: 'x', messageId: 'WA1' }, 'x'))
      .toMatchObject({ uncertain: true, failureCode: 'PARTIAL_DELIVERY' });
  });

  it('messageId null/rỗng khi lỗi → KHÔNG coi là một phần', () => {
    expect(classifyInboxChannelSendFailure({ success: false, error: 'x', messageId: null }, 'x').uncertain).toBe(false);
    expect(classifyInboxChannelSendFailure({ success: false, error: 'x', messageId: '' }, 'x').uncertain).toBe(false);
  });

  it.each(['connect ETIMEDOUT 1.2.3.4:443', 'read ECONNRESET', 'socket hang up', 'Request Timeout after 30s'])(
    'thông điệp "%s" → uncertain TIMEOUT', (message) => {
      expect(classifyInboxChannelSendFailure({ success: false, error: message }, message))
        .toMatchObject({ uncertain: true, failureCode: 'TIMEOUT' });
    }
  );

  it('adapter ném lỗi (result null, err là Error) → đọc thông điệp từ err', () => {
    expect(classifyInboxChannelSendFailure(null, new Error('read ETIMEDOUT')))
      .toMatchObject({ uncertain: true, failureCode: 'TIMEOUT' });
    expect(classifyInboxChannelSendFailure(null, new Error('boom')))
      .toMatchObject({ uncertain: false, failureCode: 'PROVIDER_ERROR', reason: 'boom' });
  });

  it('không có thông tin gì → release với lý do mặc định', () => {
    expect(classifyInboxChannelSendFailure(undefined, undefined))
      .toEqual({ uncertain: false, failureCode: 'PROVIDER_ERROR', reason: 'Send failed' });
  });
});
