/**
 * Regression tests cho bug Telegram:
 *
 *   Bug #2 — `processTelegramPersonalBatch` không merge
 *             `chatbot_settings.channel='telegram_personal'` vào merged
 *             settings truyền cho `routeMessageWithSettings`.
 *             → Bot không thấy system_instruction, welcome_message,
 *               response_style, ai_model, temperature, max_tokens,
 *               id_sub_assistant do user đã cấu hình.
 *
 *   Bug #3 — `telegramAdapter.parseWebhookEvent` không trả `messageId`.
 *             → InboundReplyDebounceService không dedupe được vì
 *               route /telegram-webhook set `eventId: null`.
 *
 *   Bug #4 — Khi `accountSettings.is_enabled=false`, route `return`
 *             ngay không log, không ghi system row → operator
 *             tưởng cấu hình OK nhưng bot "im lặng từ câu thứ 2".
 *
 *   Bug #1 — `conversation.id_chatbot` bị khoá cứng, đổi chatbot
 *             qua DeployTab không có hiệu lực cho hội thoại đang mở.
 *
 * Test này được viết trước khi sửa code. Mục tiêu: đỏ trên code
 * hiện tại, xanh sau khi fix.
 *
 * Pattern: dựng một mini Express app, mount router thật, mock đầy đủ
 * dependency chain (database, chatbot repo, chatRouter, debounce,
 * telegram adapter, inProcChannelGateway, …). supertest POST vào
 * app này.
 */

import { describe, expect, it, beforeEach, afterEach, jest } from '@jest/globals';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const resolveUrl = (rel) =>
  path.resolve(__dirname, '..', '..', rel).replace(/\\/g, '/');

// ── Fixtures ────────────────────────────────────────────────────────────

const fakeAccount = {
  id: 7,
  id_user: 42,
  telegram_user_id: 9999,
  is_active: true,
};

/** Dòng Hộp thư hợp nhất (channel_conversations) của (tài khoản 7, chat 7777). */
const fakeInboxConversation = {
  id: 501,
  id_channel: 31,
  id_user: 42,
  visitor_name: 'Alice',
  visitor_info: { chatbot_id: 55, is_group: false, telegram_conversation_id: 101 },
};

const fakeConversation = {
  id: 101,
  id_user: 42,
  id_telegram_account: 7,
  external_id: '7777',
  status: 'open',
  id_chatbot: 55, // khoá cứng hiện tại — Bug #1 sẽ bỏ
  ai_paused: false,
};

/** Row `telegram_chatbot_settings` — chỉ có 3 cột enable. */
const fakeAccountSettings = {
  id_telegram_account: 7,
  id_chatbot: 55,
  is_enabled: true,
  is_enabled_dm: true,
  is_enabled_group: false,
};

/** Row `chatbot_settings.channel='telegram_personal'` — đầy đủ config. */
const fakeChatbotSettingsFull = {
  id_user: 42,
  channel: 'telegram_personal',
  id_sub_assistant: 999,
  is_enabled: true,
  system_instruction: 'Bạn là trợ lý bán hàng chuyên nghiệp',
  welcome_message: 'Chào bạn! Mình có thể giúp gì?',
  ai_model: 'gemini-2.5-pro',
  temperature: 0.3,
  max_tokens: 1024,
  response_style: 'professional',
  sub_assistant_name: 'Sales Bot',
  greeting_msg: 'Hi from sub-assistant',
};

const fakeAccountSettingsDisabled = {
  ...fakeAccountSettings,
  is_enabled: false,
};

const inboundPayload = {
  telegram_user_id: 9999,
  sender_id: '8888',
  sender_name: 'Alice',
  chat_id: '7777',
  is_group: false,
  is_private: true,
  text: 'Xin chào',
  message_id: 12345,
};

// ── per-test mutable mocks ──────────────────────────────────────────────

let mocks = {};
let app;

beforeEach(async () => {
  jest.resetModules();
  // Reset mutable fake fields in case prior tests mutated them.
  fakeConversation.id_chatbot = 55;
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
  process.env.TELEGRAM_GATEWAY_SECRET = 'tg-test-secret';
  process.env.TELEGRAM_GATEWAY_TRANSPORT = './stub';

  // Mỗi test muốn scenario accountSettings nào → gán
  // `mocks._scenarioAccountSettings` TRƯỚC khi POST. Mặc định: enabled.
  mocks = {
    _scenarioAccountSettings: fakeAccountSettings,
    _scenarioConversationOverride: null,
    _scenarioAiPaused: false,
    _pauseReads: 0, // số lần route hỏi trạng thái tạm dừng AI của Hộp thư
    _onRoute: null, // móc chạy NGAY TRONG lúc AI đang soạn (vd chủ tạm dừng giữa chừng)
    _activeCheck: null, // ghi đè kết quả checkBeforeAi của khung giờ (vd ngoài giờ + câu tĩnh)
    // Default pick-enabled candidates = 55 enabled. Test có thể
    // override khi cần giả lập user đổi chatbot.
    _scenarioEnabledChatbots: [{ id_chatbot: 55 }],
    _lastRouterCall: null,
    // Ca nào cần chatRouter trả kết quả khác (câu xin lỗi G3b…) gán trước khi POST; mặc định = câu trả lời thường.
    _routerResult: null,
    _sendReplyCalls: [],
    _sendReplyResult: { success: true },
    _echoRows: [],
    _consoleLog: [],
    // Hộp thư hợp nhất (channel_*) — P1 PLAN_TG_WA_DAY_DU
    _channelMessages: [],
    _inboxFindRows: [fakeInboxConversation], // findTelegramInboxConversation
    _inboxEnsureRows: [fakeInboxConversation], // SELECT của ensureTelegramInboxConversation ([] = tạo mới)
    _scenarioLegacyOverride: null,
    _batchMessages: null, // ghi đè đợt tin do debounce trả (mặc định 1 tin)
    _captureEnqueue: false, // P5: true -> đợt tin = CHÍNH tin route đưa vào debounce (thay vì tin cố định)
    _enqueued: [],
    _mediaCalls: [],
    _mediaResult: null,
    _promoteCalls: [],
    _setAiPausedCalls: [],
    _sse: [],
    dbQuery: null,
    chatRouterCall: () => mocks._lastRouterCall,
    sendReplyCalls: () => mocks._sendReplyCalls,
  };

  // Track tất cả DB query để assert log row 'system'.
  const dbQueryMock = jest.fn(async (sql, params) => {
    const s = String(sql);
    mocks._callsSoFar = mocks._callsSoFar || [];
    mocks._callsSoFar.push({ sql: s, params });

    // 0. Hộp thư hợp nhất: channel_connections / channel_conversations / channel_messages
    if (/INSERT INTO channel_connections/i.test(s)) return { rows: [{ id: 31 }] };
    if (/SELECT id\s+FROM channel_connections/i.test(s)) {
      return { rows: [{ id: 31 }] };
    }
    if (/JOIN channel_connections ch ON ch\.id = cc\.id_channel/i.test(s)) {
      return { rows: mocks._inboxFindRows };
    }
    if (/SELECT id, id_channel, id_user, visitor_name, visitor_info/i.test(s)) {
      return { rows: mocks._inboxEnsureRows };
    }
    if (/INSERT INTO channel_conversations/i.test(s)) {
      return { rows: [{ id: 501, id_channel: 31, id_user: 42, visitor_name: params?.[3] ?? null }] };
    }
    if (/UPDATE channel_conversations/i.test(s)) return { rows: [] };
    if (/SELECT id FROM channel_messages WHERE id_conversation/i.test(s)) {
      const hit = mocks._channelMessages.find(
        (m) => m.id_conversation === params[0] && m.external_id === params[1]
      );
      return { rows: hit ? [{ id: hit.id }] : [] };
    }
    if (/INSERT INTO channel_messages/i.test(s)) {
      const row = {
        id: 700 + mocks._channelMessages.length,
        id_conversation: params[0],
        id_user: params[1],
        id_channel: params[2],
        role: params[3],
        content: params[4],
        external_id: params[5],
        metadata: params[6],
        message_type: params[7],
        attachments: params[8],
      };
      mocks._channelMessages.push(row);
      return { rows: [{ id: row.id }] };
    }
    if (/UPDATE channel_messages SET external_id/i.test(s)) {
      const row = mocks._channelMessages.find((m) => m.id === params[0] && m.external_id == null);
      if (row) row.external_id = params[1];
      return { rows: [] };
    }
    if (/FROM channel_messages/i.test(s) && /role IN/i.test(s)) {
      return { rows: mocks._echoRows };
    }

    // 1. Conversation lookup
    if (/SELECT \* FROM telegram_personal_conversations/i.test(s)) {
      if (mocks._scenarioConversationOverride === 'null') {
        return { rows: [] };
      }
      return { rows: [mocks._scenarioLegacyOverride || fakeConversation] };
    }
    if (/INSERT INTO telegram_personal_conversations/i.test(s)) {
      return { rows: [fakeConversation] };
    }
    // 2. custom_chatbots (active hours lookup)
    if (/FROM custom_chatbots/i.test(s) && /is_active/i.test(s)) {
      return { rows: [{ id: 55, active_hours: null }] };
    }
    // 3a. pickEnabledChatbotForTelegram / isChatbotStillEnabledForAccount
    //     đều có `JOIN custom_chatbots` + filter `tcs.is_enabled = true`.
    //     Phân biệt:
    //       - Có `LIMIT 1`           → isChatbotStillEnabledForAccount
    //                                 → check xem id_chatbot trong params
    //                                   có nằm trong scenario không.
    //       - Có `tcs.id_chatbot IS NOT NULL` + ORDER BY
    //                                 → pickEnabledChatbotForTelegram.
    if (/FROM telegram_chatbot_settings/i.test(s) && /JOIN custom_chatbots/i.test(s)) {
      if (/LIMIT 1/i.test(s)) {
        const target = Array.isArray(params) ? Number(params[1]) : null;
        const hit = mocks._scenarioEnabledChatbots.some(
          (r) => Number(r.id_chatbot) === target
        );
        return { rows: hit ? [{ one: 1 }] : [] };
      }
      // pickEnabledChatbotForTelegram
      return { rows: mocks._scenarioEnabledChatbots || [] };
    }
    // 3b. telegram_chatbot_settings lookup thường (per account, per
    //     chatbot) — không có JOIN.
    if (/FROM telegram_chatbot_settings/i.test(s)) {
      const scenario = mocks._scenarioAccountSettings;
      return { rows: scenario ? [scenario] : [] };
    }
    // 4. chatbot_settings (channel='telegram_personal') — bug #2 chưa
    //    đụng tới cái này nên return [] như code hiện tại.
    if (/FROM chatbot_settings/i.test(s) && /channel/i.test(s)) {
      return { rows: [fakeChatbotSettingsFull] };
    }
    // 6. Insert messages — return id (for throughMessageId tracking)
    if (/INSERT INTO telegram_personal_messages/i.test(s)) {
      return { rows: [{ id: 999 }] };
    }
    // 7. Select latest message id (for throughMessageId)
    if (/SELECT id FROM telegram_personal_messages/i.test(s)) {
      return { rows: [{ id: 998 }] };
    }
    // 8. Update / insert other — accept
    return { rows: [{ ok: 1 }] };
  });

  const dbMock = {
    query: dbQueryMock,
    getClient: jest.fn(),
    pool: { on: jest.fn() },
    withRetry: (fn) => fn(),
    isConnectionError: () => false,
    isNeon: false,
  };

  jest.unstable_mockModule(resolveUrl('config/database.js'), () => ({
    default: dbMock,
    withRetry: dbMock.withRetry,
    isConnectionError: dbMock.isConnectionError,
    isNeon: dbMock.isNeon,
  }));

  // chatbot repository
  const chatbotRepoMock = {
    getSettings: jest.fn(async () => fakeChatbotSettingsFull),
    findChatbotById: jest.fn(async () => mocks._chatbotRecord || ({ id: 55, active_hours: null })),
  };
  jest.unstable_mockModule(
    resolveUrl('repositories/ai/chatbot.repository.js'),
    () => ({ default: chatbotRepoMock })
  );

  // chatbot telegram repository
  jest.unstable_mockModule(
    resolveUrl('repositories/chatbot/chatbotTelegram.repository.js'),
    () => ({
      default: {
        getAccountByTelegramUserId: jest.fn(async (tid) =>
          tid === fakeAccount.telegram_user_id ? fakeAccount : null
        ),
        // Bug 22/09 — route đã chuyển từ raw query sang dùng repo này
        // để JOIN `custom_chatbots.system_instruction` làm fallback
        // chain giống Zalo Personal. Test pass `fakeAccountSettings` qua
        // đây (test muốn override `chatbot_system_instruction` thì gán
        // `_scenarioAccountSettings.chatbot_system_instruction`).
        getSettingsForAccount: jest.fn(async (accountId, chatbotId) => {
          if (!mocks._scenarioAccountSettings) return null;
          if (Number(chatbotId) !== Number(mocks._scenarioAccountSettings.id_chatbot)) {
            return null;
          }
          return mocks._scenarioAccountSettings;
        }),
      },
    })
  );

  // chatRouter — ghi nhận call
  jest.unstable_mockModule(
    resolveUrl('services/chatbot/chatRouter.service.js'),
    () => ({
      default: {
        routeMessageWithSettings: jest.fn(async (payload) => {
          mocks._lastRouterCall = payload;
          if (mocks._onRoute) mocks._onRoute();
          return mocks._routerResult || { type: 'text', content: 'fake-bot-reply' };
        }),
      },
    })
  );

  // debounce — chạy flush ngay
  jest.unstable_mockModule(
    resolveUrl('services/chatbot/inboundReplyDebounce.service.js'),
    () => ({
      default: {
        enqueue: jest.fn(async ({ message, flushCallback }) => {
          mocks._enqueued.push(message);
          await flushCallback({
            messages: mocks._batchMessages || (mocks._captureEnqueue
              ? [{ ...message, receivedAt: Date.now() }]
              : [
                {
                  eventId: inboundPayload.message_id,
                  content: inboundPayload.text,
                  receivedAt: Date.now(),
                },
              ]),
            firstReceivedAt: Date.now(),
            lastReceivedAt: Date.now(),
            waitMs: 0,
            reason: 'quiet_window',
          });
        }),
      },
    })
  );

  // telegram adapter
  jest.unstable_mockModule(
    resolveUrl('services/chatbot/channelAdapters/telegram.adapter.js'),
    () => ({
      default: {
        parseWebhookEvent: jest.fn((body) => ({
          event: 'message',
          message: body?.text || '',
          senderId: body?.sender_id != null ? String(body.sender_id) : null,
          senderName: body?.sender_name || null,
          chatId: body?.chat_id != null ? String(body.chat_id) : null,
          isGroup: Boolean(body?.is_group),
          isPrivate: body?.is_private !== false ? !body?.is_group : Boolean(body?.is_private),
          telegramUserId: body?.telegram_user_id != null ? Number(body.telegram_user_id) : null,
          messageId: body?.message_id != null ? Number(body.message_id) : null,
          isOutgoing: body?.is_outgoing === true,
          media: body?.media ?? null,
        })),
        verifyWebhookSecret: jest.fn(async (provided) => {
          if (!provided) throw new Error('TELEGRAM_GATEWAY_SECRET is not configured');
          if (provided !== process.env.TELEGRAM_GATEWAY_SECRET) throw new Error('Invalid Telegram gateway secret');
        }),
        sendReply: jest.fn(async (args) => {
          mocks._sendReplyCalls.push(args);
          return mocks._sendReplyResult;
        }),
      },
    })
  );

  // P5 — tải + lưu ảnh/tệp khách gửi: giả ở RANH GIỚI (kết quả đúng hình dạng `resolveTelegramInboundMedia` trả).
  jest.unstable_mockModule(
    resolveUrl('services/chatbot/telegramInboundMedia.service.js'),
    () => ({
      resolveTelegramInboundMedia: jest.fn(async (arg) => {
        mocks._mediaCalls.push(arg);
        return mocks._mediaResult;
      }),
    })
  );
  jest.unstable_mockModule(
    resolveUrl('services/chatbot/channelInboundMedia.service.js'),
    () => ({
      promoteInboundAttachments: jest.fn(async (list) => { mocks._promoteCalls.push(list); }),
      presentInboundAttachments: (list) => list.map((a) => ({ type: a.type, url: `signed:${a.key}`, name: a.displayName })),
    })
  );

  // active hours
  jest.unstable_mockModule(
    resolveUrl('services/chatbot/chatbotActiveHours.service.js'),
    () => ({
      default: {
        // Phản chiếu cổng thật: repliesEnabled===false → chặn (bỏ tham số ở nơi gọi thì ca replies_enabled đỏ).
        checkBeforeAi: async (p) =>
          mocks._activeCheck
            ? mocks._activeCheck
            : p?.repliesEnabled === false
              ? { allowed: false, reason: 'replies_disabled', shouldNotify: false, staticReply: null }
              : { allowed: true, shouldNotify: false },
        markNotified: async () => {},
      },
    })
  );

  // inProcChannelGateway index — mock expose thêm facade để afterEach
  // có thể gọi resetSharedSecret() trên real state.
  let _realFacade = null;
  jest.unstable_mockModule(
    resolveUrl('services/chatbot/inProcChannelGateway/index.js'),
    () => ({
      isStubOnly: () => true,
      // Proxy getChannelGateway để sau này lấy real facade.
      getChannelGateway: (ch) => {
        // Khi test gọi, lấy real facade (singleton) để reset secret.
        try {
          // eslint-disable-next-line no-shadow
          const { getChannelGateway: realGet } = jest.requireActual(
            resolveUrl('services/chatbot/inProcChannelGateway/index.js')
          );
          _realFacade = realGet(ch);
          return _realFacade;
        } catch {
          return {};
        }
      },
    })
  );

  // Channel + unified inbox (transitively required)
  jest.unstable_mockModule(
    resolveUrl('repositories/ai/chatbotChannel.repository.js'),
    () => ({ default: {} })
  );
  jest.unstable_mockModule(
    resolveUrl('repositories/ai/unifiedInbox.repository.js'),
    () => ({
      default: {
        // Nguồn sự thật tạm dừng AI = channel_conversations (Hộp thư), không còn cột của bảng Telegram cũ.
        isAiPaused: jest.fn(async () => { mocks._pauseReads += 1; return mocks._scenarioAiPaused; }),
        setAiPaused: jest.fn(async (...args) => {
          mocks._setAiPausedCalls.push(args);
          return { aiPaused: true, aiPausedAt: '2026-09-29T10:00:00.000Z' };
        }),
      },
    })
  );
  jest.unstable_mockModule(resolveUrl('services/sse.service.js'), () => ({
    default: { broadcast: (...args) => mocks._sse.push(args) },
  }));
  jest.unstable_mockModule(resolveUrl('utils/aiHandoffResume.util.js'), () => ({
    buildAiPausePayload: async ({ aiPaused, aiPausedAt }) => ({
      aiPaused: aiPaused === true,
      aiPausedAt: aiPaused === true ? (aiPausedAt ?? null) : null,
      aiResumeAt: null,
    }),
  }));

  // Khoá tài nguyên + trần lượt (mặc định: không khoá, cho phép)
  mocks._locked = false;
  mocks._lockedKeys = null;
  mocks._lockChecks = [];
  mocks._rate = { allowed: true };
  mocks._checkBeforeAi = jest.fn(async () => mocks._rate);
  mocks._markRateLimitNotified = jest.fn(async () => {});
  jest.unstable_mockModule(resolveUrl('utils/topupLockGate.util.js'), () => ({
    resourceIsLocked: async (key, id) => {
      mocks._lockChecks.push([key, id]);
      return mocks._lockedKeys ? mocks._lockedKeys.includes(key) : mocks._locked;
    },
  }));
  jest.unstable_mockModule(resolveUrl('services/chatbot/chatbotRateLimit.service.js'), () => ({
    default: {
      checkBeforeAi: (...args) => mocks._checkBeforeAi(...args),
      markRateLimitNotified: (...args) => mocks._markRateLimitNotified(...args),
    },
  }));

  // Build mini express app — wrap router with json() + catch-all error handler
  app = express();
  app.use(express.json());
  const mod = await import('../internal.routes.js');
  app.use(mod.default);
  // Express error fallback (an toàn cho future changes).
  app.use((err, _req, res, _next) => {
    res.status(500).json({ error: err?.message || 'internal error' });
  });
});

afterEach(async () => {
  jest.restoreAllMocks();
  // Reset shared secret trên real facade singleton. `telegramGatewayLazyClient.spec.js`
  // import `telegramGateway.client.js` trước khi import
  // `inProcChannelGateway/index.js` trực tiếp — nên singleton `channels.telegram`
  // trong `inProcChannelGateway/index.js` đã được tạo với secret từ
  // process.env (hoặc bị set bởi test này). Sau test xong, gọi
  // `configureChannel(..., { secret: '' })` để reset state.secret = ''.
  // Điều này đảm bảo `isConfigured() === false` trong các test khác
  // trong cùng worker.
  try {
    const { configureChannel } = await import(
      resolveUrl('services/chatbot/inProcChannelGateway/index.js')
    );
    configureChannel('telegram', { secret: '' });
  } catch {
    // Module chưa load kịp — bỏ qua, env cleanup vẫn đủ cho hầu hết
    // trường hợp (worker mới = process mới = không có leak).
  }
  delete process.env.TELEGRAM_GATEWAY_SECRET;
  delete process.env.TELEGRAM_GATEWAY_TRANSPORT;
});

// ── Helpers ─────────────────────────────────────────────────────────────

async function request() {
  const { default: supertest } = await import('supertest');
  return supertest;
}

async function postWebhook(payload, secret = 'tg-test-secret') {
  const req = await request();
  return req(app)
    .post('/telegram-webhook')
    .set('x-gateway-secret', secret)
    .send(payload);
}

function insertSystemLog() {
  return (mocks._callsSoFar || []).find(
    ({ sql, params }) =>
      /INSERT INTO telegram_personal_messages/i.test(sql) &&
      Array.isArray(params) &&
      params[3] === 'system'
  );
}

// ── Tests ───────────────────────────────────────────────────────────────

describe('Bug #2 — merged chatbotSettings phải có system_instruction, ai_model, response_style…', () => {
  it('merged settings truyền cho routeMessageWithSettings chứa đầy đủ config', async () => {
    mocks._scenarioAccountSettings = fakeAccountSettings;
    const res = await postWebhook(inboundPayload);
    expect(res.status).toBe(204);

    const call = mocks.chatRouterCall();
    expect(call).not.toBeNull();
    const settings = call.chatbotSettings;
    // Hiện tại code chỉ truyền accountSettings → fail các dòng này.
    // Sau fix: merged settings phải có TẤT CẢ các field user đã cấu hình.
    expect(settings.system_instruction).toBe(fakeChatbotSettingsFull.system_instruction);
    expect(settings.welcome_message).toBe(fakeChatbotSettingsFull.welcome_message);
    expect(settings.ai_model).toBe(fakeChatbotSettingsFull.ai_model);
    expect(settings.temperature).toBe(fakeChatbotSettingsFull.temperature);
    expect(settings.max_tokens).toBe(fakeChatbotSettingsFull.max_tokens);
    expect(settings.response_style).toBe(fakeChatbotSettingsFull.response_style);
    expect(settings.id_sub_assistant).toBe(fakeChatbotSettingsFull.id_sub_assistant);
  });
});

describe('Bug #4 — is_enabled=false phải ghi system row, không drop im lặng', () => {
  it('khi accountSettings.is_enabled=false → INSERT một row role=system', async () => {
    mocks._scenarioAccountSettings = fakeAccountSettingsDisabled;
    const res = await postWebhook(inboundPayload);
    expect(res.status).toBe(204);
    expect(insertSystemLog()).toBeDefined();
    // Và KHÔNG được gọi chatRouter (vẫn disabled).
    expect(mocks.chatRouterCall()).toBeNull();
  });

  it('khi accountSettings=null (chưa từng toggle) → dùng chatbotSettings mặc định (enabled)', async () => {
    // Không có per-account override = chatbotSettings được dùng thẳng,
    // bot sẽ trả lời bình thường. Đây là behavior đúng cho user mới
    // vừa link Telegram, chưa lần nào mở DeployTab.
    mocks._scenarioAccountSettings = null;
    const res = await postWebhook(inboundPayload);
    expect(res.status).toBe(204);
    // chatRouter phải được gọi với merged settings đầy đủ từ chatbotSettings.
    expect(mocks.chatRouterCall()).not.toBeNull();
    const settings = mocks.chatRouterCall().chatbotSettings;
    expect(settings.system_instruction).toBe(fakeChatbotSettingsFull.system_instruction);
    expect(settings.ai_model).toBe(fakeChatbotSettingsFull.ai_model);
    // is_enabled fallback về chatbotSettings.is_enabled = true.
    expect(settings.is_enabled).toBe(true);
  });
});

/**
 * Bug 22/09 — full Zalo parity cho `system_instruction` fallback chain.
 *
 * Zalo cá nhân đã có sẵn chain (zaloInbox.service.js ~dòng 807-811):
 *   1. `accountSettings.chatbot_system_instruction` (snap từ
 *      `custom_chatbots.system_instruction` lúc user bật chatbot cho
 *      account).
 *   2. `chatbotSettings.system_instruction` (từ `chatbot_settings.channel`).
 *
 * Telegram trước đây thiếu hoàn toàn → user nhập `system_instruction`
 * trong Studio (custom_chatbots) mà AI không thấy.
 *
 * Ở test này ta ép `chatbot_settings.channel='telegram_personal'` trả về
 * row TRỐNG system_instruction (giả lập "user chưa lưu Studio channel
 * cụ thể"). Sau đó assert pipeline tự fallback sang
 * `accountSettings.chatbot_system_instruction`.
 */
describe('Bug 22/09 — Telegram fallback chain cho system_instruction (Zalo parity)', () => {
  // Override default mock để trả row TRỐNG system_instruction (giống
  // user mới lưu Studio chưa tick channel='telegram_personal').
  let originalGetSettings;
  beforeEach(() => {
    // Capture original mock do beforeEach-aftermath đã reset module.
    // Re-mock chatbotRepoMock trong cùng test là không cần — chỉ cần
    // một local override đủ cho test này.
  });

  it('chatbot_settings TRỐNG → fallback sang accountSettings.chatbot_system_instruction', async () => {
    // 1. Setup: chatbot_settings.channel='telegram_personal' TRỐNG
    //    system_instruction (user chưa tick channel này trong Studio).
    const emptyChatbotSettings = {
      ...fakeChatbotSettingsFull,
      system_instruction: null,
      welcome_message: null,
    };
    // Patch mock ngay trước POST.
    const { default: chatbotRepo } = await import(
      resolveUrl('repositories/ai/chatbot.repository.js')
    );
    originalGetSettings = chatbotRepo.getSettings;
    chatbotRepo.getSettings = jest.fn(async () => emptyChatbotSettings);

    // 2. Setup: telegram_chatbot_settings có snap system_instruction
    //    từ custom_chatbots (giả lập user đã bật chatbot cho account).
    mocks._scenarioAccountSettings = {
      ...fakeAccountSettings,
      chatbot_system_instruction:
        'Bạn là trợ lý Tia Chớp Consult — chuyên tư vấn dịch thuật & visa.',
    };

    const res = await postWebhook(inboundPayload);
    expect(res.status).toBe(204);

    const call = mocks.chatRouterCall();
    expect(call).not.toBeNull();
    // 3. AI phải nhận được system_instruction từ fallback chain.
    expect(call.chatbotSettings.system_instruction).toBe(
      'Bạn là trợ lý Tia Chớp Consult — chuyên tư vấn dịch thuật & visa.'
    );
    // 4. PR-3: _source ghi nguồn là chatbot được gán (custom_chatbots) để debug.
    expect(call.chatbotSettings._source?.system_instruction).toBe('custom_chatbots');
  });

  it('PR-3: chatbot ĐƯỢC GÁN có system_instruction → THẮNG chatbot_settings kênh (đảo bản 22/09)', async () => {
    // Bản 22/09 ghim ngược lại (chatbot_settings ưu tiên) → tài khoản 2 chatbot, gán B nhưng lưu A sau
    // cùng trong Studio → Telegram trả lời bằng hướng dẫn của A. PR-3 đảo: chatbot được gán thắng.
    mocks._scenarioAccountSettings = {
      ...fakeAccountSettings,
      chatbot_system_instruction: 'FROM_CUSTOM_CHATBOTS — chatbot được gán, phải THẮNG',
    };
    // fakeChatbotSettingsFull vẫn có system_instruction='Bạn là trợ lý bán hàng chuyên nghiệp' (chatbot A lưu sau).

    const res = await postWebhook(inboundPayload);
    expect(res.status).toBe(204);

    const call = mocks.chatRouterCall();
    expect(call).not.toBeNull();
    expect(call.chatbotSettings.system_instruction).toBe(
      'FROM_CUSTOM_CHATBOTS — chatbot được gán, phải THẮNG'
    );
    expect(call.chatbotSettings._source?.system_instruction).toBe('custom_chatbots');
  });
});

describe('PR-3 — Telegram dùng hướng dẫn/model/style của chatbot ĐƯỢC GÁN, chatbot_settings kênh chỉ dự phòng', () => {
  const assignedB = {
    ...fakeAccountSettings,
    chatbot_system_instruction: 'B-instr',
    chatbot_ai_model: 'gemini-b',
    chatbot_temperature: 0.9,
    chatbot_max_tokens: 512,
    chatbot_response_style: 'casual',
    chatbot_welcome_message: 'Welcome B',
  };

  it('gán B, dòng kênh = A lưu sau cùng → mọi field AI của B', async () => {
    mocks._scenarioAccountSettings = assignedB;
    const res = await postWebhook(inboundPayload);
    expect(res.status).toBe(204);
    const settings = mocks.chatRouterCall().chatbotSettings;
    expect(settings.system_instruction).toBe('B-instr');
    expect(settings.ai_model).toBe('gemini-b');
    expect(settings.temperature).toBe(0.9);
    expect(settings.max_tokens).toBe(512);
    expect(settings.response_style).toBe('casual');
    expect(settings.welcome_message).toBe('Welcome B');
    expect(settings._source?.system_instruction).toBe('custom_chatbots');
  });

  it('B để trống system_instruction/ai_model (NULL hoặc chuỗi rỗng) → rơi về A (dự phòng), field khác vẫn của B', async () => {
    mocks._scenarioAccountSettings = {
      ...assignedB,
      chatbot_system_instruction: '   ',
      chatbot_ai_model: null,
    };
    const res = await postWebhook(inboundPayload);
    expect(res.status).toBe(204);
    const settings = mocks.chatRouterCall().chatbotSettings;
    expect(settings.system_instruction).toBe(fakeChatbotSettingsFull.system_instruction);
    expect(settings.ai_model).toBe(fakeChatbotSettingsFull.ai_model);
    expect(settings.response_style).toBe('casual');
    expect(settings._source?.system_instruction).toBe('chatbot_settings');
  });

  it('dòng chatbot_settings kênh KHÔNG có (null) → vẫn dùng B, is_enabled theo tài khoản', async () => {
    const { default: chatbotRepo } = await import(resolveUrl('repositories/ai/chatbot.repository.js'));
    chatbotRepo.getSettings = jest.fn(async () => null);
    mocks._scenarioAccountSettings = assignedB;
    const res = await postWebhook(inboundPayload);
    expect(res.status).toBe(204);
    const settings = mocks.chatRouterCall().chatbotSettings;
    expect(settings.system_instruction).toBe('B-instr');
    expect(settings.ai_model).toBe('gemini-b');
    expect(settings.is_enabled).toBe(true);
  });
});

describe('Bug #3 — telegramAdapter.parseWebhookEvent phải trả messageId', () => {
  it('parseWebhookEvent phải trả messageId từ body.message_id', async () => {
    const { default: adapter } = await import(
      resolveUrl('services/chatbot/channelAdapters/telegram.adapter.js')
    );
    const parsed = adapter.parseWebhookEvent({
      telegram_user_id: 9999,
      sender_id: '8888',
      chat_id: '7777',
      text: 'hi',
      is_group: false,
      is_private: true,
      message_id: 12345,
    });
    expect(parsed.messageId).toBe(12345);
  });
});

/**
 * Row `telegram_chatbot_settings` hiện tại của account.
 * Test có thể override qua `mocks._scenarioAccountSettings`.
 *
 * Bug #1 — khi user đổi chatbot qua DeployTab, cột
 * `telegram_chatbot_settings.id_chatbot` chuyển từ 55 → 66. Nhưng
 * `telegram_personal_conversations.id_chatbot` của hội thoại đang mở
 * vẫn = 55. Cần:
 *   - Phát hiện `conversation.id_chatbot` không còn enabled cho account.
 *   - Pick lại (round-robin) một chatbot enabled.
 *   - Update conversation row về chatbot mới TRƯỚC khi gọi AI.
 */
const fakeAccountSettingsSwitchedTo66 = {
  id_telegram_account: 7,
  id_chatbot: 66, // <-- mới (user vừa đổi qua DeployTab)
  is_enabled: true,
  is_enabled_dm: true,
  is_enabled_group: false,
};

const fakeAccountSettingsSwitchedTo66Disabled = {
  ...fakeAccountSettingsSwitchedTo66,
  is_enabled: false,
};

const fakeAccountSettingsStale55Enabled = {
  id_telegram_account: 7,
  id_chatbot: 55, // chatbot cũ vẫn còn enabled
  is_enabled: true,
  is_enabled_dm: true,
  is_enabled_group: false,
};

/**
 * Multi-row scenarios cho `pickEnabledChatbotForTelegram`. Mock
 * `dbQuery` đọc từ `mocks._scenarioEnabledChatbots` để biết trả về
 * row nào.
 */
const fakeEnabledChatbotsSwitchedTo66 = [
  // 55 đã bị user gỡ (không còn row trong telegram_chatbot_settings
  // của account). Chỉ còn 66 enabled.
  { id_chatbot: 66 },
];
const fakeEnabledChatbotsStale55StillThere = [
  // 55 vẫn enabled + 66 cũng được thêm vào. Tuy nhiên re-pick logic
  // dùng "sticky" → chỉ đổi khi current KHÔNG còn enabled, nên giữ 55.
  { id_chatbot: 55 },
  { id_chatbot: 66 },
];
const fakeEnabledChatbots55Gone66Disabled = [
  // 55 bị gỡ, 66 bị user disable ở DeployTab. Có 1 chatbot khác (88)
  // vẫn enabled — phải re-pick sang 88.
  { id_chatbot: 88 },
];

describe('Bug #1 — đổi chatbot qua DeployTab phải có hiệu lực cho hội thoại đang mở', () => {
  /**
   * Trước fix: `conversation.id_chatbot` bị khoá cứng = 55. Route vẫn
   * pass `chatbotId=55` cho chatRouter → user đổi qua DeployTab vô
   * hiệu lực.
   *
   * Sau fix: route phải detect 55 không còn trong
   * `telegram_chatbot_settings` enabled của account, pick lại (66),
   * update conversation, rồi pass 66 cho chatRouter.
   */
  it('conversation đang pinned=55 nhưng user đã chuyển sang 66 → chatRouter nhận chatbotId=66', async () => {
    // 55 đã bị gỡ; 66 đang enabled cho account.
    mocks._scenarioEnabledChatbots = fakeEnabledChatbotsSwitchedTo66;
    mocks._scenarioAccountSettings = fakeAccountSettingsSwitchedTo66;

    const res = await postWebhook(inboundPayload);
    expect(res.status).toBe(204);

    const call = mocks.chatRouterCall();
    expect(call).not.toBeNull();
    expect(call.chatbotId).toBe(66);

    // Conversation row phải được UPDATE về chatbot mới.
    const updateCall = (mocks._callsSoFar || []).find(
      ({ sql }) =>
        /UPDATE telegram_personal_conversations/i.test(sql) &&
        /id_chatbot/i.test(sql)
    );
    expect(updateCall).toBeDefined();
    expect(updateCall.params).toContain(66);
  });

  it('chatbot cũ (55) vẫn còn enabled → giữ nguyên (sticky), không flip-flop', async () => {
    // 55 vẫn nằm trong telegram_chatbot_settings của account (enabled).
    // → Không nên đổi sang 66 chỉ vì 66 cũng enabled.
    // Semantics: chỉ đổi khi conversation.id_chatbot KHÔNG còn được
    // enabled cho account này.
    mocks._scenarioEnabledChatbots = fakeEnabledChatbotsStale55StillThere;
    mocks._scenarioAccountSettings = fakeAccountSettingsStale55Enabled;

    const res = await postWebhook(inboundPayload);
    expect(res.status).toBe(204);

    const call = mocks.chatRouterCall();
    expect(call).not.toBeNull();
    expect(call.chatbotId).toBe(55);

    // Không nên có UPDATE id_chatbot.
    const updateId = (mocks._callsSoFar || []).find(
      ({ sql }) =>
        /UPDATE telegram_personal_conversations/i.test(sql) &&
        /id_chatbot/i.test(sql)
    );
    expect(updateId).toBeUndefined();
  });

  it('chatbot cũ (55) bị gỡ + chatbot mới (66) cũng bị disable → re-pick sang chatbot enabled khác (88)', async () => {
    // 55 bị gỡ, 66 bị user disable. Vẫn còn 88 enabled → re-pick.
    mocks._scenarioEnabledChatbots = fakeEnabledChatbots55Gone66Disabled;
    // Account settings lookup cho idChatbot hiện tại (sau khi re-pick
    // sang 88): trả về row enabled cho 88.
    mocks._scenarioAccountSettings = {
      id_telegram_account: 7,
      id_chatbot: 88,
      is_enabled: true,
      is_enabled_dm: true,
      is_enabled_group: false,
    };

    const res = await postWebhook(inboundPayload);
    expect(res.status).toBe(204);

    const call = mocks.chatRouterCall();
    expect(call).not.toBeNull();
    expect(call.chatbotId).toBe(88);

    const updateCall = (mocks._callsSoFar || []).find(
      ({ sql }) =>
        /UPDATE telegram_personal_conversations/i.test(sql) &&
        /id_chatbot/i.test(sql)
    );
    expect(updateCall).toBeDefined();
    expect(updateCall.params).toContain(88);
  });
});

describe('Khoá tài nguyên + trần lượt trả lời (29/09/2026)', () => {
  it('chatbot bị khoá → không gọi AI, không gửi gì', async () => {
    mocks._locked = true;
    const res = await postWebhook(inboundPayload);
    expect(res.status).toBe(204);
    expect(mocks.chatRouterCall()).toBeNull();
    expect(mocks.sendReplyCalls()).toHaveLength(0);
    expect(mocks._checkBeforeAi).not.toHaveBeenCalled();
  });

  it('P6 — TÀI KHOẢN Telegram bị khoá (vượt hạn mức gói): không gọi AI, không gửi gì, tra key telegram_accounts', async () => {
    mocks._lockedKeys = ['telegram_accounts'];
    const res = await postWebhook(inboundPayload);
    expect(res.status).toBe(204);
    expect(mocks._lockChecks.map(([key]) => key)).toContain('telegram_accounts');
    expect(mocks.chatRouterCall()).toBeNull();
    expect(mocks.sendReplyCalls()).toHaveLength(0);
    expect(mocks._checkBeforeAi).not.toHaveBeenCalled();
  });

  it('allowed=false + shouldNotify=true → gửi đúng staticReply 1 lần, markRateLimitNotified, không gọi AI', async () => {
    mocks._rate = { allowed: false, shouldNotify: true, staticReply: 'het-luot', reason: 'per_hour' };
    await postWebhook(inboundPayload);
    expect(mocks.chatRouterCall()).toBeNull();
    expect(mocks.sendReplyCalls()).toHaveLength(1);
    expect(mocks.sendReplyCalls()[0].message).toBe('het-luot');
    expect(mocks._markRateLimitNotified).toHaveBeenCalledTimes(1);
    expect(mocks._markRateLimitNotified).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'telegram_personal', ownerUserId: 42, chatbotId: 55, reason: 'per_hour' })
    );
    const botLog = (mocks._callsSoFar || []).find(
      ({ sql, params }) =>
        /INSERT INTO telegram_personal_messages/i.test(sql) && Array.isArray(params) && params.includes('het-luot')
    );
    expect(botLog).toBeDefined();
  });

  it('allowed=false + shouldNotify=false → không gửi gì, không gọi AI', async () => {
    mocks._rate = { allowed: false, shouldNotify: false, staticReply: 'het-luot' };
    await postWebhook(inboundPayload);
    expect(mocks.chatRouterCall()).toBeNull();
    expect(mocks.sendReplyCalls().map((c) => c.message)).not.toContain('het-luot');
    expect(mocks._markRateLimitNotified).not.toHaveBeenCalled();
  });

  it('được phép → gọi AI như cũ, checkBeforeAi nhận đúng kênh + chatbot', async () => {
    await postWebhook(inboundPayload);
    expect(mocks.chatRouterCall()).not.toBeNull();
    expect(mocks._checkBeforeAi).toHaveBeenCalledTimes(1);
    expect(mocks._checkBeforeAi).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'telegram_personal', ownerUserId: 42, chatbotId: 55, senderKey: '8888' })
    );
  });
});

describe('Công tắc trả lời của chatbot (replies_enabled) — PLAN_CONG_TAC_TRANG_THAI_CHATBOT PR-2', () => {
  it('chatbot replies_enabled=false → lưu tin khách, không gọi AI, không hỏi trần lượt, không gửi gì', async () => {
    mocks._chatbotRecord = { id: 55, active_hours: null, replies_enabled: false };
    const res = await postWebhook(inboundPayload);
    expect(res.status).toBe(204);
    expect(mocks.chatRouterCall()).toBeNull();
    expect(mocks._checkBeforeAi).not.toHaveBeenCalled();
    expect(mocks.sendReplyCalls()).toHaveLength(0);
    // Tin khách đã được lưu trước cổng.
    const visitorLog = (mocks._callsSoFar || []).find(
      ({ sql }) => /INSERT INTO telegram_personal_messages/i.test(sql)
    );
    expect(visitorLog).toBeDefined();
  });

  it('chatbot replies_enabled=true → gọi AI như cũ', async () => {
    mocks._chatbotRecord = { id: 55, active_hours: null, replies_enabled: true };
    await postWebhook(inboundPayload);
    expect(mocks.chatRouterCall()).not.toBeNull();
  });
});

describe('Webhook authentication', () => {
  it('POST thiếu x-gateway-secret trả 401', async () => {
    const req = await request();
    const res = await req(app).post('/telegram-webhook').send(inboundPayload);
    expect(res.status).toBe(401);
  });

  it('POST sai secret trả 401', async () => {
    const req = await request();
    const res = await req(app)
      .post('/telegram-webhook')
      .set('x-gateway-secret', 'wrong-secret')
      .send(inboundPayload);
    expect(res.status).toBe(401);
  });

  it('POST account không tồn tại (telegram_user_id=0) trả 204 im lặng', async () => {
    const req = await request();
    const res = await req(app)
      .post('/telegram-webhook')
      .set('x-gateway-secret', 'tg-test-secret')
      .send({ ...inboundPayload, telegram_user_id: 0 });
    expect(res.status).toBe(204);
    // Không gọi router cho account không tồn tại.
    expect(mocks.chatRouterCall()).toBeNull();
  });
});

// ── W6: chủ trả lời từ điện thoại (mtcute isOutgoing) ───────────────────

const outgoingPayload = {
  ...inboundPayload,
  sender_id: '9999', // chính chủ
  text: 'Em gọi lại anh nhé',
  message_id: 555,
  is_outgoing: true,
};

const agentLogs = () =>
  (mocks._callsSoFar || []).filter(
    ({ sql, params }) => /INSERT INTO telegram_personal_messages/i.test(sql) && params?.[3] === 'agent'
  );
const channelRows = (role) => mocks._channelMessages.filter((m) => m.role === role);
const sseFor = (role) => mocks._sse.filter(([, evt, p]) => evt === 'inbox:new_message' && p.role === role);

describe('W6 — tin outgoing (chủ gõ từ điện thoại) không đi đường AI', () => {
  it('outgoing là echo của tin bot vừa gửi (khớp external_message_id) → bỏ, không dừng AI', async () => {
    mocks._echoRows = [{ external_id: '555', content: 'nội dung khác', created_at: new Date() }];
    const res = await postWebhook(outgoingPayload);
    expect(res.status).toBe(204);
    expect(agentLogs()).toHaveLength(0);
    expect(channelRows('agent')).toHaveLength(0);
    expect(mocks._setAiPausedCalls).toHaveLength(0);
    expect(mocks.chatRouterCall()).toBeNull();
  });

  it('outgoing lạ → ghi dòng agent + dừng AI hội thoại, KHÔNG gọi AI, KHÔNG gửi gì', async () => {
    mocks._echoRows = [];
    const res = await postWebhook(outgoingPayload);
    expect(res.status).toBe(204);
    const logs = agentLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0].params[2]).toBe('555'); // external_message_id
    expect(logs[0].params[4]).toBe('Em gọi lại anh nhé');
    // Hộp thư: dòng agent + tạm dừng AI qua unifiedInboxRepository (một nguồn sự thật) + SSE isSelf.
    expect(channelRows('agent')).toHaveLength(1);
    expect(channelRows('agent')[0]).toMatchObject({ id_conversation: 501, content: 'Em gọi lại anh nhé', external_id: '555' });
    expect(mocks._setAiPausedCalls).toEqual([[501, 'channel', true, 'handoff']]);
    const selfSse = sseFor('agent').filter(([, , p]) => p.isSelf === true);
    expect(selfSse).toHaveLength(1);
    expect(selfSse[0][2]).toMatchObject({ conversationId: 501, channel: 'telegram', type: 'channel', aiPaused: true });
    expect(mocks.chatRouterCall()).toBeNull();
    expect(mocks.sendReplyCalls()).toHaveLength(0);
  });

  it('outgoing tới nhóm → bỏ hẳn', async () => {
    const res = await postWebhook({ ...outgoingPayload, is_group: true, is_private: false });
    expect(res.status).toBe(204);
    expect(agentLogs()).toHaveLength(0);
    expect(mocks._setAiPausedCalls).toHaveLength(0);
    expect(mocks.chatRouterCall()).toBeNull();
  });

  it('outgoing khi chưa có hội thoại Hộp thư (khách chưa từng nhắn) → bỏ, không dừng AI', async () => {
    mocks._inboxFindRows = [];
    const res = await postWebhook(outgoingPayload);
    expect(res.status).toBe(204);
    expect(channelRows('agent')).toHaveLength(0);
    expect(mocks._setAiPausedCalls).toHaveLength(0);
  });

  it('bot trả lời → id tin Telegram vừa gửi được ghi vào dòng bot (để khử echo)', async () => {
    mocks._sendReplyResult = { success: true, messageId: 4242 };
    await postWebhook(inboundPayload);
    const bind = (mocks._callsSoFar || []).find(({ sql }) => /UPDATE telegram_personal_messages SET external_message_id/i.test(sql));
    expect(bind).toBeDefined();
    expect(bind.params).toEqual([999, '4242']);
    // Và cả dòng Hộp thư của tin bot (echo khớp theo id, không tự dừng AI).
    const bot = channelRows('bot')[0];
    expect(bot).toBeDefined();
    expect(bot.external_id).toBe('4242');
  });
});

// ── P1 PLAN_TG_WA_DAY_DU: Telegram vào Hộp thư hợp nhất ─────────────────

describe('P1 — tin khách luôn vào Hộp thư (channel_messages) + SSE, kể cả khi không gọi AI', () => {
  it('(a) chatbot tắt → tin khách VẪN có trong channel_messages + SSE, không gọi AI', async () => {
    mocks._scenarioAccountSettings = fakeAccountSettingsDisabled;
    const res = await postWebhook(inboundPayload);
    expect(res.status).toBe(204);
    const visitor = channelRows('visitor');
    expect(visitor).toHaveLength(1);
    expect(visitor[0]).toMatchObject({
      id_conversation: 501,
      id_channel: 31,
      content: 'Xin chào',
      external_id: '12345',
    });
    const sse = sseFor('visitor');
    expect(sse).toHaveLength(1);
    expect(sse[0][0]).toBe('42');
    expect(sse[0][2]).toMatchObject({
      conversationId: 501,
      conversationType: 'channel',
      type: 'channel',
      channel: 'telegram',
      message: 'Xin chào',
      senderName: 'Alice',
    });
    expect(mocks.chatRouterCall()).toBeNull();
    expect(mocks.sendReplyCalls()).toHaveLength(0);
    // Nhật ký vận hành "[Telegram] skip" vẫn ở bảng cũ, KHÔNG lẫn vào Hộp thư.
    expect(insertSystemLog()).toBeDefined();
    expect(channelRows('system')).toHaveLength(0);
  });

  it('đợt nhắn dồn 3 tin → cả 3 vào Hộp thư (không chỉ tin cuối) và AI nhận nội dung gộp', async () => {
    mocks._batchMessages = [
      { eventId: 1, content: 'tin một', receivedAt: 1 },
      { eventId: 2, content: 'tin hai', receivedAt: 2 },
      { eventId: 3, content: 'tin ba', receivedAt: 3 },
    ];
    await postWebhook({ ...inboundPayload, text: 'tin ba', message_id: 3 });
    expect(channelRows('visitor').map((m) => [m.content, m.external_id])).toEqual([
      ['tin một', '1'],
      ['tin hai', '2'],
      ['tin ba', '3'],
    ]);
    expect(mocks.chatRouterCall().message).toBe('tin một\ntin hai\ntin ba');
  });

  it('(a2) DM tắt cho tài khoản → tin khách vẫn vào Hộp thư', async () => {
    mocks._scenarioAccountSettings = { ...fakeAccountSettings, is_enabled_dm: false };
    await postWebhook(inboundPayload);
    expect(channelRows('visitor')).toHaveLength(1);
    expect(mocks.chatRouterCall()).toBeNull();
  });

  it('nhóm TẮT AI → KHÔNG có channel_messages/SSE, vẫn có telegram_personal_messages', async () => {
    mocks._scenarioAccountSettings = { ...fakeAccountSettings, is_enabled_group: false };
    await postWebhook({ ...inboundPayload, chat_id: '-1001234567', is_group: true, is_private: false });
    expect(mocks._channelMessages).toHaveLength(0);
    expect(mocks._sse).toHaveLength(0);
    expect((mocks._callsSoFar || []).some(({ sql }) => /INSERT INTO channel_conversations/i.test(sql))).toBe(false);
    const legacy = (mocks._callsSoFar || []).filter(
      ({ sql, params }) => /INSERT INTO telegram_personal_messages/i.test(sql) && params?.[3] === 'visitor'
    );
    expect(legacy).toHaveLength(1);
  });

  it('nhóm BẬT AI → có cả hai bảng; tên hội thoại là "Nhóm <chatId>", không phải tên người gửi', async () => {
    mocks._scenarioAccountSettings = { ...fakeAccountSettings, is_enabled_group: true };
    mocks._inboxEnsureRows = [];
    await postWebhook({ ...inboundPayload, chat_id: '-1001234567', is_group: true, is_private: false });
    expect(channelRows('visitor')).toHaveLength(1);
    const legacy = (mocks._callsSoFar || []).filter(
      ({ sql, params }) => /INSERT INTO telegram_personal_messages/i.test(sql) && params?.[3] === 'visitor'
    );
    expect(legacy).toHaveLength(1);
    const ins = (mocks._callsSoFar || []).find(({ sql }) => /INSERT INTO channel_conversations/i.test(sql));
    expect(ins.params[3]).toBe('Nhóm -1001234567');
    expect(JSON.parse(ins.params[4]).is_group).toBe(true);
  });

  it('(b) AI đang dừng (Hộp thư) → lưu tin khách, không gọi AI, không gửi gì', async () => {
    mocks._scenarioAiPaused = true;
    const res = await postWebhook(inboundPayload);
    expect(res.status).toBe(204);
    expect(channelRows('visitor')).toHaveLength(1);
    expect(sseFor('visitor')).toHaveLength(1);
    expect(mocks.chatRouterCall()).toBeNull();
    expect(mocks.sendReplyCalls()).toHaveLength(0);
  });

  // PLAN_SUA_AI_DOT4 PR-7 (A P2-3): cổng tạm dừng ở đầu đợt chỉ kiểm MỘT lần; AI soạn mất vài giây, chủ nhảy vào đúng lúc đó
  // thì bot vẫn chen câu cũ vào. Kiểm lại ngay trước khi ghi + gửi (khuôn Zalo cá nhân `paused_after_ai`).
  // PLAN_SUA_AI_DOT4 PR-7 (EXTRA-A6): `recordTelegramMessage` chỉ chép `metadata.source` sang channel_messages. Hai câu TĨNH
  // (ngoài giờ / chạm trần lượt) từng truyền `{ model, replySource }` không có `source` → nhãn mất → bản tin tuần (đếm role='bot'
  // trừ nhãn) tính là "AI trả lời".
  it('EXTRA-A6 — câu tĩnh NGOÀI GIỜ: dòng Hộp thư mang metadata.source = ai_outside_hours, vẫn gửi 1 lần, không gọi AI', async () => {
    mocks._activeCheck = { allowed: false, reason: 'outside_active_hours', shouldNotify: true, staticReply: 'ngoai-gio' };
    await postWebhook(inboundPayload);
    expect(mocks.chatRouterCall()).toBeNull();
    expect(mocks.sendReplyCalls().map((c) => c.message)).toEqual(['ngoai-gio']);
    const bot = channelRows('bot');
    expect(bot).toHaveLength(1);
    expect(bot[0].content).toBe('ngoai-gio');
    expect(JSON.parse(bot[0].metadata).source).toBe('ai_outside_hours');
  });

  it('EXTRA-A6 — câu tĩnh CHẠM TRẦN LƯỢT: dòng Hộp thư mang metadata.source = ai_rate_limited, vẫn gửi 1 lần, không gọi AI', async () => {
    mocks._rate = { allowed: false, shouldNotify: true, staticReply: 'het-luot', reason: 'per_hour' };
    await postWebhook(inboundPayload);
    expect(mocks.chatRouterCall()).toBeNull();
    expect(mocks.sendReplyCalls().map((c) => c.message)).toEqual(['het-luot']);
    const bot = channelRows('bot');
    expect(bot).toHaveLength(1);
    expect(bot[0].content).toBe('het-luot');
    expect(JSON.parse(bot[0].metadata).source).toBe('ai_rate_limited');
  });

  it('A P2-3 — chủ tạm dừng AI đúng lúc AI đang soạn → AI đã gọi nhưng KHÔNG ghi dòng bot, KHÔNG gửi Telegram', async () => {
    mocks._onRoute = () => { mocks._scenarioAiPaused = true; };
    const res = await postWebhook(inboundPayload);
    expect(res.status).toBe(204);
    expect(mocks.chatRouterCall()).not.toBeNull(); // lúc đầu đợt chưa tạm dừng → AI đã được gọi
    expect(mocks.sendReplyCalls()).toHaveLength(0);
    expect(channelRows('bot')).toHaveLength(0);
    expect(sseFor('agent')).toHaveLength(0);
    const botLegacy = (mocks._callsSoFar || []).find(
      ({ sql, params }) => /INSERT INTO telegram_personal_messages/i.test(sql) && Array.isArray(params) && params[3] === 'bot'
    );
    expect(botLegacy).toBeUndefined();
  });

  it('A P2-3 — không tạm dừng: hỏi trạng thái đúng 2 lần (đầu đợt + ngay trước khi gửi), vẫn gửi + ghi như cũ', async () => {
    await postWebhook(inboundPayload);
    expect(mocks._pauseReads).toBe(2);
    expect(mocks.sendReplyCalls()).toHaveLength(1);
    expect(channelRows('bot')).toHaveLength(1);
  });

  it('AI chạy bình thường → tin khách + tin AI cùng vào Hộp thư, AI báo SSE role agent/AI', async () => {
    await postWebhook(inboundPayload);
    expect(channelRows('visitor')).toHaveLength(1);
    const bot = channelRows('bot');
    expect(bot).toHaveLength(1);
    expect(bot[0].content).toBe('fake-bot-reply');
    const aiSse = sseFor('agent');
    expect(aiSse).toHaveLength(1);
    expect(aiSse[0][2]).toMatchObject({ senderName: 'AI', message: 'fake-bot-reply', conversationId: 501 });
  });

  // G3b (A P1-6): bản tin tuần đếm tin bot ở channel_messages theo role='bot' TRỪ nhãn ai_unavailable.
  it('G3b — câu xin lỗi (hết credit / AI lỗi): dòng Hộp thư mang metadata.source = ai_unavailable, vẫn gửi cho khách', async () => {
    mocks._routerResult = { type: 'text', content: 'Xin lỗi, hiện chưa thể trả lời.', source: 'ai_unavailable', reason: 'credit_exhausted' };
    await postWebhook(inboundPayload);
    const bot = channelRows('bot');
    expect(bot).toHaveLength(1);
    expect(bot[0].content).toBe('Xin lỗi, hiện chưa thể trả lời.');
    expect(JSON.parse(bot[0].metadata)).toMatchObject({ source: 'ai_unavailable' });
    expect(mocks.sendReplyCalls()).toHaveLength(1);
  });

  it('G3b — khách đã nhận câu xin lỗi trong 6 giờ (content null): KHÔNG ghi dòng bot, KHÔNG gửi', async () => {
    mocks._routerResult = { type: 'suppressed', content: null, source: 'ai_unavailable', reason: 'credit_exhausted' };
    await postWebhook(inboundPayload);
    expect(channelRows('bot')).toHaveLength(0);
    expect(mocks.sendReplyCalls()).toHaveLength(0);
  });

  it('G3b — câu trả lời thường: dòng Hộp thư KHÔNG có nhãn ai_unavailable', async () => {
    await postWebhook(inboundPayload);
    const bot = channelRows('bot');
    expect(bot).toHaveLength(1);
    expect(JSON.parse(bot[0].metadata).source ?? null).toBeNull();
  });

  it('hội thoại Hộp thư dùng external_id ghép telegram:<tài khoản>:<chatId> (chatId đầy đủ)', async () => {
    mocks._inboxEnsureRows = []; // chưa có → phải tạo
    await postWebhook({ ...inboundPayload, chat_id: '-1001234567' });
    const ins = (mocks._callsSoFar || []).find(({ sql }) => /INSERT INTO channel_conversations/i.test(sql));
    expect(ins).toBeDefined();
    expect(ins.params[2]).toBe('telegram:7:-1001234567');
    expect(ins.params[0]).toBe(42); // id_user
    expect(ins.params[1]).toBe(31); // id_channel
  });

  it('hội thoại cũ đang tạm dừng AI → dòng Hộp thư mới thừa hưởng trạng thái tạm dừng', async () => {
    mocks._inboxEnsureRows = [];
    mocks._scenarioLegacyOverride = { ...fakeConversation, ai_paused: true, ai_paused_at: '2026-09-29T09:00:00.000Z' };
    await postWebhook(inboundPayload);
    const ins = (mocks._callsSoFar || []).find(({ sql }) => /INSERT INTO channel_conversations/i.test(sql));
    expect(ins.params[5]).toBe(true);
    expect(ins.params[6]).toBe('2026-09-29T09:00:00.000Z');
  });

  it('lỗi ghi Hộp thư không làm hỏng đường AI (best-effort)', async () => {
    mocks._inboxEnsureRows = null; // .rows[0] → TypeError trong ensure
    await postWebhook(inboundPayload);
    expect(mocks.chatRouterCall()).not.toBeNull();
    expect(channelRows('visitor')).toHaveLength(0);
  });
});


describe('P5 — ảnh/tệp khách gửi tới Telegram vào Hộp thư (trước đây tin không chữ bị bỏ im lặng)', () => {
  const PHOTO = { kind: 'photo', fileName: null, mimeType: 'image/jpeg', size: null };
  const ATTACHMENT = { key: 'uploads/42/chat/1700000000_hinh-anh.jpg', displayName: 'hinh-anh.jpg', size: 3, mime: 'image/jpeg', type: 'image' };

  beforeEach(() => {
    mocks._captureEnqueue = true;
    mocks._mediaResult = { content: '[Hình ảnh]', attachments: [ATTACHMENT], skipReason: null, kind: 'image' };
  });

  it('ảnh KHÔNG caption → không bị bỏ: vào Hộp thư kèm attachments + message_type image, chữ giữ chỗ cho AI', async () => {
    const res = await postWebhook({ ...inboundPayload, text: '', media: PHOTO });
    expect(res.status).toBe(204);
    expect(mocks._mediaCalls).toHaveLength(1);
    expect(mocks._mediaCalls[0].account.id).toBe(7);
    expect(mocks._mediaCalls[0].parsed.media).toEqual(PHOTO);

    const visitor = channelRows('visitor');
    expect(visitor).toHaveLength(1);
    expect(visitor[0]).toMatchObject({ content: '[Hình ảnh]', message_type: 'image', external_id: '12345' });
    expect(JSON.parse(visitor[0].attachments)).toEqual([ATTACHMENT]);
    // AI chỉ thấy chữ giữ chỗ (không thấy byte ảnh).
    expect(mocks.chatRouterCall().message).toBe('[Hình ảnh]');
    // Bảng cũ cũng có chữ giữ chỗ (không có dòng rỗng).
    const legacy = (mocks._callsSoFar || []).filter(
      ({ sql, params }) => /INSERT INTO telegram_personal_messages/i.test(sql) && params?.[3] === 'visitor'
    );
    expect(legacy[0].params[4]).toBe('[Hình ảnh]');
  });

  it('tệp đã ghi vào dòng tin thì được nâng từ temp lên active (không mất sau 24h) và SSE mang attachments đã ký', async () => {
    await postWebhook({ ...inboundPayload, text: '', media: PHOTO });
    expect(mocks._promoteCalls).toEqual([[ATTACHMENT]]);
    const sse = sseFor('visitor');
    expect(sse).toHaveLength(1);
    expect(sse[0][2]).toMatchObject({
      message: '[Hình ảnh]',
      messageType: 'image',
      attachments: [{ type: 'image', url: `signed:${ATTACHMENT.key}`, name: 'hinh-anh.jpg' }],
    });
    // Không lộ khoá lưu trữ ra SSE.
    expect(JSON.stringify(sse[0][2])).not.toContain('"key"');
  });

  it('ảnh CÓ caption → nội dung là caption (không phải chữ giữ chỗ)', async () => {
    mocks._mediaResult = { content: 'Xem giúp mình', attachments: [ATTACHMENT], skipReason: null, kind: 'image' };
    await postWebhook({ ...inboundPayload, text: 'Xem giúp mình', media: PHOTO });
    expect(channelRows('visitor')[0]).toMatchObject({ content: 'Xem giúp mình', message_type: 'image' });
  });

  it('tệp không lưu được (quá 20 MB) → tin VẪN vào Hộp thư với chữ giữ chỗ kèm lý do, attachments rỗng, lý do ở metadata', async () => {
    mocks._mediaResult = { content: '[Tệp] (quá 20 MB, không lưu)', attachments: [], skipReason: 'too_large', kind: 'file' };
    await postWebhook({ ...inboundPayload, text: '', media: { kind: 'document', fileName: 'big.pdf', mimeType: 'application/pdf', size: 30 * 1024 * 1024 } });
    const visitor = channelRows('visitor');
    expect(visitor).toHaveLength(1);
    expect(visitor[0]).toMatchObject({ content: '[Tệp] (quá 20 MB, không lưu)', message_type: 'file' });
    expect(JSON.parse(visitor[0].attachments)).toEqual([]);
    expect(JSON.parse(visitor[0].metadata).media_skip_reason).toBe('too_large');
    expect(mocks._promoteCalls).toHaveLength(0);
  });

  it('tin chữ thuần: KHÔNG chạm tới tải media, message_type text, attachments rỗng (đường cũ nguyên vẹn)', async () => {
    await postWebhook(inboundPayload);
    expect(mocks._mediaCalls).toHaveLength(0);
    const visitor = channelRows('visitor');
    expect(visitor[0]).toMatchObject({ content: 'Xin chào', message_type: 'text' });
    expect(JSON.parse(visitor[0].attachments)).toEqual([]);
    expect(mocks._enqueued[0]).not.toHaveProperty('attachments');
  });

  it('ảnh do CHÍNH tài khoản gửi (echo, isOutgoing, không chữ) → vẫn bỏ như cũ, không tải, không ghi', async () => {
    const res = await postWebhook({ ...inboundPayload, text: '', media: PHOTO, is_outgoing: true });
    expect(res.status).toBe(204);
    expect(mocks._mediaCalls).toHaveLength(0);
    expect(mocks._channelMessages).toHaveLength(0);
  });

  it('không có người gửi → bỏ, không tải media', async () => {
    const res = await postWebhook({ ...inboundPayload, text: '', media: PHOTO, sender_id: null });
    expect(res.status).toBe(204);
    expect(mocks._mediaCalls).toHaveLength(0);
  });
});
