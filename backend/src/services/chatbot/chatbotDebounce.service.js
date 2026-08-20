import IORedis from 'ioredis';

const DEFAULT_DEBOUNCE_MS = 10000; // 10 seconds

/**
 * Resolve debounce window at call time so it honors `CHATBOT_DEBOUNCE_MS`
 * changes without requiring a server restart of this module's imports.
 * Clamps to [500ms, 60s] to keep timers sane across instances.
 */
function resolveDebounceMs() {
  const raw = Number.parseInt(process.env.CHATBOT_DEBOUNCE_MS, 10);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_DEBOUNCE_MS;
  return Math.min(60000, Math.max(500, raw));
}

const KEY_PREFIX = 'uknow:debounce';

/**
 * Debounce/batch service for chatbot messages.
 *
 * When a customer sends multiple messages in rapid succession (within the debounce window),
 * we wait until they stop before sending ONE AI response that covers all their messages.
 * This significantly reduces token usage when customers type in bursts.
 *
 * Flow:
 * 1. Message arrives → store in Redis list + start/reset timer (SETEX)
 * 2. If timer already running → just append to list (RPUSH), reset TTL
 * 3. When timer expires (Redis key expires) → Redis keyspace notification fires
 * 4. Our subscriber picks up the expired key → processes all messages as ONE batch
 */
class ChatbotDebounceService {
  constructor() {
    this.connection = null;
    this.subscriber = null;
    this.ready = false;
    this.processors = new Map(); // conversationId → processor function
    this.subscribed = false;
    this._pendingTimers = new Map(); // conversationKey → NodeJS.Timeout
  }

  /**
   * Initialize Redis connections.
   * Call once at app startup.
   */
  async init() {
    if (this.ready) return;

    const redisConfig = this._buildRedisConfig();
    const clientOptions = this._buildRedisClientOptions();

    this.connection = new IORedis(redisConfig, clientOptions);
    this.subscriber = new IORedis(redisConfig, clientOptions);

    // Handle connection errors gracefully - don't crash the server
    this.connection.on('error', (err) => {
      console.warn('[ChatbotDebounce] Redis connection error:', err.message);
      this.ready = false;
    });
    this.subscriber.on('error', (err) => {
      console.warn('[ChatbotDebounce] Redis subscriber error:', err.message);
    });

    // Handle successful reconnection
    this.connection.on('connect', () => {
      console.log('[ChatbotDebounce] Redis reconnected');
    });

    // Test connection
    try {
      await this.connection.ping();
      this.ready = true;
      console.log(`[ChatbotDebounce] Redis connected (debounce window=${resolveDebounceMs()}ms, override via CHATBOT_DEBOUNCE_MS)`);
    } catch (err) {
      console.warn('[ChatbotDebounce] Redis connection failed (debounce disabled):', err.message);
      this.ready = false;
      return;
    }

    // Subscribe to keyspace notifications for expired keys
    // Requires Redis to have notify-keyspace-events configured with "Ex"
    try {
      // Try to enable expired events (requires admin permission, may fail silently)
      await this.connection.config('SET', 'notify-keyspace-events', 'Ex');
    } catch {
      // Permission denied or Redis doesn't support it — that's okay
      // We'll fall back to polling with background timers
    }

    await this._subscribeToExpiredKeys();
  }

  /**
   * Register a processor function for a chatbot/conversation type.
   * The processor will be called with the batched messages when the debounce window closes.
   *
   * @param {string} channel - 'zalo_oa', 'facebook', etc.
   * @param {Function} processor - async function(messages: MessageItem[], context: Context): Promise<void>
   *   - messages: array of { messageId, content, timestamp, senderId, ... }
   *   - context: { conversationId, chatbotId, channelId, channel, senderId }
   */
  registerProcessor(channel, processor) {
    this.processors.set(channel, processor);
  }

  /**
   * Queue a message for debounced processing.
   * If another message from the same conversation arrives within the debounce window,
   * both will be batched into a single AI call.
   *
   * @param {object} params
   * @param {string} params.channel - 'zalo_oa' | 'facebook' | etc.
   * @param {string} params.conversationId - internal conversation ID
   * @param {string} params.chatbotId - chatbot ID
   * @param {string} params.channelId - channel connection ID
   * @param {string} params.senderId - customer's external ID (Zalo user ID, FB sender ID, etc.)
   * @param {string} params.messageId - unique message ID from the channel
   * @param {string} params.content - the actual message text
   * @param {number} [params.debounceMs] - override debounce window (default 8s)
   * @param {object} [params.extraContext] - additional context to pass to processor (e.g., userId, zaloSettingId, chatbotSettings)
   */
  async enqueueMessage({
    channel,
    conversationId,
    chatbotId,
    channelId,
    senderId,
    messageId,
    content,
    debounceMs = resolveDebounceMs(),
    extraContext = {},
  }) {
    if (!this.ready) {
      // Fallback: process immediately without debounce
      console.warn('[ChatbotDebounce] Redis not ready, processing without debounce');
      const processor = this.processors.get(channel);
      if (processor) {
        await processor(
          [{ messageId, content, timestamp: Date.now(), senderId }],
          { conversationId, chatbotId, channelId, channel, senderId, ...extraContext }
        );
      }
      return;
    }

    const batchKey = `${KEY_PREFIX}:batch:${channel}:${conversationId}`;
    const timerKey = `${KEY_PREFIX}:timer:${channel}:${conversationId}`;
    const contextKey = `${KEY_PREFIX}:context:${channel}:${conversationId}`;

    const messageItem = JSON.stringify({
      messageId,
      content,
      timestamp: Date.now(),
      senderId,
    });

    try {
      // Check if this is a new batch (timer key doesn't exist)
      const isFirstMessage = !(await this.connection.exists(timerKey));

      // Append message to batch
      await this.connection.rpush(batchKey, messageItem);

      // Always refresh the timer
      // This means: every new message resets the 8-second window
      await this.connection.set(timerKey, '1', 'PX', debounceMs);

      // Store extra context. We refresh it on every message so the TTL always
      // extends past the next debounce window — race conditions between cleanup
      // and rapid inbound messages can otherwise clear the context key before
      // the batch fires, leaving the processor with undefined userId/zaloSettingId.
      if (Object.keys(extraContext).length > 0) {
        const ttl = Math.max(debounceMs * 2, 60000);
        await this.connection.set(contextKey, JSON.stringify(extraContext), 'PX', ttl);
        // Chỉ in 1 dòng tóm tắt keys (không in full object — system_instruction có thể ~9KB).
        if (isFirstMessage) {
          console.log(`[ChatbotDebounce] Stored context for ${channel}:${conversationId} keys=${Object.keys(extraContext).join(',')}`);
        }
      }

      // Always schedule (or re-arm) a processing timeout. _processBatch will bail
      // out via the timerExists check if the user is still typing, but the NEXT
      // message after that will call us again to re-arm the timeout. This is what
      // guarantees the batch is processed exactly once, after a full debounce window
      // of silence. Without this, fast sequential messages silently leave the batch
      // hanging (fixed bug: prior version only scheduled on first message).
      this._scheduleBatchProcessing(channel, conversationId, debounceMs);
      // Bỏ log mỗi enqueue — gây ngập log khi user gõ nhiều. Log tóm tắt ở _processBatch.
    } catch (err) {
      console.error('[ChatbotDebounce] Failed to enqueue:', err.message);
      // Fallback: process immediately
      const processor = this.processors.get(channel);
      if (processor) {
        await processor(
          [{ messageId, content, timestamp: Date.now(), senderId }],
          { conversationId, chatbotId, channelId, channel, senderId, ...extraContext }
        );
      }
    }
  }

  /**
   * Schedule batch processing after debounce window.
   * Uses a delayed setTimeout + Redis check pattern.
   */
  async _scheduleBatchProcessing(channel, conversationId, debounceMs) {
    const key = `${channel}:${conversationId}`;
    const delayedKey = `${KEY_PREFIX}:delayed:${channel}:${conversationId}`;

    try {
      // If a timer is already armed for this conversation, clear it and replace
      // with a fresh one. setTimeout's `ref` semantics don't auto-reschedule, so we
      // need to do this manually to honor the debounce reset on each new message.
      const existingTimer = this._pendingTimers.get(key);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      // Delayed key Redis dùng cho observability/debug cross-instance. Bỏ log để giảm noise.
      await this.connection.set(delayedKey, '1', 'PX', debounceMs + 500);

      const handle = setTimeout(async () => {
        this._pendingTimers.delete(key);
        await this._processBatch(channel, conversationId);
      }, debounceMs + 100);
      this._pendingTimers.set(key, handle);
    } catch (err) {
      console.error('[ChatbotDebounce] Failed to schedule batch:', err.message);
    }
  }

  /**
   * Process the batched messages for a conversation.
   * Called when the debounce window closes.
   */
  async _processBatch(channel, conversationId) {
    if (!this.ready) {
      return;
    }

    // Chống 2 trigger đồng thời (setTimeout Node + Redis pub/sub expired key)
    // cùng gọi _processBatch cho cùng conversation. Đã có guard `batch rỗng → return`
    // nhưng thêm in-process mutex để log sạch hơn và tránh race khi batch vừa del.
    const procKey = `${channel}:${conversationId}`;
    if (this._processingBatches?.has(procKey)) {
      return;
    }
    if (!this._processingBatches) this._processingBatches = new Set();
    this._processingBatches.add(procKey);

    const batchKey = `${KEY_PREFIX}:batch:${channel}:${conversationId}`;
    const timerKey = `${KEY_PREFIX}:timer:${channel}:${conversationId}`;
    const contextKey = `${KEY_PREFIX}:context:${channel}:${conversationId}`;

    try {
      // Check if timer has expired (using Lua script for atomicity)
      const timerExists = await this.connection.exists(timerKey);
      if (timerExists) {
        // Timer still running, another message came in - let that one handle it
        return;
      }

      // Get all messages in the batch
      const rawMessages = await this.connection.lrange(batchKey, 0, -1);
      if (!rawMessages || rawMessages.length === 0) {
        return;
      }

      const messages = rawMessages.map((raw) => JSON.parse(raw));

      // Get extra context from Redis BEFORE cleaning up
      let extraContext = {};
      try {
        const contextRaw = await this.connection.get(contextKey);
        if (contextRaw) {
          extraContext = JSON.parse(contextRaw);
        }
      } catch (err) {
        console.error(`[ChatbotDebounce] Failed to parse extraContext:`, err.message);
      }

      // Clean up the batch and context AFTER reading context
      await this.connection.del(batchKey, contextKey);

      // Call the registered processor
      const processor = this.processors.get(channel);
      if (!processor) {
        console.error(`[ChatbotDebounce] No processor registered for channel: ${channel}`);
        return;
      }

      // Get context from the first message (senderId is the same for all)
      const firstMsg = messages[0];
      const combinedContent = this._combineMessages(messages);

      // Log tóm tắt — không in full extraContext (system_instruction có thể ~9KB).
      console.log(
        `[ChatbotDebounce] Process ${channel}:${conversationId} msgs=${messages.length} preview="${combinedContent.substring(0, 60)}" keys=${Object.keys(extraContext).join(',')}`
      );

      // Call processor with the combined message and extra context
      await processor(messages, {
        conversationId,
        channel,
        combinedMessage: combinedContent,
        senderId: firstMsg.senderId,
        messageCount: messages.length,
        ...extraContext,
      });
    } catch (err) {
      console.error(`[ChatbotDebounce] Failed to process batch for ${channel}:${conversationId}:`, err.message);
    } finally {
      this._processingBatches.delete(procKey);
    }
  }

  /**
   * Combine multiple messages into a single prompt for the AI.
   * Preserves the original messages with numbering for clarity.
   */
  _combineMessages(messages) {
    if (messages.length === 1) {
      return messages[0].content;
    }

    return messages
      .map((msg, i) => `[Tin nhắn ${i + 1}]: ${msg.content}`)
      .join('\n');
  }

  /**
   * Subscribe to Redis keyspace notifications for expired keys.
   * This is the most efficient way to detect when debounce timers expire.
   */
  async _subscribeToExpiredKeys() {
    if (this.subscribed) return;

    try {
      // Subscribe to expired key events
      await this.subscriber.subscribe('__keyevent@0__:expired');
      this.subscribed = true;

      this.subscriber.on('message', (channel, key) => {
        // Check if this is a delayed processing key
        const match = key.match(new RegExp(`^${KEY_PREFIX}:delayed:(.+):(.+)$`));
        if (match) {
          const [, channel, conversationId] = match;
          // Lưu ý: trigger thứ 2 (Redis pub/sub) song song với setTimeout. Batch rỗng
          // → _processBatch sẽ tự return, nhưng ta không log ở đây để tránh nhân đôi log.
          this._processBatch(channel, conversationId);
        }
      });

      console.log('[ChatbotDebounce] Subscribed to Redis keyspace notifications');
    } catch (err) {
      console.warn('[ChatbotDebounce] Could not subscribe to keyspace notifications:', err.message);
      // Fallback to polling/timers - already handled in _scheduleBatchProcessing
    }
  }

  /**
   * Force process a batch immediately (e.g., for testing or manual trigger).
   */
  async flushBatch(channel, conversationId) {
    await this._processBatch(channel, conversationId);
  }

  /**
   * Clear a pending batch (e.g., when conversation is closed).
   */
  async clearBatch(channel, conversationId) {
    if (!this.ready) return;

    const batchKey = `${KEY_PREFIX}:batch:${channel}:${conversationId}`;
    const timerKey = `${KEY_PREFIX}:timer:${channel}:${conversationId}`;
    const delayedKey = `${KEY_PREFIX}:delayed:${channel}:${conversationId}`;
    const contextKey = `${KEY_PREFIX}:context:${channel}:${conversationId}`;

    await this.connection.del(batchKey, timerKey, delayedKey, contextKey);
    console.log(`[ChatbotDebounce] Cleared batch for ${channel}:${conversationId}`);
  }

  /**
   * Get current batch size for a conversation (for monitoring).
   */
  async getBatchSize(channel, conversationId) {
    if (!this.ready) return -1;

    const batchKey = `${KEY_PREFIX}:batch:${channel}:${conversationId}`;
    return await this.connection.llen(batchKey);
  }

  /**
   * Shutdown connections gracefully.
   */
  async shutdown() {
    if (this.connection) {
      await this.connection.quit();
    }
    if (this.subscriber) {
      await this.subscriber.quit();
    }
    this.ready = false;
    this.subscribed = false;
  }

  _buildRedisConfig() {
    const redisUrl = String(
      process.env.BULLMQ_REDIS_URL
      || process.env.REDIS_URL
      || ''
    ).trim();
    if (redisUrl) return redisUrl;

    const host = String(process.env.REDIS_HOST || '127.0.0.1').trim();
    const port = Number.parseInt(process.env.REDIS_PORT || '6379', 10);
    const db = Number.parseInt(process.env.REDIS_DB || '0', 10);
    const password = String(process.env.REDIS_PASSWORD || '').trim();
    return {
      host,
      port: Number.isFinite(port) ? port : 6379,
      db: Number.isFinite(db) ? db : 0,
      ...(password ? { password } : {}),
    };
  }

  _buildRedisClientOptions() {
    const rawTimeout = String(
      process.env.BULLMQ_REDIS_CONNECT_TIMEOUT_MS
      || process.env.REDIS_CONNECT_TIMEOUT_MS
      || '60000'
    ).trim();
    const parsed = Number.parseInt(rawTimeout, 10);
    const connectTimeout = Number.isFinite(parsed) && parsed > 0 ? parsed : 60000;
    return {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      connectTimeout,
    };
  }
}

export default new ChatbotDebounceService();
