import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  extractSendMsgId,
  resolveConversationExternalId,
  runInboxHandlerAfterSave,
  shouldSkipInboxHandler,
} from '../zaloPersonalMessage.util.js';
import { ZaloPersonalAdapter } from '../../services/chatbot/channelAdapters/zaloPersonal.adapter.js';

describe('zaloPersonalMessage.util', () => {
  it('resolveConversationExternalId: isSelf 1-1 uses threadId (partner), not owner fromUid', () => {
    const ownerUid = '999001';
    const partnerUid = '888002';
    expect(resolveConversationExternalId({
      isGroup: false,
      groupId: null,
      threadId: partnerUid,
      fromUid: ownerUid,
    })).toBe(partnerUid);
  });

  it('resolveConversationExternalId: visitor 1-1 uses threadId/fromUid', () => {
    expect(resolveConversationExternalId({
      isGroup: false,
      threadId: 'visitor_1',
      fromUid: 'visitor_1',
    })).toBe('visitor_1');
  });

  it('resolveConversationExternalId: group stays group_<id>', () => {
    expect(resolveConversationExternalId({
      isGroup: true,
      groupId: '7445330951687908000',
      threadId: 'g_ignored',
      fromUid: '0',
    })).toBe('group_7445330951687908000');

    expect(resolveConversationExternalId({
      isGroup: true,
      groupId: 'group_7445330951687908000',
      threadId: null,
      fromUid: 'owner',
    })).toBe('group_7445330951687908000');
  });

  it('extractSendMsgId reads message.msgId and attachment[0].msgId', () => {
    expect(extractSendMsgId({ message: { msgId: 12345 }, attachment: [] })).toBe('12345');
    expect(extractSendMsgId({ message: null, attachment: [{ msgId: 9 }] })).toBe('9');
    expect(extractSendMsgId({ message: null, attachment: [] })).toBeNull();
    expect(extractSendMsgId(null)).toBeNull();
  });
});

describe('ZaloPersonalAdapter.consumeBotOutbound', () => {
  beforeEach(() => {
    ZaloPersonalAdapter.recentBotOutbound.clear();
  });

  it('matches msgId across number (send) and string (echo)', () => {
    ZaloPersonalAdapter.markBotOutbound(7, { msgId: 12345, content: 'xin chào' });
    expect(ZaloPersonalAdapter.consumeBotOutbound(7, { msgId: '12345', content: 'other' })).toBe(true);
    expect(ZaloPersonalAdapter.consumeBotOutbound(7, { msgId: '12345' })).toBe(false);
  });

  it('same content different msgId — only bot echo filtered', () => {
    ZaloPersonalAdapter.markBotOutbound(7, { msgId: 'bot1', content: 'Xin chào!' });
    expect(ZaloPersonalAdapter.consumeBotOutbound(7, { msgId: 'bot1', content: 'Xin chào!' })).toBe(true);
    // Owner typed the same text with a different msgId — must not be swallowed
    expect(ZaloPersonalAdapter.consumeBotOutbound(7, { msgId: 'owner2', content: 'Xin chào!' })).toBe(false);
  });

  it('two different recipients same greeting: only matching msgId consumed', () => {
    ZaloPersonalAdapter.markBotOutbound(7, { msgId: 'm1', content: 'Chào bạn' });
    ZaloPersonalAdapter.markBotOutbound(7, { msgId: 'm2', content: 'Chào bạn' });
    expect(ZaloPersonalAdapter.consumeBotOutbound(7, { msgId: 'm1', content: 'Chào bạn' })).toBe(true);
    expect(ZaloPersonalAdapter.consumeBotOutbound(7, { msgId: 'm2', content: 'Chào bạn' })).toBe(true);
    expect(ZaloPersonalAdapter.consumeBotOutbound(7, { msgId: 'owner', content: 'Chào bạn' })).toBe(false);
  });

  it('falls back to text when msgId missing', () => {
    ZaloPersonalAdapter.markBotOutbound(7, { msgId: null, content: 'fallback text' });
    expect(ZaloPersonalAdapter.consumeBotOutbound(7, { msgId: null, content: 'fallback text' })).toBe(true);
  });

  it('sendMessage shape with only attachment msgId still marks', () => {
    const msgId = extractSendMsgId({ message: null, attachment: [{ msgId: 9 }] });
    ZaloPersonalAdapter.markBotOutbound(3, { msgId, content: 'ảnh' });
    expect(ZaloPersonalAdapter.consumeBotOutbound(3, { msgId: '9', content: 'ảnh' })).toBe(true);
  });
});

describe('inbox handler gate (D3+D4)', () => {
  it('echo filtered (skippedEcho) → stored.handler is NOT called', () => {
    const handler = jest.fn();
    const ran = runInboxHandlerAfterSave({ skippedEcho: true }, handler, { msgId: 'echo1' });
    expect(ran).toBe(false);
    expect(handler).not.toHaveBeenCalled();
  });

  it('ON CONFLICT skip (isDuplicate) → stored.handler is NOT called', () => {
    const handler = jest.fn();
    const ran = runInboxHandlerAfterSave({ isDuplicate: true, conversationId: 1 }, handler, {});
    expect(ran).toBe(false);
    expect(handler).not.toHaveBeenCalled();
  });

  it('successful save → handler runs (owner/visitor path)', () => {
    const handler = jest.fn();
    const ran = runInboxHandlerAfterSave({ conversationId: 9, messageId: 3 }, handler, { msgId: 'ok' });
    expect(ran).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('shouldSkipInboxHandler requires BOTH isDuplicate and skippedEcho branches', () => {
    expect(shouldSkipInboxHandler({ skippedEcho: true })).toBe(true);
    expect(shouldSkipInboxHandler({ isDuplicate: true })).toBe(true);
    expect(shouldSkipInboxHandler({ conversationId: 1 })).toBe(false);
    expect(shouldSkipInboxHandler(null)).toBe(false);
    expect(shouldSkipInboxHandler(undefined)).toBe(false);
  });
});
