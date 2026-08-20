import { beforeEach, afterEach, describe, expect, it, jest } from '@jest/globals';
import inboundReplyDebounceService, { InboundReplyDebounceService } from '../inboundReplyDebounce.service.js';
import { formatBatchedContent, getDebounceConfig } from '../../../utils/chatbotReplyBatch.util.js';

describe('chatbotReplyBatch.util', () => {
  it('formats single message as raw text without wrapper', () => {
    expect(formatBatchedContent([])).toBe('');
    expect(formatBatchedContent([{ content: '  ' }])).toBe('');
    expect(formatBatchedContent([{ content: 'Áo này còn size M không' }])).toBe('Áo này còn size M không');
  });

  it('formats multiple messages as numbered list with wrapper', () => {
    const formatted = formatBatchedContent([
      { content: 'Shop ơi' },
      { content: 'Áo này còn size M không' },
      { content: 'Màu đen nhé' },
    ]);
    expect(formatted).toBe(
      'Khách vừa gửi liên tiếp các tin sau:\n1. Shop ơi\n2. Áo này còn size M không\n3. Màu đen nhé\n\nHãy trả lời một lần, bao quát toàn bộ ý mới nhất của khách.'
    );
  });

  it('resolves config with defaults and clamps bounds', () => {
    const originalDebounce = process.env.CHATBOT_INBOUND_DEBOUNCE_MS;
    const originalMaxWait = process.env.CHATBOT_INBOUND_MAX_WAIT_MS;

    try {
      delete process.env.CHATBOT_INBOUND_DEBOUNCE_MS;
      delete process.env.CHATBOT_INBOUND_MAX_WAIT_MS;
      expect(getDebounceConfig()).toEqual({ debounceMs: 6000, maxWaitMs: 10000 });

      process.env.CHATBOT_INBOUND_DEBOUNCE_MS = '2000';
      process.env.CHATBOT_INBOUND_MAX_WAIT_MS = '8000';
      expect(getDebounceConfig()).toEqual({ debounceMs: 2000, maxWaitMs: 8000 });

      // Out of bounds debounce
      process.env.CHATBOT_INBOUND_DEBOUNCE_MS = '100'; // below 500
      expect(getDebounceConfig().debounceMs).toBe(6000);
      process.env.CHATBOT_INBOUND_DEBOUNCE_MS = '20000'; // above 10000
      expect(getDebounceConfig().debounceMs).toBe(6000);
    } finally {
      if (originalDebounce !== undefined) process.env.CHATBOT_INBOUND_DEBOUNCE_MS = originalDebounce;
      else delete process.env.CHATBOT_INBOUND_DEBOUNCE_MS;
      if (originalMaxWait !== undefined) process.env.CHATBOT_INBOUND_MAX_WAIT_MS = originalMaxWait;
      else delete process.env.CHATBOT_INBOUND_MAX_WAIT_MS;
    }
  });
});

describe('InboundReplyDebounceService', () => {
  let service;

  beforeEach(() => {
    jest.useFakeTimers();
    service = new InboundReplyDebounceService();
    // Pin debounce config so timing assertions below are deterministic regardless
    // of host environment (default in chatbotReplyBatch.util is 6000/10000).
    process.env.CHATBOT_INBOUND_DEBOUNCE_MS = '6000';
    process.env.CHATBOT_INBOUND_MAX_WAIT_MS = '10000';
  });

  afterEach(() => {
    service._resetForTests();
    inboundReplyDebounceService._resetForTests();
    jest.useRealTimers();
    delete process.env.CHATBOT_INBOUND_DEBOUNCE_MS;
    delete process.env.CHATBOT_INBOUND_MAX_WAIT_MS;
  });

  it('flushes a single message after 6000ms quiet window', async () => {
    const flushCallback = jest.fn();
    service.enqueue({
      key: 'zalo_oa:1:conv_1',
      message: { eventId: 'msg_1', persistedMessageId: 101, content: 'Xin chào' },
      flushCallback,
    });

    expect(flushCallback).not.toHaveBeenCalled();

    // Advance 5999ms -> not yet
    jest.advanceTimersByTime(5999);
    expect(flushCallback).not.toHaveBeenCalled();

    // Advance 1ms -> 6000ms -> should flush
    await jest.advanceTimersByTimeAsync(1);
    expect(flushCallback).toHaveBeenCalledTimes(1);
    expect(flushCallback).toHaveBeenCalledWith(expect.objectContaining({
      key: 'zalo_oa:1:conv_1',
      messages: [{ eventId: 'msg_1', persistedMessageId: 101, content: 'Xin chào', receivedAt: expect.any(Number) }],
      firstPersistedMessageId: 101,
      lastPersistedMessageId: 101,
      reason: 'quiet_window',
    }));
  });

  it('delays flush when a second message arrives within the debounce window', async () => {
    const flushCallback = jest.fn();
    service.enqueue({
      key: 'zalo_oa:1:conv_1',
      message: { eventId: 'msg_1', persistedMessageId: 101, content: 'Shop ơi' },
      flushCallback,
    });

    // Advance 3000ms
    jest.advanceTimersByTime(3000);
    expect(flushCallback).not.toHaveBeenCalled();

    // Second message arrives at t=3000ms
    service.enqueue({
      key: 'zalo_oa:1:conv_1',
      message: { eventId: 'msg_2', persistedMessageId: 102, content: 'Áo này còn không' },
      flushCallback,
    });

    // At t=6000ms (original due time), should NOT flush because timer reset to t=9000ms
    jest.advanceTimersByTime(3000);
    expect(flushCallback).not.toHaveBeenCalled();

    // At t=9000ms (3000ms after 2nd message), should flush both
    await jest.advanceTimersByTimeAsync(3000);
    expect(flushCallback).toHaveBeenCalledTimes(1);
    expect(flushCallback).toHaveBeenCalledWith(expect.objectContaining({
      messages: [
        expect.objectContaining({ eventId: 'msg_1', content: 'Shop ơi' }),
        expect.objectContaining({ eventId: 'msg_2', content: 'Áo này còn không' }),
      ],
      firstPersistedMessageId: 101,
      lastPersistedMessageId: 102,
      reason: 'quiet_window',
    }));
  });

  it('forces flush at max-wait (10000ms) when user sends continuous messages', async () => {
    const flushCallback = jest.fn();

    // Send a message every 2000ms (t=0, 2000, 4000, 6000, 8000) — at t=10000 the cap hits
    for (let i = 0; i < 5; i += 1) {
      service.enqueue({
        key: 'zalo_oa:1:conv_1',
        message: { eventId: `msg_${i}`, persistedMessageId: 100 + i, content: `Msg ${i}` },
        flushCallback,
      });
      jest.advanceTimersByTime(2000);
    }

    // At t=10000ms, max wait reached -> should flush first 5 messages with reason='max_wait'
    await jest.advanceTimersByTimeAsync(1);
    expect(flushCallback).toHaveBeenCalledTimes(1);
    expect(flushCallback).toHaveBeenCalledWith(expect.objectContaining({
      messages: expect.arrayContaining([
        expect.objectContaining({ eventId: 'msg_0' }),
        expect.objectContaining({ eventId: 'msg_4' }),
      ]),
      reason: 'max_wait',
    }));
  });

  it('processes different conversations independently', async () => {
    const cb1 = jest.fn();
    const cb2 = jest.fn();

    service.enqueue({
      key: 'zalo_oa:1:conv_A',
      message: { eventId: 'msg_a', content: 'User A' },
      flushCallback: cb1,
    });

    jest.advanceTimersByTime(3000);

    service.enqueue({
      key: 'zalo_oa:1:conv_B',
      message: { eventId: 'msg_b', content: 'User B' },
      flushCallback: cb2,
    });

    // At t=6000ms: conv_A flushes, conv_B still waiting
    await jest.advanceTimersByTimeAsync(3000);
    expect(cb1).toHaveBeenCalledTimes(1);
    expect(cb2).not.toHaveBeenCalled();

    // At t=9000ms: conv_B flushes
    await jest.advanceTimersByTimeAsync(3000);
    expect(cb2).toHaveBeenCalledTimes(1);
  });

  it('deduplicates messages with the same eventId', async () => {
    const flushCallback = jest.fn();

    const res1 = service.enqueue({
      key: 'zalo_oa:1:conv_1',
      message: { eventId: 'dup_1', content: 'First' },
      flushCallback,
    });
    const res2 = service.enqueue({
      key: 'zalo_oa:1:conv_1',
      message: { eventId: 'dup_1', content: 'Duplicate' },
      flushCallback,
    });

    expect(res1.enqueued).toBe(true);
    expect(res2.enqueued).toBe(false);
    expect(res2.duplicate).toBe(true);

    await jest.advanceTimersByTimeAsync(6000);
    expect(flushCallback).toHaveBeenCalledTimes(1);
    expect(flushCallback.mock.calls[0][0].messages).toHaveLength(1);
    expect(flushCallback.mock.calls[0][0].messages[0].content).toBe('First');
  });

  it('queues messages arriving during execution into next batch without concurrent execution', async () => {
    let resolveFirstBatch;
    const firstBatchPromise = new Promise((res) => { resolveFirstBatch = res; });
    const flushCallback = jest.fn().mockImplementation(async (batch) => {
      if (batch.messages[0].content === 'Batch 1 Msg') {
        await firstBatchPromise;
      }
    });

    service.enqueue({
      key: 'zalo_oa:1:conv_1',
      message: { eventId: 'm1', content: 'Batch 1 Msg' },
      flushCallback,
    });

    // Trigger first flush at t=6000ms
    jest.advanceTimersByTime(6000);
    expect(flushCallback).toHaveBeenCalledTimes(1);

    // While batch 1 is executing, message 2 arrives
    const res2 = service.enqueue({
      key: 'zalo_oa:1:conv_1',
      message: { eventId: 'm2', content: 'Batch 2 Msg' },
      flushCallback,
    });
    expect(res2.nextBatch).toBe(true);

    // Complete batch 1
    resolveFirstBatch();
    await Promise.resolve();

    // Now batch 2 is scheduled; advance timers by 6000ms
    await jest.advanceTimersByTimeAsync(6000);
    expect(flushCallback).toHaveBeenCalledTimes(2);
    expect(flushCallback.mock.calls[1][0].messages[0].content).toBe('Batch 2 Msg');
  });

  it('does not enqueue a provider retry while the original event is executing', async () => {
    let releaseFirstBatch;
    const firstBatchPromise = new Promise((resolve) => { releaseFirstBatch = resolve; });
    const flushCallback = jest.fn().mockImplementation(async () => firstBatchPromise);

    service.enqueue({
      key: 'zalo_oa:1:conv_1',
      message: { eventId: 'same_event', content: 'Original' },
      flushCallback,
    });
    jest.advanceTimersByTime(6000);
    expect(flushCallback).toHaveBeenCalledTimes(1);

    const retried = service.enqueue({
      key: 'zalo_oa:1:conv_1',
      message: { eventId: 'same_event', content: 'Provider retry' },
      flushCallback,
    });
    expect(retried).toEqual({ enqueued: false, duplicate: true });

    releaseFirstBatch();
    await Promise.resolve();
    await jest.advanceTimersByTimeAsync(10000);
    expect(flushCallback).toHaveBeenCalledTimes(1);
  });

  it('does not let a cancelled executing bucket delete a newer bucket with the same key', async () => {
    let releaseFirstBatch;
    const firstBatchPromise = new Promise((resolve) => { releaseFirstBatch = resolve; });
    const firstCallback = jest.fn().mockImplementation(async () => firstBatchPromise);
    const replacementCallback = jest.fn();

    service.enqueue({
      key: 'zalo_oa:1:conv_1',
      message: { eventId: 'first', content: 'First' },
      flushCallback: firstCallback,
    });
    jest.advanceTimersByTime(6000);
    expect(firstCallback).toHaveBeenCalledTimes(1);

    service.cancel('zalo_oa:1:conv_1');
    service.enqueue({
      key: 'zalo_oa:1:conv_1',
      message: { eventId: 'replacement', content: 'Replacement' },
      flushCallback: replacementCallback,
    });

    releaseFirstBatch();
    await Promise.resolve();
    await jest.advanceTimersByTimeAsync(6000);
    expect(replacementCallback).toHaveBeenCalledTimes(1);
  });

  it('keeps provider receive order even when messages are enqueued out of order', async () => {
    const flushCallback = jest.fn();
    service.enqueue({
      key: 'zalo_oa:1:conv_1',
      message: { eventId: 'later', content: 'Later', receivedAt: 2000, persistedMessageId: 2 },
      flushCallback,
    });
    service.enqueue({
      key: 'zalo_oa:1:conv_1',
      message: { eventId: 'earlier', content: 'Earlier', receivedAt: 1000, persistedMessageId: 1 },
      flushCallback,
    });

    await jest.advanceTimersByTimeAsync(6000);
    expect(flushCallback.mock.calls[0][0].messages.map((message) => message.content))
      .toEqual(['Earlier', 'Later']);
  });

  it('handles flush errors gracefully and cleans up state', async () => {
    const errorCallback = jest.fn().mockRejectedValue(new Error('AI failed'));

    service.enqueue({
      key: 'zalo_oa:1:conv_1',
      message: { eventId: 'm1', content: 'Error msg' },
      flushCallback: errorCallback,
    });

    await jest.advanceTimersByTimeAsync(6000);
    expect(errorCallback).toHaveBeenCalledTimes(1);

    // Subsequent message should work normally
    const successCallback = jest.fn().mockResolvedValue();
    service.enqueue({
      key: 'zalo_oa:1:conv_1',
      message: { eventId: 'm2', content: 'Next msg' },
      flushCallback: successCallback,
    });

    await jest.advanceTimersByTimeAsync(6000);
    expect(successCallback).toHaveBeenCalledTimes(1);
  });

  it('cancels pending batch when cancel() is called', async () => {
    const flushCallback = jest.fn();

    service.enqueue({
      key: 'zalo_oa:1:conv_1',
      message: { eventId: 'm1', content: 'To be cancelled' },
      flushCallback,
    });

    service.cancel('zalo_oa:1:conv_1');

    await jest.advanceTimersByTimeAsync(10000);
    expect(flushCallback).not.toHaveBeenCalled();
  });
});
