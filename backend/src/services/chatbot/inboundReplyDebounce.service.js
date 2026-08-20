import { getDebounceConfig } from '../../utils/chatbotReplyBatch.util.js';

/**
 * Service for debouncing inbound chatbot messages (trailing edge with max-wait)
 * Ensures that rapid bursts of messages from a single conversation are batched into
 * one AI response, saving API calls and preventing fragmented responses.
 */
class InboundReplyDebounceService {
  constructor() {
    this.buckets = new Map();
  }

  /**
   * Enqueue an incoming message for debounced reply processing.
   *
   * @param {object} params
   * @param {string} params.key - Unique key per conversation, e.g. "zalo_oa:1:conv_123" or "zalo_personal:5:conv_456"
   * @param {object} params.message
   * @param {string|number} [params.message.eventId] - Unique provider event/message ID for deduplication
   * @param {string|number} [params.message.persistedMessageId] - DB row ID of the saved visitor message
   * @param {string} params.message.content - Raw message content
   * @param {object} [params.message.metadata] - Extra metadata (senderId, etc.)
   * @param {Function} params.flushCallback - Async callback: async (batch) => Promise<void>
   * @param {number} [params.now] - Optional timestamp for testing
   * @returns {{ enqueued: boolean, duplicate?: boolean, nextBatch?: boolean }}
   */
  enqueue({ key, message, flushCallback, now = Date.now() }) {
    if (!key || !message) {
      return { enqueued: false };
    }

    const eventId = message.eventId != null ? String(message.eventId) : null;
    let bucket = this.buckets.get(key);

    // 1. If currently executing, queue into nextBucket to prevent concurrent AI calls
    if (bucket && bucket.isExecuting) {
      // A provider retry can arrive while the original batch is executing.
      // It must not become a second batch after the first reply completes.
      if (eventId && bucket.seenEventIds.has(eventId)) {
        return { enqueued: false, duplicate: true };
      }

      if (!bucket.nextBucket) {
        bucket.nextBucket = {
          key,
          firstReceivedAt: now,
          lastReceivedAt: now,
          messages: [],
          seenEventIds: new Set(),
          timer: null,
          flushCallback: flushCallback || bucket.flushCallback,
          isExecuting: false,
          nextBucket: null,
        };
      }

      if (eventId) {
        if (bucket.nextBucket.seenEventIds.has(eventId)) {
          return { enqueued: false, duplicate: true };
        }
        bucket.nextBucket.seenEventIds.add(eventId);
      }

      bucket.nextBucket.messages.push(this._withReceivedAt(message, now));
      bucket.nextBucket.lastReceivedAt = now;
      if (flushCallback) {
        bucket.nextBucket.flushCallback = flushCallback;
      }

      return { enqueued: true, nextBatch: true };
    }

    // 2. Normal bucket processing
    if (!bucket) {
      bucket = {
        key,
        firstReceivedAt: now,
        lastReceivedAt: now,
        messages: [],
        seenEventIds: new Set(),
        timer: null,
        flushCallback,
        isExecuting: false,
        nextBucket: null,
      };
      this.buckets.set(key, bucket);
    }

    // Check duplicate in current batch
    if (eventId) {
      if (bucket.seenEventIds.has(eventId)) {
        return { enqueued: false, duplicate: true };
      }
      bucket.seenEventIds.add(eventId);
    }

    bucket.messages.push(this._withReceivedAt(message, now));
    bucket.lastReceivedAt = now;
    if (flushCallback) {
      bucket.flushCallback = flushCallback;
    }

    this._scheduleTimer(key, bucket);
    return { enqueued: true };
  }

  /**
   * Schedule or reschedule the debounce timer based on trailing-edge and max-wait.
   * @private
   */
  _scheduleTimer(key, bucket) {
    if (bucket.timer) {
      clearTimeout(bucket.timer);
      bucket.timer = null;
    }

    const { debounceMs, maxWaitMs } = getDebounceConfig();
    const now = Date.now();
    const quietDueAt = bucket.lastReceivedAt + debounceMs;
    const maxWaitDueAt = bucket.firstReceivedAt + maxWaitMs;
    const dueAt = Math.min(quietDueAt, maxWaitDueAt);
    const delayMs = Math.max(0, dueAt - now);
    const reason = maxWaitDueAt <= quietDueAt ? 'max_wait' : 'quiet_window';

    bucket.timer = setTimeout(() => {
      this._flush(key, reason);
    }, delayMs);

    // Unref timer in Node.js environment so it doesn't block process exit
    if (typeof bucket.timer.unref === 'function') {
      bucket.timer.unref();
    }
  }

  /**
   * Flush and execute the batch for a conversation key.
   * @private
   */
  async _flush(key, reason) {
    const bucket = this.buckets.get(key);
    if (!bucket || bucket.isExecuting || bucket.messages.length === 0) {
      return;
    }

    if (bucket.timer) {
      clearTimeout(bucket.timer);
      bucket.timer = null;
    }

    bucket.isExecuting = true;
    const messages = [...bucket.messages].sort((a, b) => {
      const receivedDiff = a.receivedAt - b.receivedAt;
      if (receivedDiff !== 0) return receivedDiff;
      return Number(a.persistedMessageId || 0) - Number(b.persistedMessageId || 0);
    });
    const now = Date.now();
    const waitMs = now - bucket.firstReceivedAt;

    const firstPersistedMessageId = messages.find((m) => m.persistedMessageId != null)?.persistedMessageId || null;
    const lastPersistedMessageId = [...messages].reverse().find((m) => m.persistedMessageId != null)?.persistedMessageId || null;

    const batch = {
      key,
      messages,
      firstReceivedAt: bucket.firstReceivedAt,
      lastReceivedAt: bucket.lastReceivedAt,
      waitMs,
      reason,
      firstPersistedMessageId,
      lastPersistedMessageId,
    };

    try {
      if (typeof bucket.flushCallback === 'function') {
        await bucket.flushCallback(batch);
      }
    } catch (err) {
      console.error(`[InboundReplyDebounce] Error executing batch for ${key}:`, err.stack || err.message);
    } finally {
      bucket.isExecuting = false;

      // cancel() may have removed this bucket while its callback was awaiting
      // AI/send work. Never let the old callback overwrite or delete a newer
      // bucket created for the same key afterwards.
      if (this.buckets.get(key) === bucket && !bucket.cancelled) {
        // If messages arrived while AI was running, schedule the next batch
        if (bucket.nextBucket && bucket.nextBucket.messages.length > 0) {
          const next = bucket.nextBucket;
          this.buckets.set(key, next);
          this._scheduleTimer(key, next);
        } else {
          this.buckets.delete(key);
        }
      }
    }
  }

  /**
   * Cancel and discard any pending timer/batch for a conversation key.
   * Useful when an account is disconnected or conversation is deleted.
   *
   * @param {string} key
   */
  cancel(key) {
    const bucket = this.buckets.get(key);
    if (!bucket) return;

    bucket.cancelled = true;
    this._clearBucketTimers(bucket);
    this.buckets.delete(key);
  }

  /** Cancel every pending conversation bucket for a channel/account prefix. */
  cancelByPrefix(prefix) {
    if (!prefix) return;
    for (const key of this.buckets.keys()) {
      if (key.startsWith(prefix)) this.cancel(key);
    }
  }

  /**
   * Reset all in-memory buckets and timers.
   * For test teardown only.
   */
  _resetForTests() {
    for (const bucket of this.buckets.values()) {
      this._clearBucketTimers(bucket);
    }
    this.buckets.clear();
  }

  _withReceivedAt(message, fallbackNow) {
    const rawReceivedAt = message?.receivedAt;
    let receivedAt = rawReceivedAt instanceof Date
      ? rawReceivedAt.getTime()
      : Number(rawReceivedAt);

    if (!Number.isFinite(receivedAt)) {
      const parsed = typeof rawReceivedAt === 'string' ? Date.parse(rawReceivedAt) : NaN;
      receivedAt = Number.isFinite(parsed) ? parsed : fallbackNow;
    }

    // Some providers send Unix seconds while Date.now() uses milliseconds.
    if (receivedAt > 0 && receivedAt < 1e11) receivedAt *= 1000;
    return { ...message, receivedAt };
  }

  _clearBucketTimers(bucket) {
    if (bucket?.timer) clearTimeout(bucket.timer);
    if (bucket?.nextBucket?.timer) clearTimeout(bucket.nextBucket.timer);
  }
}

export default new InboundReplyDebounceService();
export { InboundReplyDebounceService };
