import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  extractSendMsgId,
  isInboxSendEcho,
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

  it('extractSendMsgId treats 0 as invalid and falls back to attachment', () => {
    expect(extractSendMsgId({
      message: { msgId: 0 },
      attachment: [{ msgId: '8128678217945' }],
    })).toBe('8128678217945');
    expect(extractSendMsgId({
      message: { msgId: '0' },
      attachment: [{ msgId: 0 }],
    })).toBeNull();
  });
});

describe('isInboxSendEcho (handoff re-pause guard)', () => {
  const now = Date.parse('2026-08-11T02:00:00.000Z');

  it('skips when incoming msgId is in metadata.zalo_msg_ids', () => {
    expect(isInboxSendEcho({
      incomingMsgId: 'img-2',
      incomingContent: '',
      now,
      candidates: [{
        source: 'manual_inbox',
        externalId: 'txt-1',
        zaloMsgIds: ['txt-1', 'img-2'],
        content: 'hello',
        createdAt: new Date(now - 5_000).toISOString(),
      }],
    })).toBe(true);
  });

  it('skips when manual_inbox external_id equals incoming msgId within window', () => {
    expect(isInboxSendEcho({
      incomingMsgId: 'm1',
      incomingContent: 'hello',
      now,
      candidates: [{
        source: 'manual_inbox',
        externalId: 'm1',
        zaloMsgIds: [],
        content: 'hello',
        createdAt: new Date(now - 10_000).toISOString(),
      }],
    })).toBe(true);
  });

  it('skips null external_id only with matching content inside 30s', () => {
    expect(isInboxSendEcho({
      incomingMsgId: 'echo-later',
      incomingContent: 'hello',
      now,
      candidates: [{
        source: 'manual_inbox',
        externalId: null,
        zaloMsgIds: [],
        content: 'hello',
        createdAt: new Date(now - 10_000).toISOString(),
      }],
    })).toBe(true);

    expect(isInboxSendEcho({
      incomingMsgId: 'echo-later',
      incomingContent: 'hello',
      now,
      candidates: [{
        source: 'manual_inbox',
        externalId: null,
        zaloMsgIds: [],
        content: 'hello',
        createdAt: new Date(now - 45_000).toISOString(),
      }],
    })).toBe(false);
  });

  it('does NOT skip real app reply with same text after inbox send (different msgId, A already bound)', () => {
    expect(isInboxSendEcho({
      incomingMsgId: 'owner-app-9',
      incomingContent: 'hello',
      now,
      candidates: [{
        source: 'manual_inbox',
        externalId: 'inbox-1',
        zaloMsgIds: ['inbox-1'],
        content: 'hello',
        createdAt: new Date(now - 5_000).toISOString(),
      }],
    })).toBe(false);
  });

  it('does NOT skip when content differs and external_id is null', () => {
    expect(isInboxSendEcho({
      incomingMsgId: 'app-2',
      incomingContent: 'other text',
      now,
      candidates: [{
        source: 'manual_inbox',
        externalId: null,
        zaloMsgIds: [],
        content: 'hello',
        createdAt: new Date(now - 5_000).toISOString(),
      }],
    })).toBe(false);
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

  it('does not treat msgId 0 as a markable outbound id', () => {
    const msgId = extractSendMsgId({ message: { msgId: 0 }, attachment: [] });
    expect(msgId).toBeNull();
    ZaloPersonalAdapter.markBotOutbound(3, { msgId, content: '' });
    expect(ZaloPersonalAdapter.consumeBotOutbound(3, { msgId: '0', content: '' })).toBe(false);
  });

  it('markDeliveredDispatchEcho marks only valid ids, never 0 or content', () => {
    ZaloPersonalAdapter.recentBotOutbound.clear();
    const marked = ZaloPersonalAdapter.markDeliveredDispatchEcho(8, {
      delivery: { status: 'delivered' },
      msgIds: ['8128678217945', '0', 0],
    });
    expect(marked).toEqual(['8128678217945']);
    expect(ZaloPersonalAdapter.consumeBotOutbound(8, { msgId: '8128678217945' })).toBe(true);
    expect(ZaloPersonalAdapter.consumeBotOutbound(8, { msgId: '0' })).toBe(false);

    ZaloPersonalAdapter.markDeliveredDispatchEcho(8, {
      delivery: { status: 'not_delivered' },
      msgIds: ['0'],
    });
    expect(ZaloPersonalAdapter.consumeBotOutbound(8, { msgId: '0', content: 'failed text' })).toBe(false);
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

  it('successful save → handler runs with msgData and saveResult (owner/visitor path)', () => {
    const handler = jest.fn();
    const saveResult = { conversationId: 9, messageId: 3 };
    const msgData = { msgId: 'ok' };
    const ran = runInboxHandlerAfterSave(saveResult, handler, msgData);
    expect(ran).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(msgData, saveResult);
  });

  it('shouldSkipInboxHandler requires BOTH isDuplicate and skippedEcho branches', () => {
    expect(shouldSkipInboxHandler({ skippedEcho: true })).toBe(true);
    expect(shouldSkipInboxHandler({ isDuplicate: true })).toBe(true);
    expect(shouldSkipInboxHandler({ conversationId: 1 })).toBe(false);
    expect(shouldSkipInboxHandler(null)).toBe(false);
    expect(shouldSkipInboxHandler(undefined)).toBe(false);
  });
});
