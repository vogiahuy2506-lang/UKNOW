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
    // Default pick-enabled candidates = 55 enabled. Test có thể
    // override khi cần giả lập user đổi chatbot.
    _scenarioEnabledChatbots: [{ id_chatbot: 55 }],
    _lastRouterCall: null,
    _sendReplyCalls: [],
    _consoleLog: [],
    dbQuery: null,
    chatRouterCall: () => mocks._lastRouterCall,
    sendReplyCalls: () => mocks._sendReplyCalls,
  };

  // Track tất cả DB query để assert log row 'system'.
  const dbQueryMock = jest.fn(async (sql, params) => {
    const s = String(sql);
    mocks._callsSoFar = mocks._callsSoFar || [];
    mocks._callsSoFar.push({ sql: s, params });

    // 1. Conversation lookup
    if (/SELECT \* FROM telegram_personal_conversations/i.test(s)) {
      if (mocks._scenarioConversationOverride === 'null') {
        return { rows: [] };
      }
      return { rows: [fakeConversation] };
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
    // 5. ai_paused select
    if (/ai_paused/i.test(s)) {
      return { rows: [{ ai_paused: mocks._scenarioAiPaused }] };
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
    findChatbotById: jest.fn(async () => ({ id: 55, active_hours: null })),
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
          return { type: 'text', content: 'fake-bot-reply' };
        }),
      },
    })
  );

  // debounce — chạy flush ngay
  jest.unstable_mockModule(
    resolveUrl('services/chatbot/inboundReplyDebounce.service.js'),
    () => ({
      default: {
        enqueue: jest.fn(async ({ flushCallback }) => {
          await flushCallback({
            messages: [
              {
                eventId: inboundPayload.message_id,
                content: inboundPayload.text,
                receivedAt: Date.now(),
              },
            ],
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
        })),
        verifyWebhookSecret: jest.fn(async (provided) => {
          if (!provided) throw new Error('TELEGRAM_GATEWAY_SECRET is not configured');
          if (provided !== process.env.TELEGRAM_GATEWAY_SECRET) throw new Error('Invalid Telegram gateway secret');
        }),
        sendReply: jest.fn(async (args) => {
          mocks._sendReplyCalls.push(args);
          return { success: true };
        }),
      },
    })
  );

  // active hours
  jest.unstable_mockModule(
    resolveUrl('services/chatbot/chatbotActiveHours.service.js'),
    () => ({
      default: {
        checkBeforeAi: async () => ({ allowed: true, shouldNotify: false }),
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
    () => ({ default: { isAiPaused: async () => false } })
  );

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
    // 4. _source phải mark là 'telegram_chatbot_settings_fallback' để debug.
    expect(call.chatbotSettings._source?.system_instruction).toBe(
      'telegram_chatbot_settings_fallback'
    );
  });

  it('chatbot_settings CÓ system_instruction → KHÔNG override bằng fallback', async () => {
    // chatbot_settings.system_instruction là nguồn ưu tiên hơn — giữ nguyên.
    mocks._scenarioAccountSettings = {
      ...fakeAccountSettings,
      chatbot_system_instruction: 'FROM_CUSTOM_CHATBOTS — phải bị bỏ qua',
    };
    // fakeChatbotSettingsFull vẫn có system_instruction='Bạn là trợ lý bán hàng chuyên nghiệp'.

    const res = await postWebhook(inboundPayload);
    expect(res.status).toBe(204);

    const call = mocks.chatRouterCall();
    expect(call).not.toBeNull();
    expect(call.chatbotSettings.system_instruction).toBe(
      fakeChatbotSettingsFull.system_instruction
    );
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
